/**
 * 战场阵列（按官方规则）：
 *  - 敌方支援线 4 槽 + 敌方总部卡（支援线最外侧）
 *  - 前线：共享 5 槽，同一时间只有一方占领
 *  - 我方支援线 4 槽 + 我方总部卡
 * 交互扩展：
 *  - 布防模式（deployMode）：高亮我方支援线 4 个槽位，点击即按该位置部署（insert index）
 *  - 检视/攻击点击统一交给 onUnitClick / onHqClick
 */
import type { Line, PlayerIndex, TargetRef, Unit } from '@/engine/types';
import HqCard from '../components/HqCard';
import { factionMeta } from '../lib/format';
import { useBattleStore, targetKey, type FloatFx } from '../stores/battleStore';
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

interface UnitRowProps extends RowProps {
  owner: PlayerIndex;
  slots: number;
  label: string;
  myIndex: PlayerIndex;
  /** 布防模式：该行所有槽位可点击部署 */
  deployEnabled?: boolean;
  onDeploySlot?: (slot: number) => void;
  /** 悬停 1 秒触发检视 */
  onUnitHover?: (unitId: string | null) => void;
}

function UnitRow({
  owner,
  slots,
  targetKeys,
  onUnitClick,
  label,
  moveTarget = null,
  onSlotClick,
  myIndex,
  deployEnabled = false,
  onDeploySlot,
  onUnitHover,
}: UnitRowProps) {
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
  const moveHot = owner === myIndex && moveTarget === 'support';

  return (
    <div
      className={`relative flex items-center justify-center gap-[var(--row-gap)] rounded-sm ${
        moveHot ? 'cursor-pointer bg-brass-500/5 ring-1 ring-brass-500/40' : ''
      }`}
      onClick={moveHot ? () => onSlotClick?.('support') : undefined}
      role={moveHot ? 'button' : undefined}
      tabIndex={moveHot ? 0 : undefined}
      onKeyDown={
        moveHot
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
        const key = unit ? `u:${unit.unitId}` : null;
        return (
          <div
            key={`slot-${owner}-${index}`}
            className="relative"
            style={{ width: 'var(--bcw)', height: 'calc(var(--bcw) * 1.404)' }}
            onMouseEnter={unit && onUnitHover ? () => onUnitHover(unit.unitId) : undefined}
            onMouseLeave={unit && onUnitHover ? () => onUnitHover(null) : undefined}
          >
            {unit ? (
              <UnitCard
                unit={unit}
                card={byId.get(unit.cardId)}
                turn={state.turn}
                targetable={!!key && targetKeys.has(key)}
                selected={!!selection && selection.kind === 'attack' && selection.attackerId === unit.unitId}
                shake={shakeKey === `unit:${unit.unitId}`}
                floats={(fxByKey[`u:${unit.unitId}`] ?? []) as FloatFx[]}
                attackAt={attacks[unit.unitId]}
                isMine={unit.owner === myIndex}
                onClick={() => onUnitClick(unit.unitId)}
              />
            ) : (
              <EmptySlot index={index} hot={deployEnabled || moveHot} />
            )}

            {/* 布防模式：整个槽位可点击（含已有单位之间的插入位置） */}
            {deployEnabled && (
              <button
                type="button"
                aria-label={`部署到支援线第 ${index + 1} 位`}
                className="absolute inset-0 z-30 cursor-pointer rounded-[4px] border-2 border-dashed border-brass-400/70 bg-brass-500/10 transition-colors hover:bg-brass-500/25 hover:border-brass-300"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeploySlot?.(index);
                }}
              >
                <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-body text-[9px] tracking-[0.18em] text-brass-200/90">
                  部署 {index + 1}
                </span>
              </button>
            )}
          </div>
        );
      })}
      <GhostLayer ghosts={rowGhosts} byId={byId} slots={slots} baseIndex={0} />
    </div>
  );
}

/** 前线：共享 5 槽，同一时间只有一方占领 */
function FrontlineRow({
  targetKeys,
  onUnitClick,
  moveTarget = null,
  onSlotClick,
  myIndex,
  oppIndex,
  onUnitHover,
}: RowProps & { myIndex: PlayerIndex; oppIndex: PlayerIndex; onUnitHover?: (unitId: string | null) => void }) {
  const state = useBattleStore((s) => s.state);
  const byId = useBattleStore((s) => s.byId);
  const ghosts = useBattleStore((s) => s.ghosts);
  const fxByKey = useBattleStore((s) => s.fxByKey);
  const attacks = useBattleStore((s) => s.attacks);
  const selection = useBattleStore((s) => s.selection);
  const shakeKey = useBattleStore((s) => s.shakeKey);

  if (!state) return null;
  const slots = state.config.frontlineSlots || FRONTLINE_SLOTS;
  const enemyUnits = state.players[oppIndex].frontline
    .map((unitId) => state.units[unitId])
    .filter((unit): unit is Unit => !!unit);
  const myUnits = state.players[myIndex].frontline
    .map((unitId) => state.units[unitId])
    .filter((unit): unit is Unit => !!unit);
  // 正常规则下只会有一方；极端争夺态下两侧都渲染
  const display: { unit: Unit }[] = [...enemyUnits, ...myUnits].map((unit) => ({ unit }));
  const used = display.length;
  const totalSlots = Math.max(slots, used);
  const controller = state.frontlineController;
  const controllerLabel =
    controller === myIndex ? '我方占领' : controller === oppIndex ? '敌方占领' : used > 0 ? '争夺中' : '无人占领';
  const controllerColor = controller === myIndex ? '#c39b3a' : controller === oppIndex ? '#b0543f' : '#8d8258';
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
      <span
        className="fards-hazard pointer-events-none absolute inset-x-8 top-1/2 -z-10 h-[calc(100%-8px)] -translate-y-1/2 rounded-sm border-y border-field-700/50 opacity-[0.16]"
        aria-hidden="true"
      />
      <RowLabel text="前线 · 共享" />

      {Array.from({ length: totalSlots }).map((_, index) => {
        const entry = display[index];
        if (!entry) return <EmptySlot key={`slot-front-${index}`} index={index} hot={hot} />;
        const { unit } = entry;
        const key = `u:${unit.unitId}`;
        return (
          <div
            key={unit.unitId}
            className="relative"
            style={{ width: 'var(--bcw)', height: 'calc(var(--bcw) * 1.404)' }}
            onMouseEnter={onUnitHover ? () => onUnitHover(unit.unitId) : undefined}
            onMouseLeave={onUnitHover ? () => onUnitHover(null) : undefined}
          >
            <UnitCard
              unit={unit}
              card={byId.get(unit.cardId)}
              turn={state.turn}
              targetable={targetKeys.has(key)}
              selected={!!selection && selection.kind === 'attack' && selection.attackerId === unit.unitId}
              shake={shakeKey === `unit:${unit.unitId}`}
              floats={(fxByKey[key] ?? []) as FloatFx[]}
              attackAt={attacks[unit.unitId]}
              isMine={unit.owner === myIndex}
              onClick={() => onUnitClick(unit.unitId)}
            />
          </div>
        );
      })}

      <GhostLayer ghosts={frontlineGhosts} byId={byId} slots={totalSlots} baseIndex={0} />

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
  /** 我方/对方玩家下标（AI 对局 0/1；局域网客机 1/0） */
  myIndex: PlayerIndex;
  oppIndex: PlayerIndex;
  /** 布防模式：选中单位卡后，点击我方支援线槽位决定部署位置 */
  deployMode?: boolean;
  onDeploySlot?: (slot: number) => void;
  /** 点击总部卡（敌方 HQ 在可攻击目标内时由上层执行攻击；否则用于检视） */
  onHqClick?: (player: PlayerIndex) => void;
  /** 悬停 1 秒触发检视 */
  onUnitHover?: (unitId: string | null) => void;
  onHqHover?: (player: PlayerIndex | null) => void;
}

/** 敌方支援线 + HQ + 共享前线 + 我方支援线 + HQ */
export function BattleRows({
  targetKeys,
  onUnitClick,
  moveTarget = null,
  onSlotClick,
  myIndex,
  oppIndex,
  deployMode = false,
  onDeploySlot,
  onHqClick,
  onUnitHover,
  onHqHover,
}: BattleRowsProps) {
  const state = useBattleStore((s) => s.state);
  const hqHits = useBattleStore((s) => s.hqHits);
  if (!state) return null;

  const deployLine = deployMode ? 'support' : null;

  const renderHq = (player: PlayerIndex, side: 'self' | 'enemy') => {
    const info = state.players[player];
    return (
      <div
        className="relative shrink-0"
        style={{ width: 'var(--bcw)' }}
        onMouseEnter={onHqHover ? () => onHqHover(player) : undefined}
        onMouseLeave={onHqHover ? () => onHqHover(null) : undefined}
      >
        <HqCard
          side={side}
          factionZh={factionMeta(info.faction).zh}
          hp={info.hq.hp}
          maxHp={info.hq.maxHp}
          armor={info.hq.armor}
          targetable={targetKeys.has(`hq:${player}`)}
          onClick={() => onHqClick?.(player)}
          flashAt={hqHits[`hq:${player}`]}
          className="w-full"
        />
      </div>
    );
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden py-[2px]">
      <div className="relative flex flex-1 items-center justify-center gap-3">
        <UnitRow
          owner={oppIndex}
          slots={SUPPORT_SLOTS}
          targetKeys={targetKeys}
          onUnitClick={onUnitClick}
          label="敌方支援线"
          moveTarget={moveTarget}
          onSlotClick={onSlotClick}
          myIndex={myIndex}
          onUnitHover={onUnitHover}
        />
        {renderHq(oppIndex, 'enemy')}
      </div>

      <FrontlineRow
        targetKeys={targetKeys}
        onUnitClick={onUnitClick}
        moveTarget={moveTarget}
        onSlotClick={onSlotClick}
        myIndex={myIndex}
        oppIndex={oppIndex}
        onUnitHover={onUnitHover}
      />

      <div className="relative flex flex-1 items-center justify-center gap-3">
        <UnitRow
          owner={myIndex}
          slots={SUPPORT_SLOTS}
          targetKeys={targetKeys}
          onUnitClick={onUnitClick}
          label="我方支援线"
          moveTarget={moveTarget}
          onSlotClick={onSlotClick}
          myIndex={myIndex}
          deployEnabled={deployMode}
          onDeploySlot={onDeploySlot}
          onUnitHover={onUnitHover}
        />
        {renderHq(myIndex, 'self')}
      </div>
    </div>
  );
}

export default BattleRows;

/** 供战场渲染使用：把 refs 转成 key 集合 */
export function refsToKeys(refs: TargetRef[] | undefined): Set<string> {
  return new Set((refs ?? []).map((ref) => targetKey(ref)));
}
