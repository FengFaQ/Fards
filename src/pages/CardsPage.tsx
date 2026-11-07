import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CardDetailDialog } from '../ui/components/CardDetailDialog';
import { CardView } from '../ui/components/CardView';
import { EmptyState } from '../ui/components/EmptyState';
import { FacetGroup, type FacetOption } from '../ui/components/FacetGroup';
import { PageHeader } from '../ui/components/PageHeader';
import { SearchInput } from '../ui/components/SearchInput';
import { checkAddCard } from '../ui/lib/deckUi';
import { useCards } from '../ui/lib/useCards';
import { useInView } from '../ui/lib/useInView';
import {
  CARD_TYPE_ORDER,
  FACTION_ORDER,
  KEYWORD_FILTERS,
  POOL_ORDER,
  RARITY_ORDER,
  SET_ORDER,
  cardKeywords,
  cardTypeMeta,
  factionMeta,
  keywordMeta,
  poolZh,
  rarityMeta,
  setZh,
} from '../ui/lib/format';
import type { UiCard } from '../ui/lib/dataBridge';
import { useDeckStore } from '../ui/stores/deckStore';
import { toast } from '../ui/stores/toastStore';
import { IconFilter, IconRefresh, IconShield } from '../ui/components/icons';

type SortKey = 'kredits' | 'name' | 'rarity' | 'attack' | 'defense' | 'faction';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'kredits', label: '按费用' },
  { value: 'name', label: '按名称' },
  { value: 'rarity', label: '按稀有度' },
  { value: 'attack', label: '按攻击' },
  { value: 'defense', label: '按防御' },
  { value: 'faction', label: '按阵营' },
];

const PAGE_SIZE = 120;

interface Filters {
  search: string;
  factions: string[];
  types: string[];
  rarities: string[];
  kredits: string[];
  sets: string[];
  pools: string[];
  keywords: string[];
}

const EMPTY_FILTERS: Filters = {
  search: '',
  factions: [],
  types: [],
  rarities: [],
  kredits: [],
  sets: [],
  pools: [],
  keywords: [],
};

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function matchesSearch(card: UiCard, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    card.nameZh.toLowerCase().includes(q) ||
    card.nameEn.toLowerCase().includes(q) ||
    card.cardId.toLowerCase().includes(q) ||
    (card.description ?? '').toLowerCase().includes(q)
  );
}

function sortCards(cards: UiCard[], sort: SortKey): UiCard[] {
  const rarityIndex = (rarity: string) => {
    const index = RARITY_ORDER.indexOf(rarityMeta(rarity).key as (typeof RARITY_ORDER)[number]);
    return index < 0 ? 0 : index;
  };
  const factionIndex = (faction: string) => {
    const index = FACTION_ORDER.indexOf(factionMeta(faction).key as (typeof FACTION_ORDER)[number]);
    return index < 0 ? 99 : index;
  };
  const list = [...cards];
  list.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.nameZh.localeCompare(b.nameZh, 'zh-Hans-CN');
      case 'rarity':
        return rarityIndex(b.rarity) - rarityIndex(a.rarity) || a.kredits - b.kredits;
      case 'attack':
        return b.attack - a.attack || a.kredits - b.kredits;
      case 'defense':
        return b.defense - a.defense || a.kredits - b.kredits;
      case 'faction':
        return factionIndex(a.faction) - factionIndex(b.faction) || a.kredits - b.kredits;
      case 'kredits':
      default:
        return a.kredits - b.kredits || a.nameZh.localeCompare(b.nameZh, 'zh-Hans-CN');
    }
  });
  return list;
}

export default function CardsPage() {
  const { cards, byId, loading, error } = useCards();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    search: searchParams.get('search') ?? searchParams.get('q') ?? '',
    factions: searchParams.get('faction') ? [searchParams.get('faction') as string] : [],
    types: searchParams.get('type') ? [searchParams.get('type') as string] : [],
  }));
  const [sort, setSort] = useState<SortKey>((searchParams.get('sort') as SortKey) ?? 'kredits');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<UiCard | null>(null);

  const currentDeck = useDeckStore((s) => s.current);
  const addCard = useDeckStore((s) => s.addCard);
  const { ref: sentinelRef, inView } = useInView<HTMLDivElement>({
    once: false,
    rootMargin: '520px 0px',
  });

  /* ---------------- 统计与选项 ---------------- */
  const stats = useMemo(() => {
    const factionCount = new Map<string, number>();
    const typeCount = new Map<string, number>();
    const rarityCount = new Map<string, number>();
    const kreditCount = new Map<string, number>();
    const setCount = new Map<string, number>();
    const poolCount = new Map<string, number>();
    const keywordCount = new Map<string, number>();
    for (const card of cards) {
      factionCount.set(factionMeta(card.faction).key, (factionCount.get(factionMeta(card.faction).key) ?? 0) + 1);
      typeCount.set(card.type, (typeCount.get(card.type) ?? 0) + 1);
      rarityCount.set(rarityMeta(card.rarity).key, (rarityCount.get(rarityMeta(card.rarity).key) ?? 0) + 1);
      const kredit = Math.min(card.kredits, 9);
      kreditCount.set(String(kredit), (kreditCount.get(String(kredit)) ?? 0) + 1);
      setCount.set(card.set, (setCount.get(card.set) ?? 0) + 1);
      poolCount.set(card.pool, (poolCount.get(card.pool) ?? 0) + 1);
      for (const keyword of cardKeywords(card)) {
        keywordCount.set(keyword.id, (keywordCount.get(keyword.id) ?? 0) + 1);
      }
    }
    return { factionCount, typeCount, rarityCount, kreditCount, setCount, poolCount, keywordCount };
  }, [cards]);

  const factionOptions: FacetOption[] = useMemo(
    () =>
      FACTION_ORDER.filter((f) => stats.factionCount.get(f)).map((f) => ({
        value: f,
        label: factionMeta(f).zh,
        count: stats.factionCount.get(f) ?? 0,
        color: factionMeta(f).color,
      })),
    [stats],
  );

  const typeOptions: FacetOption[] = useMemo(
    () =>
      CARD_TYPE_ORDER.filter((t) => stats.typeCount.get(t)).map((t) => ({
        value: t,
        label: cardTypeMeta(t).zh,
        count: stats.typeCount.get(t) ?? 0,
      })),
    [stats],
  );

  const rarityOptions: FacetOption[] = useMemo(
    () =>
      RARITY_ORDER.filter((r) => stats.rarityCount.get(r)).map((r) => ({
        value: r,
        label: rarityMeta(r).zh,
        count: stats.rarityCount.get(r) ?? 0,
        color: rarityMeta(r).color,
      })),
    [stats],
  );

  const kreditOptions: FacetOption[] = useMemo(
    () =>
      Array.from({ length: 10 }, (_, index) => ({
        value: String(index),
        label: index === 9 ? '9+' : String(index),
        count: stats.kreditCount.get(String(index)) ?? 0,
      })).filter((option) => option.count > 0),
    [stats],
  );

  const setOptions: FacetOption[] = useMemo(
    () =>
      SET_ORDER.filter((set) => stats.setCount.get(set)).map((set) => ({
        value: set,
        label: setZh(set),
        count: stats.setCount.get(set) ?? 0,
      })),
    [stats],
  );

  const poolOptions: FacetOption[] = useMemo(
    () =>
      POOL_ORDER.filter((p) => stats.poolCount.get(p)).map((p) => ({
        value: p,
        label: poolZh(p),
        count: stats.poolCount.get(p) ?? 0,
      })),
    [stats],
  );

  const keywordOptions: FacetOption[] = useMemo(() => {
    const extra = [...stats.keywordCount.keys()].filter(
      (id) => !KEYWORD_FILTERS.includes(id as (typeof KEYWORD_FILTERS)[number]),
    );
    const ids = [...KEYWORD_FILTERS, ...extra];
    return ids
      .map((id) => ({ value: id, label: keywordMeta(id).zh, count: stats.keywordCount.get(id) ?? 0 }))
      .filter((option) => option.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 18);
  }, [stats]);

  /* ---------------- 过滤 ---------------- */
  const filtered = useMemo(() => {
    const kreditSet = new Set(filters.kredits);
    const keywordSet = new Set(filters.keywords);
    const list = cards.filter((card) => {
      if (!matchesSearch(card, filters.search)) return false;
      if (filters.factions.length && !filters.factions.includes(factionMeta(card.faction).key)) return false;
      if (filters.types.length && !filters.types.includes(card.type)) return false;
      if (filters.rarities.length && !filters.rarities.includes(rarityMeta(card.rarity).key)) return false;
      if (kreditSet.size) {
        const bucket = String(Math.min(card.kredits, 9));
        if (!kreditSet.has(bucket)) return false;
      }
      if (filters.sets.length && !filters.sets.includes(card.set)) return false;
      if (filters.pools.length && !filters.pools.includes(card.pool)) return false;
      if (keywordSet.size) {
        const ids = cardKeywords(card).map((k) => k.id);
        if (!ids.some((id) => keywordSet.has(id))) return false;
      }
      return true;
    });
    return sortCards(list, sort);
  }, [cards, filters, sort]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filters, sort]);

  useEffect(() => {
    if (inView) setLimit((value) => Math.min(filtered.length, value + PAGE_SIZE));
  }, [inView]);

  /* ---------------- 派生 UI 数据 ---------------- */
  const activeFilterCount =
    filters.factions.length +
    filters.types.length +
    filters.rarities.length +
    filters.kredits.length +
    filters.sets.length +
    filters.pools.length +
    filters.keywords.length +
    (filters.search ? 1 : 0);

  const sameNameCount = useMemo(() => {
    if (!selected) return 0;
    return new Set(cards.filter((card) => card.nameZh === selected.nameZh).map((card) => card.cardId)).size;
  }, [cards, selected]);

  const deckCount = selected ? (currentDeck?.cards.find((c) => c.cardId === selected.cardId)?.count ?? 0) : 0;
  const addDisabledReason = useMemo(() => {
    if (!selected) return undefined;
    if (!currentDeck) return '请先到「卡组构筑」建立战斗群';
    const check = checkAddCard(selected, currentDeck, byId);
    return check.ok ? undefined : check.reason;
  }, [selected, currentDeck, byId]);

  const eliteCount = stats.rarityCount.get('Elite') ?? 0;
  const activePool = stats.poolCount.get('active') ?? 0;
  const reservePool = stats.poolCount.get('reserve') ?? 0;

  const handleAdd = (card: UiCard) => {
    const result = addCard(card, byId);
    if (result.ok) toast(`已编入：${card.nameZh}`, 'success');
    else toast(result.reason ?? '无法编入', 'warn');
  };

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="卡牌档案馆 / COLLECTION"
        title="卡牌图鉴"
        subtitle={
          loading
            ? '正在调阅卡牌档案…'
            : `共 ${cards.length} 张卡牌档案，覆盖 ${FACTION_ORDER.length} 个阵营与 ${SET_ORDER.length} 个卡包系列。按阵营、类型、稀有度、费用与关键字检索。`
        }
        actions={
          <>
            <button
              type="button"
              className="fards-btn fards-btn-ghost py-2 lg:hidden"
              onClick={() => setShowFilters((value) => !value)}
            >
              <IconFilter size={14} />
              筛选{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </button>
            <button
              type="button"
              className="fards-btn fards-btn-ghost py-2"
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
            >
              <IconRefresh size={14} />
              重置
            </button>
          </>
        }
      />

      {/* 顶部统计条 */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: '卡牌档案', value: loading ? '—' : String(cards.length) },
          { label: '现役卡池', value: loading ? '—' : String(activePool) },
          { label: '预备卡池', value: loading ? '—' : String(reservePool) },
          { label: '精英卡', value: loading ? '—' : String(eliteCount) },
        ].map((item) => (
          <div key={item.label} className="fards-panel flex items-center justify-between px-3 py-2">
            <span className="fards-label text-[10px] text-field-500">{item.label}</span>
            <span className="font-display text-lg leading-none text-brass-300">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* 截图筛选栏 */}
        <aside
          className={`${showFilters ? 'block' : 'hidden'} fards-scroll space-y-4 self-start lg:sticky lg:top-[76px] lg:block lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto lg:pr-1`}
        >
          <div className="fards-panel space-y-4 p-3.5">
            <div className="flex items-center justify-between border-b border-field-700/60 pb-2">
              <span className="fards-label text-brass-500">作战筛选</span>
              <span className="font-body text-[10px] text-field-500">{activeFilterCount} 项</span>
            </div>
            <FacetGroup
              label="阵营"
              options={factionOptions}
              selected={filters.factions}
              onToggle={(value) => update('factions', toggleInList(filters.factions, value))}
              onClear={() => update('factions', [])}
            />
            <FacetGroup
              label="类型"
              options={typeOptions}
              selected={filters.types}
              onToggle={(value) => update('types', toggleInList(filters.types, value))}
              onClear={() => update('types', [])}
            />
            <FacetGroup
              label="稀有度"
              options={rarityOptions}
              selected={filters.rarities}
              onToggle={(value) => update('rarities', toggleInList(filters.rarities, value))}
              onClear={() => update('rarities', [])}
            />
            <FacetGroup
              label="费用（克雷迪特）"
              options={kreditOptions}
              selected={filters.kredits}
              onToggle={(value) => update('kredits', toggleInList(filters.kredits, value))}
              onClear={() => update('kredits', [])}
            />
            <FacetGroup
              label="卡池"
              options={poolOptions}
              selected={filters.pools}
              onToggle={(value) => update('pools', toggleInList(filters.pools, value))}
              onClear={() => update('pools', [])}
            />
            <FacetGroup
              label="关键能力"
              options={keywordOptions}
              selected={filters.keywords}
              onToggle={(value) => update('keywords', toggleInList(filters.keywords, value))}
              onClear={() => update('keywords', [])}
              maxHeight={210}
            />
            <FacetGroup
              label="卡包系列"
              options={setOptions}
              selected={filters.sets}
              onToggle={(value) => update('sets', toggleInList(filters.sets, value))}
              onClear={() => update('sets', [])}
              maxHeight={210}
            />
          </div>
        </aside>

        {/* 主区 */}
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchInput
              value={filters.search}
              onChange={(value) => update('search', value)}
              placeholder="搜索卡名（中/英）、卡牌 ID 或效果文本…"
              className="min-w-[220px] flex-1"
            />
            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="fards-select"
                aria-label="排序方式"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="hidden font-body text-[11px] tracking-wider text-field-400 sm:inline">
                <span className="font-display text-brass-300">{filtered.length}</span>
                <span className="text-field-500"> / {cards.length}</span>
              </span>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {Array.from({ length: 24 }).map((_, index) => (
                <div key={index} className="fards-card">
                  <div className="fards-skeleton absolute inset-0" />
                </div>
              ))}
            </div>
          ) : error ? (
            <EmptyState
              tone="warn"
              title="卡牌档案调阅失败"
              hint={
                <>
                  {error}
                  <br />
                  请确认 <code className="font-mono text-brass-400">public/data/cards.json</code> 已生成。
                </>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="没有符合条件的档案"
              hint="调整筛选条件，或清空搜索词后再试。"
              action={
                <button type="button" className="fards-btn" onClick={resetFilters}>
                  清空筛选
                </button>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {visible.map((card) => (
                  <CardView key={card.cardId} card={card} size="sm" onClick={setSelected} />
                ))}
              </div>

              <div ref={sentinelRef} className="mt-5 flex flex-col items-center gap-2">
                {visible.length < filtered.length ? (
                  <>
                    <div className="h-px w-full bg-field-700/60" />
                    <span className="font-body text-[10px] tracking-[0.18em] text-field-500 uppercase">
                      已显示 {visible.length} / {filtered.length}
                    </span>
                    <button
                      type="button"
                      className="fards-btn py-1.5"
                      onClick={() => setLimit((value) => value + PAGE_SIZE)}
                    >
                      调阅更多档案
                    </button>
                  </>
                ) : (
                  <span className="flex items-center gap-2 py-2 font-body text-[10px] tracking-[0.18em] text-field-600 uppercase">
                    <IconShield size={12} />
                    全部 {filtered.length} 张档案已调阅完毕
                  </span>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <CardDetailDialog
        card={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        sameNameCount={sameNameCount}
        deckCount={deckCount}
        onAdd={currentDeck ? handleAdd : undefined}
        addDisabledReason={addDisabledReason}
      />
    </div>
  );
}
