/**
 * 数据层适配器（唯一 import '@/data/*' 的地方）
 * ------------------------------------------------------------------
 * 目的：
 * 1) 页面对数据层的调用全部收敛到这里，data-forge 的接口若有出入，只改本文件。
 * 2) 数据层模块尚未就绪 / 个别导出缺失时，本文件降级为直接读取 public/data/*.json，
 *    保证 UI 始终可运行（fallback 不写死任何卡牌内容）。
 *
 * 注意：这里只做「形状归一化」，不承载业务规则。
 */
import type { CardDef } from '@/engine/types';
import * as loadCardsModule from '@/data/loadCards';
import * as deckCodeModule from '@/data/deckcode';
import * as deckRulesModule from '@/data/deckRules';

/* ------------------------------------------------------------------ 类型 */

/** UI 侧使用的卡牌形状：引擎契约 + 数据层可选补充字段 */
export interface UiCard extends CardDef {
  /** 本地卡图路径（可能已含 BASE_URL，也可能只是相对路径） */
  imageLocal?: string;
  /** 数据层可能给的兜底字段名 */
  imageRemote?: string;
}

export interface DeckCardEntry {
  cardId: string;
  count: number;
}

/** 构筑页 / 出图 / 对战共用的卡组数据结构 */
export interface DeckData {
  faction: string;
  allyFaction: string | null;
  cards: DeckCardEntry[];
}

export interface TurnFlags {
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ 基础工具 */

const BASE_URL = import.meta.env.BASE_URL || '/';

/** 把任意（可能未归一化的）URL 拼上部署前缀 */
export function withBase(path: string): string {
  if (!path) return '';
  if (/^(data:|blob:|https?:)/i.test(path)) return path;
  if (path.startsWith(BASE_URL)) return path;
  const clean = path.replace(/^\/+/, '');
  return `${BASE_URL}${clean}`;
}

function modFn<T extends (...args: never[]) => unknown>(mod: unknown, name: string): T | null {
  const fn = (mod as Record<string, unknown> | undefined)?.[name];
  return typeof fn === 'function' ? (fn as unknown as T) : null;
}

function modValue<T>(mod: unknown, name: string): T | null {
  const value = (mod as Record<string, unknown> | undefined)?.[name];
  return value === undefined ? null : (value as T);
}

/* ------------------------------------------------------------------ 卡牌加载 */

interface RawCard {
  card_id?: string;
  import_id?: string;
  name_zh?: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  faction?: string;
  host_factions?: string[];
  is_exile?: boolean;
  type?: string;
  rarity?: string;
  kredits?: number;
  operation_cost?: number;
  attack?: number;
  defense?: number;
  attributes?: string[];
  set?: string;
  pool?: string;
  is_reserved?: boolean;
  is_derived?: boolean;
  image_url?: string;
  image_proxy_url?: string;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** 把原始 API 卡（snake_case）或数据层卡（camelCase）统一成 UiCard */
export function normalizeCard(input: unknown): UiCard {
  const c = (input ?? {}) as Record<string, unknown>;
  const raw = c as RawCard;
  const cardId = String(c.cardId ?? raw.card_id ?? '');
  const imageUrl = (c.imageUrl as string | undefined) ?? raw.image_url;
  const imageProxyUrl = (c.imageProxyUrl as string | undefined) ?? raw.image_proxy_url;
  return {
    cardId,
    importId: (c.importId as string | undefined) ?? raw.import_id,
    nameZh: String(c.nameZh ?? raw.name_zh ?? raw.name_en ?? cardId),
    nameEn: String(c.nameEn ?? raw.name_en ?? cardId),
    description: String(c.description ?? raw.description ?? ''),
    descriptionEn: (c.descriptionEn as string | undefined) ?? raw.description_en,
    faction: String(c.faction ?? raw.faction ?? 'Neutral'),
    hostFactions: asStringArray(c.hostFactions ?? raw.host_factions),
    isExile: Boolean(c.isExile ?? raw.is_exile ?? false),
    type: String(c.type ?? raw.type ?? 'order'),
    rarity: String(c.rarity ?? raw.rarity ?? 'Standard'),
    kredits: Number(c.kredits ?? raw.kredits ?? 0),
    operationCost: Number(c.operationCost ?? raw.operation_cost ?? 0),
    attack: Number(c.attack ?? raw.attack ?? 0),
    defense: Number(c.defense ?? raw.defense ?? 0),
    attributes: asStringArray(c.attributes ?? raw.attributes),
    set: String(c.set ?? raw.set ?? 'Base'),
    pool: String(c.pool ?? raw.pool ?? 'active'),
    isReserved: Boolean(c.isReserved ?? raw.is_reserved ?? false),
    isDerived: Boolean(c.isDerived ?? raw.is_derived ?? false),
    imageUrl,
    imageProxyUrl,
    imageLocal: (c.imageLocal as string | undefined) ?? undefined,
    imageRemote: (c.imageRemote as string | undefined) ?? undefined,
  };
}

let cardsPromise: Promise<UiCard[]> | null = null;
let cardsCache: UiCard[] = [];
let cardById = new Map<string, UiCard>();
let cardByImportId = new Map<string, UiCard>();

/** 直接读取 public/data/cards.json（数据层不可用时的兜底） */
async function fetchRawCards(): Promise<UiCard[]> {
  const res = await fetch(withBase('data/cards.json'));
  if (!res.ok) throw new Error(`cards.json HTTP ${res.status}`);
  const json: unknown = await res.json();
  const list = Array.isArray(json) ? json : ((json as { data?: unknown[] }).data ?? []);
  if (!Array.isArray(list) || list.length === 0) throw new Error('cards.json 为空');
  return list.map(normalizeCard);
}

function indexCards(cards: UiCard[]) {
  cardsCache = cards;
  cardById = new Map(cards.map((c) => [c.cardId, c]));
  cardByImportId = new Map(
    cards.filter((c) => c.importId).map((c) => [String(c.importId), c]),
  );
}

/** 加载全量卡牌（带进程级缓存） */
export function loadAllCards(): Promise<UiCard[]> {
  if (!cardsPromise) {
    cardsPromise = (async () => {
      const loadCards = modFn<() => Promise<unknown>>(loadCardsModule, 'loadCards');
      let cards: UiCard[];
      if (loadCards) {
        try {
          const list = await loadCards();
          cards = Array.isArray(list) ? list.map(normalizeCard) : [];
        } catch {
          cards = [];
        }
      } else {
        cards = [];
      }
      if (!cards.length) cards = await fetchRawCards();
      indexCards(cards);
      return cards;
    })().catch((err: unknown) => {
      cardsPromise = null;
      throw err;
    });
  }
  return cardsPromise;
}

/** 已加载的卡牌（同步） */
export function getLoadedCards(): UiCard[] {
  return cardsCache;
}

/** 同步取卡：优先数据层 getCardSync，其次本地索引 */
export function getCardSync(cardId: string | undefined | null): UiCard | undefined {
  if (!cardId) return undefined;
  const fromLayer = modFn<(id: string) => unknown>(loadCardsModule, 'getCardSync');
  if (fromLayer) {
    try {
      const hit = fromLayer(cardId);
      if (hit) return normalizeCard(hit);
    } catch {
      /* 忽略，落回本地索引 */
    }
  }
  return cardById.get(cardId);
}

export const getCardByImportId = (importId: string) => cardByImportId.get(importId);

/** 卡图候选地址：本地优先，远程代理/转码兜底（逐级 onError 回退） */
export function cardImageSources(card: UiCard): string[] {
  const out: string[] = [];
  const push = (url?: string | null) => {
    if (!url) return;
    const normalized = /^(data:|blob:|https?:)/i.test(url) ? url : withBase(url);
    if (!out.includes(normalized)) out.push(normalized);
  };

  const layerFn = modFn<(c: UiCard) => string>(loadCardsModule, 'cardImageUrl');
  if (layerFn) {
    try {
      push(layerFn(card));
    } catch {
      /* 忽略 */
    }
  }
  push(card.imageLocal);
  const fallbackFn = modFn<(c: UiCard) => string>(loadCardsModule, 'cardImageFallbackUrl');
  if (fallbackFn) {
    try {
      push(fallbackFn(card));
    } catch {
      /* 忽略 */
    }
  }
  push(card.imageProxyUrl);
  push(card.imageRemote);
  push(card.imageUrl);
  // wsrv.nl 图片转码兜底（webp，体积更小；仅在前面全部失败时请求）
  push(
    `https://wsrv.nl/?url=www.kards.com/images/card/v53/zh-Hans/${card.cardId}.avif&output=webp`,
  );
  // 约定路径兜底（public/cards/<card_id>.webp｜.avif）
  push(`cards/${card.cardId}.webp`);
  push(`cards/${card.cardId}.avif`);
  return out;
}

export interface CardBackView {
  id: string;
  name: string;
  imageUrl: string;
  file?: string;
  faction?: string;
}

/** 卡背（对战的同事用，这里做形状归一） */
export function loadCardBacksSafe(): Promise<CardBackView[]> {
  const fn = modFn<() => Promise<unknown>>(loadCardsModule, 'loadCardBacks');
  if (!fn) return Promise.resolve([]);
  return fn()
    .then((list) => {
      const arr = Array.isArray(list) ? list : [];
      return arr.map((item, index) => {
        const rec = (item ?? {}) as Record<string, unknown>;
        const file = typeof rec.file === 'string' ? rec.file : undefined;
        const imageUrlRaw =
          (typeof rec.imageUrl === 'string' && rec.imageUrl) ||
          (file ? withBase(`cardbacks/${file}`) : '') ||
          '';
        return {
          id: String(rec.id ?? index),
          name: String(rec.name ?? `卡背 ${index + 1}`),
          imageUrl: imageUrlRaw,
          file,
          faction: typeof rec.faction === 'string' ? rec.faction : undefined,
        } satisfies CardBackView;
      });
    })
    .catch(() => []);
}

/* ------------------------------------------------------------------ 形状互转 */

/** 数据层（mainFaction）→ UI 层（faction） */
export function toLayerDeck(data: DeckData): {
  mainFaction: string;
  allyFaction: string | null;
  cards: DeckCardEntry[];
} {
  return {
    mainFaction: data.faction,
    allyFaction: data.allyFaction,
    cards: data.cards.map((c) => ({ cardId: c.cardId, count: c.count })),
  };
}

/* ------------------------------------------------------------------ 卡组编解码 */

function extractDeckCode(text: string): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  // 支持整段 URL / ?deck_code=xxx / 纯 code
  const match = /(?:^|[?&#])(?:deck_code|deckCode|code)=([^&#\s]+)/.exec(trimmed);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const code = url.searchParams.get('deck_code') ?? url.searchParams.get('code');
      if (code) return code.trim();
    } catch {
      /* 忽略 */
    }
  }
  // 去掉可能的 "deck:" 前缀与空白
  return trimmed.replace(/^deck[:：]\s*/i, '').replace(/\s+/g, '');
}

function normalizeCount(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 9) : 0;
}

interface RawDeckLike {
  faction?: unknown;
  mainFaction?: unknown;
  allyFaction?: unknown;
  ally_faction?: unknown;
  ally?: unknown;
  cards?: unknown;
  entries?: unknown;
  deck?: unknown;
}

/** 把数据层返回的卡组形状归一化，并把 importId 解析回 cardId */
function normalizeDeck(raw: unknown): DeckData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as RawDeckLike;
  const factionRaw = d.faction ?? d.mainFaction;
  if (factionRaw === undefined || factionRaw === null) return null;
  const allyRaw = d.allyFaction ?? d.ally_faction ?? d.ally ?? null;
  const listRaw = (d.cards ?? d.entries ?? d.deck ?? []) as unknown;
  const list = Array.isArray(listRaw) ? listRaw : [];
  const cards: DeckCardEntry[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const lower = item.toLowerCase();
      // KARDS 文本卡组常见格式：3x123 或 3 card_id
      const m = /^(\d+)\s*[x×*]\s*(\S+)$/i.exec(item);
      if (m) {
        const count = normalizeCount(m[1]);
        const card = getCardSync(m[2]) ?? getCardByImportId(m[2]);
        if (card && count) cards.push({ cardId: card.cardId, count });
        continue;
      }
      const card = getCardSync(item) ?? getCardByImportId(item);
      if (card) cards.push({ cardId: card.cardId, count: 1 });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const idRaw = rec.cardId ?? rec.card_id ?? rec.importId ?? rec.import_id ?? rec.id;
    const count = normalizeCount(rec.count ?? rec.quantity ?? rec.copies ?? 1);
    if (!idRaw || !count) continue;
    const id = String(idRaw);
    const card = getCardSync(id) ?? getCardByImportId(id);
    // 解析不到卡就保留原始 id，页面会显示为缺失卡
    cards.push({ cardId: card?.cardId ?? id, count });
  }
  if (!cards.length) return null;
  return {
    faction: String(factionRaw),
    allyFaction: allyRaw ? String(allyRaw) : null,
    cards,
  };
}

/** 编码卡组 → deck code；失败返回 null */
export function encodeDeck(data: DeckData): string | null {
  const fn = modFn<(deck: unknown) => unknown>(deckCodeModule, 'encodeDeckCode');
  if (!fn) return null;
  try {
    const result = fn(toLayerDeck(data));
    if (typeof result === 'string' && result.trim()) return result.trim();
    if (result && typeof result === 'object') {
      const rec = result as Record<string, unknown>;
      const code = rec.code ?? rec.deckCode ?? rec.value;
      if (typeof code === 'string' && code.trim()) return code.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/** 解码 deck code / URL → 卡组数据；失败返回 null（会先确保卡牌已加载，便于 importId 反查） */
export async function decodeDeck(input: string): Promise<DeckData | null> {
  const code = extractDeckCode(input);
  if (!code) return null;
  await loadAllCards().catch(() => undefined);

  const decode = modFn<(c: string) => unknown>(deckCodeModule, 'decodeDeckCode');
  const decodeSafe = modFn<(c: string) => unknown>(deckCodeModule, 'decodeDeckCodeSafe');

  if (decodeSafe) {
    try {
      const safeResult = decodeSafe(code) as unknown;
      if (typeof safeResult === 'string') {
        const direct = normalizeDeck(decode?.(safeResult));
        if (direct) return direct;
      } else if (safeResult && typeof safeResult === 'object') {
        const rec = safeResult as Record<string, unknown>;
        if (rec.ok === false || rec.success === false) return null;
        const candidate = rec.deck ?? rec.data ?? rec.value ?? rec.result ?? safeResult;
        const normalized = normalizeDeck(candidate);
        if (normalized) return normalized;
      } else if (safeResult === true && decode) {
        // 极少见：safe 只返回布尔，则回落到 decodeDeckCode
      }
    } catch {
      /* 落到 decodeDeckCode */
    }
  }

  if (decode) {
    try {
      return normalizeDeck(decode(code));
    } catch {
      return null;
    }
  }
  return null;
}

/** 只用同步编解码路径（构筑页已在内存里，避免 await） */
export function decodeDeckSync(input: string): DeckData | null {
  const code = extractDeckCode(input);
  if (!code) return null;
  const decodeSafe = modFn<(c: string) => unknown>(deckCodeModule, 'decodeDeckCodeSafe');
  const decode = modFn<(c: string) => unknown>(deckCodeModule, 'decodeDeckCode');
  for (const fn of [decodeSafe, decode]) {
    if (!fn) continue;
    try {
      const result = fn(code);
      if (typeof result === 'string') {
        const normalized = normalizeDeck(decode?.(result));
        if (normalized) return normalized;
        continue;
      }
      if (result && typeof result === 'object') {
        const rec = result as Record<string, unknown>;
        if (rec.ok === false || rec.success === false) continue;
        const normalized = normalizeDeck(rec.deck ?? rec.data ?? rec.value ?? rec.result ?? result);
        if (normalized) return normalized;
      }
    } catch {
      /* 继续尝试下一个 */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ 构筑规则 */

export interface DeckRuleSet {
  /** 卡组目标张数（KARDS 标准 39） */
  deckSize: number;
  /** 卡组最小张数 */
  minDeckSize: number;
  /** 同名卡上限 */
  maxCopies: number;
  /** 精英卡上限 */
  maxElite: number;
  /** 盟军卡上限（undefined = 不限制） */
  maxAllyCards?: number;
  /** 原始规则对象，便于未来扩展 */
  raw: Record<string, unknown>;
}

const RAW_RULES: Record<string, unknown> =
  (modValue<Record<string, unknown>>(deckRulesModule, 'DECK_RULES') as Record<string, unknown> | null) ?? {};

function pickNumber(source: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const n = Number(source[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

/** 读数据层 DECK_RULES，键名不确定时按已知候选回退到 KARDS 标准值 */
export const DECK_RULES_VIEW: DeckRuleSet = (() => {
  // KARDS 标准 = 39 张（data-forge 用 1000+ 公开卡组统计确认）
  const deckSize = pickNumber(RAW_RULES, ['deckSize', 'maxCards', 'size', 'total', 'cardsCount'], 39);
  const minDeckSize = pickNumber(RAW_RULES, ['minDeckSize', 'deckSize', 'minCards'], deckSize);
  const maxCopies = pickNumber(RAW_RULES, ['maxCopies', 'copyLimit', 'maxSame', 'copies'], 4);
  const maxElite = pickNumber(RAW_RULES, ['maxElite', 'eliteCopies', 'eliteLimit', 'maxEliteCopies'], 1);
  const allyRaw = RAW_RULES.maxAllyCards ?? RAW_RULES.allyLimit ?? RAW_RULES.maxAlly;
  const maxAllyCards = Number.isFinite(Number(allyRaw)) && Number(allyRaw) > 0 ? Number(allyRaw) : undefined;
  return { deckSize, minDeckSize, maxCopies, maxElite, maxAllyCards, raw: RAW_RULES };
})();

export interface DeckValidationView {
  legal: boolean;
  errors: string[];
  warnings: string[];
}

function toStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          const rec = v as Record<string, unknown>;
          return String(rec.message ?? rec.text ?? rec.error ?? rec.reason ?? '');
        }
        return '';
      })
      .filter(Boolean);
  }
  return [];
}

/** 调数据层 validateDeck 并归一化返回结构；数据层不可用时返回 null（调用方自行兜底） */
export function validateDeckWithLayer(data: DeckData): DeckValidationView | null {
  const fn = modFn<(deck: unknown) => unknown>(deckRulesModule, 'validateDeck');
  if (!fn) return null;
  try {
    const result = fn(toLayerDeck(data));
    if (typeof result === 'boolean') {
      return { legal: result, errors: result ? [] : ['卡组不合法'], warnings: [] };
    }
    if (typeof result === 'string') {
      return { legal: !result, errors: result ? [result] : [], warnings: [] };
    }
    if (result && typeof result === 'object') {
      const rec = result as Record<string, unknown>;
      const errors = toStringList(rec.errors ?? rec.problems ?? rec.error ?? rec.issues);
      const warnings = toStringList(rec.warnings ?? rec.notes);
      const legalRaw = rec.valid ?? rec.ok ?? rec.legal ?? (errors.length === 0);
      return { legal: Boolean(legalRaw), errors, warnings };
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ 热门卡组 */

export interface FeaturedDeck {
  id: string;
  name: string;
  faction: string;
  allyFaction: string | null;
  description?: string;
  author?: string;
  views?: number;
  deckCode?: string;
  /** 直接给出卡牌清单时优先使用（无需解码） */
  deck?: DeckData | null;
  raw: Record<string, unknown>;
}

let featuredPromise: Promise<FeaturedDeck[]> | null = null;

function normalizeFeatured(input: unknown): FeaturedDeck | null {
  if (!input || typeof input !== 'object') return null;
  const rec = input as Record<string, unknown>;
  const deckCodeRaw = rec.deckCode ?? rec.deck_code ?? rec.code ?? rec.shareCode;
  const deckCode = typeof deckCodeRaw === 'string' ? deckCodeRaw : undefined;
  const name = String(rec.name ?? rec.title ?? rec.slug ?? '未命名战斗群');
  const faction = String(rec.faction ?? rec.mainFaction ?? rec.nation ?? 'Germany');
  const allyRaw = rec.allyFaction ?? rec.ally_faction ?? rec.ally ?? null;
  const cardsRaw = rec.cards ?? rec.deckCards ?? rec.cardList;
  let deck: DeckData | null = normalizeDeck({
    faction,
    allyFaction: allyRaw,
    cards: cardsRaw,
  });
  if (!deck && deckCode) {
    const decoded = decodeDeckSync(deckCode) ?? null;
    deck = decoded;
  }
  const id = String(rec.id ?? rec.slug ?? name);
  return {
    id,
    name,
    faction,
    allyFaction: allyRaw ? String(allyRaw) : (deck?.allyFaction ?? null),
    description: typeof rec.description === 'string' ? rec.description : undefined,
    author: typeof rec.author === 'string' ? rec.author : undefined,
    views: Number.isFinite(Number(rec.views ?? rec.likes ?? rec.likeCount))
      ? Number(rec.views ?? rec.likes ?? rec.likeCount)
      : undefined,
    deckCode,
    deck,
    raw: rec,
  };
}

/** 读取 public/data/featured-decks.json；缺失/格式异常时返回空数组（页面优雅隐藏） */
export function loadFeaturedDecks(): Promise<FeaturedDeck[]> {
  if (!featuredPromise) {
    featuredPromise = (async () => {
      try {
        const res = await fetch(withBase('data/featured-decks.json'), { cache: 'no-cache' });
        if (!res.ok) return [];
        const json: unknown = await res.json();
        const list = Array.isArray(json)
          ? json
          : ((json as { decks?: unknown[] }).decks ?? (json as { data?: unknown[] }).data ?? []);
        if (!Array.isArray(list)) return [];
        // 需要卡牌索引才能解析 importId
        await loadAllCards().catch(() => undefined);
        return list.map(normalizeFeatured).filter((d): d is FeaturedDeck => Boolean(d));
      } catch {
        return [];
      }
    })();
  }
  return featuredPromise;
}

/** 出图 URL（保留 App.tsx 的 ?action= 兼容协议） */
export function buildOverviewUrl(action: string, deckCode: string): string {
  const params = new URLSearchParams({ action, deck_code: deckCode });
  return `${BASE_URL}?${params.toString()}`;
}
