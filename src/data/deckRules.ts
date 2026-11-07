/**
 * deckRules.ts — 卡组合法性校验
 * ------------------------------------------------------------------
 * 规则来源：对 2000 个公开卡组的统计推断（见 docs/DECK_RULES.md 的证据表与置信度）。
 * 这里只做"卡组结构"校验（张数、同名副本、精英、阵营归属、盟军占比），
 * 不涉及对战规则（那是引擎的事）。
 *
 * 纯 TS、无框架依赖；卡表未加载时降级为"只做张数/副本/精英上限"的弱校验。
 */

import type { Card } from './types';
import { normalizeFactionName } from './types';
import { getCardIndex } from './loadCards';
import type { DecodedDeck } from './deckcode';

/* ============================================================
 * 1. 规则常量（统计结论，改这里即可全局生效）
 * ============================================================ */

export interface DeckRuleSet {
  /** 标准卡组必须正好这么多张 */
  deckSize: number;
  /** 允许的最少张数（构筑中/草稿态用） */
  minDeckSize: number;
  /** 单张卡最大副本数（非精英） */
  maxCopies: number;
  /** 精英卡最大副本数 */
  eliteCopies: number;
  /** 精英卡总张数上限（null = 不限制，仅受 39 张总量约束） */
  maxEliteTotal: number | null;
  /** 盟军（非主阵营）卡牌最大张数 */
  maxAllyCards: number;
  /** 允许的阵营数（主 + 1 盟军） */
  maxFactions: number;
  /** 是否允许中立/通用卡（faction === 'Neutral'） */
  allowNeutralCards: boolean;
  /** 是否允许预备池（isReserved）卡牌；仅非 standard 赛制受限 */
  allowReservedInStandard: boolean;
}

/**
 * 统计结论（2000 个公开卡组，"恰好 39 张" 命中率 100%，见 docs/DECK_RULES.md）：
 * - deckSize = 39（不是 40）
 * - 同名非精英卡 ≤ 4，精英卡 ≤ 1（按组内副本数统计）
 * - 盟军张数 ≤ 12（分布上界，越界样本 0 例）
 */
export const DECK_RULES: DeckRuleSet = {
  deckSize: 39,
  minDeckSize: 39,
  maxCopies: 4,
  eliteCopies: 1,
  maxEliteTotal: null,
  maxAllyCards: 12,
  maxFactions: 2,
  allowNeutralCards: true,
  allowReservedInStandard: true,
};

/* ============================================================
 * 2. 类型
 * ============================================================ */

export interface DeckValidationStats {
  total: number;
  byType: Record<string, number>;
  /** 费用 → 张数（1..12，0 为未知费用） */
  byKredits: Record<number, number>;
  /** 单位卡张数 */
  units: number;
  /** 指令/反制张数 */
  orders: number;
  /** 精英卡张数 */
  elite: number;
  /** 主阵营卡张数 */
  mainFactionCards: number;
  /** 盟军卡张数 */
  allyFactionCards: number;
}

export interface DeckValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: DeckValidationStats;
}

/** 参与校验的最小卡组形状（DecodedDeck / Deck 都满足） */
export interface ValidatableDeck {
  mainFaction?: string | null;
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

/**
 * 校验卡组。
 * @param deck  解码后的卡组（DecodedDeck 或 Deck 均可）
 * @param cards 可选的 cardId→Card 映射；省略时用 loadCards() 建立的全量索引
 */
export function validateDeck(deck: ValidatableDeck, cards?: Map<string, Card>): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = emptyStats();

  const index = cards ?? getCardIndex();
  const haveCardData = index.size > 0;
  if (!haveCardData) {
    warnings.push('卡表尚未加载，已跳过阵营归属与卡牌存在性校验（先 await loadCards()）');
  }

  const mainRaw = deck?.mainFaction ?? '';
  const allyRaw = deck?.allyFaction ?? '';
  const main = normalizeFactionName(String(mainRaw));
  const ally = allyRaw ? normalizeFactionName(String(allyRaw)) : '';
  if (!main) errors.push('缺少主阵营');
  if (ally && ally === main) warnings.push('盟军阵营与主阵营相同，已按"无盟军"处理');

  const allyEffective = ally && ally !== main ? ally : '';

  const seen = new Map<string, number>();
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
    if (haveCardData) {
      const card = index.get(cardId);
      if (!card) {
        errors.push(`卡牌 "${cardId}" 不在数据集中`);
        continue;
      }
      stats.byType[card.type] = (stats.byType[card.type] ?? 0) + count;
      stats.byKredits[card.kredits] = (stats.byKredits[card.kredits] ?? 0) + count;
      if (UNIT_TYPES.has(card.type)) stats.units += count;
      else stats.orders += count;
      if (card.rarity === 'Elite') {
        stats.elite += count;
        if (count > DECK_RULES.eliteCopies) {
          errors.push(`精英卡 "${card.nameZh || cardId}" 超限：${count} 张（上限 ${DECK_RULES.eliteCopies}）`);
        }
      } else if (count > DECK_RULES.maxCopies) {
        errors.push(`卡牌 "${card.nameZh || cardId}" 副本数超限：${count}（上限 ${DECK_RULES.maxCopies}）`);
      }

      // 阵营归属：主阵营可用 / 盟军可用 / 中立通用
      const own = normalizeFactionName(card.faction);
      const hostFactions = (card.hostFactions ?? []).map((f) => normalizeFactionName(String(f)));
      const usableByMain = own === main || (!hostFactions.length && own === 'Neutral') || hostFactions.includes(main);
      const usableByAlly =
        !!allyEffective && (own === allyEffective || hostFactions.includes(allyEffective));
      const neutral = own === 'Neutral' && DECK_RULES.allowNeutralCards;

      if (!usableByMain && !usableByAlly && !neutral) {
        errors.push(
          `卡牌 "${card.nameZh || cardId}" 属于 ${own}${hostFactions.length ? `（可入 ${hostFactions.join('/')}）` : ''}，` +
            `不能放入 ${main}${allyEffective ? `/${allyEffective}` : ''} 卡组`
        );
      } else if (usableByMain || neutral) {
        stats.mainFactionCards += count;
      } else {
        stats.allyFactionCards += count;
      }

      if (allyEffective && !usableByAlly && usableByMain && card.isReserved && !DECK_RULES.allowReservedInStandard) {
        warnings.push(`卡牌 "${card.nameZh || cardId}" 来自预备池`);
      }
    } else {
      if (count > DECK_RULES.maxCopies) {
        errors.push(`卡牌 "${cardId}" 副本数超限：${count}（上限 ${DECK_RULES.maxCopies}）`);
      }
    }
  }

  // 张数
  if (stats.total > DECK_RULES.deckSize) {
    errors.push(`卡组张数超限：${stats.total}（上限 ${DECK_RULES.deckSize}）`);
  } else if (stats.total < DECK_RULES.deckSize) {
    warnings.push(`卡组未满：${stats.total}/${DECK_RULES.deckSize} 张`);
  }

  // 盟军上限
  if (allyEffective && stats.allyFactionCards > DECK_RULES.maxAllyCards) {
    errors.push(
      `盟军卡超限：${stats.allyFactionCards} 张（${allyEffective}，上限 ${DECK_RULES.maxAllyCards}）`
    );
  }

  return { valid: errors.length === 0, errors, warnings, stats };
}

/* ============================================================
 * 4. 便捷判断
 * ============================================================ */

/** 该卡是否可用于某阵营的卡组（主阵营 + 盟军 + 中立通用） */
export function isCardUsableBy(card: Card, mainFaction: string, allyFaction?: string | null): boolean {
  const main = normalizeFactionName(mainFaction);
  const ally = allyFaction ? normalizeFactionName(allyFaction) : '';
  const own = normalizeFactionName(card.faction);
  const hosts = (card.hostFactions ?? []).map((f) => normalizeFactionName(String(f)));
  if (own === main || hosts.includes(main)) return true;
  if (own === 'Neutral') return true;
  if (ally && (own === ally || hosts.includes(ally))) return true;
  return false;
}

/** 该卡组距"合法"还差多少张（负数=超出）；用于构筑 UI 提示 */
export function deckSizeDelta(deck: ValidatableDeck): number {
  const total = (deck?.cards ?? []).reduce((sum, c) => sum + (Number(c.count) || 0), 0);
  return DECK_RULES.deckSize - total;
}

/** 编码前检查：返回导致无法编码的问题列表（空数组=可编码） */
export function encodeIssues(deck: ValidatableDeck): string[] {
  const issues: string[] = [];
  if (!deck?.mainFaction) issues.push('缺少主阵营');
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

/** 供测试/文档引用的规则快照（键 → 值） */
export function describeRules(rules: DeckRuleSet = DECK_RULES): string {
  return [
    `卡组张数：${rules.deckSize}`,
    `单卡上限：${rules.maxCopies}（精英 ${rules.eliteCopies}）`,
    `盟军上限：${rules.maxAllyCards}`,
    `阵营数：≤${rules.maxFactions}`,
  ].join('；');
}

export type { DecodedDeck };
