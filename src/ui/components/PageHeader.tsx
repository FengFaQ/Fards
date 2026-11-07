import type { ReactNode } from 'react';

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** 页面标题区：小标签 + 大标题 + 副标题 + 右侧操作区 */
export function PageHeader({ eyebrow, title, subtitle, actions, className = '' }: PageHeaderProps) {
  return (
    <header
      className={`relative mb-5 flex flex-col gap-3 border-b border-field-700/60 pb-4 sm:flex-row sm:items-end sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="fards-label mb-1.5 flex items-center gap-2 text-brass-500">
            <span className="inline-block h-px w-6 bg-brass-600/70" />
            {eyebrow}
          </p>
        )}
        <h1 className="fards-title text-2xl leading-none sm:text-3xl">{title}</h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl font-body text-xs leading-relaxed text-field-300">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export default PageHeader;
