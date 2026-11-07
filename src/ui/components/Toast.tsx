import { useToastStore, type ToastTone } from '../stores/toastStore';
import { IconAlert, IconCheck, IconInfo, IconX } from './icons';

const TONE: Record<ToastTone, { border: string; text: string; icon: typeof IconInfo }> = {
  info: { border: 'border-brass-600/60', text: 'text-brass-300', icon: IconInfo },
  success: { border: 'border-ink-green/70', text: 'text-emerald-300', icon: IconCheck },
  warn: { border: 'border-amber-600/70', text: 'text-amber-300', icon: IconAlert },
  error: { border: 'border-ink-red/70', text: 'text-red-300', icon: IconAlert },
};

/** 全局提示条（右下角堆叠） */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[90] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((item) => {
        const tone = TONE[item.tone] ?? TONE.info;
        const Icon = tone.icon;
        return (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded border ${tone.border} bg-field-900/95 px-3 py-2.5 shadow-[var(--shadow-card)] backdrop-blur-sm animate-[rise_180ms_ease-out_both]`}
            role="status"
          >
            <Icon size={16} className={`mt-0.5 shrink-0 ${tone.text}`} />
            <p className="min-w-0 flex-1 font-body text-xs leading-relaxed text-field-100">
              {item.message}
            </p>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => dismiss(item.id)}
              className="shrink-0 text-field-500 transition-colors hover:text-field-200"
            >
              <IconX size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default ToastViewport;
