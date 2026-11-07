/**
 * 展示层词典与阵营/类型/稀有度元数据。
 * 只做「英文契约值 → 中文军事文案 + 颜色」的翻译，不含业务规则。
 */
import type { CardDef } from '@/engine/types';

/* ------------------------------------------------------------------ 阵营 */

export interface FactionMeta {
  key: string;
  zh: string;
  en: string;
  /** 主色（阵营底纹 / 徽记） */
  color: string;
  /** 深色（渐变尾） */
  shade: string;
}

const FACTION_TABLE: Record<string, FactionMeta> = {
  Germany: { key: 'Germany', zh: '德国', en: 'GERMANY', color: '#6f7a83', shade: '#39424a' },
  USA: { key: 'USA', zh: '美国', en: 'USA', color: '#7d8b5c', shade: '#414a2c' },
  Britain: { key: 'Britain', zh: '英国', en: 'BRITAIN', color: '#a8906a', shade: '#574830' },
  Japan: { key: 'Japan', zh: '日本', en: 'JAPAN', color: '#b0543f', shade: '#5c2a20' },
  Soviet: { key: 'Soviet', zh: '苏联', en: 'SOVIET', color: '#9a3b30', shade: '#4a1a15' },
  France: { key: 'France', zh: '法国', en: 'FRANCE', color: '#5f7b95', shade: '#2d3d4d' },
  Italy: { key: 'Italy', zh: '意大利', en: 'ITALY', color: '#7f8f62', shade: '#3f4730' },
  Finland: { key: 'Finland', zh: '芬兰', en: 'FINLAND', color: '#8fa3b5', shade: '#43505c' },
  Poland: { key: 'Poland', zh: '波兰', en: 'POLAND', color: '#a55a5a', shade: '#532c2c' },
  Anzac: { key: 'Anzac', zh: '澳新', en: 'ANZAC', color: '#7c8f73', shade: '#3c4738' },
  Neutral: { key: 'Neutral', zh: '中立', en: 'NEUTRAL', color: '#8b8574', shade: '#44412f' },
};

/** 引擎写 USSR、数据源写 Soviet，这里统一别名 */
const FACTION_ALIAS: Record<string, string> = {
  ussr: 'Soviet',
  sovietunion: 'Soviet',
  soviet: 'Soviet',
  unitedstates: 'USA',
  america: 'USA',
  uk: 'Britain',
  greatbritain: 'Britain',
  germany: 'Germany',
  japan: 'Japan',
  france: 'France',
  italy: 'Italy',
  finland: 'Finland',
  poland: 'Poland',
  anzac: 'Anzac',
  neutral: 'Neutral',
};

export const FACTION_ORDER = [
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

/** 构筑主阵营可选（排除中立） */
export const DECK_FACTIONS = FACTION_ORDER.filter((f) => f !== 'Neutral');

export function factionMeta(faction?: string | null): FactionMeta {
  const raw = (faction ?? '').trim();
  if (!raw) return FACTION_TABLE.Neutral;
  const direct = FACTION_TABLE[raw];
  if (direct) return direct;
  const alias = FACTION_ALIAS[raw.toLowerCase().replace(/[\s_-]/g, '')];
  if (alias && FACTION_TABLE[alias]) return FACTION_TABLE[alias];
  const byZh = Object.values(FACTION_TABLE).find((m) => m.zh === raw);
  if (byZh) return byZh;
  return {
    key: raw,
    zh: raw,
    en: raw.toUpperCase(),
    color: '#8b8574',
    shade: '#44412f',
  };
}

export const factionColor = (faction?: string | null) => factionMeta(faction).color;
export const factionZh = (faction?: string | null) => factionMeta(faction).zh;

/* ------------------------------------------------------------------ 类型 */

export interface CardTypeMeta {
  key: string;
  zh: string;
  /** 单字徽记 */
  glyph: string;
}

const TYPE_TABLE: Record<string, CardTypeMeta> = {
  infantry: { key: 'infantry', zh: '步兵', glyph: '步' },
  tank: { key: 'tank', zh: '坦克', glyph: '坦' },
  artillery: { key: 'artillery', zh: '炮兵', glyph: '炮' },
  fighter: { key: 'fighter', zh: '战斗机', glyph: '战' },
  bomber: { key: 'bomber', zh: '轰炸机', glyph: '轰' },
  destroyer: { key: 'destroyer', zh: '驱逐舰', glyph: '驱' },
  battleship: { key: 'battleship', zh: '战列舰', glyph: '舰' },
  order: { key: 'order', zh: '指令', glyph: '令' },
  countermeasure: { key: 'countermeasure', zh: '反制', glyph: '反' },
};

export const CARD_TYPE_ORDER = [
  'infantry',
  'tank',
  'artillery',
  'fighter',
  'bomber',
  'destroyer',
  'battleship',
  'order',
  'countermeasure',
] as const;

export function cardTypeMeta(type?: string | null): CardTypeMeta {
  const raw = (type ?? '').trim();
  const hit = TYPE_TABLE[raw] ?? TYPE_TABLE[raw.toLowerCase()];
  if (hit) return hit;
  return { key: raw || 'unknown', zh: raw || '未知', glyph: '？' };
}

export const cardTypeZh = (type?: string | null) => cardTypeMeta(type).zh;

/** 类型分布图配色 */
export const TYPE_COLORS: Record<string, string> = {
  infantry: '#7d8b5c',
  tank: '#a8906a',
  artillery: '#b07a3f',
  fighter: '#8fa3b5',
  bomber: '#b0543f',
  destroyer: '#5f7b95',
  battleship: '#4e6b86',
  order: '#c39b3a',
  countermeasure: '#8b8574',
};

export const typeColor = (type?: string | null) => TYPE_COLORS[(type ?? '').toLowerCase()] ?? '#8b8574';

/** 是否为「单位」（有攻防） */
export const isUnitCard = (card: Pick<CardDef, 'type' | 'attack' | 'defense'>) => {
  const t = (card.type ?? '').toLowerCase();
  if (t === 'order' || t === 'countermeasure') return false;
  return true;
};

/* ------------------------------------------------------------------ 稀有度 */

export interface RarityMeta {
  key: string;
  zh: string;
  en: string;
  color: string;
}

const RARITY_TABLE: Record<string, RarityMeta> = {
  Standard: { key: 'Standard', zh: '标准', en: 'STANDARD', color: '#9aa39b' },
  Limited: { key: 'Limited', zh: '限定', en: 'LIMITED', color: '#7ea56f' },
  Special: { key: 'Special', zh: '特殊', en: 'SPECIAL', color: '#7d9cbf' },
  Elite: { key: 'Elite', zh: '精英', en: 'ELITE', color: '#d8b45f' },
};

export const RARITY_ORDER = ['Standard', 'Limited', 'Special', 'Elite'] as const;

export function rarityMeta(rarity?: string | null): RarityMeta {
  const raw = (rarity ?? '').trim();
  return RARITY_TABLE[raw] ?? RARITY_TABLE[raw.toLowerCase() === 'elite' ? 'Elite' : 'Standard'];
}

export const cardRarityZh = (rarity?: string | null) => rarityMeta(rarity).zh;

/* ------------------------------------------------------------------ 卡包 / 卡池 */

export const SET_ZH: Record<string, string> = {
  Base: '基础',
  Allegiance: '效忠',
  OceaniaStorm: '大洋风暴',
  Homefront: '本土防线',
  BloodAndIron: '铁与血',
  NavalWarfare: '海战',
  Legions: '军团',
  Breakthrough: '突破',
  BrothersInArms: '同袍',
  CovertOps: '秘密行动',
  WinterWar: '冬季战争',
  OnlySpawnable: '仅衍生',
  WorldAtWar: '世界大战',
  Special: '特殊',
  TheatersOfWar: '战区',
};

export const setZh = (set?: string | null) => (set && SET_ZH[set]) || set || '未知';

export const SET_ORDER = Object.keys(SET_ZH);

export const POOL_ZH: Record<string, string> = {
  active: '现役',
  reserve: '预备',
  derived: '衍生',
};

export const POOL_ORDER = ['active', 'reserve', 'derived'] as const;

export const poolZh = (pool?: string | null) => (pool && POOL_ZH[pool]) || pool || '未知';

/* ------------------------------------------------------------------ 关键字 */

export interface KeywordMeta {
  id: string;
  zh: string;
  raw: string;
  /** 原始词条本身是数据内务字段（不该展示给玩家） */
  internal?: boolean;
}

const KEYWORD_TABLE: Record<string, string> = {
  blitz: '闪击',
  fury: '狂怒',
  guard: '守卫',
  smokescreen: '烟幕',
  pincer: '钳击',
  salvage: '打捞',
  intel: '情报',
  intel1: '情报 1',
  intel2: '情报 2',
  intel3: '情报 3',
  ambush: '伏击',
  heavyarmor: '重甲',
  armor: '护甲',
  veteran: '老兵',
  mobilization: '动员',
  shock: '震慑',
  rampage: '暴怒',
  breakthrough: '突破',
  airstrike: '空袭',
  repair: '维修',
  fortify: '构筑工事',
  spell: '法术',
  spy: '谍报',
  resistance: '抵抗',
  onlyspawnable: '仅衍生',
  becomesveteran: '可升为老兵',
  veteranof: '老兵形态',
};

/** 过滤面板里展示的可选关键字（数据里出现的词条再动态补充） */
export const KEYWORD_FILTERS = [
  'blitz',
  'fury',
  'guard',
  'smokescreen',
  'pincer',
  'salvage',
  'intel2',
  'intel',
  'ambush',
  'heavyarmor',
  'veteran',
  'mobilization',
  'spy',
  'resistance',
] as const;

export function keywordMeta(attribute: string): KeywordMeta {
  const raw = (attribute ?? '').trim();
  if (!raw) return { id: '', zh: '', raw: '' };
  const lower = raw.toLowerCase();
  const base = lower.split(':')[0];
  const internal = base === 'onlyspawnable' || base === 'becomesveteran' || base === 'veteranof';
  const zh = KEYWORD_TABLE[base] ?? KEYWORD_TABLE[lower] ?? raw;
  return { id: base, zh, raw, internal };
}

/** 从卡牌 attributes 提取去重后的可展示关键字 */
export function cardKeywords(card: Pick<CardDef, 'attributes'>): KeywordMeta[] {
  const seen = new Set<string>();
  const out: KeywordMeta[] = [];
  for (const attr of card.attributes ?? []) {
    const meta = keywordMeta(attr);
    if (!meta.id || meta.internal || seen.has(meta.id)) continue;
    seen.add(meta.id);
    out.push(meta);
  }
  return out;
}

/* ------------------------------------------------------------------ 杂项 */

export const kreditLabel = (n: number) => `${n} 克雷迪特`;

export function formatDate(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 中文复数（张） */
export const cardCountText = (n: number) => `${n} 张`;

export function cnSort(a: string, b: string) {
  return a.localeCompare(b, 'zh-Hans-CN');
}

/** 统一的阵营允许判定（主阵营 / 盟军 / 流亡卡的 hostFactions） */
export function isFactionAllowed(
  card: Pick<CardDef, 'faction' | 'hostFactions' | 'isExile'>,
  mainFaction?: string | null,
  allyFaction?: string | null,
): boolean {
  const main = mainFaction ? factionMeta(mainFaction).key : null;
  const ally = allyFaction ? factionMeta(allyFaction).key : null;
  const cardFaction = factionMeta(card.faction).key;
  const hosts = (card.hostFactions ?? []).map((f) => factionMeta(f).key);

  if (!main) return true;
  if (cardFaction === 'Neutral') return true;
  if (cardFaction === main) return true;
  if (ally && cardFaction === ally) return true;
  // 流亡 / 盟军卡：hostFactions 含主阵营即可
  if (card.isExile && hosts.includes(main)) return true;
  return false;
}
