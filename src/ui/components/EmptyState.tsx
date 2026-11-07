import type { ReactNode } from 'react';
import { IconAlert, IconInfo } from './icons';

export interface EmptyStateProps {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: 'info' | 'warn';
  className?: string;
}

/** 空状态 / 加载失败占位（军事档案风格虚线框） */
export function EmptyState({
  title,
  hint,
  action,
  icon,
  tone = 'info',
  className = '',
}: EmptyStateProps) {
  const Icon = tone === 'warn' ? IconAlert : IconInfo;
  return (
    <div
      className={`fards-grid-bg flex flex-col items-center justify-center gap-3 rounded border border-dashed border-field-600/70 bg-field-900/40 px-6 py-14 text-center ${className}`}
    >
      <div className={`rounded-full border border-field-600/60 p-3 ${tone === 'warn' ? 'text-ink-red' : 'text-brass-500'}`}>
        {icon ?? <Icon size={22} />}
      </div>
      <p className="fards-title text-sm tracking-[0.18em]">{title}</p>
      {hint && <p className="max-w-md font-body text-xs leading-relaxed text-field-400">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export default EmptyState;
