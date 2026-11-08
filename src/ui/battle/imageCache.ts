/**
 * 卡图预缓存（对局开局前把卡图抓成 blob，渲染走 objectURL，避免进入战场时一张张掉图）
 * ------------------------------------------------------------------
 * 设计要点：
 * 1) 候选地址完全复用 dataBridge.cardImageSources(card)（本地 → 远程代理 → wsrv → 约定路径）；
 * 2) 单图超时默认 8s，失败/超时计入 failed，绝不阻塞其它图；
 * 3) 并发默认 6，重复 cardId 去重（含同一时刻的并发请求复用同一个 Promise）；
 * 4) releaseImageCache() revoke 全部 objectURL 并清空 Map/Promise；正在进行的请求会被 abort，
 *    且用 generation 让“已释放之后的返回结果”直接丢弃（避免对局结束后缓存又被后台任务填满）；
 * 5) 对外暴露 getCachedCardImage(cardId) 给渲染层做「缓存优先 + 原多级兜底」；
 *    subscribeCardImage(cardId, cb) 让已经挂载的 <img> 在后台预载完成 / 缓存释放时自动换源。
 * 6) 缓存状态挂在 globalThis 上（页面级单例）：开发期 HMR 可能产生重复模块实例，
 *    如果状态在每个实例里，release 只清自己那份、window.__fardsImageCacheStats 又会读到另一份，
 *    表现就是「对局结束后 cached 不归零」。共享状态让所有实例指向同一份缓存。
 */
import { cardImageSources, getCardSync } from '../lib/dataBridge';

export interface PreloadOptions {
  /** 并发数（默认 6） */
  concurrency?: number;
  /** 单张图超时（默认 8000ms） */
  timeoutMs?: number;
  /** 进度回调：done 为已完成张数（成功 + 失败），total 为去重后总数 */
  onProgress?: (done: number, total: number) => void;
}

export interface PreloadResult {
  ok: number;
  failed: number;
}

export interface ImageCacheStats {
  cached: number;
  pending: number;
  bytes: number;
}

interface CacheState {
  /** cardId → objectURL */
  urls: Map<string, string>;
  /** cardId → blob 字节数（仅用于 stats） */
  blobBytes: Map<string, number>;
  /** cardId → 进行中的预载 Promise（去重，多调用方共享） */
  inflight: Map<string, Promise<string | null>>;
  /** 渲染层订阅：cardId → 回调集合 */
  listeners: Map<string, Set<() => void>>;
  /** 进行中的 fetch 控制器，release 时统一 abort */
  controllers: Set<AbortController>;
  /** 缓存代际：release 时自增，用于丢弃旧任务的结果 */
  generation: number;
  totalBytes: number;
}

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_TIMEOUT_MS = 8000;
const STATE_KEY = '__fardsImageCacheState';

/** 取页面级共享缓存状态（HMR 重复模块实例也共享同一份） */
function sharedCacheState(): CacheState {
  const host = globalThis as unknown as Record<string, unknown>;
  let cache = host[STATE_KEY] as CacheState | undefined;
  if (!cache) {
    cache = {
      urls: new Map<string, string>(),
      blobBytes: new Map<string, number>(),
      inflight: new Map<string, Promise<string | null>>(),
      listeners: new Map<string, Set<() => void>>(),
      controllers: new Set<AbortController>(),
      generation: 0,
      totalBytes: 0,
    };
    host[STATE_KEY] = cache;
  }
  return cache;
}

const cache = sharedCacheState();

function notify(cardId: string): void {
  const set = cache.listeners.get(cardId);
  if (!set) return;
  for (const callback of Array.from(set)) {
    try {
      callback();
    } catch {
      /* 忽略单个订阅者的异常 */
    }
  }
}

/**
 * 订阅某张卡图的缓存状态变化（命中 / 释放）。
 * 返回取消订阅函数。CardFace 用它把网络地址平滑换成 objectURL。
 */
export function subscribeCardImage(cardId: string, callback: () => void): () => void {
  if (!cardId) return () => undefined;
  let set = cache.listeners.get(cardId);
  if (!set) {
    set = new Set();
    cache.listeners.set(cardId, set);
  }
  set.add(callback);
  return () => {
    const current = cache.listeners.get(cardId);
    if (!current) return;
    current.delete(callback);
    if (current.size === 0) cache.listeners.delete(cardId);
  };
}

/** 已缓存的 objectURL；未命中返回 null */
export function getCachedCardImage(cardId: string): string | null {
  if (!cardId) return null;
  return cache.urls.get(cardId) ?? null;
}

/** 缓存统计（QA 可经 window.__fardsImageCacheStats() 读取） */
export function imageCacheStats(): ImageCacheStats {
  return { cached: cache.urls.size, pending: cache.inflight.size, bytes: cache.totalBytes };
}

interface LoadedImage {
  url: string;
  bytes: number;
}

/** 取单个候选 URL（带超时 + abort）；失败返回 null */
async function fetchCandidate(url: string, timeoutMs: number): Promise<Blob | null> {
  const controller = new AbortController();
  cache.controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'force-cache',
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    // SPA fallback 会把 404 变成 index.html（text/html），这类响应不能当卡图用
    if (contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
      return null;
    }
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    // 超时（abort）/ 网络错误 / CORS → 交给下一个候选地址
    return null;
  } finally {
    clearTimeout(timer);
    cache.controllers.delete(controller);
  }
}

/** 依次尝试候选地址，命中就 createObjectURL */
async function loadCardImage(cardId: string, timeoutMs: number): Promise<LoadedImage | null> {
  const card = getCardSync(cardId);
  if (!card) return null;
  const sources = cardImageSources(card);
  for (const url of sources) {
    const blob = await fetchCandidate(url, timeoutMs);
    if (!blob) continue;
    try {
      return { url: URL.createObjectURL(blob), bytes: blob.size };
    } catch {
      return null;
    }
  }
  return null;
}

/** 确保某张卡图已缓存（命中直接返回；进行中复用；否则发起预载） */
function ensureCardImage(cardId: string, timeoutMs: number): Promise<string | null> {
  const hit = cache.urls.get(cardId);
  if (hit) return Promise.resolve(hit);
  const running = cache.inflight.get(cardId);
  if (running) return running;

  const startedGeneration = cache.generation;
  // taskSlot 用于 finally 里判断「当前 inflight 是否仍是本任务」（避免清掉新一代的请求）
  const taskSlot: { current: Promise<string | null> | null } = { current: null };
  const task = (async (): Promise<string | null> => {
    try {
      const loaded = await loadCardImage(cardId, timeoutMs);
      if (!loaded) return null;
      // 期间缓存被释放 / 被别的任务抢先写入 → 丢弃或复用
      if (startedGeneration !== cache.generation) {
        URL.revokeObjectURL(loaded.url);
        return null;
      }
      const existing = cache.urls.get(cardId);
      if (existing) {
        URL.revokeObjectURL(loaded.url);
        return existing;
      }
      cache.urls.set(cardId, loaded.url);
      cache.blobBytes.set(cardId, loaded.bytes);
      cache.totalBytes += loaded.bytes;
      notify(cardId);
      return loaded.url;
    } catch {
      return null;
    } finally {
      if (cache.inflight.get(cardId) === taskSlot.current) cache.inflight.delete(cardId);
    }
  })();
  taskSlot.current = task;
  cache.inflight.set(cardId, task);
  return task;
}

/**
 * 预载一批卡图（重复 cardId 自动去重）。
 * 失败/超时不影响其它图，也不 reject；返回 { ok, failed }。
 */
export function preloadCardImages(
  cardIds: string[],
  opts: PreloadOptions = {},
): Promise<PreloadResult> {
  const unique: string[] = [];
  for (const id of cardIds ?? []) {
    if (!id || typeof id !== 'string') continue;
    if (!unique.includes(id)) unique.push(id);
  }
  const total = unique.length;
  if (total === 0) return Promise.resolve({ ok: 0, failed: 0 });

  const concurrency = Math.max(
    1,
    Math.min(12, Math.floor(opts.concurrency ?? DEFAULT_CONCURRENCY) || DEFAULT_CONCURRENCY),
  );
  const timeoutMs = Math.max(500, Math.floor(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const startedGeneration = cache.generation;
  const report = opts.onProgress;
  let cursor = 0;
  let done = 0;
  let ok = 0;
  let failed = 0;

  try {
    report?.(0, total);
  } catch {
    /* 忽略进度回调异常 */
  }

  return new Promise<PreloadResult>((resolve) => {
    const worker = async (): Promise<void> => {
      for (;;) {
        if (startedGeneration !== cache.generation) return; // 缓存已释放 → 停止
        const index = cursor;
        cursor += 1;
        if (index >= unique.length) return;
        const cardId = unique[index];
        const url = await ensureCardImage(cardId, timeoutMs);
        if (startedGeneration !== cache.generation) return;
        done += 1;
        if (url) ok += 1;
        else failed += 1;
        try {
          report?.(done, total);
        } catch {
          /* 忽略 */
        }
      }
    };
    const workerCount = Math.min(concurrency, unique.length);
    void Promise.all(Array.from({ length: workerCount }, () => worker())).then(() =>
      resolve({ ok, failed }),
    );
  });
}

/**
 * 释放全部缓存：revoke objectURL、清空 Map / Promise、abort 进行中的请求。
 * 对局结束 / 离开战场 / 再来一局时调用。
 */
export function releaseImageCache(): void {
  cache.generation += 1;
  for (const controller of Array.from(cache.controllers)) {
    try {
      controller.abort();
    } catch {
      /* 忽略 */
    }
  }
  cache.controllers.clear();
  for (const url of cache.urls.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* 忽略 */
    }
  }
  cache.urls.clear();
  cache.blobBytes.clear();
  cache.inflight.clear();
  cache.totalBytes = 0;
  // 通知所有订阅者：缓存失效，请回退到网络地址
  for (const cardId of Array.from(cache.listeners.keys())) notify(cardId);
}

/* ------------------------------------------------------------------ QA 入口 */

if (typeof window !== 'undefined') {
  const debugWindow = window as unknown as Record<string, unknown>;
  debugWindow.__fardsImageCacheStats = imageCacheStats;
  debugWindow.__fardsImageCache = {
    stats: imageCacheStats,
    get: getCachedCardImage,
    preload: preloadCardImages,
    release: releaseImageCache,
  };
}
