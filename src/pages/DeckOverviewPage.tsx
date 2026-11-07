import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../ui/components/EmptyState';
import { ToastViewport } from '../ui/components/Toast';
import {
  IconArrowRight,
  IconDownload,
  IconImage,
  IconInfo,
  IconLink,
  IconPlay,
  IconAlert,
} from '../ui/components/icons';
import { copyText } from '../ui/lib/clipboard';
import {
  buildOverviewUrl,
  decodeDeck,
  type DeckData,
  type UiCard,
} from '../ui/lib/dataBridge';
import { factionMeta } from '../ui/lib/format';
import { useCards, useFeaturedDecks } from '../ui/lib/useCards';
import { toast } from '../ui/stores/toastStore';
import { DeckPoster } from '../ui/overview/DeckPoster';
import { PrintTemplate } from '../ui/overview/PrintTemplate';
import { exportPosterPng } from '../ui/overview/exportPng';
import {
  buildPosterModel,
  posterKindLabel,
  posterLayout,
  type PosterKind,
  type PosterModel,
} from '../ui/overview/posterModel';
import '../ui/overview/overview.css';

export interface DeckOverviewProps {
  action: string;
  params: URLSearchParams;
}

type ViewKind = PosterKind | 'print_template';

type ResolveState =
  | { status: 'loading'; message: string }
  | { status: 'error'; message: string; hint?: string }
  | {
      status: 'ready';
      deck: DeckData;
      deckCode?: string;
      author?: string;
      /** 分享页/接口返回的卡组名 */
      name?: string;
    };

function resolveViewKind(action: string): ViewKind {
  const value = (action || '').toLowerCase();
  if (value.includes('print')) return 'print_template';
  if (value.includes('vertical')) return 'vertical';
  return 'horizontal';
}

/** deck_slug → 1939.kardsdecker API（浏览器 CORS 很可能被拦截，需要明确提示） */
async function fetchDeckBySlug(
  slug: string,
): Promise<{ deck: DeckData; code?: string; author?: string; name?: string }> {
  const url = `https://1939.kardsdecker.com/api/v1/decks/${encodeURIComponent(slug)}`;
  let json: unknown;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.name === 'AbortError'
          ? '请求超时'
          : error.message
        : String(error);
    throw new Error(
      `无法读取该卡组分享页（${reason}）。浏览器存在跨域限制或网络不可达，请改用 deck_code 参数导入，例如：` +
        `?action=overview_horizontal&deck_code=<URL编码的卡组代码>`,
    );
  } finally {
    clearTimeout(timer);
  }

  const root = (json as { data?: unknown; deck?: unknown })?.data ?? (json as { deck?: unknown })?.deck ?? json;
  const rec = (root ?? {}) as Record<string, unknown>;
  const codeRaw =
    rec.deckCode ?? rec.deck_code ?? rec.code ?? rec.shareCode ?? rec.share_code ?? rec.deckcode;
  const code = typeof codeRaw === 'string' ? codeRaw : undefined;
  const nameRaw = rec.name ?? rec.title ?? rec.deckName ?? rec.deck_name;
  const name = typeof nameRaw === 'string' ? nameRaw : undefined;
  const author = typeof rec.author === 'string' ? rec.author : undefined;
  if (code) {
    const decoded = await decodeDeck(code);
    if (decoded) return { deck: decoded, code, author, name };
  }

  const cardsRaw = rec.cards ?? rec.deckCards ?? rec.deck_cards;
  const factionRaw = rec.mainFaction ?? rec.main_faction ?? rec.faction ?? rec.nation;
  if (Array.isArray(cardsRaw) && typeof factionRaw === 'string') {
    const cards = cardsRaw
      .map((item) => {
        const entry = (item ?? {}) as Record<string, unknown>;
        const id = entry.cardId ?? entry.card_id ?? entry.id;
        const count = Number(entry.count ?? entry.quantity ?? 1);
        return typeof id === 'string' && Number.isFinite(count)
          ? { cardId: id, count: Math.max(1, Math.floor(count)) }
          : null;
      })
      .filter((entry): entry is { cardId: string; count: number } => Boolean(entry));
    const ally = rec.allyFaction ?? rec.ally_faction ?? rec.ally;
    if (cards.length) {
      return {
        deck: { faction: factionRaw, allyFaction: typeof ally === 'string' ? ally : null, cards },
        code,
        author,
        name,
      };
    }
  }

  throw new Error('该分享页没有可解析的卡组代码，请改用 deck_code 参数导入。');
}

/** 按容器宽度缩放海报（导出画布不缩放）；用回调 ref 保证海报挂载后重新测量 */
function useFitScale(logicalWidth: number) {
  const [scale, setScale] = useState(1);
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!node) return;
      const compute = () => {
        const available = node.clientWidth - 8;
        if (available <= 0) return;
        setScale(Math.min(1, Math.max(0.1, available / logicalWidth)));
      };
      compute();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(compute);
        observer.observe(node);
        cleanupRef.current = () => observer.disconnect();
      } else {
        window.addEventListener('resize', compute);
        cleanupRef.current = () => window.removeEventListener('resize', compute);
      }
    },
    [logicalWidth],
  );

  return { ref, scale };
}

export default function DeckOverviewPage({ action, params }: DeckOverviewProps) {
  const viewKind = resolveViewKind(action);
  const { byId, loading: cardsLoading } = useCards();
  const { decks: featuredDecks } = useFeaturedDecks();
  const [state, setState] = useState<ResolveState>({ status: 'loading', message: '正在解析卡组…' });
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const autoExported = useRef(false);

  const deckCodeParam = params.get('deck_code') ?? params.get('code') ?? '';
  const slugParam = params.get('deck_slug') ?? params.get('slug') ?? '';
  const titleParam = params.get('title') ?? '';
  const shouldDownload = params.get('download') === '1' || params.get('download') === 'true';

  /* ---------- 解析卡组 ---------- */
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading', message: '正在解析卡组…' });
    const run = async () => {
      if (deckCodeParam) {
        const deck = await decodeDeck(deckCodeParam);
        if (!alive) return;
        if (deck) {
          setState({ status: 'ready', deck, deckCode: deckCodeParam.trim() });
        } else {
          setState({
            status: 'error',
            message: '卡组代码无法解析',
            hint: '请确认 deck_code 参数完整（通常以 %% 开头），或在构筑页重新导出后再试。',
          });
        }
        return;
      }
      if (slugParam) {
        setState({ status: 'loading', message: '正在从分享页读取卡组…' });
        try {
          const result = await fetchDeckBySlug(slugParam);
          if (!alive) return;
          setState({
            status: 'ready',
            deck: result.deck,
            deckCode: result.code,
            author: result.author,
            name: result.name,
          });
        } catch (error) {
          if (!alive) return;
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : '分享页读取失败',
            hint: '也可以把分享链接中的 deck_code 直接粘贴到参数里，出图效果完全一致。',
          });
        }
        return;
      }
      setState({
        status: 'error',
        message: '缺少卡组参数',
        hint: '需要 deck_code 或 deck_slug 参数，例如：/?action=overview_horizontal&deck_code=%%15|…',
      });
    };
    if (!cardsLoading) void run();
    return () => {
      alive = false;
    };
  }, [deckCodeParam, slugParam, cardsLoading]);

  /* ---------- 标题 ---------- */
  useEffect(() => {
    document.title = '卡组概览 · FARDS';
  }, []);

  /* ---------- 标题 / 作者：参数 → 分享页 → 热门卡组同名匹配 ---------- */
  const matchedFeatured = useMemo(() => {
    if (state.status !== 'ready' || !state.deckCode) return null;
    const normalize = (value: string) => value.replace(/\s+/g, '');
    const target = normalize(state.deckCode);
    return featuredDecks.find((item) => item.deckCode && normalize(item.deckCode) === target) ?? null;
  }, [state, featuredDecks]);

  const model: PosterModel | null = useMemo(() => {
    if (state.status !== 'ready') return null;
    const kind: PosterKind = viewKind === 'vertical' ? 'vertical' : 'horizontal';
    const title = titleParam || state.name || matchedFeatured?.name || undefined;
    const author = state.author ?? matchedFeatured?.author;
    return buildPosterModel(state.deck, byId, kind, {
      title,
      author,
      subtitle: author ? `编制 ${author}` : undefined,
    });
  }, [state, byId, viewKind, titleParam, matchedFeatured]);

  const logicalWidth = posterLayout(viewKind === 'vertical' ? 'vertical' : 'horizontal', model?.cards.length ?? 39).width;
  const { ref: stageRef, scale } = useFitScale(logicalWidth);

  /* ---------- 导出 PNG ---------- */
  const handleExport = useCallback(async () => {
    if (!model) return;
    setExporting(true);
    setProgress({ done: 0, total: model.cards.length });
    try {
      const ok = await exportPosterPng(model, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (ok) toast('概览图已导出 PNG', 'success');
      else toast('导出失败：浏览器无法生成图片', 'error');
    } catch (error) {
      toast(`导出失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }, [model]);

  /* ---------- download=1 自动导出 ---------- */
  useEffect(() => {
    if (!shouldDownload || !model || viewKind === 'print_template' || autoExported.current) return;
    autoExported.current = true;
    void handleExport();
  }, [shouldDownload, model, viewKind, handleExport]);

  const handleCopyLink = async () => {
    const ok = await copyText(window.location.href);
    toast(ok ? '出图链接已复制' : '复制失败', ok ? 'success' : 'error');
  };

  const handleCopyCode = async () => {
    if (state.status !== 'ready' || !state.deckCode) return;
    const ok = await copyText(state.deckCode);
    toast(ok ? '卡组代码已复制' : '复制失败', ok ? 'success' : 'error');
  };

  const handlePrint = () => {
    window.print();
  };

  const code = state.status === 'ready' ? state.deckCode : undefined;

  return (
    <div className="overview-page min-h-screen">
      {/* 工具栏（截图/打印时隐藏） */}
      <div className="overview-toolbar no-print border-b border-field-700/60 bg-field-950/90">
        <div className="mx-auto flex w-full max-w-[1700px] flex-wrap items-center gap-2 px-4 py-2.5">
          <Link to="/deck" className="fards-btn fards-btn-ghost py-1.5 text-[11px]">
            <IconArrowRight size={13} className="rotate-180" />
            返回构筑
          </Link>
          <span className="fards-label text-brass-500">卡组概览 / OVERVIEW</span>
          <span className="fards-tag">{posterKindLabel(viewKind)}</span>
          {state.status === 'ready' && (
            <span className="hidden font-body text-[11px] text-field-400 sm:inline">
              {state.deck.cards.reduce((sum, entry) => sum + entry.count, 0)} 张 ·{' '}
              {factionMeta(state.deck.faction).zh}
              {state.deck.allyFaction ? ` + ${factionMeta(state.deck.allyFaction).zh}` : ''}
            </span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {viewKind !== 'print_template' && (
              <>
                <button type="button" className="fards-btn fards-btn-ghost py-1.5 text-[11px]" onClick={handleCopyLink}>
                  <IconLink size={13} />
                  复制链接
                </button>
                {code && (
                  <a
                    href={buildOverviewUrl(viewKind === 'vertical' ? 'overview_horizontal' : 'overview_vertical', code)}
                    className="fards-btn fards-btn-ghost py-1.5 text-[11px]"
                  >
                    <IconImage size={13} />
                    {viewKind === 'vertical' ? '切横版' : '切竖版'}
                  </a>
                )}
                <button
                  type="button"
                  className="fards-btn fards-btn-primary py-1.5 text-[11px]"
                  onClick={handleExport}
                  disabled={!model || exporting}
                  title="导出 2x 高清 PNG"
                >
                  <IconDownload size={13} />
                  {exporting
                    ? `导出中 ${progress ? `${progress.done}/${progress.total}` : ''}`
                    : '导出 PNG'}
                </button>
              </>
            )}
            <button type="button" className="fards-btn py-1.5 text-[11px]" onClick={handlePrint}>
              <IconPlay size={13} />
              打印 / 存 PDF
            </button>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="overview-stage">
        {state.status === 'loading' ? (
          <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-brass-600/30 border-t-brass-400" />
            <p className="fards-title text-sm">{state.message}</p>
            <p className="font-body text-[11px] text-field-500">正在调阅卡牌档案与卡组代码…</p>
          </div>
        ) : state.status === 'error' ? (
          <div className="flex min-h-[60vh] w-full items-center justify-center px-4">
            <EmptyState
              tone="warn"
              title="无法生成卡组概览"
              hint={
                <>
                  {state.message}
                  {state.hint ? (
                    <>
                      <br />
                      {state.hint}
                    </>
                  ) : null}
                </>
              }
              icon={<IconAlert size={22} />}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Link to="/deck" className="fards-btn fards-btn-primary py-1.5 text-[11px]">
                    去构筑页导出卡组代码
                  </Link>
                  <button
                    type="button"
                    className="fards-btn fards-btn-ghost py-1.5 text-[11px]"
                    onClick={() => window.location.reload()}
                  >
                    重新加载
                  </button>
                </div>
              }
            />
          </div>
        ) : viewKind === 'print_template' && model ? (
          <div className="w-full">
            <div className="no-print mx-auto mb-4 flex w-full max-w-[210mm] items-start gap-2 rounded border border-brass-600/30 bg-field-900/60 px-3 py-2">
              <IconInfo size={14} className="mt-0.5 shrink-0 text-brass-400" />
              <p className="font-body text-[11px] leading-relaxed text-field-400">
                打印模板：A4 纵向 · 3 列 · 单卡 63×88mm（标准卡套尺寸）· 带裁切线。点击右上角「打印 / 存 PDF」，
                在打印对话框中选择「保存为 PDF」即可导出可用于实体代牌的 PDF。
              </p>
            </div>
            <PrintTemplate model={model} />
          </div>
        ) : model ? (
          <div ref={stageRef} className="w-full">
            <DeckPoster model={model} scale={scale} />
          </div>
        ) : null}
      </div>

      <ToastViewport />
    </div>
  );
}
