/**
 * AI 难度档位与参数。
 * - easy  ：30% 概率走随机合法动作，其余按普通启发式
 * - normal：纯启发式（0~1 层都没有，单次调用最快）
 * - hard  ：对候选前 6 个动作做 1 层前瞻（clone + applyCommand），并惩罚明显自毁
 */
export type AIDifficulty = 'easy' | 'normal' | 'hard';

export const DEFAULT_DIFFICULTY: AIDifficulty = 'normal';

export interface AIDifficultyConfig {
  /** 以随机合法动作代替启发式的概率 */
  randomActionChance: number;
  /** 前瞻候选数（0 = 不做前瞻） */
  lookaheadCandidates: number;
  /** 前瞻结果权重 */
  lookaheadWeight: number;
  /** 前瞻严重负面结果的罚分阈值 */
  selfHarmThreshold: number;
}

export const DIFFICULTY_CONFIG: Record<AIDifficulty, AIDifficultyConfig> = {
  easy: { randomActionChance: 0.3, lookaheadCandidates: 0, lookaheadWeight: 0, selfHarmThreshold: 0 },
  normal: { randomActionChance: 0, lookaheadCandidates: 0, lookaheadWeight: 0, selfHarmThreshold: 0 },
  hard: { randomActionChance: 0, lookaheadCandidates: 6, lookaheadWeight: 2.2, selfHarmThreshold: -10 },
};

/** 校验外部传入的难度字符串 */
export function normalizeDifficulty(difficulty?: AIDifficulty | string | null): AIDifficulty {
  if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') return difficulty;
  return DEFAULT_DIFFICULTY;
}
