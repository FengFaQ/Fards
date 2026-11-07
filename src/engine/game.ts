/**
 * 指令处理与回合流程：applyCommand 是引擎唯一入口（纯函数式）。
 */
import type {
  CardInstance,
  EffectOp,
  EngineRegistry,
  GameCommand,
  GameEvent,
  GameState,
  Line,
  PlayerIndex,
  TargetRef,
  Unit,
} from './types';
import {
  addLog,
  canAfford,
  cardDefName,
  checkGameOver,
  createGame,
  createCardInstance,
  damageHQInternal,
  endTurnInternal,
  finishGame,
  getDef,
  getScript,
  makeUnitFromInstance,
  nameOf,
  opponentOf,
  payKredits,
  placeUnit,
  playerUnits,
  recalcUnit,
  setRegistry,
  startTurnInternal,
} from './state';
import {
  canDeployToFrontline,
  getOperationCost,
  isOrderCardType,
  isRefIn,
  legalAttackTargets,
  legalDeployLines,
  playCost,
  requiredTargetCount,
  resolveLegalTargetRefs,
  targetSpecOf,
  canUnitAttack,
} from './targeting';
import { hasKeyword, isCountermeasureType } from './keywords';
import {
  createCtx,
  dealDamage,
  destroyUnitAndTrigger,
  executeEffects,
  fireBoardTriggers,
  fireUnitTrigger,
  moveUnitToLine,
  processTriggers,
  recomputeAuras,
  runAbility,
  resolveEffectTargets,
  type ExecCtx,
} from './effects/executor';

export { createGame };

/** 引擎唯一入口：应用一条指令，返回新状态与事件流 */
export function applyCommand(prev: GameState, cmd: GameCommand, reg: EngineRegistry): { state: GameState; events: GameEvent[] } {
  const state = structuredClone(prev) as GameState;
  const events: GameEvent[] = [];
  setRegistry(reg);
  if (state.status !== 'playing') return { state, events };
  if (state.pendingChoice && cmd.type !== 'resolveChoice') return { state, events };
  if (!state.pendingChoice && cmd.type === 'resolveChoice') return { state, events };
  if ('player' in cmd && cmd.player !== state.activePlayer) return { state, events };

  switch (cmd.type) {
    case 'playCard':
      playCard(state, reg, cmd, events);
      break;
    case 'attack':
      resolveAttack(state, reg, cmd, events);
      break;
    case 'moveUnit':
      resolveMove(state, reg, cmd, events);
      break;
    case 'endTurn':
      resolveEndTurn(state, reg, cmd, events);
      break;
    case 'resolveChoice':
      resolveChoice(state, reg, cmd, events);
      break;
    case 'concede':
      finishGame(state, opponentOf(cmd.player), 'concede', events);
      break;
    default:
      break;
  }
  recomputeAuras(state, reg);
  checkGameOver(state, events);
  return { state, events };
}

// ============================================================
// 出牌
// ============================================================

function playCard(
  state: GameState,
  reg: EngineRegistry,
  cmd: Extract<GameCommand, { type: 'playCard' }>,
  events: GameEvent[],
): void {
  const player = cmd.player;
  const p = state.players[player];
  const handIdx = p.hand.findIndex((c) => c.instanceId === cmd.instanceId);
  if (handIdx < 0) return;
  const instance = p.hand[handIdx];
  const def = getDef(reg, instance.cardId);
  if (!def) return;
  const cost = playCost(state, reg, player, instance);
  if (!canAfford(state, player, cost)) return;

  const spec = targetSpecOf(reg, instance.cardId);
  const requiredCount = requiredTargetCount(reg, instance.cardId);
  const targets = cmd.targets ?? [];
  const chosen = targets[0];
  if (spec) {
    if (targets.length !== requiredCount) return;
    const legalRefs = resolveLegalTargetRefs(state, reg, player, spec);
    const seen = new Set<string>();
    for (const target of targets) {
      if (!isRefIn(target, legalRefs)) return;
      const key =
        target.kind === 'hq'
          ? `hq:${target.player}`
          : target.kind === 'unit'
            ? `u:${target.unitId}`
            : `c:${target.instanceId}`;
      if (seen.has(key)) return;
      seen.add(key);
    }
  }

  const isCounter = isCountermeasureType(def.type);
  const isUnit = !isOrderCardType(def.type);
  if (isUnit && !isCounter && (p.trackers['restrict:deploy:untilTurn'] ?? 0) >= state.turn) {
    addLog(state, player, 'system', '本回合无法部署单位（受反制影响）');
    return;
  }

  let line: Line | undefined;
  if (isUnit && !isCounter) {
    const lines = legalDeployLines(state, player);
    if (lines.length === 0) return;
    line = cmd.line && lines.includes(cmd.line) ? cmd.line : lines[0];
  }

  if (!payKredits(state, player, cost)) return;
  p.hand.splice(handIdx, 1);

  // 反制牌：埋伏到对方的行动阶段
  if (isCounter) {
    p.counters.push(instance);
    events.push({ type: 'playOrder', player, cardId: instance.cardId });
    addLog(state, player, 'play', `布置反制：${nameOf(instance.cardId)}`);
    p.trackers['countersPlaced'] = (p.trackers['countersPlaced'] ?? 0) + 1;
    return;
  }

  // 敌方反制触发（在指令/部署结算前）
  triggerCounters(state, reg, events, player, isUnit ? 'enemyPlaysUnit' : 'enemyPlaysCard');
  if (state.status === 'finished') return;

  const ctx = createCtx(state, reg, events, {
    controller: player,
    sourceCardId: instance.cardId,
    chosen,
    chosenList: targets,
  });

  if (isUnit) {
    const unit = makeUnitFromInstance(state, reg, player, instance, line!, { deployedTurn: state.turn });
    if (!unit) {
      p.hand.push(instance);
      return;
    }
    placeUnit(state, unit, line!, cmd.slot);
    p.deployedThisTurn += 1;
    state.trackers['unitsDeployed'] = (state.trackers['unitsDeployed'] ?? 0) + 1;
    events.push({ type: 'deploy', unitId: unit.unitId, cardId: instance.cardId, owner: player, line: line! });
    addLog(state, player, 'play', `部署 ${def.nameZh}（${line === 'frontline' ? '前线' : '支援线'}）`);
    ctx.sourceUnitId = unit.unitId;
    recomputeAuras(state, reg);
    runCardAbilities(ctx, instance.cardId, 'deploy');
    if (ctx.suspended) return;
    fireBoardTriggers(ctx, 'unitDeployed', { owners: [0, 1], triggerUnitId: unit.unitId });
  } else {
    p.discard.push(instance);
    p.trackers['ordersPlayedThisTurn'] = (p.trackers['ordersPlayedThisTurn'] ?? 0) + 1;
    events.push({ type: 'playOrder', player, cardId: instance.cardId });
    addLog(state, player, 'play', `使用指令 ${def.nameZh}`);
    runCardAbilities(ctx, instance.cardId, 'order');
    if (ctx.suspended) return;
    // 指令也可能带 deploy 触发器（兼容脚本写法）
    if (!getScript(reg, instance.cardId)?.abilities?.some((a) => a.trigger === 'order')) {
      runCardAbilities(ctx, instance.cardId, 'deploy');
    }
  }

  recomputeAuras(state, reg);
  processTriggers(ctx);
  checkGameOver(state, events);
}

function runCardAbilities(ctx: ExecCtx, cardId: string, trigger: 'deploy' | 'order'): void {
  const script = getScript(ctx.reg, cardId);
  if (!script?.abilities) return;
  for (const ability of script.abilities) {
    if (ability.trigger !== trigger) continue;
    runAbility(ctx, ability, {
      unitId: ctx.sourceUnitId,
      owner: ctx.controller,
      chosen: ctx.chosen,
      chosenList: ctx.chosenList,
    });
    if (ctx.suspended) return;
  }
}

// ============================================================
// 反制
// ============================================================

function triggerCounters(
  state: GameState,
  reg: EngineRegistry,
  events: GameEvent[],
  caster: PlayerIndex,
  trigger: 'enemyPlaysCard' | 'enemyPlaysUnit' | 'enemyAttacks' | 'enemyUsesOrder',
): void {
  const defender = opponentOf(caster);
  const counters = [...state.players[defender].counters];
  for (const counter of counters) {
    const script = getScript(reg, counter.cardId);
    if (!script?.counter) continue;
    if (script.counter.trigger !== trigger) continue;
    state.players[defender].counters = state.players[defender].counters.filter(
      (c) => c.instanceId !== counter.instanceId,
    );
    addLog(state, defender, 'effect', `反制触发：${nameOf(counter.cardId)}`);
    const ctx = createCtx(state, reg, events, { controller: defender, sourceCardId: counter.cardId });
    executeEffects(ctx, script.counter.effects);
    processTriggers(ctx);
    if (ctx.suspended) return;
  }
}

// ============================================================
// 攻击
// ============================================================

function resolveAttack(
  state: GameState,
  reg: EngineRegistry,
  cmd: Extract<GameCommand, { type: 'attack' }>,
  events: GameEvent[],
): void {
  const attacker = state.units[cmd.attackerId];
  if (!attacker || attacker.owner !== cmd.player) return;
  if ((state.players[cmd.player].trackers['restrict:attack:untilTurn'] ?? 0) >= state.turn) return;
  if (!canUnitAttack(state, attacker)) return;
  const legal = legalAttackTargets(state, reg, attacker);
  if (!isRefIn(cmd.target, legal)) return;

  const targetRef = cmd.target;
  const targetUnit = targetRef.kind === 'unit' ? state.units[targetRef.unitId] : undefined;

  const opCost = getOperationCost(attacker);
  if (state.config.attackCostsKredits && !payKredits(state, cmd.player, opCost)) return;

  attacker.attacksUsed += 1;
  const attackerAtk = attacker.attack;
  const retaliation = targetUnit ? targetUnit.attack : 0;
  events.push({ type: 'attack', attackerId: attacker.unitId, target: targetRef });
  const targetLabel =
    targetRef.kind === 'hq'
      ? '敌方总部'
      : targetRef.kind === 'unit'
        ? nameOf(state.units[targetRef.unitId]?.cardId ?? '')
        : '目标';
  addLog(state, cmd.player, 'attack', `${cardDefName(reg, attacker.cardId)} 攻击 ${targetLabel}`);

  const ctx = createCtx(state, reg, events, {
    controller: cmd.player,
    sourceUnitId: attacker.unitId,
    chosen: targetRef,
  });
  if (attacker.ambush) attacker.ambush = false;

  // 攻击前触发（先结算伤害，再触发事件，保证不会因选择挂起而丢失伤害）
  dealDamage(ctx, targetRef, attackerAtk, { unitId: attacker.unitId });
  if (targetUnit && state.units[targetUnit.unitId]) {
    dealDamage(ctx, { kind: 'unit', unitId: attacker.unitId }, retaliation);
  }
  processTriggers(ctx);
  if (ctx.suspended) return;

  // 攻击时/被攻击时能力
  if (state.units[attacker.unitId]) fireUnitTrigger(ctx, state.units[attacker.unitId], 'attack', { chosen: targetRef });
  if (targetUnit && state.units[targetUnit.unitId]) {
    fireUnitTrigger(ctx, state.units[targetUnit.unitId], 'attacked', {
      chosen: { kind: 'unit', unitId: attacker.unitId },
    });
  }
  processTriggers(ctx);
  recomputeAuras(state, reg);
}

// ============================================================
// 移动
// ============================================================

function resolveMove(
  state: GameState,
  reg: EngineRegistry,
  cmd: Extract<GameCommand, { type: 'moveUnit' }>,
  events: GameEvent[],
): void {
  const unit = state.units[cmd.unitId];
  if (!unit || unit.owner !== cmd.player) return;
  if (unit.line === cmd.toLine) return;
  if (unit.movedThisTurn) return;
  if (cmd.toLine === 'frontline' && !canDeployToFrontline(state, cmd.player)) return;
  const cost = state.config.moveCostsKredits ? getOperationCost(unit) : 0;
  if (!payKredits(state, cmd.player, cost)) return;
  unit.movedThisTurn = true;
  const ctx = createCtx(state, reg, events, { controller: cmd.player, sourceUnitId: unit.unitId });
  moveUnitToLine(ctx, unit, cmd.toLine);
  processTriggers(ctx);
  recomputeAuras(state, reg);
}

// ============================================================
// 结束回合
// ============================================================

function resolveEndTurn(
  state: GameState,
  reg: EngineRegistry,
  cmd: Extract<GameCommand, { type: 'endTurn' }>,
  events: GameEvent[],
): void {
  const player = cmd.player;
  const ctx = createCtx(state, reg, events, { controller: player });
  fireBoardTriggers(ctx, 'turnEnd', { owners: [player] });
  processTriggers(ctx);
  if (ctx.suspended) return;
  endTurnInternal(state, player, events);

  const next = opponentOf(player);
  startTurnInternal(state, next, events);
  ctx.controller = next;
  fireBoardTriggers(ctx, 'turnStart', { owners: [next] });
  processTriggers(ctx);
  if (ctx.suspended) return;
  recomputeAuras(state, reg);
  checkGameOver(state, events);
}

// ============================================================
// 抉择
// ============================================================

function resolveChoice(
  state: GameState,
  reg: EngineRegistry,
  cmd: Extract<GameCommand, { type: 'resolveChoice' }>,
  events: GameEvent[],
): void {
  const choice = state.pendingChoice;
  if (!choice || choice.choiceId !== cmd.choiceId) return;
  const data = (choice.context ?? {}) as {
    remaining?: EffectOp[];
    controller?: PlayerIndex;
    sourceUnitId?: string | null;
    sourceCardId?: string | null;
    chosen?: TargetRef | null;
    branchOptions?: { effects: EffectOp[] }[];
  };
  const controller = data.controller ?? choice.player;
  state.pendingChoice = null;
  const ctx = createCtx(state, reg, events, {
    controller,
    sourceUnitId: data.sourceUnitId ?? undefined,
    sourceCardId: data.sourceCardId ?? undefined,
    chosen: data.chosen ?? undefined,
  });

  if (choice.mode === 'option') {
    const idx = Number(cmd.selection[0] ?? '-1');
    const branch = data.branchOptions?.[idx];
    if (branch) executeEffects(ctx, branch.effects);
  } else if (choice.mode === 'unit') {
    const unitId = cmd.selection[0];
    const unit = unitId ? state.units[unitId] : undefined;
    if (unit) ctx.chosen = { kind: 'unit', unitId: unit.unitId };
  } else if (choice.mode === 'card') {
    const instanceId = cmd.selection[0];
    const instance = instanceId ? state.cards[instanceId] : undefined;
    if (instance) ctx.chosen = { kind: 'card', instanceId: instance.instanceId };
  }

  if (!ctx.suspended && data.remaining?.length) executeEffects(ctx, data.remaining);
  processTriggers(ctx);
  if (ctx.suspended) return;
  recomputeAuras(state, reg);
  checkGameOver(state, events);
}

// ============================================================
// 辅助（AI/UI 用）：把合法动作转成可直接执行的指令
// ============================================================

export function commandForAction(
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
  action: { kind: string; cardInstanceId?: string; attackerId?: string; unitId?: string },
  target?: TargetRef,
): GameCommand | null {
  const ctx = createCtx(state, reg, [], { controller: player });
  void ctx;
  switch (action.kind) {
    case 'playCard': {
      if (!action.cardInstanceId) return null;
      const instance = state.cards[action.cardInstanceId];
      const def = instance ? getDef(reg, instance.cardId) : undefined;
      const cmd: GameCommand = {
        type: 'playCard',
        player,
        instanceId: action.cardInstanceId,
        targets: target ? [target] : undefined,
      };
      if (def && !isOrderCardType(def.type)) {
        const lines = legalDeployLines(state, player);
        const line = lines[0];
        if (line) return { ...cmd, line };
      }
      return cmd;
    }
    case 'attack':
      if (!action.attackerId || !target) return null;
      return { type: 'attack', player, attackerId: action.attackerId, target };
    case 'moveUnit':
      if (!action.unitId) return null;
      return null;
    case 'endTurn':
      return { type: 'endTurn', player };
    case 'concede':
      return { type: 'concede', player };
    default:
      return null;
  }
}

// ============================================================
// 预留：供 UI 查询的便捷函数
// ============================================================

export function unitsOf(state: GameState, player: PlayerIndex): Unit[] {
  return playerUnits(state, player);
}

export function createCountermeasureCard(
  state: GameState,
  reg: EngineRegistry,
  owner: PlayerIndex,
  cardId: string,
): CardInstance {
  return createCardInstance(state, cardId, owner, 'created');
}

void damageHQInternal;
void recalcUnit;
void destroyUnitAndTrigger;
void resolveEffectTargets;
void hasKeyword;
