import { factionMeta } from '../lib/format';

export interface FactionBadgeProps {
  faction?: string | null;
  size?: 'xs' | 'sm' | 'md';
  showEn?: boolean;
  className?: string;
}

const SIZES = {
  xs: { box: 'gap-1 px-1 py-[1px]', dot: 'h-1.5 w-1.5', text: 'text-[9px]' },
  sm: { box: 'gap-1.5 px-1.5 py-0.5', dot: 'h-2 w-2', text: 'text-[10px]' },
  md: { box: 'gap-2 px-2 py-1', dot: 'h-2.5 w-2.5', text: 'text-[11px]' },
} as const;

/** 阵营徽记：色点 + 中文阵营名（可选英文） */
export function FactionBadge({ faction, size = 'sm', showEn = false, className = '' }: FactionBadgeProps) {
  const meta = factionMeta(faction);
  const s = SIZES[size];
  return (
    <span
      className={`inline-flex items-center rounded-sm border ${s.box} ${className}`}
      style={{
        borderColor: `${meta.color}66`,
        backgroundColor: `${meta.color}1f`,
        color: meta.color,
      }}
      title={`${meta.zh} · ${meta.en}`}
    >
      <span className={`${s.dot} shrink-0 rounded-full`} style={{ backgroundColor: meta.color }} />
      <span className={`font-display tracking-[0.16em] uppercase ${s.text}`}>{meta.zh}</span>
      {showEn && (
        <span className="font-body text-[9px] tracking-[0.18em] text-field-400">{meta.en}</span>
      )}
    </span>
  );
}

export default FactionBadge;
