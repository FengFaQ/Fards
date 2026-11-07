/**
 * 引擎状态层：纯状态变换工具（不含卡牌触发逻辑）。
 * 触发/连锁在 effects/executor.ts，回合与指令在 game.ts。
 */
import type {
  CardDef,
  CardInstance,
  CardInstanceId,
  CardScript,
  EngineRegistry,
  GameConfig,
  GameEvent,
  GameLogEntry,
  GameSetup,
  GameSetupPlayer,
  GameState,
  PlayerIndex,
  PlayerState,
  Unit,
  UnitId,
} from './types';
import { DEFAULT_CONFIG } from './types';
import { getKeywordValue, hasKeyword, normalizeKeywords } from './keywords';
import { seedFrom, nextRandom } from './rng';

export { getDef, getScript };
export type { EngineRegistry };

/** 模块级注册表引用（仅用于日志显示，不进入状态） */
let registryRef: EngineRegistry | null = null;

export function setRegistry(reg: EngineRegistry): void {
  registryRef = reg;
}

export function nameOf(cardId: string): string {
  if (!registryRef) return cardId;
  const def = registryRef.cardDefs[cardId];
  return def?.nameZh || def?.nameEn || cardId;
}

function getDef(reg: EngineRegistry, cardId: string): CardDef | undefined {
  return reg.cardDefs[cardId];
}

function getScript(reg: EngineRegistry, cardId: string): CardScript | undefined {
  return reg.scripts[cardId];
}

// ============================================================
// 基础访问器
// ============================================================

export function opponentOf(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}

export function nextId(state: GameState): number {
  state.nextId += 1;
  return state.nextId;
}

export function getUnit(state: GameState, unitId: UnitId): Unit | undefined {
  return state.units[unitId];
}

export function lineUnits(state: GameState, player: PlayerIndex, line: 'frontline' | 'support'): Unit[] {
  return state.players[player][line]
    .map((id) => state.units[id])
    .filter((u): u is Unit => !!u);
}

export function playerUnits(state: GameState, player: PlayerIndex): Unit[] {
  return [...lineUnits(state, player, 'frontline'), ...lineUnits(state, player, 'support')];
}

export function allUnits(state: GameState): Unit[] {
  return Object.values(state.units);
}

export function cardDefName(reg: EngineRegistry, cardId: string): string {
  const def = getDef(reg, cardId);
  return def?.nameZh || def?.nameEn || cardId;
}

export function addLog(
  state: GameState,
  player: PlayerIndex | null,
  kind: GameLogEntry['kind'],
  text: string,
): GameLogEntry {
  const entry: GameLogEntry = { id: state.log.length + 1, turn: state.turn, player, kind, text };
  state.log.push(entry);
  if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
  return entry;
}

export function randomValue(state: GameState): number {
  const [value, next] = nextRandom(state.rngState);
  state.rngState = next;
  return value;
}

export function shuffleInPlace<T>(state: GameState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomValue(state) * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// ============================================================
// 克雷迪特（指挥点）
// ============================================================

export function canAfford(state: GameState, player: PlayerIndex, amount: number): boolean {
  return amount <= 0 || state.players[player].kredits >= amount;
}

export function payKredits(state: GameState, player: PlayerIndex, amount: number): boolean {
  const p = state.players[player];
  if (amount <= 0) return true;
  if (p.kredits < amount) return false;
  p.kredits -= amount;
  p.kreditsSpentThisTurn += amount;
  return true;
}

export function gainKredits(state: GameState, player: PlayerIndex, amount: number, permanent = false): void {
  const p = state.players[player];
  p.kredits += amount;
  if (permanent) p.maxKredits = Math.min(state.config.kreditHardCap, p.maxKredits + amount);
}

// ============================================================
// 卡牌实例与单位
// ============================================================

export function createCardInstance(
  state: GameState,
  cardId: string,
  owner: PlayerIndex,
  source: 'deck' | 'token' | 'created' = 'deck',
): CardInstance {
  const instance: CardInstance = {
    instanceId: `c${nextId(state)}`,
    cardId,
    owner,
    source,
  };
  state.cards[instance.instanceId] = instance;
  return instance;
}

export interface MakeUnitOptions {
  instanceId?: CardInstanceId;
  token?: boolean;
  deployedTurn?: number;
  /** 不触发召唤病（用于效果召唤） */
  ready?: boolean;
}

export function makeUnit(
  state: GameState,
  reg: EngineRegistry,
  owner: PlayerIndex,
  cardId: string,
  line: 'frontline' | 'support',
  options: MakeUnitOptions = {},
): Unit | null {
  const def = getDef(reg, cardId);
  if (!def) return null;
  const script = getScript(reg, cardId);
  const baseKeywords = normalizeKeywords(def.attributes);
  for (const kw of script?.keywords ?? []) if (!baseKeywords.includes(kw)) baseKeywords.push(kw);

  const instanceId = options.instanceId ?? createCardInstance(state, cardId, owner, 'token').instanceId;
  if (!state.cards[instanceId]) {
    state.cards[instanceId] = { instanceId, cardId, owner, source: 'token' };
  }

  const unit: Unit = {
    unitId: `u${nextId(state)}`,
    instanceId,
    cardId,
    owner,
    line,
    position: 0,
    baseAttack: Math.max(0, def.attack),
    baseHp: Math.max(1, def.defense),
    buffAttack: 0,
    buffHp: 0,
    auraAttack: 0,
    auraHp: 0,
    attack: Math.max(0, def.attack),
    hp: Math.max(1, def.defense),
    maxHp: Math.max(1, def.defense),
    armor: 0,
    baseKeywords,
    auraKeywords: [],
    keywords: baseKeywords.slice(),
    attacksUsed: 0,
    maxAttacks: hasKeyword({ keywords: baseKeywords }, 'fury') ? 2 : state.config.attacksPerTurn,
    deployedTurn: options.deployedTurn ?? state.turn,
    movedThisTurn: false,
    operationCost: Math.max(0, def.operationCost ?? 0),
    statuses: {},
    trackers: {},
    silenced: false,
    ambush: hasKeyword({ keywords: baseKeywords }, 'ambush'),
    token: options.token,
  };
  state.units[unit.unitId] = unit;
  recalcUnit(unit);
  return unit;
}

/** 从手牌/卡组实例创建单位（复用实例 id） */
export function makeUnitFromInstance(
  state: GameState,
  reg: EngineRegistry,
  owner: PlayerIndex,
  instance: CardInstance,
  line: 'frontline' | 'support',
  options: MakeUnitOptions = {},
): Unit | null {
  const unit = makeUnit(state, reg, owner, instance.cardId, line, { ...options, instanceId: instance.instanceId });
  return unit;
}

export function placeUnit(
  state: GameState,
  unit: Unit,
  line: 'frontline' | 'support',
  slot?: number,
): void {
  const arr = state.players[unit.owner][line];
  const index = typeof slot === 'number' ? Math.max(0, Math.min(slot, arr.length)) : arr.length;
  arr.splice(index, 0, unit.unitId);
  unit.line = line;
  refreshPositions(state, unit.owner, line);
  updateFrontlineController(state);
}

function refreshPositions(state: GameState, player: PlayerIndex, line: 'frontline' | 'support'): void {
  state.players[player][line].forEach((id, index) => {
    const unit = state.units[id];
    if (unit) unit.position = index;
  });
}

export function removeUnitFromBoard(state: GameState, unitId: UnitId): Unit | null {
  const unit = state.units[unitId];
  if (!unit) return null;
  const arr = state.players[unit.owner][unit.line];
  const idx = arr.indexOf(unitId);
  if (idx >= 0) arr.splice(idx, 1);
  refreshPositions(state, unit.owner, unit.line);
  delete state.units[unitId];
  updateFrontlineController(state);
  return unit;
}

/** 前线共享 5 槽、同一时间只有一方占领 */
export function updateFrontlineController(state: GameState): void {
  const a = state.players[0].frontline.length;
  const b = state.players[1].frontline.length;
  state.frontlineController = a > 0 && b === 0 ? 0 : b > 0 && a === 0 ? 1 : null;
}

/** 前线已被占用的槽位总数 */
export function frontlineUsed(state: GameState): number {
  return state.players[0].frontline.length + state.players[1].frontline.length;
}

/** 把卡牌实例放入弃牌堆（衍生物直接消失） */
export function discardInstance(state: GameState, instanceId: CardInstanceId): void {
  const instance = state.cards[instanceId];
  if (!instance) return;
  const p = state.players[instance.owner];
  if (p.hand.some((c) => c.instanceId === instanceId)) {
    p.hand = p.hand.filter((c) => c.instanceId !== instanceId);
  }
  if (p.deck.some((c) => c.instanceId === instanceId)) {
    p.deck = p.deck.filter((c) => c.instanceId !== instanceId);
  }
  if (instance.source !== 'token') p.discard.push(instance);
}

/** 单位离场并进入弃牌堆（不处理亡语触发，由 executor 负责） */
export function leaveBoard(state: GameState, unitId: UnitId): Unit | null {
  const unit = removeUnitFromBoard(state, unitId);
  if (!unit) return null;
  discardInstance(state, unit.instanceId);
  return unit;
}

// ============================================================
// 数值计算
// ============================================================

export function recalcUnit(unit: Unit): void {
  unit.attack = Math.max(0, unit.baseAttack + unit.buffAttack + unit.auraAttack);
  const newMax = Math.max(1, unit.baseHp + unit.buffHp + unit.auraHp);
  if (newMax !== unit.maxHp) {
    const delta = newMax - unit.maxHp;
    unit.maxHp = newMax;
    if (delta > 0) unit.hp += delta;
    else unit.hp = Math.min(unit.hp, newMax);
  }
  unit.armor = getKeywordValue(unit, 'heavyArmor') + (unit.trackers.armorBonus ?? 0);
  const effectiveKeywords = [...unit.baseKeywords, ...unit.auraKeywords];
  unit.keywords = Array.from(new Set(effectiveKeywords));
}

export function allKeywords(unit: Unit): string[] {
  return unit.keywords;
}

// ============================================================
// 抽牌 / 伤害 / 治疗（低级原语，不做触发）
// ============================================================

export function drawCardInternal(state: GameState, player: PlayerIndex, events: GameEvent[]): void {
  const p = state.players[player];
  if (p.deck.length === 0) {
    p.fatigue += state.config.fatigueBase;
    damageHQInternal(state, player, p.fatigue, events);
    events.push({ type: 'damage', target: { kind: 'hq', player }, amount: p.fatigue });
    addLog(state, player, 'damage', `牌库已空，疲劳伤害 ${p.fatigue}`);
    return;
  }
  const card = p.deck.shift()!;
  events.push({ type: 'draw', player, instanceId: card.instanceId });
  if (p.hand.length >= state.config.handLimit) {
    p.discard.push(card);
    addLog(state, player, 'draw', `手牌已满，${card.cardId} 被烧掉`);
    return;
  }
  p.hand.push(card);
  p.drawnThisTurn += 1;
}

export function damageHQInternal(
  state: GameState,
  player: PlayerIndex,
  amount: number,
  events: GameEvent[],
): number {
  if (amount <= 0 || state.status === 'finished') return 0;
  const hq = state.players[player].hq;
  const dealt = Math.max(0, amount - hq.armor);
  if (dealt <= 0) return 0;
  hq.hp -= dealt;
  addLog(state, player, 'damage', `总部受到 ${dealt} 点伤害（剩余 ${Math.max(0, hq.hp)}）`);
  if (hq.hp <= 0) {
    hq.hp = 0;
    finishGame(state, opponentOf(player), 'hq_destroyed', events);
  }
  return dealt;
}

export function damageUnitInternal(
  state: GameState,
  unitId: UnitId,
  amount: number,
  events: GameEvent[],
  options: { ignoreArmor?: boolean } = {},
): { dealt: number; killed: boolean } {
  const unit = state.units[unitId];
  if (!unit || state.status === 'finished') return { dealt: 0, killed: false };
  const armor = options.ignoreArmor ? 0 : unit.armor;
  const reduction = armor + (unit.trackers.damageReduction ?? 0);
  const dealt = Math.max(0, amount - reduction);
  if (dealt <= 0) return { dealt: 0, killed: false };
  unit.hp -= dealt;
  addLog(state, unit.owner, 'damage', `${nameOf(unit.cardId)} 受到 ${dealt} 点伤害`);
  return { dealt, killed: unit.hp <= 0 };
}

export function healUnitInternal(state: GameState, unitId: UnitId, amount: number, events: GameEvent[]): number {
  const unit = state.units[unitId];
  if (!unit) return 0;
  const before = unit.hp;
  unit.hp = Math.min(unit.maxHp, unit.hp + amount);
  return unit.hp - before;
}

export function buffUnit(
  unit: Unit,
  attack: number,
  hp: number,
  permanent: boolean,
): void {
  if (permanent) {
    unit.buffAttack += attack;
    unit.buffHp += hp;
  } else {
    unit.auraAttack += attack;
    unit.auraHp += hp;
  }
  recalcUnit(unit);
}

// ============================================================
// 胜负
// ============================================================

export function finishGame(
  state: GameState,
  winner: PlayerIndex | null,
  reason: 'hq_destroyed' | 'concede' | 'draw' | 'deck_out',
  events: GameEvent[],
): void {
  if (state.status === 'finished') return;
  state.status = 'finished';
  state.winner = winner;
  state.endReason = reason;
  events.push({ type: 'gameOver', winner, reason });
  addLog(state, null, 'system', winner === null ? '对局结束：平局' : `对局结束：玩家 ${winner + 1} 获胜（${reason}）`);
}

export function checkGameOver(state: GameState, events: GameEvent[]): void {
  if (state.status === 'finished') return;
  const dead = state.players.findIndex((p) => p.hq.hp <= 0);
  if (dead >= 0) {
    // 双方同时死亡 → 平局
    const bothDead = state.players.every((p) => p.hq.hp <= 0);
    finishGame(state, bothDead ? null : opponentOf(dead as PlayerIndex), 'hq_destroyed', events);
  }
}

// ============================================================
// 创建对局
// ============================================================

function makePlayerState(index: PlayerIndex, setup: GameSetupPlayer): PlayerState {
  return {
    index,
    name: setup.name,
    faction: setup.faction,
    allyFaction: setup.allyFaction,
    hq: { hp: 0, maxHp: 0, armor: 0 },
    kredits: 0,
    maxKredits: 0,
    deck: [],
    hand: [],
    discard: [],
    support: [],
    frontline: [],
    counters: [],
    fatigue: 0,
    drawnThisTurn: 0,
    deployedThisTurn: 0,
    kreditsSpentThisTurn: 0,
    trackers: {},
  };
}

export function createGame(setup: GameSetup, reg: EngineRegistry): { state: GameState; events: GameEvent[] } {
  const config: GameConfig = { ...DEFAULT_CONFIG, ...(setup.config ?? {}) };
  const seed = seedFrom(setup.seed);
  const firstPlayer: PlayerIndex = setup.firstPlayer ?? 0;

  const state: GameState = {
    schemaVersion: 1,
    status: 'playing',
    winner: null,
    config,
    seed,
    rngState: seed,
    firstPlayer,
    trackers: {},
    turn: 0,
    round: 0,
    activePlayer: firstPlayer,
    players: [makePlayerState(0, setup.players[0]), makePlayerState(1, setup.players[1])],
    units: {},
    cards: {},
    frontlineController: null,
    pendingChoice: null,
    scheduled: [],
    log: [],
    nextId: 0,
  };
  // 让日志/卡名可读（模块级注册表，不进入状态）
  setRegistry(reg);

  for (const pi of [0, 1] as PlayerIndex[]) {
    const p = state.players[pi];
    p.hq = { hp: config.hqHp, maxHp: config.hqHp, armor: 0 };
    const expanded: CardInstance[] = [];
    for (const entry of setup.players[pi].deck) {
      for (let i = 0; i < Math.max(0, entry.count); i++) {
        const def = getDef(reg, entry.cardId);
        if (!def) continue;
        expanded.push(createCardInstance(state, entry.cardId, pi, 'deck'));
      }
    }
    shuffleInPlace(state, expanded);
    p.deck = expanded;
  }

  const events: GameEvent[] = [];
  // 初始手牌
  for (const pi of [0, 1] as PlayerIndex[]) {
    const count = config.startingHandSize + (pi === firstPlayer ? 0 : config.secondPlayerExtraCards);
    for (let i = 0; i < count; i++) drawCardInternal(state, pi, events);
  }

  startTurnInternal(state, firstPlayer, events, { initial: true });
  addLog(state, null, 'system', '对局开始。' + `玩家1=${setup.players[0].faction}，玩家2=${setup.players[1].faction}`);
  checkGameOver(state, events);
  return { state, events };
}

// ============================================================
// 回合资源处理（触发由 game.ts 负责）
// ============================================================

export interface StartTurnOptions {
  initial?: boolean;
}

export function startTurnInternal(
  state: GameState,
  player: PlayerIndex,
  events: GameEvent[],
  options: StartTurnOptions = {},
): void {
  state.activePlayer = player;
  state.turn += 1;
  if (player === state.firstPlayer) state.round += 1;
  const p = state.players[player];
  if (options.initial) {
    p.maxKredits = state.config.startingKredits + (player === state.firstPlayer ? 0 : state.config.secondPlayerKredits);
  } else {
    p.maxKredits = Math.min(state.config.kreditCap, p.maxKredits + state.config.kreditGrowth);
  }  p.kredits = p.maxKredits;
  p.kreditsSpentThisTurn = 0;
  p.drawnThisTurn = 0;
  p.deployedThisTurn = 0;
  for (const unit of playerUnits(state, player)) {
    unit.attacksUsed = 0;
    unit.movedThisTurn = false;
    unit.statuses = {};
  }
  events.push({ type: 'turnStart', player, turn: state.turn });
  events.push({ type: 'kredit', player, amount: p.maxKredits });
  addLog(state, player, 'system', `—— 玩家 ${player + 1} 回合开始（克雷迪特 ${p.kredits}/${p.maxKredits}）——`);

  const skipDraw = options.initial && player === state.firstPlayer && state.config.firstTurnSkipsDraw;
  if (!skipDraw) drawCardInternal(state, player, events);
}

/** 结束回合的纯状态部分（触发在 game.ts） */
export function endTurnInternal(state: GameState, player: PlayerIndex, events: GameEvent[]): void {
  events.push({ type: 'turnEnd', player });
  addLog(state, player, 'system', `玩家 ${player + 1} 结束回合`);
}
