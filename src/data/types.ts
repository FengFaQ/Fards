/**
 * Fards 数据层类型（src/data/types.ts）
 * ------------------------------------------------------------------
 * 这里是"数据集"的对外契约：卡牌、卡背、卡组、卡组码解码结果、展示用统计。
 * 卡牌的**基础字段**复用引擎契约 src/engine/types.ts 的 `CardDef`，
 * 避免 UI / 引擎各立一套同名类型（见 docs/DECK_CODEC.md、docs/DECK_RULES.md）。
 *
 * 数据来源：https://1939.kardsdecker.com/api/v1/cards → public/data/cards.json（camelCase）
 * 生成脚本：scripts/fetch-cards.mjs；Codec：src/data/deckcode.ts
 */

import type { CardDef, CardType, Faction, Rarity } from '@/engine/types';

/* ============================================================
 * 1. 卡牌 / 卡背
 * ============================================================ */

/**
 * 运行时卡牌定义：CardDef（引擎契约） + 数据层补充字段。
 * cards.json 里的字段与之一一对应（camelCase）。
 */
export interface Card extends CardDef {
  /**
   * 本地卡图 URL（**已含部署 base**，可直接作为 <img src> 使用）。
   * 例：base='/' → `/cards/gb_xxx.webp`；base='/Fards/' → `/Fards/cards/gb_xxx.webp`。
   * 文件缺失时请用 `cardImageFallbackUrl(card)`（或 <img onError>）回退到远程。
   */
  imageLocal: string;
  /**
   * 归一化关键字（由 API `attributes` 推出，去掉了 `BecomesVeteran:*` / `VeteranOf:*` /
   * `OnlySpawnable` 这类数据标记，并把 `heavyArmor1`/`intel2` 等带等级关键字归一为基名）。
   */
  keywordsNormalized?: string[];
}

/** 卡背（装饰用，来自 /api/v1/card-backs） */
export interface CardBack {
  /** 原始 id，形如 `CardBacks_Resized/16th_pz_a.png` */
  id: string;
  name: string;
  /** 可直接使用的图片 URL（本地已下载则指向本地，否则为远程） */
  imageUrl: string;
  /** 本地文件名（public/cardbacks/ 下），无本地文件时为空串 */
  file: string;
  /** 远程原始地址（本地加载失败时回退用） */
  remoteUrl?: string;
}

/* ============================================================
 * 2. 卡组
 * ============================================================ */

/** 卡组中的一张卡及其副本数（1~4） */
export interface DeckCard {
  cardId: string;
  count: number;
}

/** 卡组。`deckCode` 为官方 deck code（`%%51|...`），可缺省（构筑中未导出时） */
export interface Deck {
  name?: string;
  description?: string;
  author?: string;
  mainFaction: Faction;
  allyFaction: Faction | null;
  cards: DeckCard[];
  deckCode?: string;
}

/**
 * 卡组合法性口径：
 * - standard：天梯/常规构筑（主阵营 + 至多 1 个盟军，39 张）
 * - reserve：含预备池（reserve / is_reserved）卡牌的构筑
 * - draft：竞技场/轮抽等临时规则
 */
export type DeckFormat = 'standard' | 'reserve' | 'draft';

/** 卡组统计（构筑页右侧面板用） */
export interface DeckStats {
  total: number;
  byType: Record<string, number>;
  byKredits: Record<number, number>;
  units: number;
  orders: number;
  elite: number;
  /** 主阵营卡牌数（含中立/通用卡） */
  mainFactionCards: number;
  /** 盟军卡牌数 */
  allyFactionCards: number;
}

/* ============================================================
 * 3. 卡组广场（public/data/featured-decks.json）
 * ============================================================ */

export interface FeaturedDeck {
  /** 卡组唯一 slug（对应 API share_slug / id） */
  slug: string;
  name: string;
  author: string | null;
  mainFaction: Faction;
  allyFaction: Faction | null;
  /** 官方 deck code，可直接喂给 decodeDeckCode */
  deckCode: string;
  cards: DeckCard[];
  likes: number;
  tags: string[];
}

/* ============================================================
 * 4. 数据集元信息（public/data/meta.json）
 * ============================================================ */

export interface CardsMeta {
  source: string;
  fetchedAt: string;
  apiTotal: number;
  uniqueCount: number;
  stats: {
    faction: Record<string, number>;
    type: Record<string, number>;
    rarity: Record<string, number>;
    set: Record<string, number>;
    pool: Record<string, number>;
    kredits: Record<string, number>;
    [key: string]: Record<string, number>;
  };
  [key: string]: unknown;
}

/* ============================================================
 * 5. 阵营常量（数据层口径 = API 口径）
 * ============================================================ */

/**
 * 数据集里的阵营名（注意：API 用 `Soviet`，引擎 FACTIONS 里写的是 `USSR`；
 * 另有 `Anzac`（澳新军团）与 `Neutral`（中立）两个引擎未列出的阵营）。
 * 跨层比较请统一走 `normalizeFactionName()`。
 */
export const DATA_FACTIONS = [
  'Germany',
  'USA',
  'Britain',
  'Japan',
  'Soviet',
  'France',
  'Italy',
  'Finland',
  'Poland',
  'Anzac',
  'Neutral',
] as const;

export type DataFaction = (typeof DATA_FACTIONS)[number];

/** 阵营别名 → 数据集规范名 */
export const FACTION_ALIASES: Readonly<Record<string, DataFaction>> = {
  USSR: 'Soviet',
  SovietUnion: 'Soviet',
  'Soviet Union': 'Soviet',
  Uk: 'Britain',
  UK: 'Britain',
  GreatBritain: 'Britain',
  Anzacs: 'Anzac',
};

/** 把任意来源的阵营名归一为数据集口径（大小写不敏感，去空格） */
export function normalizeFactionName(name: string | null | undefined): string {
  if (!name) return '';
  const alias = FACTION_ALIASES[name];
  if (alias) return alias;
  const compact = name.replace(/[\s_-]/g, '').toLowerCase();
  for (const f of DATA_FACTIONS) {
    if (f.toLowerCase() === compact) return f;
  }
  return name;
}

/** 中文阵营名（数据层自带，避免依赖引擎的 FACTIONS_ZH 是否已覆盖 Soviet/Anzac） */
export const FACTION_NAME_ZH: Readonly<Record<string, string>> = {
  Germany: '德国',
  USA: '美国',
  Britain: '英国',
  Japan: '日本',
  Soviet: '苏联',
  France: '法国',
  Italy: '意大利',
  Finland: '芬兰',
  Poland: '波兰',
  Anzac: '澳新军团',
  Neutral: '中立',
};

/** 卡牌类型中文名（含 API 出现但引擎 CARD_TYPES 未列的 countermeasure） */
export const CARD_TYPE_NAME_ZH: Readonly<Record<string, string>> = {
  infantry: '步兵',
  tank: '坦克',
  artillery: '炮兵',
  fighter: '战斗机',
  bomber: '轰炸机',
  destroyer: '驱逐舰',
  battleship: '战列舰',
  order: '指令',
  countermeasure: '反制',
};

/** 稀有度中文名 */
export const RARITY_NAME_ZH: Readonly<Record<string, string>> = {
  Standard: '标准',
  Limited: '限定',
  Special: '特殊',
  Elite: '精英',
};

/** 单位类型（会以单位形态进入战场的类型）；其余视为指令类 */
export const UNIT_CARD_TYPES: ReadonlyArray<CardType | string> = [
  'infantry',
  'tank',
  'artillery',
  'fighter',
  'bomber',
  'destroyer',
  'battleship',
];

/** 阵营显示名（未知值原样返回） */
export function factionLabel(faction: string): string {
  return FACTION_NAME_ZH[normalizeFactionName(faction)] ?? faction;
}

/** 类型显示名 */
export function cardTypeLabel(type: CardType | string): string {
  return CARD_TYPE_NAME_ZH[type] ?? type;
}

/** 稀有度显示名 */
export function rarityLabel(rarity: Rarity | string): string {
  return RARITY_NAME_ZH[rarity] ?? rarity;
}

/* ============================================================
 * 6. 兜底：卡组码解码结果的类型放 deckcode.ts（DecodedDeck），
 *    校验结果类型放 deckRules.ts（DeckValidation），避免重复定义。
 * ============================================================ */

/** 卡组代码解码结果（便捷类型，供 deckcode/deckRules 共用） */
export interface DecodedDeck {
  raw: string;
  mainFaction: string;
  allyFaction: string | null;
  cards: { cardId?: string; importId: string; count: number }[];
}
