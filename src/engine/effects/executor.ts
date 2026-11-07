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
  source?: { cardId?: string; unitId?: string },
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
    const { dealt, killed } = damageUnitInternal(ctx.state, ref.unitId, amount, ctx.events);
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
    if (healed > 0) ctx.events.push({ type: 'heal', target: ref, amount: healed });
  }
}

export function destroyTarget(ctx: ExecCtx, ref: TargetRef): void {
  if (ref.kind === 'unit') destroyUnitAndTrigger(ctx, ref.unitId);
}

export function destroyUnitAndTrigger(ctx: ExecCtx, unitId: UnitId): void {
  const unit = ctx.state.units[unitId];
  if (!unit) return;
  const { cardId, owner } = unit;
  leaveBoard(ctx.state, unitId);
  ctx.events.push({ type: 'death', unitId });
  addLog(ctx.state, owner, 'death', `${cardDefName(ctx.reg, cardId)} 阵亡`);
  ctx.triggerQueue.push({ trigger: 'death', cardId, owner, triggerUnitId: unitId });
  enqueueTriggerForUnits(ctx, 'unitDestroyed', { victimUnitId: unitId });
  recomputeAuras(ctx.state, ctx.reg);
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
        const line: Line = op.line ?? (state.frontlineController === owner ? 'frontline' : 'support');
        const targetLine: Line = op.line ?? pickLineForSummon(state, owner, line);
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
  removeUnitFromBoard(state, unit.unitId);
  const cap = toLine === 'frontline' ? state.config.frontlineSlots : state.config.supportSlots;
  if (state.players[unit.owner][toLine].length >= cap) {
    // 放不下则回到原线
    placeUnit(state, unit, unit.line);
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
