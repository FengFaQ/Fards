/**
 * 目标与动作合法性：攻击可达性、部署线、指令目标、合法动作枚举。
 * 规则开关集中在 GameConfig（见 types.ts DEFAULT_CONFIG），考据校准只改配置。
 */
import type {
  CardDef,
  CardInstance,
  CardScript,
  EffectTarget,
  EngineRegistry,
  GameState,
  LegalAction,
  Line,
  PlayerIndex,
  PlayerSide,
  TargetQuery,
  TargetRef,
  Unit,
  UnitFilter,
  UnitId,
} from './types';
import { getDef, getScript, opponentOf, playerUnits, randomValue, frontlineUsed } from './state';
import { hasKeyword, isAirType, isGroundType, isRangedType, isHiddenKeyword } from './keywords';

export function resolveSide(controller: PlayerIndex, side: PlayerSide | 'any'): PlayerIndex[] {
  if (side === 'self') return [controller];
  if (side === 'enemy') return [opponentOf(controller)];
  return [controller, opponentOf(controller)];
}

export function matchesFilter(
  state: GameState,
  reg: EngineRegistry,
  unit: Unit,
  filter?: UnitFilter,
  chosen?: TargetRef,
): boolean {
  if (!filter) return true;
  const def = getDef(reg, unit.cardId);
  if (filter.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    if (!def || !types.includes(def.type)) return false;
  }
  if (filter.keyword && !hasKeyword(unit, filter.keyword)) return false;
  if (filter.faction && def?.faction !== filter.faction) return false;
  if (filter.minCost !== undefined && (def?.kredits ?? 0) < filter.minCost) return false;
  if (filter.maxCost !== undefined && (def?.kredits ?? 0) > filter.maxCost) return false;
  if (filter.minAttack !== undefined && unit.attack < filter.minAttack) return false;
  if (filter.maxAttack !== undefined && unit.attack > filter.maxAttack) return false;
  if (filter.minHp !== undefined && unit.hp < filter.minHp) return false;
  if (filter.maxHp !== undefined && unit.hp > filter.maxHp) return false;
  if (filter.damaged !== undefined && (unit.hp < unit.maxHp) !== filter.damaged) return false;
  if (filter.undamaged !== undefined && (unit.hp >= unit.maxHp) !== filter.undamaged) return false;
  if (filter.token !== undefined && !!unit.token !== filter.token) return false;
  if (chosen && filter.excludeChosen && chosen.kind === 'unit' && chosen.unitId === unit.unitId) return false;
  return true;
}

export interface ResolveQueryOptions {
  chosen?: TargetRef;
  /** 覆盖 query.limit（调用方已求值） */
  limit?: number;
  /** 排除指定单位（如“除自身外”） */
  excludeUnitId?: UnitId;
  /** 是否允许包含 HQ 目标（默认否） */
  includeHQ?: boolean;
  /** 是否包含隐藏单位（伏击/隐蔽，默认排除） */
  includeHidden?: boolean;
}

/** 把目标查询解析成 TargetRef 列表（不做随机挑选，由调用方决定） */
export function resolveQueryTargets(
  state: GameState,
  reg: EngineRegistry,
  controller: PlayerIndex,
  query: TargetQuery,
  options: ResolveQueryOptions = {},
): TargetRef[] {
  const out: TargetRef[] = [];
  const includeHidden = options.includeHidden ?? false;
  if (query.kind === 'query' && (query.side === 'any' || query.side)) {
    for (const player of resolveSide(controller, query.side)) {
      for (const unit of playerUnits(state, player)) {
        if (options.excludeUnitId && unit.unitId === options.excludeUnitId) continue;
        if (!includeHidden && targetIsHidden(state, unit)) continue;
        if (query.line && query.line !== 'any' && unit.line !== query.line) continue;
        if (!matchesFilter(state, reg, unit, query.filter, options.chosen)) continue;
        out.push({ kind: 'unit', unitId: unit.unitId });
      }
    }
  }
  let limit = options.limit ?? 99;
  if (typeof query.limit === 'number') limit = Math.min(limit, query.limit);
  return out.slice(0, Math.max(0, limit));
}

/** 把目标表达式解析成可点击的目标引用（用于指令/部署目标的 UI 与 AI） */
export function resolveLegalTargetRefs(
  state: GameState,
  reg: EngineRegistry,
  controller: PlayerIndex,
  spec: EffectTarget | undefined,
  options: ResolveQueryOptions = {},
): TargetRef[] {
  if (!spec) return [];
  switch (spec.kind) {
    case 'self':
      return [];
    case 'chosen':
      return [];
    case 'hq': {
      const players = resolveSide(controller, spec.side);
      return players.map((p) => ({ kind: 'hq', player: p }) as TargetRef);
    }
    case 'query': {
      const refs = resolveQueryTargets(state, reg, controller, spec, options);
      const limited = typeof spec.limit === 'number' ? refs.slice(0, spec.limit) : refs;
      return limited;
    }
    default:
      return [];
  }
}

// ============================================================
// 攻击合法性
// ============================================================

export function getOperationCost(unit: Unit): number {
  return Math.max(0, unit.operationCost);
}

export function canUnitAttack(state: GameState, unit: Unit): boolean {
  if (state.status !== 'playing') return false;
  if (unit.hp <= 0) return false;
  if (unit.attacksUsed >= unit.maxAttacks) return false;
  if (unit.statuses.pinned) return false;
  if ((unit.statuses.cannotAttackTurns ?? 0) > 0) return false;
  if (unit.deployedTurn === state.turn && !hasKeyword(unit, 'blitz') && !hasKeyword(unit, 'shock')) return false;
  if (state.config.attackCostsKredits && state.players[unit.owner].kredits < getOperationCost(unit)) return false;
  return true;
}

function targetIsHidden(state: GameState, unit: Unit): boolean {
  if (hasKeyword(unit, 'smokescreen')) return true;
  if (unit.ambush && isHiddenKeyword(unit)) return true;
  return false;
}

/** 单位之间能否互相攻击（不含 guard 压制，由 legalAttackTargets 统一处理） */
export function canAttackUnitTarget(state: GameState, reg: EngineRegistry, attacker: Unit, target: Unit): boolean {
  if (attacker.owner === target.owner) return false;
  if (targetIsHidden(state, target)) return false;
  if (!state.config.supportCanAttack && attacker.line === 'support' && !isRangedType(attackerType(reg, attacker))) {
    return false;
  }
  const atkType = attackerType(reg, attacker);
  const tgtType = attackerType(reg, target);
  // 空军单位只能被战斗机攻击
  if (isAirType(tgtType) && atkType !== 'fighter') return false;
  // 轰炸机受敌方同战线战斗机封锁
  if (atkType === 'bomber') {
    const enemyFighters = playerUnits(state, target.owner).filter(
      (u) => attackerType(reg, u) === 'fighter' && u.line === target.line,
    );
    if (enemyFighters.length > 0) return false;
  }
  // 炮兵/空军：可打任意战线
  if (isRangedType(atkType)) return true;
  // 步兵/坦克：只能打相邻战线（支援线→敌方前线；前线→敌方支援线）
  if (attacker.line === 'support') return target.line === 'frontline';
  return true;
}

export function attackerType(reg: EngineRegistry, unit: Unit): string {
  return getDef(reg, unit.cardId)?.type ?? 'infantry';
}

export function isGuardUnit(unit: Unit): boolean {
  return hasKeyword(unit, 'guard');
}

/** 对方是否有关键的“守护”单位（可嘲讽） */
export function guardUnitsOf(state: GameState, reg: EngineRegistry, player: PlayerIndex): Unit[] {
  return playerUnits(state, player).filter(
    (u) => isGuardUnit(u) && !targetIsHidden(state, u) && (state.config.guardAnyLine || u.line === 'frontline'),
  );
}

export function canAttackHQ(state: GameState, reg: EngineRegistry, attacker: Unit): boolean {
  const enemy = opponentOf(attacker.owner);
  const atkType = attackerType(reg, attacker);
  if (atkType === 'bomber') {
    const enemyFighters = playerUnits(state, enemy).filter((u) => attackerType(reg, u) === 'fighter');
    if (enemyFighters.length > 0) return false;
  }
  // 规则：所有兵种都可攻击敌方总部（不受守护限制），但地面单位需在前线
  if (isRangedType(atkType)) return true;
  return !state.config.hqAttackRequiresFrontline || attacker.line === 'frontline';
}

export function legalAttackTargets(state: GameState, reg: EngineRegistry, attacker: Unit): TargetRef[] {
  if (!canUnitAttack(state, attacker)) return [];
  const enemy = opponentOf(attacker.owner);
  const attackerKind = attackerType(reg, attacker);
  // 炮兵/轰炸机无视守护（官方规则）
  const ignoresGuard = attackerKind === 'artillery' || attackerKind === 'bomber';
  // 用户规则：守护词条的卡片使其「左右两侧」的单位被守护、无法被攻击；守护单位自身仍可被攻击。
  const protectedIds = ignoresGuard ? new Set<string>() : guardedNeighborIds(state, enemy);
  const targets: TargetRef[] = [];
  for (const unit of playerUnits(state, enemy)) {
    if (!canAttackUnitTarget(state, reg, attacker, unit)) continue;
    if (protectedIds.has(unit.unitId)) continue;
    targets.push({ kind: 'unit', unitId: unit.unitId });
  }
  if (canAttackHQ(state, reg, attacker)) {
    targets.push({ kind: 'hq', player: enemy });
  }
  return targets;
}

/** 被守护的相邻单位（守护词条保护左右两侧，不含守护单位自身） */
export function guardedNeighborIds(state: GameState, owner: PlayerIndex): Set<string> {
  const out = new Set<string>();
  for (const line of ['frontline', 'support'] as Line[]) {
    const arr = state.players[owner][line];
    for (let i = 0; i < arr.length; i++) {
      const unit = state.units[arr[i]];
      if (!unit || !hasKeyword(unit, 'guard')) continue;
      for (const offset of [-1, 1]) {
        const neighborId = arr[i + offset];
        if (!neighborId) continue;
        const neighbor = state.units[neighborId];
        if (neighbor && !hasKeyword(neighbor, 'guard')) out.add(neighborId);
      }
    }
  }
  return out;
}

// ============================================================
// 部署合法性
// ============================================================

export function lineSpace(state: GameState, player: PlayerIndex, line: Line): number {
  if (line === 'frontline') return Math.max(0, state.config.frontlineSlots - frontlineUsed(state));
  return Math.max(0, state.config.supportSlots - state.players[player].support.length);
}

export function canDeployToFrontline(state: GameState, player: PlayerIndex): boolean {
  if (lineSpace(state, player, 'frontline') <= 0) return false;
  // 前线无人占领（空）时可以抢占；已有占领者时只有占领者能继续增兵
  return frontlineUsed(state) === 0 || state.frontlineController === player;
}

export function legalDeployLines(state: GameState, player: PlayerIndex): Line[] {
  // 官方规则：从手牌打出的单位部署到支援阵线；进入前线需要「移动」（支付行动花费）
  return lineSpace(state, player, 'support') > 0 ? ['support'] : [];
}

// ============================================================
// 出牌合法性
// ============================================================

export function playCost(state: GameState, reg: EngineRegistry, player: PlayerIndex, instance: CardInstance): number {
  const def = getDef(reg, instance.cardId);
  if (!def) return 999;
  let cost = Math.max(0, def.kredits ?? 0);
  const script = getScript(reg, instance.cardId);
  if (script?.costDelta && typeof script.costDelta === 'number') cost += script.costDelta;
  const trackers = state.players[player].trackers;
  const flat = (key: string) => trackers[key] ?? 0;
  cost -= flat('costDiscount:all');
  cost -= flat(`costDiscount:card:${instance.cardId}`);
  cost -= flat(`costDiscount:faction:${def.faction}`);
  cost -= flat(`costDiscount:type:${isOrderCardType(def.type) ? 'order' : 'unit'}`);
  if (def.kredits % 2 === 1) cost -= flat('costDiscount:parity:odd');
  else cost -= flat('costDiscount:parity:even');
  return Math.max(0, cost);
}

export function isUnitCard(reg: EngineRegistry, cardId: string): boolean {
  const def = getDef(reg, cardId);
  return !!def && !isOrderCardType(def.type);
}

export function isOrderCardType(type: string): boolean {
  return type === 'order' || type === 'countermeasure';
}

/** 卡牌打出时需要选择的目标规格（优先 targetSpec，其次部署/指令能力的 target） */
export function targetSpecOf(reg: EngineRegistry, cardId: string): EffectTarget | undefined {
  const script = getScript(reg, cardId);
  if (!script) return undefined;
  if (script.targetSpec) return script.targetSpec;
  const ability = script.abilities?.find((a) => a.trigger === 'deploy' || a.trigger === 'order');
  return ability?.target;
}

export function cardRequiresTarget(reg: EngineRegistry, cardId: string): boolean {
  return !!targetSpecOf(reg, cardId);
}

/** 打出时需要选择的合法目标数量（多目标卡 = query.limit） */
export function requiredTargetCount(reg: EngineRegistry, cardId: string): number {
  const spec = targetSpecOf(reg, cardId);
  if (!spec) return 0;
  if (spec.kind === 'query' && typeof spec.limit === 'number') return Math.max(1, spec.limit);
  return 1;
}

export function legalActionsForCard(
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
  instance: CardInstance,
): LegalAction {
  const def = getDef(reg, instance.cardId)!;
  const cost = playCost(state, reg, player, instance);
  const spec = targetSpecOf(reg, instance.cardId);
  const refs = resolveLegalTargetRefs(state, reg, player, spec);
  const count = requiredTargetCount(reg, instance.cardId);
  const requiresTarget = !!spec;
  if (requiresTarget && refs.length < count) {
    return {
      kind: 'playCard',
      label: def.nameZh,
      cardInstanceId: instance.instanceId,
      detail: '没有足够合法目标',
      cost,
      targets: { mode: 'target', refs: [], count, hint: '没有足够合法目标' },
    };
  }
  const action: LegalAction = {
    kind: 'playCard',
    label: def.nameZh,
    cardInstanceId: instance.instanceId,
    cost,
    targets: requiresTarget ? { mode: 'target', refs, count } : { mode: 'none', refs: [] },
  };
  if (!isOrderCardType(def.type)) {
    action.deployLines = legalDeployLines(state, player);
  }
  return action;
}

export function legalActions(state: GameState, reg: EngineRegistry, player: PlayerIndex): LegalAction[] {
  if (state.status !== 'playing') return [];
  if (state.activePlayer !== player) return [];
  if (state.pendingChoice) return [];
  const actions: LegalAction[] = [];
  const p = state.players[player];
  const deployLocked = (p.trackers['restrict:deploy:untilTurn'] ?? 0) >= state.turn;
  const attackLocked = (p.trackers['restrict:attack:untilTurn'] ?? 0) >= state.turn;
  for (const instance of p.hand) {
    const def = getDef(reg, instance.cardId);
    if (!def) continue;
    // 被反制封锁部署时，单位卡不可打出（指令/反制仍可用）
    if (deployLocked && !isOrderCardType(def.type)) continue;
    const cost = playCost(state, reg, player, instance);
    if (cost > p.kredits) continue;
    const action = legalActionsForCard(state, reg, player, instance);
    if (action.targets?.mode === 'target') {
      const required = action.targets.count ?? 1;
      if (action.targets.refs.length < required) continue;
    }
    if (action.deployLines && action.deployLines.length === 0) continue;
    actions.push(action);
  }
  for (const unit of playerUnits(state, player)) {
    if (attackLocked) break;
    if (!canUnitAttack(state, unit)) continue;
    const refs = legalAttackTargets(state, reg, unit);
    if (refs.length === 0) continue;
    actions.push({
      kind: 'attack',
      label: `${nameOfUnit(state, reg, unit)}`,
      attackerId: unit.unitId,
      targets: { mode: 'target', refs, count: 1 },
    });
  }
  // 移动（每单位每回合一次；花费见 config.moveCostsKredits）
  for (const unit of playerUnits(state, player)) {
    if (unit.movedThisTurn) continue;
    if (unit.hp <= 0) continue;
    // 召唤病：部署当回合不能移动，除非具有闪击（或冲击）
    if (unit.deployedTurn === state.turn && !hasKeyword(unit, 'blitz') && !hasKeyword(unit, 'shock')) continue;
    const cost = state.config.moveCostsKredits ? getOperationCost(unit) : 0;
    if (p.kredits < cost) continue;
    const toLine: Line | null =
      unit.line === 'support'
        ? canDeployToFrontline(state, player)
          ? 'frontline'
          : null
        : lineSpace(state, player, 'support') > 0
          ? 'support'
          : null;
    if (!toLine) continue;
    actions.push({
      kind: 'moveUnit',
      label: `移动：${getDef(reg, unit.cardId)?.nameZh ?? unit.cardId} → ${toLine === 'frontline' ? '前线' : '支援线'}`,
      unitId: unit.unitId,
      cost,
    });
  }
  actions.push({ kind: 'endTurn', label: '结束回合' });
  return actions;
}

export function nameOfUnit(state: GameState, reg: EngineRegistry, unit: Unit): string {
  const def = getDef(reg, unit.cardId);
  return `攻击：${def?.nameZh ?? unit.cardId}`;
}

/** 解析目标引用得到单位（HQ 返回 null） */
export function targetUnit(state: GameState, ref: TargetRef): Unit | undefined {
  return ref.kind === 'unit' ? state.units[ref.unitId] : undefined;
}

/** 判断 TargetRef 是否包含在合法列表内 */
export function isRefIn(ref: TargetRef, list: TargetRef[]): boolean {
  return list.some((r) => {
    if (r.kind === 'hq' && ref.kind === 'hq') return r.player === ref.player;
    if (r.kind === 'unit' && ref.kind === 'unit') return r.unitId === ref.unitId;
    if (r.kind === 'card' && ref.kind === 'card') return r.instanceId === ref.instanceId;
    return false;
  });
}

/** 随机挑选（可复现） */
export function pickRandom<T>(state: GameState, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  const idx = Math.floor(randomValue(state) * items.length);
  return items[Math.min(items.length - 1, Math.max(0, idx))];
}

export function isUnitCardDef(def: CardDef): boolean {
  return !!def && !isOrderCardType(def.type);
}

export function scriptOf(reg: EngineRegistry, cardId: string): CardScript | undefined {
  return getScript(reg, cardId);
}

export function isAir(reg: EngineRegistry, unit: Unit): boolean {
  return isAirType(attackerType(reg, unit));
}

export function isGround(reg: EngineRegistry, unit: Unit): boolean {
  return isGroundType(attackerType(reg, unit));
}

/** 解释某个单位当前为什么不能行动（供 UI 提示） */
export function unitActionBlockers(
  state: GameState,
  reg: EngineRegistry,
  unit: Unit,
): string[] {
  const reasons: string[] = [];
  const player = state.players[unit.owner];
  if (state.status !== 'playing') reasons.push('对局已结束');
  if (state.activePlayer !== unit.owner) reasons.push('不是你的回合');
  if (unit.attacksUsed >= unit.maxAttacks) reasons.push('本回合已行动');
  if (unit.deployedTurn === state.turn && !hasKeyword(unit, 'blitz') && !hasKeyword(unit, 'shock')) {
    reasons.push('本回合部署（无闪击，无法行动）');
  }
  if (unit.statuses.pinned) reasons.push('被压制，无法行动');
  if (state.config.attackCostsKredits && player.kredits < getOperationCost(unit)) {
    reasons.push(`克雷迪特不足（行动花费 ${getOperationCost(unit)}）`);
  }
  return reasons;
}

/** 解释攻击目标为空的原因（供 UI 提示） */
export function explainNoAttackTargets(
  state: GameState,
  reg: EngineRegistry,
  unit: Unit,
): string {
  const enemy = opponentOf(unit.owner);
  const enemyUnits = playerUnits(state, enemy);
  const attackerKind = attackerType(reg, unit);
  const enemyFront = enemyUnits.filter((u) => u.line === 'frontline');
  const enemySupport = enemyUnits.filter((u) => u.line === 'support');
  const reasons: string[] = [];
  if (enemyUnits.length === 0) reasons.push('敌方场上没有单位');
  if (attackerKind === 'infantry' || attackerKind === 'tank') {
    if (unit.line === 'support' && enemyFront.length === 0) {
      reasons.push('你在支援线：只能攻击敌方前线单位；先把本单位移动到前线，才能攻击敌方支援线/总部');
    }
    if (unit.line === 'support' && enemySupport.length > 0 && enemyFront.length === 0) {
      reasons.push('敌方单位都在支援线，被前排保护');
    }
    if (state.config.hqAttackRequiresFrontline && unit.line !== 'frontline') {
      reasons.push('攻击总部需要本单位位于前线');
    }
  }
  if (enemyUnits.length > 0 && legalAttackTargets(state, reg, unit).length === 0) {
    reasons.push('当前没有合法目标（可能被守护/烟幕/伏击保护，或战线不相邻）');
  }
  return reasons.join('；') || '没有可攻击的目标';
}
