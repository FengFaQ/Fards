/**
 * Fards 引擎核心契约（Engine Contract）
 * ------------------------------------------------------------------
 * 本文件是整个游戏的数据契约：状态机、指令、效果 DSL 与事件。
 * 规则数值参考 docs/RULES_SPEC.md（research 产出后校准）。
 *
 * 设计原则：
 * 1. 状态可序列化（纯 JSON + structuredClone 可复制），便于撤销、复盘与测试。
 * 2. applyCommand 是纯函数式 reducer：吃状态 + 指令，吐新状态 + 事件流。
 * 3. 所有卡牌效果用声明式 DSL（EffectOp）描述，卡牌脚本注册表只写数据，不写逻辑。
 */

// ============================================================
// 1. 基础类型
// ============================================================

export type PlayerIndex = 0 | 1;
/** 相对视角：self = 效果控制者，enemy = 对手 */
export type PlayerSide = 'self' | 'enemy';

/** 战场线：frontline 前线（共享，可争夺）、support 支援线（各自主场后方） */
export type Line = 'frontline' | 'support';

export const FACTIONS = [
  'Germany',
  'USA',
  'Britain',
  'Japan',
  'Soviet',
  'France',
  'Italy',
  'Finland',
  'Poland',
  'Anzac',
  'Neutral',
] as const;

/** 阵营名（保留字符串兼容，便于未来新增） */
export type Faction = (typeof FACTIONS)[number] | (string & {});

export const FACTIONS_ZH: Record<string, string> = {
  Germany: '德国',
  USA: '美国',
  Britain: '英国',
  Japan: '日本',
  Soviet: '苏联',
  France: '法国',
  Italy: '意大利',
  Finland: '芬兰',
  Poland: '波兰',
  Anzac: '澳新',
  Neutral: '中立',
};

/** 卡牌类型（API 用小写英文：infantry/tank/artillery/fighter/bomber/destroyer/battleship/order） */
export const CARD_TYPES = [
  'infantry',
  'tank',
  'artillery',
  'fighter',
  'bomber',
  'destroyer',
  'battleship',
  'order',
] as const;
export type CardType = (typeof CARD_TYPES)[number] | (string & {});

export const CARD_TYPES_ZH: Record<string, string> = {
  infantry: '步兵',
  tank: '坦克',
  artillery: '炮兵',
  fighter: '战斗机',
  bomber: '轰炸机',
  destroyer: '驱逐舰',
  battleship: '战列舰',
  order: '指令',
};

/** 稀有度：Standard 标准 / Limited 限定 / Special 特殊 / Elite 精英 */
export const RARITIES = ['Standard', 'Limited', 'Special', 'Elite'] as const;
export type Rarity = (typeof RARITIES)[number] | (string & {});

// ============================================================
// 2. 卡牌定义（来自卡牌数据集，规则引擎只读）
// ============================================================

export interface CardDef {
  cardId: string;
  /** 卡组代码中的 2 位短码 */
  importId?: string;
  nameZh: string;
  nameEn: string;
  /** 中文效果文本（原始） */
  description: string;
  descriptionEn?: string;
  faction: Faction;
  /** 可入哪些阵营卡组（盟军关系） */
  hostFactions?: Faction[];
  /** 是否为盟军（非主阵营）卡 */
  isExile?: boolean;
  type: CardType;
  rarity: Rarity;
  /** 部署花费（克雷迪特） */
  kredits: number;
  /** 行动花费（攻击/行动消耗，规则见 docs/RULES_SPEC.md） */
  operationCost: number;
  attack: number;
  defense: number;
  /** 原始关键字（API attributes，小写英文） */
  attributes: string[];
  set: string;
  /** 池：active/reserve/... */
  pool: string;
  isReserved?: boolean;
  isDerived?: boolean;
  /** 立绘（远程/本地由数据层补充） */
  imageUrl?: string;
  imageProxyUrl?: string;
}

// ============================================================
// 3. 运行时实例
// ============================================================

export type CardInstanceId = string;
export type UnitId = string;

export interface CardInstance {
  instanceId: CardInstanceId;
  cardId: string;
  owner: PlayerIndex;
  /** 创建来源：deck 为初始卡组，token/created 为衍生 */
  source?: 'deck' | 'token' | 'created';
}

export type KeywordId = string;

export interface UnitStatuses {
  /** 压制/眩晕：本回合不能攻击 */
  pinned?: boolean;
  /** 无法攻击的剩余回合数 */
  cannotAttackTurns?: number;
  /** 本回合是否已触发某能力 */
  [key: string]: unknown;
}

export interface Unit {
  unitId: UnitId;
  instanceId: CardInstanceId;
  cardId: string;
  owner: PlayerIndex;
  line: Line;
  /** 在线内的位置（数组下标，随死亡压缩） */
  position: number;
  /** 基础值（卡牌原始数值） */
  baseAttack: number;
  baseHp: number;
  /** 永久增益（buff 类效果累积） */
  buffAttack: number;
  buffHp: number;
  /** 光环修正（每次状态变化重算） */
  auraAttack: number;
  auraHp: number;
  /** 有效攻击力 / 当前生命 / 最大生命（由基础+增益+光环推导） */
  attack: number;
  hp: number;
  maxHp: number;
  armor: number;
  /** 卡牌自带关键字（原始） */
  baseKeywords: KeywordId[];
  /** 光环附加关键字 */
  auraKeywords: KeywordId[];
  keywords: KeywordId[];
  attacksUsed: number;
  maxAttacks: number;
  /** 本回合是否已移动 */
  movedThisTurn: boolean;
  /** 当前行动花费（可由效果修改） */
  operationCost: number;
  /** 部署时的回合数（攻击召唤病判定用） */
  deployedTurn: number;
  statuses: UnitStatuses;
  /** 每单位计数器（例如“每回合首次”“累计”类效果） */
  trackers: Record<string, number>;
  silenced: boolean;
  /** 衍生物标记（不进入弃牌堆） */
  token?: boolean;
  /** 是否处于隐藏（Ambush）状态 */
  ambush?: boolean;
}

export interface CountermeasureInstance {
  instanceId: CardInstanceId;
  cardId: string;
  owner: PlayerIndex;
}

export interface PlayerState {  index: PlayerIndex;
  name: string;
  /** 主阵营 */
  faction: Faction;
  /** 盟军阵营（无则 null） */
  allyFaction: Faction | null;
  hq: {
    hp: number;
    maxHp: number;
    armor: number;
  };
  kredits: number;
  maxKredits: number;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  /** 支援线单位 id（长度 <= config.supportSlots） */
  support: UnitId[];
  /** 前线单位 id（长度 <= config.frontlineSlots） */
  frontline: UnitId[];
  /** 敌方反制牌（挂在对方玩家上，由对方持有） */
  counters: CardInstance[];
  /** 疲劳计数器（牌库空后每次抽牌递增伤害） */
  fatigue: number;
  /** 本回合已抽牌数（统计用） */
  drawnThisTurn: number;
  /** 本回合已部署单位数 */
  deployedThisTurn: number;
  /** 本回合已使用克雷迪特 */
  kreditsSpentThisTurn: number;
  /** 本局统计计数器（卡牌脚本按 key 累加） */
  trackers: Record<string, number>;
}

// ============================================================
// 4. 目标引用
// ============================================================

export type TargetRef =
  | { kind: 'hq'; player: PlayerIndex }
  | { kind: 'unit'; unitId: UnitId }
  | { kind: 'card'; instanceId: CardInstanceId };

// ============================================================
// 5. 选择（效果需要用户决策时挂起）
// ============================================================

export type ChoiceMode = 'option' | 'unit' | 'card' | 'slot';

export interface ChoiceOption {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}

/** 延迟触发的效果（例如“下个友方回合开始时抽 1 张”） */
export interface ScheduledEffect {
  id: string;
  player: PlayerIndex;
  when: 'selfTurnStart' | 'selfTurnEnd' | 'opponentTurnStart';
  /** 指定回合数（不填则下一次触发） */
  turn?: number;
  effects: EffectOp[];
  sourceCardId?: string;
}

export interface PendingChoice {  choiceId: string;
  /** 需要做决定的玩家 */
  player: PlayerIndex;
  prompt: string;
  mode: ChoiceMode;
  /** mode=option 时的选项 */
  options?: ChoiceOption[];
  /** mode=unit 时的候选单位 */
  unitCandidates?: UnitId[];
  /** mode=card 时的候选手牌 */
  cardCandidates?: CardInstanceId[];
  min?: number;
  max?: number;
  /** 是否允许跳过 */
  optional?: boolean;
  /** 效果上下文（内部使用） */
  context?: Record<string, unknown>;
}

// ============================================================
// 6. 游戏状态
// ============================================================

export interface GameConfig {
  /** 总部初始/最大生命 */
  hqHp: number;
  /** 先手初始手牌 */
  startingHandSize: number;
  /** 后手额外手牌 */
  secondPlayerExtraCards: number;
  /** 手牌上限 */
  handLimit: number;
  /** 先手初始克雷迪特 */
  startingKredits: number;
  /** 后手额外克雷迪特 */
  secondPlayerKredits: number;
  /** 克雷迪特基础上限（自然增长封顶） */
  kreditCap: number;
  /** 克雷迪特绝对上限（跳费卡可超过基础上限） */
  kreditHardCap: number;
  /** 每回合克雷迪特增长 */
  kreditGrowth: number;
  /** 前线共享槽位（同一时间只有一方占领） */
  frontlineSlots: number;
  /** 支援线每方槽位 */
  supportSlots: number;
  /** 牌库空后疲劳伤害（每次 +1） */
  fatigueBase: number;
  /** 单位默认每回合攻击次数 */
  attacksPerTurn: number;

  // ---- 行动规则（考据校准开关） ----
  /** 攻击是否支付行动花费（克雷迪特） */
  attackCostsKredits: boolean;
  /** 移动是否支付行动花费 */
  moveCostsKredits: boolean;
  /** 支援线单位能否攻击 */
  supportCanAttack: boolean;
  /** 攻击总部是否必须从前线发起 */
  hqAttackRequiresFrontline: boolean;
  /** guard 是否在任意线都生效 */
  guardAnyLine: boolean;
  /** 首回合先手是否跳过摸牌 */
  firstTurnSkipsDraw: boolean;
}

export interface GameLogEntry {
  id: number;
  turn: number;
  player: PlayerIndex | null;
  kind: 'info' | 'play' | 'attack' | 'damage' | 'death' | 'draw' | 'kredit' | 'choice' | 'effect' | 'system';
  text: string;
}

export interface GameState {
  schemaVersion: number;
  status: 'playing' | 'finished';
  /** null 表示平局 */
  winner: PlayerIndex | null;
  endReason?: 'hq_destroyed' | 'concede' | 'draw' | 'deck_out';
  config: GameConfig;
  seed: number;
  rngState: number;
  /** 先手玩家 */
  firstPlayer: PlayerIndex;
  /** 全局统计计数器 */
  trackers: Record<string, number>;
  /** 全局回合序号（每个玩家回合 +1） */
  turn: number;
  /** 完整轮次（双方各行动一次 = 1 轮） */
  round: number;
  activePlayer: PlayerIndex;
  players: [PlayerState, PlayerState];
  units: Record<UnitId, Unit>;
  cards: Record<CardInstanceId, CardInstance>;
  /** 前线控制者（null = 无人控制/争夺中） */
  frontlineController: PlayerIndex | null;
  pendingChoice: PendingChoice | null;
  /** 延迟效果队列 */
  scheduled: ScheduledEffect[];
  log: GameLogEntry[];
  nextId: number;
}

export interface GameSetupPlayer {
  name: string;
  faction: Faction;
  allyFaction: Faction | null;
  /** 卡组（cardId -> 数量） */
  deck: { cardId: string; count: number }[];
  isAI?: boolean;
}

export interface GameSetup {
  seed?: number;
  /** 先手玩家索引 */
  firstPlayer?: PlayerIndex;
  players: [GameSetupPlayer, GameSetupPlayer];
  config?: Partial<GameConfig>;
}

// ============================================================
// 7. 指令（玩家/AI 对引擎的唯一输入）
// ============================================================

export type GameCommand =
  | {
      type: 'playCard';
      player: PlayerIndex;
      instanceId: CardInstanceId;
      /** 目标（按卡牌 targetSpec 的数量与顺序） */
      targets?: TargetRef[];
      /** 部署位置（插入下标；不填则追加） */
      slot?: number;
      /** 部署到哪条线（不填则优先前线，不可则支援线） */
      line?: Line;
      /** 抉择卡（多模式卡）选择的分支下标 */
      mode?: number;
    }
  | {
      type: 'moveUnit';
      player: PlayerIndex;
      unitId: UnitId;
      toLine: Line;
    }
  | {
      type: 'attack';
      player: PlayerIndex;
      attackerId: UnitId;
      target: TargetRef;
    }
  | { type: 'endTurn'; player: PlayerIndex }
  | {
      type: 'resolveChoice';
      player: PlayerIndex;
      choiceId: string;
      /** option: 选项 id；unit: 单位 id 列表；card: 实例 id 列表 */
      selection: string[];
    }
  | { type: 'concede'; player: PlayerIndex };

// ============================================================
// 8. 合法动作（供 UI 高亮与 AI 决策）
// ============================================================

export interface LegalTargets {
  /** 目标模式：none 无需目标 */
  mode: 'none' | 'target';
  refs: TargetRef[];
  /** 需要选择的目标数量（多目标卡） */
  count?: number;
  /** UI 提示 */
  hint?: string;
}

export interface LegalAction {
  kind: 'playCard' | 'attack' | 'endTurn' | 'concede' | 'resolveChoice' | 'moveUnit';
  label: string;
  cardInstanceId?: CardInstanceId;
  attackerId?: UnitId;
  unitId?: UnitId;
  targets?: LegalTargets;
  /** 卡牌/指令的显示信息 */
  detail?: string;
  /** 可部署的战场线（单位卡） */
  deployLines?: Line[];
  /** 实际费用（含折扣） */
  cost?: number;
}

// ============================================================
// 9. 效果 DSL：取值表达式 / 条件 / 目标查询
// ============================================================

export type CompareOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

export type PickMode =
  | 'random'
  | 'first'
  | 'last'
  | 'leftmost'
  | 'rightmost'
  | 'highestAttack'
  | 'lowestAttack'
  | 'highestHp'
  | 'lowestHp'
  | 'kredits';

export interface UnitFilter {
  type?: CardType | CardType[];
  keyword?: KeywordId;
  faction?: Faction;
  minAttack?: number;
  maxAttack?: number;
  minHp?: number;
  maxHp?: number;
  minCost?: number;
  maxCost?: number;
  damaged?: boolean;
  undamaged?: boolean;
  token?: boolean;
  excludeSelf?: boolean;
  excludeChosen?: boolean;
}

/** 效果目标查询（side 相对于效果控制者） */
export interface TargetQuery {
  kind: 'query';
  side: PlayerSide | 'any';
  line?: Line | 'any';
  filter?: UnitFilter;
  /** 取多少个目标 */
  limit?: IntExpr;
  pick?: PickMode;
  /** 是否包含“已选择的目标” */
  includeChosen?: boolean;
}

export type EffectTarget =
  | { kind: 'self' }
  | { kind: 'chosen' }
  | { kind: 'hq'; side: PlayerSide }
  | TargetQuery;

/** 整数表达式 */
export type IntExpr =
  | number
  | { kind: 'count'; target: EffectTarget }
  | {
      kind: 'stat';
      of: 'self' | 'chosen' | 'selfHQ' | 'enemyHQ';
      stat: 'attack' | 'hp' | 'maxHp' | 'armor' | 'kredits' | 'handSize' | 'deckSize' | 'armorValue';
    }
  | { kind: 'sum'; target: EffectTarget; stat: 'attack' | 'hp' }
  | { kind: 'turn' }
  | { kind: 'tracker'; key: string }
  | { kind: 'calc'; op: '+' | '-' | '*' | 'min' | 'max'; a: IntExpr; b: IntExpr };

export type Condition =
  | { kind: 'always' }
  | { kind: 'not'; condition: Condition }
  | { kind: 'and' | 'or'; conditions: Condition[] }
  | { kind: 'count'; target: EffectTarget; op: CompareOp; value: IntExpr }
  | {
      kind: 'stat';
      of: 'self' | 'chosen' | 'selfHQ' | 'enemyHQ';
      stat: 'attack' | 'hp' | 'maxHp' | 'kredits' | 'handSize' | 'deckSize';
      op: CompareOp;
      value: IntExpr;
    }
  | { kind: 'hasKeyword'; of: 'self' | 'chosen'; keyword: KeywordId }
  | { kind: 'ownsFaction'; faction?: Faction }
  | { kind: 'custom'; id: string; params?: Record<string, unknown> };

// ============================================================
// 10. 效果操作（DSL 原子操作）
// ============================================================

export type EffectOp =
  | { op: 'damage'; target: EffectTarget; amount: IntExpr; source?: 'card' | 'unit' | 'effect' }
  | { op: 'heal'; target: EffectTarget; amount: IntExpr }
  | { op: 'buff'; target: EffectTarget; attack?: IntExpr; hp?: IntExpr; permanent?: boolean }
  | { op: 'setStats'; target: EffectTarget; attack?: number; hp?: number }
  | { op: 'destroy'; target: EffectTarget }
  | { op: 'silence'; target: EffectTarget }
  | { op: 'pin'; target: EffectTarget }
  | { op: 'unpin'; target: EffectTarget }
  | { op: 'draw'; side: PlayerSide; count: IntExpr }
  | { op: 'discard'; side: PlayerSide; count: IntExpr; random?: boolean }
  | { op: 'mill'; side: PlayerSide; count: IntExpr }
  | { op: 'gainKredits'; side: PlayerSide; amount: IntExpr; permanent?: boolean }
  | { op: 'setKredits'; side: PlayerSide; value: IntExpr }
  | { op: 'summon'; side: PlayerSide; cardId?: string; cardIds?: string[]; count?: IntExpr; line?: Line }
  | { op: 'addCardToHand'; side: PlayerSide; cardId: string; count?: IntExpr }
  | { op: 'transform'; target: EffectTarget; cardId: string }
  | { op: 'moveUnit'; target: EffectTarget; toLine: Line }
  | { op: 'grantKeyword'; target: EffectTarget; keyword: KeywordId }
  | { op: 'removeKeyword'; target: EffectTarget; keyword: KeywordId }
  | {
      op: 'conditional';
      condition: Condition;
      then: EffectOp[];
      else?: EffectOp[];
    }
  | { op: 'choice'; prompt: string; options: { label: string; effects: EffectOp[]; condition?: Condition }[] }
  | { op: 'random'; options: { weight: number; effects: EffectOp[] }[] }
  | { op: 'repeat'; times: IntExpr; effects: EffectOp[] }
  | { op: 'custom'; id: string; params?: Record<string, unknown> };

// ============================================================
// 11. 卡牌脚本（注册表只写数据）
// ============================================================

export type TriggerKind =
  | 'deploy' // 部署（含“打出指令”时对指令卡用 order）
  | 'order'
  | 'death'
  | 'attack' // 该单位攻击时
  | 'attacked' // 该单位被攻击时
  | 'turnStart'
  | 'turnEnd'
  | 'counter' // 反制触发
  | 'unitDeployed' // 任意单位部署（可过滤友方/敌方）
  | 'unitDestroyed'
  | 'cardPlayed' // 任意卡牌被使用后
  | 'orderPlayed' // 指令被使用后
  | 'unitActed' // 单位攻击或移动后
  | 'healed' // 单位被治疗后
  | 'cardDrawn'
  | 'damageDealt'
  | 'healed'
  | 'kreditsGained'
  | 'unitMoved'
  | 'any';

export interface CardAbility {
  trigger: TriggerKind;
  /** 需要的用户目标（打出/触发时） */
  target?: EffectTarget;
  effects: EffectOp[];
  condition?: Condition;
  /** 每回合仅触发一次 */
  oncePerTurn?: boolean;
  /** 监听双方（默认仅监听己方事件） */
  anySide?: boolean;
  /** 展示用文本 */
  text?: string;
}

export interface PassiveAura {
  kind: 'aura';
  /** 受影响的单位查询（side 相对控制者） */
  affect: TargetQuery;
  attackDelta?: number;
  hpDelta?: number;
  armorDelta?: number;
  grantKeywords?: KeywordId[];
  removeKeywords?: KeywordId[];
  text?: string;
}

export interface CardScript {
  cardId: string;
  abilities?: CardAbility[];
  passives?: PassiveAura[];
  /** 额外关键字（数据 attributes 之外） */
  keywords?: KeywordId[];
  /** 动态费用修正 */
  costDelta?: IntExpr;
  /** 多模式卡：每个模式的效果（打出时选择） */
  modes?: { label: string; target?: EffectTarget; effects: EffectOp[]; condition?: Condition }[];
  /** 指令/单位打出时需要目标 */
  targetSpec?: EffectTarget;
  /** 反制牌放置（countermeasure） */
  counter?: { trigger: 'enemyPlaysCard' | 'enemyPlaysUnit' | 'enemyAttacks' | 'enemyUsesOrder'; effects: EffectOp[]; text?: string };
}

// ============================================================
// 12. 事件流（渲染/动画/日志）
// ============================================================

export type GameEvent =
  | { type: 'turnStart'; player: PlayerIndex; turn: number }
  | { type: 'turnEnd'; player: PlayerIndex }
  | { type: 'draw'; player: PlayerIndex; instanceId: CardInstanceId }
  | { type: 'kredit'; player: PlayerIndex; amount: number }
  | { type: 'deploy'; unitId: UnitId; cardId: string; owner: PlayerIndex; line: Line }
  | { type: 'attack'; attackerId: UnitId; target: TargetRef }
  | { type: 'damage'; target: TargetRef; amount: number }
  | { type: 'heal'; target: TargetRef; amount: number }
  | { type: 'death'; unitId: UnitId }
  | { type: 'playOrder'; player: PlayerIndex; cardId: string }
  | { type: 'choiceRequested'; choice: PendingChoice }
  | { type: 'gameOver'; winner: PlayerIndex | null; reason: string }
  | { type: 'log'; entry: GameLogEntry }
  | { type: 'effect'; cardId?: string; text: string };

export interface EngineResult {
  state: GameState;
  events: GameEvent[];
}

/** 引擎只读注册表：卡牌定义 + 卡牌脚本 */
export interface EngineRegistry {
  cardDefs: Record<string, CardDef>;
  scripts: Record<string, CardScript>;
}

// ============================================================
// 13. 默认规则配置（research 校准后调整）
// ============================================================

/** 规则数值集中在此，便于按考据结论校准 */
export const DEFAULT_CONFIG: GameConfig = {
  hqHp: 20,
  startingHandSize: 5,
  secondPlayerExtraCards: 0,
  handLimit: 9,
  startingKredits: 1,
  secondPlayerKredits: 0,
  kreditCap: 12,
  kreditHardCap: 24,
  kreditGrowth: 1,
  frontlineSlots: 5,
  supportSlots: 4,
  fatigueBase: 1,
  attacksPerTurn: 1,
  attackCostsKredits: true,
  moveCostsKredits: true,
  supportCanAttack: true,
  hqAttackRequiresFrontline: true,
  guardAnyLine: false,
  firstTurnSkipsDraw: true,
};
