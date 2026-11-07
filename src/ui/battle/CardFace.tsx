/**
 * 战场卡面：图片多级兜底 + 骨架屏 + 阵营侧条。
 * 与 ui/components/CardView 的区别：战场需要自己叠动态攻防徽章、状态层与特效，
 * 所以这里只保留「卡面本体」，尺寸由外层（.unit-card / .hand-card）控制。
 */
import { memo, useMemo, useState, type ReactNode } from 'react';
import { cardImageSources, type UiCard } from '../lib/dataBridge';
import { factionMeta } from '../lib/format';

export interface CardFaceProps {
  card: UiCard | undefined;
  className?: string;
  eager?: boolean;
  children?: ReactNode;
  /** 图片额外处理（灰显等） */
  imageClassName?: string;
}

function CardFaceInner({ card, className = '', eager = false, children, imageClassName = '' }: CardFaceProps) {
  const sources = useMemo(() => (card ? cardImageSources(card) : []), [card]);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!card) {
    return (
      <div className={`fards-card ${className}`}>
        <div className="absolute inset-0 bg-field-900" />
        <span className="absolute inset-0 flex items-center justify-center font-body text-[10px] text-field-500">
          未知卡牌
        </span>
      </div>
    );
  }

  const faction = factionMeta(card.faction);
  const src = sources[index];

  return (
    <div className={`fards-card ${className}`}>
      {!failed && src && (
        <img
          src={src}
          alt={card.nameZh}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setIndex((current) => {
              const next = current + 1;
              if (next >= sources.length) setFailed(true);
              return next;
            });
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          } ${imageClassName}`}
        />
      )}
      {!loaded && !failed && <span className="fards-skeleton absolute inset-0 z-[1]" />}
      {failed && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1 text-center"
          style={{
            background: `linear-gradient(160deg, ${faction.shade} 0%, #14160e 58%, ${faction.color}55 100%)`,
          }}
        >
          <span className="font-display text-lg leading-none opacity-40" style={{ color: faction.color }}>
            {card.attack}/{card.defense}
          </span>
          <span className="line-clamp-3 font-body text-[9px] leading-tight text-field-200">{card.nameZh}</span>
        </div>
      )}
      <span className="fards-card-rail" style={{ backgroundColor: faction.color }} />
      {children}
    </div>
  );
}

export const CardFace = memo(CardFaceInner);
export default CardFace;
