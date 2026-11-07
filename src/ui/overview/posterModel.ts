/**
 * 卡组概览图（poster）数据模型与布局计算
 * ------------------------------------------------------------------
 * 同一份模型被两处消费：
 * 1) DeckPoster.tsx —— DOM 预览（屏幕上看效果，可缩放）
 * 2) exportPng.ts   —— Canvas 2x 绘制（导出 PNG）
 * 布局参数集中在这里，两个渲染通道保持视觉一致。
 */
import type { DeckData, UiCard } from '../lib/dataBridge';
import { computeDeckStats } from '../lib/deckUi';
import {
  cardTypeMeta,
  factionMeta,
  rarityMeta,
  typeColor,
  type FactionMeta,
} from '../lib/format';

export type PosterKind = 'horizontal' | 'vertical';

export interface PosterCard {
  card: UiCard;
  count: number;
}

export interface PosterTypeSlice {
  key: string;
  label: string;
  count: number;
  color: string;
}

export interface PosterStats {
  total: number;
  unique: number;
  units: number;
  orders: number;
  elite: number;
  allyCards: number;
  byKredits: number[];
  byType: PosterTypeSlice[];
  /** 卡组里缺失卡牌（数据未就绪）的张数 */
  missing: number;
}

export interface PosterModel {
  kind: PosterKind;
  deck: DeckData;
  title: string;
  faction: FactionMeta;
  ally: FactionMeta | null;
  cards: PosterCard[];
  stats: PosterStats;
  /** 生成时间戳 */
  generatedAt: number;
  author?: string;
  subtitle?: string;
}

/** 从卡组数据构建海报模型（按费用→名称排序，便于阅读曲线） */
export function buildPosterModel(
  deck: DeckData,
  byId: Map<string, UiCard>,
  kind: PosterKind,
  options?: { title?: string; author?: string; subtitle?: string },
): PosterModel {
  const cards: PosterCard[] = [];
  for (const entry of deck.cards) {
    const card = byId.get(entry.cardId);
    if (!card || entry.count <= 0) continue;
    cards.push({ card, count: entry.count });
  }
  cards.sort(
    (a, b) =>
      a.card.kredits - b.card.kredits ||
      a.card.nameZh.localeCompare(b.card.nameZh, 'zh-Hans-CN'),
  );

  const stats = computeDeckStats(deck, byId);
  const typeMap = new Map<string, PosterTypeSlice>();
  for (const item of stats.byType) {
    typeMap.set(item.key, {
      key: item.key,
      label: cardTypeMeta(item.key).zh,
      count: item.count,
      color: typeColor(item.key),
    });
  }

  return {
    kind,
    deck,
    title: options?.title?.trim() || '未命名战斗群',
    faction: factionMeta(deck.faction),
    ally: deck.allyFaction ? factionMeta(deck.allyFaction) : null,
    cards,
    stats: {
      total: stats.total,
      unique: cards.length,
      units: stats.units,
      orders: stats.orders,
      elite: stats.elite,
      allyCards: stats.allyCards,
      byKredits: stats.byKredits,
      byType: [...typeMap.values()].sort((a, b) => b.count - a.count),
      missing: stats.missing,
    },
    generatedAt: Date.now(),
    author: options?.author,
    subtitle: options?.subtitle,
  };
}

/* ------------------------------------------------------------------ 布局 */

export interface PosterLayout {
  kind: PosterKind;
  width: number;
  height: number;
  padding: number;
  headerH: number;
  footerH: number;
  sidebarW: number;
  sidebarGap: number;
  /** 统计区（竖版在底部） */
  statsH: number;
  grid: { x: number; y: number; width: number; height: number };
  gridFit: { cols: number; rows: number; cardW: number; cardH: number };
  sidebar: { x: number; y: number; width: number; height: number } | null;
  statsBand: { x: number; y: number; width: number; height: number } | null;
}

const CARD_ASPECT = 500 / 702;
const CARD_GAP = 10;

/** 在给定区域内最大化单卡尺寸的网格排布 */
export function fitCardGrid(
  count: number,
  areaW: number,
  areaH: number,
  aspect = CARD_ASPECT,
  gap = CARD_GAP,
): { cols: number; rows: number; cardW: number; cardH: number } {
  if (count <= 0) return { cols: 0, rows: 0, cardW: 0, cardH: 0 };
  let best = { cols: 1, rows: count, cardW: 0, cardH: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const byWidth = (areaW - (cols - 1) * gap) / cols;
    const byHeight = ((areaH - (rows - 1) * gap) / rows) * aspect;
    const cardW = Math.max(0, Math.min(byWidth, byHeight));
    if (cardW > best.cardW) best = { cols, rows, cardW, cardH: cardW / aspect };
  }
  return best;
}

export function posterLayout(kind: PosterKind, cardCount: number): PosterLayout {
  if (kind === 'horizontal') {
    const width = 1600;
    const height = 900;
    const padding = 44;
    const headerH = 128;
    const footerH = 64;
    const sidebarW = 336;
    const sidebarGap = 28;
    const contentTop = padding + headerH + 14;
    const contentH = height - contentTop - footerH - 24;
    const gridWidth = width - padding * 2 - sidebarW - sidebarGap;
    const gridFit = fitCardGrid(cardCount, gridWidth, contentH);
    return {
      kind,
      width,
      height,
      padding,
      headerH,
      footerH,
      sidebarW,
      sidebarGap,
      statsH: 0,
      grid: { x: padding, y: contentTop, width: gridWidth, height: contentH },
      gridFit,
      sidebar: { x: width - padding - sidebarW, y: contentTop, width: sidebarW, height: contentH },
      statsBand: null,
    };
  }

  const width = 900;
  const height = 1600;
  const padding = 40;
  const headerH = 158;
  const footerH = 56;
  const statsH = 300;
  const contentTop = padding + headerH + 12;
  const gridWidth = width - padding * 2;
  const gridHeight = height - padding - footerH - statsH - 12 - contentTop;
  const gridFit = fitCardGrid(cardCount, gridWidth, gridHeight);
  return {
    kind,
    width,
    height,
    padding,
    headerH,
    footerH,
    sidebarW: 0,
    sidebarGap: 0,
    statsH,
    grid: { x: padding, y: contentTop, width: gridWidth, height: gridHeight },
    gridFit,
    sidebar: null,
    statsBand: {
      x: padding,
      y: contentTop + gridHeight + 18,
      width: width - padding * 2,
      height: statsH,
    },
  };
}

/* ------------------------------------------------------------------ 文案 */

export const POSTER_DISCLAIMER =
  '非官方同人项目 · 仅供卡组构筑测试与娱乐 · KARDS 及卡牌素材版权归 1939 Games 所有';

export const POSTER_FOOTER_LEFT = 'FARDS · KARDS 卡组对战测试场';
export const POSTER_FOOTER_RIGHT = 'AGPL-3.0 · github.com/FengFaQ/Fards';

export function posterFileName(model: PosterModel): string {
  const safe = (model.title || 'fards-deck').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
  return `fards-${safe}-${model.kind}.png`;
}

/** 稀有度徽记颜色（画布图例用） */
export function rarityColor(rarity: string): string {
  return rarityMeta(rarity).color;
}

/** 版式标题 */
export function posterKindLabel(kind: PosterKind | 'print_template'): string {
  if (kind === 'vertical') return '竖版概览 / VERTICAL';
  if (kind === 'print_template') return '打印模板 / PRINT';
  return '横版概览 / HORIZONTAL';
}
