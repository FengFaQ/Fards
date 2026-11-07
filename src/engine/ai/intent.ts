/**
 * AI 的「目标意图」推断与目标挑选。
 * ------------------------------------------------------------------
 * legalActions 只给出「能选哪些目标」，没告诉 AI 这张卡想打敌人还是想奶自己。
 * 这里靠**公开的卡牌脚本**（CardScript，对手也能看到同名卡的效果）反推意图：
 *   - 效果含 damage / destroy / pin / silence → harm（优先敌方单位/敌方 HQ）
 *   - 效果含 buff / heal / draw / summon / addCardToHand / grantKeyword → help（优先己方）
 *   - 脚本 targetSpec 明确写了 side，则以 side 为准
 * 不含任何对手隐藏信息。
 */
import type { CardScript, EffectOp, EngineRegistry, GameState, PlayerIndex, TargetRef } from '../types';
import { getScript, opponentOf, playerUnits } from '../state';
import { unitValue } from './values';

export type TargetIntent = 'harm' | 'help' | 'neutral';

const HARM_OPS = new Set(['damage', 'destroy', 'pin', 'silence']);
const HELP_OPS = new Set(['buff', 'heal', 'draw', 'summon', 'addCardToHand', 'grantKeyword', 'gainKredits']);

/** 递归收集脚本里的所有 EffectOp（含 conditional/choice/random/repeat 嵌套） */
export function collectEffectOps(script: CardScript | undefined): EffectOp[] {
  const out: EffectOp[] = [];
  const walk = (ops: EffectOp[] | undefined): void => {
    for (const op of ops ?? []) {
      out.push(op);
      switch (op.op) {
        case 'conditional':
          walk(op.then);
          walk(op.else);
          break;
        case 'choice':
          for (const option of op.options) walk(option.effects);
          break;
        case 'random':
          for (const option of op.options) walk(option.effects);
          break;
        case 'repeat':
          walk(op.effects);
          break;
        default:
          break;
      }
    }
  };
  for (const ability of script?.abilities ?? []) walk(ability.effects);
  for (const mode of script?.modes ?? []) walk(mode.effects);
  if (script?.counter) walk(script.counter.effects);
  return out;
}

/** 推断打出该卡时「选中目标」的期望方向 */
export function targetIntent(reg: EngineRegistry, cardId: string): TargetIntent {
  const script = getScript(reg, cardId);
  if (!script) return 'neutral';
  const spec =
    script.targetSpec ?? script.abilities?.find((a) => a.trigger === 'order' || a.trigger === 'deploy')?.target;
  const ops = collectEffectOps(script);
  const harm = ops.some((op) => HARM_OPS.has(op.op));
  const help = ops.some((op) => HELP_OPS.has(op.op));

  if (spec?.kind === 'hq') return spec.side === 'enemy' ? 'harm' : 'help';
  if (spec?.kind === 'query') {
    if (spec.side === 'enemy') return 'harm';
    if (spec.side === 'self') return 'help';
  }
  if (harm && !help) return 'harm';
  if (help && !harm) return 'help';
  if (harm && help) return spec?.kind === 'query' && spec.side === 'enemy' ? 'harm' : 'help';
  return 'neutral';
}

/**
 * 单个候选目标的「对我方价值」。
 * - intent=harm：打到这个目标越赚分越高（优先高价值敌方单位；打自己人给负分）
 * - intent=help：buff/治疗这个目标越值分越高（优先己方高价值单位）
 */
export function scoreTargetRef(
  state: GameState,
  reg: EngineRegistry,
  me: PlayerIndex,
  ref: TargetRef,
  intent: TargetIntent,
): number {
  const foe = opponentOf(me);
  if (ref.kind === 'hq') {
    const isEnemy = ref.player === foe;
    if (intent === 'harm') return isEnemy ? 6 + (state.players[ref.player].hq.hp <= 6 ? 4 : 0) : -2;
    if (intent === 'help') return isEnemy ? 0 : 5 + (state.players[ref.player].hq.hp <= 10 ? 2 : 0);
    return isEnemy ? 4 : 3;
  }
  if (ref.kind === 'unit') {
    const unit = state.units[ref.unitId];
    if (!unit) return -10;
    const own = unit.owner === me;
    const value = unitValue(reg, unit);
    if (intent === 'harm') {
      // 敌方：越贵越值得打；免伤/守护额外加分（拆守护能解放 HQ）
      if (own) return -value;
      const guardBonus = unit.keywords.some((k) => k.startsWith('guard')) ? 2 : 0;
      return value + guardBonus;
    }
    if (intent === 'help') {
      if (!own) return -value;
      return value + (unit.attack >= 3 ? 1 : 0);
    }
    return own ? value * 0.6 : value;
  }
  return 0;
}

/**
 * 从合法目标里按启发式挑 count 个（多目标卡）。
 * 返回挑中的目标与它们的合计价值（供动作评分使用）。
 */
export function pickTargets(
  state: GameState,
  reg: EngineRegistry,
  me: PlayerIndex,
  cardId: string,
  refs: readonly TargetRef[],
  count: number,
): { refs: TargetRef[]; value: number } {
  if (count <= 0 || refs.length === 0) return { refs: [], value: 0 };
  const intent = targetIntent(reg, cardId);
  const ranked = refs
    .map((ref) => ({ ref, score: scoreTargetRef(state, reg, me, ref, intent) }))
    .sort((a, b) => b.score - a.score);
  const chosen = ranked.slice(0, Math.min(count, ranked.length));
  return { refs: chosen.map((c) => c.ref), value: chosen.reduce((sum, c) => sum + Math.max(0, c.score), 0) };
}

/** 目标候选里最优者的价值（用于“这卡现在值不值得打”的判断） */
export function bestTargetValue(
  state: GameState,
  reg: EngineRegistry,
  me: PlayerIndex,
  cardId: string,
  refs: readonly TargetRef[],
): number {
  let best = 0;
  const intent = targetIntent(reg, cardId);
  for (const ref of refs) best = Math.max(best, scoreTargetRef(state, reg, me, ref, intent));
  return best;
}

/** 给 UI/调试用：某卡的目标意图（不读隐藏信息） */
export function describeCardIntent(reg: EngineRegistry, cardId: string): TargetIntent {
  return targetIntent(reg, cardId);
}

/** 当前我方单位（按价值降序），choice.mode==='unit' 用 */
export function ownUnitsByValue(state: GameState, reg: EngineRegistry, me: PlayerIndex) {
  return playerUnits(state, me)
    .map((unit) => ({ unit, value: unitValue(reg, unit) }))
    .sort((a, b) => b.value - a.value);
}
