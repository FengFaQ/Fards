/**
 * 快速编组：从数据集里为某个阵营自动配一套 **合法 39 张** 卡组。
 * 用途：
 * 1) 玩家没有保存卡组时的「快速编组」（可直接开打，不必先去构筑页）；
 * 2) AI 对手的卡组（当 engine/ai.ts 的 aiDeckPreset 尚未就绪时的本地兜底）。
 *
 * 合法性口径（与 src/data/deckRules.ts 一致，并按稀有度收紧副本上限）：
 *  - 张数 = 39
 *  - 副本上限：Standard 4 / Limited 3 / Special 2 / Elite 1
 *  - 只取主阵营 + 中立（不启用盟军，避免盟军 12 张上限的复杂度）
 *  - 只取 active 池、非 reserved、非衍生
 */
import type { DeckCardEntry, DeckData, UiCard } from '../lib/dataBridge';
import { factionMeta, isFactionAllowed } from '../lib/format';

/** 标准卡组张数（KARDS 39，不是 40） */
export const QUICK_DECK_SIZE = 39;

/* ---------------- 可复现随机 ---------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ---------------- 规则常量 ---------------- */

const ORDER_TYPES = new Set(['order', 'countermeasure']);

/** 稀有度副本上限（收紧口径） */
const RARITY_COPY_CAP: Record<string, number> = {
  Standard: 4,
  Limited: 3,
  Special: 2,
  Elite: 1,
};

function copyCap(card: UiCard): number {
  return RARITY_COPY_CAP[card.rarity] ?? 4;
}

function isOrder(card: UiCard): boolean {
  return ORDER_TYPES.has(card.type);
}

function isDeckable(card: UiCard, faction: string): boolean {
  if (!card?.cardId) return false;
  if (card.isDerived) return false;
  if (card.pool !== 'active') return false;
  if (card.isReserved) return false;
  if (card.type === 'countermeasure') return false;
  return isFactionAllowed(card, faction, null);
}

/** 费用段目标张数（合计 39） */
const CURVE_PLAN: { cost: number; want: number }[] = [
  { cost: 1, want: 10 },
  { cost: 2, want: 11 },
  { cost: 3, want: 9 },
  { cost: 4, want: 5 },
  { cost: 5, want: 2 },
  { cost: 6, want: 2 },
];

/* ---------------- 组卡 ---------------- */

/**
 * 为阵营生成一套合法 39 张卡组。
 * @param faction 主阵营（英文 key，支持别名）
 * @param cards   全量卡牌
 * @param seed    随机种子（同种子同卡组，便于复现与截图）
 */
export function buildQuickDeck(faction: string, cards: UiCard[], seed = 1): DeckData {
  const mainFaction = factionMeta(faction).key;
  const rand = mulberry32((hashString(mainFaction) ^ (seed >>> 0)) >>> 0);
  const pool = cards.filter((card) => isDeckable(card, mainFaction));
  const entries = new Map<string, DeckCardEntry>();

  const add = (card: UiCard): boolean => {
    const current = entries.get(card.cardId)?.count ?? 0;
    const cap = copyCap(card);
    if (current >= cap) return false;
    entries.set(card.cardId, { cardId: card.cardId, count: current + 1 });
    return true;
  };

  const total = () => [...entries.values()].reduce((sum, entry) => sum + entry.count, 0);
  const unitCount = () =>
    [...entries.values()].reduce((sum, entry) => {
      const card = pool.find((item) => item.cardId === entry.cardId);
      return card && !isOrder(card) ? sum + entry.count : sum;
    }, 0);

  const buckets = new Map<number, { units: UiCard[]; orders: UiCard[] }>();
  for (const card of pool) {
    const key = Math.min(6, Math.max(1, Math.round(card.kredits)));
    const bucket = buckets.get(key) ?? { units: [], orders: [] };
    if (isOrder(card)) bucket.orders.push(card);
    else bucket.units.push(card);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.units = shuffle(bucket.units, rand);
    bucket.orders = shuffle(bucket.orders, rand);
  }

  /** 在某个费用段里循环取卡，直到张数达标或该段全部满编 */
  const fillBucket = (cost: number, want: number): number => {
    const bucket = buckets.get(cost);
    if (!bucket) return 0;
    // 单位 : 指令 ≈ 2 : 1，保证场面有兵可下
    const queue: UiCard[] = [];
    let ui = 0;
    let oi = 0;
    while (ui < bucket.units.length || oi < bucket.orders.length) {
      if (ui < bucket.units.length) queue.push(bucket.units[ui++]);
      if (ui < bucket.units.length) queue.push(bucket.units[ui++]);
      if (oi < bucket.orders.length) queue.push(bucket.orders[oi++]);
    }
    if (!queue.length) return 0;
    let filled = 0;
    let index = 0;
    let guard = 0;
    while (filled < want && guard < 400) {
      guard += 1;
      const card = queue[index % queue.length];
      index += 1;
      if (add(card)) filled += 1;
      // 一轮下来一张都加不进去 → 该费用段已满编
      if (index % queue.length === 0 && filled === 0) break;
      if (index > queue.length * 6) break;
    }
    return filled;
  };

  for (const { cost, want } of CURVE_PLAN) {
    if (total() >= QUICK_DECK_SIZE) break;
    fillBucket(cost, Math.min(want, QUICK_DECK_SIZE - total()));
  }

  // 曲线段凑不满（某些阵营低费卡少）→ 用剩余可入卡补足
  if (total() < QUICK_DECK_SIZE) {
    const rest = shuffle(pool, rand);
    let guard = 0;
    while (total() < QUICK_DECK_SIZE && guard < 800) {
      guard += 1;
      let progressed = false;
      for (const card of rest) {
        if (total() >= QUICK_DECK_SIZE) break;
        if (add(card)) progressed = true;
      }
      if (!progressed) break;
    }
  }

  // 单位太少时，把部分指令替换成单位（保证能打）
  if (unitCount() < 14) {
    const spareUnits = shuffle(
      pool.filter((card) => !isOrder(card) && (entries.get(card.cardId)?.count ?? 0) < copyCap(card)),
      rand,
    );
    const orderEntries = [...entries.entries()].filter(([, entry]) => {
      const card = pool.find((item) => item.cardId === entry.cardId);
      return card && isOrder(card) && entry.count > 1;
    });
    for (const [cardId] of orderEntries) {
      if (unitCount() >= 16) break;
      const entry = entries.get(cardId);
      if (!entry || entry.count <= 1) continue;
      const replacement = spareUnits.shift();
      if (!replacement) break;
      entries.set(cardId, { cardId, count: entry.count - 1 });
      const current = entries.get(replacement.cardId)?.count ?? 0;
      entries.set(replacement.cardId, { cardId: replacement.cardId, count: current + 1 });
    }
  }

  // 收尾：裁到 39（理论上不会触发，防御性处理）
  let cardsOut = [...entries.values()].filter((entry) => entry.count > 0);
  let overflow = cardsOut.reduce((sum, entry) => sum + entry.count, 0) - QUICK_DECK_SIZE;
  while (overflow > 0) {
    for (const entry of cardsOut) {
      if (overflow <= 0) break;
      if (entry.count > 1) {
        entry.count -= 1;
        overflow -= 1;
      }
    }
    cardsOut = cardsOut.filter((entry) => entry.count > 0);
    if (cardsOut.every((entry) => entry.count <= 1)) {
      cardsOut = cardsOut.slice(0, QUICK_DECK_SIZE);
      overflow = 0;
    }
  }

  return { faction: mainFaction, allyFaction: null, cards: cardsOut };
}

/* ---------------- 展示信息 ---------------- */

const DIVISION_SUFFIX = [
  '装甲师',
  '掷弹兵团',
  '空降师',
  '步兵师',
  '机械化军',
  '远征军',
  '卫戍旅',
  '战斗群',
  '突击炮兵团',
  '山地兵团',
];

/** AI 对手的番号（同一阵营按 seed 取稳定的番号） */
export function divisionName(faction: string, seed = 1): string {
  const rand = mulberry32((hashString(faction) ^ hashString('div') ^ (seed >>> 0)) >>> 0);
  const index = Math.floor(rand() * DIVISION_SUFFIX.length);
  const number = 1 + Math.floor(rand() * 12);
  return `第 ${number} ${DIVISION_SUFFIX[index] ?? '战斗群'}`;
}

/** 玩家快速卡组名称 */
export function quickDeckName(faction: string): string {
  return `${factionMeta(faction).zh} 快速战斗群`;
}

/** 卡组张数 */
export function deckCardCount(deck: DeckData | null | undefined): number {
  if (!deck) return 0;
  return deck.cards.reduce((sum, entry) => sum + entry.count, 0);
}
