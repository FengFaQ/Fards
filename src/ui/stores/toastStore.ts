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
  /* 幂等：id 不存在时返回原 state，避免无意义的数组新建导致整条提示列表重渲染 */
  dismiss: (id) =>
    set((state) => (state.toasts.some((t) => t.id === id)
      ? { toasts: state.toasts.filter((t) => t.id !== id) }
      : state)),
}));

/** 非组件环境下的快捷调用 */
export const toast = (message: string, tone: ToastTone = 'info') =>
  useToastStore.getState().push(message, tone);
