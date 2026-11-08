/**
 * 开局卡图预载浮层
 * ------------------------------------------------------------------
 * 进入战场前把双方卡组首屏（各前 10 张，去重后最多 20 张）卡图抓进 imageCache，
 * 期间盖一层全屏浮层显示进度；预载完成（含失败/超时）后由 store 移除浮层。
 * 纯展示组件：数据来自 battleStore.imagePreload，不直接调用 imageCache。
 */
import type { ImagePreloadState } from '../stores/battleStore';

export interface CardImagePreloadOverlayProps {
  progress: ImagePreloadState;
}

export default function CardImagePreloadOverlay({ progress }: CardImagePreloadOverlayProps) {
  const total = Math.max(progress.total, 1);
  const done = Math.min(Math.max(progress.done, 0), total);
  const percent = Math.round((done / total) * 100);

  return (
    <div
      className="battle-root fixed inset-0 z-[80] flex items-center justify-center bg-field-950/94 px-6 text-field-100 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="正在预载卡图"
      data-preload-overlay="true"
      data-preload-done={done}
      data-preload-total={progress.total}
    >
      <div className="fards-panel w-[min(92vw,380px)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="fards-label text-[10px] text-brass-400">战前准备 · 卡图预载</p>
          <span className="font-display text-[11px] text-brass-200 tabular-nums">
            {done}/{progress.total}
          </span>
        </div>

        <div
          className="mt-3 h-[7px] w-full overflow-hidden rounded-[2px] border border-field-600/70 bg-field-950"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={done}
        >
          <div
            className="h-full transition-[width] duration-200"
            style={{
              width: `${percent}%`,
              background: 'linear-gradient(180deg, #d8b45f, #8a6a20)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
            }}
          />
        </div>

        <p className="mt-2.5 font-body text-[10px] leading-relaxed tracking-[0.08em] text-field-400">
          正在预载卡图 <span className="text-brass-200 tabular-nums">{done}/{progress.total}</span>
          {' · '}
          进场后即可立即显示，无需再逐张拉取
        </p>
        <p className="mt-1 font-body text-[9px] leading-relaxed tracking-[0.06em] text-field-600">
          预载失败或超时会自动跳过，不影响对局开始。
        </p>
      </div>
    </div>
  );
}
