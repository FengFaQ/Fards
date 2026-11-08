import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { UiCard } from '../lib/dataBridge';
import { cardImageSources } from '../lib/dataBridge';
import { cardTypeMeta, factionMeta, rarityMeta } from '../lib/format';
import { useInView } from '../lib/useInView';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/* ------------------------------------------------------------------
 * 进程级缓存（减少 GC 与重复计算）
 * 1) 卡图候选地址：cardImageSources 会查数据层模块并去重拼串，代价不低；
 *    卡对象是稳定的（useCards 进程级缓存），按对象弱引用缓存即可。
 * 2) 已解码成功的图片 URL：窗口化/筛选后卡片会卸载再挂载，命中缓存时
 *    直接以「已加载」状态渲染，避免骨架屏闪烁与布局抖动。
 * ------------------------------------------------------------------ */
const SOURCES_CACHE = new WeakMap<UiCard, string[]>();
const LOADED_IMAGES = new Set<string>();

function sourcesOf(card: UiCard): string[] {
  const cached = SOURCES_CACHE.get(card);
  if (cached) return cached;
  const next = cardImageSources(card);
  SOURCES_CACHE.set(card, next);
  return next;
}

export interface CardViewProps {
  card: UiCard;
  size?: CardSize;
  /** 卡组内数量角标 */
  count?: number;
  onClick?: (card: UiCard) => void;
  className?: string;
  /** 立即加载图片（详情弹窗用） */
  eager?: boolean;
  /** 是否显示底部名称条 */
  nameplate?: boolean;
  /** 选中态（构筑页高亮） */
  selected?: boolean;
  /** 阵营不符等禁用态 */
  muted?: boolean;
}

const NAMEPLATE: Record<CardSize, string> = {
  xs: 'text-[8px] leading-tight',
  sm: 'text-[10px] leading-tight',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-base',
};

/**
 * 卡牌展示组件
 * - 卡图（KARDS 整张卡面）懒加载 + 骨架屏
 * - 加载失败逐级回退（本地 → 代理 → 远程 → 自绘占位）
 * - 阵营色侧边条 / 稀有度角标 / 数量角标
 */
function CardViewInner({
  card,
  size = 'sm',
  count,
  onClick,
  className = '',
  eager = false,
  nameplate = true,
  selected = false,
  muted = false,
}: CardViewProps) {
  const sources = useMemo(() => sourcesOf(card), [card]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loaded, setLoaded] = useState(() => LOADED_IMAGES.has(sourcesOf(card)[0] ?? ''));
  const [failed, setFailed] = useState(false);
  const { ref, inView } = useInView<HTMLDivElement>();

  const faction = factionMeta(card.faction);
  const rarity = rarityMeta(card.rarity);
  const type = cardTypeMeta(card.type);
  const interactive = Boolean(onClick);
  const imageSrc = sources[sourceIndex];
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const cardRef = useRef(card);
  cardRef.current = card;

  const handleLoad = useCallback(() => {
    if (imageSrc) LOADED_IMAGES.add(imageSrc);
    setLoaded(true);
  }, [imageSrc]);

  const handleError = useCallback(() => {
    setLoaded(false);
    setSourceIndex((index) => {
      const next = index + 1;
      if (next >= sources.length) setFailed(true);
      return next;
    });
  }, [sources]);

  const handleClick = useCallback(() => {
    onClickRef.current?.(cardRef.current);
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const handler = onClickRef.current;
    if (!handler) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler(cardRef.current);
    }
  }, []);

  return (
    <div
      ref={ref}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      data-interactive={interactive}
      aria-label={`${card.nameZh}（${faction.zh} · ${type.zh} · ${rarity.zh}）`}
      onClick={interactive ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      title={`${card.nameZh} · ${card.nameEn}`}
      className={`fards-card fards-card-hover group select-none ${selected ? 'ring-2 ring-brass-400/80' : ''} ${
        muted ? 'opacity-45 saturate-50' : ''
      } ${className}`}
    >
      {!failed ? (
        <>
          {(eager || inView) && imageSrc && (
            <img
              src={imageSrc}
              alt={card.nameZh}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              onLoad={handleLoad}
              onError={handleError}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                loaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}
          {!loaded && (
            <div className="fards-skeleton absolute inset-0 z-[1] flex items-end p-2">
              <span className="font-body text-[9px] tracking-wider text-field-400/70">
                {card.nameZh}
              </span>
            </div>
          )}
        </>
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center"
          style={{
            background: `linear-gradient(160deg, ${faction.shade} 0%, #16180f 55%, ${faction.color}44 100%)`,
          }}
        >
          <span
            className="absolute top-2 left-2 font-display text-[10px] tracking-[0.2em] uppercase"
            style={{ color: faction.color }}
          >
            {faction.zh}
          </span>
          <span className="absolute top-2 right-2 font-display text-lg text-field-200/70">{type.glyph}</span>
          <span
            className="font-display text-3xl leading-none opacity-30"
            style={{ color: faction.color }}
          >
            {type.glyph}
          </span>
          <span className="line-clamp-3 font-body text-[11px] leading-snug text-field-100">
            {card.nameZh}
          </span>
          <span className="font-body text-[9px] text-field-400">
            {card.kredits} 费 · {card.attack}/{card.defense}
          </span>
        </div>
      )}

      {/* 阵营色侧条 */}
      <span className="fards-card-rail" style={{ backgroundColor: faction.color }} />

      {/* 稀有度角标 */}
      <span
        className="absolute top-0 left-1 z-[4] px-1 py-[1px] font-display text-[8px] tracking-[0.14em] uppercase"
        style={{ backgroundColor: `${rarity.color}dd`, color: '#101208' }}
        title={`${rarity.zh}（${rarity.en}）`}
      >
        {rarity.zh}
      </span>

      {/* 数量角标 */}
      {count !== undefined && count > 0 && (
        <span className="absolute top-1 right-1 z-[4] rounded-sm border border-brass-500/70 bg-field-950/90 px-1.5 py-[1px] font-display text-[10px] leading-none text-brass-300 shadow">
          ×{count}
        </span>
      )}

      {/* 名称条 */}
      {nameplate && (
        <div className="fards-card-nameplate">
          <p className={`truncate font-body font-medium tracking-wide text-field-100 ${NAMEPLATE[size]}`}>
            {card.nameZh}
          </p>
          <p className="mt-0.5 hidden truncate font-body text-[9px] tracking-wider text-field-400 group-hover:block">
            {type.zh} · {card.kredits} 费 · {card.attack}/{card.defense}
          </p>
        </div>
      )}

      {/* 选中/禁用标记 */}
      {selected && (
        <span className="absolute inset-0 z-[4] rounded-[3px] ring-2 ring-brass-400/80 ring-inset" />
      )}
      {muted && (
        <span className="absolute inset-x-0 top-1/2 z-[4] -translate-y-1/2 bg-field-950/85 py-1 text-center font-body text-[9px] tracking-[0.18em] text-field-300">
          编制外
        </span>
      )}
    </div>
  );
}

export const CardView = memo(CardViewInner);
export default CardView;
