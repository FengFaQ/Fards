import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DeckData, FeaturedDeck, UiCard } from '../lib/dataBridge';
import { checkAddCard, RULES, type AddCheck } from '../lib/deckUi';
import { factionZh, isFactionAllowed } from '../lib/format';

export interface SavedDeck extends DeckData {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export type DeckMutateResult = AddCheck;

interface DeckStore {
  /** 当前编辑中的卡组（未保存也会作为草稿持久化） */
  current: SavedDeck | null;
  /** 已保存的卡组（localStorage） */
  decks: SavedDeck[];

  createDeck: (faction: string, allyFaction?: string | null, name?: string) => SavedDeck;
  importDeck: (data: DeckData, name?: string) => SavedDeck;
  loadSavedDeck: (id: string) => boolean;
  loadFeatured: (featured: FeaturedDeck) => boolean;
  deleteSavedDeck: (id: string) => void;
  renameCurrent: (name: string) => void;
  /** 切换阵营，返回因阵营变更被剔除的卡牌张数（不传 byId 则只做阵营记录） */
  setFactions: (faction: string, allyFaction: string | null, byId?: Map<string, UiCard>) => number;
  addCard: (card: UiCard, byId: Map<string, UiCard>) => DeckMutateResult;
  removeCard: (cardId: string) => void;
  setCardCount: (card: UiCard, count: number, byId: Map<string, UiCard>) => DeckMutateResult;
  clearCards: () => void;
  saveCurrent: () => SavedDeck | null;
  discardCurrent: () => void;
}

const uid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* 忽略 */
  }
  return `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const now = () => Date.now();

function cloneDeck(deck: SavedDeck): SavedDeck {
  return { ...deck, cards: deck.cards.map((c) => ({ ...c })) };
}

function makeDraft(faction: string, allyFaction: string | null, name?: string): SavedDeck {
  const ts = now();
  return {
    id: uid(),
    name: name ?? `${factionZh(faction)} 战斗群`,
    faction,
    allyFaction: allyFaction && allyFaction !== faction ? allyFaction : null,
    cards: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

function withCards(deck: SavedDeck, cards: DeckData['cards']): SavedDeck {
  return { ...deck, cards: cards.map((c) => ({ cardId: c.cardId, count: c.count })), updatedAt: now() };
}

function upsert(list: SavedDeck[], deck: SavedDeck): SavedDeck[] {
  const next = list.filter((d) => d.id !== deck.id);
  next.unshift(deck);
  return next;
}

export const useDeckStore = create<DeckStore>()(
  persist(
    (set, get) => ({
      current: null,
      decks: [],

      createDeck: (faction, allyFaction = null, name) => {
        const draft = makeDraft(faction, allyFaction, name);
        set({ current: draft });
        return draft;
      },

      importDeck: (data, name) => {
        const draft: SavedDeck = {
          ...makeDraft(data.faction, data.allyFaction, name),
          cards: data.cards.map((c) => ({ cardId: c.cardId, count: c.count })),
        };
        set({ current: draft });
        return draft;
      },

      loadSavedDeck: (id) => {
        const hit = get().decks.find((d) => d.id === id);
        if (!hit) return false;
        set({ current: cloneDeck(hit) });
        return true;
      },

      loadFeatured: (featured) => {
        if (!featured.deck) return false;
        const draft: SavedDeck = {
          ...makeDraft(featured.faction, featured.allyFaction, featured.name),
          cards: featured.deck.cards.map((c) => ({ cardId: c.cardId, count: c.count })),
        };
        set({ current: draft });
        return true;
      },

      deleteSavedDeck: (id) => set((state) => ({ decks: state.decks.filter((d) => d.id !== id) })),

      renameCurrent: (name) =>
        set((state) =>
          state.current
            ? { current: { ...state.current, name: name.slice(0, 40), updatedAt: now() } }
            : state,
        ),

      setFactions: (faction, allyFaction, byId) => {
        const current = get().current;
        const nextAlly = allyFaction && allyFaction !== faction ? allyFaction : null;
        if (!current) {
          set({ current: makeDraft(faction, nextAlly) });
          return 0;
        }
        let removed = 0;
        const cards = current.cards.filter((entry) => {
          if (entry.count <= 0) return false;
          const card = byId?.get(entry.cardId);
          if (!card) return true;
          const allowed = isFactionAllowed(card, faction, nextAlly);
          if (!allowed) removed += entry.count;
          return allowed;
        });
        set({
          current: { ...current, faction, allyFaction: nextAlly, cards, updatedAt: now() },
        });
        return removed;
      },

      addCard: (card, byId) => {
        const current = get().current;
        if (!current) return { ok: false, reason: '请先确定主阵营' };
        const check = checkAddCard(card, current, byId);
        if (!check.ok) return check;
        const existing = current.cards.find((c) => c.cardId === card.cardId);
        const cards = existing
          ? current.cards.map((c) =>
              c.cardId === card.cardId ? { ...c, count: c.count + 1 } : c,
            )
          : [...current.cards, { cardId: card.cardId, count: 1 }];
        set({ current: withCards(current, cards) });
        return { ok: true };
      },

      removeCard: (cardId) => {
        const current = get().current;
        if (!current) return;
        const existing = current.cards.find((c) => c.cardId === cardId);
        if (!existing) return;
        const cards =
          existing.count <= 1
            ? current.cards.filter((c) => c.cardId !== cardId)
            : current.cards.map((c) => (c.cardId === cardId ? { ...c, count: c.count - 1 } : c));
        set({ current: withCards(current, cards) });
      },

      setCardCount: (card, count, byId) => {
        const current = get().current;
        if (!current) return { ok: false, reason: '尚未建立战斗群' };
        const target = Math.max(0, Math.floor(count));
        const currentCount = current.cards.find((c) => c.cardId === card.cardId)?.count ?? 0;
        const cap = card.rarity === 'Elite' ? RULES.maxElite : RULES.maxCopies;
        const clamped = Math.min(target, cap);

        if (clamped === 0) {
          set({
            current: withCards(
              current,
              current.cards.filter((c) => c.cardId !== card.cardId),
            ),
          });
          return { ok: true };
        }

        if (clamped <= currentCount) {
          set({
            current: withCards(
              current,
              current.cards.map((c) =>
                c.cardId === card.cardId ? { ...c, count: clamped } : c,
              ),
            ),
          });
          return { ok: true };
        }

        if (clamped - currentCount > 1) {
          const check = checkAddCard(card, current, byId);
          if (!check.ok) return check;
        }

        const exists = current.cards.some((c) => c.cardId === card.cardId);
        const cards = exists
          ? current.cards.map((c) =>
              c.cardId === card.cardId ? { ...c, count: clamped } : c,
            )
          : [...current.cards, { cardId: card.cardId, count: clamped }];
        set({ current: withCards(current, cards) });
        return { ok: true };
      },

      clearCards: () => {
        const current = get().current;
        if (!current) return;
        set({ current: withCards(current, []) });
      },

      saveCurrent: () => {
        const current = get().current;
        if (!current) return null;
        const saved: SavedDeck = withCards(current, current.cards);
        set((state) => ({ current: saved, decks: upsert(state.decks, saved) }));
        return saved;
      },

      discardCurrent: () => set({ current: null }),
    }),
    {
      name: 'fards.decks.v1',
      version: 1,
      partialize: (state) => ({ current: state.current, decks: state.decks }),
    },
  ),
);

export const useCurrentDeck = (): SavedDeck | null => useDeckStore((s) => s.current);
export const useSavedDecks = (): SavedDeck[] => useDeckStore((s) => s.decks);
