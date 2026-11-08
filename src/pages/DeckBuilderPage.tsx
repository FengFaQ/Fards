import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { CardDetailDialog } from '../ui/components/CardDetailDialog';
import { CardView } from '../ui/components/CardView';
import { DeckPanel } from '../ui/components/DeckPanel';
import { Dialog } from '../ui/components/Dialog';
import { EmptyState } from '../ui/components/EmptyState';
import { FactionBadge } from '../ui/components/FactionBadge';
import { PageHeader } from '../ui/components/PageHeader';
import { SearchInput } from '../ui/components/SearchInput';
import { VirtualCardGrid, type GridBreakpoints } from '../ui/components/VirtualCardGrid';
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternal,
  IconImage,
  IconImport,
  IconInfo,
  IconLink,
  IconPlay,
  IconSave,
  IconTrash,
  IconUpload,
} from '../ui/components/icons';
import { copyText, downloadTextFile } from '../ui/lib/clipboard';
import {
  buildOverviewUrl,
  decodeDeck,
  encodeDeck,
  type DeckData,
  type FeaturedDeck,
  type UiCard,
} from '../ui/lib/dataBridge';
import {
  checkAddCard,
  computeDeckStats,
  deckStatusLabel,
  RULES,
  validateDraft,
} from '../ui/lib/deckUi';
import {
  CARD_TYPE_ORDER,
  DECK_FACTIONS,
  cardTypeMeta,
  factionMeta,
  formatDate,
  isFactionAllowed,
} from '../ui/lib/format';
import { useCards, useFeaturedDecks } from '../ui/lib/useCards';
import { useDeckStore, useSavedDecks } from '../ui/stores/deckStore';
import { toast } from '../ui/stores/toastStore';

type PoolSort = 'kredits' | 'name' | 'attack' | 'defense';

/** 列数断点与改造前 Tailwind 类一致：grid-cols-2 sm:3 lg:4 xl:5 2xl:6 */
const POOL_GRID_BREAKPOINTS: GridBreakpoints = [
  [0, 2],
  [640, 3],
  [1024, 4],
  [1280, 5],
  [1536, 6],
];

/** 从 JSON 文本解析卡组（本工具导出的 JSON / 常见卡组 JSON） */
function parseJsonDeck(text: string): DeckData | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const json: unknown = JSON.parse(trimmed);
    if (Array.isArray(json)) {
      const cards = json
        .map((item) => {
          const rec = (item ?? {}) as Record<string, unknown>;
          const id = rec.cardId ?? rec.card_id ?? rec.id;
          const count = Number(rec.count ?? rec.quantity ?? 1);
          return typeof id === 'string' && Number.isFinite(count)
            ? { cardId: id, count: Math.max(1, Math.floor(count)) }
            : null;
        })
        .filter((entry): entry is { cardId: string; count: number } => Boolean(entry));
      if (!cards.length) return null;
      return { faction: 'Germany', allyFaction: null, cards };
    }
    const rec = json as Record<string, unknown>;
    const faction = rec.mainFaction ?? rec.faction;
    if (typeof faction !== 'string') return null;
    const ally = rec.allyFaction ?? rec.ally_faction;
    const cardsRaw = rec.cards ?? rec.deck;
    if (!Array.isArray(cardsRaw)) return null;
    const cards = cardsRaw
      .map((item) => {
        const c = (item ?? {}) as Record<string, unknown>;
        const id = c.cardId ?? c.card_id ?? c.id;
        const count = Number(c.count ?? c.quantity ?? 1);
        return typeof id === 'string' && Number.isFinite(count)
          ? { cardId: id, count: Math.max(1, Math.floor(count)) }
          : null;
      })
      .filter((entry): entry is { cardId: string; count: number } => Boolean(entry));
    if (!cards.length) return null;
    return { faction, allyFaction: typeof ally === 'string' ? ally : null, cards };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------
 * 卡池单卡：memo 化的纯展示单元
 * - 传入的 onAdd/onInspect 是页面级稳定回调（useCallback），
 *   因此加减卡/输入卡组名时，只有 count 变化的那张卡会重渲染。
 * ------------------------------------------------------------------ */
interface DeckPoolCardProps {
  card: UiCard;
  count: number;
  allowed: boolean;
  onAdd: (card: UiCard) => void;
  onInspect: (card: UiCard) => void;
}

const DeckPoolCard = memo(function DeckPoolCard({
  card,
  count,
  allowed,
  onAdd,
  onInspect,
}: DeckPoolCardProps) {
  const handleInspect = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onInspect(card);
    },
    [onInspect, card],
  );

  return (
    <div className="group relative">
      <CardView card={card} size="sm" count={count} muted={!allowed} onClick={onAdd} />
      <button
        type="button"
        aria-label={`查看 ${card.nameZh} 详情`}
        onClick={handleInspect}
        className="absolute right-1 bottom-1 z-[6] hidden rounded-sm border border-field-600/80 bg-field-950/90 p-1 text-field-300 transition-colors group-hover:block hover:text-brass-300"
      >
        <IconInfo size={11} />
      </button>
    </div>
  );
});

export default function DeckBuilderPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { cards, byId, loading } = useCards();
  const { decks: featured, loading: featuredLoading } = useFeaturedDecks();

  const current = useDeckStore((s) => s.current);
  const savedDecks = useSavedDecks();
  /* 12 个 action 一次性订阅（useShallow 保证引用稳定，不会额外触发重渲染） */
  const {
    createDeck,
    importDeck,
    loadSavedDeck,
    loadFeatured,
    deleteSavedDeck,
    renameCurrent,
    setFactions,
    addCard,
    removeCard,
    clearCards,
    saveCurrent,
  } = useDeckStore(
    useShallow((s) => ({
      createDeck: s.createDeck,
      importDeck: s.importDeck,
      loadSavedDeck: s.loadSavedDeck,
      loadFeatured: s.loadFeatured,
      deleteSavedDeck: s.deleteSavedDeck,
      renameCurrent: s.renameCurrent,
      setFactions: s.setFactions,
      addCard: s.addCard,
      removeCard: s.removeCard,
      clearCards: s.clearCards,
      saveCurrent: s.saveCurrent,
    })),
  );

  /* ---------------- 新手引导 / 阵营选择 ---------------- */
  const [pickMain, setPickMain] = useState<string>('Germany');
  const [pickAlly, setPickAlly] = useState<string>('');

  /* ---------------- 卡池筛选 ---------------- */
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [kreditFilter, setKreditFilter] = useState('all');
  const [sort, setSort] = useState<PoolSort>('kredits');
  const [onlyAllowed, setOnlyAllowed] = useState(true);

  /* ---------------- 弹窗 ---------------- */
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [selectedCard, setSelectedCard] = useState<UiCard | null>(null);

  /* ---------------- 深链载入（?code= / ?deck_code= / ?featured=） ---------------- */
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current || loading) return;
    const code = searchParams.get('code') ?? searchParams.get('deck_code');
    const featuredId = searchParams.get('featured');
    if (featuredId && featuredLoading) return;
    bootRef.current = true;
    const run = async () => {
      if (code) {
        const data = await decodeDeck(code);
        if (data) {
          importDeck(data);
          toast('已载入分享的卡组代码', 'success');
        } else {
          toast('卡组代码解析失败，请检查是否完整', 'error');
        }
      } else if (featuredId) {
        const hit = featured.find((item) => item.id === featuredId);
        if (hit && loadFeatured(hit)) toast(`已载入热门卡组：${hit.name}`, 'success');
        else toast('未找到该热门卡组', 'warn');
      }
      if (code || featuredId) setSearchParams({}, { replace: true });
    };
    void run();
  }, [loading, featured, featuredLoading, searchParams, importDeck, loadFeatured, setSearchParams]);

  /* ---------------- 卡池 ---------------- */
  const deckFaction = current?.faction ?? null;
  const deckAlly = current?.allyFaction ?? null;
  const hasDeck = Boolean(current);

  const poolCards = useMemo(() => {
    let list = cards;
    if (deckFaction && onlyAllowed) {
      list = list.filter((card) => isFactionAllowed(card, deckFaction, deckAlly));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (card) =>
          card.nameZh.toLowerCase().includes(q) ||
          card.nameEn.toLowerCase().includes(q) ||
          card.cardId.toLowerCase().includes(q),
      );
    }
    if (typeFilter !== 'all') list = list.filter((card) => card.type === typeFilter);
    if (kreditFilter !== 'all') {
      list = list.filter((card) => {
        const bucket = Math.min(card.kredits, 9);
        return kreditFilter === '9+' ? bucket === 9 : String(bucket) === kreditFilter;
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.nameZh.localeCompare(b.nameZh, 'zh-Hans-CN');
        case 'attack':
          return b.attack - a.attack || a.kredits - b.kredits;
        case 'defense':
          return b.defense - a.defense || a.kredits - b.kredits;
        case 'kredits':
        default:
          return a.kredits - b.kredits || a.nameZh.localeCompare(b.nameZh, 'zh-Hans-CN');
      }
    });
    return sorted;
  }, [cards, deckFaction, deckAlly, onlyAllowed, search, typeFilter, kreditFilter, sort]);

  /** 卡池内每张卡是否有禁止入场（muted）——只随阵营变化重算，避免逐卡重复判定 */
  const allowedIds = useMemo(() => {
    if (!deckFaction) return null;
    const set = new Set<string>();
    for (const card of cards) {
      if (isFactionAllowed(card, deckFaction, deckAlly)) set.add(card.cardId);
    }
    return set;
  }, [cards, deckFaction, deckAlly]);

  /** 已编入张数索引：O(1) 查表，替代每张卡 find() 的 O(n×m) */
  const deckCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of current?.cards ?? []) map.set(entry.cardId, entry.count);
    return map;
  }, [current?.cards]);


  /* ---------------- 统计与校验 ---------------- */
  /* 只依赖编制内容：改卡组名（高频输入）不该让统计/校验/右侧面板跟着重算重渲染 */
  const deckCards = current?.cards;
  const stats = useMemo(
    () => computeDeckStats(current, byId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckCards, deckFaction, deckAlly, byId, hasDeck],
  );
  const validation = useMemo(
    () => validateDraft(current, byId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckCards, deckFaction, deckAlly, byId, hasDeck],
  );
  /** 传给 DeckPanel 的稳定视图（不含 name/updatedAt），改名时引用不变 */
  const panelDeck = useMemo(
    () => (hasDeck ? { faction: deckFaction ?? '', allyFaction: deckAlly, cards: deckCards ?? [] } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckCards, deckFaction, deckAlly, hasDeck],
  );
  const savedVersion = current ? savedDecks.find((deck) => deck.id === current.id) : undefined;
  const isSaved = Boolean(savedVersion && current && savedVersion.updatedAt === current.updatedAt);
  const deckCode = useMemo(() => (current ? encodeDeck(current) : null), [current]);
  const overviewUrl = deckCode ? buildOverviewUrl('overview_horizontal', deckCode) : null;

  const factionPoolCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of cards) {
      const key = factionMeta(card.faction).key;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [cards]);

  /* ---------------- 交互 ---------------- */
  const handleCreate = () => {
    createDeck(pickMain, pickAlly || null);
    toast(`战斗群已建立：${factionMeta(pickMain).zh}${pickAlly ? ` + ${factionMeta(pickAlly).zh}` : ''}`, 'success');
  };

  /** 稳定回调：卡池里每张卡共用同一个引用，memo 才不会被新闭包击穿 */
  const handleAdd = useCallback(
    (card: UiCard) => {
      if (!hasDeck) {
        toast('请先选择主阵营，再编入卡牌', 'warn');
        return;
      }
      const result = addCard(card, byId);
      if (!result.ok) toast(result.reason ?? '无法编入', 'warn');
    },
    [hasDeck, addCard, byId],
  );

  const handleInspect = useCallback((card: UiCard) => setSelectedCard(card), []);

  const handleClear = useCallback(() => {
    clearCards();
    toast('编制已清空', 'info');
  }, [clearCards]);

  const handleMainChange = (value: string) => {
    if (!current) return;
    const ally = current.allyFaction === value ? null : current.allyFaction;
    const removed = setFactions(value, ally, byId);
    if (removed > 0) toast(`更换主阵营，${removed} 张卡因阵营不符被移出编制`, 'warn');
  };

  const handleAllyChange = (value: string) => {
    if (!current) return;
    const removed = setFactions(current.faction, value || null, byId);
    if (removed > 0) toast(`调整盟军，${removed} 张卡因阵营不符被移出编制`, 'warn');
  };

  const handleSave = () => {
    if (!current) return;
    const saved = saveCurrent();
    if (saved) toast('战斗群已保存（本地）', 'success');
  };

  const handleBattle = () => {
    if (!current) return;
    const saved = saveCurrent();
    if (!saved) return;
    navigate(`/battle?deck=${encodeURIComponent(saved.id)}`);
  };

  const handleOverview = () => {
    if (!overviewUrl) {
      toast('卡组代码生成失败，暂无法出图', 'error');
      return;
    }
    window.open(overviewUrl, '_blank', 'noopener');
  };

  const handleCopyCode = async () => {
    if (!deckCode) {
      toast('卡组代码生成失败', 'error');
      return;
    }
    const ok = await copyText(deckCode);
    toast(ok ? '卡组代码已复制' : '复制失败，请手动选择文本', ok ? 'success' : 'error');
  };

  const handleCopyOverview = async () => {
    if (!overviewUrl) return;
    const absolute = `${window.location.origin}${overviewUrl}`;
    const ok = await copyText(absolute);
    toast(ok ? '出图链接已复制' : '复制失败', ok ? 'success' : 'error');
  };

  const handleDownloadJson = () => {
    if (!current) return;
    const payload = {
      name: current.name,
      mainFaction: current.faction,
      allyFaction: current.allyFaction,
      cards: current.cards,
    };
    downloadTextFile(
      `${(current.name || 'fards-deck').replace(/[\\/:*?"<>|]/g, '_')}.json`,
      JSON.stringify(payload, null, 2),
    );
    toast('卡组 JSON 已下载', 'success');
  };

  const handleImport = async () => {
    const text = importText.trim();
    if (!text) {
      toast('请粘贴卡组代码或链接', 'warn');
      return;
    }
    setImporting(true);
    try {
      const jsonDeck = parseJsonDeck(text);
      if (jsonDeck) {
        importDeck(jsonDeck);
        toast('已从 JSON 载入卡组', 'success');
        setImportOpen(false);
        setImportText('');
        return;
      }
      const data = await decodeDeck(text);
      if (data) {
        importDeck(data);
        toast('卡组导入成功', 'success');
        setImportOpen(false);
        setImportText('');
      } else {
        toast('无法解析：请确认卡组代码完整，或该卡组来自 KARDS 官方', 'error');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleLoadFeatured = (deck: FeaturedDeck) => {
    if (!deck.deck) {
      toast('该热门卡组的数据尚未就绪', 'warn');
      return;
    }
    if (loadFeatured(deck)) {
      setLoadOpen(false);
      toast(`已载入：${deck.name}`, 'success');
    }
  };

  const selectedDeckCount = selectedCard ? (deckCounts.get(selectedCard.cardId) ?? 0) : 0;
  const selectedAddReason = useMemo(() => {
    if (!selectedCard) return undefined;
    if (!current) return '请先选择主阵营';
    const check = checkAddCard(selectedCard, current, byId);
    return check.ok ? undefined : check.reason;
  }, [selectedCard, current, byId]);

  /** 同名卡种类数：只在选中卡变化时扫一遍全库，避免每次渲染都 filter 1646 张 */
  const selectedSameNameCount = useMemo(() => {
    if (!selectedCard) return 0;
    return new Set(cards.filter((card) => card.nameZh === selectedCard.nameZh).map((card) => card.cardId)).size;
  }, [cards, selectedCard]);

  /** 卡池单卡渲染：稳定引用 + 查表取数，滚动/输入时只有必要项重渲染 */
  const renderPoolCard = useCallback(
    (card: UiCard) => (
      <DeckPoolCard
        card={card}
        count={deckCounts.get(card.cardId) ?? 0}
        allowed={allowedIds ? allowedIds.has(card.cardId) : true}
        onAdd={handleAdd}
        onInspect={handleInspect}
      />
    ),
    [deckCounts, allowedIds, handleAdd, handleInspect],
  );

  const poolCardKey = useCallback((card: UiCard) => card.cardId, []);

  const totalCopiesRemaining = Math.max(0, RULES.deckSize - stats.total);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="卡组工坊 / DECK BUILDER"
        title="卡组构筑"
        subtitle={
          current
            ? `当前编制 ${stats.total}/${RULES.deckSize} 张 · 同名上限 ${RULES.maxCopies} · 精英上限 ${RULES.maxElite}。点击左侧卡牌即可编入。`
            : `KARDS 标准编制 ${RULES.deckSize} 张：先选择主阵营与盟军阵营，再编入卡牌。`
        }
        actions={
          <>
            <button type="button" className="fards-btn fards-btn-ghost py-2" onClick={() => setImportOpen(true)}>
              <IconImport size={14} />
              导入
            </button>
            <button
              type="button"
              className="fards-btn fards-btn-ghost py-2"
              onClick={() => setLoadOpen(true)}
            >
              <IconUpload size={14} />
              读取
            </button>
            <button
              type="button"
              className="fards-btn py-2"
              onClick={handleSave}
              disabled={!current}
            >
              <IconSave size={14} />
              保存
            </button>
            <button
              type="button"
              className="fards-btn py-2"
              onClick={() => setExportOpen(true)}
              disabled={!current}
            >
              <IconDownload size={14} />
              导出
            </button>
            <button
              type="button"
              className="fards-btn py-2"
              onClick={handleOverview}
              disabled={!current}
              title="按出图协议打开卡组概览图"
            >
              <IconImage size={14} />
              概览图
            </button>
            <button
              type="button"
              className="fards-btn fards-btn-primary py-2"
              onClick={handleBattle}
              disabled={!current}
            >
              <IconPlay size={14} />
              开始对战
            </button>
          </>
        }
      />

      {/* 编制状态栏 */}
      {current && (
        <div className="fards-panel mb-4 flex flex-wrap items-center gap-3 p-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2">
            <span className="fards-label shrink-0 text-[10px] text-field-500">番号</span>
            <input
              value={current.name}
              onChange={(event) => renameCurrent(event.target.value)}
              maxLength={40}
              className="fards-input py-1.5 font-display text-sm tracking-wide"
              aria-label="卡组名称"
              placeholder="战斗群番号…"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="fards-label text-[10px] text-field-500">主</span>
            <select
              value={factionMeta(current.faction).key}
              onChange={(event) => handleMainChange(event.target.value)}
              className="fards-select"
              aria-label="主阵营"
            >
              {DECK_FACTIONS.map((faction) => (
                <option key={faction} value={faction}>
                  {factionMeta(faction).zh}
                </option>
              ))}
            </select>
            <span className="fards-label text-[10px] text-field-500">盟</span>
            <select
              value={current.allyFaction ? factionMeta(current.allyFaction).key : ''}
              onChange={(event) => handleAllyChange(event.target.value)}
              className="fards-select"
              aria-label="盟军阵营"
            >
              <option value="">无盟军</option>
              {DECK_FACTIONS.filter((faction) => faction !== factionMeta(current.faction).key).map(
                (faction) => (
                  <option key={faction} value={faction}>
                    {factionMeta(faction).zh}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body text-[10px] tracking-wider ${
                validation.legal
                  ? 'border-ink-green/50 text-emerald-300'
                  : 'border-amber-600/50 text-amber-300'
              }`}
            >
              {validation.legal ? <IconCheck size={11} /> : <IconAlert size={11} />}
              {deckStatusLabel(validation, stats.total)}
            </span>
            <span
              className={`font-body text-[10px] tracking-wider ${
                isSaved ? 'text-field-500' : 'text-brass-500'
              }`}
            >
              {isSaved ? '已保存' : '未保存改动'}
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          {!current ? (
            /* ---------------- 阵营选择 ---------------- */
            <div className="space-y-4">
              <div className="fards-panel p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-field-700/60 pb-3">
                  <div>
                    <p className="fards-label text-brass-500">建立战斗群 / NEW DECK</p>
                    <h2 className="mt-1 font-display text-xl tracking-wide text-field-100">
                      选择主阵营与盟军
                    </h2>
                  </div>
                  <FactionBadge faction={pickMain} size="md" showEn />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
                  {DECK_FACTIONS.map((faction) => {
                    const meta = factionMeta(faction);
                    const active = pickMain === faction;
                    const count = factionPoolCounts.get(faction) ?? 0;
                    return (
                      <button
                        key={faction}
                        type="button"
                        onClick={() => setPickMain(faction)}
                        className={`group relative overflow-hidden rounded border px-3 py-2.5 text-left transition-[transform,border-color,background-color,box-shadow] ${
                          active
                            ? 'border-brass-500/80 bg-field-800 shadow-[0_0_18px_rgb(195_155_58/0.12)]'
                            : 'border-field-700/70 bg-field-900/60 hover:border-field-500'
                        }`}
                      >
                        <span
                          className="absolute inset-x-0 top-0 h-[2px]"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="flex items-center justify-between">
                          <span className="font-display text-sm tracking-[0.12em] text-field-100">
                            {meta.zh}
                          </span>
                          {active && <IconCheck size={13} className="text-brass-400" />}
                        </span>
                        <span className="mt-0.5 block font-body text-[9px] tracking-[0.2em] text-field-500 uppercase">
                          {meta.en} · {count} 张
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-field-700/60 pt-4">
                  <div className="flex items-center gap-2">
                    <span className="fards-label text-[10px] text-field-500">盟军</span>
                    <select
                      value={pickAlly}
                      onChange={(event) => setPickAlly(event.target.value)}
                      className="fards-select py-2"
                      aria-label="盟军阵营"
                    >
                      <option value="">无盟军（单阵营）</option>
                      {DECK_FACTIONS.filter((faction) => faction !== pickMain).map((faction) => (
                        <option key={faction} value={faction}>
                          {factionMeta(faction).zh}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="fards-btn fards-btn-primary" onClick={handleCreate}>
                    建立战斗群
                    <IconArrowRight size={14} />
                  </button>
                  <span className="font-body text-[10px] text-field-500">
                    主阵营决定基础卡池，盟军最多提供 1/3 卡位
                  </span>
                </div>
              </div>

              {/* 热门卡组一键载入 */}
              <div className="fards-panel p-4">
                <div className="flex items-center justify-between border-b border-field-700/60 pb-2">
                  <p className="fards-label text-brass-500">热门战斗群 / FEATURED</p>
                  <span className="font-body text-[10px] text-field-500">
                    {featuredLoading ? '载入中…' : `${featured.length} 套公开构筑`}
                  </span>
                </div>
                {featured.length === 0 ? (
                  <p className="mt-3 font-body text-[11px] text-field-500">
                    暂无公开卡组数据（public/data/featured-decks.json），可自行新建战斗群。
                  </p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {featured.slice(0, 6).map((deck) => {
                      const meta = factionMeta(deck.faction);
                      return (
                        <button
                          key={deck.id}
                          type="button"
                          onClick={() => handleLoadFeatured(deck)}
                          className="group flex items-center justify-between gap-2 rounded border border-field-700/70 bg-field-900/50 px-2.5 py-2 text-left transition-colors hover:border-brass-600/60 hover:bg-field-800/70"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-body text-xs text-field-100">
                              {deck.name}
                            </span>
                            <span className="mt-0.5 block font-body text-[9px] tracking-wider text-field-500">
                              {meta.zh}
                              {deck.allyFaction ? ` + ${factionMeta(deck.allyFaction).zh}` : ''}
                              {deck.deck ? ` · ${deck.deck.cards.reduce((s, c) => s + c.count, 0)} 张` : ''}
                            </span>
                          </span>
                          <IconArrowRight
                            size={13}
                            className="shrink-0 text-field-500 transition-colors group-hover:text-brass-400"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ---------------- 卡池 ---------------- */
            <div className="fards-panel fards-no-blur flex flex-col overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-field-700/60 p-2.5">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="搜索卡牌…"
                  className="min-w-[180px] flex-1"
                />
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="fards-select"
                  aria-label="类型筛选"
                >
                  <option value="all">全部类型</option>
                  {CARD_TYPE_ORDER.map((type) => (
                    <option key={type} value={type}>
                      {cardTypeMeta(type).zh}
                    </option>
                  ))}
                </select>
                <select
                  value={kreditFilter}
                  onChange={(event) => setKreditFilter(event.target.value)}
                  className="fards-select"
                  aria-label="费用筛选"
                >
                  <option value="all">全部费用</option>
                  {Array.from({ length: 9 }, (_, index) => (
                    <option key={index} value={String(index)}>
                      {index} 费
                    </option>
                  ))}
                  <option value="9+">9+ 费</option>
                </select>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as PoolSort)}
                  className="fards-select"
                  aria-label="排序"
                >
                  <option value="kredits">按费用</option>
                  <option value="name">按名称</option>
                  <option value="attack">按攻击</option>
                  <option value="defense">按防御</option>
                </select>
                <label className="flex cursor-pointer items-center gap-1.5 font-body text-[10px] tracking-wider text-field-400">
                  <input
                    type="checkbox"
                    checked={onlyAllowed}
                    onChange={(event) => setOnlyAllowed(event.target.checked)}
                    className="h-3 w-3 accent-brass-500"
                  />
                  仅可编入
                </label>
                <span className="ml-auto font-body text-[10px] tracking-wider text-field-500">
                  卡池 <span className="font-display text-brass-300">{poolCards.length}</span>
                </span>
              </div>

              <div className="p-2.5">
                {loading ? (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {Array.from({ length: 18 }).map((_, index) => (
                      <div key={index} className="fards-card">
                        <div className="fards-skeleton absolute inset-0" />
                      </div>
                    ))}
                  </div>
                ) : poolCards.length === 0 ? (
                  <EmptyState title="卡池内没有符合条件的卡牌" hint="调整搜索或筛选条件后再试。" />
                ) : (
                  <>
                    {/* 窗口化渲染：卡池数百张也只挂可视区 ±1 屏 */}
                    <VirtualCardGrid
                      items={poolCards}
                      itemKey={poolCardKey}
                      breakpoints={POOL_GRID_BREAKPOINTS}
                      renderItem={renderPoolCard}
                    />
                    <div className="mt-4 flex flex-col items-center gap-1.5">
                      <span className="py-1 font-body text-[10px] tracking-[0.16em] text-field-600 uppercase">
                        卡池已全部展开（{poolCards.length} 张）
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 右侧编制面板 */}
        <DeckPanel
          deck={panelDeck}
          byId={byId}
          onAdd={handleAdd}
          onRemove={removeCard}
          onClear={handleClear}
          stats={stats}
          validation={validation}
          className="xl:sticky xl:top-[76px] xl:self-start"
        />
      </div>

      {/* 底部提示 */}
      {current && totalCopiesRemaining > 0 && (
        <p className="mt-3 flex items-center gap-2 font-body text-[11px] text-field-500">
          <IconInfo size={12} />
          还需编入 {totalCopiesRemaining} 张卡牌方可达到标准编制（{RULES.deckSize} 张）。
        </p>
      )}

      {/* ---------------- 导入弹窗 ---------------- */}
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="导入战斗群"
        eyebrow="IMPORT"
        width="lg"
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="font-body text-[10px] text-field-500">
              支持 deck code、分享链接与 JSON
            </span>
            <div className="flex gap-2">
              <button type="button" className="fards-btn fards-btn-ghost" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="fards-btn fards-btn-primary"
                onClick={handleImport}
                disabled={importing || !importText.trim()}
              >
                <IconImport size={14} />
                {importing ? '解析中…' : '导入'}
              </button>
            </div>
          </div>
        }
      >
        <textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={7}
          placeholder={`粘贴 KARDS deck code，例如：%%51|...\n或分享链接：https://…/?deck_code=xxxx\n或本工具导出的 JSON`}
          className="fards-input min-h-[160px] resize-y font-mono text-xs leading-relaxed"
        />
        <p className="mt-2 font-body text-[10px] leading-relaxed text-field-500">
          提示：卡组代码使用 importId 编码，导入时会自动换算为卡牌 ID；来自 KARDS 官方的卡组代码通常可直接使用。
        </p>
      </Dialog>

      {/* ---------------- 导出弹窗 ---------------- */}
      <Dialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="导出战斗群"
        eyebrow="EXPORT"
        width="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-body text-[10px] text-field-500">
              {deckCode ? '可复制 code，或用概览图协议分享' : '卡组代码生成失败：编解码模块可能尚未就绪'}
            </span>
            <button type="button" className="fards-btn fards-btn-ghost" onClick={() => setExportOpen(false)}>
              关闭
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="fards-label text-brass-500">卡组代码 / DECK CODE</span>
              <button
                type="button"
                className="fards-btn fards-btn-ghost py-1 text-[10px]"
                onClick={handleCopyCode}
                disabled={!deckCode}
              >
                <IconCopy size={12} />
                复制
              </button>
            </div>
            <textarea
              readOnly
              value={deckCode ?? '（编解码模块未就绪，暂无法生成）'}
              rows={3}
              className="fards-input resize-none font-mono text-[11px] leading-relaxed break-all"
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" className="fards-btn py-2" onClick={handleCopyOverview} disabled={!overviewUrl}>
              <IconLink size={14} />
              复制出图链接
            </button>
            <button type="button" className="fards-btn py-2" onClick={handleOverview} disabled={!overviewUrl}>
              <IconExternal size={14} />
              打开概览图
            </button>
            <button type="button" className="fards-btn py-2" onClick={handleDownloadJson}>
              <IconDownload size={14} />
              下载 JSON
            </button>
          </div>

          <div className="rounded border border-field-700/60 bg-field-950/40 p-3">
            <p className="fards-label mb-1.5 text-field-400">出征数据</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-body text-[11px] sm:grid-cols-3">
              <div className="flex justify-between gap-2">
                <dt className="text-field-500">主阵营</dt>
                <dd className="text-field-200">{factionMeta(current?.faction).zh}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-field-500">盟军</dt>
                <dd className="text-field-200">
                  {current?.allyFaction ? factionMeta(current.allyFaction).zh : '无'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-field-500">总张数</dt>
                <dd className="text-field-200">
                  {stats.total}/{RULES.deckSize}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-field-500">单位</dt>
                <dd className="text-field-200">{stats.units}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-field-500">指令</dt>
                <dd className="text-field-200">{stats.orders}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-field-500">精英</dt>
                <dd className="text-field-200">{stats.elite}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Dialog>

      {/* ---------------- 读取本地卡组 ---------------- */}
      <Dialog
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        title="本地战斗群"
        eyebrow="LOCAL DECKS"
        width="lg"
        footer={
          <div className="flex items-center justify-between">
            <span className="font-body text-[10px] text-field-500">
              共 {savedDecks.length} 套 · 保存在本机浏览器
            </span>
            <button type="button" className="fards-btn fards-btn-ghost" onClick={() => setLoadOpen(false)}>
              关闭
            </button>
          </div>
        }
      >
        {savedDecks.length === 0 ? (
          <EmptyState
            title="暂无已保存的战斗群"
            hint="在构筑页点击「保存」后，卡组会记录在本地浏览器中（不会上传到服务器）。"
          />
        ) : (
          <ul className="space-y-2">
            {savedDecks.map((deck) => {
              const total = deck.cards.reduce((sum, entry) => sum + entry.count, 0);
              const isCurrent = current?.id === deck.id;
              return (
                <li
                  key={deck.id}
                  className={`flex flex-wrap items-center gap-2 rounded border p-2.5 ${
                    isCurrent ? 'border-brass-600/60 bg-brass-500/5' : 'border-field-700/60 bg-field-900/40'
                  }`}
                >
                  <FactionBadge faction={deck.faction} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body text-xs text-field-100">{deck.name}</p>
                    <p className="mt-0.5 font-body text-[9px] tracking-wider text-field-500">
                      {deck.allyFaction ? `+${factionMeta(deck.allyFaction).zh} · ` : ''}
                      {total} 张 · {formatDate(deck.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="fards-btn fards-btn-ghost px-2 py-1 text-[10px]"
                      onClick={() => {
                        if (loadSavedDeck(deck.id)) {
                          setLoadOpen(false);
                          toast(`已载入：${deck.name}`, 'success');
                        }
                      }}
                      disabled={isCurrent}
                    >
                      载入
                    </button>
                    <button
                      type="button"
                      aria-label={`删除 ${deck.name}`}
                      className="rounded-sm border border-field-600/70 p-1 text-field-400 transition-colors hover:border-red-500/60 hover:text-red-300"
                      onClick={() => {
                        deleteSavedDeck(deck.id);
                        toast('已删除该战斗群', 'info');
                      }}
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {featured.length > 0 && (
          <div className="mt-5 border-t border-field-700/60 pt-3">
            <p className="fards-label mb-2 text-brass-500">热门构筑</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {featured.slice(0, 6).map((deck) => (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => handleLoadFeatured(deck)}
                  className="flex items-center justify-between gap-2 rounded border border-field-700/60 bg-field-900/40 px-2.5 py-2 text-left transition-colors hover:border-brass-600/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-body text-xs text-field-100">{deck.name}</span>
                    <span className="mt-0.5 block font-body text-[9px] text-field-500">
                      {factionMeta(deck.faction).zh}
                      {deck.allyFaction ? ` + ${factionMeta(deck.allyFaction).zh}` : ''}
                    </span>
                  </span>
                  <IconArrowRight size={12} className="shrink-0 text-field-500" />
                </button>
              ))}
            </div>
          </div>
        )}
      </Dialog>

      {/* ---------------- 卡牌详情 ---------------- */}
      <CardDetailDialog
        card={selectedCard}
        open={Boolean(selectedCard)}
        onClose={() => setSelectedCard(null)}
        sameNameCount={selectedSameNameCount}
        deckCount={selectedDeckCount}
        onAdd={handleAdd}
        addDisabledReason={selectedAddReason}
      />
    </div>
  );
}
