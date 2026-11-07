/**
 * 卡组概览图 PNG 导出（Canvas 2x）
 * ------------------------------------------------------------------
 * - 卡图统一 fetch → blob → createImageBitmap（避免 canvas 被跨域图片污染）
 * - 本地图缺失/跨域失败时按阵营色画占位 + 卡名 + 攻防
 * - 绘制与 DOM 预览共用 posterModel 的布局参数
 */
import { cardImageSources, type UiCard } from '../lib/dataBridge';
import { cardKeywords, factionMeta, rarityMeta } from '../lib/format';
import {
  posterLayout,
  posterFileName,
  POSTER_DISCLAIMER,
  POSTER_FOOTER_LEFT,
  POSTER_FOOTER_RIGHT,
  type PosterLayout,
  type PosterModel,
} from './posterModel';

const C = {
  bg: '#12140d',
  panel: '#1a190f',
  panel2: '#161810',
  brass: '#c39b3a',
  brassLight: '#e9cf8a',
  brassDim: '#7a5d1a',
  ink: '#e6e2cd',
  dim: '#a8a08a',
  dimmer: '#6e653f',
  line: 'rgba(195, 155, 58, 0.20)',
  lineSoft: 'rgba(195, 155, 58, 0.10)',
};

const FONT_STENCIL = '"Black Ops One", "Oswald", "Noto Sans SC", sans-serif';
const FONT_BODY = '"Oswald", "Noto Sans SC", "Microsoft YaHei", sans-serif';

/* ------------------------------------------------------------------ 图片加载 */

const bitmapCache = new Map<string, Promise<ImageBitmap | null>>();

function loadBitmapForCard(card: UiCard): Promise<ImageBitmap | null> {
  const key = card.cardId;
  const cached = bitmapCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const sources = cardImageSources(card);
    for (const url of sources) {
      try {
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (!blob.size) continue;
        return await createImageBitmap(blob);
      } catch {
        /* 尝试下一个来源 */
      }
    }
    return null;
  })();
  bitmapCache.set(key, promise);
  return promise;
}

async function preloadCardImages(
  cards: { card: UiCard }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, ImageBitmap | null>> {
  const map = new Map<string, ImageBitmap | null>();
  const queue = [...cards];
  const total = queue.length;
  let done = 0;
  const workers = Array.from({ length: Math.min(6, total) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      const bitmap = await loadBitmapForCard(item.card);
      map.set(item.card.cardId, bitmap);
      done += 1;
      onProgress?.(done, total);
    }
  });
  await Promise.all(workers);
  return map;
}

/* ------------------------------------------------------------------ 绘制工具 */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: string | number,
  family: string,
) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function withLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
  } catch {
    /* 浏览器不支持时忽略 */
  }
}

function text(
  ctx: CanvasRenderingContext2D,
  content: string,
  x: number,
  y: number,
  options: {
    size: number;
    weight?: string | number;
    family?: string;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    spacing?: string;
  },
) {
  setFont(ctx, options.size, options.weight ?? 400, options.family ?? FONT_BODY);
  ctx.fillStyle = options.color ?? C.ink;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = options.baseline ?? 'alphabetic';
  if (options.spacing) withLetterSpacing(ctx, options.spacing);
  ctx.fillText(content, x, y);
  if (options.spacing) withLetterSpacing(ctx, '0px');
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  content: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  options: { size: number; weight?: string | number; color?: string; align?: CanvasTextAlign },
): number {
  setFont(ctx, options.size, options.weight ?? 400, FONT_BODY);
  ctx.fillStyle = options.color ?? C.ink;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  const chars = [...content];
  const lines: string[] = [];
  let current = '';
  for (const ch of chars) {
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = ch;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return lines.length;
}

function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  subtitle?: string,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // 顶部黄铜短线
  ctx.fillStyle = C.brassDim;
  ctx.fillRect(x + 12, y + 12, 26, 2);

  text(ctx, title, x + 12, y + 32, {
    size: 12,
    weight: 600,
    family: FONT_BODY,
    color: C.brassLight,
    spacing: '2px',
  });
  if (subtitle) {
    text(ctx, subtitle, x + w - 12, y + 32, {
      size: 10,
      family: FONT_BODY,
      color: C.dimmer,
      align: 'right',
      spacing: '1px',
    });
  }
}

/* ------------------------------------------------------------------ 背景 */

function drawBackground(ctx: CanvasRenderingContext2D, layout: PosterLayout) {
  const { width, height } = layout;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, height);

  // 顶部/底部黄铜光晕
  const topGlow = ctx.createRadialGradient(width / 2, -height * 0.15, 0, width / 2, -height * 0.15, height * 0.9);
  topGlow.addColorStop(0, 'rgba(216, 180, 95, 0.16)');
  topGlow.addColorStop(0.55, 'rgba(195, 155, 58, 0.05)');
  topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, width, height);

  const bottomGlow = ctx.createRadialGradient(width / 2, height * 1.1, 0, width / 2, height * 1.1, height * 0.7);
  bottomGlow.addColorStop(0, 'rgba(93, 122, 63, 0.10)');
  bottomGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, 0, width, height);

  // 战术网格
  ctx.strokeStyle = C.lineSoft;
  ctx.lineWidth = 1;
  const step = 44;
  ctx.beginPath();
  for (let x = step; x < width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = step; y < height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // 外框 + 四角准星
  const inset = 14;
  ctx.strokeStyle = 'rgba(195, 155, 58, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  ctx.strokeStyle = 'rgba(195, 155, 58, 0.65)';
  ctx.lineWidth = 3;
  const mark = 34;
  const corners: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [width - inset, inset, -1, 1],
    [inset, height - inset, 1, -1],
    [width - inset, height - inset, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * mark, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * mark);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ 头部 / 底部 */

function drawHeader(ctx: CanvasRenderingContext2D, model: PosterModel, layout: PosterLayout) {
  const { width, padding, headerH } = layout;
  const baseY = padding + 18;

  // 品牌
  text(ctx, 'FARDS', padding, baseY + 44, {
    size: layout.kind === 'horizontal' ? 50 : 42,
    weight: 400,
    family: FONT_STENCIL,
    color: C.brassLight,
    spacing: '8px',
  });
  text(ctx, 'KARDS 卡组对战测试场', padding + 2, baseY + 68, {
    size: 12,
    family: FONT_BODY,
    color: C.dimmer,
    spacing: '3px',
  });
  text(ctx, 'DECK OVERVIEW · 卡组概览', padding + 2, baseY + 88, {
    size: 10,
    family: FONT_BODY,
    color: C.brass,
    spacing: '4px',
  });

  // 主标题区
  const titleX = layout.kind === 'horizontal' ? padding + 330 : padding + 2;
  const titleY = layout.kind === 'horizontal' ? baseY + 40 : baseY + 112;
  const maxTitleWidth = layout.kind === 'horizontal' ? width - padding - titleX - 240 : width - padding * 2;

  setFont(ctx, layout.kind === 'horizontal' ? 30 : 26, 600, FONT_BODY);
  const title = model.title;
  let titleText = title;
  if (ctx.measureText(titleText).width > maxTitleWidth) {
    const chars = [...title];
    while (chars.length > 2 && ctx.measureText(`${chars.join('')}…`).width > maxTitleWidth) {
      chars.pop();
    }
    titleText = `${chars.join('')}…`;
  }
  text(ctx, titleText, titleX, titleY, {
    size: layout.kind === 'horizontal' ? 30 : 26,
    weight: 600,
    family: FONT_BODY,
    color: C.ink,
    spacing: '1px',
  });

  // 阵营 + 张数
  const metaY = titleY + 30;
  ctx.save();
  roundRect(ctx, titleX, metaY - 16, 8, 16, 2);
  ctx.fillStyle = model.faction.color;
  ctx.fill();
  ctx.restore();
  text(ctx, model.faction.zh, titleX + 16, metaY, {
    size: 13,
    family: FONT_BODY,
    color: model.faction.color,
    weight: 500,
    spacing: '2px',
  });
  let metaX = titleX + 16 + 40;
  if (model.ally) {
    ctx.save();
    roundRect(ctx, metaX, metaY - 16, 8, 16, 2);
    ctx.fillStyle = model.ally.color;
    ctx.fill();
    ctx.restore();
    text(ctx, `盟军 ${model.ally.zh}`, metaX + 16, metaY, {
      size: 13,
      family: FONT_BODY,
      color: model.ally.color,
      weight: 500,
      spacing: '2px',
    });
    metaX += 96;
  }
  text(ctx, `${model.stats.total} 张编制 · ${model.stats.unique} 种卡牌`, metaX + 8, metaY, {
    size: 12,
    family: FONT_BODY,
    color: C.dim,
    spacing: '1px',
  });

  if (model.subtitle) {
    text(ctx, model.subtitle, titleX, metaY + 22, {
      size: 11,
      family: FONT_BODY,
      color: C.dimmer,
    });
  }

  // 右侧大数字（横版）
  if (layout.kind === 'horizontal') {
    const rightX = width - padding;
    text(ctx, String(model.stats.total), rightX, baseY + 56, {
      size: 62,
      weight: 400,
      family: FONT_STENCIL,
      color: C.brassLight,
      align: 'right',
    });
    text(ctx, '总张数 / CARDS', rightX, baseY + 78, {
      size: 10,
      family: FONT_BODY,
      color: C.dimmer,
      align: 'right',
      spacing: '3px',
    });
    text(ctx, `单位 ${model.stats.units} · 指令 ${model.stats.orders}`, rightX, baseY + 100, {
      size: 11,
      family: FONT_BODY,
      color: C.dim,
      align: 'right',
    });
  }

  // 分隔线
  const lineY = padding + headerH - 12;
  const grad = ctx.createLinearGradient(padding, lineY, width - padding, lineY);
  grad.addColorStop(0, 'rgba(195, 155, 58, 0.05)');
  grad.addColorStop(0.5, 'rgba(195, 155, 58, 0.55)');
  grad.addColorStop(1, 'rgba(195, 155, 58, 0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(padding, lineY, width - padding * 2, 1.5);
}

function drawFooter(ctx: CanvasRenderingContext2D, layout: PosterLayout) {
  const { width, height, padding } = layout;
  const y = height - padding + 6;
  text(ctx, POSTER_FOOTER_LEFT, padding, y, {
    size: 11,
    family: FONT_BODY,
    color: C.brass,
    spacing: '2px',
  });
  text(ctx, POSTER_DISCLAIMER, width / 2, y, {
    size: 10,
    family: FONT_BODY,
    color: C.dimmer,
    align: 'center',
  });
  text(ctx, POSTER_FOOTER_RIGHT, width - padding, y, {
    size: 10,
    family: FONT_BODY,
    color: C.dimmer,
    align: 'right',
  });
}

/* ------------------------------------------------------------------ 卡牌 */

function drawCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  card: UiCard,
  count: number,
  bitmap: ImageBitmap | null,
) {
  const faction = factionMeta(card.faction);
  const rarity = rarityMeta(card.rarity);

  ctx.save();
  roundRect(ctx, x, y, w, h, 3);
  ctx.clip();

  if (bitmap) {
    const scale = Math.max(w / bitmap.width, h / bitmap.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (bitmap.width - sw) / 2;
    const sy = (bitmap.height - sh) / 2;
    ctx.drawImage(bitmap, sx, sy, sw, sh, x, y, w, h);
  } else {
    // 阵营色占位
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, faction.shade);
    grad.addColorStop(1, C.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    text(ctx, faction.zh, x + 6, y + 16, {
      size: 9,
      family: FONT_BODY,
      color: faction.color,
      spacing: '1px',
    });
    const nameLines = wrapText(ctx, card.nameZh, x + w / 2, y + h / 2 - 6, w - 14, 13, 3, {
      size: 11,
      weight: 500,
      color: C.ink,
      align: 'center',
    });
    text(ctx, `${card.kredits} 费 · ${card.attack}/${card.defense}`, x + w / 2, y + h / 2 - 6 + nameLines * 13 + 6, {
      size: 9,
      family: FONT_BODY,
      color: C.dim,
      align: 'center',
    });
  }

  // 底部名称渐变条（卡面本身带名字，这里只加强可读性）
  const plateH = Math.max(16, h * 0.16);
  const plate = ctx.createLinearGradient(0, y + h - plateH, 0, y + h);
  plate.addColorStop(0, 'rgba(8, 9, 5, 0)');
  plate.addColorStop(1, 'rgba(8, 9, 5, 0.78)');
  ctx.fillStyle = plate;
  ctx.fillRect(x, y + h - plateH, w, plateH);

  // 稀有度侧条
  ctx.fillStyle = rarity.color;
  ctx.fillRect(x, y, Math.max(2, w * 0.02), h);

  ctx.restore();

  // 边框
  ctx.strokeStyle = 'rgba(195, 155, 58, 0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 3);
  ctx.stroke();

  // 数量角标
  if (count > 1) {
    const badgeW = Math.max(22, w * 0.26);
    const badgeH = Math.max(14, h * 0.1);
    ctx.save();
    roundRect(ctx, x + w - badgeW - 3, y + 3, badgeW, badgeH, 2);
    ctx.fillStyle = 'rgba(14, 13, 7, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(195, 155, 58, 0.7)';
    ctx.stroke();
    text(ctx, `×${count}`, x + w - badgeW / 2 - 3, y + 3 + badgeH - Math.max(3, badgeH * 0.27), {
      size: Math.max(9, badgeH * 0.62),
      weight: 400,
      family: FONT_STENCIL,
      color: C.brassLight,
      align: 'center',
    });
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ 统计面板 */

function drawCurvePanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  model: PosterModel,
) {
  panel(ctx, x, y, w, h, '费用曲线 / CURVE', `${model.stats.total} 张`);
  const values = model.stats.byKredits.slice(0, 10);
  const max = Math.max(1, ...values);
  const left = x + 14;
  const right = x + w - 14;
  const bottom = y + h - 24;
  const top = y + 48;
  const barGap = 3;
  const barW = (right - left - barGap * (values.length - 1)) / values.length;

  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0;
    const barH = value === 0 ? 2 : Math.max(3, ((bottom - top) * value) / max);
    const bx = left + i * (barW + barGap);
    const by = bottom - barH;
    const grad = ctx.createLinearGradient(0, by, 0, bottom);
    grad.addColorStop(0, 'rgba(233, 207, 138, 0.95)');
    grad.addColorStop(1, 'rgba(122, 93, 26, 0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, barW, barH);
    if (value > 0) {
      text(ctx, String(value), bx + barW / 2, by - 4, {
        size: 9,
        family: FONT_BODY,
        color: C.brassLight,
        align: 'center',
      });
    }
    text(ctx, i === 9 ? '9+' : String(i), bx + barW / 2, bottom + 13, {
      size: 8,
      family: FONT_BODY,
      color: C.dimmer,
      align: 'center',
    });
  }
  ctx.fillStyle = 'rgba(195, 155, 58, 0.25)';
  ctx.fillRect(left, bottom + 1, right - left, 1);
}

function drawTypePanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  model: PosterModel,
) {
  panel(ctx, x, y, w, h, '类型分布 / TYPES');
  const items = model.stats.byType.filter((item) => item.count > 0);
  const barY = y + 48;
  const barH = 10;
  const total = Math.max(1, model.stats.units + model.stats.orders);
  let cursor = x + 14;
  const barW = w - 28;
  for (const item of items) {
    const segW = (item.count / total) * barW;
    ctx.fillStyle = item.color;
    ctx.fillRect(cursor, barY, Math.max(1, segW - 1), barH);
    cursor += segW;
  }
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 14, barY, barW, barH);

  let rowY = barY + 30;
  const colW = (w - 28) / 2;
  items.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cx = x + 14 + col * colW;
    const cy = rowY + row * 20;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(cx + 4, cy - 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, item.label, cx + 13, cy, {
      size: 10,
      family: FONT_BODY,
      color: C.dim,
    });
    text(ctx, String(item.count), cx + colW - 18, cy, {
      size: 10,
      family: FONT_BODY,
      color: C.ink,
      align: 'right',
    });
  });
}

function drawStatPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  model: PosterModel,
) {
  panel(ctx, x, y, w, h, '编制统计 / MANIFEST');
  const rows: [string, string][] = [
    ['卡牌张数', `${model.stats.total}`],
    ['卡牌种类', `${model.stats.unique}`],
    ['单位', `${model.stats.units}`],
    ['指令 / 反制', `${model.stats.orders}`],
    ['精英卡', `${model.stats.elite}`],
    ['盟军卡', `${model.stats.allyCards}`],
  ];
  let rowY = y + 56;
  for (const [label, value] of rows) {
    text(ctx, label, x + 14, rowY, { size: 10, family: FONT_BODY, color: C.dimmer });
    text(ctx, value, x + w - 14, rowY, {
      size: 11,
      weight: 500,
      family: FONT_BODY,
      color: C.ink,
      align: 'right',
    });
    ctx.fillStyle = 'rgba(195, 155, 58, 0.10)';
    ctx.fillRect(x + 14, rowY + 6, w - 28, 1);
    rowY += 22;
  }
}

/* ------------------------------------------------------------------ 主绘制 */

export async function renderPosterCanvas(
  model: PosterModel,
  options?: { scale?: number; onProgress?: (done: number, total: number) => void },
): Promise<HTMLCanvasElement> {
  const scale = options?.scale ?? 2;
  const layout = posterLayout(model.kind, model.cards.length);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D 不可用');
  ctx.scale(scale, scale);

  // 等字体就绪，避免标题回退成衬线体
  try {
    await document.fonts.ready;
  } catch {
    /* 忽略 */
  }

  const bitmaps = await preloadCardImages(model.cards, options?.onProgress);

  drawBackground(ctx, layout);
  drawHeader(ctx, model, layout);
  drawFooter(ctx, layout);

  // 卡牌网格
  const { cols, cardW, cardH } = layout.gridFit;
  const gap = 10;
  const gridW = cols * cardW + (cols - 1) * gap;
  const startX = layout.grid.x + Math.max(0, (layout.grid.width - gridW) / 2);
  model.cards.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = startX + col * (cardW + gap);
    const y = layout.grid.y + row * (cardH + gap);
    drawCard(ctx, x, y, cardW, cardH, item.card, item.count, bitmaps.get(item.card.cardId) ?? null);
  });

  // 横版：右侧统计栏
  if (layout.sidebar) {
    const { x, y, width, height } = layout.sidebar;
    const curveH = Math.round(height * 0.34);
    const typeH = Math.round(height * 0.33);
    const statH = height - curveH - typeH - 20;
    drawCurvePanel(ctx, x, y, width, curveH, model);
    drawTypePanel(ctx, x, y + curveH + 10, width, typeH, model);
    drawStatPanel(ctx, x, y + curveH + typeH + 20, width, statH, model);
  }

  // 竖版：底部统计带
  if (layout.statsBand) {
    const { x, y, width, height } = layout.statsBand;
    const colW = (width - 24) / 3;
    drawCurvePanel(ctx, x, y, colW, height, model);
    drawTypePanel(ctx, x + colW + 12, y, colW, height, model);
    drawStatPanel(ctx, x + (colW + 12) * 2, y, colW, height, model);
  }

  // 生成时间（右下角小字）
  const stamp = new Date(model.generatedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  text(
    ctx,
    `GENERATED ${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`,
    layout.width - layout.padding,
    layout.height - layout.padding - 8,
    { size: 8, family: FONT_BODY, color: 'rgba(110, 101, 63, 0.8)', align: 'right' },
  );

  return canvas;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** 渲染并下载 PNG；返回是否成功 */
export async function exportPosterPng(
  model: PosterModel,
  options?: { filename?: string; onProgress?: (done: number, total: number) => void },
): Promise<boolean> {
  const canvas = await renderPosterCanvas(model, {
    scale: 2,
    onProgress: options?.onProgress,
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  downloadBlob(blob, options?.filename ?? posterFileName(model));
  return true;
}

/** 供打印/调试：把 canvas 转 dataURL */
export async function posterDataUrl(model: PosterModel): Promise<string | null> {
  const canvas = await renderPosterCanvas(model, { scale: 1 });
  return canvas.toDataURL('image/png');
}
