/**
 * AI 的静态估值：单位/场面/全局态势。
 * ------------------------------------------------------------------
 * 只使用 GameState 中可见的信息（双方场上单位、HQ、手牌**数量**、牌库数量、克雷迪特）；
 * 不读取对手手牌内容 —— 对手 hand 里的 CardInstance 只能数 length。
 */
import type { CardDef, EngineRegistry, GameState, PlayerIndex, Unit } from '../types';
import { getDef, getScript, opponentOf, playerUnits } from '../state';
import { normalizeKeywords } from '../keywords';

/** 关键字价值（按 base id，不含 `:value` 后缀） */
const KEYWORD_VALUE: Record<string, number> = {
  guard: 2.6,
  blitz: 2.2,
  fury: 2.4,
  heavyArmor: 2.2,
  smokescreen: 1.5,
  ambush: 1.4,
  shock: 1.2,
  intel: 0.8,
  salvage: 1.0,
  mobilize: 1.0,
  bond: 1.2,
  pincer: 1.2,
  alpine: 0.8,
  covert: 1.2,
  veteran: 1.0,
};

/** 单位类型价值：空军（可打 HQ / 越过前线）与炮兵（远程）比步兵更有威胁 */
const TYPE_VALUE: Record<string, number> = {
  infantry: 0.6,
  tank: 1.2,
  artillery: 1.4,
  fighter: 1.8,
  bomber: 1.6,
  destroyer: 1.1,
  battleship: 1.3,
  order: 0,
  countermeasure: 0,
};

function keywordBase(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(0, idx) : id;
}

/** 关键字数组 → 价值分 */
export function keywordsValue(keywords: readonly string[]): number {
  let total = 0;
  for (const kw of keywords) total += KEYWORD_VALUE[keywordBase(kw)] ?? 0;
  return total;
}

/** 单位实例价值（用于场面评估与交换计算） */
export function unitValue(reg: EngineRegistry, unit: Unit): number {
  const type = getDef(reg, unit.cardId)?.type ?? 'infantry';
  return (
    unit.attack * 1.15 +
    unit.hp * 1.0 +
    (TYPE_VALUE[type] ?? 0.6) +
    keywordsValue(unit.keywords) +
    (unit.line === 'frontline' ? 2.4 : 0) +
    unit.armor * 0.6
  );
}

/** 卡牌定义 → 单位价值（手牌/尚未部署时使用） */
export function defUnitValue(reg: EngineRegistry, def: CardDef): number {
  const script = getScript(reg, def.cardId);
  const kws = [...normalizeKeywords(def.attributes), ...(script?.keywords ?? [])];
  return (
    Math.max(0, def.attack) * 1.15 +
    Math.max(1, def.defense) * 1.0 +
    (TYPE_VALUE[def.type] ?? 0.6) +
    keywordsValue(kws)
  );
}

/** 卡牌定义 → 通用手牌价值（卡差评估用） */
export function cardDefValue(reg: EngineRegistry, def: CardDef): number {
  if (def.type === 'order' || def.type === 'countermeasure') return 2.4 + Math.max(0, def.kredits) * 1.2;
  return defUnitValue(reg, def) + Math.max(0, def.kredits) * 0.3;
}

/** 单位是否具备本回合即可行动的能力（blitz/shock） */
export function hasImmediateAction(unit: Unit): boolean {
  return unit.keywords.some((k) => {
    const base = keywordBase(k);
    return base === 'blitz' || base === 'shock';
  });
}

/** 我方场面总价值 */
export function boardPower(state: GameState, reg: EngineRegistry, player: PlayerIndex): number {
  let total = 0;
  for (const unit of playerUnits(state, player)) total += unitValue(reg, unit);
  return total;
}

/** 我方场面攻击力合计（斩杀判断用） */
export function boardAttack(state: GameState, player: PlayerIndex): number {
  let total = 0;
  for (const unit of playerUnits(state, player)) total += Math.max(0, unit.attack);
  return total;
}

/** 敌方对本方总部的直接威胁（能从当前线攻击到 HQ 的攻击力近似） */
export function hqThreat(state: GameState, reg: EngineRegistry, player: PlayerIndex): number {
  const foe = opponentOf(player);
  const guards = playerUnits(state, player).filter((u) => u.keywords.some((k) => keywordBase(k) === 'guard'));
  if (guards.length > 0) return 0; // 有守护时对手必须先解场
  let threat = 0;
  for (const unit of playerUnits(state, foe)) {
    if (unit.statuses.pinned) continue;
    if (state.config.hqAttackRequiresFrontline && unit.line !== 'frontline') continue;
    threat += Math.max(0, unit.attack);
  }
  return threat;
}

/**
 * 全局静态评分（从 me 视角，正数表示我占优）。
 * 用于 hard 难度 1 层前瞻：比较「执行动作前后」的差值。
 */
export function staticStateScore(state: GameState, reg: EngineRegistry, me: PlayerIndex): number {
  if (state.status === 'finished') {
    if (state.winner === me) return 1000;
    if (state.winner === null) return 0;
    return -1000;
  }
  const foe = opponentOf(me);
  const mine = state.players[me];
  const theirs = state.players[foe];

  let score = 0;
  // 1) HQ 血量差（胜负最直接）
  score += (mine.hq.hp - theirs.hq.hp) * 3.0;
  // 2) 场面价值差（防守方有 8% 溢价：交换时守方更占便宜）
  score += boardPower(state, reg, me) - boardPower(state, reg, foe) * 1.08;
  // 3) 卡差
  score += (mine.hand.length - theirs.hand.length) * 1.5;
  // 4) 节奏：轮到我了还没花的克雷迪特是小幅正资产（可立即转化为动作）
  if (state.activePlayer === me) score += Math.min(mine.kredits, 8) * 0.45;
  // 5) 总部安全：敌方场面攻击力超出我方 HQ 剩余血量的部分要扣分
  const threat = hqThreat(state, reg, me);
  score -= Math.max(0, threat - mine.hq.hp) * 0.8;
  if (mine.hq.hp <= 6) score -= (7 - mine.hq.hp) * 0.9;
  // 6) 斩杀倒计时：敌方 HQ 见底而我有场面优势时加分
  if (theirs.hq.hp <= boardAttack(state, me) && state.activePlayer === me) score += 6;
  // 7) 牌库耗尽风险（疲劳）
  if (mine.deck.length === 0) score -= 4 + mine.fatigue * 1.5;
  if (theirs.deck.length === 0) score += 4 + theirs.fatigue * 1.5;
  return score;
}
