export interface FacetOption {
  value: string;
  label: string;
  count?: number;
  /** 小圆点颜色（阵营/稀有度） */
  color?: string;
}

export interface FacetGroupProps {
  label: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear?: () => void;
  className?: string;
  /** 选项过多时限制高度滚动 */
  maxHeight?: number;
}

/** 筛选组：一组 chip，可多选 */
export function FacetGroup({
  label,
  options,
  selected,
  onToggle,
  onClear,
  className = '',
  maxHeight,
}: FacetGroupProps) {
  return (
    <section className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="fards-label text-[10px] text-field-400">{label}</h3>
        {selected.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="font-body text-[10px] tracking-wider text-brass-500 transition-colors hover:text-brass-300"
          >
            清除
          </button>
        )}
      </div>
      <div
        className="flex flex-wrap gap-1.5 overflow-y-auto pr-1"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              aria-pressed={active}
              className={`fards-chip ${active ? 'fards-chip-active' : ''}`}
            >
              {option.color && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
              )}
              <span>{option.label}</span>
              {option.count !== undefined && (
                <span className={`font-mono text-[9px] ${active ? 'text-brass-400' : 'text-field-500'}`}>
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default FacetGroup;
