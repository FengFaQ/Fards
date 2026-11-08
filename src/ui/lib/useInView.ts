import { useEffect, useRef, useState } from 'react';

/**
 * IntersectionObserver 可见性钩子：图片/卡片进入视口附近才开始加载。
 *
 * 性能要点：不为每个元素单独建 observer。图鉴/构筑/战场一次会挂上百个卡片，
 * 这里按 rootMargin 复用同一个 observer（同 root 下最多 1~2 个实例），
 * 观察目标用 Map 登记回调，卸载时 unobserve + 注销，避免 observer 泄漏。
 */
type InViewCallback = (inView: boolean) => void;

interface ObserverEntry {
  observer: IntersectionObserver;
  callbacks: Map<Element, InViewCallback>;
}

const observers = new Map<string, ObserverEntry | null>();

function observerFor(rootMargin: string): ObserverEntry | null {
  const cached = observers.get(rootMargin);
  if (cached !== undefined) return cached;
  if (typeof IntersectionObserver === 'undefined') {
    observers.set(rootMargin, null);
    return null;
  }
  const callbacks = new Map<Element, InViewCallback>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const callback = callbacks.get(entry.target);
        if (callback) callback(entry.isIntersecting);
      }
    },
    { rootMargin, threshold: 0.01 },
  );
  const entry: ObserverEntry = { observer, callbacks };
  observers.set(rootMargin, entry);
  return entry;
}

export function useInView<T extends Element = HTMLDivElement>(options?: {
  rootMargin?: string;
  once?: boolean;
}) {
  const { rootMargin = '360px 0px', once = true } = options ?? {};
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const entry = observerFor(rootMargin);
    if (!entry) {
      setInView(true);
      return;
    }
    const callback: InViewCallback = (visible) => {
      if (visible) {
        setInView(true);
        if (once) entry.callbacks.delete(el);
      } else if (!once) {
        setInView(false);
      }
    };
    entry.callbacks.set(el, callback);
    entry.observer.observe(el);
    return () => {
      entry.callbacks.delete(el);
      entry.observer.unobserve(el);
    };
  }, [inView, once, rootMargin]);

  return { ref, inView };
}
