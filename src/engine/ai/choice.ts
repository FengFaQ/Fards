/**
 * AI 处理 PendingChoice（效果要求玩家做决定时引擎挂起）。
 * ------------------------------------------------------------------
 * 引擎规则：存在 pendingChoice 时 applyCommand 只接受 resolveChoice，且 resolveChoice
 * 的 `player` 必须等于 activePlayer（见 game.ts）。因此这里始终用 activePlayer 作为
 * 指令的 player，而**决策视角**用 choice.player（谁的选择）。
 *
 * 选择策略（只用公开信息）：
 * - option：按 context.branchOptions 里的 EffectOp 做启发式打分（伤害/消灭加分，
 *   自伤/自弃扣分），平局走确定性随机。
 * - unit  ：按 sourceCardId 推断意图（伤害类→挑敌方高价值单位，增益类→挑己方高价值单位）。
 * - card  ：弃自己牌→挑最便宜的；弃敌方牌→挑最贵的；其余→挑己方最贵的。
 * - slot  ：引擎当前不产出，兜底返回空选择。
 */
import type { EffectOp, EngineRegistry, GameCommand, GameState, PendingChoice, PlayerIndex, TargetRef } from '../types';
import { getDef, getScript, opponentOf } from '../state';
import { aiRandom, randomIndex } from './random';
import { cardDefValue, unitValue } from './values';
import { collectEffectOps, targetIntent } from './intent';
import type { AIDifficulty } from './difficulty';

/** 给一个 EffectOp 分支估个“对我方（选择者）有多好”的分 */
export function scoreEffectBranch(ops: EffectOp[] | undefined): number {
  let score = 0;
  for (const op of ops ?? []) {
    switch (op.op) {
      case 'damage': {
        const selfHarm = op.target.kind === 'hq' && op.target.side === 'self';
        score += selfHarm ? -3 : 3;
        break;
      }
      case 'destroy':
        score += 4;
        break;
      case 'buff':
        score += 2.5;
        break;
      case 'heal':
        score += 1.5;
        break;
      case 'draw':
        score += 2 * (typeof op.count === 'number' ? Math.max(1, op.count) : 1);
        break;
      case 'addCardToHand':
        score += 1.8;
        break;
      case 'summon':
        score += 3;
        break;
      case 'gainKredits':
        score += 2;
        break;
      case 'discard':
        score += op.side === 'enemy' ? 2 : -1.5;
        break;
      case 'mill':
        score += op.side === 'enemy' ? 2 : -1.5;
        break;
      case 'setKredits':
        score += op.side === 'enemy' ? 2 : -1;
        break;
      case 'pin':
        score += 2.5;
        break;
      case 'silence':
        score += 2;
        break;
      case 'grantKeyword':
        score += 2;
        break;
      case 'conditional':
        score += Math.max(scoreEffectBranch(op.then), scoreEffectBranch(op.else)) * 0.9;
        break;
      case 'repeat':
        score += scoreEffectBranch(op.effects);
        break;
      case 'choice':
        score += Math.max(0, ...op.options.map((o) => scoreEffectBranch(o.effects)));
        break;
      case 'random': {
        const total = op.options.reduce((sum, o) => sum + Math.max(0, o.weight), 0) || 1;
        const weighted = op.options.reduce(
          (sum, o) => sum + scoreEffectBranch(o.effects) * Math.max(0, o.weight),
          0,
        );
        score += weighted / total;
        break;
      }
      case 'custom':
        score += 1.2;
        break;
      default:
        score += 0.4;
        break;
    }
  }
  return score;
}

interface BranchOptionsContext {
  branchOptions?: { effects: EffectOp[] }[];
}

function optionIndex(labelId: string, fallback: number): number {
  const n = Number(labelId);
  return Number.isFinite(n) ? n : fallback;
}

/** 选择 option 模式：返回选中的 option id 列表 */
function chooseOption(choice: PendingChoice, owner: PlayerIndex, difficulty: AIDifficulty, rng: () => number): string[] {
  const options = (choice.options ?? []).filter((o) => !o.disabled);
  if (options.length === 0) return [];
  if (difficulty === 'easy' && rng() < 0.3) return [options[randomIndex(rng, options.length)].id];

  const ctx = (choice.context ?? {}) as BranchOptionsContext;
  const branches = ctx.branchOptions ?? [];
  let bestIdx = 0;
  let bestScore = -Infinity;
  options.forEach((option, index) => {
    const branch = branches[optionIndex(option.id, index)];
    const score = (branch ? scoreEffectBranch(branch.effects) : 0) + index * 0.01;
    if (score > bestScore + 1e-6) {
      bestScore = score;
      bestIdx = index;
    }
  });
  // 分数接近的选项之间做确定性随机，避免永远同一个分支
  const nearBest = options.filter((option, index) => {
    const branch = branches[optionIndex(option.id, index)];
    const score = branch ? scoreEffectBranch(branch.effects) : 0;
    return score >= bestScore - 0.75;
  });
  if (nearBest.length > 1) return [nearBest[randomIndex(rng, nearBest.length)].id];
  return [options[bestIdx].id];
}

/** 选择 unit 模式：按卡牌意图挑敌方/己方单位 */
function chooseUnits(
  state: GameState,
  reg: EngineRegistry,
  choice: PendingChoice,
  owner: PlayerIndex,
  difficulty: AIDifficulty,
  rng: () => number,
): string[] {
  const candidates = (choice.unitCandidates ?? [])
    .map((unitId) => state.units[unitId])
    .filter((unit): unit is NonNullable<typeof unit> => !!unit);
  if (candidates.length === 0) return [];
  const need = Math.max(1, Math.min(choice.min ?? 1, choice.max ?? candidates.length, candidates.length));

  if (difficulty === 'easy' && rng() < 0.3) {
    const shuffled = candidates.slice().sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
    const picked: string[] = [];
    while (picked.length < need && shuffled.length > 0) {
      const idx = randomIndex(rng, shuffled.length);
      picked.push(shuffled.splice(idx, 1)[0].unitId);
    }
    return picked;
  }

  const sourceCardId = typeof choice.context?.sourceCardId === 'string' ? choice.context.sourceCardId : '';
  const intent = sourceCardId ? targetIntent(reg, sourceCardId) : 'neutral';
  const foe = opponentOf(owner);
  const ranked = candidates
    .map((unit) => {
      const enemy = unit.owner === foe;
      const value = unitValue(reg, unit);
      // intent=harm 优先敌方、intent=help/neutral 优先己方
      const score = intent === 'harm' ? (enemy ? value : -value) : enemy ? -value : value;
      return { unitId: unit.unitId, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, need).map((r) => r.unitId);
}

/** 选择 card 模式：按“弃牌/抽牌”语义挑牌 */
function chooseCards(
  state: GameState,
  reg: EngineRegistry,
  choice: PendingChoice,
  owner: PlayerIndex,
  difficulty: AIDifficulty,
  rng: () => number,
): string[] {
  const instances = (choice.cardCandidates ?? [])
    .map((instanceId) => state.cards[instanceId])
    .filter((instance): instance is NonNullable<typeof instance> => !!instance);
  if (instances.length === 0) return [];
  const need = Math.max(1, Math.min(choice.min ?? 1, choice.max ?? instances.length, instances.length));

  if (difficulty === 'easy' && rng() < 0.3) {
    const pool = instances.slice();
    const picked: string[] = [];
    while (picked.length < need && pool.length > 0) {
      const idx = randomIndex(rng, pool.length);
      picked.push(pool.splice(idx, 1)[0].instanceId);
    }
    return picked;
  }

  const sourceCardId = typeof choice.context?.sourceCardId === 'string' ? choice.context.sourceCardId : '';
  const script = sourceCardId ? getScript(reg, sourceCardId) : undefined;
  const ops = collectEffectOps(script);
  const selfDiscard = ops.some((op) => op.op === 'discard' && op.side === 'self');
  const enemyDiscard = ops.some(
    (op) => (op.op === 'discard' || op.op === 'mill') && op.side === 'enemy',
  );
  const foe = opponentOf(owner);

  const valueOf = (instanceId: string): number => {
    const instance = state.cards[instanceId];
    const def = instance ? getDef(reg, instance.cardId) : undefined;
    return def ? cardDefValue(reg, def) : 0;
  };

  let ranked: { instanceId: string; score: number }[];
  if (enemyDiscard) {
    ranked = instances
      .filter((i) => i.owner === foe)
      .map((i) => ({ instanceId: i.instanceId, score: valueOf(i.instanceId) }))
      .sort((a, b) => b.score - a.score);
  } else if (selfDiscard) {
    ranked = instances
      .filter((i) => i.owner === owner)
      .map((i) => ({ instanceId: i.instanceId, score: -valueOf(i.instanceId) }))
      .sort((a, b) => b.score - a.score);
  } else {
    ranked = instances
      .map((i) => ({ instanceId: i.instanceId, score: i.owner === owner ? valueOf(i.instanceId) : -valueOf(i.instanceId) }))
      .sort((a, b) => b.score - a.score);
  }
  if (ranked.length === 0) {
    ranked = instances
      .map((i) => ({ instanceId: i.instanceId, score: -valueOf(i.instanceId) }))
      .sort((a, b) => b.score - a.score);
  }
  return ranked.slice(0, need).map((r) => r.instanceId);
}

/**
 * 为当前 pendingChoice 生成一条 resolveChoice 指令。
 * 指令的 player 一定是 activePlayer（引擎校验要求）。
 */
export function pendingChoiceCommand(
  state: GameState,
  reg: EngineRegistry,
  difficulty: AIDifficulty,
): GameCommand | null {
  const choice = state.pendingChoice;
  if (!choice) return null;
  const owner = choice.player;
  const rng = aiRandom(state, 97);
  let selection: string[] = [];

  if (choice.mode === 'option') {
    selection = chooseOption(choice, owner, difficulty, rng);
  } else if (choice.mode === 'unit') {
    selection = chooseUnits(state, reg, choice, owner, difficulty, rng);
  } else if (choice.mode === 'card') {
    selection = chooseCards(state, reg, choice, owner, difficulty, rng);
  } else {
    // mode === 'slot'：引擎暂不产出，兜底空选择
    selection = [];
  }

  return {
    type: 'resolveChoice',
    player: state.activePlayer,
    choiceId: choice.choiceId,
    selection,
  };
}

/** 调试用：挂起选择的简述 */
export function describePendingChoice(choice: PendingChoice | null): string {
  if (!choice) return 'none';
  const count =
    choice.mode === 'option'
      ? choice.options?.length ?? 0
      : choice.mode === 'unit'
        ? choice.unitCandidates?.length ?? 0
        : choice.mode === 'card'
          ? choice.cardCandidates?.length ?? 0
          : 0;
  return `${choice.mode}(${count}): ${choice.prompt}`;
}

/** 供测试/UI 用：把挂起选择的目标引用展开（了解 AI 会选谁） */
export function pendingChoiceTargets(state: GameState): TargetRef[] {
  const choice = state.pendingChoice;
  if (!choice) return [];
  if (choice.mode === 'unit') return (choice.unitCandidates ?? []).map((unitId) => ({ kind: 'unit', unitId }));
  if (choice.mode === 'card')
    return (choice.cardCandidates ?? []).map((instanceId) => ({ kind: 'card', instanceId }));
  return [];
}
