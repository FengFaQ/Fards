/**
 * 关键字系统
 * ------------------------------------------------------------------
 * API 的 attributes 数组是原始数据（如 heavyArmor2、intel2、BecomesVeteran:xxx），
 * 本模块负责归一化为引擎内部关键字 id（可带数值，格式 `${id}:${value}`）。
 *
 * 关键字精确语义见 docs/KEYWORDS.md / docs/RULES_SPEC.md。
 */
import type { CardType, KeywordId, Unit } from './types';

export interface KeywordDef {
  id: KeywordId;
  zh: string;
  en: string;
  desc: string;
  /** 是否为数值型关键字（如重甲 N 点） */
  valued?: boolean;
}

export const KEYWORD_DEFS: Record<string, KeywordDef> = {
  blitz: { id: 'blitz', zh: '闪击', en: 'Blitz', desc: '部署当回合即可行动（攻击）。' },
  guard: { id: 'guard', zh: '守护', en: 'Guard', desc: '敌方必须先攻击具有守护的单位，才能攻击其他目标。' },
  smokescreen: {
    id: 'smokescreen',
    zh: '烟幕',
    en: 'Smokescreen',
    desc: '具有烟幕的单位不能被敌方单位攻击（仍可被指令/效果指定）。',
  },
  ambush: {
    id: 'ambush',
    zh: '伏击',
    en: 'Ambush',
    desc: '伏击单位处于隐藏状态，不能被敌方单位攻击；其首次攻击后解除伏击。',
  },
  fury: { id: 'fury', zh: '奋战', en: 'Fury', desc: '每回合可攻击两次。' },
  heavyArmor: { id: 'heavyArmor', zh: '重甲', en: 'Heavy Armor', desc: '受到的伤害减少 N 点。', valued: true },
  shock: { id: 'shock', zh: '冲击', en: 'Shock', desc: '部署时具有冲击：可立即移动/攻击（待考据）。' },
  bond: { id: 'bond', zh: '协力', en: 'Bond', desc: '与特定单位共同在场时触发追加效果（待考据）。' },
  alpine: { id: 'alpine', zh: '山地', en: 'Alpine', desc: '山地单位（待考据）。' },
  pincer: { id: 'pincer', zh: '钳击', en: 'Pincer', desc: '与另一钳击单位配合时获得强化（待考据）。' },
  covert: { id: 'covert', zh: '隐蔽', en: 'Covert', desc: '隐蔽单位不能被指定为目标（待考据）。' },
  intel: { id: 'intel', zh: '情报', en: 'Intel', desc: '查看敌方 N 张手牌/卡组顶（待考据）。', valued: true },
  salvage: { id: 'salvage', zh: '收缴', en: 'Salvage', desc: '收缴（待考据）。' },
  mobilize: { id: 'mobilize', zh: '动员', en: 'Mobilize', desc: '动员（待考据）。' },
  veteran: { id: 'veteran', zh: '老兵', en: 'Veteran', desc: '满足条件后升级为老兵形态。' },
};

export const KEYWORD_ZH: Record<string, string> = Object.fromEntries(
  Object.values(KEYWORD_DEFS).map((k) => [k.id, k.zh]),
);

/** 解析单条原始 attribute；返回 null 表示不是行为关键字（如 OnlySpawnable/老兵标记） */
export function parseAttribute(attr: string): KeywordId | null {
  if (!attr) return null;
  if (attr === 'OnlySpawnable') return null;
  if (attr.startsWith('BecomesVeteran:') || attr.startsWith('VeteranOf:')) return null;

  const m = /^([a-zA-Z]+)(\d+)$/.exec(attr);
  if (m) {
    const base = m[1];
    const value = Number(m[2]);
    // 原始首字母小写；heavyArmor1 → heavyArmor:1
    const id = base.charAt(0).toLowerCase() + base.slice(1);
    if (KEYWORD_DEFS[id]) return `${id}:${value}`;
    return `${id}:${value}`;
  }
  return attr;
}

export function normalizeKeywords(attributes: string[] | undefined): KeywordId[] {
  const out: KeywordId[] = [];
  for (const attr of attributes ?? []) {
    const id = parseAttribute(attr);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** 关键字基础 id（去掉 :value 后缀） */
export function keywordId(keyword: string): string {
  const idx = keyword.indexOf(':');
  return idx >= 0 ? keyword.slice(0, idx) : keyword;
}

export function keywordValue(keyword: string): number {
  const idx = keyword.indexOf(':');
  return idx >= 0 ? Number(keyword.slice(idx + 1)) || 0 : 0;
}

export function hasKeyword(unit: Pick<Unit, 'keywords'>, id: string): boolean {
  return unit.keywords.some((k) => keywordId(k) === id);
}

export function getKeywordValue(unit: Pick<Unit, 'keywords'>, id: string): number {
  let total = 0;
  for (const k of unit.keywords) {
    if (keywordId(k) === id) total += keywordValue(k) || 1;
  }
  return total;
}

export function addKeyword(unit: Unit, id: string): void {
  if (!hasKeyword(unit, id)) unit.keywords.push(id);
}

export function removeKeyword(unit: Unit, id: string): void {
  unit.keywords = unit.keywords.filter((k) => keywordId(k) !== id);
}

// ---- 单位类型分类 ----

export const AIR_TYPES: CardType[] = ['fighter', 'bomber'];
export const GROUND_TYPES: CardType[] = ['infantry', 'tank', 'artillery'];
export const ORDER_TYPES: CardType[] = ['order', 'countermeasure'];

export function isAirType(type: CardType): boolean {
  return AIR_TYPES.includes(type);
}

export function isGroundType(type: CardType): boolean {
  return GROUND_TYPES.includes(type);
}

export function isOrderType(type: CardType): boolean {
  return ORDER_TYPES.includes(type);
}

export function isCountermeasureType(type: CardType): boolean {
  return type === 'countermeasure';
}

/** 是否为远程单位（可越过前线打击支援线） */
export function isRangedType(type: CardType): boolean {
  return type === 'artillery' || isAirType(type);
}

/** 单位当前是否处于隐藏状态（伏击/隐蔽，攻击后解除） */
export function isHiddenKeyword(unit: Pick<Unit, 'keywords'>): boolean {
  return hasKeyword(unit, 'ambush') || hasKeyword(unit, 'covert');
}

/** 单位当前是否具有“可先攻”类关键字 */
export function hasImmediateAction(unit: Unit): boolean {
  return hasKeyword(unit, 'blitz') || hasKeyword(unit, 'shock');
}
