/**
 * 战场单位卡：卡面 + 动态攻防徽章 + 关键字/状态 + 受击飘字 + 攻击冲刺。
 * 卡面图本身烘焙了原始数字，所以徽章要根据当前 Unit 数值实时覆盖。
 */
import { memo, type CSSProperties } from 'react';
import { keywordId, keywordValue } from '@/engine';
import type { Unit } from '@/engine/types';
import type { UiCard } from '../lib/dataBridge';
import { factionMeta } from '../lib/format';
import type { FloatFx } from '../stores/battleStore';
import CardFace from './CardFace';
import { useOneShot } from './useOneShot';

const KEYWORD_SHORT: Record<string, string> = {
  blitz: '闪',
  guard: '守',
  smokescreen: '烟',
  ambush: '伏',
  fury: '怒',
  heavyArmor: '重甲',
  intel: '情',
  shock: '震',
  pincer: '钳',
  salvage: '捞',
  mobilize: '动',
  veteran: '老',
  alpine: '山',
  bond: '协',
  covert: '隐',
};

function keywordChips(unit: Unit): string[] {
  const out: string[] = [];
  for (const keyword of unit.keywords ?? []) {
    const id = keywordId(keyword);
    const short = KEYWORD_SHORT[id];
    if (!short) continue;
    const value = keywordValue(keyword);
    out.push(value > 0 ? `${short}${value}` : short);
    if (out.length >= 3) break;
  }
  return out;
}

export interface UnitCardProps {
  unit: Unit;
  card?: UiCard;
  turn: number;
  targetable?: boolean;
  selected?: boolean;
  shake?: boolean;
  floats?: FloatFx[];
  attackAt?: number;
  onClick?: () => void;
}

function FloatList({ entries }: { entries: FloatFx[] }) {
  if (!entries.length) return null;
  return (
    <span className="pointer-events-none absolute inset-0 z-20">
      {entries.map((entry, index) => (
        <span
          key={entry.id}
          className={`fx-float absolute top-[38%] left-1/2 font-display text-[15px] leading-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)] ${
            entry.tone === 'damage'
              ? 'text-red-300'
              : entry.tone === 'heal'
                ? 'text-emerald-300'
                : 'text-brass-300'
          }`}
          style={{ marginLeft: `${(index % 3) * 14 - 14}px` }}
        >
          {entry.text}
        </span>
      ))}
    </span>
  );
}

function UnitCardInner({
  unit,
  card,
  turn,
  targetable = false,
  selected = false,
  shake = false,
  floats = [],
  attackAt,
  onClick,
}: UnitCardProps) {
  const lunge = useOneShot(attackAt, 480);
  const faction = factionMeta(card?.faction ?? 'Neutral');

  const sick = unit.deployedTurn === turn;
  const exhausted = unit.attacksUsed >= unit.maxAttacks;
  const pinned = !!unit.statuses.pinned;
  const cannot = (unit.statuses.cannotAttackTurns ?? 0) > 0;
  const dim = exhausted || sick || pinned || cannot || unit.hp <= 0;

  const attackBuff = unit.attack - unit.baseAttack;
  const hpDamaged = unit.hp < unit.maxHp;
  const chips = keywordChips(unit);

  const statusLabel = unit.hp <= 0 ? '阵亡' : pinned ? '压制' : cannot ? '瘫痪' : exhausted ? '已行动' : sick ? '待命' : null;

  const title = [
    card?.nameZh ?? unit.cardId,
    `${unit.attack}/${unit.hp}`,
    unit.armor > 0 ? `护甲 ${unit.armor}` : '',
    unit.keywords.length ? unit.keywords.join(' / ') : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={`battle-card-wrap fx-deploy ${shake ? 'fx-shake' : ''}`}
      data-dim={dim}
      data-my={unit.owner === 0}
      data-targetable={targetable}
      data-selected={selected}
      style={{ width: 'var(--bcw)' }}
      title={title}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <div
        className={`unit-card ${lunge ? 'fx-lunge' : ''}`}
        style={{ transformOrigin: '50% 100%' } as CSSProperties}
      >
        <CardFace card={card} className="h-full w-full" imageClassName={dim ? 'opacity-80' : ''}>
          {/* 关键字小徽章 */}
          {chips.length > 0 && (
            <span className="pointer-events-none absolute top-[2px] right-[3px] z-[7] flex flex-col items-end gap-[1px]">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-sm border border-brass-500/45 bg-field-950/88 px-1 font-body text-[8px] leading-[11px] tracking-wide text-brass-200 shadow-[0_1px_3px_rgba(0,0,0,0.7)]"
                >
                  {chip}
                </span>
              ))}
            </span>
          )}

          {/* 状态戳 */}
          {statusLabel && (
            <span className="pointer-events-none absolute inset-x-0 top-1/2 z-[7] -translate-y-1/2">
              <span
                className={`mx-auto block w-fit border-y px-1.5 py-[1px] font-body text-[9px] tracking-[0.16em] ${
                  statusLabel === '压制' || statusLabel === '瘫痪'
                    ? 'border-ink-red/50 bg-field-950/80 text-red-300'
                    : 'border-field-600/50 bg-field-950/75 text-field-300'
                }`}
              >
                {statusLabel}
              </span>
            </span>
          )}

          {/* 左下：攻击 */}
          <span className="pointer-events-none absolute bottom-0 left-0 z-[8] flex items-end gap-[2px] rounded-tr-[3px] border-t border-r border-brass-600/50 bg-field-950/92 px-1 pt-[1px] pb-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            <span className="font-body text-[7px] leading-none tracking-wider text-field-400">攻</span>
            <span
              className="font-display text-[13px] leading-none tabular-nums"
              style={{
                color:
                  attackBuff > 0 ? '#9fd07a' : attackBuff < 0 ? '#e08b7c' : '#f0d9a0',
              }}
            >
              {unit.attack}
            </span>
          </span>

          {/* 右下：生命 + 护甲 */}
          <span className="pointer-events-none absolute right-0 bottom-0 z-[8] flex items-end gap-[2px]">
            {unit.armor > 0 && (
              <span className="flex items-center gap-[1px] rounded-tl-[3px] border-t border-l border-field-600/60 bg-field-950/92 px-[3px] pt-[1px] pb-[2px]">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="text-brass-400">
                  <path d="M12 3 5 6v5c0 4.4 3.4 7.2 7 8.2 3.6-1 7-3.8 7-8.2V6l-7-3Z" />
                </svg>
                <span className="font-display text-[10px] leading-none text-brass-300">{unit.armor}</span>
              </span>
            )}
            <span
              className={`flex items-end gap-[2px] rounded-tl-[3px] border-t border-l bg-field-950/92 px-1 pt-[1px] pb-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.8)] ${
                hpDamaged ? 'border-ink-red/60' : 'border-brass-600/50'
              }`}
            >
              <span className="font-body text-[7px] leading-none tracking-wider text-field-400">血</span>
              <span
                className="font-display text-[13px] leading-none tabular-nums"
                style={{ color: hpDamaged ? '#e88a7a' : '#e6e2cd' }}
              >
                {unit.hp}
              </span>
            </span>
          </span>

          {/* 阵营色内描边（被选中/可指定时更明显） */}
          <span
            className="pointer-events-none absolute inset-0 z-[6] rounded-[3px]"
            style={{ boxShadow: `inset 0 0 0 1px ${faction.color}55` }}
          />
        </CardFace>

        <FloatList entries={floats} />
      </div>
    </div>
  );
}

export const UnitCard = memo(UnitCardInner);
export default UnitCard;
