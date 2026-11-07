/**
 * 战场阵列（按官方规则）：
 *  - 敌方支援线 4 槽
 *  - 前线：共享 5 槽，同一时间只有一方占领（另一方单位不能进入）
 *  - 我方支援线 4 槽
 * HQ 各自挂在支援线外侧（见 PlayerBar）。
 * 死亡单位在本行用幽灵卡淡出。
 */
import type { Line, PlayerIndex, TargetRef, Unit } from '@/engine/types';
import { useBattleStore, AI, HUMAN, targetKey, type FloatFx } from '../stores/battleStore';
import CardFace from './CardFace';
import UnitCard from './UnitCard';

const SUPPORT_SLOTS = 4;
const FRONTLINE_SLOTS = 5;

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
function RowLabel({ text }: { text: string }) {
  return (
    <span
      className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-body text-[8px] tracking-[0.28em] text-field-700 select-none"
      style={{ writingMode: 'vertical-rl' }}
    >
      {text}
    </span>
  );
}

function GhostLayer({
  ghosts,
  byId,
  slots,
  baseIndex,
}: {
  ghosts: { key: string; cardId: string; owner: PlayerIndex; position: number }[];
  byId: Map<string, import('../lib/dataBridge').UiCard>;
  slots: number;
  baseIndex: number;
}) {
  return (
    <>
      {ghosts.map((ghost) => (
        <span
          key={ghost.key}
          className="pointer-events-none absolute top-1/2 z-20"
          style={{
            left: slotOffset(Math.min(baseIndex + ghost.position, slots - 1), slots),
            transform: 'translate(-50%, -50%)',
            width: 'var(--bcw)',
          }}
        >
          <span className="fx-die block" style={{ width: 'var(--bcw)', height: 'calc(var(--bcw) * 1.404)' }}>
            <CardFace card={byId.get(ghost.cardId)} className="h-full w-full" />
          </span>
        </span>
      ))}
    </>
  );
}

interface RowProps {
  targetKeys: Set<string>;
  onUnitClick: (unitId: string) => void;
  /** 移动模式：哪条战线可放置（点击空位确认移动） */
  moveTarget?: Line | null;
  onSlotClick?: (line: Line) => void;
}

function UnitRow({
  owner,
  slots,
  targetKeys,
  onUnitClick,
  label,
  moveTarget = null,
  onSlotClick,
}: RowProps & { owner: PlayerIndex; slots: number; label: string }) {
  const state = useBattleStore((s) => s.state);
  const byId = useBattleStore((s) => s.byId);
  const ghosts = useBattleStore((s) => s.ghosts);
  const fxByKey = useBattleStore((s) => s.fxByKey);
  const attacks = useBattleStore((s) => s.attacks);
  const selection = useBattleStore((s) => s.selection);
  const shakeKey = useBattleStore((s) => s.shakeKey);

  if (!state) return null;
  const units = state.players[owner].support
    .map((unitId) => state.units[unitId])
    .filter((unit): unit is Unit => !!unit);
  const rowGhosts = ghosts.filter((ghost) => ghost.owner === owner && ghost.line === 'support');
  const hot = owner === HUMAN && moveTarget === 'support';

  return (
    <div
      className={`relative flex items-center justify-center gap-[var(--row-gap)] rounded-sm ${hot ? 'cursor-pointer bg-brass-500/5 ring-1 ring-brass-500/40' : ''}`}
      onClick={hot ? () => onSlotClick?.('support') : undefined}
      role={hot ? 'button' : undefined}
      tabIndex={hot ? 0 : undefined}
      onKeyDown={
        hot
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSlotClick?.('support');
              }
            }
          : undefined
      }
    >
      <RowLabel text={label} />
      {Array.from({ length: slots }).map((_, index) => {
        const unit = units[index];
        if (!unit) return <EmptySlot key={`slot-${owner}-${index}`} index={index} hot={hot} />;
        const key = `u:${unit.unitId}`;
        return (
          <UnitCard
            key={unit.unitId}
            unit={unit}
            card={byId.get(unit.cardId)}
            turn={state.turn}
            targetable={targetKeys.has(key)}
            selected={!!selection && selection.kind === 'attack' && selection.attackerId === unit.unitId}
            shake={shakeKey === `unit:${unit.unitId}`}
            floats={(fxByKey[key] ?? []) as FloatFx[]}
            attackAt={attacks[unit.unitId]}
            onClick={() => onUnitClick(unit.unitId)}
          />
        );
      })}
      <GhostLayer ghosts={rowGhosts} byId={byId} slots={slots} baseIndex={0} />
    </div>
  );
}

/** 前线：共享 5 槽，同一时间只有一方占领 */
function FrontlineRow({ targetKeys, onUnitClick, moveTarget = null, onSlotClick }: RowProps) {
  const state = useBattleStore((s) => s.state);
  const byId = useBattleStore((s) => s.byId);
  const ghosts = useBattleStore((s) => s.ghosts);
  const fxByKey = useBattleStore((s) => s.fxByKey);
  const attacks = useBattleStore((s) => s.attacks);
  const selection = useBattleStore((s) => s.selection);
  const shakeKey = useBattleStore((s) => s.shakeKey);

  if (!state) return null;
  const slots = state.config.frontlineSlots || FRONTLINE_SLOTS;
  const enemyUnits = state.players[AI].frontline
    .map((unitId) => state.units[unitId])
    .filter((unit): unit is Unit => !!unit);
  const myUnits = state.players[HUMAN].frontline
    .map((unitId) => state.units[unitId])
    .filter((unit): unit is Unit => !!unit);
  // 正常规则下只会有一方；极端争夺态下两侧都渲染
  const display: { unit: Unit }[] = [...enemyUnits, ...myUnits].map((unit) => ({ unit }));
  const used = display.length;
  const totalSlots = Math.max(slots, used);
  const controller = state.frontlineController;
  const controllerLabel =
    controller === HUMAN ? '我方占领' : controller === AI ? '敌方占领' : used > 0 ? '争夺中' : '无人占领';
  const controllerColor = controller === HUMAN ? '#c39b3a' : controller === AI ? '#b0543f' : '#8d8258';
  const frontlineGhosts = ghosts.filter((ghost) => ghost.line === 'frontline');
  const hot = moveTarget === 'frontline';

  return (
    <div
      className={`relative flex flex-1 items-center justify-center gap-[var(--row-gap)] rounded-sm ${
        hot ? 'cursor-pointer bg-brass-500/8 ring-1 ring-brass-500/50' : ''
      }`}
      onClick={hot ? () => onSlotClick?.('frontline') : undefined}
      role={hot ? 'button' : undefined}
      tabIndex={hot ? 0 : undefined}
      onKeyDown={
        hot
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSlotClick?.('frontline');
              }
            }
          : undefined
      }
    >
      {/* 共享战区底纹 */}
      <span
        className="fards-hazard pointer-events-none absolute inset-x-8 top-1/2 -z-10 h-[calc(100%-8px)] -translate-y-1/2 rounded-sm border-y border-field-700/50 opacity-[0.16]"
        aria-hidden="true"
      />
      <RowLabel text="前线 · 共享" />

      {Array.from({ length: totalSlots }).map((_, index) => {
        const entry = display[index];
        if (!entry) return <EmptySlot key={`slot-front-${index}`} index={index} hot={false} />;
        const { unit } = entry;
        const key = `u:${unit.unitId}`;
        return (
          <UnitCard
            key={unit.unitId}
            unit={unit}
            card={byId.get(unit.cardId)}
            turn={state.turn}
            targetable={targetKeys.has(key)}
            selected={!!selection && selection.kind === 'attack' && selection.attackerId === unit.unitId}
            shake={shakeKey === `unit:${unit.unitId}`}
            floats={(fxByKey[key] ?? []) as FloatFx[]}
            attackAt={attacks[unit.unitId]}
            onClick={() => onUnitClick(unit.unitId)}
          />
        );
      })}

      <GhostLayer
        ghosts={frontlineGhosts}
        byId={byId}
        slots={totalSlots}
        baseIndex={0}
      />

      {/* 占领状态 */}
      <span
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm border px-1.5 py-[1px] font-body text-[8px] tracking-[0.16em]"
        style={{ color: controllerColor, borderColor: `${controllerColor}77`, backgroundColor: `${controllerColor}14` }}
        title={`前线 ${used}/${slots} 槽被占用`}
      >
        前线 · {controllerLabel}
      </span>
    </div>
  );
}

export interface BattleRowsProps {
  targetKeys: Set<string>;
  onUnitClick: (unitId: string) => void;
  moveTarget?: Line | null;
  onSlotClick?: (line: Line) => void;
}

/** 敌方支援线 + 共享前线 + 我方支援线 */
export function BattleRows({ targetKeys, onUnitClick, moveTarget = null, onSlotClick }: BattleRowsProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden py-[2px]">
      <div className="relative flex flex-1 items-center justify-center">
        <UnitRow
          owner={AI}
          slots={SUPPORT_SLOTS}
          targetKeys={targetKeys}
          onUnitClick={onUnitClick}
          label="敌方支援线"
          moveTarget={moveTarget}
          onSlotClick={onSlotClick}
        />
      </div>

      <FrontlineRow
        targetKeys={targetKeys}
        onUnitClick={onUnitClick}
        moveTarget={moveTarget}
        onSlotClick={onSlotClick}
      />

      <div className="relative flex flex-1 items-center justify-center">
        <UnitRow
          owner={HUMAN}
          slots={SUPPORT_SLOTS}
          targetKeys={targetKeys}
          onUnitClick={onUnitClick}
          label="我方支援线"
          moveTarget={moveTarget}
          onSlotClick={onSlotClick}
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
