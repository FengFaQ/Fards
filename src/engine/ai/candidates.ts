/**
 * AI 候选动作枚举与启发式打分。
 * ------------------------------------------------------------------
 * 硬性约束：
 * 1. 只从 `legalActions(state, reg, player)` 枚举动作，不自己猜规则。
 * 2. 生成的每个 GameCommand 都必须能通过 applyCommand 的校验：
 *    - 出牌目标全部取自 legalActions.targets.refs，多目标卡填满 count 个；
 *    - 攻击目标来自 legalActions（已含 guard / 空军对抗 / 行动花费过滤）；
 *    - 移动方向按 legalActions 的语义推导：支援线 → 前线，或前线 → 支援线。
 * 3. 评分统一归一到 0~100：50 左右是「普通可打动作」，100 = 斩杀，20 左右 = 结束回合，
 *    纯亏牌/无意义动作给个位数。
 */
import type {
  CardDef,
  EngineRegistry,
  GameCommand,
  GameState,
  LegalAction,
  Line,
  PlayerIndex,
  TargetRef,
} from '../types';
import { getDef, getScript, opponentOf, playerUnits } from '../state';
import { legalActions } from '../targeting';
import { isRangedType, normalizeKeywords } from '../keywords';
import { bestTargetValue, pickTargets, targetIntent, collectEffectOps } from './intent';
import { boardAttack, defUnitValue, hqThreat, unitValue } from './values';

/** hard 难度前瞻的候选上限（任务约定：不超过 40 个） */
export const MAX_CANDIDATES = 40;

export interface AICandidate {
  cmd: GameCommand;
  kind: LegalAction['kind'];
  label: string;
  cardId?: string;
  attackerId?: string;
  unitId?: string;
  target?: TargetRef;
  /** 实际花费克雷迪特（出牌/攻击/移动的行动花费） */
  cost: number;
  /** 启发式评分（0~100） */
  base: number;
}

const orderTypes = new Set(['order', 'countermeasure']);

function isUnitDef(def: CardDef | undefined): boolean {
  return !!def && !orderTypes.has(def.type);
}

function keywordBase(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(0, idx) : id;
}

function defHasKeyword(reg: EngineRegistry, def: CardDef, id: string): boolean {
  const script = getScript(reg, def.cardId);
  const kws = [...normalizeKeywords(def.attributes), ...(script?.keywords ?? [])];
  return kws.some((k) => keywordBase(k) === id);
}

/** 部署线偏好：前线更值钱（可压线、可打 HQ），但槽位满时只能用支援线 */
function preferredLine(action: LegalAction): Line | undefined {
  const lines = action.deployLines ?? [];
  if (lines.includes('frontline')) return 'frontline';
  return lines[0];
}

/**
 * 枚举所有候选动作并打分（按分数降序，最多 MAX_CANDIDATES 个）。
 * 纯函数、不修改 state。
 */
export function enumerateCandidates(state: GameState, reg: EngineRegistry, me: PlayerIndex): AICandidate[] {
  if (state.status !== 'playing' || state.activePlayer !== me || state.pendingChoice) return [];
  const actions = legalActions(state, reg, me);
  const out: AICandidate[] = [];
  const trackers = state.players[me].trackers;
  // 反制牌会写这两个 tracker，但 legalActions 不会过滤它们；这里必须自己跳过，
  // 否则 applyCommand 会静默拒绝（只写一条日志），AI 会在同一回合无限重试同一条指令。
  const deployLocked = Number(trackers['restrict:deploy:untilTurn'] ?? 0) >= state.turn;
  const attackLocked = Number(trackers['restrict:attack:untilTurn'] ?? 0) >= state.turn;

  for (const action of actions) {
    if (action.kind === 'endTurn') {
      out.push({
        cmd: { type: 'endTurn', player: me },
        kind: 'endTurn',
        label: '结束回合',
        cost: 0,
        base: 0,
      });
      continue;
    }
    if (action.kind === 'attack') {
      if (attackLocked) continue; // 本回合被反制封锁攻击
      if (!action.attackerId || !action.targets) continue;
      const attacker = state.units[action.attackerId];
      if (!attacker) continue;
      for (const ref of action.targets.refs) {
        out.push({
          cmd: { type: 'attack', player: me, attackerId: action.attackerId, target: ref },
          kind: 'attack',
          label: action.label,
          attackerId: action.attackerId,
          target: ref,
          cost: Math.max(0, attacker.operationCost),
          base: 0,
        });
      }
      continue;
    }
    if (action.kind === 'moveUnit') {
      // LegalAction 只给 unitId（方向由引擎语义决定）：支援线 → 前线，否则 → 支援线
      if (!action.unitId) continue;
      const unit = state.units[action.unitId];
      if (!unit || unit.owner !== me) continue;
      const toLine: Line = unit.line === 'support' ? 'frontline' : 'support';
      out.push({
        cmd: { type: 'moveUnit', player: me, unitId: action.unitId, toLine },
        kind: 'moveUnit',
        label: action.label,
        unitId: action.unitId,
        cost: Math.max(0, action.cost ?? 0),
        base: 0,
      });
      continue;
    }
    if (action.kind === 'playCard') {
      if (!action.cardInstanceId) continue;
      const instance = state.cards[action.cardInstanceId];
      if (!instance) continue;
      // 本回合被反制封锁部署：单位卡打不出去（指令/反制不受影响）
      if (deployLocked) {
        const cardDef = getDef(reg, instance.cardId);
        if (isUnitDef(cardDef)) continue;
      }
      const need = action.targets?.mode === 'target' ? Math.max(1, action.targets.count ?? 1) : 0;
      const refs = action.targets?.refs ?? [];
      // 合法目标不足 count：引擎会静默丢弃整条指令（白耗动作），直接跳过
      if (need > 0 && refs.length < need) continue;
      const picked = need > 0 ? pickTargets(state, reg, me, instance.cardId, refs, need) : { refs: [], value: 0 };
      if (need > 0 && picked.refs.length < need) continue;
      const line = preferredLine(action);
      if (action.deployLines && action.deployLines.length === 0) continue;
      const cmd: GameCommand = {
        type: 'playCard',
        player: me,
        instanceId: instance.instanceId,
        targets: need > 0 ? picked.refs : undefined,
        line,
      };
      out.push({
        cmd,
        kind: 'playCard',
        label: action.label,
        cardId: instance.cardId,
        target: picked.refs[0],
        cost: Math.max(0, action.cost ?? 0),
        base: 0,
      });
      continue;
    }
    // 其他 kind（concede/resolveChoice）不在正常候选里
  }

  // 去重（同一指令只保留一条）
  const seen = new Set<string>();
  const unique: AICandidate[] = [];
  for (const candidate of out) {
    const key = JSON.stringify(candidate.cmd);
    if (seen.has(key)) continue;
    seen.add(key);
    candidate.base = scoreCandidate(state, reg, me, candidate);
    unique.push(candidate);
  }
  unique.sort((a, b) => b.base - a.base || a.label.localeCompare(b.label));
  return unique.slice(0, MAX_CANDIDATES);
}

/** 单个候选动作的启发式评分（最终归一到 0~100：50≈普通可打动作，100=斩杀） */
export function scoreCandidate(
  state: GameState,
  reg: EngineRegistry,
  me: PlayerIndex,
  candidate: AICandidate,
): number {
  let raw = 0;
  switch (candidate.kind) {
    case 'endTurn':
      raw = scoreEndTurn(state, me);
      break;
    case 'attack':
      raw = scoreAttack(state, reg, me, candidate);
      break;
    case 'moveUnit':
      raw = scoreMove(state, reg, me, candidate);
      break;
    case 'playCard':
      raw = scorePlayCard(state, reg, me, candidate);
      break;
    default:
      raw = 0;
      break;
  }
  return Math.max(0, Math.min(100, raw));
}

/** 结束回合：基础分略高于「纯亏牌」，低于任何合理动作 */
function scoreEndTurn(state: GameState, me: PlayerIndex): number {
  const kredits = state.players[me].kredits;
  // 手里还有克雷迪特没花掉时轻微降权，鼓励把节奏用满
  return 20.5 - Math.min(Math.max(0, kredits), 6) * 0.35;
}

/** 敌方某条战线上的近战攻击力合计（判断进退时的“新增暴露”） */
function enemyMeleeAttackOnLine(
  state: GameState,
  reg: EngineRegistry,
  me: PlayerIndex,
  line: Line,
): number {
  const foe = opponentOf(me);
  let total = 0;
  for (const unit of playerUnits(state, foe)) {
    if (unit.line !== line) continue;
    if (unit.attack <= 0) continue;
    const def = getDef(reg, unit.cardId);
    if (!def) continue;
    if (isRangedType(def.type)) continue; // 远程本来就能打任意战线
    total += unit.attack;
  }
  return total;
}

/**
 * 移动评分（官方规则：部署只进支援线，进前线必须“移动”）
 * - 支援 → 前线：
 *   · 地面单位：上前线才能打敌方 HQ / 打敌方支援线，且抢空前线可以封锁对手入场 → 高分；
 *   · 炮兵/空军：远程本来就能打 HQ，上前线只会多挨敌方支援线近战的打 → 低分；
 *   · 守护：只有在前线才有嘲讽 → 总部吃紧时高分。
 * - 前线 → 支援：主要是让位/保命；地面单位撤退会失去打 HQ 的能力 → 低分。
 */
function scoreMove(state: GameState, reg: EngineRegistry, me: PlayerIndex, candidate: AICandidate): number {
  const unit = candidate.unitId ? state.units[candidate.unitId] : undefined;
  if (!unit) return 0;
  const def = getDef(reg, unit.cardId);
  const isMelee = def ? !isRangedType(def.type) : true;
  const isGuard = unit.keywords.some((k) => keywordBase(k) === 'guard');
  const foe = opponentOf(me);
  const myHq = state.players[me].hq;
  const enemyHq = state.players[foe].hq;
  const threat = hqThreat(state, reg, me);

  if (unit.line === 'support') {
    // 支援线 → 前线
    let score = 26;
    if (isMelee) {
      score += 6; // 地面单位想输出/打 HQ 必须上前线
      if (enemyHq.hp <= 12) score += 4; // 接近斩杀，需要前线解锁 HQ 攻击
      if (state.players[foe].support.length > 0) score += 3; // 前线才能打敌方支援线
    } else {
      score -= 10; // 远程上前线纯挨打
    }
    const frontEmpty = state.players[0].frontline.length + state.players[1].frontline.length === 0;
    if (frontEmpty) score += 10; // 抢空前线：直接封锁对手下回合入场
    else if (state.frontlineController === me) score += 3;
    if (isGuard) score += threat >= 3 || myHq.hp <= 12 ? 10 : 4; // 守护在前线才有嘲讽
    if (unit.hp <= 2) score -= 6;
    // 上前线后，敌方支援线的近战也能打到我们（原本打不到）
    score -= Math.min(8, enemyMeleeAttackOnLine(state, reg, me, 'support') * 0.7);
    if (state.players[me].frontline.length >= 3) score -= 8; // 不扎堆
    return score;
  }

  // 前线 → 支援线
  let score = 23;
  if (isMelee) score -= 8; // 撤下前线＝放弃打 HQ / 打敌方支援线
  if (unit.hp <= 2) score += 5; // 残血撤退保命
  if (unit.attack <= 1) score += 2; // 打不出伤害的单位让出前线槽位
  if (isGuard && threat > 0) score -= 14; // 守护是墙，撤了总部就裸
  if (isMelee && enemyHq.hp <= 8) score -= 6; // 快斩杀了别撤
  return score;
}

function scoreAttack(
  state: GameState,
  reg: EngineRegistry,
  me: PlayerIndex,
  candidate: AICandidate,
): number {
  const attacker = candidate.attackerId ? state.units[candidate.attackerId] : undefined;
  if (!attacker || !candidate.target) return 0;
  const foe = opponentOf(me);
  const myHq = state.players[me].hq;

  if (candidate.target.kind === 'hq') {
    const hq = state.players[foe].hq;
    const dmg = Math.max(0, attacker.attack - hq.armor);
    // 斩杀：这是最高优先级（100 分上限）
    if (hq.hp <= dmg) return 130;
    let score = 46 + dmg * 2.4;
    if (hq.hp <= 6) score += 5;
    // 自己总部危急且场上压力大时，先解场比抢脸划算
    if (myHq.hp <= 10 && hqThreat(state, reg, me) >= myHq.hp * 0.75) score -= 7;
    return score;
  }

  if (candidate.target.kind === 'unit') {
    const target = state.units[candidate.target.unitId];
    if (!target) return 0;
    const dmg = Math.max(0, attacker.attack - target.armor - (Number(target.trackers.damageReduction) || 0));
    const kills = dmg >= target.hp;
    const retaliation = Math.max(
      0,
      target.attack - attacker.armor - (Number(attacker.trackers.damageReduction) || 0),
    );
    const weDie = retaliation >= attacker.hp;
    const targetValue = unitValue(reg, target);
    const attackerValue = unitValue(reg, attacker);

    let score = 44;
    if (!kills && dmg <= 0) return 6; // 完全打不动，纯亏（不如留场）
    if (kills) score += 12 + targetValue * 0.75;
    else score += dmg * 1.1;
    if (weDie) score -= attackerValue * 0.62;
    else score -= retaliation * 0.45;
    if (kills && !weDie) score += 5;
    // 换命不成（自己死、对方不掉）基本是白送
    if (weDie && !kills) score -= 14;
    if (kills && weDie && targetValue + 2 < attackerValue) score -= 5;
    if (target.keywords.some((k) => keywordBase(k) === 'guard')) score += 3;
    // 我方 HQ 血量告急时，解场比换命更有价值
    if (myHq.hp <= 8 && kills) score += 4;
    return score;
  }
  return 0;
}

function scorePlayCard(
  state: GameState,
  reg: EngineRegistry,
  me: PlayerIndex,
  candidate: AICandidate,
): number {
  if (!candidate.cardId) return 0;
  const def = getDef(reg, candidate.cardId);
  if (!def) return 0;
  const foe = opponentOf(me);
  const myHq = state.players[me].hq;
  const enemyHqHp = state.players[foe].hq.hp;
  const cost = candidate.cost;

  // 单位卡：只看身材 + 关键字，**没有脚本的白板单位照样算价值**（有身材就该打）
  if (isUnitDef(def)) {
    const line = candidate.cmd.type === 'playCard' ? candidate.cmd.line : undefined;
    let value = defUnitValue(reg, def);
    if (line === 'frontline') value += 2.4;
    let score = 28 + value * 1.15;

    // 斩杀潜力
    const blitz = defHasKeyword(reg, def, 'blitz') || defHasKeyword(reg, def, 'shock');
    if (blitz && def.attack >= enemyHqHp) score += 40; // 部署即可斩
    else if (boardAttack(state, me) + Math.max(0, def.attack) >= enemyHqHp) score += 7;

    // 守护补墙：总部吃紧时大幅加分
    if (defHasKeyword(reg, def, 'guard')) {
      const threat = hqThreat(state, reg, me);
      if (myHq.hp <= 12 || threat >= myHq.hp) score += 4 + Math.min(6, threat * 0.5);
    }
    // 曲线：越贵的卡越应该优先打出（不然后面卡手）
    score += Math.min(cost, 8) * 0.4;
    return score;
  }

  const script = getScript(reg, candidate.cardId);
  if (def.type === 'countermeasure') {
    // 没脚本的反制牌 = 白板，打出去只亏牌
    return script?.counter ? 27 + Math.min(cost, 6) * 0.5 : 4;
  }

  // 指令卡：没脚本就是纯亏（引擎不会有效果）
  if (!script) return 2;
  const ops = collectEffectOps(script);
  if (ops.length === 0) return 3;

  let score = 27 + Math.min(cost, 8) * 0.9;
  if (ops.some((op) => op.op === 'destroy')) score += 3; // 硬解
  if (ops.some((op) => op.op === 'damage')) score += 1;
  const intent = targetIntent(reg, candidate.cardId);
  if (candidate.target && candidate.cmd.type === 'playCard' && (candidate.cmd.targets?.length ?? 0) > 0) {
    const targetValue = bestTargetValue(state, reg, me, candidate.cardId, candidate.cmd.targets ?? []);
    // 需要目标却没好目标（伤害牌只能打自己人 / 增益牌只能给对手）：宁可不打
    if (intent === 'harm' && targetValue <= 1) return 6;
    if (intent === 'help' && targetValue <= 0) return 7;
    score += intent === 'harm' ? targetValue * 0.55 : targetValue * 0.35;
  }
  return score;
}

/** 便于测试/调试：候选动作的简述 */
export function describeCandidate(reg: EngineRegistry, candidate: AICandidate): string {
  const def = candidate.cardId ? getDef(reg, candidate.cardId) : undefined;
  const name = def?.nameZh ?? def?.nameEn ?? candidate.label;
  const targetText = candidate.target
    ? candidate.target.kind === 'hq'
      ? `HQ${candidate.target.player + 1}`
      : candidate.target.kind === 'unit'
        ? candidate.target.unitId
        : candidate.target.instanceId
    : '';
  return `${candidate.kind}:${name}${targetText ? ` → ${targetText}` : ''}`;
}
