import { memo } from 'react';

export type StatKind = 'kredit' | 'attack' | 'defense' | 'operation' | 'count';

const META: Record<StatKind, { label: string; color: string; title: string }> = {
  kredit: { label: '费', color: '#d8b45f', title: '部署花费（克雷迪特）' },
  attack: { label: '攻', color: '#d98b76', title: '攻击力' },
  defense: { label: '防', color: '#8fb0c9', title: '防御力' },
  operation: { label: '动', color: '#a9a18a', title: '行动花费' },
  count: { label: '×', color: '#cfc8a8', title: '数量' },
};

export interface StatBadgeProps {
  kind: StatKind;
  value: number | string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  hideLabel?: boolean;
}

const SIZE = {
  xs: { box: 'gap-0.5 px-1 py-0 text-[9px]', value: 'text-[11px]' },
  sm: { box: 'gap-1 px-1.5 py-0.5 text-[9px]', value: 'text-[13px]' },
  md: { box: 'gap-1.5 px-2 py-1 text-[10px]', value: 'text-[16px]' },
} as const;

/** 数值徽记：费用 / 攻击 / 防御 / 行动花费 */
function StatBadgeInner({ kind, value, size = 'sm', className = '', hideLabel = false }: StatBadgeProps) {
  const meta = META[kind] ?? META.count;
  const s = SIZE[size];
  return (
    <span
      className={`inline-flex items-center rounded-sm border border-white/10 bg-field-950/80 font-body leading-none tabular-nums ${s.box} ${className}`}
      style={{ color: meta.color }}
      title={meta.title}
    >
      {!hideLabel && (
        <span className="font-body text-[8px] tracking-[0.1em] opacity-70">{meta.label}</span>
      )}
      <span className={`font-display leading-none ${s.value}`}>{value}</span>
    </span>
  );
}

/** 三个数值的组合（费用 / 攻击 / 防御） */
function StatRowInner({
  kredits,
  attack,
  defense,
  size = 'xs',
  className = '',
}: {
  kredits: number;
  attack: number;
  defense: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <StatBadge kind="kredit" value={kredits} size={size} />
      <StatBadge kind="attack" value={attack} size={size} />
      <StatBadge kind="defense" value={defense} size={size} />
    </span>
  );
}

export const StatBadge = memo(StatBadgeInner);
export const StatRow = memo(StatRowInner);
export default StatBadge;
