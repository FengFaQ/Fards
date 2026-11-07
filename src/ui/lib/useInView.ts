import { useEffect, useRef, useState } from 'react';

/**
 * IntersectionObserver 可见性钩子：图片/卡片进入视口附近才开始加载，
 * 避免一次性渲染 1646 张卡图。
 */
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
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, once, rootMargin]);

  return { ref, inView };
}
