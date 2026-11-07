/**
 * AI 对手（引擎层，UI 通过本文件调用）
 * ==================================================================
 * 唯一对外接口：
 *
 *   chooseAIAction(state, reg, player, difficulty?) => GameCommand | null
 *
 * 约定（与 battle UI 对齐）：
 * 1. 每次只返回**一条**指令；UI 循环调用直到返回 null / endTurn 被应用。
 * 2. 返回值一定能通过 applyCommand 校验：出牌目标全部取自 legalActions 的
 *    targets.refs（多目标卡按 requiredTargetCount 填满），攻击目标来自 legalActions。
 * 3. 有 pendingChoice 且属于该玩家 → 返回 resolveChoice（选择最有利的分支/目标）；
 *    若挂起选择属于对手但 AI 是当前行动方（引擎只允许 activePlayer 结算），
 *    也代为结算，但按**选择所有者**的利益挑，不占对手便宜。
 * 4. 没有可用动作 → 返回 { type:'endTurn', player }；不是自己回合 / 对局已结束 → null。
 * 5. 不做信息作弊：只读公开信息（双方场面、HQ、手牌**数量**、牌库数量、克雷迪特、
 *    公开的卡牌脚本 CardScript）。
 * 6. 无 Math.random：同 state + 同难度 → 同指令（用 state.seed^turn^log.length 派生 PRNG）。
 * 7. 单次调用 < 50ms：hard 的 1 层前瞻最多 7 个候选（6 动作 + endTurn），
 *    每个候选 clone + applyCommand 一次；异常时自动退回纯启发式。
 *
 * 难度：easy = 30% 随机合法动作；normal = 纯启发式；hard = 启发式 + 1 层前瞻。
 *
 * 辅助出口：aiDeckPreset(faction, cards, seed?) —— 给 AI（或 UI 默认）生成 39 张合法卡组。
 */
import type { CardDef, EngineRegistry, GameCommand, GameState, PlayerIndex } from './types';
import { applyCommand } from './game';
import { enumerateCandidates, type AICandidate } from './ai/candidates';
import { pendingChoiceCommand } from './ai/choice';
import { aiRandom, randomIndex } from './ai/random';
import { staticStateScore } from './ai/values';
import { DIFFICULTY_CONFIG, normalizeDifficulty, type AIDifficulty } from './ai/difficulty';
import { aiDeckPreset as buildDeckPreset, type AIDeckCard, type DeckCard } from './ai/deck';

export type { AIDifficulty } from './ai/difficulty';
export { DIFFICULTY_CONFIG, DEFAULT_DIFFICULTY, normalizeDifficulty } from './ai/difficulty';
export type { AIDeckCard, DeckCard } from './ai/deck';
export { AI_DECK_SIZE, isCardLegalForDeck } from './ai/deck';

/** 同分时允许的浮动窗口：窗口内用确定性随机打破平局 */
const TIE_WINDOW = 0.8;
/** hard 同分窗口（前瞻分） */
const TIE_WINDOW_HARD = 1.2;

/**
 * 选一条指令。
 * @param state      当前对局状态（不会被修改）
 * @param reg        卡牌定义 + 脚本注册表
 * @param player     这次要行动/做决定的玩家（必须是 activePlayer）
 * @param difficulty easy | normal | hard（默认 normal）
 * @returns 可交给 applyCommand 的指令；不该行动时返回 null
 */
export function chooseAIAction(
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
  difficulty: AIDifficulty = 'normal',
): GameCommand | null {
  if (state.status !== 'playing') return null;
  if (state.activePlayer !== player) return null;
  const level = normalizeDifficulty(difficulty);

  // 1) 有挂起选择：立即结算（引擎在 pendingChoice 存在时拒绝其它任何指令）
  if (state.pendingChoice) {
    return pendingChoiceCommand(state, reg, level);
  }

  // 2) 枚举 + 打分
  const candidates = enumerateCandidates(state, reg, player);
  if (candidates.length === 0) return { type: 'endTurn', player };
  const actionable = candidates.filter((candidate) => candidate.kind !== 'endTurn');
  if (actionable.length === 0) return { type: 'endTurn', player };

  const rng = aiRandom(state, 31);
  const config = DIFFICULTY_CONFIG[level];

  // 3) easy：一定概率走随机合法动作（模拟“新手失误”）
  if (config.randomActionChance > 0 && rng() < config.randomActionChance) {
    const pick = actionable[randomIndex(rng, actionable.length)];
    if (pick) return pick.cmd;
  }

  // 4) hard：启发式前 6 + 1 层前瞻
  if (config.lookaheadCandidates > 0) {
    const planned = chooseWithLookahead(state, reg, player, candidates, config.lookaheadCandidates, config.lookaheadWeight, config.selfHarmThreshold, rng);
    if (planned) return planned;
  }

  // 5) normal：纯启发式（同分随机）
  const best = pickBestByScore(candidates, rng);
  return best ? best.cmd : { type: 'endTurn', player };
}

/** 启发式最优，同分窗口内确定性随机 */
function pickBestByScore(candidates: readonly AICandidate[], rng: () => number): AICandidate | undefined {
  if (candidates.length === 0) return undefined;
  const max = candidates.reduce((m, c) => Math.max(m, c.base), -Infinity);
  const tied = candidates.filter((c) => c.base >= max - TIE_WINDOW);
  return tied[randomIndex(rng, tied.length)] ?? candidates[0];
}

/**
 * hard：对得分最高的 N 个候选各做一次 clone + applyCommand，用全局态势差修正评分。
 * 另外强制把 endTurn 放进候选集（否则“止损收手”永远不被考虑）。
 */
function chooseWithLookahead(
  state: GameState,
  reg: EngineRegistry,
  me: PlayerIndex,
  candidates: readonly AICandidate[],
  lookaheadCount: number,
  weight: number,
  selfHarmThreshold: number,
  rng: () => number,
): GameCommand | null {
  const pool = candidates.slice(0, Math.min(lookaheadCount, candidates.length));
  const endTurn = candidates.find((candidate) => candidate.kind === 'endTurn');
  if (endTurn && !pool.includes(endTurn)) pool.push(endTurn);
  if (pool.length === 0) return null;

  const before = staticStateScore(state, reg, me);
  const evaluated: { candidate: AICandidate; total: number; delta: number }[] = [];
  for (const candidate of pool) {
    let delta = 0;
    try {
      const next = applyCommand(state, candidate.cmd, reg).state;
      delta = staticStateScore(next, reg, me) - before;
    } catch {
      delta = 0; // 前瞻失败就当没有信息，退回启发式
    }
    let total = candidate.base + delta * weight;
    if (delta < selfHarmThreshold) total -= 12; // 明显自毁：额外惩罚
    evaluated.push({ candidate, total, delta });
  }
  evaluated.sort((a, b) => b.total - a.total);
  const bestTotal = evaluated[0].total;
  const tied = evaluated.filter((entry) => entry.total >= bestTotal - TIE_WINDOW_HARD);
  const chosen = tied[randomIndex(rng, tied.length)] ?? evaluated[0];
  return chosen.candidate.cmd;
}

/**
 * 只结算挂起选择（UI 在人类玩家也有挂起选择时可用它做 AI 兜底）。
 * 指令的 player 固定为 activePlayer（引擎校验要求）。
 */
export function chooseAIPendingChoice(
  state: GameState,
  reg: EngineRegistry,
  difficulty: AIDifficulty = 'normal',
): GameCommand | null {
  if (state.status !== 'playing') return null;
  if (!state.pendingChoice) return null;
  return pendingChoiceCommand(state, reg, normalizeDifficulty(difficulty));
}

/**
 * 生成一副 39 张的 AI 卡组（无需自建卡组时使用）。
 * @param faction 主阵营（'Germany' / 'USA' / 'Britain' / 'Japan' / 'Soviet' …，支持 USSR 别名）
 * @param cards   全量 CardDef（通常来自 public/data/cards.json）
 * @param seed    随机种子，相同 seed 产出相同卡组
 */
export function aiDeckPreset(faction: string, cards: CardDef[], seed = 1): DeckCard[] {
  return buildDeckPreset(faction, cards, seed);
}

/** 便于调试：当前启发式排序的前 N 个候选（UI 可用来做“AI 思考中”提示） */
export function previewAICandidates(
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
  limit = 5,
): { label: string; score: number; command: GameCommand }[] {
  return enumerateCandidates(state, reg, player)
    .slice(0, Math.max(1, limit))
    .map((candidate) => ({ label: candidate.label, score: Math.round(candidate.base * 10) / 10, command: candidate.cmd }));
}

/** 便于调试/统计：某方的静态态势分（正数=占优） */
export function evaluateAIState(state: GameState, reg: EngineRegistry, me: PlayerIndex): number {
  return staticStateScore(state, reg, me);
}
