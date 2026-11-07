import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  bodyClassName?: string;
}

const WIDTH: Record<NonNullable<DialogProps['width']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
  full: 'max-w-[min(96vw,1500px)]',
};

/** 通用弹窗：Esc 关闭、点遮罩关闭、锁定背景滚动 */
export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  width = 'md',
  className = '',
  bodyClassName = '',
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastActive.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('fards-no-scroll');
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, button, select, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('fards-no-scroll');
      window.clearTimeout(timer);
      lastActive.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 animate-[fade-in_180ms_ease-out_both] bg-field-950/85 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`fards-panel fards-rivets relative flex max-h-[88vh] w-full flex-col overflow-hidden border-brass-600/40 animate-[dialog-in_220ms_cubic-bezier(0.16,1,0.3,1)_both] ${WIDTH[width]} ${className}`}
      >
        {(title || eyebrow) && (
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-field-700/70 bg-field-950/60 px-5 py-3.5">
            <div className="min-w-0">
              {eyebrow && <p className="fards-label mb-1 text-brass-500">{eyebrow}</p>}
              {title && (
                <h2 id={titleId} className="fards-title truncate text-lg leading-tight">
                  {title}
                </h2>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="shrink-0 rounded-sm border border-field-600/60 p-1.5 text-field-300 transition-colors hover:border-brass-500/60 hover:text-brass-300"
            >
              <IconX size={16} />
            </button>
          </header>
        )}
        <div className={`fards-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4 ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <footer className="shrink-0 border-t border-field-700/70 bg-field-950/60 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Dialog;
