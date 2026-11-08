import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * 窗口化卡片网格（虚拟滚动）
 * ------------------------------------------------------------------
 * 图鉴 1646 张 / 构筑卡池数百张，全量挂 DOM 会让节点数上万、滚动掉帧。
 * 这里只渲染「可视区 ±1 屏」的卡片：
 *  - 列数：按 viewport 宽度匹配断点（与 Tailwind 的 sm/md/lg/xl/2xl 语义一致）
 *  - 卡宽：由容器宽度与列数反算，行高 = 卡宽 / 宽高比 + 间距（卡面固定宽高比，行高可计算）
 *  - 定位：绝对定位 + translate3d（只动 transform，不触发布局重排）
 *  - 滚动：passive 监听 + requestAnimationFrame 合并，滚动过程只更新窗口切片
 *
 * 为什么不用「CSS grid + 上下占位块」：间距 gap 会让占位高度与行高的换算多出
 * 一次 gap 修正，容易在滚动中产生 1 行的漂移；绝对定位 + 显式容器高度更稳。
 */

/** [视口最小宽度 px, 列数]，ascending */
export type GridBreakpoints = readonly (readonly [number, number])[];

export interface VirtualCardGridProps<T> {
  items: T[];
  itemKey: (item: T, index: number) => string;
  /** 视口断点 → 列数（与原来的 Tailwind grid-cols-* 保持一致） */
  breakpoints: GridBreakpoints;
  /** 卡片宽高比 = width / height（.fards-card 为 500/702） */
  aspect?: number;
  /** 卡片间距 px（原 Tailwind gap-2.5 = 10px） */
  gap?: number;
  /** 可视区外额外渲染的屏数（上下各一份），默认 1 屏 */
  overscanScreens?: number;
  className?: string;
  itemClassName?: string;
  renderItem: (item: T, index: number) => ReactNode;
}

interface GridWindow {
  start: number;
  end: number;
  cols: number;
  colWidth: number;
  rowHeight: number;
  totalHeight: number;
}

const EMPTY_WINDOW: GridWindow = {
  start: 0,
  end: 0,
  cols: 0,
  colWidth: 0,
  rowHeight: 0,
  totalHeight: 0,
};

function colsFor(breakpoints: GridBreakpoints, viewportWidth: number): number {
  let cols = breakpoints[0]?.[1] ?? 1;
  for (const [minWidth, value] of breakpoints) {
    if (viewportWidth >= minWidth) cols = value;
  }
  return cols;
}

function sameWindow(a: GridWindow, b: GridWindow): boolean {
  return (
    a.start === b.start &&
    a.end === b.end &&
    a.cols === b.cols &&
    Math.abs(a.colWidth - b.colWidth) < 0.01 &&
    Math.abs(a.rowHeight - b.rowHeight) < 0.01 &&
    Math.abs(a.totalHeight - b.totalHeight) < 0.01
  );
}

export function VirtualCardGrid<T>({
  items,
  itemKey,
  breakpoints,
  aspect = 500 / 702,
  gap = 10,
  overscanScreens = 1,
  className = '',
  itemClassName = '',
  renderItem,
}: VirtualCardGridProps<T>) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [win, setWin] = useState<GridWindow>(EMPTY_WINDOW);
  const itemCount = items.length;
  const countRef = useRef(itemCount);
  countRef.current = itemCount;

  /** 重新计算窗口（读取真实滚动位置与容器宽度，不使用累计值，避免漂移） */
  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const width = host.clientWidth;
    if (width <= 0) return;
    const cols = colsFor(breakpoints, window.innerWidth);
    const colWidth = (width - gap * (cols - 1)) / cols;
    const rowHeight = colWidth / aspect + gap;
    const rows = Math.max(0, Math.ceil(countRef.current / cols));
    const totalHeight = rows > 0 ? rows * rowHeight - gap : 0;

    const rect = host.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const scrolledTop = Math.max(0, -rect.top);
    const overscanPx = viewportHeight * overscanScreens;
    const top = Math.max(0, scrolledTop - overscanPx);
    const bottom = Math.min(totalHeight, scrolledTop + viewportHeight + overscanPx);

    const firstRow = rowHeight > 0 ? Math.floor(top / rowHeight) : 0;
    const lastRow = rowHeight > 0 ? Math.ceil(bottom / rowHeight) : rows;
    const start = Math.min(itemCount, Math.max(0, firstRow) * cols);
    const end = Math.min(itemCount, Math.max(0, lastRow) * cols);

    const next: GridWindow = {
      start,
      end: Math.max(start, end),
      cols,
      colWidth,
      rowHeight,
      totalHeight,
    };
    setWin((prev) => (sameWindow(prev, next) ? prev : next));
  }, [aspect, breakpoints, gap, itemCount, overscanScreens]);

  const rafRef = useRef(0);
  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      measure();
    });
  }, [measure]);

  // 首屏布局：在 paint 前测量容器宽度，避免出现空白帧
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // 数量变化（筛选/排序/加载）后重量一次
  useEffect(() => {
    measure();
  }, [itemCount, measure]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(host);
    }
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [schedule]);

  const visible = useMemo(
    () => (win.cols > 0 ? items.slice(win.start, win.end) : []),
    [items, win],
  );

  return (
    <div
      ref={hostRef}
      className={`relative ${className}`}
      style={{ height: win.totalHeight || undefined }}
      data-virtual-grid="true"
      data-virtual-count={itemCount}
      data-virtual-rendered={visible.length}
    >
      {visible.map((item, offset) => {
        const index = win.start + offset;
        const row = Math.floor(index / win.cols);
        const col = index - row * win.cols;
        const x = col * (win.colWidth + gap);
        const y = row * win.rowHeight;
        return (
          <div
            key={itemKey(item, index)}
            className={itemClassName}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: win.colWidth,
              transform: `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0)`,
            }}
          >
            {renderItem(item, index)}
          </div>
        );
      })}
    </div>
  );
}

export default VirtualCardGrid;
