/**
 * 玩家条：阵营 / 番号 / 总部血量护甲 / 克雷迪特 / 手牌 / 牌库 / 反制。
 * 敌方条与我方条结构一致，靠色调与阵营色区分。
 */
import type { PlayerState } from '@/engine/types';
import { factionMeta } from '../lib/format';
import { IconCards, IconDeck, IconKredit, IconShield } from '../components/icons';
import type { FloatFx } from '../stores/battleStore';
import { useOneShot } from './useOneShot';

export interface PlayerBarProps {
  player: PlayerState;
  isSelf: boolean;
  isActive: boolean;
  targetable?: boolean;
  hqHitAt?: number;
  floats?: FloatFx[];
  onClick?: () => void;
}

function Stat({
  icon,
  label,
  value,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  title: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border border-field-700/60 bg-field-950/55 px-1.5 py-[2px]"
      title={title}
    >
      <span className="text-field-400">{icon}</span>
      <span className="font-display text-[11px] leading-none tabular-nums text-field-100">{value}</span>
      <span className="font-body text-[8px] tracking-[0.12em] text-field-500">{label}</span>
    </span>
  );
}

export function PlayerBar({
  player,
  isSelf,
  isActive,
  targetable = false,
  hqHitAt,
  floats = [],
  onClick,
}: PlayerBarProps) {
  const faction = factionMeta(player.faction);
  const flash = useOneShot(hqHitAt, 640);
  const hpPct = Math.max(0, Math.min(100, (player.hq.hp / Math.max(1, player.hq.maxHp)) * 100));
  const armorPct = Math.max(0, Math.min(100 - hpPct, (player.hq.armor / Math.max(1, player.hq.maxHp)) * 100));
  const low = hpPct <= 30;

  return (
    <div
      className={`relative flex items-center gap-3 border-y px-3 py-[6px] ${
        isSelf ? 'bg-field-900/70' : 'bg-field-950/60'
      } ${targetable ? 'cursor-crosshair' : ''}`}
      style={{
        borderColor: `${faction.color}55`,
        boxShadow: targetable
          ? `inset 0 0 0 2px rgba(216,180,95,0.85), inset 0 0 26px ${faction.color}33`
          : `inset 3px 0 0 ${faction.color}, inset 0 0 40px rgba(0,0,0,0.35)`,
        backgroundImage: isSelf
          ? `linear-gradient(90deg, ${faction.color}22, transparent 32%)`
          : `linear-gradient(270deg, ${faction.color}22, transparent 32%)`,
      }}
      onClick={targetable ? onClick : undefined}
      role={targetable ? 'button' : undefined}
      tabIndex={targetable ? 0 : undefined}
      onKeyDown={(event) => {
        if (targetable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* 阵营徽记 */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border font-display text-[11px]"
          style={{ borderColor: `${faction.color}88`, color: faction.color, backgroundColor: `${faction.color}1f` }}
          title={faction.en}
        >
          {faction.zh.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-display text-[11px] tracking-[0.14em] text-field-100">
              {player.name}
            </span>
            <span
              className="rounded-sm px-1 font-body text-[8px] tracking-[0.16em] uppercase"
              style={{ color: faction.color, backgroundColor: `${faction.color}22` }}
            >
              {isSelf ? '我方' : '敌方'}
            </span>
            {isActive && (
              <span className="flex items-center gap-1 font-body text-[8px] tracking-[0.18em] text-brass-300">
                <span className="battle-pulse-dot h-1.5 w-1.5 rounded-full bg-brass-400" />
                行动中
              </span>
            )}
          </span>
          <span className="block truncate font-body text-[8px] tracking-[0.14em] text-field-500">
            {faction.zh}
            {player.allyFaction ? ` + ${factionMeta(player.allyFaction).zh}` : ''} · 疲劳 {player.fatigue}
          </span>
        </span>
      </div>

      {/* 总部血量 */}
      <div className="relative flex min-w-0 flex-1 items-center gap-2">
        <IconShield size={13} className={low ? 'text-ink-red' : 'text-brass-500'} />
        <span className="font-body text-[8px] tracking-[0.16em] text-field-400">总部</span>
        <div className="relative h-[9px] min-w-[80px] flex-1 overflow-hidden rounded-[2px] border border-field-600/70 bg-field-950">
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-300"
            style={{
              width: `${hpPct}%`,
              background: low
                ? 'linear-gradient(180deg, #d05a45, #8d2f22)'
                : 'linear-gradient(180deg, #d8b45f, #8a6a20)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
            }}
          />
          {armorPct > 0 && (
            <div
              className="absolute inset-y-0 transition-[width] duration-300"
              style={{
                left: `${hpPct}%`,
                width: `${armorPct}%`,
                background: 'repeating-linear-gradient(135deg, #8fa3b5 0 3px, #5f707e 3px 6px)',
                opacity: 0.9,
              }}
            />
          )}
        </div>
        <span className="shrink-0 font-display text-[13px] leading-none tabular-nums">
          <span className={low ? 'text-red-300' : 'text-field-100'}>{player.hq.hp}</span>
          <span className="text-field-600">/{player.hq.maxHp}</span>
        </span>
        {player.hq.armor > 0 && (
          <span className="shrink-0 rounded-sm border border-field-500/60 bg-field-800/70 px-1 font-body text-[9px] text-field-200">
            护 {player.hq.armor}
          </span>
        )}
        {flash && <span key={hqHitAt} className="fx-hq-flash absolute inset-0 rounded-sm bg-ink-red/50" />}
        {floats.length > 0 && (
          <span className="pointer-events-none absolute top-1/2 left-1/2 z-20">
            {floats.map((entry) => (
              <span
                key={entry.id}
                className={`fx-float absolute left-1/2 font-display text-[17px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${
                  entry.tone === 'damage' ? 'text-red-300' : entry.tone === 'heal' ? 'text-emerald-300' : 'text-brass-300'
                }`}
              >
                {entry.text}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* 资源 */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Stat
          icon={<IconKredit size={11} />}
          label="克"
          value={`${player.kredits}/${player.maxKredits}`}
          title={`克雷迪特 ${player.kredits}/${player.maxKredits}`}
        />
        <Stat icon={<IconCards size={11} />} label="手" value={`${player.hand.length}`} title={`手牌 ${player.hand.length}`} />
        <Stat icon={<IconDeck size={11} />} label="牌" value={`${player.deck.length}`} title={`牌库 ${player.deck.length}`} />
        <Stat
          icon={<IconShield size={11} />}
          label="反"
          value={`${player.counters.length}`}
          title={`已布反制 ${player.counters.length}`}
        />
      </div>
    </div>
  );
}

export default PlayerBar;
