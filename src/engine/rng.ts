/**
 * 可序列化随机数发生器（mulberry32）。
 * 状态直接存进 GameState.rngState，保证对局可复盘、撤销可复现。
 */

export function nextRandom(state: number): [value: number, nextState: number] {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, a];
}

export function seedFrom(input?: number): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input | 0;
  return (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
}

/** 抽取 [0,1) */
export function randomFrom(state: number): [number, number] {
  return nextRandom(state);
}

export function randInt(state: number, maxExclusive: number): [number, number] {
  const [v, s] = nextRandom(state);
  const max = Math.max(1, Math.floor(maxExclusive));
  return [Math.min(max - 1, Math.floor(v * max)), s];
}

export function shuffleWith<T>(state: number, items: T[]): [T[], number] {
  const arr = items.slice();
  let s = state;
  for (let i = arr.length - 1; i > 0; i--) {
    let j: number;
    [j, s] = randInt(s, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return [arr, s];
}
