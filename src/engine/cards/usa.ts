/**
 * 美国（USA）卡牌脚本
 * ------------------------------------------------------------------
 * 数据集中本阵营共 284 张：可构筑 254 张 + 衍生/老兵形态 30 张（衍生卡脚本放 tokens.ts）。
 * 实现优先级见 docs/META_CARDS.md；覆盖进度见 docs/CARD_COVERAGE.md。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 *
 * 本文件当前批次：META top200 的 A 类美国卡（13 张，rank 见注释）。
 * `custom` 占位表示执行器尚未实现该原语（清单见 docs/CARD_COVERAGE.md 第 6 节）。
 */

import type { CardScript } from '../types';

export const USA_CARD_SCRIPTS: Record<string, CardScript> = {
  // 中文原文：使 1 个坦克或步兵获得 +1+1。（原示例，非 top200 A 类）
  usace: {
    cardId: 'usace',
    abilities: [
      {
        trigger: 'order',
        target: {
          kind: 'query',
          side: 'any',
          line: 'any',
          filter: { type: ['tank', 'infantry'] },
          limit: 1,
        },
        effects: [{ op: 'buff', target: { kind: 'chosen' }, attack: 1, hp: 1, permanent: true }],
      },
    ],
  },

  // ---- META #57 ----
  // 中文原文：抉择：将 1 张“B-24D” 或 1 张“B-24J”加入手牌。
  production_order: {
    cardId: 'production_order',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: 'B-24D', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'b24d' }] },
              { label: 'B-24J', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'b24j' }] },
            ],
          },
        ],
      },
    ],
  },

  // ---- META #89 ----
  // 中文原文：友方回合结束时，将 1 个“SBD 3 无畏”加入支援阵线。
  tigercat: {
    cardId: 'tigercat',
    abilities: [
      {
        trigger: 'turnEnd',
        effects: [{ op: 'summon', side: 'self', cardId: 'sbd_3_dauntless', line: 'support' }],
      },
    ],
  },

  // ---- META #96 ----
  // 中文原文：抉择：将 1 张“深水炸弹” 或 1 张“扩展美国研发”加入手牌。
  us_military_research: {
    cardId: 'us_military_research',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: '深水炸弹', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'depth_charges' }] },
              { label: '扩展美国研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'expanded_us_research' }] },
            ],
          },
        ],
      },
    ],
  },

  // ---- META #97 ----
  // 中文原文：消灭前线 1 个单位。使相邻单位撤退。
  uss_missouri: {
    cardId: 'uss_missouri',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'frontline', limit: 1 },
        effects: [
          { op: 'destroy', target: { kind: 'chosen' } },
          // 相邻单位撤退（以被消灭单位的位置为基准）
          { op: 'custom', id: 'moveUnitZone', params: { of: 'adjacent', to: 'hand' } },
        ],
      },
    ],
  },

  // ---- META #117 ----
  // 中文原文：部署：消灭 1 个攻击力和防御力之和不大于 6 的敌方单位。
  fifth_ohio: {
    cardId: 'fifth_ohio',
    abilities: [
      {
        trigger: 'deploy',
        // UnitFilter 无“攻防之和”过滤 → custom 选目标并消灭
        effects: [{ op: 'custom', id: 'destroyUnitByStatSum', params: { side: 'enemy', sum: 6, compare: 'lte', count: 1 } }],
      },
    ],
  },

  // ---- META #138 ----
  // 中文原文：使 1 个单位获得 +1+1，抽 1 张牌。
  for_freedom: {
    cardId: 'for_freedom',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'buff', target: { kind: 'chosen' }, attack: 1, hp: 1, permanent: true },
          { op: 'draw', side: 'self', count: 1 },
        ],
      },
    ],
  },

  // ---- META #145 ----
  // 中文原文：部署：造成 6 点伤害，随机分配至所有敌方目标。
  b29_superfortress: {
    cardId: 'b29_superfortress',
    abilities: [
      {
        trigger: 'deploy',
        effects: [{ op: 'custom', id: 'damageSplitRandom', params: { amount: 6, side: 'enemy', includeHQ: true } }],
      },
    ],
  },

  // ---- META #151 ----
  // 中文原文：部署：抽 2 张牌。选择 1 张手牌并将其返回卡组顶。
  thunderbolt: {
    cardId: 'thunderbolt',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          { op: 'draw', side: 'self', count: 2 },
          { op: 'custom', id: 'returnHandCardToDeckTop', params: { count: 1 } },
        ],
      },
    ],
  },

  // ---- META #158 ----
  // 中文原文：使前线所有敌方单位撤退，随机将 2 个攻击力之和为 6 的美国步兵加入前线。
  seaborne_invasion: {
    cardId: 'seaborne_invasion',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'moveUnitZone', params: { of: 'all', side: 'enemy', line: 'frontline', to: 'hand' } },
          { op: 'custom', id: 'summonByStatSum', params: { count: 2, stat: 'attack', sum: 6, faction: 'USA', type: 'infantry', line: 'frontline' } },
        ],
      },
    ],
  },

  // ---- META #159 ----
  // 中文原文：抉择：消灭所有奇数花费 或 所有偶数花费的单位。
  naval_battle: {
    cardId: 'naval_battle',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：消灭奇数花费或偶数花费的单位',
            options: [
              { label: '奇数花费', effects: [{ op: 'custom', id: 'destroyUnitsByCostParity', params: { parity: 'odd' } }] },
              { label: '偶数花费', effects: [{ op: 'custom', id: 'destroyUnitsByCostParity', params: { parity: 'even' } }] },
            ],
          },
        ],
      },
    ],
  },

  // ---- META #161 ----
  // 中文原文：抑制 1 个单位。
  duress: {
    cardId: 'duress',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [{ op: 'silence', target: { kind: 'chosen' } }],
      },
    ],
  },

  // ---- META #191 ----
  // 中文原文：使 1 个单位和卡组顶的单位获得 +1+1。抽 1 张牌。
  uss_the_sullivans: {
    cardId: 'uss_the_sullivans',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'buff', target: { kind: 'chosen' }, attack: 1, hp: 1, permanent: true },
          { op: 'custom', id: 'buffDeckTopUnit', params: { attack: 1, hp: 1 } },
          { op: 'draw', side: 'self', count: 1 },
        ],
      },
    ],
  },

  // ---- META #198 ----
  // 中文原文：敌方单位攻击友方总部时，将其消灭。
  counter_strike: {
    cardId: 'counter_strike',
    counter: {
      trigger: 'enemyAttacks',
      text: '敌方单位攻击友方总部时，将其消灭。',
      effects: [{ op: 'custom', id: 'destroyAttacker' }],
    },
  },
};
