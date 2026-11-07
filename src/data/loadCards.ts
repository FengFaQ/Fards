/**
 * loadCards.ts — 卡牌/卡背/热门卡组数据的加载与索引
 * ------------------------------------------------------------------
 * 纯 TS、无框架依赖，React 页面与游戏引擎（node/vitest）都能直接用。
 * 数据文件由 scripts/fetch-cards.mjs / fetch-images.mjs / fetch-decks.mjs 生成：
 *   public/data/cards.json          1646 张卡（camelCase，字段见 ./types.ts Card）
 *   public/data/cardbacks.json      卡背清单
 *   public/data/featured-decks.json 热门卡组
 *   public/data/image-missing.json  卡图缺失清单（本地文件不可用时回退远程）
 *
 * 约定：
 * - 所有 URL 都带 `import.meta.env.BASE_URL` 前缀，返回即可直接用于 <img src>。
 * - loadCards() 内部缓存 Promise，重复调用不会重复请求；失败会 console.error 并抛出。
 */

import type { Card, CardBack, CardsMeta, DeckCard, FeaturedDeck } from './types';
import { normalizeFactionName } from './types';

/* ============================================================
 * 1. BASE_URL / 路径
 * ============================================================ */

function readBaseUrl(): string {
  try {
    // vite 注入；非 vite 环境（纯 node 脚本）退化为 '/'
    const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
    const base = env?.BASE_URL;
    if (typeof base === 'string' && base.length) return base;
  } catch {
    /* ignore */
  }
  return '/';
}

const BASE_URL = readBaseUrl();

/** 把 `/data/cards.json` 之类的绝对路径拼到部署 base 上 */
export function withBase(path: string): string {
  const base = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  const rel = path.replace(/^\/+/, '');
  return `${base}${rel}`;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const url = withBase(path);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`加载 ${url} 失败：HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/* ============================================================
 * 2. 缓存
 * ============================================================ */

let cardsPromise: Promise<Card[]> | null = null;
let cardsCache: Card[] | null = null;
let cardIndex: Map<string, Card> | null = null;

let cardBacksPromise: Promise<CardBack[]> | null = null;
let featuredPromise: Promise<FeaturedDeck[]> | null = null;

let missingImageIds: Set<string> | null = null;
let missingImagePromise: Promise<Set<string>> | null = null;

/** 清空缓存（测试 / 热更新用） */
export function clearDataCache(): void {
  cardsPromise = null;
  cardsCache = null;
  cardIndex = null;
  cardBacksPromise = null;
  featuredPromise = null;
  missingImageIds = null;
  missingImagePromise = null;
}

/* ============================================================
 * 3. 卡牌
 * ============================================================ */

/** 规范化单张卡：补齐 imageLocal / imageRemote / keywordsNormalized，URL 拼上 base */
function normalizeCard(raw: Partial<Card> & { cardId?: string; card_id?: string }): Card {
  const cardId = String(raw.cardId ?? raw.card_id ?? '');
  const imageLocalRaw = String(raw.imageLocal ?? `/cards/${cardId}.webp`);
  const imageRemote = String(raw.imageRemote ?? wsrvImageUrl(raw.imageUrl) ?? raw.imageProxyUrl ?? '');
  const card = {
    ...raw,
    cardId,
    imageLocal: withBase(imageLocalRaw),
    imageRemote,
    keywordsNormalized: Array.isArray(raw.keywordsNormalized) ? raw.keywordsNormalized : [],
  } as Card;
  return card;
}

/**
 * 加载全部卡牌（带缓存）。
 * @throws 加载/解析失败时抛出（同时 console.error）
 */
export async function loadCards(): Promise<Card[]> {
  if (cardsCache) return cardsCache;
  if (!cardsPromise) {
    cardsPromise = (async () => {
      try {
        const raw = await fetchJSON<unknown>('data/cards.json');
        if (!Array.isArray(raw)) throw new Error('cards.json 格式错误：应为数组');
        const cards = (raw as Array<Partial<Card>>).map(normalizeCard);
        if (!cards.length) throw new Error('cards.json 为空');
        // 索引
        const index = new Map<string, Card>();
        for (const card of cards) index.set(card.cardId, card);
        cardsCache = cards;
        cardIndex = index;
        // 后台补充缺失卡图清单（非阻塞、失败不致命）
        void loadMissingImageIds();
        return cards;
      } catch (err) {
        cardsPromise = null;
        console.error('[loadCards] 卡牌数据加载失败：', err);
        throw err;
      }
    })();
  }
  return cardsPromise;
}

/** 同步取卡（须先 await loadCards()；未加载时返回 undefined） */
export function getCardSync(cardId: string): Card | undefined {
  return cardIndex?.get(cardId);
}

/** 同步取全部卡（未加载时返回空数组） */
export function getAllCardsSync(): Card[] {
  return cardsCache ?? [];
}

/** cardId → Card 索引（未加载时返回空 Map） */
export function getCardIndex(): Map<string, Card> {
  return cardIndex ?? new Map<string, Card>();
}

/** 数据集元信息（public/data/meta.json） */
export async function loadCardsMeta(): Promise<CardsMeta> {
  return fetchJSON<CardsMeta>('data/meta.json');
}

/* ============================================================
 * 4. 卡图 URL
 * ============================================================ */

/** wsrv.nl 代理（解决 AVIF 兼容/CORS，实测比官方 img-proxy 快一个数量级） */
export function wsrvImageUrl(rawUrl: string | undefined, width = 400): string {
  if (!rawUrl) return '';
  const stripped = rawUrl.replace(/^https?:\/\//, '');
  return `https://wsrv.nl/?url=${encodeURIComponent(stripped)}&output=webp&w=${width}`;
}

async function loadMissingImageIds(): Promise<Set<string>> {
  if (missingImageIds) return missingImageIds;
  if (!missingImagePromise) {
    missingImagePromise = (async () => {
      try {
        const payload = await fetchJSON<{ missingCards?: Array<{ cardId?: string; card_id?: string }> }>(
          'data/image-missing.json'
        );
        const set = new Set<string>();
        for (const item of payload?.missingCards ?? []) {
          const id = item?.cardId ?? item?.card_id;
          if (id) set.add(id);
        }
        missingImageIds = set;
        return set;
      } catch {
        // 没有该文件（尚未跑过 fetch-images）视为"本地图齐全"
        missingImageIds = new Set<string>();
        return missingImageIds;
      }
    })();
  }
  return missingImagePromise;
}

/** 远程回退地址：wsrv(webp) → imageProxyUrl → imageUrl */
export function cardImageFallbackUrl(card: Pick<Card, 'imageUrl' | 'imageProxyUrl'>): string {
  if (card.imageUrl) return wsrvImageUrl(card.imageUrl);
  return card.imageProxyUrl ?? '';
}

/**
 * 卡图 URL：本地优先（public/cards/<cardId>.webp），
 * 若已知该卡本地缺失则回退远程（wsrv.nl）。
 * UI 仍建议给 <img onError> 挂 `cardImageFallbackUrl(card)` 兜底。
 */
export function cardImageUrl(card: Card): string {
  const missing = missingImageIds;
  if (missing && missing.has(card.cardId)) {
    const fallback = cardImageFallbackUrl(card);
    if (fallback) return fallback;
  }
  if (card.imageLocal) return card.imageLocal;
  return cardImageFallbackUrl(card);
}

/* ============================================================
 * 5. 卡背 / 热门卡组
 * ============================================================ */

/** 卡背列表（public/data/cardbacks.json） */
export async function loadCardBacks(): Promise<CardBack[]> {
  if (!cardBacksPromise) {
    cardBacksPromise = (async () => {
      try {
        const payload = await fetchJSON<{ data?: CardBack[] } | CardBack[]>('data/cardbacks.json');
        const list = Array.isArray(payload) ? payload : (payload?.data ?? []);
        return list.map((back) => {
          const file = back.file ?? '';
          const localUrl = file ? withBase(`cardbacks/${file}`) : '';
          return {
            id: back.id,
            name: back.name,
            file,
            imageUrl: localUrl || back.imageUrl,
            remoteUrl: back.imageUrl,
          };
        });
      } catch (err) {
        console.error('[loadCardBacks] 卡背数据加载失败：', err);
        throw err;
      }
    })();
  }
  return cardBacksPromise;
}

/** 精选/热门卡组（public/data/featured-decks.json） */
export async function loadFeaturedDecks(): Promise<FeaturedDeck[]> {
  if (!featuredPromise) {
    featuredPromise = (async () => {
      const list = await fetchJSON<FeaturedDeck[]>('data/featured-decks.json');
      return Array.isArray(list) ? list : [];
    })().catch((err) => {
      console.error('[loadFeaturedDecks] 热门卡组加载失败：', err);
      featuredPromise = null;
      return [] as FeaturedDeck[];
    });
  }
  return featuredPromise;
}

/* ============================================================
 * 6. 便捷索引 / 排序（UI 常用，纯函数）
 * ============================================================ */

/** 按阵营分组 */
export function groupByFaction(cards: Card[]): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  for (const card of cards) {
    const key = normalizeFactionName(card.faction);
    const list = map.get(key);
    if (list) list.push(card);
    else map.set(key, [card]);
  }
  return map;
}

/** 按类型分组（infantry/tank/order/…） */
export function groupByType(cards: Card[]): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  for (const card of cards) {
    const list = map.get(card.type);
    if (list) list.push(card);
    else map.set(card.type, [card]);
  }
  return map;
}

/** 按费用（kredits）排序，默认升序；同费用按名称 */
export function sortByKredits(cards: Card[], direction: 'asc' | 'desc' = 'asc'): Card[] {
  const dir = direction === 'desc' ? -1 : 1;
  return [...cards].sort(
    (a, b) => dir * ((a.kredits ?? 0) - (b.kredits ?? 0)) || String(a.nameZh).localeCompare(String(b.nameZh), 'zh-Hans-CN')
  );
}

/** 过滤某阵营可用卡（主阵营 + 盟军，按 hostFactions 判定） */
export function cardsForFaction(cards: Card[], faction: string): Card[] {
  const target = normalizeFactionName(faction);
  return cards.filter((card) => {
    const own = normalizeFactionName(card.faction);
    if (own === target) return true;
    const hosts = (card.hostFactions ?? []).map((f) => normalizeFactionName(String(f)));
    if (hosts.includes(target)) return true;
    return own === 'Neutral';
  });
}

/** 卡组统计（不依赖 deckRules，纯展示用） */
export function summarizeDeck(deck: { cards: DeckCard[] }, cards?: Map<string, Card>): {
  total: number;
  byType: Record<string, number>;
  byKredits: Record<number, number>;
  units: number;
  orders: number;
  elite: number;
} {
  const byType: Record<string, number> = {};
  const byKredits: Record<number, number> = {};
  let total = 0;
  let units = 0;
  let orders = 0;
  let elite = 0;
  const index = cards ?? getCardIndex();
  for (const item of deck.cards ?? []) {
    const card = index.get(item.cardId);
    const count = Number(item.count) || 0;
    total += count;
    const type = card?.type ?? 'unknown';
    byType[type] = (byType[type] ?? 0) + count;
    const kr = Number(card?.kredits ?? 0);
    byKredits[kr] = (byKredits[kr] ?? 0) + count;
    if (['infantry', 'tank', 'artillery', 'fighter', 'bomber', 'destroyer', 'battleship'].includes(type)) units += count;
    else orders += count;
    if (card?.rarity === 'Elite') elite += count;
  }
  return { total, byType, byKredits, units, orders, elite };
}
