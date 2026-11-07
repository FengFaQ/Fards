/**
 * 战场主界面：顶部信息条 / 双方玩家条 / 三条战线 / 手牌区 / 日志抽屉 / 各类弹窗。
 * 只读 store，所有交互经 store 里的 legalActions 校验后提交引擎。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasKeyword, keywordId } from '@/engine';
import { legalActions } from '@/engine';
import type { LegalAction, PlayerIndex, TargetRef } from '@/engine/types';
import type { UiCard } from '../lib/dataBridge';
import { cardTypeMeta, factionMeta, factionZh, rarityMeta } from '../lib/format';
import { IconAlert, IconArrowRight, IconCards, IconPlay, IconSwords, IconX } from '../components/icons';
import CardInspectPanel, {
  inspectFromCard,
  type InspectCardData,
} from '../components/CardInspectPanel';
import Dialog from '../components/Dialog';
import { useBattleStore } from '../stores/battleStore';import BattleRows, { refsToKeys } from './BattleRows';
import CardFace from './CardFace';
import ChoiceDialog from './ChoiceDialog';
import GameOverDialog from './GameOverDialog';
import HandFan from './HandFan';
import LogPanel from './LogPanel';
import PlayerBar from './PlayerBar';

const EMPTY_LEGAL: {
  byCard: Map<string, LegalAction>;
  byUnit: Map<string, LegalAction>;
  moveByUnit: Map<string, LegalAction>;
} = { byCard: new Map(), byUnit: new Map(), moveByUnit: new Map() };

const EMPTY_KEYS = new Set<string>();

const DIFFICULTY_ZH: Record<string, string> = { easy: '新兵', normal: '老兵', hard: '王牌' };

const moveCostLabel = (cost?: number): string => (cost && cost > 0 ? ` · ${cost} 克` : ' · 免费');

/** 检视面板的数据源：手牌/单位/HQ */
type InspectTarget =
  | { kind: 'card'; cardId: string }
  | { kind: 'unit'; unitId: string }
  | { kind: 'hq'; player: PlayerIndex }
  | null;

function CardInspector({ card, fallback }: { card: UiCard | null; fallback: React.ReactNode }) {
  if (!card) return <>{fallback}</>;
  const faction = factionMeta(card.faction);
  const rarity = rarityMeta(card.rarity);
  return (
    <div className="flex gap-2.5">
      <div className="h-[92px] w-[66px] shrink-0">
        <CardFace card={card} className="h-full w-full" eager />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[12px] tracking-[0.06em] text-field-100">{card.nameZh}</p>
        <p className="mt-0.5 truncate font-body text-[9px] tracking-[0.1em] text-field-500">
          <span style={{ color: faction.color }}>{faction.zh}</span> · {cardTypeMeta(card.type).zh} ·{' '}
          {rarity.zh} · {card.kredits} 费
        </p>
        <p className="mt-1 line-clamp-4 font-body text-[10px] leading-snug text-field-400">
          {card.description || '无特殊效果'}
        </p>
      </div>
    </div>
  );
}

export function BattleScreen() {
  const state = useBattleStore((s) => s.state);
  const registry = useBattleStore((s) => s.registry);
  const byId = useBattleStore((s) => s.byId);
  const phase = useBattleStore((s) => s.phase);
  const selection = useBattleStore((s) => s.selection);
  const aiThinking = useBattleStore((s) => s.aiThinking);
  const banner = useBattleStore((s) => s.banner);
  const hint = useBattleStore((s) => s.hint);
  const difficulty = useBattleStore((s) => s.difficulty);
  const playerDeck = useBattleStore((s) => s.playerDeck);
  const fxByKey = useBattleStore((s) => s.fxByKey);
  const hqHits = useBattleStore((s) => s.hqHits);
  const logOpen = useBattleStore((s) => s.logOpen);

  /* ---------------- 局域网 ---------------- */
  const mode = useBattleStore((s) => s.mode);
  const myIndex = useBattleStore((s) => s.myIndex);
  const oppIndex = useBattleStore((s) => s.oppIndex);
  const lanRole = useBattleStore((s) => s.lanRole);
  const lanRoomCode = useBattleStore((s) => s.lanRoomCode);
  const lanPeerName = useBattleStore((s) => s.lanPeerName);
  const lanStatus = useBattleStore((s) => s.lanStatus);
  const lanError = useBattleStore((s) => s.lanError);
  const lanLegal = useBattleStore((s) => s.lanLegal);
  const lanPeerLeft = useBattleStore((s) => s.lanPeerLeft);
  const lanLeave = useBattleStore((s) => s.lanLeave);
  const navigate = useNavigate();
  const goLobby = () => {
    lanLeave();
    navigate('/lan');
  };
  const goSetup = () => {
    lanLeave();
    quitToSetup();
  };
  const isLan = mode === 'lan-host' || mode === 'lan-guest';
  const lanBroken = isLan && (lanStatus === 'closed' || lanStatus === 'error' || lanPeerLeft);

  const selectUnit = useBattleStore((s) => s.selectUnit);
  const clickTarget = useBattleStore((s) => s.clickTarget);
  const cancelSelection = useBattleStore((s) => s.cancelSelection);
  const endTurn = useBattleStore((s) => s.endTurn);
  const surrender = useBattleStore((s) => s.surrender);
  const toggleLog = useBattleStore((s) => s.toggleLog);
  const pruneFx = useBattleStore((s) => s.pruneFx);
  const quitToSetup = useBattleStore((s) => s.quitToSetup);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'surrender' | 'exit'>(null);
  /** 右下角卡片检视面板（点击任意卡 / 悬停 1 秒触发） */
  const [inspect, setInspect] = useState<InspectTarget>(null);
  const inspectTimer = useRef<number | null>(null);

  const clearInspectTimer = () => {
    if (inspectTimer.current !== null) {
      window.clearTimeout(inspectTimer.current);
      inspectTimer.current = null;
    }
  };

  /** 悬停 1 秒后才弹出，避免扫过卡片时闪烁 */
  const hoverInspect = (target: InspectTarget) => {
    clearInspectTimer();
    if (!target) return;
    inspectTimer.current = window.setTimeout(() => {
      inspectTimer.current = null;
      setInspect(target);
    }, 1000);
  };

  const legal = useMemo(() => {
    if (!state || !registry || phase !== 'playing') return EMPTY_LEGAL;
    if (state.pendingChoice || state.activePlayer !== myIndex) return EMPTY_LEGAL;
    // 客机只认 host 下发的合法动作，绝不本地计算
    const actions =
      mode === 'lan-guest' ? lanLegal : legalActions(state, registry, myIndex);
    const byCard = new Map<string, LegalAction>();
    const byUnit = new Map<string, LegalAction>();
    const moveByUnit = new Map<string, LegalAction>();
    for (const action of actions) {
      if (action.kind === 'playCard' && action.cardInstanceId) byCard.set(action.cardInstanceId, action);
      else if (action.kind === 'attack' && action.attackerId) byUnit.set(action.attackerId, action);
      else if (action.kind === 'moveUnit' && action.unitId) moveByUnit.set(action.unitId, action);
    }
    return { byCard, byUnit, moveByUnit };
  }, [state, registry, phase, mode, lanLegal, myIndex]);

  const targetKeys = useMemo(
    () => (selection ? refsToKeys(selection.refs) : EMPTY_KEYS),
    [selection],
  );
  const moveTarget = selection?.kind === 'move' ? selection.toLine ?? null : null;
  const selectedUnitId =
    selection?.kind === 'attack'
      ? selection.attackerId
      : selection?.kind === 'unit'
        ? selection.unitId
        : undefined;
  const selectedMoveAction = selectedUnitId ? legal.moveByUnit.get(selectedUnitId) : undefined;
  const selectedMoveUnit = selectedUnitId ? state?.units[selectedUnitId] : undefined;
  const moveLabel = selectedMoveUnit?.line === 'frontline' ? '撤退至支援线' : '移动到前线';
  const chooseSlot = useBattleStore((s) => s.chooseSlot);
  const moveSelected = useBattleStore((s) => s.moveSelected);
  const deployToSlot = useBattleStore((s) => s.deployToSlot);
  const notify = useBattleStore((s) => s.notify);
  const deployMode = selection?.kind === 'deploy';

  /** 统一单位点击：攻击目标 > 选中己方单位 > 检视 */
  const handleUnitClick = (unitId: string) => {
    const unit = state?.units[unitId];
    setInspect({ kind: 'unit', unitId });
    if (selection) {
      const ref: TargetRef = { kind: 'unit', unitId };
      const legalTarget = selection.refs.some(
        (item) => item.kind === 'unit' && item.unitId === unitId,
      );
      if (legalTarget && selection.kind === 'attack') {
        clickTarget(ref);
        return;
      }
      if (legalTarget) return;
      notify('该单位不是当前合法目标（可能被守护 / 烟幕 / 伏击 / 隐蔽保护，或战线不相邻）');
      return;
    }
    if (unit && unit.owner === myIndex) selectUnit(unitId);
  };

  /** 统一 HQ 点击：可攻击时作为目标；否则检视/提示 */
  const handleHqClick = (player: PlayerIndex) => {
    setInspect({ kind: 'hq', player });
    if (targetKeys.has(`hq:${player}`)) {
      clickTarget({ kind: 'hq', player });
      return;
    }
    if (player === myIndex) notify('我方总部：不可选中 / 移动');
    else notify('敌方总部：地面单位需位于前线才能攻击（炮兵/空军不受限）');
  };

  const inspectData = useMemo<InspectCardData | null>(() => {
    if (!inspect || !state) return null;
    if (inspect.kind === 'card') {
      const card = byId.get(inspect.cardId);
      return card ? inspectFromCard(card) : null;
    }
    if (inspect.kind === 'unit') {
      const unit = state.units[inspect.unitId];
      if (!unit) return null;
      const card = byId.get(unit.cardId);
      if (!card) return null;
      const notes: string[] = [];
      if (unit.statuses.pinned) notes.push('被压制');
      if ((unit.statuses.cannotAttackTurns ?? 0) > 0) notes.push('无法攻击');
      if (unit.attacksUsed >= unit.maxAttacks) notes.push('本回合已行动');
      const blitz = hasKeyword(unit, 'blitz') || hasKeyword(unit, 'shock');
      if (unit.deployedTurn === state.turn && !blitz) notes.push('召唤病：本回合无法行动');
      if (unit.deployedTurn === state.turn && blitz) notes.push('闪击：本回合可行动');
      if (unit.movedThisTurn) notes.push('本回合已移动');
      return inspectFromCard(card, {
        attack: unit.attack,
        hp: unit.hp,
        maxHp: unit.maxHp,
        armor: unit.armor,
        keywords: unit.keywords,
        note: notes.join(' · '),
        side: unit.owner === myIndex ? 'self' : 'enemy',
        isUnit: true,
      });
    }
    const info = state.players[inspect.player];
    const faction = factionMeta(info.faction);
    return {
      cardId: `hq:${inspect.player}`,
      nameZh: `${faction.zh} 总部`,
      factionZh: faction.zh,
      typeZh: '总部',
      keywords: [],
      kredits: 0,
      operationCost: 0,
      hp: info.hq.hp,
      maxHp: info.hq.maxHp,
      armor: info.hq.armor,
      description: '总部耐久归零即告负。总部不可被移动或主动选中；敌方地面单位需位于前线才能攻击（炮兵/空军不受限）。',
      isUnit: false,
      side: inspect.player === myIndex ? 'self' : 'enemy',
      note: `耐久 ${info.hq.hp}/${info.hq.maxHp}${info.hq.armor > 0 ? ` · 装甲 ${info.hq.armor}` : ''}`,
    };
  }, [inspect, state, byId, myIndex]);

  useEffect(() => {
    const timer = window.setInterval(() => pruneFx(Date.now()), 700);
    return () => window.clearInterval(timer);
  }, [pruneFx]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelSelection();
        clearInspectTimer();
        setInspect(null);
        return;
      }
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      event.preventDefault();
      endTurn();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelSelection, endTurn]);

  if (!state) return null;

  const me = state.players[myIndex];
  const enemy = state.players[oppIndex];
  const myTurn = phase === 'playing' && state.activePlayer === myIndex && !state.pendingChoice;
  const hoveredCard = hoveredId ? byId.get(hoveredId) ?? null : null;
  const myFaction = factionMeta(me.faction);
  const hqTargetEnemy = targetKeys.has(`hq:${oppIndex}`);
  const hqTargetSelf = targetKeys.has(`hq:${myIndex}`);

  return (
    <div
      className="battle-root relative flex h-screen w-full flex-col overflow-hidden text-field-100 select-none"
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (
          target?.closest(
            '.unit-card, .hand-card, .fards-hq-card, .fards-inspect-panel, [role="dialog"], button',
          )
        )
          return;
        setInspect(null);
      }}
      onContextMenu={(event) => {
        if (selection) {
          event.preventDefault();
          cancelSelection();
        }
      }}
    >
      {/* ---------------- 顶部信息条 ---------------- */}
      <header className="relative z-20 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-brass-600/25 bg-field-950/90 px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setConfirm('exit')}
            className="flex items-center gap-1 rounded-sm border border-field-600/60 px-2 py-1 font-body text-[9px] tracking-[0.18em] text-field-400 uppercase transition-colors hover:border-brass-500/60 hover:text-brass-300"
            title="撤离战场（放弃本局）"
          >
            <IconX size={11} />
            撤离
          </button>
          <span className="hidden h-4 w-px bg-field-700 sm:block" />
          <span className="fards-title text-[12px] leading-none">FARDS · 战场</span>
          <span className="hidden max-w-[240px] truncate font-body text-[9px] tracking-[0.1em] text-field-500 md:block">
            <span style={{ color: myFaction.color }}>{factionZh(me.faction)}</span>
            {playerDeck ? ` · ${playerDeck.name}` : ''}
          </span>
          {isLan && (
            <span
              className="flex items-center gap-1.5 rounded-sm border border-brass-500/50 bg-brass-500/10 px-2 py-[3px] font-body text-[9px] tracking-[0.14em] text-brass-200"
              title={`局域网对战 · 我是${lanRole === 'host' ? '房主（权威端）' : '客机（渲染端）'}`}
            >
              <span className="battle-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
              局域网{lanRoomCode ? ` · 房间 ${lanRoomCode}` : ''}
              {lanPeerName ? ` · 对手 ${lanPeerName}` : ''}
              <span className="text-brass-400/70">{lanRole === 'host' ? 'HOST' : 'GUEST'}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-sm border border-field-700/60 bg-field-900/60 px-2 py-[3px] font-body text-[9px] tracking-[0.14em] text-field-400 sm:flex">
            回合 <span className="text-field-100">{state.turn}</span>
            <span className="text-field-700">·</span>
            轮 <span className="text-field-100">{state.round}</span>
          </span>
          <span
            className={`flex items-center gap-1.5 rounded-sm border px-2 py-[3px] font-body text-[9px] tracking-[0.16em] ${
              state.activePlayer === myIndex
                ? 'border-brass-500/60 bg-brass-500/10 text-brass-200'
                : 'border-ink-red/50 bg-ink-red/10 text-red-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${state.activePlayer === myIndex ? 'bg-brass-400' : 'bg-ink-red'} ${aiThinking ? 'battle-pulse-dot' : ''}`}
            />
            {state.activePlayer === myIndex ? '我方行动' : isLan ? '对手行动' : '敌方行动'}
          </span>
          {aiThinking && (
            <span className="flex items-center gap-1.5 rounded-sm border border-field-600/60 bg-field-950/80 px-2 py-[3px] font-body text-[9px] tracking-[0.16em] text-field-300">
              <span className="battle-pulse-dot h-1.5 w-1.5 rounded-full bg-brass-400" />
              AI 行动中
            </span>
          )}
          {!isLan && (
            <span className="hidden rounded-sm border border-field-700/60 px-2 py-[3px] font-body text-[9px] tracking-[0.14em] text-field-500 sm:block">
              {DIFFICULTY_ZH[difficulty] ?? difficulty}
            </span>
          )}
          <button
            type="button"
            onClick={toggleLog}
            className={`flex items-center gap-1 rounded-sm border px-2 py-1 font-body text-[9px] tracking-[0.16em] uppercase transition-colors ${
              logOpen
                ? 'border-brass-500/60 bg-brass-500/10 text-brass-200'
                : 'border-field-600/60 text-field-400 hover:border-brass-500/60 hover:text-brass-300'
            }`}
          >
            日志
          </button>
          <button
            type="button"
            onClick={() => setConfirm('surrender')}
            className="flex items-center gap-1 rounded-sm border border-ink-red/50 px-2 py-1 font-body text-[9px] tracking-[0.16em] text-red-300/90 uppercase transition-colors hover:border-ink-red hover:bg-ink-red/15 hover:text-red-200"
          >
            投降
          </button>
        </div>
      </header>

      {/* ---------------- 战场主体（左侧战场 + 右侧停靠日志） ---------------- */}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <PlayerBar
            player={enemy}
            isSelf={false}
            isActive={state.activePlayer === oppIndex}
            targetable={hqTargetEnemy}
            hqHitAt={hqHits[`hq:${oppIndex}`]}
            floats={fxByKey[`hq:${oppIndex}`]}
            onClick={() => handleHqClick(oppIndex)}
          />

          <BattleRows
            targetKeys={targetKeys}
            onUnitClick={handleUnitClick}
            moveTarget={moveTarget}
            onSlotClick={chooseSlot}
            myIndex={myIndex}
            oppIndex={oppIndex}
            deployMode={deployMode}
            onDeploySlot={deployToSlot}
            onHqClick={handleHqClick}
            onUnitHover={(unitId) => hoverInspect(unitId ? { kind: 'unit', unitId } : null)}
            onHqHover={(player) => hoverInspect(player !== null ? { kind: 'hq', player } : null)}
          />

          <PlayerBar
            player={me}
            isSelf
            isActive={state.activePlayer === myIndex}
            targetable={hqTargetSelf}
            hqHitAt={hqHits[`hq:${myIndex}`]}
            floats={fxByKey[`hq:${myIndex}`]}
            onClick={() => handleHqClick(myIndex)}
          />
        </div>

        <LogPanel />
      </div>

      {/* ---------------- 手牌区 ---------------- */}
      <section className="hand-tray relative z-20 flex h-[clamp(150px,21vh,206px)] shrink-0 items-end">
        {/* 左侧：卡牌检视 */}
        <div className="absolute bottom-2 left-3 z-30 w-[272px] rounded-sm border border-field-700/70 bg-field-950/80 p-2 backdrop-blur-sm">
          <CardInspector
            card={hoveredCard}
            fallback={
              <div className="text-field-500">
                <p className="fards-label text-[9px] text-brass-500">战术提示</p>
                <p className="mt-1 font-body text-[10px] leading-relaxed">
                  点手牌进入布防，再点支援线槽位决定位置；点我方单位可攻击/移动。
                </p>
                <p className="mt-1 font-body text-[9px] leading-relaxed text-field-600">
                  点击/悬停 1 秒可检视任意卡（右下角面板）。支援线单位只能打敌方前线；闪击单位部署当回合即可行动。
                </p>
              </div>
            }
          />
        </div>

        {/* 手牌扇形 */}
        <div className="absolute inset-y-0 right-[196px] left-[288px]">
          <HandFan
            legalByCard={legal.byCard}
            byId={byId}
            onHover={(cardId) => {
              setHoveredId(cardId);
              hoverInspect(cardId ? { kind: 'card', cardId } : null);
            }}
            hoveredId={hoveredId}
          />
        </div>

        {/* 右侧：结束回合 */}
        <div className="absolute right-3 bottom-2 z-30 flex flex-col items-end gap-1.5">
          <div className="text-right">
            <p className="fards-label text-[9px] text-field-500">可用克雷迪特</p>
            <p className="font-display text-lg leading-none text-brass-300">
              {me.kredits}
              <span className="text-xs text-field-600">/{me.maxKredits}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={endTurn}
            disabled={!myTurn}
            className="fards-btn fards-btn-primary min-w-[132px] px-5 py-2"
            title="结束回合（空格）"
          >
            <IconPlay size={13} />
            结束回合
          </button>
          <p className="font-body text-[8px] tracking-[0.14em] text-field-600">空格键 = 结束回合</p>
        </div>
      </section>

      {/* ---------------- 覆盖层 ---------------- */}
      {banner && (
        <div
          key={banner.at}
          className="fx-banner pointer-events-none absolute inset-x-0 top-[26%] z-40 flex justify-center"
        >
          <div className="flex flex-col items-center gap-1">
            <span
              className={`h-px w-40 ${
                banner.tone === 'enemy' ? 'bg-gradient-to-r from-transparent via-ink-red/70 to-transparent' : 'bg-gradient-to-r from-transparent via-brass-500/80 to-transparent'
              }`}
            />
            <p
              className={`font-display text-[clamp(22px,3.4vh,38px)] leading-none tracking-[0.26em] drop-shadow-[0_4px_14px_rgba(0,0,0,0.9)] ${
                banner.tone === 'enemy' ? 'text-red-300' : banner.tone === 'self' ? 'text-brass-200' : 'text-field-200'
              }`}
            >
              {banner.text}
            </p>
            {banner.sub && (
              <p className="font-body text-[10px] tracking-[0.22em] text-field-400/90">{banner.sub}</p>
            )}
            <span
              className={`h-px w-40 ${
                banner.tone === 'enemy' ? 'bg-gradient-to-r from-transparent via-ink-red/70 to-transparent' : 'bg-gradient-to-r from-transparent via-brass-500/80 to-transparent'
              }`}
            />
          </div>
        </div>
      )}

      {/* 选目标 / 移动 / 布防提示条 */}
      {selection && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(clamp(150px,21vh,206px)+10px)] z-40 flex justify-center">
          <div className="flex max-w-[min(96vw,900px)] items-center gap-3 rounded-sm border border-brass-500/70 bg-field-950/92 px-3 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.6)]">
            {selection.kind === 'deploy' ? (
              <>
                <IconCards size={13} className="shrink-0 text-brass-400" />
                <span className="shrink-0 font-body text-[10px] tracking-[0.14em] text-brass-200">
                  {selection.label}
                </span>
                <span className="font-body text-[10px] text-field-300">
                  布防中：点击我方支援线 1–4 号槽位决定部署位置
                </span>
              </>
            ) : selection.kind === 'move' ? (
              <>
                <IconArrowRight size={13} className="shrink-0 text-brass-400" />
                <span className="shrink-0 font-body text-[10px] tracking-[0.14em] text-brass-200">
                  {selection.label}
                </span>
                <span className="font-body text-[10px] text-field-300">
                  点击高亮的{selection.toLine === 'frontline' ? '前线' : '支援线'}确认移动
                </span>
                <button
                  type="button"
                  onClick={() => chooseSlot(selection.toLine ?? 'frontline')}
                  className="pointer-events-auto shrink-0 rounded-sm border border-brass-500/70 bg-brass-500/15 px-2 py-[2px] font-body text-[9px] tracking-[0.14em] text-brass-200 transition-colors hover:bg-brass-500/25"
                >
                  确认移动
                </button>
              </>
            ) : selection.kind === 'unit' ? (
              <>
                <IconAlert size={13} className="shrink-0 text-amber-400" />
                <span className="shrink-0 font-body text-[10px] tracking-[0.14em] text-brass-200">
                  {selection.label}
                </span>
                <span className="line-clamp-2 font-body text-[10px] leading-snug text-field-300">
                  {selection.note ?? '该单位当前没有可攻击目标'}
                </span>
                {selectedMoveAction && (
                  <button
                    type="button"
                    onClick={moveSelected}
                    className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-sm border border-brass-500/70 bg-brass-500/15 px-2 py-[2px] font-body text-[9px] tracking-[0.14em] text-brass-200 transition-colors hover:bg-brass-500/25"
                    title="移动到前线（消耗行动花费）后即可攻击敌方支援线/总部"
                  >
                    <IconArrowRight size={11} />
                    {moveLabel}
                    {moveCostLabel(selectedMoveAction.cost)}
                  </button>
                )}
              </>
            ) : (
              <>
                <IconSwords size={13} className="shrink-0 text-brass-400" />
                <span className="shrink-0 font-body text-[10px] tracking-[0.14em] text-brass-200">
                  {selection.label}
                </span>
                <span className="font-body text-[10px] text-field-300">
                  选择目标 <span className="font-display text-brass-300">{selection.chosen.length}</span>/
                  {selection.count}
                </span>
                {selectedMoveAction && (
                  <button
                    type="button"
                    onClick={moveSelected}
                    className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-sm border border-field-500/70 bg-field-800/80 px-2 py-[2px] font-body text-[9px] tracking-[0.14em] text-field-200 transition-colors hover:border-brass-500/70 hover:text-brass-200"
                    title={selectedMoveUnit?.line === 'frontline' ? '撤退回支援线（免费）' : '改为移动到前线（消耗行动花费）'}
                  >
                    <IconArrowRight size={11} />
                    {moveLabel}
                    {moveCostLabel(selectedMoveAction.cost)}
                  </button>
                )}
              </>
            )}
            <span className="shrink-0 font-body text-[9px] tracking-[0.1em] text-field-500">右键 / Esc 取消</span>
          </div>
        </div>
      )}

      {/* 非法操作提示 */}
      {hint && (
        <div className="pointer-events-none absolute inset-x-0 top-[16%] z-40 flex justify-center">
          <div key={hint.at} className="flex items-center gap-2 rounded-sm border border-ink-red/50 bg-field-950/92 px-3 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.6)]">
            <IconAlert size={12} className="text-red-300" />
            <span className="font-body text-[10px] tracking-[0.12em] text-red-200">{hint.text}</span>
          </div>
        </div>
      )}

      {/* 局域网断线/离开覆盖层 */}
      {lanBroken && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-field-950/85 backdrop-blur-sm">
          <div className="fards-panel w-[min(92vw,420px)] border-ink-red/40 p-5 text-center">
            <p className="fards-label text-[10px] text-ink-red">局域网连接中断</p>
            <h2 className="mt-1 font-display text-lg tracking-[0.14em] text-field-100">
              {lanPeerLeft ? '对手已离开房间' : lanStatus === 'closed' ? '连接已断开' : '连接异常'}
            </h2>
            <p className="mt-2 font-body text-[11px] leading-relaxed text-field-400">
              {lanPeerLeft
                ? '对手离开了房间或关闭了页面，本局无法继续。返回大厅可以重新建房/加入。'
                : lanError ?? '与对端的连接已断开，本局无法继续。'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button type="button" className="fards-btn fards-btn-primary" onClick={goLobby}>
                返回大厅
              </button>
              <button type="button" className="fards-btn fards-btn-ghost" onClick={goSetup}>
                退出到准备
              </button>
            </div>
          </div>
        </div>
      )}

      <CardInspectPanel card={inspectData} onClose={() => setInspect(null)} />

      <ChoiceDialog />
      <GameOverDialog />

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        eyebrow={confirm === 'surrender' ? '确认投降' : isLan ? '离开对局' : '撤离战场'}
        title={confirm === 'surrender' ? '放弃本局？' : '离开战场？'}
        width="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="fards-btn fards-btn-ghost" onClick={() => setConfirm(null)}>
              取消
            </button>
            <button
              type="button"
              className={confirm === 'surrender' ? 'fards-btn fards-btn-danger' : 'fards-btn fards-btn-primary'}
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action === 'surrender') surrender();
                else if (isLan) goLobby();
                else quitToSetup();
              }}
            >
              {confirm === 'surrender' ? '确认投降' : '确认撤离'}
            </button>
          </div>
        }
      >
        <p className="font-body text-[12px] leading-relaxed text-field-300">
          {confirm === 'surrender'
            ? '投降将立即判负并结束本局，战绩不会保存。准备换一套编制再战？'
            : isLan
              ? '离开会断开与对手的局域网连接（对手会收到“对手已离开”提示），本局进度不会保留。'
              : '撤离会放弃当前对局并返回部署界面，本局进度不会保留。'}
        </p>
      </Dialog>
    </div>
  );
}

function aiFactionSafe(faction: string, _state: unknown): string {
  return faction || 'Neutral';
}

export default BattleScreen;
