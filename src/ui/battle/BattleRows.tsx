/**
 * 战场阵列：敌方支援线（4）/ 前线（双方各 2，同一行对峙）/ 我方支援线（4）。
 * 死亡单位在本行用幽灵卡淡出（位置按 slots 与坐标推算）。
 */
import type { Line, PlayerIndex, TargetRef, Unit } from '@/engine/types';
import { useBattleStore, AI, HUMAN, targetKey, type FloatFx } from '../stores/battleStore';
import CardFace from './CardFace';
import UnitCard from './UnitCard';

const SUPPORT_SLOTS = 4;
const FRONTLINE_SLOTS = 2;

interface RowProps {
  owner: PlayerIndex;
  line: Line;
  slots: number;
  targetKeys: Set<string>;
  onUnitClick: (unitId: string) => void;
  label: string;
}

function slotOffset(index: number, slots: number): string {
  const center = (slots - 1) / 2;
  return `calc(50% + ${index - center} * (var(--bcw) + var(--row-gap)))`;
}

function EmptySlot({ index, hot }: { index: number; hot: boolean }) {
  return (
    <div className="battle-slot" data-hot={hot} aria-hidden="true">
      <span className="font-display text-[10px] text-field-700">{index + 1}</span>
    </div>
  );
}

function UnitRow({ owner, line, slots, targetKeys, onUnitClick, label }: RowProps) {
  const state = useBattleStore((s) => s.state);
  const byId = useBattleStore((s) => s.byId);
  const ghosts = useBattleStore((s) => s.ghosts);
  const fxByKey = useBattleStore((s) => s.fxByKey);
  const attacks = useBattleStore((s) => s.attacks);
  const selection = useBattleStore((s) => s.selection);
  const shakeKey = useBattleStore((s) => s.shakeKey);

  if (!state) return null;
  const ids = line === 'support' ? state.players[owner].support : state.players[owner].frontline;
  const units = ids
    .map((unitId) => state.units[unitId])
    .filter((unit): unit is Unit => !!unit);
  const rowGhosts = ghosts.filter((ghost) => ghost.owner === owner && ghost.line === line);

  return (
    <div className="relative flex items-center justify-center gap-[var(--row-gap)]">
      <span
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-body text-[8px] tracking-[0.3em] text-field-700 select-none"
        style={{ writingMode: 'vertical-rl' }}
      >
        {label}
      </span>

      {Array.from({ length: slots }).map((_, index) => {
        const unit = units[index];
        if (!unit) return <EmptySlot key={`slot-${owner}-${line}-${index}`} index={index} hot={false} />;
        const key = `u:${unit.unitId}`;
        const floats: FloatFx[] = fxByKey[key] ?? [];
        return (
          <UnitCard
            key={unit.unitId}
            unit={unit}
            card={byId.get(unit.cardId)}
            turn={state.turn}
            targetable={targetKeys.has(key)}
            selected={!!selection && selection.kind === 'attack' && selection.attackerId === unit.unitId}
            shake={shakeKey === `unit:${unit.unitId}`}
            floats={floats}
            attackAt={attacks[unit.unitId]}
            onClick={() => onUnitClick(unit.unitId)}
          />
        );
      })}

      {/* 阵亡淡出 */}
      {rowGhosts.map((ghost) => (
        <span
          key={ghost.key}
          className="pointer-events-none absolute top-1/2 z-20"
          style={{
            left: slotOffset(Math.min(ghost.position, slots - 1), slots),
            transform: 'translate(-50%, -50%)',
            width: 'var(--bcw)',
          }}
        >
          <span className="block fx-die" style={{ width: 'var(--bcw)', height: 'calc(var(--bcw) * 1.404)' }}>
            <CardFace card={byId.get(ghost.cardId)} className="h-full w-full" />
          </span>
        </span>
      ))}
    </div>
  );
}

function FrontlineDivider() {
  const controller = useBattleStore((s) => s.state?.frontlineController ?? null);
  const label = controller === null ? '争夺中' : controller === HUMAN ? '我方控制' : '敌方控制';
  const color = controller === null ? '#8d8258' : controller === HUMAN ? '#c39b3a' : '#b0543f';
  return (
    <div className="flex h-full w-[74px] shrink-0 flex-col items-center justify-center gap-1">
      <span className="h-full w-px bg-gradient-to-b from-transparent via-field-500/60 to-transparent" />
      <span
        className="whitespace-nowrap rounded-sm border px-1.5 py-[1px] font-body text-[9px] tracking-[0.18em]"
        style={{ color, borderColor: `${color}77`, backgroundColor: `${color}14` }}
        title="前线控制权"
      >
        前线 · {label}
      </span>
      <span className="h-full w-px bg-gradient-to-b from-transparent via-field-500/60 to-transparent" />
    </div>
  );
}

export interface BattleRowsProps {
  targetKeys: Set<string>;
  onUnitClick: (unitId: string) => void;
}

/** 敌方支援线 + 前线 + 我方支援线（响应式高度，1280x800 主目标） */
export function BattleRows({ targetKeys, onUnitClick }: BattleRowsProps) {
  const state = useBattleStore((s) => s.state);
  const frontlineController = state?.frontlineController ?? null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden py-[2px]">
      <div className="relative flex flex-1 items-center justify-center">
        <UnitRow
          owner={AI}
          line="support"
          slots={SUPPORT_SLOTS}
          targetKeys={targetKeys}
          onUnitClick={onUnitClick}
          label="敌方支援线"
        />
      </div>

      {/* 前线：两侧对峙 */}
      <div className="relative flex flex-1 items-center justify-center gap-1">
        <span
          className="pointer-events-none absolute inset-x-10 top-1/2 -z-10 h-px -translate-y-1/2"
          style={{
            background:
              frontlineController === null
                ? 'linear-gradient(90deg, transparent, rgba(141,130,88,0.35), transparent)'
                : `linear-gradient(90deg, transparent, ${frontlineController === HUMAN ? '#c39b3a' : '#b0543f'}66, transparent)`,
          }}
        />
        <div className="relative flex items-center gap-[var(--row-gap)]">
          <UnitRow
            owner={AI}
            line="frontline"
            slots={FRONTLINE_SLOTS}
            targetKeys={targetKeys}
            onUnitClick={onUnitClick}
            label="敌方前线"
          />
        </div>
        <FrontlineDivider />
        <div className="relative flex items-center gap-[var(--row-gap)]">
          <UnitRow
            owner={HUMAN}
            line="frontline"
            slots={FRONTLINE_SLOTS}
            targetKeys={targetKeys}
            onUnitClick={onUnitClick}
            label="我方前线"
          />
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        <UnitRow
          owner={HUMAN}
          line="support"
          slots={SUPPORT_SLOTS}
          targetKeys={targetKeys}
          onUnitClick={onUnitClick}
          label="我方支援线"
        />
      </div>
    </div>
  );
}

export default BattleRows;

/** 供战场渲染使用：把 refs 转成 key 集合 */
export function refsToKeys(refs: TargetRef[] | undefined): Set<string> {
  return new Set((refs ?? []).map((ref) => targetKey(ref)));
}

export type { TargetRef };
