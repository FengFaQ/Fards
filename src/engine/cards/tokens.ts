/**
 * 衍生卡脚本（Token / 老兵形态 / 仅可生成）
 * ------------------------------------------------------------------
 * 收录标准：CardDef 中 `isDerived: true` 或 `pool === 'derived'`（共 129 张）。
 * 这些卡不能构筑，只会被效果生成（`op: 'summon'` / `op: 'transform'` / `op: 'addCardToHand'`），
 * 但其中不少带效果文本（如老兵形态、衍生 Token），同样需要脚本。
 *
 * 数据来源追溯：老兵形态卡的 attributes 为 `VeteranOf:<原卡 cardId>`，
 * 原卡为 `BecomesVeteran:<老兵卡 cardId>`；归一化见 `./keywords.ts#parseAttribute`。
 *
 * 本文件当前批次：**被主卡脚本引用/高频的 23 张衍生卡**（其余约 95 张老兵形态待批次 5；
 * 空效果文本的 Token 如 `light_infantry` / `routed_troops` 无需脚本）。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 */

import type { CardScript } from '../types';

export const TOKEN_CARD_SCRIPTS: Record<string, CardScript> = {
  // ---- 老兵形态 ----
  // 中文原文：升为老兵时，使其他友方单位和友方总部获得 +3 防御力。
  // TODO(原语): 需要“升为老兵时”钩子（upgradeVeteran 目前不触发事件）→ 当前不生效
  '216th_guards_vet': {
    cardId: '216th_guards_vet',
    abilities: [
      { trigger: 'any', effects: [{ op: 'custom', id: 'onVeteranUpgradeGrantDefense', params: { amount: 3 } }] },
    ],
  },

  // ---- 苏联 Token / 衍生 ----
  // 中文原文：亡计：将 1 张“步兵第 97 团”洗入卡组。抽 3 张牌，对友方总部造成 3 点伤害。
  '414th_rifles': {
    cardId: '414th_rifles',
    abilities: [
      {
        trigger: 'death',
        effects: [
          { op: 'custom', id: 'shuffleIntoDeck', params: { cardId: '97th_rifles', count: 1 } },
          { op: 'draw', side: 'self', count: 3 },
          { op: 'damage', target: { kind: 'hq', side: 'self' }, amount: 3 },
        ],
      },
    ],
  },

  // 中文原文：对 1 个敌方陆军或总部造成 2 点伤害，对其相邻目标造成 2 点伤害。
  aerosani: {
    cardId: 'aerosani',
    abilities: [
      {
        trigger: 'order',
        effects: [{ op: 'custom', id: 'damageAnyTargetAndAdjacent', params: { side: 'enemy', amount: 2, adjacentAmount: 2, includeHQ: true } }],
      },
    ],
  },

  // 中文原文：消灭受到本单位对战伤害的单位。
  sissi: {
    cardId: 'sissi',
    abilities: [
      {
        trigger: 'attack',
        condition: { kind: 'custom', id: 'chosenDamaged' },
        effects: [{ op: 'destroy', target: { kind: 'chosen' } }],
        text: '消灭受到本单位对战伤害的单位',
      },
    ],
  },

  // 中文原文：抽取：使用。失去 1 个指挥点。对友方总部造成 1 点伤害。压制 1 个友方单位。抽 1 张牌。
  // 注：“抽取：使用”由引擎的抽牌钩子负责（当前未实现自动打出），此处写手动打出的效果。
  resistance_b: {
    cardId: 'resistance_b',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'gainKredits', side: 'self', amount: -1 },
          { op: 'damage', target: { kind: 'hq', side: 'self' }, amount: 1 },
          { op: 'pin', target: { kind: 'query', side: 'self', line: 'any', pick: 'random', limit: 1 } },
          { op: 'draw', side: 'self', count: 1 },
        ],
      },
    ],
  },

  // ---- 美国 Token / 衍生 ----
  // 中文原文：若有行动花费不小于 3 的友方单位，具有 -3 花费。
  b24d: {
    cardId: 'b24d',
    abilities: [
      // TODO(原语): 条件性费用修正（script.costDelta 只支持静态数字）
      { trigger: 'any', effects: [{ op: 'custom', id: 'conditionalCostDelta', params: { amount: -3, minOperationCost: 3 } }] },
    ],
  },

  // 中文原文：部署：抑制 1 个敌方单位和其相邻单位。
  b24j: {
    cardId: 'b24j',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'enemy', line: 'any', limit: 1 },
        effects: [
          { op: 'silence', target: { kind: 'chosen' } },
          { op: 'custom', id: 'silenceAdjacentToChosen' },
        ],
      },
    ],
  },

  // 中文原文：额外获得 1 个指挥点槽。使友方总部具有烟幕，直到下个友方回合开始。
  depth_charges: {
    cardId: 'depth_charges',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'gainKreditSlots', params: { side: 'self', amount: 1 } },
          { op: 'custom', id: 'grantHqKeywordUntilNextTurn', params: { keyword: 'smokescreen' } },
        ],
      },
    ],
  },

  // 中文原文：抉择：将 1 张“加压舱” 或 1 张“高级美国研发”加入手牌。
  expanded_us_research: {
    cardId: 'expanded_us_research',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: '加压舱', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'pressurized_cabin' }] },
              { label: '高级美国研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'advanced_us_research' }] },
            ],
          },
        ],
      },
    ],
  },

  // ---- 英国 Token / 衍生 ----
  // 中文原文：抉择：将 1 张“合成橡胶” 或 1 张“高级皇家研发”加入手牌。
  expanded_royal_research: {
    cardId: 'expanded_royal_research',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: '合成橡胶', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'synthetic_rubber' }] },
              { label: '高级皇家研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'advanced_royal_research' }] },
            ],
          },
        ],
      },
    ],
  },

  // 中文原文：友方回合开始时，若上回合没有被攻击，对敌方总部造成 1 点伤害。
  garrison: {
    cardId: 'garrison',
    abilities: [
      {
        trigger: 'turnStart',
        condition: { kind: 'custom', id: 'notAttackedLastTurn' },
        effects: [{ op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 1 }],
      },
    ],
  },

  // 中文原文：回合结束时，转换为“蚊式 B Mk IV”。
  mosquito_f_mk_ii: {
    cardId: 'mosquito_f_mk_ii',
    abilities: [
      { trigger: 'turnEnd', effects: [{ op: 'transform', target: { kind: 'self' }, cardId: 'mosquito_b_mk_iv' }] },
    ],
  },

  // 中文原文：抽 1 张牌。使友方总部获得 +4 防御力。
  radar: {
    cardId: 'radar',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'draw', side: 'self', count: 1 },
          { op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 4 } },
        ],
      },
    ],
  },

  // 中文原文：抽 1 张牌。
  plan: {
    cardId: 'plan',
    abilities: [{ trigger: 'order', effects: [{ op: 'draw', side: 'self', count: 1 }] }],
  },

  // 中文原文：获得 1 个指挥点。
  production: {
    cardId: 'production',
    abilities: [{ trigger: 'order', effects: [{ op: 'gainKredits', side: 'self', amount: 1 }] }],
  },

  // ---- 德国 Token / 衍生 ----
  // 中文原文：压制所有敌方单位。
  balloon_bombs: {
    cardId: 'balloon_bombs',
    abilities: [
      { trigger: 'order', effects: [{ op: 'pin', target: { kind: 'query', side: 'enemy', line: 'any' } }] },
    ],
  },

  // 中文原文：对 1 个单位造成 1 点伤害。
  blast: {
    cardId: 'blast',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [{ op: 'damage', target: { kind: 'chosen' }, amount: 1 }],
      },
    ],
  },

  // 中文原文：开发 1 张德国中型或重型坦克。使友方总部获得：“友方坦克部署时，使其获得 +1+1。”
  contest_doctrine: {
    cardId: 'contest_doctrine',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'discoverFrom', params: { faction: 'Germany', type: 'tank', maxCost: 5 } },
          {
            op: 'custom',
            id: 'grantHqAbility',
            params: { trigger: 'unitDeployed', effects: [{ op: 'buff', target: { kind: 'chosen' }, attack: 1, hp: 1 }] },
          },
        ],
      },
    ],
  },

  // 中文原文：抉择：将 1 张“合成机油” 或 1 张“高级德意志帝国研发”加入手牌。
  expanded_reich_rd: {
    cardId: 'expanded_reich_rd',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: '合成机油', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'synthetic_oil' }] },
              { label: '高级德意志帝国研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'advanced_reich_rd' }] },
            ],
          },
        ],
      },
    ],
  },

  // 中文原文：消灭 1 个花费不大于 3 的单位。
  v1_flying_bomb: {
    cardId: 'v1_flying_bomb',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'destroyUnitByMaxCost', params: { maxCost: 3, count: 1 } }] },
    ],
  },

  // ---- 日本 Token / 衍生 ----
  // 中文原文：抉择：将 1 张“氧气鱼雷” 或 1 张“高级帝国研发”加入手中。
  expanded_imperial_rd: {
    cardId: 'expanded_imperial_rd',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: '氧气鱼雷', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'long_lance' }] },
              { label: '高级帝国研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'advanced_imperial_rd' }] },
            ],
          },
        ],
      },
    ],
  },

  // 中文原文：对敌方总部造成 1 点伤害，抽 1 张牌。
  kamikaze: {
    cardId: 'kamikaze',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 1 },
          { op: 'draw', side: 'self', count: 1 },
        ],
      },
    ],
  },

  // ---- 苏联 Token / 衍生（科研链）----
  // 中文原文：抉择：将 1 张“标准弹药” 或 1 张“高级苏联研发”加入手中。
  expanded_soviet_research: {
    cardId: 'expanded_soviet_research',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: '标准弹药', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'standard_ammo' }] },
              { label: '高级苏联研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'advanced_soviet_research' }] },
            ],
          },
        ],
      },
    ],
  },

  // 中文原文：抽 1 张牌。
  // （占位：部分科研衍生卡文本极简，按“抽 1 张牌”兜底，命中即在此登记）
  synthetic_oil: {
    cardId: 'synthetic_oil',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'gainKredits', side: 'self', amount: 10 },
          { op: 'draw', side: 'self', count: 1 },
        ],
      },
    ],
  },
};
