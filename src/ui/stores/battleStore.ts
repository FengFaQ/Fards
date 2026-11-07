/**
 * 对战 store（zustand）
 * ------------------------------------------------------------------
 * 持有：引擎状态（不可变，唯一来源）、注册表、AI 循环、交互选择态、事件特效队列。
 * 约定：
 *  - 任何写引擎的动作都必须先过 legalActions 校验，再经 applyCommand 产生新 state；
 *  - 引擎 state 绝不原地修改（引擎本身是纯函数，返回 structuredClone）；
 *  - UI 只读 state，不缓存副本。
 */
import { create } from 'zustand';
import { applyCommand, createGame, legalActions, legalActionsForCard, playCost } from '@/engine';
import type {
  EngineRegistry,
  GameCommand,
  GameEvent,
  GameSetup,
  GameState,
  LegalAction,
  Line,
  PlayerIndex,
  TargetRef,
} from '@/engine/types';
import type { DeckData, UiCard } from '../lib/dataBridge';
import { loadAllCards } from '../lib/dataBridge';
import { DECK_FACTIONS, factionMeta } from '../lib/format';
import { useDeckStore } from './deckStore';
import {
  actionToCommand,
  loadEngineAI,
  localAICommand,
  localChoiceCommand,
  type AIDifficulty,
  type EngineAIModule,
} from '../battle/aiBridge';
import { buildQuickDeck, divisionName, quickDeckName } from '../battle/decks';
import { buildCardIndex, buildRegistry } from '../battle/registry';

export const HUMAN: PlayerIndex = 0;
export const AI: PlayerIndex = 1;

export type BattlePhase = 'boot' | 'setup' | 'playing' | 'finished';

export interface FloatFx {
  id: number;
  text: string;
  tone: 'damage' | 'heal' | 'info';
  at: number;
}

export interface GhostFx {
  key: string;
  cardId: string;
  owner: PlayerIndex;
  line: Line;
  position: number;
  at: number;
}

export interface BannerFx {
  text: string;
  sub?: string;
  tone: 'self' | 'enemy' | 'system';
  at: number;
}

export interface Selection {
  kind: 'play' | 'attack' | 'move';
  label: string;
  cardInstanceId?: string;
  attackerId?: string;
  /** 移动模式：要移动的单位与目标战线 */
  unitId?: string;
  toLine?: Line;
  refs: TargetRef[];
  count: number;
  chosen: TargetRef[];
  deployLines?: Line[];
}

export interface BattleResult {
  winner: PlayerIndex | null;
  reason: string;
}

export interface StartConfig {
  deck: DeckData;
  deckName: string;
  aiFaction: string;
  difficulty: AIDifficulty;
  seed?: number;
}

/** 调试/QA 查询参数（autostart 用） */
export interface StartQuery {
  /** 已保存卡组 id / 名称，或阵营名（阵营名 → 快速编组 39 张） */
  deck?: string | null;
  /** 敌方阵营（AI） */
  faction?: string | null;
  difficulty?: string | null;
  seed?: string | null;
}

export interface HintFx {
  text: string;
  at: number;
}

interface BattleStore {
  /* ---------------- 数据 ---------------- */
  phase: BattlePhase;
  booting: boolean;
  error: string | null;
  cards: UiCard[];
  byId: Map<string, UiCard>;
  registry: EngineRegistry | null;

  /* ---------------- 对局 ---------------- */
  state: GameState | null;
  result: BattleResult | null;
  lastConfig: StartConfig | null;
  difficulty: AIDifficulty;
  aiFaction: string;
  playerDeck: { faction: string; allyFaction: string | null; name: string; count: number } | null;
  aiEngineReady: boolean;

  /* ---------------- 交互 ---------------- */
  selection: Selection | null;
  aiThinking: boolean;
  logOpen: boolean;
  hint: HintFx | null;
  shakeKey: string | null;

  /* ---------------- 特效 ---------------- */
  banner: BannerFx | null;
  fxByKey: Record<string, FloatFx[]>;
  ghosts: GhostFx[];
  attacks: Record<string, number>;
  hqHits: Record<string, number>;

  /* ---------------- 生命周期 ---------------- */
  demoStarted: boolean;
  init: () => Promise<void>;
  startBattle: (config: StartConfig) => Promise<void>;
  restartBattle: () => Promise<void>;
  quitToSetup: () => void;
  startDemoBattle: (rounds?: number) => Promise<void>;
  /** 调试/QA 入口：#/battle?autostart=1&deck=<deckId|faction>&faction=...&difficulty=...&seed=... */
  startFromQuery: (query: StartQuery) => Promise<void>;
  debugSimulate: (rounds: number) => void;

  /* ---------------- 玩家操作 ---------------- */
  selectCard: (instanceId: string) => void;
  selectUnit: (unitId: string) => void;
  clickTarget: (ref: TargetRef) => void;
  chooseSlot: (line: Line) => void;
  /** 攻击模式下追加「移动到前线/支援线」 */
  moveSelected: () => void;
  cancelSelection: () => void;
  endTurn: () => void;
  surrender: () => void;
  resolveChoiceWith: (selection: string[]) => void;

  /* ---------------- UI ---------------- */
  toggleLog: () => void;
  pruneFx: (now: number) => void;
  kickAI: (delay?: number) => void;
  stopAI: () => void;
  clearHint: () => void;
}

/* ------------------------------------------------------------------ 纯工具 */

const sameRef = (a: TargetRef, b: TargetRef): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'hq' && b.kind === 'hq') return a.player === b.player;
  if (a.kind === 'unit' && b.kind === 'unit') return a.unitId === b.unitId;
  if (a.kind === 'card' && b.kind === 'card') return a.instanceId === b.instanceId;
  return false;
};

const refKey = (ref: TargetRef): string => {
  if (ref.kind === 'hq') return `hq:${ref.player}`;
  if (ref.kind === 'unit') return `u:${ref.unitId}`;
  return `c:${ref.instanceId}`;
};

export const targetKey = refKey;

/** 部署线偏好：远程/空军进支援线，其它优先前线 */
function preferredLine(state: GameState, reg: EngineRegistry, instanceId?: string, lines?: Line[]): Line | undefined {
  if (!lines?.length) return undefined;
  const instance = instanceId ? state.cards[instanceId] : undefined;
  const def = instance ? reg.cardDefs[instance.cardId] : undefined;
  const back = !!def && (def.type === 'artillery' || def.type === 'fighter' || def.type === 'bomber');
  if (back) return lines.includes('support') ? 'support' : lines[0];
  return lines.includes('frontline') ? 'frontline' : lines[0];
}

/* ------------------------------------------------------------------ store */

export const useBattleStore = create<BattleStore>()((set, get) => {
  let aiTimer: number | null = null;
  let hintTimer: number | null = null;
  let aiActionCount = 0;
  let aiStall = 0;
  let fxSeq = 0;
  let engineAIModule: EngineAIModule | null | undefined;

  const clearAITimer = () => {
    if (aiTimer !== null) {
      window.clearTimeout(aiTimer);
      aiTimer = null;
    }
  };

  const setHint = (text: string) => {
    if (hintTimer !== null) window.clearTimeout(hintTimer);
    set({ hint: { text, at: Date.now() } });
    hintTimer = window.setTimeout(() => {
      hintTimer = null;
      set({ hint: null });
    }, 2200);
  };

  const ensureEngineAI = async (): Promise<EngineAIModule | null> => {
    if (engineAIModule !== undefined) return engineAIModule;
    engineAIModule = await loadEngineAI();
    set({ aiEngineReady: !!engineAIModule });
    return engineAIModule;
  };

  /* ---------------- 事件 → 特效 ---------------- */

  const buildFxPatch = (
    prev: GameState,
    next: GameState,
    events: GameEvent[],
  ): Partial<BattleStore> => {
    const fxByKey: Record<string, FloatFx[]> = { ...get().fxByKey };
    const ghosts = [...get().ghosts];
    const attacks = { ...get().attacks };
    const hqHits = { ...get().hqHits };
    let banner = get().banner;
    let touched = false;

    const pushFloat = (key: string, text: string, tone: FloatFx['tone']) => {
      const entry: FloatFx = { id: ++fxSeq, text, tone, at: Date.now() };
      fxByKey[key] = [...(fxByKey[key] ?? []), entry];
      touched = true;
    };

    for (const event of events) {
      switch (event.type) {
        case 'turnStart':
          banner = {
            text: event.player === HUMAN ? '你的回合' : '敌方回合',
            sub: event.player === HUMAN ? '部署部队 · 发起攻击 · 结束回合' : '监视敌方行动',
            tone: event.player === HUMAN ? 'self' : 'enemy',
            at: Date.now(),
          };
          touched = true;
          break;
        case 'attack':
          attacks[event.attackerId] = Date.now();
          touched = true;
          break;
        case 'damage': {
          const key = targetKey(event.target);
          pushFloat(key, `-${event.amount}`, 'damage');
          if (event.target.kind === 'hq') hqHits[key] = Date.now();
          break;
        }
        case 'heal': {
          pushFloat(targetKey(event.target), `+${event.amount}`, 'heal');
          break;
        }
        case 'death': {
          const unit = prev.units[event.unitId] ?? next.units[event.unitId];
          if (unit) {
            ghosts.push({
              key: `${event.unitId}-${++fxSeq}`,
              cardId: unit.cardId,
              owner: unit.owner,
              line: unit.line,
              position: unit.position,
              at: Date.now(),
            });
            touched = true;
          }
          break;
        }
        case 'gameOver':
          break;
        default:
          break;
      }
    }

    if (!touched) return {};
    return { fxByKey, ghosts, attacks, hqHits, banner };
  };

  /* ---------------- 提交指令 ---------------- */

  const commitCmd = (command: GameCommand): boolean => {
    const snapshot = get();
    const current = snapshot.state;
    const registry = snapshot.registry;
    if (!current || !registry || current.status !== 'playing') return false;
    if (command.type !== 'resolveChoice' && current.pendingChoice) return false;
    if ('player' in command && command.player !== current.activePlayer) {
      setHint('还没轮到你行动');
      return false;
    }

    let next: GameState;
    let events: GameEvent[];
    try {
      const result = applyCommand(current, command, registry);
      next = result.state;
      events = result.events;
    } catch (error) {
      console.error('[battle] applyCommand 失败', command, error);
      setHint('操作执行失败，已忽略');
      return false;
    }

    const patch = buildFxPatch(current, next, events);
    const updates: Partial<BattleStore> = {
      state: next,
      selection: null,
      ...patch,
    };
    if (next.status === 'finished') {
      clearAITimer();
      updates.phase = 'finished';
      updates.result = { winner: next.winner, reason: next.endReason ?? 'hq_destroyed' };
      updates.aiThinking = false;
    } else if (next.activePlayer === HUMAN && !next.pendingChoice) {
      aiActionCount = 0;
      updates.aiThinking = false;
    }
    set(updates);
    // 移动不产生事件（引擎只在撤退时记日志），因此单独放行
    return events.length > 0 || command.type === 'moveUnit';
  };

  /* ---------------- AI 循环 ---------------- */

  const shouldAI = (state: GameState | null): boolean => {
    if (!state || state.status !== 'playing') return false;
    if (state.pendingChoice) return state.pendingChoice.player === AI;
    return state.activePlayer === AI;
  };

  async function aiStep(): Promise<void> {
    const snapshot = get();
    const state = snapshot.state;
    if (snapshot.phase !== 'playing' || !state || !snapshot.registry) {
      set({ aiThinking: false });
      return;
    }
    if (!shouldAI(state)) {
      set({ aiThinking: false });
      return;
    }

    aiActionCount += 1;
    if (aiActionCount > 240) {
      // 安全阀：避免脚本异常导致 AI 回合无限循环
      aiActionCount = 0;
      commitCmd({ type: 'endTurn', player: state.activePlayer });
      if (shouldAI(get().state)) scheduleAI(420);
      else set({ aiThinking: false });
      return;
    }

    let command: GameCommand | null = null;
    const engine = await ensureEngineAI();
    if (engine) {
      try {
        command = engine.choose(state, snapshot.registry, AI, get().difficulty);
      } catch (error) {
        console.warn('[battle] 正式 AI 抛错，退回本地兜底', error);
        command = null;
      }
    }
    if (!command) {
      command = state.pendingChoice
        ? localChoiceCommand(state, AI)
        : localAICommand(state, snapshot.registry, AI, get().difficulty);
    }
    if (!command) {
      // 没有可用动作 → 结束回合
      command = { type: 'endTurn', player: state.activePlayer };
    }
    if (command.type !== 'resolveChoice' && command.player !== state.activePlayer) {
      command = { ...command, player: state.activePlayer } as GameCommand;
    }

    const changed = commitCmd(command);
    const after = get();
    if (after.phase !== 'playing') {
      set({ aiThinking: false });
      return;
    }
    if (!changed) {
      aiStall += 1;
      if (aiStall >= 2) {
        aiStall = 0;
        const active = after.state?.activePlayer ?? AI;
        commitCmd({ type: 'endTurn', player: active });
      }
    } else {
      aiStall = 0;
    }
    if (shouldAI(get().state)) scheduleAI(450);
    else {
      aiActionCount = 0;
      set({ aiThinking: false });
    }
  }

  function scheduleAI(delay = 450): void {
    clearAITimer();
    const state = get().state;
    if (get().phase !== 'playing' || !shouldAI(state)) {
      set({ aiThinking: false });
      return;
    }
    set({ aiThinking: true });
    aiTimer = window.setTimeout(() => {
      aiTimer = null;
      void aiStep();
    }, delay);
  }

  /* ---------------- 开局 ---------------- */

  const buildSetup = async (config: StartConfig): Promise<GameSetup | null> => {
    const { registry, cards } = get();
    if (!registry) return null;
    const seed = (config.seed ?? Date.now()) >>> 0;
    const humanCards = config.deck.cards.filter(
      (entry) => entry.count > 0 && !!registry.cardDefs[entry.cardId],
    );
    if (!humanCards.length) {
      setHint('卡组里没有当前数据集可用的卡牌');
      return null;
    }
    const engine = await ensureEngineAI();
    let aiCards: { cardId: string; count: number }[] = [];
    if (engine?.deckPreset) {
      try {
        aiCards = engine.deckPreset(config.aiFaction, Object.values(registry.cardDefs), seed);
      } catch (error) {
        console.warn('[battle] aiDeckPreset 失败，改用快速编组', error);
        aiCards = [];
      }
    }
    if (!Array.isArray(aiCards) || aiCards.length === 0) {
      aiCards = buildQuickDeck(config.aiFaction, cards, seed).cards;
    }
    aiCards = aiCards.filter((entry) => entry.count > 0 && !!registry.cardDefs[entry.cardId]);
    if (!aiCards.length) {
      setHint('敌方卡组构建失败');
      return null;
    }
    return {
      seed,
      firstPlayer: HUMAN,
      players: [
        {
          name: '你',
          faction: config.deck.faction,
          allyFaction: config.deck.allyFaction,
          deck: humanCards,
          isAI: false,
        },
        {
          name: divisionName(config.aiFaction, seed),
          faction: config.aiFaction,
          allyFaction: null,
          deck: aiCards,
          isAI: true,
        },
      ],
    };
  };

  return {
    phase: 'boot',
    booting: false,
    error: null,
    cards: [],
    byId: new Map(),
    registry: null,

    state: null,
    result: null,
    lastConfig: null,
    difficulty: 'normal',
    aiFaction: 'Soviet',
    playerDeck: null,
    aiEngineReady: false,

    selection: null,
    aiThinking: false,
    logOpen: true,
    hint: null,
    shakeKey: null,

    banner: null,
    fxByKey: {},
    ghosts: [],
    attacks: {},
    hqHits: {},

    demoStarted: false,

    /* ---------------- 生命周期 ---------------- */

    init: async () => {
      if (get().booting || get().registry) return;
      set({ booting: true, error: null });
      try {
        const cards = await loadAllCards();
        if (!cards.length) throw new Error('卡牌数据为空');
        const registry = buildRegistry(cards);
        set({
          cards,
          byId: buildCardIndex(cards),
          registry,
          phase: 'setup',
          booting: false,
        });
        void ensureEngineAI();
      } catch (error) {
        console.error('[battle] 初始化失败', error);
        set({
          booting: false,
          phase: 'setup',
          error: error instanceof Error ? error.message : '卡牌数据加载失败',
        });
      }
    },

    startBattle: async (config) => {
      const setup = await buildSetup(config);
      if (!setup) return;
      const registry = get().registry;
      if (!registry) return;
      const { state } = createGame(setup, registry);
      get().stopAI();
      set({
        state,
        phase: 'playing',
        selection: null,
        result: null,
        aiThinking: false,
        difficulty: config.difficulty,
        aiFaction: config.aiFaction,
        lastConfig: config,
        playerDeck: {
          faction: config.deck.faction,
          allyFaction: config.deck.allyFaction,
          name: config.deckName,
          count: config.deck.cards.reduce((sum, entry) => sum + entry.count, 0),
        },
        banner: {
          text: '对局开始',
          sub: `${config.deckName} vs ${divisionName(config.aiFaction, config.seed ?? 1)}`,
          tone: 'system',
          at: Date.now(),
        },
        fxByKey: {},
        ghosts: [],
        attacks: {},
        hqHits: {},
        hint: null,
        shakeKey: null,
      });
    },

    restartBattle: async () => {
      const config = get().lastConfig;
      if (!config) {
        get().quitToSetup();
        return;
      }
      await get().startBattle({ ...config, seed: Date.now() });
    },

    quitToSetup: () => {
      get().stopAI();
      set({
        phase: 'setup',
        state: null,
        result: null,
        selection: null,
        aiThinking: false,
        banner: null,
        fxByKey: {},
        ghosts: [],
        attacks: {},
        hqHits: {},
        hint: null,
        demoStarted: false,
      });
    },

    startDemoBattle: async (rounds = 3) => {
      if (get().demoStarted) return;
      if (!get().registry) return;
      set({ demoStarted: true });
      const cards = get().cards;
      const playerFaction = 'Germany';
      const aiFaction = 'Soviet';
      await get().startBattle({
        deck: buildQuickDeck(playerFaction, cards, 7),
        deckName: quickDeckName(playerFaction),
        aiFaction,
        difficulty: 'normal',
        seed: 20261107,
      });
      if (get().phase === 'playing' && rounds > 0) get().debugSimulate(rounds);
    },

    startFromQuery: async (query) => {
      const snapshot = get();
      if (!snapshot.registry) return;
      const norm = (value?: string | null) => (value ?? '').trim();
      const difficultyRaw = norm(query.difficulty).toLowerCase();
      const difficulty: AIDifficulty =
        difficultyRaw === 'easy' || difficultyRaw === 'hard' ? difficultyRaw : 'normal';
      const seedRaw = Number(norm(query.seed));
      const seed = Number.isFinite(seedRaw) && seedRaw > 0 ? Math.floor(seedRaw) : 20261107;

      const resolveFaction = (value: string): string | null => {
        const text = value.trim();
        if (!text) return null;
        const lower = text.toLowerCase();
        const byKey = DECK_FACTIONS.find((faction) => faction.toLowerCase() === lower);
        if (byKey) return byKey;
        const byZh = DECK_FACTIONS.find((faction) => factionMeta(faction).zh === text);
        return byZh ?? null;
      };

      // 卡组来源：已保存卡组 id/名称 → 阵营名（快速编组） → 第一套已保存 → 默认德国快速编组
      const savedDecks = useDeckStore.getState().decks;
      const deckParam = norm(query.deck);
      let deck: DeckData | null = null;
      let deckName = '';

      if (deckParam) {
        const saved = savedDecks.find((item) => item.id === deckParam || item.name === deckParam);
        if (saved) {
          deck = saved;
          deckName = saved.name;
        }
      }
      let playerFaction = deck ? (deck.faction as string) : resolveFaction(deckParam) ?? savedDecks[0]?.faction ?? 'Germany';
      if (!deck) {
        if (savedDecks.length && !resolveFaction(deckParam)) {
          deck = savedDecks[0];
          deckName = savedDecks[0].name;
          playerFaction = savedDecks[0].faction;
        } else {
          deck = buildQuickDeck(playerFaction, snapshot.cards, seed);
          deckName = quickDeckName(playerFaction);
        }
      }

      const requestedAi = resolveFaction(norm(query.faction));
      const aiCandidate = requestedAi && requestedAi !== factionMeta(playerFaction).key ? requestedAi : null;
      const aiFaction =
        aiCandidate ?? DECK_FACTIONS.find((faction) => faction !== factionMeta(playerFaction).key) ?? 'Soviet';

      await get().startBattle({ deck, deckName, aiFaction, difficulty, seed });
    },

    debugSimulate: (rounds) => {
      const snapshot = get();
      const registry = snapshot.registry;
      let current = snapshot.state;
      if (!registry || !current || current.status !== 'playing') return;
      let turns = 0;
      let guard = 0;
      while (current.status === 'playing' && guard < 900) {
        guard += 1;
        const actor = current.activePlayer;
        if (actor === HUMAN && !current.pendingChoice && turns >= rounds * 2) break;
        const command = current.pendingChoice
          ? localChoiceCommand(current, actor)
          : localAICommand(current, registry, actor, 'normal');
        if (!command) break;
        try {
          const result = applyCommand(current, command, registry);
          current = result.state;
        } catch (error) {
          console.warn('[battle] 模拟出错，停止', error);
          break;
        }
        if (command.type === 'endTurn') turns += 1;
      }
      set({
        state: current,
        selection: null,
        aiThinking: false,
        banner: null,
        fxByKey: {},
        ghosts: [],
        attacks: {},
        hqHits: {},
        result:
          current.status === 'finished'
            ? { winner: current.winner, reason: current.endReason ?? 'hq_destroyed' }
            : null,
        phase: current.status === 'finished' ? 'finished' : 'playing',
      });
      if (current.status === 'playing' && current.activePlayer === AI) scheduleAI(500);
    },

    /* ---------------- 玩家操作 ---------------- */

    selectCard: (instanceId) => {
      const snapshot = get();
      const { state, registry, phase } = snapshot;
      if (!state || !registry || phase !== 'playing') return;
      if (state.pendingChoice || state.activePlayer !== HUMAN) return;

      const handCard = state.players[HUMAN].hand.find((card) => card.instanceId === instanceId);
      if (!handCard) return;
      const actions = legalActions(state, registry, HUMAN);
      const action = actions.find(
        (item) => item.kind === 'playCard' && item.cardInstanceId === instanceId,
      );

      if (!action) {
        const def = registry.cardDefs[handCard.cardId];
        const cost = playCost(state, registry, HUMAN, handCard);
        let reason = '当前无法打出这张卡';
        if (!def) reason = '未知卡牌（不在当前数据集）';
        else if (cost > state.players[HUMAN].kredits) reason = `克雷迪特不足：需要 ${cost}`;
        else {
          const would = legalActionsForCard(state, registry, HUMAN, handCard);
          if (would.targets?.mode === 'target') reason = '没有合法目标';
          else if (would.deployLines && would.deployLines.length === 0) reason = '战场已满';
        }
        set({ shakeKey: `card:${instanceId}`, hint: { text: reason, at: Date.now() } });
        window.setTimeout(() => set({ shakeKey: null }), 340);
        return;
      }

      if (action.targets?.mode === 'target' && action.targets.refs.length > 0) {
        set({
          selection: {
            kind: 'play',
            label: action.label,
            cardInstanceId: instanceId,
            refs: action.targets.refs,
            count: action.targets.count ?? 1,
            chosen: [],
            deployLines: action.deployLines,
          },
        });
        return;
      }

      const changed = commitCmd({
        type: 'playCard',
        player: HUMAN,
        instanceId,
        line: preferredLine(state, registry, instanceId, action.deployLines),
      });
      if (!changed) setHint('部署失败');
      else get().kickAI();
    },

    selectUnit: (unitId) => {
      const snapshot = get();
      const { state, registry, phase } = snapshot;
      if (!state || !registry || phase !== 'playing') return;
      if (state.pendingChoice || state.activePlayer !== HUMAN) return;
      const unit = state.units[unitId];
      if (!unit) return;
      if (unit.owner !== HUMAN) {
        const def = registry.cardDefs[unit.cardId];
        setHint(`${def?.nameZh ?? '单位'} · ${unit.attack}/${unit.hp}${unit.armor ? ` · 护甲 ${unit.armor}` : ''}`);
        return;
      }
      const actions = legalActions(state, registry, HUMAN);
      const action = actions.find((item) => item.kind === 'attack' && item.attackerId === unitId);
      const moveAction = actions.find((item) => item.kind === 'moveUnit' && item.unitId === unitId);
      if (!action) {
        // 不能攻击时，若可移动就进入移动模式
        if (moveAction) {
          const toLine: Line = unit.line === 'support' ? 'frontline' : 'support';
          set({
            selection: {
              kind: 'move',
              label: moveAction.label,
              unitId,
              toLine,
              refs: [],
              count: 1,
              chosen: [],
            },
          });
          setHint(
            `移动至${toLine === 'frontline' ? '前线' : '支援线'}：消耗 ${
              moveAction.cost ?? 0
            } 克雷迪特，点击${toLine === 'frontline' ? '前线空位' : '支援线'}确认`,
          );
          return;
        }
        let reason = '该单位本回合无法行动';
        if (unit.statuses.pinned) reason = '单位被压制，本回合无法攻击';
        else if ((unit.statuses.cannotAttackTurns ?? 0) > 0) reason = '单位处于无法攻击状态';
        else if (unit.attacksUsed >= unit.maxAttacks) reason = '该单位本回合已行动';
        else if (unit.deployedTurn === state.turn) reason = '部署当回合无法行动（无闪击）';
        else if (state.config.attackCostsKredits && state.players[HUMAN].kredits < unit.operationCost)
          reason = `克雷迪特不足：行动需要 ${unit.operationCost}`;
        else if (unit.hp <= 0) reason = '单位已阵亡';
        setHint(reason);
        return;
      }
      set({
        selection: {
          kind: 'attack',
          label: action.label,
          attackerId: unitId,
          refs: action.targets?.refs ?? [],
          count: 1,
          chosen: [],
        },
      });
    },

    clickTarget: (ref) => {
      const snapshot = get();
      const { selection } = snapshot;
      if (!selection) return;
      if (!selection.refs.some((item) => sameRef(item, ref))) {
        setHint('该目标不合法');
        return;
      }
      if (selection.chosen.some((item) => sameRef(item, ref))) return;
      const chosen = [...selection.chosen, ref];
      if (chosen.length < selection.count) {
        set({ selection: { ...selection, chosen } });
        return;
      }

      const after = get();
      const { state, registry } = after;
      if (!state || !registry) return;

      let changed = false;
      if (selection.kind === 'attack' && selection.attackerId) {
        changed = commitCmd({
          type: 'attack',
          player: HUMAN,
          attackerId: selection.attackerId,
          target: chosen[0],
        });
        if (!changed) setHint('攻击未能执行');
      } else if (selection.kind === 'play' && selection.cardInstanceId) {
        changed = commitCmd({
          type: 'playCard',
          player: HUMAN,
          instanceId: selection.cardInstanceId,
          targets: chosen,
          line: preferredLine(state, registry, selection.cardInstanceId, selection.deployLines),
        });
        if (!changed) setHint('这张卡无法结算（目标或费用不合法）');
      }
      if (changed) get().kickAI();
    },

    chooseSlot: (line) => {
      const selection = get().selection;
      if (!selection) return;
      if (selection.kind === 'move' && selection.unitId) {
        if (selection.toLine && line !== selection.toLine) return;
        const moved = commitCmd({
          type: 'moveUnit',
          player: HUMAN,
          unitId: selection.unitId,
          toLine: line,
        });
        if (moved) {
          setHint(`已移动至${line === 'frontline' ? '前线' : '支援线'}`);
          get().kickAI();
        } else {
          setHint('无法移动该单位');
        }
        return;
      }
      if (selection.kind !== 'play' || !selection.cardInstanceId) return;
      const { state, registry } = get();
      if (!state || !registry) return;
      const changed = commitCmd({
        type: 'playCard',
        player: HUMAN,
        instanceId: selection.cardInstanceId,
        targets: selection.chosen.length ? selection.chosen : undefined,
        line,
      });
      if (!changed) setHint('该战场线无法部署');
      else get().kickAI();
    },

    moveSelected: () => {
      const snapshot = get();
      const { selection, state, registry } = snapshot;
      if (!selection || !state || !registry) return;
      const unitId = selection.kind === 'attack' ? selection.attackerId : selection.unitId;
      if (!unitId) return;
      const unit = state.units[unitId];
      if (!unit) return;
      const moveAction = legalActions(state, registry, HUMAN).find(
        (item) => item.kind === 'moveUnit' && item.unitId === unitId,
      );
      if (!moveAction) {
        setHint('该单位本回合无法移动');
        return;
      }
      const toLine: Line = unit.line === 'support' ? 'frontline' : 'support';
      set({
        selection: {
          kind: 'move',
          label: moveAction.label,
          unitId,
          toLine,
          refs: [],
          count: 1,
          chosen: [],
        },
      });
      setHint(
        `移动至${toLine === 'frontline' ? '前线' : '支援线'}：消耗 ${
          moveAction.cost ?? 0
        } 克雷迪特，点击${toLine === 'frontline' ? '前线空位' : '支援线'}确认`,
      );
    },

    cancelSelection: () => {
      if (get().selection) set({ selection: null });
    },

    endTurn: () => {
      const { state, phase } = get();
      if (!state || phase !== 'playing') return;
      if (state.pendingChoice) return;
      if (state.activePlayer !== HUMAN) {
        setHint('敌方行动中，请稍候');
        return;
      }
      commitCmd({ type: 'endTurn', player: HUMAN });
      get().kickAI();
    },

    surrender: () => {
      const { state, phase } = get();
      if (!state || phase !== 'playing') return;
      if (state.activePlayer !== HUMAN || state.pendingChoice) {
        setHint('请等待敌方回合结束后再投降');
        return;
      }
      commitCmd({ type: 'concede', player: HUMAN });
    },

    resolveChoiceWith: (selection) => {
      const { state, phase } = get();
      if (!state || phase !== 'playing' || !state.pendingChoice) return;
      commitCmd({
        type: 'resolveChoice',
        player: state.activePlayer,
        choiceId: state.pendingChoice.choiceId,
        selection,
      });
      get().kickAI();
    },

    /* ---------------- UI ---------------- */

    toggleLog: () => set({ logOpen: !get().logOpen }),

    pruneFx: (now) => {
      const snapshot = get();
      let changed = false;
      const map: Record<string, FloatFx[]> = {};
      for (const [key, list] of Object.entries(snapshot.fxByKey)) {
        const kept = list.filter((entry) => now - entry.at < 1600);
        if (kept.length) map[key] = kept;
        if (kept.length !== list.length) changed = true;
      }
      const ghosts = snapshot.ghosts.filter((ghost) => now - ghost.at < 900);
      if (ghosts.length !== snapshot.ghosts.length) changed = true;
      if (changed) set({ fxByKey: map, ghosts });
    },

    kickAI: (delay = 520) => {
      if (get().phase !== 'playing') {
        clearAITimer();
        set({ aiThinking: false });
        return;
      }
      if (!shouldAI(get().state)) {
        clearAITimer();
        set({ aiThinking: false });
        return;
      }
      if (aiTimer !== null) return;
      set({ aiThinking: true });
      aiTimer = window.setTimeout(() => {
        aiTimer = null;
        void aiStep();
      }, delay);
    },

    stopAI: () => {
      clearAITimer();
      aiActionCount = 0;
      aiStall = 0;
      set({ aiThinking: false });
    },

    clearHint: () => {
      if (hintTimer !== null) {
        window.clearTimeout(hintTimer);
        hintTimer = null;
      }
      set({ hint: null });
    },
  };
});
