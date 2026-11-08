import { memo, useMemo } from 'react';

export interface CurveChartProps {
  /** 下标 = 费用，9 表示 9+ */
  counts: number[];
  className?: string;
  height?: number;
  /** 目标张数（用于刻度参考线） */
  target?: number;
}

/** 费用曲线（克雷迪特曲线） */
function CurveChartInner({ counts, className = '', height = 78, target }: CurveChartProps) {
  const series = useMemo(() => {
    const padded = [...counts];
    while (padded.length < 10) padded.push(0);
    return padded.slice(0, 10);
  }, [counts]);

  const max = Math.max(1, ...series);
  const total = series.reduce((a, b) => a + b, 0);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="fards-label text-field-400">费用曲线</span>
        <span className="font-display text-[11px] tracking-wider text-brass-400">
          {total}
          {target ? <span className="text-field-500"> / {target}</span> : null} 张
        </span>
      </div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {series.map((count, index) => {
          const h = count === 0 ? 2 : Math.max(4, Math.round((count / max) * (height - 16)));
          return (
            <div
              key={index}
              className="group flex flex-1 flex-col items-center justify-end gap-0.5"
              title={`${index === 9 ? '9+' : index} 费 · ${count} 张`}
            >
              <span
                className={`font-display text-[9px] leading-none ${
                  count > 0 ? 'text-brass-300/90' : 'text-transparent'
                }`}
              >
                {count}
              </span>
              <div
                className="w-full rounded-t-[2px] transition-[filter] duration-200 group-hover:brightness-125"
                style={{
                  height: h,
                  background:
                    count === 0
                      ? 'rgb(63 59 37 / 0.6)'
                      : 'linear-gradient(to top, rgb(122 93 26 / 0.85), rgb(216 180 95 / 0.95))',
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-0.5 flex gap-[3px] border-t border-field-700/60 pt-0.5">
        {series.map((_, index) => (
          <span
            key={index}
            className="flex-1 text-center font-mono text-[9px] leading-none text-field-500"
          >
            {index === 9 ? '9+' : index}
          </span>
        ))}
      </div>
    </div>
  );
}

export const CurveChart = memo(CurveChartInner);
export default CurveChart;
