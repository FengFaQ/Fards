import type { ReactNode } from 'react';
import { IconAlert, IconInfo, IconShield } from '../components/icons';

export interface LanNoticeProps {
  tone?: 'info' | 'warn' | 'error' | 'ok';
  title: string;
  children?: ReactNode;
  steps?: string[];
  actions?: ReactNode;
  className?: string;
}

const TONE = {
  info: {
    border: 'border-brass-600/50',
    bar: 'bg-brass-500',
    text: 'text-brass-300',
    icon: IconInfo,
  },
  ok: {
    border: 'border-ink-green/60',
    bar: 'bg-emerald-500',
    text: 'text-emerald-300',
    icon: IconShield,
  },
  warn: {
    border: 'border-amber-600/60',
    bar: 'bg-amber-500',
    text: 'text-amber-300',
    icon: IconAlert,
  },
  error: {
    border: 'border-ink-red/70',
    bar: 'bg-red-500',
    text: 'text-red-300',
    icon: IconAlert,
  },
} as const;

/** 局域网大厅提示条：连接失败说明、房间错误、静态站兜底 */
export function LanNotice({ tone = 'info', title, children, steps, actions, className = '' }: LanNoticeProps) {
  const meta = TONE[tone];
  const Icon = meta.icon;
  return (
    <section
      className={`relative overflow-hidden rounded border ${meta.border} bg-field-900/80 p-4 shadow-[var(--shadow-card)] ${className}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${meta.bar}`} />
      <div className="flex items-start gap-2.5 pl-1">
        <Icon size={16} className={`mt-0.5 shrink-0 ${meta.text}`} />
        <div className="min-w-0 flex-1">
          <p className={`font-display text-[13px] tracking-[0.08em] ${meta.text}`}>{title}</p>
          {children && (
            <div className="mt-1.5 font-body text-[11px] leading-relaxed text-field-300">{children}</div>
          )}
          {steps && steps.length > 0 && (
            <ol className="mt-2 space-y-1">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-2 font-body text-[11px] leading-relaxed text-field-400">
                  <span className="mt-[1px] shrink-0 font-display text-[10px] text-brass-500">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          {actions && <div className="mt-2.5 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

export default LanNotice;
