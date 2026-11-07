import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let toastSeq = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const id = ++toastSeq;
    set((state) => ({
      toasts: [...state.toasts.slice(-3), { id, message, tone }],
    }));
    window.setTimeout(() => {
      if (get().toasts.some((t) => t.id === id)) {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }
    }, 2800);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** 非组件环境下的快捷调用 */
export const toast = (message: string, tone: ToastTone = 'info') =>
  useToastStore.getState().push(message, tone);
