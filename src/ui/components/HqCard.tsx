import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react';

export interface HqCardProps {
  side: 'self' | 'enemy';
  /** 中文国名（主国），如「日本」 */
  factionZh: string;
  hp: number;
  maxHp: number;
  armor?: number;
  /** 敌方 HQ 可被攻击目标时高亮 */
  targetable?: boolean;
  onClick?: () => void;
  className?: string;
  /** 可选扩展：数值变化时重放受击闪红动画（父组件传受击时间戳/计数即可） */
  flashAt?: number;
  /** 可选扩展：顶部标签，默认「总部 HQ」 */
  label?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 总部卡（HQ）
 * ------------------------------------------------------------------
 * 战场上的总部具象化为支援阵线上的灰色金属卡：
 * - 顶部「总部 HQ」小字，中间大字国名，下方耐久血条 + hp/maxHp
 * - 敌方 HQ 可被攻击时加 `.fards-hq-targetable` 脉冲高亮 + 四角准星
 * - 受击动画：`.fards-hq-hit` 闪红（父组件可用 className 自行加，或传 flashAt 触发）
 * - 根节点带 data-hp / data-max-hp / data-side / data-targetable，便于外部做动画与测试
 *
 * 尺寸：width 100% + aspect-ratio 5/7，父级只需给宽度（与 .unit-card 同宽即可）；
 * 内部字号/血条使用 container query 单位（cqw），随卡宽自适应。
 */
export default function HqCard({
  side,
  factionZh,
  hp,
  maxHp,
  armor,
  targetable = false,
  onClick,
  className = '',
  flashAt,
  label = '总部 HQ',
}: HqCardProps): JSX.Element {
  const safeMax = Math.max(1, maxHp);
  const safeHp = clamp(hp, 0, safeMax);
  const ratio = safeHp / safeMax;
  const percent = clamp(ratio * 100, 0, 100);
  const tone = ratio > 0.6 ? 'ok' : ratio > 0.3 ? 'warn' : 'danger';
  const interactive = Boolean(onClick);
  const sideZh = side === 'self' ? '我方' : '敌方';

  // flashAt 变化 → 重放受击动画（内部 key 重挂载，保证 CSS animation 重新开始）
  const [flashKey, setFlashKey] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const lastFlash = useRef(flashAt);
  useEffect(() => {
    if (flashAt === undefined) return;
    if (lastFlash.current === undefined) {
      lastFlash.current = flashAt;
      return;
    }
    if (flashAt === lastFlash.current) return;
    lastFlash.current = flashAt;
    setFlashKey((value) => value + 1);
    setFlashing(true);
    const timer = window.setTimeout(() => setFlashing(false), 560);
    return () => window.clearTimeout(timer);
  }, [flashAt]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      key={flashKey}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`${sideZh}总部 ${factionZh}，耐久 ${safeHp}/${safeMax}${armor ? `，装甲 ${armor}` : ''}`}
      onClick={interactive ? onClick : undefined}
      onKeyDown={handleKeyDown}
      data-hp={safeHp}
      data-max-hp={safeMax}
      data-side={side}
      data-targetable={targetable ? 'true' : 'false'}
      data-interactive={interactive ? 'true' : 'false'}
      title={`${sideZh}总部 · ${factionZh} · ${safeHp}/${safeMax}`}
      className={`fards-hq-card ${targetable ? 'fards-hq-targetable' : ''} ${
        flashing ? 'fards-hq-hit' : ''
      } ${className}`}
    >
      {/* 可攻击准星角 */}
      {targetable && (
        <span aria-hidden="true">
          <span className="fards-hq-corner top-1 left-1 border-t-2 border-l-2" />
          <span className="fards-hq-corner top-1 right-1 border-t-2 border-r-2" />
          <span className="fards-hq-corner bottom-1 left-1 border-b-2 border-l-2" />
          <span className="fards-hq-corner right-1 bottom-1 border-r-2 border-b-2" />
        </span>
      )}

      <div className="relative z-[1] flex h-full flex-col justify-between p-[7%]">
        {/* 顶部：总部标识 + 装甲 */}
        <div className="flex items-start justify-between gap-1">
          <span className="fards-hq-eyebrow font-display leading-none text-brass-200/90 uppercase">
            {label}
          </span>
          {typeof armor === 'number' && armor > 0 && (
            <span className="fards-hq-armor flex items-center gap-[0.15em] rounded-sm border border-field-500/60 bg-black/40 px-1 py-[0.1em] font-display leading-none text-brass-300">
              装甲 {armor}
            </span>
          )}
        </div>

        {/* 中部：国名 */}
        <div className="flex flex-col items-center justify-center">
          <span className="fards-hq-side font-body text-field-400/90 uppercase">{sideZh}</span>
          <span className="fards-hq-faction mt-[0.12em] font-display text-field-50">{factionZh}</span>
          <span className="fards-hq-tag mt-[0.25em] font-body text-field-500 uppercase">
            HEADQUARTERS
          </span>
        </div>

        {/* 底部：耐久血条 */}
        <div>
          <div className="fards-hq-hp-text mb-[0.35em] flex items-baseline justify-between font-body leading-none">
            <span className="text-field-500">总部耐久</span>
            <span className="font-display tracking-wide text-brass-200">
              {safeHp}
              <span className="text-field-500"> / {safeMax}</span>
            </span>
          </div>
          <div
            className="fards-hq-hp-track w-full overflow-hidden rounded-sm border border-black/50 bg-black/55"
            role="progressbar"
            aria-valuenow={safeHp}
            aria-valuemin={0}
            aria-valuemax={safeMax}
          >
            <div
              className="fards-hq-hp-fill h-full rounded-sm transition-[width] duration-300 ease-out"
              data-tone={tone}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
