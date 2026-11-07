/**
 * 效果执行器：解释 DSL（EffectOp / CardAbility / PassiveAura），并处理触发连锁。
 * 纯数据驱动：卡牌脚本只描述“做什么”，这里负责“怎么做”。
 */
import type {
  CardAbility,
  CardScript,
  Condition,
  EffectOp,
  EffectTarget,
  EngineRegistry,
  GameEvent,
  GameState,
  IntExpr,
  Line,
  PassiveAura,
  PendingChoice,
  PlayerIndex,
  PlayerSide,
  TargetQuery,
  TargetRef,
  TriggerKind,
  Unit,
  UnitId,
} from '../types';
import {
  addLog,
  allUnits,
  buffUnit,
  canAfford,
  cardDefName,
  createCardInstance,
  damageHQInternal,
  damageUnitInternal,
  discardInstance,
  drawCardInternal,
  gainKredits,
  getDef,
  getScript,
  healUnitInternal,
  leaveBoard,
  lineUnits,
  makeUnit,
  nameOf,
  opponentOf,
  payKredits,
  placeUnit,
  playerUnits,
  randomValue,
  recalcUnit,
  removeUnitFromBoard,
  shuffleInPlace,
  frontlineUsed,
} from '../state';
import {
  getOperationCost,
  resolveQueryTargets,
  resolveSide,
} from '../targeting';
import { hasKeyword, isAirType } from '../keywords';

// ============================================================
// 执行上下文
// ============================================================

export interface TriggerItem {
  trigger: TriggerKind;
  cardId: string;
  owner: PlayerIndex;
  sourceUnitId?: UnitId;
  triggerUnitId?: UnitId;
  anySide?: boolean;
}

export interface ExecCtx {
  state: GameState;
  reg: EngineRegistry;
  events: GameEvent[];
  controller: PlayerIndex;
  sourceUnitId?: UnitId;
  sourceCardId?: string;
  chosen?: TargetRef;
  /** 多目标卡选中的目标列表（非空时 {kind:'chosen'} 会返回整个列表） */
  chosenList?: TargetRef[];
  /** 打出时该牌在手牌中的下标（“最左/最右”类卡用） */
  playHandIndex?: number;
  /** 因需要玩家选择而挂起 */
  suspended: boolean;
  triggerQueue: TriggerItem[];
}

export interface CreateCtxOptions {
  controller: PlayerIndex;
  sourceUnitId?: UnitId;
  sourceCardId?: string;
  chosen?: TargetRef;
  chosenList?: TargetRef[];
  playHandIndex?: number;
}

export function createCtx(
  state: GameState,
  reg: EngineRegistry,
  events: GameEvent[],
  options: CreateCtxOptions,
): ExecCtx {
  return {
    state,
    reg,
    events,
    controller: options.controller,
    sourceUnitId: options.sourceUnitId,
    sourceCardId: options.sourceCardId,
    chosen: options.chosen,
    chosenList: options.chosenList,
    playHandIndex: options.playHandIndex,
    suspended: false,
    triggerQueue: [],
  };
}

// ============================================================
// 表达式求值
// ============================================================

export function resolveInt(ctx: ExecCtx, expr: IntExpr): number {
  if (typeof expr === 'number') return expr;
  switch (expr.kind) {
    case 'count':
      return resolveEffectTargets(ctx, expr.target).length;
    case 'stat': {
      if (expr.of === 'self') {
        const unit = ctx.sourceUnitId ? ctx.state.units[ctx.sourceUnitId] : undefined;
        if (!unit) return 0;
        if (expr.stat === 'attack') return unit.attack;
        if (expr.stat === 'hp') return unit.hp;
        if (expr.stat === 'maxHp') return unit.maxHp;
        if (expr.stat === 'armor' || expr.stat === 'armorValue') return unit.armor;
        return 0;
      }
      const playerIndex =
        expr.of === 'selfHQ' ? ctx.controller : expr.of === 'enemyHQ' ? opponentOf(ctx.controller) : ctx.controller;
      const p = ctx.state.players[playerIndex];
      if (expr.stat === 'kredits') return p.kredits;
      if (expr.stat === 'handSize') return p.hand.length;
      if (expr.stat === 'deckSize') return p.deck.length;
      if (expr.stat === 'attack' || expr.stat === 'hp' || expr.stat === 'maxHp') return p.hq.hp;
      return 0;
    }
    case 'sum': {
      const refs = resolveEffectTargets(ctx, expr.target);
      let total = 0;
      for (const ref of refs) {
        const unit = ref.kind === 'unit' ? ctx.state.units[ref.unitId] : undefined;
        if (!unit) continue;
        total += expr.stat === 'attack' ? unit.attack : unit.hp;
      }
      return total;
    }
    case 'turn':
      return ctx.state.turn;
    case 'tracker':
      return ctx.state.trackers[expr.key] ?? 0;
    case 'calc': {
      const a = resolveInt(ctx, expr.a);
      const b = resolveInt(ctx, expr.b);
      switch (expr.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case 'min':
          return Math.min(a, b);
        case 'max':
          return Math.max(a, b);
        default:
          return a;
      }
    }
    default:
      return 0;
  }
}

export function resolveCondition(ctx: ExecCtx, cond?: Condition): boolean {
  if (!cond) return true;
  switch (cond.kind) {
    case 'always':
      return true;
    case 'not':
      return !resolveCondition(ctx, cond.condition);
    case 'and':
      return cond.conditions.every((c) => resolveCondition(ctx, c));
    case 'or':
      return cond.conditions.some((c) => resolveCondition(ctx, c));
    case 'count': {
      const count = resolveEffectTargets(ctx, cond.target).length;
      const value = resolveInt(ctx, cond.value);
      return compare(count, cond.op, value);
    }
    case 'stat': {
      const value = resolveInt(ctx, {
        kind: 'stat',
        of: cond.of,
        stat: cond.stat,
      });
      return compare(value, cond.op, resolveInt(ctx, cond.value));
    }
    case 'hasKeyword': {
      if (cond.of === 'self') {
        const unit = ctx.sourceUnitId ? ctx.state.units[ctx.sourceUnitId] : undefined;
        return !!unit && hasKeyword(unit, cond.keyword);
      }
      const refs = resolveEffectTargets(ctx, { kind: 'chosen' });
      const unit = refs[0]?.kind === 'unit' ? ctx.state.units[refs[0].unitId] : undefined;
      return !!unit && hasKeyword(unit, cond.keyword);
    }
    case 'ownsFaction': {
      const p = ctx.state.players[ctx.controller];
      return !cond.faction || p.faction === cond.faction || p.allyFaction === cond.faction;
    }
    case 'custom':
      return CUSTOM_CONDITIONS[cond.id]?.(ctx, cond.params ?? {}) ?? true;
    default:
      return true;
  }
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case 'eq':
      return a === b;
    case 'ne':
      return a !== b;
    case 'gt':
      return a > b;
    case 'gte':
      return a >= b;
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
    default:
      return false;
  }
}

// ============================================================
// 目标解析
// ============================================================

function refToUnit(ctx: ExecCtx, ref: TargetRef): Unit | undefined {
  return ref.kind === 'unit' ? ctx.state.units[ref.unitId] : undefined;
}

function pickFromRefs(ctx: ExecCtx, refs: TargetRef[], pick: string, count: number): TargetRef[] {
  if (count <= 0) return [];
  if (pick === 'random') {
    const pool = refs.slice();
    const out: TargetRef[] = [];
    while (out.length < count && pool.length > 0) {
      const idx = Math.floor(randomValue(ctx.state) * pool.length);
      out.push(pool.splice(Math.min(pool.length - 1, idx), 1)[0]);
    }
    return out;
  }
  const scored = refs.slice();
  const score = (ref: TargetRef): number => {
    const unit = refToUnit(ctx, ref);
    if (!unit) return -1;
    switch (pick) {
      case 'highestAttack':
        return unit.attack;
      case 'lowestAttack':
        return -unit.attack;
      case 'highestHp':
        return unit.hp;
      case 'lowestHp':
        return -unit.hp;
      case 'leftmost':
        return -unit.position;
      case 'rightmost':
        return unit.position;
      case 'first':
        return -unit.position;
      case 'last':
        return unit.position;
      default:
        return 0;
    }
  };
  scored.sort((a, b) => score(b) - score(a));
  return scored.slice(0, count);
}

/** 解析效果目标为具体引用列表 */
export function resolveEffectTargets(ctx: ExecCtx, target?: EffectTarget): TargetRef[] {
  if (!target) return [];
  switch (target.kind) {
    case 'self': {
      if (ctx.sourceUnitId && ctx.state.units[ctx.sourceUnitId]) {
        return [{ kind: 'unit', unitId: ctx.sourceUnitId }];
      }
      return [];
    }
    case 'chosen':
      return ctx.chosenList && ctx.chosenList.length > 0
        ? ctx.chosenList
        : ctx.chosen
          ? [ctx.chosen]
          : [];
    case 'hq':
      return resolveSide(ctx.controller, target.side).map((player) => ({ kind: 'hq', player }) as TargetRef);
    case 'query': {
      const query = target as TargetQuery;
      const limitExpr = query.limit;
      let limit: number | undefined;
      if (typeof limitExpr === 'number') limit = limitExpr;
      else if (limitExpr) limit = resolveInt(ctx, limitExpr);
      const opts = {
        chosen: ctx.chosen,
        limit,
        excludeUnitId: query.filter?.excludeSelf ? ctx.sourceUnitId : undefined,
      };
      let refs = resolveQueryTargets(ctx.state, ctx.reg, ctx.controller, { ...query, limit: undefined }, opts);
      const chosenUnitId = ctx.chosen?.kind === 'unit' ? ctx.chosen.unitId : null;
      if (query.filter?.excludeChosen && chosenUnitId) {
        refs = refs.filter((r) => !(r.kind === 'unit' && r.unitId === chosenUnitId));
      }
      if (query.pick) refs = pickFromRefs(ctx, refs, query.pick, limit ?? 1);
      if (limit !== undefined && refs.length > limit) refs = refs.slice(0, limit);
      return refs;
    }
    default:
      return [];
  }
}

// ============================================================
// 基础效果原语
// ============================================================

export function dealDamage(
  ctx: ExecCtx,
  ref: TargetRef,
  amount: number,
  source?: { cardId?: string; unitId?: string; kind?: 'unit' | 'card' },
): void {
  if (amount <= 0 || ctx.state.status === 'finished') return;
  if (ref.kind === 'hq') {
    const dealt = damageHQInternal(ctx.state, ref.player, amount, ctx.events);
    if (dealt > 0) ctx.events.push({ type: 'damage', target: ref, amount: dealt });
    if (source?.unitId) ctx.state.trackers['damageDealt'] = (ctx.state.trackers['damageDealt'] ?? 0) + dealt;
    return;
  }
  if (ref.kind === 'unit') {
    const unit = ctx.state.units[ref.unitId];
    if (!unit) return;
    const sourceKind = source?.kind ?? (source?.unitId ? 'unit' : 'card');
    const { dealt, killed } = damageUnitInternal(ctx.state, ref.unitId, amount, ctx.events, {
      ignoreArmor: sourceKind === 'card',
    });
    if (dealt > 0) {
      ctx.events.push({ type: 'damage', target: ref, amount: dealt });
      enqueueTriggerForUnits(ctx, 'damageDealt', { victimUnitId: ref.unitId });
    }
    if (killed) destroyUnitAndTrigger(ctx, ref.unitId);
  }
}

export function healTarget(ctx: ExecCtx, ref: TargetRef, amount: number): void {
  if (amount <= 0) return;
  if (ref.kind === 'hq') {
    const p = ctx.state.players[ref.player];
    const before = p.hq.hp;
    p.hq.hp = Math.min(p.hq.maxHp, p.hq.hp + amount);
    if (p.hq.hp > before) ctx.events.push({ type: 'heal', target: ref, amount: p.hq.hp - before });
    return;
  }
  if (ref.kind === 'unit') {
    const healed = healUnitInternal(ctx.state, ref.unitId, amount, ctx.events);
    if (healed > 0) {
      ctx.events.push({ type: 'heal', target: ref, amount: healed });
      enqueueTriggerForUnits(ctx, 'healed', { victimUnitId: ref.unitId });
    }
  }
}

export function destroyTarget(ctx: ExecCtx, ref: TargetRef): void {
  if (ref.kind === 'unit') destroyUnitAndTrigger(ctx, ref.unitId);
}

export function destroyUnitAndTrigger(ctx: ExecCtx, unitId: UnitId): void {
  const unit = ctx.state.units[unitId];
  if (!unit) return;
  const { cardId, owner } = unit;
  const watchDraw = unit.trackers.watchDeathDraw ?? 0;
  leaveBoard(ctx.state, unitId);
  ctx.events.push({ type: 'death', unitId });
  addLog(ctx.state, owner, 'death', `${cardDefName(ctx.reg, cardId)} 阵亡`);
  ctx.triggerQueue.push({ trigger: 'death', cardId, owner, triggerUnitId: unitId });
  enqueueTriggerForUnits(ctx, 'unitDestroyed', { victimUnitId: unitId });
  recomputeAuras(ctx.state, ctx.reg);
  for (let i = 0; i < watchDraw; i++) drawCardInternal(ctx.state, owner, ctx.events);
}

function enqueueTriggerForUnits(
  ctx: ExecCtx,
  trigger: TriggerKind,
  opts: { victimUnitId?: UnitId; sourceUnitId?: UnitId; anySide?: boolean } = {},
): void {
  const sourceUnit = opts.sourceUnitId ? ctx.state.units[opts.sourceUnitId] : undefined;
  for (const unit of allUnits(ctx.state)) {
    const script = getScript(ctx.reg, unit.cardId);
    if (!script?.abilities) continue;
    for (const ability of script.abilities) {
      if (ability.trigger !== trigger) continue;
      if (trigger === 'unitDestroyed' || trigger === 'damageDealt') {
        if (!ability.anySide && unit.owner !== ctx.controller) continue;
      }
      ctx.triggerQueue.push({
        trigger,
        cardId: unit.cardId,
        owner: unit.owner,
        sourceUnitId: unit.unitId,
        triggerUnitId: opts.victimUnitId ?? sourceUnit?.unitId,
      });
      break;
    }
  }
}

// ============================================================
// 触发执行
// ============================================================

export function runAbility(
  ctx: ExecCtx,
  ability: CardAbility,
  opts: {
    unitId?: UnitId;
    owner?: PlayerIndex;
    triggerUnitId?: UnitId;
    chosen?: TargetRef;
    chosenList?: TargetRef[];
  } = {},
): void {
  if (ctx.suspended) return;
  const prev = {
    controller: ctx.controller,
    sourceUnitId: ctx.sourceUnitId,
    sourceCardId: ctx.sourceCardId,
    chosen: ctx.chosen,
    chosenList: ctx.chosenList,
  };
  if (opts.owner !== undefined) ctx.controller = opts.owner;
  if (opts.unitId) ctx.sourceUnitId = opts.unitId;
  if (opts.triggerUnitId && !ctx.chosen) {
    const u = ctx.state.units[opts.triggerUnitId];
    if (u) ctx.chosen = { kind: 'unit', unitId: opts.triggerUnitId };
  }
  if (opts.chosen) ctx.chosen = opts.chosen;
  if (opts.chosenList) ctx.chosenList = opts.chosenList;
  if (!resolveCondition(ctx, ability.condition)) {
    ctx.controller = prev.controller;
    ctx.sourceUnitId = prev.sourceUnitId;
    ctx.sourceCardId = prev.sourceCardId;
    ctx.chosen = prev.chosen;
    ctx.chosenList = prev.chosenList;
    return;
  }
  executeEffects(ctx, ability.effects);
  ctx.controller = prev.controller;
  ctx.sourceUnitId = prev.sourceUnitId;
  ctx.sourceCardId = prev.sourceCardId;
  ctx.chosen = prev.chosen;
  ctx.chosenList = prev.chosenList;
}

export function processTriggers(ctx: ExecCtx): void {
  let guard = 0;
  while (ctx.triggerQueue.length > 0 && !ctx.suspended && guard < 400) {
    guard += 1;
    const item = ctx.triggerQueue.shift()!;
    const script = getScript(ctx.reg, item.cardId);
    if (!script?.abilities) continue;
    for (const ability of script.abilities) {
      if (ability.trigger !== item.trigger) continue;
      if (ability.oncePerTurn) {
        const unit = item.sourceUnitId ? ctx.state.units[item.sourceUnitId] : undefined;
        const key = `once:${ability.trigger}:${ability.text ?? ''}`;
        if (unit) {
          if (unit.trackers[key] === ctx.state.turn) continue;
          unit.trackers[key] = ctx.state.turn;
        }
      }
      runAbility(ctx, ability, { unitId: item.sourceUnitId, owner: item.owner, triggerUnitId: item.triggerUnitId });
    }
  }
}

/** 单次事件触发（部署/攻击等），直接执行能力而不入队 */
export function fireUnitTrigger(
  ctx: ExecCtx,
  unit: Unit,
  trigger: TriggerKind,
  opts: { chosen?: TargetRef; triggerUnitId?: UnitId } = {},
): void {
  const script = getScript(ctx.reg, unit.cardId);
  if (!script?.abilities) return;
  for (const ability of script.abilities) {
    if (ability.trigger !== trigger) continue;
    runAbility(ctx, ability, { unitId: unit.unitId, owner: unit.owner, ...opts });
    if (ctx.suspended) return;
  }
}

/** 触发场上（双方）指定归属的单位的某类触发 */
export function fireBoardTriggers(
  ctx: ExecCtx,
  trigger: TriggerKind,
  opts: { owners?: PlayerIndex[]; triggerUnitId?: UnitId } = {},
): void {
  const owners = opts.owners ?? [0, 1];
  for (const unit of allUnits(ctx.state)) {
    if (!owners.includes(unit.owner)) continue;
    const script = getScript(ctx.reg, unit.cardId);
    if (!script?.abilities) continue;
    let matched = false;
    for (const ability of script.abilities) {
      if (ability.trigger !== trigger) continue;
      if (!ability.anySide && unit.owner !== ctx.controller) continue;
      matched = true;
      if (ability.oncePerTurn) {
        const key = `once:${trigger}:${ability.text ?? ''}`;
        if (unit.trackers[key] === ctx.state.turn) continue;
        unit.trackers[key] = ctx.state.turn;
      }
      runAbility(ctx, ability, { unitId: unit.unitId, owner: unit.owner, triggerUnitId: opts.triggerUnitId });
      if (ctx.suspended) return;
    }
    void matched;
  }
}

// ============================================================
// 效果主循环
// ============================================================

export function executeEffects(ctx: ExecCtx, ops: EffectOp[]): void {
  for (let i = 0; i < ops.length; i++) {
    if (ctx.suspended) return;
    const op = ops[i];
    const suspended = executeOp(ctx, op, ops.slice(i + 1));
    if (suspended || ctx.suspended) {
      ctx.suspended = true;
      return;
    }
    processTriggers(ctx);
  }
}

function executeOp(ctx: ExecCtx, op: EffectOp, remaining: EffectOp[]): boolean {
  const state = ctx.state;
  switch (op.op) {
    case 'damage': {
      const amount = resolveInt(ctx, op.amount);
      for (const ref of resolveEffectTargets(ctx, op.target)) dealDamage(ctx, ref, amount);
      return false;
    }
    case 'heal': {
      const amount = resolveInt(ctx, op.amount);
      for (const ref of resolveEffectTargets(ctx, op.target)) healTarget(ctx, ref, amount);
      return false;
    }
    case 'buff': {
      const attack = op.attack === undefined ? 0 : resolveInt(ctx, op.attack);
      const hp = op.hp === undefined ? 0 : resolveInt(ctx, op.hp);
      const permanent = op.permanent !== false;
      for (const ref of resolveEffectTargets(ctx, op.target)) {
        const unit = refToUnit(ctx, ref);
        if (!unit) continue;
        buffUnit(unit, attack, hp, permanent);
      }
      return false;
    }
    case 'setStats': {
      for (const ref of resolveEffectTargets(ctx, op.target)) {
        const unit = refToUnit(ctx, ref);
        if (!unit) continue;
        if (op.attack !== undefined) unit.baseAttack = op.attack;
        if (op.hp !== undefined) unit.baseHp = op.hp;
        recalcUnit(unit);
      }
      return false;
    }
    case 'destroy': {
      for (const ref of resolveEffectTargets(ctx, op.target)) destroyTarget(ctx, ref);
      return false;
    }
    case 'silence': {
      for (const ref of resolveEffectTargets(ctx, op.target)) {
        const unit = refToUnit(ctx, ref);
        if (unit) unit.silenced = true;
      }
      return false;
    }
    case 'pin': {
      for (const ref of resolveEffectTargets(ctx, op.target)) {
        const unit = refToUnit(ctx, ref);
        if (unit) unit.statuses.pinned = true;
      }
      return false;
    }
    case 'unpin': {
      for (const ref of resolveEffectTargets(ctx, op.target)) {
        const unit = refToUnit(ctx, ref);
        if (unit) unit.statuses.pinned = false;
      }
      return false;
    }
    case 'draw': {
      const count = resolveInt(ctx, op.count);
      const targetPlayer = op.side === 'self' ? ctx.controller : opponentOf(ctx.controller);
      for (let i = 0; i < count; i++) drawCardInternal(state, targetPlayer, ctx.events);
      return false;
    }
    case 'discard': {
      const count = resolveInt(ctx, op.count);
      const targetPlayer = op.side === 'self' ? ctx.controller : opponentOf(ctx.controller);
      const hand = state.players[targetPlayer].hand;
      for (let i = 0; i < count && hand.length > 0; i++) {
        const idx = op.random === false ? 0 : Math.floor(randomValue(state) * hand.length);
        const card = hand.splice(Math.min(hand.length - 1, idx), 1)[0];
        state.players[targetPlayer].discard.push(card);
      }
      return false;
    }
    case 'mill': {
      const count = resolveInt(ctx, op.count);
      const targetPlayer = op.side === 'self' ? ctx.controller : opponentOf(ctx.controller);
      const p = state.players[targetPlayer];
      for (let i = 0; i < count && p.deck.length > 0; i++) {
        const card = p.deck.shift()!;
        p.discard.push(card);
      }
      return false;
    }
    case 'gainKredits': {
      const targetPlayer = op.side === 'self' ? ctx.controller : opponentOf(ctx.controller);
      gainKredits(state, targetPlayer, resolveInt(ctx, op.amount), !!op.permanent);
      return false;
    }
    case 'setKredits': {
      const targetPlayer = op.side === 'self' ? ctx.controller : opponentOf(ctx.controller);
      state.players[targetPlayer].kredits = Math.max(0, resolveInt(ctx, op.value));
      return false;
    }
    case 'summon': {
      const owner = op.side === 'self' ? ctx.controller : opponentOf(ctx.controller);
      const cardIds = op.cardIds ?? (op.cardId ? [op.cardId] : []);
      const count = op.count !== undefined ? resolveInt(ctx, op.count) : 1;
      for (let n = 0; n < count; n++) {
        const cardId = cardIds[n % Math.max(1, cardIds.length)];
        if (!cardId) continue;
        const def = getDef(ctx.reg, cardId);
        if (!def) continue;
        const targetLine = bestLineForSummon(ctx, owner, op.line ?? 'support');
        if (!targetLine) break;
        const unit = makeUnit(state, ctx.reg, owner, cardId, targetLine, { token: true, ready: true });
        if (!unit) continue;
        placeUnit(state, unit, targetLine);
        ctx.events.push({ type: 'deploy', unitId: unit.unitId, cardId, owner, line: targetLine });
      }
      recomputeAuras(state, ctx.reg);
      return false;
    }
    case 'addCardToHand': {
      const owner = op.side === 'self' ? ctx.controller : opponentOf(ctx.controller);
      const count = op.count !== undefined ? resolveInt(ctx, op.count) : 1;
      for (let n = 0; n < count; n++) {
        const instance = createCardInstance(state, op.cardId, owner, 'created');
        state.players[owner].hand.push(instance);
      }
      return false;
    }
    case 'transform': {
      const def = getDef(ctx.reg, op.cardId);
      if (!def) return false;
      for (const ref of resolveEffectTargets(ctx, op.target)) {
        const unit = refToUnit(ctx, ref);
        if (!unit) continue;
        unit.cardId = op.cardId;
        unit.baseAttack = def.attack;
        unit.baseHp = def.defense;
        unit.buffAttack = 0;
        unit.buffHp = 0;
        unit.maxHp = def.defense;
        unit.hp = def.defense;
        recalcUnit(unit);
        recomputeAuras(state, ctx.reg);
      }
      return false;
    }
    case 'moveUnit': {
      for (const ref of resolveEffectTargets(ctx, op.target)) {
        const unit = refToUnit(ctx, ref);
        if (!unit) continue;
        moveUnitToLine(ctx, unit, op.toLine);
      }
      return false;
    }
    case 'grantKeyword': {
      for (const ref of resolveEffectTargets(ctx, op.target)) {
        const unit = refToUnit(ctx, ref);
        if (!unit) continue;
        if (!unit.auraKeywords.includes(op.keyword)) unit.auraKeywords.push(op.keyword);
        recalcUnit(unit);
      }
      return false;
    }
    case 'removeKeyword': {
      for (const ref of resolveEffectTargets(ctx, op.target)) {
        const unit = refToUnit(ctx, ref);
        if (!unit) continue;
        const id = op.keyword;
        unit.baseKeywords = unit.baseKeywords.filter((k) => !k.startsWith(id));
        unit.auraKeywords = unit.auraKeywords.filter((k) => !k.startsWith(id));
        recalcUnit(unit);
      }
      return false;
    }
    case 'conditional': {
      const branch = resolveCondition(ctx, op.condition) ? op.then : op.else;
      if (branch) executeEffects(ctx, branch);
      return ctx.suspended;
    }
    case 'choice': {
      const options = op.options.filter((o) => resolveCondition(ctx, o.condition));
      if (options.length === 0) return false;
      const choice: PendingChoice = {
        choiceId: `choice${state.nextId + 1}`,
        player: ctx.controller,
        prompt: op.prompt,
        mode: 'option',
        options: options.map((o, idx) => ({ id: String(idx), label: o.label })),
        context: {
          remaining: remaining as unknown as Record<string, unknown>[],
          controller: ctx.controller,
          sourceUnitId: ctx.sourceUnitId ?? null,
          sourceCardId: ctx.sourceCardId ?? null,
          chosen: ctx.chosen ?? null,
          branchOptions: options.map((o) => ({ effects: o.effects })) as unknown as Record<string, unknown>[],
        },
      };
      state.pendingChoice = choice;
      ctx.events.push({ type: 'choiceRequested', choice });
      return true;
    }
    case 'random': {
      if (op.options.length === 0) return false;
      const total = op.options.reduce((sum, o) => sum + Math.max(0, o.weight), 0);
      let roll = randomValue(state) * Math.max(total, 1);
      let picked = op.options[0];
      for (const option of op.options) {
        roll -= Math.max(0, option.weight);
        if (roll <= 0) {
          picked = option;
          break;
        }
      }
      executeEffects(ctx, picked.effects);
      return ctx.suspended;
    }
    case 'repeat': {
      const times = resolveInt(ctx, op.times);
      for (let n = 0; n < times; n++) {
        executeEffects(ctx, op.effects);
        if (ctx.suspended) return true;
      }
      return false;
    }
    case 'custom': {
      const handler = CUSTOM_HANDLERS[op.id];
      if (handler) {
        handler(ctx, op.params ?? {});
        return ctx.suspended;
      }
      const warnKey = `customWarned:${op.id}`;
      if (!state.trackers[warnKey]) {
        state.trackers[warnKey] = 1;
        console.warn(`[fards] 未实现的 custom 原语：${op.id}`);
      }
      return false;
    }
    default:
      return false;
  }
}

function pickLineForSummon(state: GameState, owner: PlayerIndex, preferred: Line): Line {
  const cap = preferred === 'frontline' ? state.config.frontlineSlots : state.config.supportSlots;
  if (state.players[owner][preferred].length < cap) return preferred;
  return preferred === 'frontline' ? 'support' : 'frontline';
}

/** 移动单位（效果用，不检查费用） */
export function moveUnitToLine(ctx: ExecCtx, unit: Unit, toLine: Line): void {
  const state = ctx.state;
  if (unit.line === toLine) return;
  const fromLine = unit.line;
  removeUnitFromBoard(state, unit.unitId);
  // moveUnitToLine 是“移出再放入”，需要把单位重新登记回 state.units
  state.units[unit.unitId] = unit;
  const cap =
    toLine === 'frontline'
      ? state.config.frontlineSlots - frontlineUsed(state)
      : state.config.supportSlots - state.players[unit.owner].support.length;
  if (cap <= 0) {
    // 放不下则回到原线
    placeUnit(state, unit, fromLine);
    return;
  }
  placeUnit(state, unit, toLine);
  ctx.events.push({ type: 'log', entry: addLog(state, unit.owner, 'effect', `${nameOf(unit.cardId)} 移至 ${toLine === 'frontline' ? '前线' : '支援线'}`) });
  recomputeAuras(state, ctx.reg);
  enqueueTriggerForUnits(ctx, 'unitMoved', { sourceUnitId: unit.unitId });
}

// ============================================================
// 光环（被动）重算
// ============================================================

export function recomputeAuras(state: GameState, reg: EngineRegistry): void {
  const units = allUnits(state);
  for (const unit of units) {
    unit.auraAttack = 0;
    unit.auraHp = 0;
    unit.auraKeywords = [];
    unit.trackers.armorBonus = 0;
  }
  for (const source of units) {
    if (source.silenced) continue;
    const script = getScript(reg, source.cardId);
    if (!script?.passives?.length) continue;
    for (const aura of script.passives) {
      applyAura(state, reg, source, aura);
    }
  }
  for (const unit of units) recalcUnit(unit);
}

function applyAura(state: GameState, reg: EngineRegistry, source: Unit, aura: PassiveAura): void {
  if (!aura.affect || aura.affect.kind !== 'query') return;
  const query = aura.affect as TargetQuery;
  const refs = resolveQueryTargets(state, reg, source.owner, { ...query, limit: undefined }, {});
  for (const ref of refs) {
    if (ref.kind !== 'unit') continue;
    const unit = state.units[ref.unitId];
    if (!unit) continue;
    if (aura.attackDelta) unit.auraAttack += aura.attackDelta;
    if (aura.hpDelta) unit.auraHp += aura.hpDelta;
    if (aura.armorDelta) unit.trackers.armorBonus = (unit.trackers.armorBonus ?? 0) + aura.armorDelta;
    for (const kw of aura.grantKeywords ?? []) {
      if (!unit.auraKeywords.includes(kw)) unit.auraKeywords.push(kw);
    }
    for (const kw of aura.removeKeywords ?? []) {
      unit.auraKeywords = unit.auraKeywords.filter((k) => !k.startsWith(kw));
    }
  }
}

// ============================================================
// 自定义处理器（复杂卡牌用；card-smith 可在此扩）
// ============================================================

export type CustomHandler = (ctx: ExecCtx, params: Record<string, unknown>) => void;

export const CUSTOM_HANDLERS: Record<string, CustomHandler> = {
  /** 抽牌（可带阵营过滤） */
  drawFaction: (ctx, params) => {
    const faction = typeof params.faction === 'string' ? params.faction : undefined;
    const count = typeof params.count === 'number' ? params.count : 1;
    const p = ctx.state.players[ctx.controller];
    let drawn = 0;
    for (let i = 0; i < count; i++) {
      if (!faction) {
        drawCardInternal(ctx.state, ctx.controller, ctx.events);
        continue;
      }
      const idx = p.deck.findIndex((c) => {
        const def = getDef(ctx.reg, c.cardId);
        return def?.faction === faction;
      });
      if (idx < 0) continue;
      const card = p.deck.splice(idx, 1)[0];
      if (p.hand.length < ctx.state.config.handLimit) p.hand.push(card);
      else p.discard.push(card);
      drawn += 1;
    }
    void drawn;
  },
  /** 治疗总部 */
  healHQ: (ctx, params) => {
    const amount = typeof params.amount === 'number' ? params.amount : 1;
    healTarget(ctx, { kind: 'hq', player: ctx.controller }, amount);
  },
  /** 让双方抽牌 */
  drawBoth: (ctx, params) => {
    const count = typeof params.count === 'number' ? params.count : 1;
    drawCardInternal(ctx.state, 0, ctx.events);
    drawCardInternal(ctx.state, 1, ctx.events);
    void count;
  },
};

export const CUSTOM_CONDITIONS: Record<
  string,
  (ctx: ExecCtx, params: Record<string, unknown>) => boolean
> = {
  /** 控制前线 */
  controlsFrontline: (ctx) => ctx.state.frontlineController === ctx.controller,
  /** 本回合使用过指令 */
  playedOrderThisTurn: (ctx) => (ctx.state.players[ctx.controller].trackers['ordersPlayedThisTurn'] ?? 0) > 0,
};

// ============================================================
// 追加：卡牌脚本 custom 原语（card-smith 约定，Lead 实现）
// 约定：params 使用 camelCase；side 为 'self' | 'enemy'（相对效果控制者）
// ============================================================

function pNum(value: unknown, fallback = 1): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function enemiesOf(ctx: ExecCtx): Unit[] {
  return playerUnits(ctx.state, opponentOf(ctx.controller));
}

function alliesOf(ctx: ExecCtx): Unit[] {
  return playerUnits(ctx.state, ctx.controller);
}

function sideOf(ctx: ExecCtx, side: string): PlayerIndex {
  return side === 'enemy' ? opponentOf(ctx.controller) : ctx.controller;
}

function queryUnits(ctx: ExecCtx, params: Record<string, unknown>): Unit[] {
  const side = pStr(params.side, 'any') as 'self' | 'enemy' | 'any';
  const line = pStr(params.line, 'any') as 'frontline' | 'support' | 'any';
  const type = pStr(params.type, '');
  const faction = pStr(params.faction, '');
  const refs = resolveQueryTargets(ctx.state, ctx.reg, ctx.controller, {
    kind: 'query',
    side,
    line,
    filter: {
      type: type ? type : undefined,
      faction: faction ? faction : undefined,
      maxCost: params.maxCost !== undefined ? pNum(params.maxCost) : undefined,
      minCost: params.minCost !== undefined ? pNum(params.minCost) : undefined,
    },
  });
  return refs
    .map((ref) => (ref.kind === 'unit' ? ctx.state.units[ref.unitId] : undefined))
    .filter((u): u is Unit => !!u);
}

function chosenUnit(ctx: ExecCtx): Unit | undefined {
  const ref = ctx.chosen;
  return ref && ref.kind === 'unit' ? ctx.state.units[ref.unitId] : undefined;
}

function returnUnitToHand(ctx: ExecCtx, unit: Unit): void {
  const state = ctx.state;
  removeUnitFromBoard(state, unit.unitId);
  const instance = state.cards[unit.instanceId];
  if (!instance || unit.token) return;
  const owner = state.players[unit.owner];
  if (owner.hand.length < state.config.handLimit) owner.hand.push(instance);
  else owner.discard.push(instance);
  ctx.events.push({ type: 'effect', text: `${nameOf(unit.cardId)} 返回手牌` });
  recomputeAuras(state, ctx.reg);
}

function returnUnitToDeckTop(ctx: ExecCtx, unit: Unit): void {
  const state = ctx.state;
  removeUnitFromBoard(state, unit.unitId);
  const instance = state.cards[unit.instanceId];
  if (!instance || unit.token) return;
  state.players[unit.owner].deck.unshift(instance);
  recomputeAuras(state, ctx.reg);
}

Object.assign(CUSTOM_HANDLERS, {
  /** 总部获得 N 点防御力（最大生命 +N，同时回复 N） */
  gainHqDefense: (ctx: ExecCtx, params) => {
    const side = sideOf(ctx, pStr(params.side, 'self'));
    const amount = pNum(params.amount, 1);
    const hq = ctx.state.players[side].hq;
    hq.maxHp += amount;
    hq.hp += amount;
    ctx.events.push({ type: 'heal', target: { kind: 'hq', player: side }, amount });
  },

  /** 单位区域移动：返回手牌 / 返回卡组顶 / 撤退 */
  moveUnitZone: (ctx: ExecCtx, params) => {
    const of = pStr(params.of, 'self');
    const to = pStr(params.to, 'hand');
    const count = pNum(params.count, 1);
    let units: Unit[] = [];
    if (of === 'self') {
      const u = ctx.sourceUnitId ? ctx.state.units[ctx.sourceUnitId] : undefined;
      if (u) units = [u];
    } else if (of === 'chosen') {
      const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
      units = refs
        .map((r) => (r.kind === 'unit' ? ctx.state.units[r.unitId] : undefined))
        .filter((u): u is Unit => !!u);
    } else if (of === 'adjacent') {
      const base = chosenUnit(ctx);
      if (base) {
        const lineArr = ctx.state.players[base.owner][base.line];
        const idx = lineArr.indexOf(base.unitId);
        units = [lineArr[idx - 1], lineArr[idx + 1]]
          .filter((id): id is string => !!id)
          .map((id) => ctx.state.units[id])
          .filter((u): u is Unit => !!u);
      }
    } else {
      units = queryUnits(ctx, params);
    }
    units = units.slice(0, Math.max(1, count));
    for (const unit of units) {
      if (to === 'deckTop') returnUnitToDeckTop(ctx, unit);
      else returnUnitToHand(ctx, unit);
    }
  },

  /** 对 1 个敌方目标（可含总部）造成伤害；对总部造成伤害时可抽牌 */
  damageAnyTarget: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 1);
    const includeHQ = Boolean(params.includeHQ);
    const drawIfHQ = pNum(params.drawIfHQ, 0);
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    const enemy = opponentOf(ctx.controller);
    if (refs.length > 0) {
      for (const ref of refs) {
        if (ref.kind === 'hq' && !includeHQ) continue;
        dealDamage(ctx, ref, amount);
        if (ref.kind === 'hq' && drawIfHQ > 0) {
          for (let i = 0; i < drawIfHQ; i++) drawCardInternal(ctx.state, ctx.controller, ctx.events);
        }
      }
      return;
    }
    const candidates: TargetRef[] = enemiesOf(ctx).map((u) => ({ kind: 'unit', unitId: u.unitId }) as TargetRef);
    if (includeHQ) candidates.push({ kind: 'hq', player: enemy });
    if (candidates.length === 0) return;
    const picked = candidates[Math.floor(randomValue(ctx.state) * candidates.length)];
    dealDamage(ctx, picked, amount);
  },

  /** 造成 N 点伤害，随机分配至敌方所有目标 */
  damageSplitRandom: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 1);
    const includeHQ = Boolean(params.includeHQ);
    const enemy = opponentOf(ctx.controller);
    for (let i = 0; i < amount; i++) {
      const candidates: TargetRef[] = enemiesOf(ctx).map((u) => ({ kind: 'unit', unitId: u.unitId }) as TargetRef);
      if (includeHQ) candidates.push({ kind: 'hq', player: enemy });
      if (candidates.length === 0) return;
      const picked = candidates[Math.floor(randomValue(ctx.state) * candidates.length)];
      dealDamage(ctx, picked, 1);
      if (ctx.state.status === 'finished') return;
    }
  },

  /** 对所有敌方单位造成 N 点伤害；若有单位被消灭则重复 */
  damageRepeatWhileKill: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 1);
    for (let round = 0; round < 8; round++) {
      const before = enemiesOf(ctx).length;
      for (const unit of enemiesOf(ctx)) dealDamage(ctx, { kind: 'unit', unitId: unit.unitId }, amount);
      const after = enemiesOf(ctx).length;
      if (after >= before) return;
    }
  },

  /** 抽指定类型的牌 */
  drawByType: (ctx: ExecCtx, params) => {
    const type = pStr(params.type);
    const count = pNum(params.count, 1);
    const p = ctx.state.players[ctx.controller];
    for (let n = 0; n < count && p.deck.length > 0; n++) {
      const idx = p.deck.findIndex((c) => (getDef(ctx.reg, c.cardId)?.type ?? '') === type);
      const card = idx >= 0 ? p.deck.splice(idx, 1)[0] : p.deck.shift()!;
      if (p.hand.length < ctx.state.config.handLimit) p.hand.push(card);
      else p.discard.push(card);
    }
  },

  /** 抽牌直到手牌数不少于对手 */
  drawUntilHandSizeMatchesEnemy: (ctx: ExecCtx) => {
    const me = ctx.state.players[ctx.controller];
    const enemy = ctx.state.players[opponentOf(ctx.controller)];
    let guard = 0;
    while (me.hand.length < enemy.hand.length && me.deck.length > 0 && guard++ < 10) {
      drawCardInternal(ctx.state, ctx.controller, ctx.events);
    }
  },

  /** 每有一种不同类型的友方单位，抽 1 张牌 */
  drawPerDistinctUnitType: (ctx: ExecCtx) => {
    const types = new Set(alliesOf(ctx).map((u) => getDef(ctx.reg, u.cardId)?.type ?? ''));
    for (let i = 0; i < types.size; i++) drawCardInternal(ctx.state, ctx.controller, ctx.events);
  },

  /** 按“攻击+生命之和”筛选并消灭 */
  destroyUnitByStatSum: (ctx: ExecCtx, params) => {
    const side = pStr(params.side, 'enemy');
    const sum = pNum(params.sum, 0);
    const op = pStr(params.compare, 'lte');
    const count = pNum(params.count, 1);
    const pool = (side === 'enemy' ? enemiesOf(ctx) : alliesOf(ctx)).filter((u) => {
      const value = u.attack + u.hp;
      if (op === 'gte') return value >= sum;
      if (op === 'eq') return value === sum;
      if (op === 'lt') return value < sum;
      if (op === 'gt') return value > sum;
      return value <= sum;
    });
    pool.sort((a, b) => b.attack + b.hp - (a.attack + a.hp));
    for (const unit of pool.slice(0, Math.max(1, count))) {
      destroyUnitAndTrigger(ctx, unit.unitId);
    }
  },

  /** 将手牌放回卡组顶 */
  returnHandCardToDeckTop: (ctx: ExecCtx, params) => {
    const p = ctx.state.players[ctx.controller];
    const count = pNum(params.count, 1);
    for (let i = 0; i < count && p.hand.length > 0; i++) {
      const card = p.hand.shift()!;
      p.deck.unshift(card);
    }
  },

  /** 将敌方手牌放回其卡组顶 */
  enemyHandCardToDeckTop: (ctx: ExecCtx, params) => {
    const enemy = ctx.state.players[opponentOf(ctx.controller)];
    const count = pNum(params.count, 1);
    for (let i = 0; i < count && enemy.hand.length > 0; i++) {
      const idx = params.random === false ? 0 : Math.floor(randomValue(ctx.state) * enemy.hand.length);
      const card = enemy.hand.splice(Math.min(enemy.hand.length - 1, idx), 1)[0];
      enemy.deck.unshift(card);
    }
  },

  /** 给卡组顶的单位牌加 buff（简化：直接修改卡组中该卡的 def 引用副本不可变，改为记录玩家 buff 池） */
  buffDeckTopUnit: (ctx: ExecCtx, params) => {
    const p = ctx.state.players[ctx.controller];
    const idx = p.deck.findIndex((c) => {
      const def = getDef(ctx.reg, c.cardId);
      return def && def.type !== 'order' && def.type !== 'countermeasure';
    });
    if (idx < 0) return;
    const card = p.deck[idx];
    const key = `buffOnDeploy:${card.instanceId}`;
    p.trackers[`${key}:attack`] = pNum(params.attack, 0);
    p.trackers[`${key}:hp`] = pNum(params.hp, 0);
  },

  /** 按“攻击+生命之和”条件召唤单位 */
  summonByStatSum: (ctx: ExecCtx, params) => {
    const side = pStr(params.side, 'self');
    const owner = sideOf(ctx, side);
    const count = pNum(params.count, 1);
    const stat = pStr(params.stat, 'cost');
    const sum = pNum(params.sum, 0);
    const faction = pStr(params.faction, '');
    const type = pStr(params.type, '');
    const line = (pStr(params.line, 'support') as 'frontline' | 'support');
    const defs = Object.values(ctx.reg.cardDefs).filter((def) => {
      if (def.type === 'order' || def.type === 'countermeasure') return false;
      if (faction && def.faction !== faction) return false;
      if (type && def.type !== type) return false;
      const value = stat === 'attack' ? def.attack : stat === 'defense' ? def.defense : def.attack + def.defense;
      return value <= sum;
    });
    for (let n = 0; n < count && defs.length > 0; n++) {
      const targetLine = bestLineForSummon(ctx, owner, line);
      if (!targetLine) return;
      const def = defs[Math.floor(randomValue(ctx.state) * defs.length)];
      const unit = makeUnit(ctx.state, ctx.reg, owner, def.cardId, targetLine, { token: true, ready: true });
      if (!unit) continue;
      placeUnit(ctx.state, unit, targetLine);
      ctx.events.push({ type: 'deploy', unitId: unit.unitId, cardId: def.cardId, owner, line: targetLine });
    }
    recomputeAuras(ctx.state, ctx.reg);
  },

  /** 消灭花费奇偶性匹配的单位 */
  destroyUnitsByCostParity: (ctx: ExecCtx, params) => {
    const parity = pStr(params.parity, 'odd');
    for (const unit of [...alliesOf(ctx), ...enemiesOf(ctx)]) {
      const cost = getDef(ctx.reg, unit.cardId)?.kredits ?? 0;
      const isOdd = cost % 2 === 1;
      if ((parity === 'odd' && isOdd) || (parity !== 'odd' && !isOdd)) {
        destroyUnitAndTrigger(ctx, unit.unitId);
      }
    }
  },

  /** 给某阵营（可限类型）友方单位加 buff */
  buffFactionUnits: (ctx: ExecCtx, params) => {
    const faction = pStr(params.faction, '');
    const type = pStr(params.type, '');
    const attack = pNum(params.attack, 0);
    const hp = pNum(params.hp, 0);
    for (const unit of alliesOf(ctx)) {
      const def = getDef(ctx.reg, unit.cardId);
      if (faction && def?.faction !== faction) continue;
      if (type && def?.type !== type) continue;
      buffUnit(unit, attack, hp, true);
    }
  },

  /** 监听指定单位死亡后抽牌 */
  watchChosenDeathDraw: (ctx: ExecCtx, params) => {
    const count = pNum(params.count, 1);
    for (const ref of ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : [])) {
      if (ref.kind !== 'unit') continue;
      const unit = ctx.state.units[ref.unitId];
      if (unit) unit.trackers.watchDeathDraw = (unit.trackers.watchDeathDraw ?? 0) + count;
    }
  },

  /** 消灭攻击者（反制用；chosen 为攻击者） */
  destroyAttacker: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    if (ref && ref.kind === 'unit' && ctx.state.units[ref.unitId]) destroyUnitAndTrigger(ctx, ref.unitId);
  },

  /** 额外获得指挥点槽 */
  gainKreditSlots: (ctx: ExecCtx, params) => {
    const side = sideOf(ctx, pStr(params.side, 'self'));
    const amount = pNum(params.amount, 1);
    const p = ctx.state.players[side];
    p.maxKredits = Math.min(ctx.state.config.kreditCap, p.maxKredits + amount);
    p.kredits = Math.min(p.maxKredits, p.kredits + amount);
  },

  /** 改变花费（手牌/卡组中的卡） */
  modifyCost: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 1);
    const target = pStr(params.target, 'handAll');
    const p = ctx.state.players[ctx.controller];
    const apply = (key: string) => {
      p.trackers[key] = (p.trackers[key] ?? 0) + amount;
    };
    if (target === 'cardId') apply(`costDiscount:card:${pStr(params.cardId)}`);
    else if (target === 'faction') apply(`costDiscount:faction:${pStr(params.faction)}`);
    else if (target === 'type') apply(`costDiscount:type:${pStr(params.type)}`);
    else if (target === 'parity') apply(`costDiscount:parity:${pStr(params.parity, 'odd')}`);
    else apply('costDiscount:all');
  },

  /** 强制与目标单位战斗（双方互相造成攻击力伤害） */
  forcedFight: (ctx: ExecCtx) => {
    const target = chosenUnit(ctx);
    const self = ctx.sourceUnitId ? ctx.state.units[ctx.sourceUnitId] : undefined;
    if (!target || !self) return;
    const selfAtk = self.attack;
    const targetAtk = target.attack;
    dealDamage(ctx, { kind: 'unit', unitId: target.unitId }, selfAtk);
    if (ctx.state.units[self.unitId]) dealDamage(ctx, { kind: 'unit', unitId: self.unitId }, targetAtk);
  },

  /** 移除出对局（不进弃牌堆） */
  removeFromGame: (ctx: ExecCtx) => {
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    for (const ref of refs) {
      if (ref.kind !== 'unit') continue;
      const unit = leaveBoard(ctx.state, ref.unitId);
      if (!unit) continue;
      const p = ctx.state.players[unit.owner];
      p.discard = p.discard.filter((c) => c.instanceId !== unit.instanceId);
      recomputeAuras(ctx.state, ctx.reg);
    }
  },

  /** 复制单位（到手牌/支援线/前线） */
  copyCard: (ctx: ExecCtx, params) => {
    const to = pStr(params.to, 'hand');
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    const sourceRef = refs[0] ?? (ctx.sourceUnitId ? { kind: 'unit', unitId: ctx.sourceUnitId } : undefined);
    if (!sourceRef || sourceRef.kind !== 'unit') return;
    const unit = ctx.state.units[sourceRef.unitId];
    if (!unit) return;
    if (to === 'hand') {
      const instance = createCardInstance(ctx.state, unit.cardId, ctx.controller, 'created');
      ctx.state.players[ctx.controller].hand.push(instance);
      return;
    }
    const line = to === 'frontline' ? 'frontline' : 'support';
    const targetLine = bestLineForSummon(ctx, ctx.controller, line);
    if (!targetLine) return;
    const copy = makeUnit(ctx.state, ctx.reg, ctx.controller, unit.cardId, targetLine, { token: true, ready: true });
    if (copy) {
      placeUnit(ctx.state, copy, targetLine);
      recomputeAuras(ctx.state, ctx.reg);
    }
  },

  /** 限制对手下回合的行动 */
  restrictAction: (ctx: ExecCtx, params) => {
    const action = pStr(params.action, 'deploy');
    const scope = pStr(params.scope, 'enemyNextTurn');
    if (scope === 'enemyNextTurn') {
      const enemy = ctx.state.players[opponentOf(ctx.controller)];
      enemy.trackers[`restrict:${action}:untilTurn`] = ctx.state.turn + 1;
    } else {
      const me = ctx.state.players[ctx.controller];
      me.trackers[`restrict:${action}:untilTurn`] = ctx.state.turn + 1;
    }
  },

  /** 情报/预报：记录可见信息（简化：日志） */
  revealIntel: (ctx: ExecCtx, params) => {
    const count = pNum(params.count, 1);
    const enemy = ctx.state.players[opponentOf(ctx.controller)];
    const visible = enemy.hand.slice(0, count).map((c) => cardDefName(ctx.reg, c.cardId));
    addLog(ctx.state, ctx.controller, 'effect', `情报：${visible.length ? visible.join('、') : '无手牌'}`);
    ctx.events.push({ type: 'effect', text: `情报 ${count}` });
  },

  /** 从卡池开发一张牌到手牌 */
  discoverFrom: (ctx: ExecCtx, params) => {
    const faction = pStr(params.faction, '');
    const type = pStr(params.type, '');
    const maxCost = params.maxCost !== undefined ? pNum(params.maxCost) : 99;
    const pool = Object.values(ctx.reg.cardDefs).filter(
      (def) =>
        (!faction || def.faction === faction) &&
        (!type || def.type === type) &&
        def.kredits <= maxCost &&
        def.type !== 'countermeasure',
    );
    if (pool.length === 0) return;
    const def = pool[Math.floor(randomValue(ctx.state) * pool.length)];
    const instance = createCardInstance(ctx.state, def.cardId, ctx.controller, 'created');
    ctx.state.players[ctx.controller].hand.push(instance);
    addLog(ctx.state, ctx.controller, 'effect', `开发：${def.nameZh}`);
  },

  /** 升为老兵形态 */
  upgradeVeteran: (ctx: ExecCtx, params) => {
    const cardId = pStr(params.cardId);
    const def = cardId ? getDef(ctx.reg, cardId) : undefined;
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    const unitRef = refs.find((r) => r.kind === 'unit') ??
      (ctx.sourceUnitId ? ({ kind: 'unit', unitId: ctx.sourceUnitId } as TargetRef) : undefined);
    if (!def || !unitRef || unitRef.kind !== 'unit') return;
    const unit = ctx.state.units[unitRef.unitId];
    if (!unit) return;
    unit.cardId = cardId;
    unit.baseAttack = def.attack;
    unit.baseHp = def.defense;
    unit.buffAttack = 0;
    unit.buffHp = 0;
    unit.baseKeywords = normalizeUnitKeywords(ctx.reg, cardId, def.attributes);
    unit.maxHp = def.defense;
    unit.hp = def.defense;
    recalcUnit(unit);
    recomputeAuras(ctx.state, ctx.reg);
    ctx.events.push({ type: 'effect', text: `${def.nameZh} 升级为老兵` });
  },

  /** 额外行动（重置一次攻击） */
  extraAction: (ctx: ExecCtx) => {
    const ref = ctx.chosen ?? (ctx.sourceUnitId ? { kind: 'unit', unitId: ctx.sourceUnitId } : undefined);
    if (ref && ref.kind === 'unit') {
      const unit = ctx.state.units[ref.unitId];
      if (unit) unit.attacksUsed = Math.max(0, unit.attacksUsed - 1);
    }
  },

  /** 夺取控制权 */
  takeControl: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    if (!ref || ref.kind !== 'unit') return;
    const unit = ctx.state.units[ref.unitId];
    if (!unit) return;
    const newOwner = ctx.controller;
    if (!lineHasSpace(ctx, newOwner, unit.line) && unit.line === 'support') return;
    removeUnitFromBoard(ctx.state, unit.unitId);
    ctx.state.units[unit.unitId] = unit;
    unit.owner = newOwner;
    const line = unit.line;
    placeUnit(ctx.state, unit, line);
    unit.attacksUsed = unit.maxAttacks;
    recomputeAuras(ctx.state, ctx.reg);
  },

  /** 向敌方卡组加入卡牌 */
  addCardToEnemyDeck: (ctx: ExecCtx, params) => {
    const count = pNum(params.count, 1);
    const cardId = pStr(params.cardId);
    const enemy = ctx.state.players[opponentOf(ctx.controller)];
    for (let n = 0; n < count; n++) {
      let id = cardId;
      if (!id) {
        const pool = Object.values(ctx.reg.cardDefs).filter((d) => d.type !== 'countermeasure');
        id = pool[Math.floor(randomValue(ctx.state) * pool.length)]?.cardId ?? '';
      }
      if (!id) return;
      const instance = createCardInstance(ctx.state, id, opponentOf(ctx.controller), 'created');
      const pos = Math.floor(randomValue(ctx.state) * (enemy.deck.length + 1));
      enemy.deck.splice(pos, 0, instance);
    }
  },

  /** 伤害修正（简化：单位受到伤害减免） */
  damageModifier: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 1);
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    const ref = refs[0] ?? (ctx.sourceUnitId ? { kind: 'unit', unitId: ctx.sourceUnitId } : undefined);
    if (ref && ref.kind === 'unit') {
      const unit = ctx.state.units[ref.unitId];
      if (unit) unit.trackers.damageReduction = (unit.trackers.damageReduction ?? 0) + amount;
    }
  },

  /** 修改单位行动花费（可为负） */
  modifyOperationCost: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 0);
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    const ref = refs[0] ?? (ctx.sourceUnitId ? { kind: 'unit', unitId: ctx.sourceUnitId } : undefined);
    if (ref && ref.kind === 'unit') {
      const unit = ctx.state.units[ref.unitId];
      if (unit) unit.operationCost = Math.max(0, unit.operationCost + amount);
    }
  },
} as Record<string, CustomHandler>);

function normalizeUnitKeywords(reg: EngineRegistry, cardId: string, attributes: string[]): string[] {
  void reg;
  void cardId;
  const out: string[] = [];
  for (const attr of attributes) {
    const parsed = parseAttributeLocal(attr);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseAttributeLocal(attr: string): string | null {
  if (!attr || attr === 'OnlySpawnable' || attr.startsWith('BecomesVeteran:') || attr.startsWith('VeteranOf:')) return null;
  const m = /^([a-zA-Z]+)(\d+)$/.exec(attr);
  if (m) return `${m[1].charAt(0).toLowerCase() + m[1].slice(1)}:${m[2]}`;
  return attr;
}

Object.assign(CUSTOM_CONDITIONS, {
  ordersPlayedThisTurnAtLeast: (ctx: ExecCtx, params) => {
    const need = pNum(params.count, 1);
    return (ctx.state.players[ctx.controller].trackers['ordersPlayedThisTurn'] ?? 0) >= need;
  },
  deployedFactionTypeLastTurn: (ctx: ExecCtx, params) => {
    const faction = pStr(params.faction, '');
    const type = pStr(params.type, '');
    const key = `lastDeployed:${faction}:${type}`;
    return (ctx.state.players[ctx.controller].trackers[key] ?? 0) > 0;
  },
  chosenIsFriendly: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    if (!ref || ref.kind !== 'unit') return false;
    const unit = ctx.state.units[ref.unitId];
    return !!unit && unit.owner === ctx.controller;
  },
  friendlyTurnChosenIsEnemy: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    if (!ref || ref.kind !== 'unit') return false;
    const unit = ctx.state.units[ref.unitId];
    return !!unit && unit.owner !== ctx.controller && ctx.state.activePlayer === ctx.controller;
  },
} as Record<string, (ctx: ExecCtx, params: Record<string, unknown>) => boolean>);

Object.assign(CUSTOM_HANDLERS, {
  /** 失去指挥点槽 */
  loseKreditSlots: (ctx: ExecCtx, params) => {
    const side = sideOf(ctx, pStr(params.side, 'enemy'));
    const amount = pNum(params.amount, 1);
    const p = ctx.state.players[side];
    p.maxKredits = Math.max(0, p.maxKredits - amount);
    p.kredits = Math.min(p.kredits, p.maxKredits);
  },

  /** 强制结束当前回合（在处理完当前指令后由 game.ts 统一执行） */
  endTurn: (ctx: ExecCtx) => {
    ctx.state.trackers.forceEndTurn = 1;
  },

  /** 将某张卡洗入卡组 */
  shuffleIntoDeck: (ctx: ExecCtx, params) => {
    const side = sideOf(ctx, pStr(params.side, 'self'));
    const cardId = pStr(params.cardId);
    const count = pNum(params.count, 1);
    if (!cardId) return;
    const p = ctx.state.players[side];
    for (let i = 0; i < count; i++) {
      const instance = createCardInstance(ctx.state, cardId, side, 'created');
      const pos = Math.floor(randomValue(ctx.state) * (p.deck.length + 1));
      p.deck.splice(pos, 0, instance);
    }
  },

  /** 延迟效果：下个（或指定）友方回合开始/结束时执行 */
  scheduleEffects: (ctx: ExecCtx, params) => {
    const when = pStr(params.when, 'selfTurnStart') as 'selfTurnStart' | 'selfTurnEnd' | 'opponentTurnStart';
    const effects = (Array.isArray(params.effects) ? params.effects : []) as EffectOp[];
    if (effects.length === 0) return;
    ctx.state.scheduled.push({
      id: `sch${ctx.state.nextId + 1}_${ctx.state.scheduled.length}`,
      player: ctx.controller,
      when,
      turn: params.turn !== undefined ? pNum(params.turn) : undefined,
      effects,
      sourceCardId: ctx.sourceCardId,
    });
  },

  /** 设置总部防御力 */
  setHqDefense: (ctx: ExecCtx, params) => {
    const side = sideOf(ctx, pStr(params.side, 'self'));
    const value = Math.max(1, pNum(params.value, 20));
    const hq = ctx.state.players[side].hq;
    hq.maxHp = value;
    hq.hp = value;
  },

  /** 移除本单位，直到下个友方回合开始 */
  phaseOutUntilNextTurn: (ctx: ExecCtx) => {
    const unit = ctx.sourceUnitId ? ctx.state.units[ctx.sourceUnitId] : undefined;
    if (!unit) return;
    const unitId = unit.unitId;
    const owner = unit.owner;
    removeUnitFromBoard(ctx.state, unitId);
    ctx.state.units[unitId] = unit;
    unit.statuses.phasedOut = true;
    ctx.state.scheduled.push({
      id: `phase_${unitId}`,
      player: owner,
      when: 'selfTurnStart',
      effects: [{ op: 'custom', id: 'returnPhasedUnit', params: { unitId } }],
      sourceCardId: ctx.sourceCardId,
    });
    recomputeAuras(ctx.state, ctx.reg);
  },

  /** 返回被移出的单位（内部用） */
  returnPhasedUnit: (ctx: ExecCtx, params) => {
    const unitId = pStr(params.unitId);
    const unit = ctx.state.units[unitId];
    if (!unit) return;
    delete unit.statuses.phasedOut;
    const targetLine = bestLineForSummon(ctx, unit.owner, unit.line);
    if (!targetLine) {
      delete ctx.state.units[unitId];
      return;
    }
    placeUnit(ctx.state, unit, targetLine);
    recomputeAuras(ctx.state, ctx.reg);
  },

  /** 复制手牌中的单位到支援线 */
  copyHandUnitToSupport: (ctx: ExecCtx, params) => {
    if (!lineHasSpace(ctx, ctx.controller, 'support')) return;
    const p = ctx.state.players[ctx.controller];
    const maxCost = params.maxCost !== undefined ? pNum(params.maxCost) : 99;
    const idx = p.hand.findIndex((c) => {
      const def = getDef(ctx.reg, c.cardId);
      return def && def.type !== 'order' && def.type !== 'countermeasure' && def.kredits <= maxCost;
    });
    if (idx < 0) return;
    const cardId = p.hand[idx].cardId;
    const unit = makeUnit(ctx.state, ctx.reg, ctx.controller, cardId, 'support', { token: true, ready: true });
    if (unit) placeUnit(ctx.state, unit, 'support');
    recomputeAuras(ctx.state, ctx.reg);
  },
} as Record<string, CustomHandler>);

Object.assign(CUSTOM_CONDITIONS, {
  chosenIsEnemyHQ: (ctx: ExecCtx) => {
    const hq = ctx.chosen;
    return !!hq && hq.kind === 'hq' && hq.player !== ctx.controller;
  },
  usedFromLeftmostHandCard: (ctx: ExecCtx) => ctx.playHandIndex === 0,
  usedFromRightmostHandCard: (ctx: ExecCtx) => {
    const p = ctx.state.players[ctx.controller];
    return ctx.playHandIndex !== undefined && ctx.playHandIndex === p.hand.length;
  },
  chosenIsUnit: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    return !!ref && ref.kind === 'unit' && !!ctx.state.units[ref.unitId];
  },
  chosenIsSelf: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    return !!ref && ref.kind === 'unit' && ref.unitId === ctx.sourceUnitId;
  },
  friendlyFactionUnitOnFrontline: (ctx: ExecCtx, params) => {
    const faction = pStr(params.faction, '');
    return lineUnits(ctx.state, ctx.controller, 'frontline').some((u) => {
      const def = getDef(ctx.reg, u.cardId);
      return !faction || def?.faction === faction;
    });
  },
  factionIsAlly: (ctx: ExecCtx, params) => {
    const faction = pStr(params.faction, '');
    return ctx.state.players[ctx.controller].allyFaction === faction;
  },
} as Record<string, (ctx: ExecCtx, params: Record<string, unknown>) => boolean>);
// ============================================================
// 容量校验（支援线 4 / 前线共享 5）
// ============================================================

function lineHasSpace(ctx: ExecCtx, owner: PlayerIndex, line: Line): boolean {
  if (line === 'frontline') return frontlineUsed(ctx.state) < ctx.state.config.frontlineSlots;
  return ctx.state.players[owner].support.length < ctx.state.config.supportSlots;
}

function bestLineForSummon(ctx: ExecCtx, owner: PlayerIndex, preferred: Line): Line | null {
  if (lineHasSpace(ctx, owner, preferred)) return preferred;
  const other: Line = preferred === 'frontline' ? 'support' : 'frontline';
  if (lineHasSpace(ctx, owner, other)) return other;
  return null;
}

// ============================================================
// 追加：B 档 custom 原语（长尾卡牌效果的常用形态）
// ============================================================

Object.assign(CUSTOM_HANDLERS, {
  /** 对目标及其相邻单位造成伤害（同线 ±1） */
  damageTargetAndAdjacent: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 1);
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    const base = refs.find((r) => r.kind === 'unit');
    if (!base || base.kind !== 'unit') return;
    const unit = ctx.state.units[base.unitId];
    if (!unit) return;
    const lineArr = ctx.state.players[unit.owner][unit.line];
    const idx = lineArr.indexOf(unit.unitId);
    const ids = [lineArr[idx - 1], lineArr[idx], lineArr[idx + 1]].filter((id): id is string => !!id);
    for (const id of ids) dealDamage(ctx, { kind: 'unit', unitId: id }, amount);
  },

  /** 消灭同名单位 */
  destroyUnitAndSameName: (ctx: ExecCtx) => {
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    const ref = refs.find((r) => r.kind === 'unit');
    if (!ref || ref.kind !== 'unit') return;
    const unit = ctx.state.units[ref.unitId];
    if (!unit) return;
    const cardId = unit.cardId;
    for (const target of [...alliesOf(ctx), ...enemiesOf(ctx)]) {
      if (target.cardId === cardId) destroyUnitAndTrigger(ctx, target.unitId);
    }
  },

  /** 抽花费最低的指令 */
  drawCheapestOrder: (ctx: ExecCtx) => {
    const p = ctx.state.players[ctx.controller];
    let idx = -1;
    let best = 999;
    p.deck.forEach((c, i) => {
      const def = getDef(ctx.reg, c.cardId);
      if (!def || def.type !== 'order') return;
      if (def.kredits < best) {
        best = def.kredits;
        idx = i;
      }
    });
    if (idx < 0) return;
    const card = p.deck.splice(idx, 1)[0];
    if (p.hand.length < ctx.state.config.handLimit) p.hand.push(card);
    else p.discard.push(card);
  },

  /** 抽一张指定花费的单位 */
  drawUnitByCost: (ctx: ExecCtx, params) => {
    const cost = pNum(params.cost, 1);
    const p = ctx.state.players[ctx.controller];
    const idx = p.deck.findIndex((c) => {
      const def = getDef(ctx.reg, c.cardId);
      return !!def && def.type !== 'order' && def.type !== 'countermeasure' && def.kredits === cost;
    });
    const card = idx >= 0 ? p.deck.splice(idx, 1)[0] : p.deck.shift();
    if (!card) return;
    if (p.hand.length < ctx.state.config.handLimit) p.hand.push(card);
    else p.discard.push(card);
  },

  /** 在指定回合开始抽牌（简化：scheduleEffects 的快捷方式） */
  drawAtTurn: (ctx: ExecCtx, params) => {
    const turn = pNum(params.turn, ctx.state.turn + 1);
    ctx.state.scheduled.push({
      id: `drawAt_${ctx.state.nextId + 1}_${ctx.state.scheduled.length}`,
      player: ctx.controller,
      when: 'selfTurnStart',
      turn,
      effects: [{ op: 'draw', side: 'self', count: 1 }],
      sourceCardId: ctx.sourceCardId,
    });
  },

  /** 从卡组发现一张牌到手牌 */
  discoverFromDeck: (ctx: ExecCtx, params) => {
    const faction = pStr(params.faction, '');
    const type = pStr(params.type, '');
    const maxCost = params.maxCost !== undefined ? pNum(params.maxCost) : 99;
    const p = ctx.state.players[ctx.controller];
    const idx = p.deck.findIndex((c) => {
      const def = getDef(ctx.reg, c.cardId);
      return !!def && (!faction || def.faction === faction) && (!type || def.type === type) && def.kredits <= maxCost;
    });
    if (idx < 0) return;
    const card = p.deck.splice(idx, 1)[0];
    if (p.hand.length < ctx.state.config.handLimit) p.hand.push(card);
    else p.discard.push(card);
  },

  /** 复制自身并按倍数洗入卡组 */
  copySelfToDeckWithMultiplier: (ctx: ExecCtx, params) => {
    const unit = ctx.sourceUnitId ? ctx.state.units[ctx.sourceUnitId] : undefined;
    if (!unit) return;
    const count = pNum(params.count, 1);
    const p = ctx.state.players[unit.owner];
    for (let i = 0; i < count; i++) {
      const instance = createCardInstance(ctx.state, unit.cardId, unit.owner, 'created');
      p.deck.splice(Math.floor(randomValue(ctx.state) * (p.deck.length + 1)), 0, instance);
    }
  },

  /** 将自身移出对局（不进弃牌堆） */
  removeSelfFromGame: (ctx: ExecCtx) => {
    if (!ctx.sourceUnitId) return;
    const unit = leaveBoard(ctx.state, ctx.sourceUnitId);
    if (!unit) return;
    const p = ctx.state.players[unit.owner];
    p.discard = p.discard.filter((c) => c.instanceId !== unit.instanceId);
    recomputeAuras(ctx.state, ctx.reg);
  },

  /** 弃 1 张手牌后抽 1 张 */
  handCardToDeckThenDraw: (ctx: ExecCtx) => {
    const p = ctx.state.players[ctx.controller];
    if (p.hand.length > 0) {
      const card = p.hand.shift()!;
      p.deck.push(card);
    }
    drawCardInternal(ctx.state, ctx.controller, ctx.events);
  },

  /** 召唤上一个阵亡单位（简化：按最近死亡单位） */
  summonLastDestroyedUnit: (ctx: ExecCtx, params) => {
    const cardId = pStr(ctx.state.trackers['lastDestroyedCardId'] ?? '');
    if (!cardId) return;
    const line = bestLineForSummon(ctx, ctx.controller, 'support');
    if (!line) return;
    const unit = makeUnit(ctx.state, ctx.reg, ctx.controller, cardId, line, { token: true, ready: true });
    if (unit) placeUnit(ctx.state, unit, line);
    recomputeAuras(ctx.state, ctx.reg);
    void params;
  },

  /** 召唤并立即攻击（近似：召唤 + 造成其攻击力伤害到随机敌人） */
  summonAndStrike: (ctx: ExecCtx, params) => {
    const cardId = pStr(params.cardId);
    if (!cardId) return;
    const line = bestLineForSummon(ctx, ctx.controller, 'frontline');
    if (!line) return;
    const unit = makeUnit(ctx.state, ctx.reg, ctx.controller, cardId, line, { token: true, ready: true });
    if (!unit) return;
    placeUnit(ctx.state, unit, line);
    const targets = enemiesOf(ctx);
    if (targets.length > 0) {
      const target = targets[Math.floor(randomValue(ctx.state) * targets.length)];
      dealDamage(ctx, { kind: 'unit', unitId: target.unitId }, unit.attack, { unitId: unit.unitId, kind: 'unit' });
    }
    recomputeAuras(ctx.state, ctx.reg);
  },

  /** 把所有友方单位转换为目标单位（近似：加 buff） */
  convertOwnerUnitsToChosen: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    if (!ref || ref.kind !== 'unit') return;
    const source = ctx.state.units[ref.unitId];
    if (!source) return;
    for (const unit of alliesOf(ctx)) {
      if (unit.unitId === source.unitId) continue;
      buffUnit(unit, source.attack - unit.attack, source.maxHp - unit.maxHp, true);
    }
  },

  /** 消灭收缴类：随机消灭攻击力最低的敌方单位 */
  destroySalvageLowestAttack: (ctx: ExecCtx) => {
    const pool = enemiesOf(ctx).sort((a, b) => a.attack - b.attack);
    if (pool.length > 0) destroyUnitAndTrigger(ctx, pool[0].unitId);
  },

  /** 双方抽牌直到手牌数相同 */
  drawBothUntilHandSize: (ctx: ExecCtx) => {
    const a = ctx.state.players[0];
    const b = ctx.state.players[1];
    const target = Math.max(a.hand.length, b.hand.length);
    let guard = 0;
    while (a.hand.length < target && a.deck.length > 0 && guard++ < 20) drawCardInternal(ctx.state, 0, ctx.events);
    guard = 0;
    while (b.hand.length < target && b.deck.length > 0 && guard++ < 20) drawCardInternal(ctx.state, 1, ctx.events);
  },

  /** 下回合敌方手牌花费 +N */
  modifyEnemyHandCostNextTurn: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 1);
    const enemy = ctx.state.players[opponentOf(ctx.controller)];
    enemy.trackers['costIncrease:all'] = (enemy.trackers['costIncrease:all'] ?? 0) + amount;
  },

  /** 总部能力（简化：记录并在下回合开始时给总部加成） */
  grantHqAbility: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 1);
    const side = sideOf(ctx, pStr(params.side, 'self'));
    const hq = ctx.state.players[side].hq;
    hq.maxHp += amount;
    hq.hp += amount;
  },

  /** 下回合总部获得关键字（无对应机制，记录日志） */
  grantHqKeywordUntilNextTurn: (ctx: ExecCtx) => {
    addLog(ctx.state, ctx.controller, 'effect', '总部获得临时能力（暂未建模）');
  },

  /** 记录老兵进度（简化：累计 tracker） */
  trackVeteranProgress: (ctx: ExecCtx) => {
    ctx.state.trackers['veteranProgress'] = (ctx.state.trackers['veteranProgress'] ?? 0) + 1;
  },

  /** 敌方抽牌时对敌方总部造成伤害（简化：立即造成 1 点） */
  damageEnemyHqIfEnemyDrew: (ctx: ExecCtx) => {
    dealDamage(ctx, { kind: 'hq', player: opponentOf(ctx.controller) }, 1);
  },
} as Record<string, CustomHandler>);

// ============================================================
// 追加：事件上下文相关的 custom condition（card-smith 长尾需要）
// ============================================================

Object.assign(CUSTOM_CONDITIONS, {
  /** 本次触发涉及的“受害/行动单位”是友方 */
  eventVictimIsFriendly: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    if (!ref || ref.kind !== 'unit') return false;
    const unit = ctx.state.units[ref.unitId];
    return !!unit && unit.owner === ctx.controller;
  },
  /** 本次事件由敌方发起 */
  playedByEnemy: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    if (ref && ref.kind === 'unit') {
      const unit = ctx.state.units[ref.unitId];
      if (unit) return unit.owner !== ctx.controller;
    }
    return ctx.state.activePlayer !== ctx.controller;
  },
  /** 本次行动单位是友方且属于指定阵营 */
  actedUnitIsFriendlyFaction: (ctx: ExecCtx, params) => {
    const faction = pStr(params.faction, '');
    const ref = ctx.chosen;
    if (!ref || ref.kind !== 'unit') return false;
    const unit = ctx.state.units[ref.unitId];
    if (!unit || unit.owner !== ctx.controller) return false;
    const def = getDef(ctx.reg, unit.cardId);
    return !faction || def?.faction === faction;
  },
  /** 本次行动单位是敌方 */
  actedUnitIsEnemy: (ctx: ExecCtx) => {
    const ref = ctx.chosen;
    if (!ref || ref.kind !== 'unit') return false;
    const unit = ctx.state.units[ref.unitId];
    return !!unit && unit.owner !== ctx.controller;
  },
} as Record<string, (ctx: ExecCtx, params: Record<string, unknown>) => boolean>);

// modifyCost 支持 duration:'turn'（仅本回合生效）
Object.assign(CUSTOM_HANDLERS, {
  modifyCostTurn: (ctx: ExecCtx, params) => {
    const amount = pNum(params.amount, 1);
    const target = pStr(params.target, 'handAll');
    const p = ctx.state.players[ctx.controller];
    const key =
      target === 'cardId'
        ? `costDiscountTurn:card:${pStr(params.cardId)}`
        : target === 'faction'
          ? `costDiscountTurn:faction:${pStr(params.faction)}`
          : target === 'type'
            ? `costDiscountTurn:type:${pStr(params.type)}`
            : 'costDiscountTurn:all';
    p.trackers[key] = (p.trackers[key] ?? 0) + amount;
  },
} as Record<string, CustomHandler>);

// ============================================================
// 追加：压制/抑制与关键字机制（官方规则）
// ============================================================

Object.assign(CUSTOM_HANDLERS, {
  /** 抑制 pin：失去所有关键词和效果，攻/防/行动花费重置为原值（可解除） */
  pinUnit: (ctx: ExecCtx, params) => {
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    for (const ref of refs) {
      if (ref.kind !== 'unit') continue;
      const unit = ctx.state.units[ref.unitId];
      if (!unit) continue;
      const def = getDef(ctx.reg, unit.cardId);
      if (!def) continue;
      unit.statuses.pinBackup = {
        baseKeywords: [...unit.baseKeywords],
        baseAttack: unit.baseAttack,
        baseHp: unit.baseHp,
        operationCost: unit.operationCost,
        buffAttack: unit.buffAttack,
        buffHp: unit.buffHp,
      };
      unit.baseKeywords = [];
      unit.auraKeywords = [];
      unit.baseAttack = def.attack;
      unit.baseHp = def.defense;
      unit.buffAttack = 0;
      unit.buffHp = 0;
      unit.operationCost = def.operationCost;
      unit.hp = Math.min(unit.hp, def.defense);
      unit.statuses.pinned = true;
      unit.silenced = true;
      recalcUnit(unit);
    }
    void params;
  },

  /** 解除抑制 */
  unpinUnit: (ctx: ExecCtx) => {
    const refs = ctx.chosenList ?? (ctx.chosen ? [ctx.chosen] : []);
    for (const ref of refs) {
      if (ref.kind !== 'unit') continue;
      const unit = ctx.state.units[ref.unitId];
      if (!unit) continue;
      const backup = unit.statuses.pinBackup as
        | { baseKeywords: string[]; baseAttack: number; baseHp: number; operationCost: number; buffAttack: number; buffHp: number }
        | undefined;
      if (backup) {
        unit.baseKeywords = backup.baseKeywords;
        unit.baseAttack = backup.baseAttack;
        unit.baseHp = backup.baseHp;
        unit.operationCost = backup.operationCost;
        unit.buffAttack = backup.buffAttack;
        unit.buffHp = backup.buffHp;
        delete unit.statuses.pinBackup;
      }
      unit.statuses.pinned = false;
      unit.silenced = false;
      recalcUnit(unit);
      recomputeAuras(ctx.state, ctx.reg);
    }
  },

  /** 山地 alpine：每有 1 个其他友方山地单位，+1/+1 */
  applyAlpine: (ctx: ExecCtx) => {
    const unit = ctx.sourceUnitId ? ctx.state.units[ctx.sourceUnitId] : undefined;
    if (!unit) return;
    const others = playerUnits(ctx.state, unit.owner).filter(
      (u) => u.unitId !== unit.unitId && hasKeyword(u, 'alpine'),
    );
    if (others.length > 0) buffUnit(unit, others.length, others.length, true);
  },

  /** 动员 mobilize：回合开始 +1/+1（受伤后由引擎自动移除动员） */
  mobilizeBuff: (ctx: ExecCtx) => {
    const unit = ctx.sourceUnitId ? ctx.state.units[ctx.sourceUnitId] : undefined;
    if (!unit) return;
    buffUnit(unit, 1, 1, true);
  },

  /** 收缴 salvage：消灭敌方单位后获得 1/1 复制（简化：加入手牌一张同名牌并在部署时 1/1） */
  salvageCopy: (ctx: ExecCtx) => {
    const unit = ctx.sourceUnitId ? ctx.state.units[ctx.sourceUnitId] : undefined;
    if (!unit) return;
    const instance = createCardInstance(ctx.state, unit.cardId, ctx.controller, 'created');
    ctx.state.players[ctx.controller].hand.push(instance);
    ctx.state.players[ctx.controller].trackers[`salvage1of1:${instance.instanceId}`] = 1;
  },
} as Record<string, CustomHandler>);
