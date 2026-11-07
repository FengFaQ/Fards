/**
 * AI 桥接层
 * ------------------------------------------------------------------
 * engine/ai.ts 由 ai-forge 实现（签名已冻结）：
 *   chooseAIAction(state, reg, player, difficulty?) => GameCommand | null
 *   aiDeckPreset(faction, cards, seed?) => { cardId, count }[]
 *
 * 该文件尚未落地（或构建时不存在）时，本模块用本地贪心兜底：
 * 从 legalActions 里按启发式评分选一条合法动作，并自己补齐目标。
 * 通过 import.meta.glob 探测文件是否存在 —— 一旦 engine/ai.ts 出现，
 * 构建/热更新会自动切到正式实现，两套实现都能跑。
 */
import { legalActions } from '@/engine';
import type {
  CardDef,
  EngineRegistry,
  GameCommand,
  GameState,
  LegalAction,
  PlayerIndex,
  TargetRef,
} from '@/engine/types';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_META: Record<AIDifficulty, { zh: string; en: string; desc: string }> = {
  easy: { zh: '新兵', en: 'RECRUIT', desc: '会犯低级错误，适合熟悉界面' },
  normal: { zh: '老兵', en: 'VETERAN', desc: '按价值交换场面，标准难度' },
  hard: { zh: '王牌', en: 'ACE', desc: '会算斩杀与交换收益，压力最大' },
};

type ChooseFn = (
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
  difficulty?: AIDifficulty,
) => GameCommand | null;
type DeckPresetFn = (
  faction: string,
  cards: CardDef[],
  seed?: number,
) => { cardId: string; count: number }[];

export interface EngineAIModule {
  choose: ChooseFn;
  deckPreset?: DeckPresetFn;
}

/* ---------------- 探测 engine/ai.ts ---------------- */

const engineModules = import.meta.glob('/src/engine/ai.ts') as Record<
  string,
  () => Promise<Record<string, unknown>>
>;

let cached: EngineAIModule | null | undefined;
let loading: Promise<EngineAIModule | null> | null = null;

/** 加载正式 AI（不存在时返回 null，调用方落回本地兜底） */
export function loadEngineAI(): Promise<EngineAIModule | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (loading) return loading;
  const loader = Object.values(engineModules)[0];
  if (!loader) {
    cached = null;
    return Promise.resolve(null);
  }
  loading = loader()
    .then((mod) => {
      const choose = mod.chooseAIAction ?? mod.default;
      if (typeof choose !== 'function') {
        cached = null;
        return null;
      }
      const preset = mod.aiDeckPreset;
      cached = {
        choose: choose as ChooseFn,
        deckPreset: typeof preset === 'function' ? (preset as DeckPresetFn) : undefined,
      };
      return cached;
    })
    .catch((err: unknown) => {
      console.warn('[battle] engine/ai.ts 加载失败，使用本地 AI 兜底', err);
      cached = null;
      return null;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** 是否已切到正式 AI（UI 上做个小标记，便于排查） */
export function hasEngineAI(): boolean {
  return !!cached;
}

/* ---------------- 目标挑选 ---------------- */

const AIR_TYPES = new Set(['fighter', 'bomber']);

type SidePref = 'self' | 'enemy' | 'any';

function targetSidePreference(reg: EngineRegistry, cardId?: string): SidePref {
  if (!cardId) return 'any';
  const script = reg.scripts[cardId];
  if (!script) return 'any';
  const spec =
    script.targetSpec ?? script.abilities?.find((a) => a.trigger === 'deploy' || a.trigger === 'order')?.target;
  if (!spec) return 'any';
  if (spec.kind === 'query') return spec.side === 'any' ? 'any' : spec.side;
  if (spec.kind === 'hq') return spec.side;
  return 'any';
}

function refValue(
  state: GameState,
  player: PlayerIndex,
  ref: TargetRef,
  sidePref: SidePref,
): number {
  if (ref.kind === 'hq') {
    const hq = state.players[ref.player].hq;
    const friendly = ref.player === player;
    if (friendly) return 8 - hq.hp * 0.4;
    if (sidePref === 'self') return -80;
    return 46 - hq.hp * 1.1;
  }
  if (ref.kind === 'unit') {
    const unit = state.units[ref.unitId];
    if (!unit) return -100;
    const friendly = unit.owner === player;
    if (sidePref === 'self' && !friendly) return -60;
    if (sidePref === 'enemy' && friendly) return -60;
    if (friendly) return 12 + unit.attack * 1.3 + unit.hp * 0.5;
    return 24 - unit.hp * 1.6 + unit.attack * 1.4;
  }
  return 0;
}

/** 按启发式为一张卡/一次攻击挑选目标（多目标卡挑满 count 个） */
export function pickTargets(
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
  action: LegalAction,
  difficulty: AIDifficulty = 'normal',
): TargetRef[] {
  const refs = action.targets?.refs ?? [];
  const count = action.targets?.count ?? 1;
  if (!refs.length || count <= 0) return [];
  const instance = action.cardInstanceId ? state.cards[action.cardInstanceId] : undefined;
  const sidePref = targetSidePreference(reg, instance?.cardId);
  const ranked = refs
    .map((ref) => ({ ref, score: refValue(state, player, ref, sidePref) }))
    .sort((a, b) => b.score - a.score);

  if (difficulty === 'easy' && Math.random() < 0.4) {
    const shuffled = [...ranked].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length)).map((item) => item.ref);
  }
  return ranked.slice(0, Math.min(count, ranked.length)).map((item) => item.ref);
}

function attackValue(state: GameState, player: PlayerIndex, ref: TargetRef): number {
  if (ref.kind === 'hq') {
    const hq = state.players[ref.player].hq;
    return 40 - hq.hp;
  }
  if (ref.kind === 'unit') {
    const target = state.units[ref.unitId];
    if (!target) return 0;
    return 30 - target.hp * 2 + target.attack * 1.5;
  }
  return 0;
}

function pickAttackTarget(
  state: GameState,
  player: PlayerIndex,
  refs: TargetRef[],
  difficulty: AIDifficulty,
): TargetRef | null {
  if (!refs.length) return null;
  if (difficulty === 'easy' && Math.random() < 0.35) {
    return refs[Math.floor(Math.random() * refs.length)] ?? null;
  }
  const ranked = [...refs].sort((a, b) => attackValue(state, player, b) - attackValue(state, player, a));
  return ranked[0] ?? null;
}

/* ---------------- 动作 → 指令 ---------------- */

function preferDeployLine(
  state: GameState,
  reg: EngineRegistry,
  action: LegalAction,
): 'frontline' | 'support' | undefined {
  const lines = action.deployLines;
  if (!lines?.length) return undefined;
  const instance = action.cardInstanceId ? state.cards[action.cardInstanceId] : undefined;
  const def = instance ? reg.cardDefs[instance.cardId] : undefined;
  const wantsBack = !!def && (AIR_TYPES.has(def.type) || def.type === 'artillery');
  if (wantsBack) return lines.includes('support') ? 'support' : lines[0];
  return lines.includes('frontline') ? 'frontline' : lines[0];
}

/** 把 LegalAction 翻译成可直接 applyCommand 的指令；非法时返回 null */
export function actionToCommand(
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
  action: LegalAction,
  difficulty: AIDifficulty = 'normal',
): GameCommand | null {
  switch (action.kind) {
    case 'endTurn':
      return { type: 'endTurn', player };
    case 'concede':
      return { type: 'concede', player };
    case 'playCard': {
      if (!action.cardInstanceId) return null;
      const need = action.targets?.mode === 'target' ? action.targets.count ?? 1 : 0;
      const targets = need > 0 ? pickTargets(state, reg, player, action, difficulty) : [];
      if (need > 0 && targets.length < need) return null;
      return {
        type: 'playCard',
        player,
        instanceId: action.cardInstanceId,
        targets: targets.length ? targets : undefined,
        line: preferDeployLine(state, reg, action),
      };
    }
    case 'attack': {
      if (!action.attackerId) return null;
      const target = pickAttackTarget(state, player, action.targets?.refs ?? [], difficulty);
      if (!target) return null;
      return { type: 'attack', player, attackerId: action.attackerId, target };
    }
    default:
      return null;
  }
}

/* ---------------- 本地兜底 AI：评分 ---------------- */

function scoreAction(
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
  action: LegalAction,
): number {
  const me = state.players[player];
  const enemy = state.players[player === 0 ? 1 : 0];

  if (action.kind === 'endTurn') return -1000;
  if (action.kind === 'concede') return -5000;

  if (action.kind === 'playCard') {
    const instance = action.cardInstanceId ? state.cards[action.cardInstanceId] : undefined;
    const def = instance ? reg.cardDefs[instance.cardId] : undefined;
    if (!def) return -200;
    const cost = action.cost ?? def.kredits;
    let score = 18 - cost * 1.2;
    if (def.type === 'order' || def.type === 'countermeasure') {
      const enemyBoard = enemy.support.length + enemy.frontline.length;
      score += def.type === 'countermeasure' ? 1 : enemyBoard * 2.2 - 2;
    } else {
      score += 5 + def.attack * 1.4 + def.defense * 1.1;
      if (def.type === 'tank') score += 1.5;
      if (def.type === 'artillery') score += 1;
      for (const attr of def.attributes) {
        const key = attr.toLowerCase();
        if (key === 'guard') score += 3.5;
        else if (key.startsWith('blitz')) score += 3;
        else if (key.startsWith('heavyarmor')) score += 2;
        else if (key === 'fury') score += 2.5;
      }
      // 场上快满时降低继续铺场的价值
      if (me.support.length + me.frontline.length >= 5) score -= 3;
    }
    if (action.targets?.mode === 'target') {
      score += action.targets.refs.length ? 1.5 : -8;
    }
    return score;
  }

  if (action.kind === 'attack') {
    const attacker = action.attackerId ? state.units[action.attackerId] : undefined;
    if (!attacker) return -200;
    let best = -999;
    for (const ref of action.targets?.refs ?? []) {
      if (ref.kind === 'hq') {
        const hq = state.players[ref.player].hq;
        const dmg = Math.max(0, attacker.attack - hq.armor);
        best = Math.max(best, hq.hp <= dmg ? 2000 : 12 + dmg * 1.3);
        continue;
      }
      if (ref.kind === 'unit') {
        const target = state.units[ref.unitId];
        if (!target) continue;
        const kills = attacker.attack >= target.hp + target.armor;
        const dies = target.attack >= attacker.hp + attacker.armor;
        let value = kills ? 14 + target.attack * 1.6 + target.hp * 0.6 : attacker.attack * 0.5;
        if (dies) value -= 8 + attacker.attack * 1.4 + attacker.hp * 0.4;
        if (kills && !dies) value += 8;
        best = Math.max(best, value);
      }
    }
    if (best <= -900) return -200;
    return 10 + best;
  }

  return -100;
}

/** 本地兜底：从合法动作里选一条最值的 */
export function localAICommand(
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
  difficulty: AIDifficulty = 'normal',
): GameCommand | null {
  if (state.status !== 'playing') return null;
  if (state.pendingChoice) return localChoiceCommand(state, player);

  const actions = legalActions(state, reg, player).filter((action) => action.kind !== 'concede');
  if (!actions.length) return { type: 'endTurn', player };

  const scored = actions
    .map((action) => ({ action, score: scoreAction(state, reg, player, action) }))
    .sort((a, b) => b.score - a.score);

  let picked = scored[0]?.action;
  if (difficulty === 'easy') {
    // 新兵：35% 概率随便走一步合法动作
    if (Math.random() < 0.35) {
      const nonEnd = scored.filter((item) => item.action.kind !== 'endTurn');
      if (nonEnd.length) picked = nonEnd[Math.floor(Math.random() * nonEnd.length)].action;
    }
  } else if (difficulty === 'normal') {
    // 老兵：在前二里带一点随机，避免每局完全一样
    if (scored.length > 1 && Math.random() < 0.12) picked = scored[1].action;
  }
  if (!picked) return { type: 'endTurn', player };

  const command = actionToCommand(state, reg, player, picked, difficulty);
  if (command) return command;
  // 目标挑选失败时退到结束回合，避免卡死
  return picked.kind === 'endTurn' ? { type: 'endTurn', player } : { type: 'endTurn', player };
}

/** 处理挂起的选择（AI 侧） */
export function localChoiceCommand(state: GameState, player: PlayerIndex): GameCommand | null {
  const choice = state.pendingChoice;
  if (!choice) return null;
  void player;
  let selection: string[] = [];
  if (choice.mode === 'option') {
    const first = (choice.options ?? []).find((option) => !option.disabled) ?? (choice.options ?? [])[0];
    selection = first ? [first.id] : [];
  } else if (choice.mode === 'unit') {
    selection = (choice.unitCandidates ?? []).slice(0, Math.max(1, choice.min ?? 1));
  } else if (choice.mode === 'card') {
    selection = (choice.cardCandidates ?? []).slice(0, Math.max(1, choice.min ?? 1));
  }
  return {
    type: 'resolveChoice',
    // 引擎要求 resolveChoice.player === activePlayer
    player: state.activePlayer,
    choiceId: choice.choiceId,
    selection,
  };
}
