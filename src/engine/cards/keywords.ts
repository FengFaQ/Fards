/**
 * 卡牌脚本关键字目录（card-script 侧）
 * ------------------------------------------------------------------
 * 职责：把卡牌数据集里 `attributes` 的原始取值（如 `heavyArmor2`、`intel1`、
 * `BecomesVeteran:xxx`、`OnlySpawnable`）统一映射为引擎内部关键字 id，
 * 并提供中文名 / 英文名 / 规则说明，供卡牌脚本、卡牌详情 UI 与覆盖率文档使用。
 *
 * ⚠️ 权威约定
 * 运行时关键字 id 的唯一权威是 `src/engine/keywords.ts`（Lead 契约）：
 *   - 普通关键字：`blitz` / `guard` / `ambush`… 即基础 id 本身；
 *   - 数值型关键字：`${baseId}:${value}`，例如 `heavyArmor:2`、`intel:1`；
 *   - `OnlySpawnable`、`BecomesVeteran:*`、`VeteranOf:*` 不是行为关键字，
 *     分别映射为“仅可生成”标记与老兵链接 id（见下方 VETERAN_* / MARKER 说明）。
 * 本文件**不重复定义**运行时定义，而是从 `../keywords` 派生并补齐卡牌侧目录，
 * 避免 id 漂移。若契约调整（例如重命名 fury），只需改 `src/engine/keywords.ts`。
 *
 * 用法：
 *   normalizeKeywords(card.attributes)        // ['blitz', 'heavyArmor:1']
 *   KEYWORDS['heavyArmor:1'].zh               // '重甲 1'
 *   KEYWORD_ZH['blitz']                       // '闪击'
 */

import { KEYWORD_DEFS, normalizeKeywords as normalizeRuntimeKeywords } from '../keywords';

// ============================================================
// 类型
// ============================================================

export interface CardKeywordDef {
  /** 规范关键字 id（数值型为 `base:value` 形式） */
  id: string;
  /** 中文名 */
  zh: string;
  /** 英文名 */
  en: string;
  /** 规则简述（供卡牌详情/提示与文档引用） */
  desc: string;
  /** 图标名（UI 侧可选；数据未提供时为 undefined） */
  icon?: string;
}

// ============================================================
// 1. 运行时基础关键字（派生自 src/engine/keywords.ts）
// ============================================================

const BASE_KEYWORDS: Record<string, CardKeywordDef> = Object.fromEntries(
  Object.entries(KEYWORD_DEFS).map(([key, def]) => [
    key,
    { id: def.id, zh: def.zh, en: def.en, desc: def.desc },
  ]),
);

// ============================================================
// 2. 数值型关键字的显式档位（数据集真实出现过 heavyArmor1/2/3、intel1/2/3）
// ============================================================

const LEVELED_KEYWORDS: Record<string, CardKeywordDef> = {
  'heavyArmor:1': { id: 'heavyArmor:1', zh: '重甲 1', en: 'Heavy Armor 1', desc: '受到的伤害减少 1 点。' },
  'heavyArmor:2': { id: 'heavyArmor:2', zh: '重甲 2', en: 'Heavy Armor 2', desc: '受到的伤害减少 2 点。' },
  'heavyArmor:3': { id: 'heavyArmor:3', zh: '重甲 3', en: 'Heavy Armor 3', desc: '受到的伤害减少 3 点。' },
  'intel:1': { id: 'intel:1', zh: '情报 1', en: 'Intel 1', desc: '查看敌方 1 张随机手牌。' },
  'intel:2': { id: 'intel:2', zh: '情报 2', en: 'Intel 2', desc: '查看敌方 2 张随机手牌。' },
  'intel:3': { id: 'intel:3', zh: '情报 3', en: 'Intel 3', desc: '查看敌方 3 张随机手牌。' },
};

// ============================================================
// 3. 数据标记与老兵链接（非行为关键字，但必须能无损映射）
// ============================================================

/**
 * 非行为关键字的数据标记：
 * - `OnlySpawnable`：只能由效果生成，不能进入卡组构筑；
 * - `BecomesVeteran:<cardId>`：原卡 → 满足条件后升级为哪张老兵卡；
 * - `VeteranOf:<cardId>`：老兵卡 → 其原卡。
 * 后两者保留为 `veteranBecomes:<cardId>` / `veteranOf:<cardId>` 形式，
 * 以 `<family>:<cardId>` 保持通用 `family:value` 结构。
 */
const MARKER_KEYWORDS: Record<string, CardKeywordDef> = {
  onlySpawnable: { id: 'onlySpawnable', zh: '仅可生成', en: 'Spawn Only', desc: '该卡只能由效果生成，不能进入卡组构筑。' },
  veteranBecomes: { id: 'veteranBecomes', zh: '可升为老兵', en: 'Becomes Veteran', desc: '满足条件后升级为指定老兵卡：veteranBecomes:<cardId>。' },
  veteranOf: { id: 'veteranOf', zh: '老兵形态', en: 'Veteran Of', desc: '该卡为指定原卡的老兵形态：veteranOf:<cardId>。' },
};

// ============================================================
// 4. 规则存在但当前数据集未出现的常见关键字（预留）
// ============================================================

const RESERVED_KEYWORDS: Record<string, CardKeywordDef> = {
  barrage: { id: 'barrage', zh: '弹幕', en: 'Barrage', desc: '攻击时对目标相邻单位/总部追加伤害（数据集暂未出现，预留）。' },
  immune: { id: 'immune', zh: '免疫', en: 'Immune', desc: '不能被敌方效果指定为目标（卡牌原文已出现，作为运行时关键字预留）。' },
  naval: { id: 'naval', zh: '海军', en: 'Naval', desc: '卡牌带有海军属性，可触发“海军牌”相关效果（卡牌原文已出现，作为特性预留）。' },
};

// ============================================================
// 5. 汇总导出
// ============================================================

/** 全部规范关键字定义表（基础 + 数值档位 + 数据标记 + 预留），key 为规范 id */
export const KEYWORDS: Record<string, CardKeywordDef> = {
  ...BASE_KEYWORDS,
  ...LEVELED_KEYWORDS,
  ...MARKER_KEYWORDS,
  ...RESERVED_KEYWORDS,
};

/** 规范 id → 中文名（数值型含档位，如 `heavyArmor:1` → '重甲 1'） */
export const KEYWORD_ZH: Record<string, string> = Object.fromEntries(
  Object.entries(KEYWORDS).map(([id, def]) => [id, def.zh]),
);

/** 数据集 `attributes` 中真实出现过的行为关键字基础 id（不含数值档位/标记） */
export const GAMEPLAY_KEYWORD_IDS: string[] = Object.keys(BASE_KEYWORDS);

// ============================================================
// 6. 归一化函数
// ============================================================

/**
 * 把卡牌 `attributes` 归一化为引擎关键字 id 数组。
 * - `heavyArmor2` → `heavyArmor:2`、`intel1` → `intel:1`；
 * - `OnlySpawnable`、`BecomesVeteran:*`、`VeteranOf:*` 会被丢弃（非行为关键字）；
 * - 去重并保持输入顺序。
 *
 * 行为与 `src/engine/keywords.ts#normalizeKeywords` 完全一致（直接委托）。
 */
export function normalizeKeywords(attributes: string[] | undefined): string[] {
  return normalizeRuntimeKeywords(attributes);
}

/** 单条原始 attribute 的详细解析结果 */
export type AttributeParse =
  | { kind: 'keyword'; raw: string; id: string }
  | { kind: 'veteranLink'; raw: string; id: 'veteranBecomes' | 'veteranOf'; cardId: string }
  | { kind: 'marker'; raw: string; id: 'onlySpawnable' }
  | { kind: 'unknown'; raw: string; id: string };

/**
 * 解析单条原始 attribute，保留老兵链接/标记信息。
 * 与 normalizeKeywords 的区别：不会丢弃数据标记，供卡牌详情/老兵机制使用。
 */
export function parseAttribute(attr: string): AttributeParse {
  if (attr === 'OnlySpawnable') return { kind: 'marker', raw: attr, id: 'onlySpawnable' };
  if (attr.startsWith('BecomesVeteran:')) {
    return { kind: 'veteranLink', raw: attr, id: 'veteranBecomes', cardId: attr.slice('BecomesVeteran:'.length) };
  }
  if (attr.startsWith('VeteranOf:')) {
    return { kind: 'veteranLink', raw: attr, id: 'veteranOf', cardId: attr.slice('VeteranOf:'.length) };
  }
  const leveled = /^([a-zA-Z]+)(\d+)$/.exec(attr);
  if (leveled) {
    const base = leveled[1].charAt(0).toLowerCase() + leveled[1].slice(1);
    const value = Number(leveled[2]);
    const id = `${base}:${value}`;
    return { kind: 'keyword', raw: attr, id };
  }
  return { kind: 'keyword', raw: attr, id: attr };
}

/** 关键字中文名；未知 id 原样返回（含 `family:value` 的基础部分兜底） */
export function keywordLabel(id: string): string {
  const found = KEYWORD_ZH[id];
  if (found) return found;
  const base = id.split(':')[0];
  return KEYWORD_ZH[base] ?? id;
}

/** 是否为真实行为关键字（可写入单位 keywords / 用于 grantKeyword） */
export function isGameplayKeyword(id: string): boolean {
  return GAMEPLAY_KEYWORD_IDS.includes(id.split(':')[0]);
}
