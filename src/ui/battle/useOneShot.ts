import { useEffect, useRef, useState } from 'react';

/**
 * 一次性动画开关：当 trigger（时间戳）变化时返回 true，并在 duration 后复位。
 * 用于「攻击冲刺」「总部受击闪烁」这类不需要常驻 DOM 的一次性动效。
 */
export function useOneShot(trigger: number | null | undefined, duration: number): boolean {
  const [on, setOn] = useState(false);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (!trigger || trigger === seen.current) return;
    seen.current = trigger;
    setOn(true);
    const timer = window.setTimeout(() => setOn(false), duration);
    return () => window.clearTimeout(timer);
  }, [trigger, duration]);

  return on;
}
