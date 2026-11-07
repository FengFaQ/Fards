/**
 * AI 卡组预置生成（UI 直接复用：没有自建卡组时给 AI 一副可用牌）。
 * ------------------------------------------------------------------
 * 规则（与 src/data/deckRules.ts 一致，但本文件不依赖 data 层，避免引擎→数据层反向依赖）：
 * - 39 张，同名卡上限 Standard 4 / Limited 3 / Special 2 / Elite 1
 * - 主阵营卡 + 盟军卡（hostFactions 含主阵营），盟军 ≤ 12 张
 * - 只用 pool==='active' 且非衍生卡
 * 选牌不是纯均匀随机：按「单位优先、费用 1~5 优先」加权，保证 AI 卡组能形成曲线、
 * 不会抽到一手 9 费牌导致对局卡死。seed 相同 → 卡组相同（可复现）。
 */
import type { CardDef } from '../types';

/** 与 data 层 DeckCard 结构一致（{cardId, count}），避免引擎依赖数据层 */
export interface AIDeckCard {
  cardId: string;
  count: number;
}
export type DeckCard = AIDeckCard;

export const AI_DECK_SIZE = 39;
export const MAX_ALLY_CARDS = 12;

export const RARITY_COPY_CAP: Readonly<Record<string, number>> = {
  Standard: 4,
  Limited: 3,
  Special: 2,
  Elite: 1,
};

const FACTION_ALIASES: Readonly<Record<string, string>> = {
  USSR: 'Soviet',
  SovietUnion: 'Soviet',
  'Soviet Union': 'Soviet',
  Uk: 'Britain',
  UK: 'Britain',
  GreatBritain: 'Britain',
  Anzacs: 'Anzac',
};

/** 阵营名归一化（大小写/别名不敏感） */
export function normalizeFactionName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = String(name).trim();
  if (!trimmed) return '';
  const alias = FACTION_ALIASES[trimmed];
  if (alias) return alias;
  const compact = trimmed.replace(/[\s_-]/g, '').toLowerCase();
  for (const candidate of [...Object.keys(FACTION_ALIASES), ...Object.values(FACTION_ALIASES), 'Germany', 'USA', 'Britain', 'Japan', 'Soviet', 'France', 'Italy', 'Finland', 'Poland', 'Anzac', 'Neutral']) {
    if (candidate.replace(/[\s_-]/g, '').toLowerCase() === compact) {
      return FACTION_ALIASES[candidate] ?? candidate;
    }
  }
  return trimmed;
}

/** 该卡能否进入某主阵营的卡组（主阵营 / 盟军阵营） */
export function isCardLegalForDeck(card: CardDef, mainFaction: string): boolean {
  if (!card || card.isDerived) return false;
  if (card.pool !== 'active') return false;
  const main = normalizeFactionName(mainFaction);
  if (!main) return false;
  if (normalizeFactionName(card.faction) === main) return true;
  if ((card.hostFactions ?? []).some((f) => normalizeFactionName(String(f)) === main)) return true;
  if (normalizeFactionName(card.faction) === 'Neutral') return true;
  return false;
}

function copiesCap(card: CardDef): number {
  return RARITY_COPY_CAP[card.rarity] ?? 4;
}

/** 选牌权重：单位 / 中低费更受青睐 */
function deckWeight(card: CardDef): number {
  const isUnit = card.type !== 'order' && card.type !== 'countermeasure';
  let weight = isUnit ? 3.2 : 0.85;
  const cost = Math.max(0, card.kredits);
  if (cost <= 1) weight *= 0.7;
  else if (cost <= 4) weight *= 1.75;
  else if (cost <= 6) weight *= 1.1;
  else weight *= 0.4;
  if (card.rarity === 'Elite') weight *= 0.75;
  return weight;
}

function createSeededRandom(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * 生成一副 39 张的 AI 卡组。
 * @param faction 主阵营（大小写/别名不敏感，如 'Germany' / 'USSR'）
 * @param cards   全量卡牌数据（CardDef[]，通常来自 public/data/cards.json）
 * @param seed    随机种子（相同 seed 结果相同；省略时用 1）
 */
export function aiDeckPreset(faction: string, cards: CardDef[], seed = 1): AIDeckCard[] {
  const main = normalizeFactionName(faction);
  const pool = (cards ?? []).filter((card) => isCardLegalForDeck(card, main));
  if (pool.length === 0) return [];
  // 每个阵营的盟军可用卡极少，这里按「盟军 ≤ 12」动态收紧
  const counts = new Map<string, number>();
  const rng = createSeededRandom(seed + 1);
  let total = 0;
  let ally = 0;
  let guard = 0;

  while (total < AI_DECK_SIZE && guard < 4000) {
    guard += 1;
    // 加权抽取一个仍有余量的候选
    let weightSum = 0;
    const weights: number[] = [];
    for (const card of pool) {
      const cur = counts.get(card.cardId) ?? 0;
      const cap = copiesCap(card);
      if (cur >= cap) {
        weights.push(0);
        continue;
      }
      if (normalizeFactionName(card.faction) !== main && ally >= MAX_ALLY_CARDS) {
        weights.push(0);
        continue;
      }
      const w = deckWeight(card);
      weights.push(w);
      weightSum += w;
    }
    if (weightSum <= 0) break;
    let roll = rng() * weightSum;
    let picked = -1;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (weights[i] > 0 && roll <= 0) {
        picked = i;
        break;
      }
    }
    if (picked < 0) {
      // 数值误差兜底：取最后一个有权重的
      for (let i = pool.length - 1; i >= 0; i--) {
        if (weights[i] > 0) {
          picked = i;
          break;
        }
      }
    }
    if (picked < 0) break;
    const card = pool[picked];
    counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1);
    total += 1;
    if (normalizeFactionName(card.faction) !== main) ally += 1;
  }

  return [...counts.entries()].map(([cardId, count]) => ({ cardId, count }));
}

/** 卡组总张数 */
export function deckCardCount(deck: readonly AIDeckCard[]): number {
  return deck.reduce((sum, card) => sum + Math.max(0, card.count), 0);
}
