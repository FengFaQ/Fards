/**
 * AI 自测（真实卡牌数据 + 真实脚本注册表）
 * ------------------------------------------------------------------
 * 覆盖：
 * 1. aiDeckPreset：39 张 / 稀有度上限 / 盟军上限 / 同 seed 可复现
 * 2. chooseAIAction 契约：返回的指令必然能被 applyCommand 接受（整局无一条空转指令）
 * 3. pendingChoice：option / unit / card 三种模式都返回合法 resolveChoice
 * 4. 斩杀优先、多目标卡填满 target count、确定性（同 state 同指令）、不使用 Math.random
 * 5. 不做信息作弊：改写对手手牌内容不改变决策
 * 6. 性能：单次调用 < 50ms（hard 也达标）
 * 7. 200 局 AI vs AI：全部结束且 ≤400 指令、胜率 35%~65%、平局 <10%、平均局长 8~30 回合
 * 8. 20 局 hard vs normal / 20 局 easy vs normal：报胜率
 *
 * 数据来源：public/data/cards.json（Node 直接读）+ src/engine/cards 的 CARD_SCRIPTS。
 * 不依赖 UI 层，不修改引擎状态。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CardDef,
  CardScript,
  EngineRegistry,
  GameCommand,
  GameSetup,
  GameState,
  PlayerIndex,
  Unit,
} from './types';
import { applyCommand, createGame, legalActions } from './index';
import { CARD_SCRIPTS } from '@/engine/cards';
import { AI_DECK_SIZE, aiDeckPreset, chooseAIAction, type AIDifficulty } from './ai';
import { RARITY_COPY_CAP, MAX_ALLY_CARDS, normalizeFactionName } from './ai/deck';
import { MAX_CANDIDATES } from './ai/candidates';

// ============================================================
// 数据准备
// ============================================================

const DATA_PATH = path.resolve(process.cwd(), 'public/data/cards.json');

function loadCards(): CardDef[] {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const parsed = JSON.parse(raw) as CardDef[];
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('cards.json 为空或格式异常');
  return parsed;
}

const ALL_CARDS = loadCards();
const CARD_DEFS: Record<string, CardDef> = {};
for (const card of ALL_CARDS) CARD_DEFS[card.cardId] = card;

const REG: EngineRegistry = { cardDefs: CARD_DEFS, scripts: CARD_SCRIPTS };

/** 五大主阵营（真实卡池足够组 39 张卡组） */
const FACTIONS = ['Germany', 'USA', 'Britain', 'Japan', 'Soviet'] as const;

/** 从真实卡池给某阵营组 39 张合法 AI 卡组（seed 固定 → 卡组固定） */
function buildAIvsAIDeck(faction: string, seed = 1): { cardId: string; count: number }[] {
  return aiDeckPreset(faction, ALL_CARDS, seed);
}

/** 取一张真实步兵卡（测试里手动摆场面时用作占位卡） */
function infantryCardId(): string {
  const found = ALL_CARDS.find((card) => card.type === 'infantry' && card.pool === 'active');
  return found ? found.cardId : Object.keys(CARD_DEFS)[0];
}

function makeSetup(seed: number, fa: string, fb: string): GameSetup {
  return {
    seed,
    firstPlayer: (seed % 2) as PlayerIndex,
    players: [
      { name: 'AI-1', faction: fa, allyFaction: null, deck: buildAIvsAIDeck(fa, seed * 13 + 1) },
      { name: 'AI-2', faction: fb, allyFaction: null, deck: buildAIvsAIDeck(fb, seed * 17 + 7) },
    ],
  };
}

/** 造一个可行动的单位（测试里手动摆场面用） */
function makeTestUnit(
  unitId: string,
  owner: PlayerIndex,
  attack: number,
  hp: number,
  line: 'frontline' | 'support' = 'frontline',
): Unit {
  return {
    unitId,
    instanceId: `c_${unitId}`,
    cardId: infantryCardId(),
    owner,
    line,
    position: 0,
    baseAttack: attack,
    baseHp: hp,
    buffAttack: 0,
    buffHp: 0,
    auraAttack: 0,
    auraHp: 0,
    attack,
    hp,
    maxHp: hp,
    armor: 0,
    baseKeywords: [],
    auraKeywords: [],
    keywords: [],
    attacksUsed: 0,
    maxAttacks: 1,
    movedThisTurn: false,
    operationCost: 0,
    deployedTurn: 0,
    statuses: {},
    trackers: {},
    silenced: false,
  };
}

// ============================================================
// 对局驱动器
// ============================================================

/** 状态指纹：用于检测「指令被引擎忽略 / 空转」 */
function signature(state: GameState): string {
  return [
    state.turn,
    state.log.length,
    Object.keys(state.units).length,
    state.players[0].hq.hp,
    state.players[1].hq.hp,
    state.players[0].hand.length,
    state.players[1].hand.length,
    state.players[0].kredits,
    state.players[1].kredits,
    state.pendingChoice ? state.pendingChoice.choiceId : '-',
  ].join('|');
}

interface GameStats {
  seed: number;
  winner: PlayerIndex | null;
  /** state.round（双方各行动一次 = 1 回合） */
  rounds: number;
  /** state.turn（单个玩家回合数） */
  turns: number;
  commands: number;
  ended: boolean;
  endReason: string;
  errors: string[];
  /** 被引擎静默忽略（状态没变化）的指令 */
  noops: string[];
  pendingChoices: number;
  maxDecisionMs: number;
}

const COMMAND_CAP = 400;

function runGame(seed: number, d0: AIDifficulty, d1: AIDifficulty, fa: string, fb: string): GameStats {
  const stats: GameStats = {
    seed,
    winner: null,
    rounds: 0,
    turns: 0,
    commands: 0,
    ended: false,
    endReason: 'unfinished',
    errors: [],
    noops: [],
    pendingChoices: 0,
    maxDecisionMs: 0,
  };
  let state: GameState;
  try {
    state = createGame(makeSetup(seed, fa, fb), REG).state;
  } catch (error) {
    stats.errors.push(`createGame: ${String(error)}`);
    return stats;
  }

  let previous = signature(state);
  let consecutiveNoops = 0;
  while (state.status === 'playing' && stats.commands < COMMAND_CAP) {
    const player = state.activePlayer;
    if (state.pendingChoice) stats.pendingChoices += 1;
    let command: GameCommand | null = null;
    const startedAt = Date.now();
    try {
      command = chooseAIAction(state, REG, player, player === 0 ? d0 : d1);
    } catch (error) {
      stats.errors.push(`chooseAIAction(turn ${state.turn}): ${String(error)}`);
      break;
    }
    stats.maxDecisionMs = Math.max(stats.maxDecisionMs, Date.now() - startedAt);
    if (!command) {
      stats.errors.push(`chooseAIAction 返回 null（turn ${state.turn}, player ${player}）`);
      break;
    }
    try {
      state = applyCommand(state, command, REG).state;
    } catch (error) {
      stats.errors.push(`applyCommand ${JSON.stringify(command)}: ${String(error)}`);
      break;
    }
    stats.commands += 1;
    const current = signature(state);
    if (current === previous && state.status === 'playing') {
      consecutiveNoops += 1;
      if (stats.noops.length < 5) stats.noops.push(JSON.stringify(command));
    } else {
      consecutiveNoops = 0;
    }
    previous = current;
    if (consecutiveNoops >= 4) {
      stats.errors.push(`连续 4 条指令未改变状态（turn ${state.turn}）`);
      break;
    }
  }

  stats.ended = state.status === 'finished';
  stats.winner = state.winner;
  stats.rounds = state.round;
  stats.turns = state.turn;
  stats.endReason = state.endReason ? String(state.endReason) : 'unfinished';
  return stats;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

// ============================================================
// 1. 卡组预置
// ============================================================

describe('AI 卡组预置 aiDeckPreset', () => {
  it('五个主阵营都能组出 39 张合法卡组', () => {
    for (const faction of FACTIONS) {
      const deck = buildAIvsAIDeck(faction, 7);
      const total = deck.reduce((sum, card) => sum + card.count, 0);
      expect(total, `${faction} 卡组张数`).toBe(AI_DECK_SIZE);
      expect(deck.length, `${faction} 不应有重复 cardId`).toBe(new Set(deck.map((c) => c.cardId)).size);

      let allyCards = 0;
      const main = normalizeFactionName(faction);
      for (const entry of deck) {
        const def = CARD_DEFS[entry.cardId];
        expect(def, `${faction} 卡组含未知卡 ${entry.cardId}`).toBeTruthy();
        expect(entry.count, `${entry.cardId} 副本数`).toBeLessThanOrEqual(RARITY_COPY_CAP[def.rarity] ?? 4);
        const own = normalizeFactionName(def.faction);
        const hosts = (def.hostFactions ?? []).map((host) => normalizeFactionName(String(host)));
        const legal = own === main || hosts.includes(main) || own === 'Neutral';
        expect(legal, `${entry.cardId} 不属于 ${faction} 可用卡`).toBe(true);
        expect(def.isDerived ?? false).toBe(false);
        expect(def.pool).toBe('active');
        if (own !== main && own !== 'Neutral') allyCards += entry.count;
      }
      expect(allyCards, `${faction} 盟军卡张数上限`).toBeLessThanOrEqual(MAX_ALLY_CARDS);
    }
  });

  it('同 seed 可复现，不同 seed 通常不同', () => {
    const a = buildAIvsAIDeck('Germany', 11);
    const b = buildAIvsAIDeck('Germany', 11);
    expect(b).toEqual(a);
    const c = buildAIvsAIDeck('Germany', 12);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('不依赖 Math.random（避免复盘不一致）', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('aiDeckPreset 不得使用 Math.random');
    };
    try {
      expect(buildAIvsAIDeck('USA', 3).length).toBeGreaterThan(0);
    } finally {
      Math.random = original;
    }
  });
});

// ============================================================
// 2. chooseAIAction 契约
// ============================================================

describe('chooseAIAction 契约', () => {
  it('三种难度整局驱动：没有任何指令被引擎静默忽略', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as AIDifficulty[]) {
      const stats = runGame(1234, difficulty, difficulty, 'Germany', 'Soviet');
      expect(stats.errors, `${difficulty} 对局异常`).toEqual([]);
      expect(stats.noops, `${difficulty} 出现空转指令`).toEqual([]);
      expect(stats.ended, `${difficulty} 对局未结束（${stats.endReason}）`).toBe(true);
    }
  });

  it('非自己回合 / 对局结束 → 返回 null', () => {
    const { state } = createGame(makeSetup(77, 'USA', 'Japan'), REG);
    expect(chooseAIAction(state, REG, (1 - state.activePlayer) as PlayerIndex, 'normal')).toBeNull();
    const finished = structuredClone(state);
    finished.status = 'finished';
    expect(chooseAIAction(finished, REG, finished.activePlayer, 'normal')).toBeNull();
  });

  it('没有可用动作时返回 endTurn', () => {
    const { state } = createGame(makeSetup(88, 'Germany', 'USA'), REG);
    const stuck = structuredClone(state);
    const me = stuck.activePlayer;
    stuck.players[me].hand = [];
    stuck.players[me].kredits = 0;
    stuck.players[me].frontline = [];
    stuck.players[me].support = [];
    const command = chooseAIAction(stuck, REG, me, 'normal');
    expect(command).toEqual({ type: 'endTurn', player: me });
  });

  it('斩杀优先：能击杀敌方 HQ 时打 HQ', () => {
    const { state } = createGame(makeSetup(99, 'Germany', 'USA'), REG);
    const me = state.activePlayer;
    const enemy = (1 - me) as PlayerIndex;
    const next = structuredClone(state);
    next.players[enemy].hq.hp = 3;
    next.players[me].kredits = 10;
    next.players[me].hand = [];
    const unit = makeTestUnit('u_test_lethal', me, 5, 5);
    unit.deployedTurn = next.turn - 1;
    next.units[unit.unitId] = unit;
    next.players[me].frontline = [unit.unitId];

    const command = chooseAIAction(next, REG, me, 'normal');
    expect(command).not.toBeNull();
    expect(command!.type).toBe('attack');
    if (command && command.type === 'attack') {
      expect(command.target).toEqual({ kind: 'hq', player: enemy });
    }
  });

  it('同 state 同难度 → 同指令（确定性）、且不使用 Math.random', () => {
    const { state } = createGame(makeSetup(2024, 'Britain', 'Japan'), REG);
    const clone = structuredClone(state);
    const original = Math.random;
    Math.random = () => {
      throw new Error('chooseAIAction 不得使用 Math.random');
    };
    try {
      for (const difficulty of ['easy', 'normal', 'hard'] as AIDifficulty[]) {
        const a = chooseAIAction(state, REG, state.activePlayer, difficulty);
        const b = chooseAIAction(clone, REG, clone.activePlayer, difficulty);
        expect(b).toEqual(a);
      }
    } finally {
      Math.random = original;
    }
  });
});

// ============================================================
// 3. pendingChoice
// ============================================================

describe('pendingChoice 结算', () => {
  function stateWithChoice(mode: 'option' | 'unit' | 'card'): GameState {
    const { state } = createGame(makeSetup(555, 'Germany', 'USA'), REG);
    const me = state.activePlayer;
    const enemy = (1 - me) as PlayerIndex;
    const next = structuredClone(state);
    const mine = makeTestUnit('u_mine', me, 2, 2);
    const theirs = makeTestUnit('u_theirs', enemy, 3, 3);
    next.units[mine.unitId] = mine;
    next.units[theirs.unitId] = theirs;
    next.players[me].frontline = [mine.unitId];
    next.players[enemy].frontline = [theirs.unitId];

    if (mode === 'option') {
      next.pendingChoice = {
        choiceId: 'choiceX',
        player: me,
        prompt: '抉择：弃 1 张自己的牌 / 抽 2 张牌',
        mode: 'option',
        options: [
          { id: '0', label: '弃 1 张自己的牌' },
          { id: '1', label: '抽 2 张牌' },
        ],
        context: {
          branchOptions: [
            { effects: [{ op: 'discard', side: 'self', count: 1 }] },
            { effects: [{ op: 'draw', side: 'self', count: 2 }] },
          ],
        },
      };
    } else if (mode === 'unit') {
      next.pendingChoice = {
        choiceId: 'choiceX',
        player: me,
        prompt: '选择 1 个单位',
        mode: 'unit',
        unitCandidates: [mine.unitId, theirs.unitId],
        min: 1,
        max: 1,
        context: {},
      };
    } else {
      next.pendingChoice = {
        choiceId: 'choiceX',
        player: me,
        prompt: '选择 1 张手牌弃掉',
        mode: 'card',
        cardCandidates: next.players[me].hand.slice(0, 2).map((card) => card.instanceId),
        min: 1,
        max: 1,
        context: {},
      };
    }
    return next;
  }

  it('option 模式：选择对我方更有利的分支（抽 2 张 > 自弃 1 张）', () => {
    const state = stateWithChoice('option');
    const command = chooseAIAction(state, REG, state.activePlayer, 'normal');
    expect(command).not.toBeNull();
    expect(command!.type).toBe('resolveChoice');
    if (command && command.type === 'resolveChoice') {
      expect(command.choiceId).toBe('choiceX');
      expect(command.player).toBe(state.activePlayer);
      expect(command.selection).toEqual(['1']);
    }
  });

  it('unit 模式：返回候选单位 id', () => {
    const state = stateWithChoice('unit');
    const command = chooseAIAction(state, REG, state.activePlayer, 'normal');
    expect(command).not.toBeNull();
    expect(command!.type).toBe('resolveChoice');
    if (command && command.type === 'resolveChoice') {
      expect(state.pendingChoice!.unitCandidates).toContain(command.selection[0]);
    }
  });

  it('card 模式：返回候选手牌 id', () => {
    const state = stateWithChoice('card');
    const command = chooseAIAction(state, REG, state.activePlayer, 'normal');
    expect(command).not.toBeNull();
    expect(command!.type).toBe('resolveChoice');
    if (command && command.type === 'resolveChoice') {
      expect(state.pendingChoice!.cardCandidates).toContain(command.selection[0]);
    }
  });

  it('真实对局中出现的 pendingChoice 都能被 AI 结算', () => {
    let resolved = 0;
    for (let i = 0; i < 40; i++) {
      const stats = runGame(4000 + i, 'normal', 'normal', FACTIONS[i % 5], FACTIONS[(i + 2) % 5]);
      expect(stats.errors, `seed ${stats.seed}`).toEqual([]);
      resolved += stats.pendingChoices;
    }
    // 真实脚本里存在抉择卡，多局对局里应当至少出现过一次挂起选择
    expect(resolved).toBeGreaterThan(0);
  }, 120000);
});

// ============================================================
// 4. 多目标卡
// ============================================================

describe('多目标卡', () => {
  it('target count > 1 时填满目标且都来自 legalActions', () => {
    const synthDefs: Record<string, CardDef> = { ...CARD_DEFS };
    const synthScripts: Record<string, CardScript> = { ...CARD_SCRIPTS };
    const baseDef = CARD_DEFS[infantryCardId()];
    synthDefs['test_twin_shot'] = {
      ...baseDef,
      cardId: 'test_twin_shot',
      nameZh: '测试双发',
      type: 'order',
      kredits: 1,
      operationCost: 0,
      attack: 0,
      defense: 0,
      attributes: [],
      isDerived: false,
      pool: 'active',
      faction: 'Germany',
      hostFactions: ['Germany'],
    };
    synthScripts['test_twin_shot'] = {
      cardId: 'test_twin_shot',
      targetSpec: { kind: 'query', side: 'enemy', line: 'any', limit: 2 },
      abilities: [
        {
          trigger: 'order',
          effects: [{ op: 'damage', target: { kind: 'chosen' }, amount: 1 }],
        },
      ],
    };
    const synthReg: EngineRegistry = { cardDefs: synthDefs, scripts: synthScripts };

    let state = createGame(makeSetup(31337, 'Germany', 'USA'), synthReg).state;
    const me = state.activePlayer;
    const enemy = (1 - me) as PlayerIndex;

    // 手动摆两个敌方单位（确定性，不依赖敌方手牌运）
    const enemyA = makeTestUnit('u_enemy_a', enemy, 2, 2);
    const enemyB = makeTestUnit('u_enemy_b', enemy, 3, 3);
    state.units[enemyA.unitId] = enemyA;
    state.units[enemyB.unitId] = enemyB;
    state.players[enemy].frontline = [enemyA.unitId, enemyB.unitId];

    // 只留这张多目标指令并禁掉所有攻击
    const twin = { instanceId: 'c_test_twin', cardId: 'test_twin_shot', owner: me, source: 'created' as const };
    state.cards[twin.instanceId] = twin;
    state.players[me].hand = [twin];
    state.players[me].kredits = 10;
    for (const unit of Object.values(state.units)) {
      if (unit.owner === me) unit.attacksUsed = unit.maxAttacks;
    }

    const legal = legalActions(state, synthReg, me);
    const play = legal.find((action) => action.kind === 'playCard' && action.cardInstanceId === twin.instanceId);
    expect(play).toBeTruthy();
    expect(play!.targets!.mode).toBe('target');
    expect(play!.targets!.count).toBe(2);

    const command = chooseAIAction(state, synthReg, me, 'normal');
    expect(command).not.toBeNull();
    expect(command!.type).toBe('playCard');
    if (command && command.type === 'playCard') {
      expect(command.instanceId).toBe(twin.instanceId);
      expect(command.targets).toHaveLength(2);
      const refs = play!.targets!.refs;
      for (const target of command.targets ?? []) {
        expect(refs).toContainEqual(target);
      }
      const result = applyCommand(state, command, synthReg);
      expect(result.state.log.length).toBeGreaterThan(state.log.length);
    }
  });
});

// ============================================================
// 5. 不做信息作弊
// ============================================================

describe('信息可见性', () => {
  it('改写对手手牌内容不改变 AI 决策（只看 hand.length）', () => {
    let state = createGame(makeSetup(6060, 'Japan', 'Soviet'), REG).state;
    let steps = 0;
    while (state.status === 'playing' && state.turn < 6 && steps++ < 40) {
      const command = chooseAIAction(state, REG, state.activePlayer, 'normal');
      expect(command).not.toBeNull();
      if (!command) break;
      state = applyCommand(state, command, REG).state;
    }
    expect(state.status).toBe('playing');
    const me = state.activePlayer;
    const enemy = (1 - me) as PlayerIndex;
    const original = chooseAIAction(state, REG, me, 'normal');

    const tampered = structuredClone(state);
    const otherCardIds = ALL_CARDS.filter((card) => card.type !== 'order').map((card) => card.cardId);
    tampered.players[enemy].hand.forEach((instance, index) => {
      instance.cardId = otherCardIds[index % otherCardIds.length];
    });
    const after = chooseAIAction(tampered, REG, me, 'normal');
    expect(after).toEqual(original);
  });
});

// ============================================================
// 6. 性能
// ============================================================

describe('性能（<50ms/次）', () => {
  it('hard 难度单次决策耗时上限', () => {
    // 预热（JIT 编译 + 脚本缓存）
    for (let i = 0; i < 3; i++) {
      const warmup = runGame(800 + i, 'hard', 'hard', 'Germany', 'USA');
      expect(warmup.errors).toEqual([]);
    }
    const durations: number[] = [];
    for (let i = 0; i < 3; i++) {
      let state = createGame(makeSetup(900 + i, FACTIONS[i % 5], FACTIONS[(i + 1) % 5]), REG).state;
      while (state.status === 'playing') {
        const startedAt = Date.now();
        const command = chooseAIAction(state, REG, state.activePlayer, 'hard');
        durations.push(Date.now() - startedAt);
        if (!command) break;
        state = applyCommand(state, command, REG).state;
      }
    }
    expect(durations.length).toBeGreaterThan(50);
    const max = Math.max(...durations);
    const p95 = percentile(durations, 0.95);
    const avg = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    console.log(`[perf] hard 决策 ${durations.length} 次: max=${max}ms p95=${p95}ms avg=${avg.toFixed(2)}ms`);
    expect(max).toBeLessThan(50);
    expect(percentile(durations, 0.99)).toBeLessThan(50);
  }, 180000);
});

// ============================================================
// 7. AI vs AI 回归
// ============================================================

describe('AI vs AI 回归', () => {
  it('200 局 normal vs normal：全部结束、胜率均衡、局长合理', () => {
    const results: GameStats[] = [];
    for (let i = 0; i < 200; i++) {
      results.push(
        runGame(5000 + i, 'normal', 'normal', FACTIONS[i % FACTIONS.length], FACTIONS[(i + 2) % FACTIONS.length]),
      );
    }
    const finished = results.filter((stats) => stats.ended);
    const errors = results.flatMap((stats) => stats.errors);
    const noops = results.flatMap((stats) => stats.noops);
    const p0Wins = finished.filter((stats) => stats.winner === 0).length;
    const draws = finished.filter((stats) => stats.winner === null).length;
    const rounds = finished.map((stats) => stats.rounds);
    const avgRounds = rounds.reduce((sum, value) => sum + value, 0) / Math.max(1, rounds.length);
    const avgCommands = results.reduce((sum, stats) => sum + stats.commands, 0) / results.length;
    const maxCommands = Math.max(...results.map((stats) => stats.commands));
    const winRate = p0Wins / Math.max(1, finished.length);
    const drawRate = draws / Math.max(1, finished.length);
    const reasons: Record<string, number> = {};
    for (const stats of finished) reasons[stats.endReason] = (reasons[stats.endReason] ?? 0) + 1;

    console.log(
      `[ai-vs-ai 200局] finished=${finished.length}/200 winP0=${(winRate * 100).toFixed(1)}% draws=${(drawRate * 100).toFixed(1)}% ` +
        `avgRounds=${avgRounds.toFixed(2)} avgCommands=${avgCommands.toFixed(1)} maxCommands=${maxCommands} endReasons=${JSON.stringify(reasons)}`,
    );

    expect(errors, `对局异常：${errors.slice(0, 3).join(' | ')}`).toHaveLength(0);
    expect(noops, `出现空转指令：${noops.slice(0, 3).join(' | ')}`).toHaveLength(0);
    expect(finished.length, '有对局未在 400 条指令内结束').toBe(200);
    expect(maxCommands, '单局指令数上限').toBeLessThanOrEqual(COMMAND_CAP);
    expect(winRate, '先手方胜率应在 35%~65%').toBeGreaterThanOrEqual(0.35);
    expect(winRate, '先手方胜率应在 35%~65%').toBeLessThanOrEqual(0.65);
    expect(drawRate, '平局率应 <10%').toBeLessThan(0.1);
    expect(avgRounds, '平均局长应 8~30 回合').toBeGreaterThanOrEqual(8);
    expect(avgRounds, '平均局长应 8~30 回合').toBeLessThanOrEqual(30);
  }, 300000);

  it('20 局 hard vs normal：报告 hard 胜率', () => {
    const results: { stats: GameStats; hardSeat: PlayerIndex }[] = [];
    for (let i = 0; i < 20; i++) {
      const hardIsP0 = i % 2 === 0;
      // firstPlayer 由 seed 奇偶决定：让 hard 交替坐庄以抵消先手优势
      const seed = 9000 + i * 2 + (hardIsP0 ? 0 : 1);
      const stats = runGame(
        seed,
        hardIsP0 ? 'hard' : 'normal',
        hardIsP0 ? 'normal' : 'hard',
        FACTIONS[i % FACTIONS.length],
        FACTIONS[(i + 2) % FACTIONS.length],
      );
      results.push({ stats, hardSeat: hardIsP0 ? 0 : 1 });
    }
    const errors = results.flatMap((entry) => entry.stats.errors);
    expect(errors, `对局异常：${errors.slice(0, 3).join(' | ')}`).toHaveLength(0);

    let hardWins = 0;
    let decided = 0;
    for (const { stats, hardSeat } of results) {
      if (!stats.ended || stats.winner === null) continue;
      decided += 1;
      if (stats.winner === hardSeat) hardWins += 1;
    }
    const hardWinRate = hardWins / Math.max(1, decided);
    const avgRounds = results.reduce((sum, entry) => sum + entry.stats.rounds, 0) / results.length;
    const maxMs = Math.max(...results.map((entry) => entry.stats.maxDecisionMs));
    console.log(
      `[hard vs normal 20局] hard 胜率=${hardWins}/${decided}=${(hardWinRate * 100).toFixed(1)}% ` +
        `avgRounds=${avgRounds.toFixed(2)} maxDecisionMs=${maxMs}ms`,
    );
    // hard 至少不应明显弱于 normal（低于 30% 说明前瞻逻辑写坏了）
    expect(hardWinRate).toBeGreaterThanOrEqual(0.3);
  }, 300000);

  it('20 局 easy vs normal：报告 easy 胜率（分档有效性）', () => {
    const results: { stats: GameStats; easySeat: PlayerIndex }[] = [];
    for (let i = 0; i < 20; i++) {
      const easyIsP0 = i % 2 === 0;
      const seed = 7000 + i * 2 + (easyIsP0 ? 0 : 1);
      const stats = runGame(
        seed,
        easyIsP0 ? 'easy' : 'normal',
        easyIsP0 ? 'normal' : 'easy',
        FACTIONS[i % FACTIONS.length],
        FACTIONS[(i + 2) % FACTIONS.length],
      );
      results.push({ stats, easySeat: easyIsP0 ? 0 : 1 });
    }
    let easyWins = 0;
    let decided = 0;
    for (const { stats, easySeat } of results) {
      if (!stats.ended || stats.winner === null) continue;
      decided += 1;
      if (stats.winner === easySeat) easyWins += 1;
    }
    console.log(
      `[easy vs normal 20局] easy 胜率=${easyWins}/${decided}=${((easyWins / Math.max(1, decided)) * 100).toFixed(1)}%`,
    );
    // 20 局样本波动大，只记录不卡阈值
    expect(decided).toBeGreaterThan(0);
  }, 300000);
});

// ============================================================
// 8. 参数守卫
// ============================================================

describe('参数守卫', () => {
  it('hard 前瞻候选数不应超过 40', () => {
    expect(MAX_CANDIDATES).toBeLessThanOrEqual(40);
  });
});
