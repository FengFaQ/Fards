/**
 * deckRules.ts — 卡组合法性校验（依据 RULES_SPEC v2 + 1900+ 公开卡组的统计验证）
 * ------------------------------------------------------------------
 * 299 规则清单（详见 docs/DECK_RULES.md）：
 *   R1  卡组恰好 39 张
 *   R2  同名卡上限按稀有度：Standard 4 / Limited 3 / Special 2 / Elite 1
 *   R3  精英（Elite）卡每卡 1 张；精英无"总张数"上限
 *   R4  盟军卡 ≤ 12 张，且**不得含精英卡**
 *   R5  阵营：主阵营必须是 5 大国之一（Soviet/USA/Germany/Britain/Japan）；
 *       盟军必须是另一阵营（Anzac 允许但给 warning）；minor 国（Italy/Poland/France/Finland/Anzac）不能当主阵营
 *   R6  `host_factions` 语义：main ∈ host_factions → 按本国牌（不占盟军额度）；
 *       否则 ally ∈ host_factions → 占盟军额度；两者都不满足 = 非法
 *   R7  不可构筑：`pool === 'derived'` 或 `set === 'OnlySpawnable'`
 *       （注意：`attributes` 含 `OnlySpawnable` 的 44 张可构筑，不是同一概念）
 *   R8  `pool === 'reserve'`：本作是卡组测试工具 → 允许，仅给 warning
 *
 * 纯 TS、无框架依赖；卡表未加载时降级为"只做结构校验"。
 */

import type { Card, DecodedDeck } from './types';
import { normalizeFactionName } from './types';
import { getCardIndex } from './loadCards';

/* ============================================================
 * 1. 规则常量
 * ============================================================ */

/** 5 大国：可以作为主阵营 */
export const MAJOR_FACTIONS: readonly string[] = ['Soviet', 'USA', 'Germany', 'Britain', 'Japan'];
/** 4 小国：只能作为盟军 */
export const MINOR_FACTIONS: readonly string[] = ['Italy', 'Poland', 'France', 'Finland'];
/** 允许但需 warning 的盟军（澳新军团，2023 后加入的小国） */
export const WARN_ALLY_FACTIONS: readonly string[] = ['Anzac'];

/** 同名卡上限（按稀有度） */
export type RarityCopyLimits = Record<string, number>;
export const COPY_LIMIT_BY_RARITY: RarityCopyLimits = {
  Standard: 4,
  Limited: 3,
  Special: 2,
  Elite: 1,
};

export interface DeckRuleSet {
  /** 标准卡组必须正好这么多张 */
  deckSize: number;
  /** 允许的最少张数（构筑中/草稿态用；与 deckSize 相同表示必须满编） */
  minDeckSize: number;
  /** 单张卡最大副本数（Standard 口径，兼容旧调用方） */
  maxCopies: number;
  /** 按稀有度的同名副本上限：Standard 4 / Limited 3 / Special 2 / Elite 1 */
  maxCopiesByRarity: RarityCopyLimits;
  /** 精英卡最大副本数（= 1） */
  eliteCopies: number;
  /** 精英卡总张数上限（null = 不限制） */
  maxEliteTotal: number | null;
  /** 盟军卡最大张数 */
  maxAllyCards: number;
  /** 盟军是否禁止精英卡 */
  allyEliteForbidden: boolean;
  /** 允许的阵营数（主 + 至多 1 盟军） */
  maxFactions: number;
  /** 可作为主阵营的大国 */
  mainFactions: readonly string[];
  /** 只能作盟军的小国 */
  minorFactions: readonly string[];
  /** 允许但给 warning 的盟军 */
  warnAllyFactions: readonly string[];
  /** 不可构筑的 pool 值 */
  unbuildablePools: readonly string[];
  /** 不可构筑的 set 值 */
  unbuildableSets: readonly string[];
  /** 允许中立通用卡（当前卡池里 16 张 Neutral 全是 derived token，实际不可构筑） */
  allowNeutralCards: boolean;
  /** 标准赛制是否允许预备池（reserve）卡：允许，但会 warning */
  allowReservedInStandard: boolean;
  /** 是否允许卡表缺失时仍然通过（false = 卡表缺失只给 warning，不做硬失败） */
  [key: string]: unknown;
}

export const DECK_RULES: DeckRuleSet = {
  deckSize: 39,
  minDeckSize: 39,
  maxCopies: 4,
  maxCopiesByRarity: COPY_LIMIT_BY_RARITY,
  eliteCopies: 1,
  maxEliteTotal: null,
  maxAllyCards: 12,
  allyEliteForbidden: true,
  maxFactions: 2,
  mainFactions: MAJOR_FACTIONS,
  minorFactions: MINOR_FACTIONS,
  warnAllyFactions: WARN_ALLY_FACTIONS,
  unbuildablePools: ['derived'],
  unbuildableSets: ['OnlySpawnable'],
  allowNeutralCards: false,
  allowReservedInStandard: true,
};

/* ============================================================
 * 2. 类型
 * ============================================================ */

export interface DeckValidationStats {
  total: number;
  byType: Record<string, number>;
  /** 费用 → 张数 */
  byKredits: Record<number, number>;
  /** 单位卡张数 */
  units: number;
  /** 指令/反制张数 */
  orders: number;
  /** 精英卡张数 */
  elite: number;
  /** 本国牌张数（含 main ∈ host_factions 的流亡卡） */
  mainFactionCards: number;
  /** 盟军牌张数（计入 12 张额度） */
  allyFactionCards: number;
}

export interface DeckValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: DeckValidationStats;
}

/** 参与校验的最小卡组形状（DecodedDeck / Deck / ui 的 DeckData 都满足） */
export interface ValidatableDeck {
  mainFaction?: string | null;
  faction?: string | null;
  allyFaction?: string | null;
  cards: ReadonlyArray<{ cardId: string; count: number }>;
}

const UNIT_TYPES = new Set(['infantry', 'tank', 'artillery', 'fighter', 'bomber', 'destroyer', 'battleship']);

/* ============================================================
 * 3. 校验
 * ============================================================ */

function emptyStats(): DeckValidationStats {
  return {
    total: 0,
    byType: {},
    byKredits: {},
    units: 0,
    orders: 0,
    elite: 0,
    mainFactionCards: 0,
    allyFactionCards: 0,
  };
}

function copyLimitFor(card: Card): number {
  const limit = DECK_RULES.maxCopiesByRarity[card.rarity];
  return typeof limit === 'number' && limit > 0 ? limit : DECK_RULES.maxCopies;
}

/**
 * 校验卡组。
 * @param deck  解码后的卡组（DecodedDeck / Deck / ui DeckData 均可）
 * @param cards 可选的 cardId→Card 映射；省略时用 loadCards() 建立的全量索引
 */
export function validateDeck(deck: ValidatableDeck, cards?: Map<string, Card>): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = emptyStats();

  const index = cards ?? getCardIndex();
  const haveCardData = index.size > 0;
  if (!haveCardData) {
    warnings.push('卡表尚未加载，已跳过阵营归属/稀有度/可构筑性校验（先 await loadCards()）');
  }

  const mainRaw = deck?.mainFaction ?? deck?.faction ?? '';
  const allyRaw = deck?.allyFaction ?? '';
  const main = normalizeFactionName(String(mainRaw));
  const ally = allyRaw ? normalizeFactionName(String(allyRaw)) : '';
  const allyEffective = ally && ally !== main ? ally : '';

  if (!main) {
    errors.push('缺少主阵营');
  } else if (!MAJOR_FACTIONS.includes(main)) {
    // 数据佐证：1918 个干净公开卡组里只有 2 个用 minor 当主阵营（属历史/非法卡组）
    errors.push(`主阵营 "${main}" 不可用：主阵营必须是 5 大国之一（${MAJOR_FACTIONS.join('/')}）`);
  }
  if (ally && !allyEffective) warnings.push('盟军阵营与主阵营相同，已按"无盟军"处理');
  if (allyEffective === 'Anzac') warnings.push('盟军为澳新军团（Anzac），当前按允许处理（见 docs/DECK_RULES.md）');

  const seen = new Map<string, number>();
  const reservedCards: string[] = [];
  let allyEliteNames: string[] = [];

  for (const item of deck?.cards ?? []) {
    const cardId = String(item?.cardId ?? '');
    const count = Number(item?.count ?? 0);
    if (!cardId) {
      errors.push('存在空的 cardId');
      continue;
    }
    if (!Number.isInteger(count) || count < 1) {
      errors.push(`卡牌 "${cardId}" 副本数非法：${item?.count}`);
      continue;
    }
    const prev = seen.get(cardId);
    if (prev !== undefined) {
      errors.push(`卡牌 "${cardId}" 重复出现（${prev} 与 ${count}）`);
      continue;
    }
    seen.set(cardId, count);
    stats.total += count;

    if (!haveCardData) {
      if (count > DECK_RULES.maxCopies) errors.push(`卡牌 "${cardId}" 副本数超限：${count}（上限 ${DECK_RULES.maxCopies}）`);
      continue;
    }

    const card = index.get(cardId);
    if (!card) {
      errors.push(`卡牌 "${cardId}" 不在数据集中`);
      continue;
    }

    // ---- 可构筑性（R7）----
    if (DECK_RULES.unbuildablePools.includes(String(card.pool))) {
      errors.push(`卡牌 "${card.nameZh || cardId}" 不可构筑：pool=${card.pool}（衍生/仅生成卡）`);
      continue;
    }
    if (DECK_RULES.unbuildableSets.includes(String(card.set))) {
      errors.push(`卡牌 "${card.nameZh || cardId}" 不可构筑：set=${card.set}（仅生成卡池）`);
      continue;
    }

    // ---- 稀有度/副本上限（R2/R3）----
    const limit = copyLimitFor(card);
    if (count > limit) {
      errors.push(
        `卡牌 "${card.nameZh || cardId}" 副本数超限：${count}（${card.rarity} 上限 ${limit}）`
      );
    }
    if (card.rarity === 'Elite' && count > DECK_RULES.eliteCopies) {
      errors.push(`精英卡 "${card.nameZh || cardId}" 超限：${count} 张（上限 ${DECK_RULES.eliteCopies}）`);
    }

    // ---- 阵营归属（R6：host_factions 优先）----
    const own = normalizeFactionName(card.faction);
    const hostFactions = (card.hostFactions ?? []).map((f) => normalizeFactionName(String(f)));
    const isOwn = !!main && (own === main || hostFactions.includes(main));
    const isAlly = !!allyEffective && (own === allyEffective || hostFactions.includes(allyEffective));

    if (isOwn) {
      stats.mainFactionCards += count;
    } else if (isAlly) {
      stats.allyFactionCards += count;
      if (card.rarity === 'Elite' && DECK_RULES.allyEliteForbidden) {
        allyEliteNames.push(card.nameZh || cardId);
      }
    } else {
      // 注意：Neutral 且 hostFactions 不含主/盟军 → 不可用（当前 16 张 Neutral 全是 derived，上面已被拦掉）
      errors.push(
        `卡牌 "${card.nameZh || cardId}" 属于 ${own}` +
          `${hostFactions.length ? `（可入 ${hostFactions.join('/')}）` : ''}，` +
          `不能放入 ${main}${allyEffective ? `/${allyEffective}` : ''} 卡组`
      );
      continue;
    }

    // ---- 统计 ----
    stats.byType[card.type] = (stats.byType[card.type] ?? 0) + count;
    stats.byKredits[card.kredits] = (stats.byKredits[card.kredits] ?? 0) + count;
    if (UNIT_TYPES.has(card.type)) stats.units += count;
    else stats.orders += count;
    if (card.rarity === 'Elite') stats.elite += count;
    if (card.isReserved && DECK_RULES.allowReservedInStandard) reservedCards.push(card.nameZh || cardId);
  }

  // ---- R4 盟军限定 ----
  if (stats.allyFactionCards > DECK_RULES.maxAllyCards) {
    errors.push(`盟军卡超限：${stats.allyFactionCards} 张（${allyEffective}，上限 ${DECK_RULES.maxAllyCards}）`);
  }
  if (allyEliteNames.length) {
    errors.push(
      `盟军不得含精英卡：${allyEliteNames.slice(0, 3).join('、')}${allyEliteNames.length > 3 ? ` 等 ${allyEliteNames.length} 张` : ''}`
    );
  }

  // ---- R1 张数 ----
  if (stats.total > DECK_RULES.deckSize) {
    errors.push(`卡组张数超限：${stats.total}（上限 ${DECK_RULES.deckSize}）`);
  } else if (stats.total < DECK_RULES.deckSize) {
    warnings.push(`卡组未满：${stats.total}/${DECK_RULES.deckSize} 张`);
  }

  // ---- R8 预备池：允许但提示 ----
  if (reservedCards.length) {
    warnings.push(`含 ${reservedCards.length} 张预备池（reserve）卡牌：本作按卡组测试工具口径允许`);
  }

  return { valid: errors.length === 0, errors, warnings, stats };
}

/* ============================================================
 * 4. 便捷判断
 * ============================================================ */

/** 该卡是否可用于某阵营的卡组（main ∈ hostFactions 优先，其次 ally ∈ hostFactions） */
export function isCardUsableBy(card: Card, mainFaction: string, allyFaction?: string | null): boolean {
  const main = normalizeFactionName(mainFaction);
  const ally = allyFaction ? normalizeFactionName(allyFaction) : '';
  const own = normalizeFactionName(card.faction);
  const hosts = (card.hostFactions ?? []).map((f) => normalizeFactionName(String(f)));
  if (own === main || hosts.includes(main)) return true;
  if (ally && (own === ally || hosts.includes(ally))) return true;
  if (DECK_RULES.allowNeutralCards && own === 'Neutral') return true;
  return false;
}

/** 该卡在给定卡组里算"本国牌"还是"盟军牌"；非法返回 null */
export function classifyCard(
  card: Card,
  mainFaction: string,
  allyFaction?: string | null
): 'main' | 'ally' | null {
  const main = normalizeFactionName(mainFaction);
  const ally = allyFaction ? normalizeFactionName(allyFaction) : '';
  const own = normalizeFactionName(card.faction);
  const hosts = (card.hostFactions ?? []).map((f) => normalizeFactionName(String(f)));
  if (own === main || hosts.includes(main)) return 'main';
  if (ally && (own === ally || hosts.includes(ally))) return 'ally';
  return null;
}

/** 该卡的同名副本上限（按稀有度） */
export function maxCopiesOf(card: Card): number {
  return copyLimitFor(card);
}

/** 该卡组距"合法"还差多少张（负数 = 超出） */
export function deckSizeDelta(deck: ValidatableDeck): number {
  const total = (deck?.cards ?? []).reduce((sum, c) => sum + (Number(c.count) || 0), 0);
  return DECK_RULES.deckSize - total;
}

/** 编码前检查：返回导致无法编码的问题列表（空数组 = 可编码） */
export function encodeIssues(deck: ValidatableDeck): string[] {
  const issues: string[] = [];
  if (!(deck?.mainFaction ?? deck?.faction)) issues.push('缺少主阵营');
  const seen = new Set<string>();
  for (const item of deck?.cards ?? []) {
    if (seen.has(item.cardId)) issues.push(`卡牌重复：${item.cardId}`);
    seen.add(item.cardId);
    if (!Number.isInteger(item.count) || item.count < 1 || item.count > 4) {
      issues.push(`副本数非法：${item.cardId}=${item.count}`);
    }
  }
  return issues;
}

/** 规则快照文本（文档/日志用） */
export function describeRules(rules: DeckRuleSet = DECK_RULES): string {
  return [
    `卡组张数：${rules.deckSize}`,
    `同名上限：Standard ${rules.maxCopiesByRarity.Standard} / Limited ${rules.maxCopiesByRarity.Limited} / Special ${rules.maxCopiesByRarity.Special} / Elite ${rules.maxCopiesByRarity.Elite}`,
    `盟军：≤${rules.maxAllyCards} 张且不得含精英`,
    `主阵营：${rules.mainFactions.join('/')}`,
    `衍生/仅生成卡不可构筑`,
  ].join('；');
}

export type { DecodedDeck };
