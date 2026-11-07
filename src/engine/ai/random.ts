/**
 * AI 专用确定性伪随机。
 * ------------------------------------------------------------------
 * 硬性约束：AI 里禁止 Math.random —— 否则同一份 GameState 会走出不同结果，
 * 复盘/回归/UI 重放都会不一致。这里用 `state.seed ^ state.turn ^ state.log.length`
 * 派生的 xorshift32，同一状态同一 salt 必然得到同一序列。
 */
import type { GameState } from '../types';

/** 由 GameState 派生一个确定性随机源（返回 [0,1) 生成器） */
export function aiRandom(state: GameState, salt = 0): () => number {
  let s =
    Math.imul(state.seed ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(state.turn + 1, 0xc2b2ae35) ^
    Math.imul(state.log.length + 1, 0x27d4eb2f) ^
    Math.imul(salt + 1, 0x165667b1);
  s >>>= 0;
  if (s === 0) s = 0x6d2b79f5;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** 用确定性随机源从数组里挑一个下标（空数组返回 -1） */
export function randomIndex(rng: () => number, length: number): number {
  if (length <= 0) return -1;
  return Math.min(length - 1, Math.max(0, Math.floor(rng() * length)));
}

/** 用确定性随机源从数组里挑一个元素 */
export function randomPick<T>(rng: () => number, items: readonly T[]): T | undefined {
  const idx = randomIndex(rng, items.length);
  return idx < 0 ? undefined : items[idx];
}
