/**
 * 局域网对战：卡组载荷转换与校验
 * ------------------------------------------------------------------
 * 大厅 UI 使用 DeckData（faction/cards）与 SavedDeck（本地卡组），
 * 网络协议使用 LanDeckPayload（mainFaction/allyFaction/cards）。
 */
import type { LanDeckPayload } from '@/net/protocol';
import {
  validateDeckWithLayer,
  type DeckData,
  type UiCard,
} from '../lib/dataBridge';
import { DECK_RULES_VIEW } from '../lib/dataBridge';
import { factionMeta } from '../lib/format';
import type { SavedDeck } from '../stores/deckStore';
import { buildQuickDeck, quickDeckName } from '../battle/decks';

export type DeckChoice =
  | { kind: 'saved'; id: string }
  | { kind: 'quick'; faction: string };

export const QUICK_FACTIONS = [
  'Germany',
  'USA',
  'Britain',
  'Japan',
  'Soviet',
  'France',
  'Italy',
  'Finland',
  'Poland',
] as const;

export function savedDeckToLan(deck: SavedDeck): LanDeckPayload {
  return {
    name: deck.name,
    mainFaction: deck.faction,
    allyFaction: deck.allyFaction,
    cards: deck.cards.map((entry) => ({ cardId: entry.cardId, count: entry.count })),
  };
}

export function deckDataToLan(deck: DeckData, name: string): LanDeckPayload {
  return {
    name,
    mainFaction: deck.faction,
    allyFaction: deck.allyFaction,
    cards: deck.cards.map((entry) => ({ cardId: entry.cardId, count: entry.count })),
  };
}

export function lanToDeckData(payload: LanDeckPayload): DeckData {
  return {
    faction: payload.mainFaction,
    allyFaction: payload.allyFaction,
    cards: payload.cards.map((entry) => ({ cardId: entry.cardId, count: entry.count })),
  };
}

export function lanCardCount(payload: LanDeckPayload | null | undefined): number {
  if (!payload) return 0;
  return payload.cards.reduce((sum, entry) => sum + entry.count, 0);
}

export function lanDeckLabel(payload: LanDeckPayload | null | undefined): string {
  if (!payload) return '未选择卡组';
  const main = factionMeta(payload.mainFaction).zh;
  const ally = payload.allyFaction ? ` + ${factionMeta(payload.allyFaction).zh}` : '';
  return `${payload.name || '未命名战斗群'} · ${main}${ally} · ${lanCardCount(payload)} 张`;
}

export interface LanDeckCheck {
  ok: boolean;
  errors: string[];
}

/** 校验线上卡组载荷（优先用数据层 validateDeck，失败时退化为张数/同名/精英检查） */
export function validateLanDeck(payload: LanDeckPayload | null | undefined): LanDeckCheck {
  if (!payload) return { ok: false, errors: ['对手还没有发送卡组'] };
  const total = lanCardCount(payload);
  if (total !== DECK_RULES_VIEW.deckSize) {
    return {
      ok: false,
      errors: [`卡组需 ${DECK_RULES_VIEW.deckSize} 张，当前 ${total} 张`],
    };
  }
  const view = validateDeckWithLayer(lanToDeckData(payload));
  if (view) {
    return { ok: view.legal, errors: view.legal ? [] : [...view.errors, ...view.warnings] };
  }
  return { ok: true, errors: [] };
}

/** 快速编组：从数据集中为指定阵营生成一套 39 张可用卡组 */
export function quickLanDeck(faction: string, cards: UiCard[], seed = 1): LanDeckPayload | null {
  if (!cards.length) return null;
  const deck = buildQuickDeck(faction, cards, seed);
  return deckDataToLan(deck, quickDeckName(faction));
}

/** 把大厅里选择的卡组解析成网络载荷 */
export function resolveLanDeck(
  choice: DeckChoice | null,
  decks: SavedDeck[],
  cards: UiCard[],
): LanDeckPayload | null {
  if (!choice) return null;
  if (choice.kind === 'saved') {
    const deck = decks.find((item) => item.id === choice.id);
    return deck ? savedDeckToLan(deck) : null;
  }
  return quickLanDeck(choice.faction, cards);
}
