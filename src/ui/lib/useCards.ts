import { useEffect, useMemo, useState } from 'react';
import {
  loadAllCards,
  loadFeaturedDecks,
  withBase,
  type FeaturedDeck,
  type UiCard,
} from './dataBridge';

export interface CardsState {
  cards: UiCard[];
  byId: Map<string, UiCard>;
  byImportId: Map<string, UiCard>;
  loading: boolean;
  error: string | null;
}

const EMPTY: CardsState = {
  cards: [],
  byId: new Map(),
  byImportId: new Map(),
  loading: true,
  error: null,
};

let cardsSnapshot: { cards: UiCard[]; byId: Map<string, UiCard>; byImportId: Map<string, UiCard> } | null =
  null;
let inflight: Promise<CardsState> | null = null;

function buildState(cards: UiCard[]): CardsState {
  const byId = new Map(cards.map((c) => [c.cardId, c]));
  const byImportId = new Map(
    cards.filter((c) => c.importId).map((c) => [String(c.importId), c]),
  );
  cardsSnapshot = { cards, byId, byImportId };
  return { cards, byId, byImportId, loading: false, error: null };
}

/** 全量卡牌数据（进程级缓存，多页面复用） */
export function useCards(): CardsState {
  const [state, setState] = useState<CardsState>(() =>
    cardsSnapshot ? { ...cardsSnapshot, loading: false, error: null } : EMPTY,
  );

  useEffect(() => {
    if (cardsSnapshot) return;
    let alive = true;
    if (!inflight) {
      inflight = loadAllCards()
        .then((cards) => buildState(cards))
        .catch((err: unknown) => {
          inflight = null;
          return {
            ...EMPTY,
            loading: false,
            error: err instanceof Error ? err.message : '卡牌数据加载失败',
          } satisfies CardsState;
        });
    }
    inflight.then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/* --------------------------------------------------------------------------
 * 卡牌总量（首页用）
 * 首页只显示「共 N 张卡牌」，没必要为了一个数字下载 + 解析 1.3MB 的 cards.json。
 * 优先读 public/data/meta.json（约 2KB，构建数据时生成的统计快照），
 * 只有在 meta 缺失/不可用时才回退到全量卡牌。
 * -------------------------------------------------------------------------- */
export interface CardSummaryState {
  total: number;
  loading: boolean;
}

let summaryCache: CardSummaryState | null = null;
let summaryInflight: Promise<CardSummaryState> | null = null;

async function loadCardSummary(): Promise<CardSummaryState> {
  if (cardsSnapshot) return { total: cardsSnapshot.cards.length, loading: false };
  try {
    const res = await fetch(withBase('data/meta.json'));
    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>;
      const total = Number(json.uniqueCount ?? json.apiTotal ?? json.fetchedCount ?? 0);
      if (Number.isFinite(total) && total > 0) return { total, loading: false };
    }
  } catch {
    /* 回退到全量卡牌 */
  }
  const cards = await loadAllCards();
  return { total: cards.length, loading: false };
}

/** 轻量卡牌总数（不触发全量卡牌加载） */
export function useCardSummary(): CardSummaryState {
  const [state, setState] = useState<CardSummaryState>(
    () =>
      summaryCache ??
      (cardsSnapshot
        ? { total: cardsSnapshot.cards.length, loading: false }
        : { total: 0, loading: true }),
  );

  useEffect(() => {
    if (!state.loading) return;
    let alive = true;
    if (!summaryInflight) {
      summaryInflight = loadCardSummary()
        .then((next) => {
          summaryCache = next;
          return next;
        })
        .catch(() => {
          summaryInflight = null;
          return { total: 0, loading: false } satisfies CardSummaryState;
        });
    }
    summaryInflight.then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [state.loading]);

  return state;
}

export interface FeaturedState {
  decks: FeaturedDeck[];
  loading: boolean;
}/** 热门卡组（缺失时返回空数组，页面优雅隐藏） */
export function useFeaturedDecks(): FeaturedState {
  const [state, setState] = useState<FeaturedState>({ decks: [], loading: true });
  useEffect(() => {
    let alive = true;
    loadFeaturedDecks().then((decks) => {
      if (alive) setState({ decks, loading: false });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** 按 cardId 取卡（供 store 内部/工具函数使用，避免重复建索引） */
export function useCardIndex() {
  const { byId, loading } = useCards();
  return useMemo(() => ({ byId, loading }), [byId, loading]);
}
