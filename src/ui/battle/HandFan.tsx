/**
 * 手牌扇形：横向排布 + 角度/弧线错位，hover 放大抬起。
 * 可在手牌上的信息：实际费用（含折扣）、动态攻防、关键字、可打出状态。
 */
import { useMemo, type CSSProperties } from 'react';
import { playCost } from '@/engine';
import type { CardInstance, LegalAction } from '@/engine/types';
import type { UiCard } from '../lib/dataBridge';
import { cardKeywords, factionMeta } from '../lib/format';
import { useBattleStore } from '../stores/battleStore';
import CardFace from './CardFace';

export interface HandFanProps {
  legalByCard: Map<string, LegalAction>;
  byId: Map<string, UiCard>;
  onHover: (cardId: string | null) => void;
  hoveredId: string | null;
  /** 点击手牌（在选牌逻辑之后调用，用于打开「点击来源」的检视面板，不影响选牌/出牌） */
  onCardClick?: (cardId: string) => void;
}

interface HandCardProps {
  instance: CardInstance;
  card: UiCard | undefined;
  cost: number;
  affordable: boolean;
  playable: boolean;
  selected: boolean;
  hovered: boolean;
  style: CSSProperties;
  onHover: () => void;
  /** 鼠标移出手牌（用于关闭悬停打开的检视面板 / 复位放大） */
  onHoverEnd: () => void;
  onSelect: () => void;
  /** 点击后打开检视（选牌逻辑不受影响） */
  onInspect: () => void;
}

function HandCard({
  instance,
  card,
  cost,
  affordable,
  playable,
  selected,
  hovered,
  style,
  onHover,
  onHoverEnd,
  onSelect,
  onInspect,
}: HandCardProps) {
  const keywords = card ? cardKeywords(card).slice(0, 2) : [];
  const faction = factionMeta(card?.faction ?? 'Neutral');

  return (
    <button
      type="button"
      className={`hand-card hand-in text-left ${selected ? 'outline outline-1 outline-brass-400/80' : ''}`}
      style={style}
      data-playable={playable}
      data-hoverable={playable}
      data-lifted={hovered || selected}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onClick={() => {
        onSelect();
        onInspect();
      }}
      aria-label={`${card?.nameZh ?? instance.cardId}${playable ? '' : '（不可打出）'}`}
    >
      <CardFace card={card} className="h-full w-full" imageClassName={playable ? '' : 'saturate-50'}>
        {/* 费用（左上，覆盖卡面烘焙数字） */}
        <span
          className={`pointer-events-none absolute top-0 left-0 z-[8] flex h-[20px] min-w-[20px] items-center justify-center rounded-br-[3px] border-r border-b px-1 font-display text-[13px] leading-none shadow-[0_1px_4px_rgba(0,0,0,0.8)] ${
            affordable
              ? 'border-brass-500/70 bg-field-950/92 text-brass-200'
              : 'border-ink-red/70 bg-field-950/92 text-red-300'
          }`}
        >
          {cost}
        </span>

        {/* 关键字 */}
        {keywords.length > 0 && (
          <span className="pointer-events-none absolute top-[20px] right-[3px] z-[7] flex flex-col items-end gap-[1px]">
            {keywords.map((keyword) => (
              <span
                key={keyword.id}
                className="rounded-sm border border-brass-500/40 bg-field-950/85 px-1 font-body text-[8px] leading-[10px] text-brass-200/90"
              >
                {keyword.zh}
              </span>
            ))}
          </span>
        )}

        {/* 动态攻防（左下/右下） */}
        {card && card.type !== 'order' && card.type !== 'countermeasure' && (
          <>
            <span className="pointer-events-none absolute bottom-0 left-0 z-[8] flex items-end gap-[2px] rounded-tr-[3px] border-t border-r border-brass-600/50 bg-field-950/92 px-1 pb-[2px] pt-[1px]">
              <span className="font-body text-[7px] leading-none text-field-400">攻</span>
              <span className="font-display text-[12px] leading-none text-[#f0d9a0]">{card.attack}</span>
            </span>
            <span className="pointer-events-none absolute right-0 bottom-0 z-[8] flex items-end gap-[2px] rounded-tl-[3px] border-t border-l border-brass-600/50 bg-field-950/92 px-1 pb-[2px] pt-[1px]">
              <span className="font-body text-[7px] leading-none text-field-400">血</span>
              <span className="font-display text-[12px] leading-none text-field-100">{card.defense}</span>
            </span>
          </>
        )}

        {/* 不可打出：压暗 + 提示 */}
        {!playable && (
          <span className="pointer-events-none absolute inset-0 z-[6] rounded-[3px] bg-field-950/45" />
        )}

        <span
          className="pointer-events-none absolute inset-0 z-[5] rounded-[3px]"
          style={{ boxShadow: `inset 0 0 0 1px ${faction.color}66` }}
        />
      </CardFace>
    </button>
  );
}

export function HandFan({ legalByCard, byId, onHover, hoveredId, onCardClick }: HandFanProps) {
  const state = useBattleStore((s) => s.state);
  const selection = useBattleStore((s) => s.selection);
  const selectCard = useBattleStore((s) => s.selectCard);
  const registry = useBattleStore((s) => s.registry);
  const myIndex = useBattleStore((s) => s.myIndex);

  const hand = state?.players[myIndex].hand ?? [];
  const kredits = state?.players[myIndex].kredits ?? 0;

  const layout = useMemo(() => {
    const count = hand.length;
    const mid = (count - 1) / 2;
    const spread = count > 7 ? 0.55 : count > 5 ? 0.62 : 0.72;
    const tilt = count > 8 ? 1.6 : 2.6;
    return { count, mid, spread, tilt };
  }, [hand.length]);

  if (!state || !registry) return null;

  return (
    <div className="absolute inset-0">
      {hand.map((instance, index) => {
        const card = byId.get(instance.cardId);
        const distance = index - layout.mid;
        const cost = playCost(state, registry, myIndex, instance);
        const action = legalByCard.get(instance.instanceId);
        const playable = !!action;
        const style = {
          '--dx': `${distance * layout.spread}`,
          '--rot': `${distance * layout.tilt}deg`,
          '--arc': `${Math.abs(distance) * 7 - 12}px`,
          zIndex: 10 + index,
        } as CSSProperties;

        return (
          <HandCard
            key={instance.instanceId}
            instance={instance}
            card={card}
            cost={cost}
            affordable={cost <= kredits}
            playable={playable}
            selected={selection?.kind === 'play' && selection.cardInstanceId === instance.instanceId}
            hovered={hoveredId === instance.cardId}
            style={style}
            onHover={() => onHover(instance.cardId)}
            onHoverEnd={() => onHover(null)}
            onSelect={() => selectCard(instance.instanceId)}
            onInspect={() => onCardClick?.(instance.cardId)}
          />
        );
      })}
    </div>
  );
}

export default HandFan;
