import { memo } from 'react';

export interface DistItem {
  key: string;
  label: string;
  count: number;
  color: string;
}

export interface TypeBarProps {
  items: DistItem[];
  total: number;
  className?: string;
  /** 紧凑模式（只显示条，不显示图例） */
  compact?: boolean;
}

/** 类型 / 阵营分布条（堆叠 + 图例） */
function TypeBarInner({ items, total, className = '', compact = false }: TypeBarProps) {
  const visible = items.filter((item) => item.count > 0);
  const sum = Math.max(1, total);

  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-sm border border-field-700/60 bg-field-950/70">
        {visible.map((item) => (
          <span
            key={item.key}
            title={`${item.label} ${item.count} 张`}
            style={{
              width: `${(item.count / sum) * 100}%`,
              backgroundColor: item.color,
            }}
            className="h-full"
          />
        ))}
      </div>
      {!compact && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {visible.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-2 font-body text-[10px] text-field-300"
            >
              <span className="flex min-w-0 items-center gap-1">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="font-display text-[10px] text-field-200">{item.count}</span>
            </div>
          ))}
          {visible.length === 0 && (
            <span className="col-span-2 font-body text-[10px] text-field-500">尚无单位</span>
          )}
        </div>
      )}
    </div>
  );
}

export const TypeBar = memo(TypeBarInner);
export default TypeBar;
