/**
 * 英国（Britain）卡牌脚本
 * ------------------------------------------------------------------
 * 数据集中本阵营共 266 张：可构筑 251 张 + 衍生/老兵形态 15 张（衍生卡脚本放 tokens.ts）。
 * 实现优先级见 docs/META_CARDS.md；覆盖进度见 docs/CARD_COVERAGE.md。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 *
 * 本文件当前批次：META top200 的 A 类英国卡（20 张，rank 见注释）。
 */

import type { CardScript } from '../types';

export const BRITAIN_CARD_SCRIPTS: Record<string, CardScript> = {
  // 中文原文：部署：使 1 个目标获得 +1 防御力。（原示例，非 top200 A 类）
  welsh_guards: {
    cardId: 'welsh_guards',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [{ op: 'buff', target: { kind: 'chosen' }, hp: 1, permanent: true }],
      },
    ],
  },

  // ---- META #2 ----
  // 中文原文：压制 1 个单位和其相邻单位。抽 1 张牌。
  monty: {
    cardId: 'monty',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'pin', target: { kind: 'chosen' } },
          { op: 'custom', id: 'pinAdjacentToChosen' },
          { op: 'draw', side: 'self', count: 1 },
        ],
      },
    ],
  },

  // ---- META #4 ----
  // 中文原文：抉择：将 1 张“雷达” 或 1 张“扩展皇家研发”加入手牌。
  royal_research: {
    cardId: 'royal_research',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: '雷达', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'radar' }] },
              { label: '扩展皇家研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'expanded_royal_research' }] },
            ],
          },
        ],
      },
    ],
  },

  // ---- META #6 ----
  // 中文原文：部署：将 1 张“爆破”和 1 张“计划”加入手中。
  no_46_commando: {
    cardId: 'no_46_commando',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          { op: 'addCardToHand', side: 'self', cardId: 'blast' },
          { op: 'addCardToHand', side: 'self', cardId: 'plan' },
        ],
      },
    ],
  },

  // ---- META #7 ----
  // 中文原文：抽 2 张牌。
  the_land_girls: {
    cardId: 'the_land_girls',
    abilities: [{ trigger: 'order', effects: [{ op: 'draw', side: 'self', count: 2 }] }],
  },

  // ---- META #11 ----
  // 中文原文：对所有敌方单位造成 2 点伤害。若上回合友方部署过英国步兵，抽 1 张牌。
  forward_observers: {
    cardId: 'forward_observers',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'damage', target: { kind: 'query', side: 'enemy', line: 'any' }, amount: 2 },
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'deployedFactionTypeLastTurn', params: { faction: 'Britain', type: 'infantry' } },
            then: [{ op: 'draw', side: 'self', count: 1 }],
          },
        ],
      },
    ],
  },

  // ---- META #13 ----
  // 中文原文：对所有敌方单位造成 2 点伤害。若是本回合使用的第二张指令，改为造成 4 点伤害。
  wave_after_wave: {
    cardId: 'wave_after_wave',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'ordersPlayedThisTurnAtLeast', params: { count: 2 } },
            then: [{ op: 'damage', target: { kind: 'query', side: 'enemy', line: 'any' }, amount: 4 }],
            else: [{ op: 'damage', target: { kind: 'query', side: 'enemy', line: 'any' }, amount: 2 }],
          },
        ],
      },
    ],
  },

  // ---- META #22 ----
  // 中文原文：使友方总部获得 +6 防御力。抽 2 张牌。
  sincerely_yours: {
    cardId: 'sincerely_yours',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 6 } },
          { op: 'draw', side: 'self', count: 2 },
        ],
      },
    ],
  },

  // ---- META #25 ----
  // 中文原文：友方抽 1 张牌时，使友方总部获得 +1 防御力。
  m3a3_honey: {
    cardId: 'm3a3_honey',
    abilities: [
      {
        // 需要执行器在抽牌时触发 cardDrawn（当前 game.ts 尚未 fire，已报 Lead）
        trigger: 'cardDrawn',
        oncePerTurn: false,
        effects: [{ op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 1 } }],
      },
    ],
  },

  // ---- META #33 ----
  // 中文原文：部署：使 1 个敌方单位的防御力为 1。
  no_9_commando: {
    cardId: 'no_9_commando',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'enemy', line: 'any', limit: 1 },
        effects: [{ op: 'setStats', target: { kind: 'chosen' }, hp: 1 }],
      },
    ],
  },

  // ---- META #39 ----
  // 中文原文：部署：将 1 张“卫戍”加入手牌。
  middlesex_regiment: {
    cardId: 'middlesex_regiment',
    abilities: [{ trigger: 'deploy', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'garrison' }] }],
  },

  // ---- META #48 ----
  // 中文原文：部署：将 1 个单位返回其所有者卡组顶。
  queens_own: {
    cardId: 'queens_own',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [{ op: 'custom', id: 'moveUnitZone', params: { of: 'chosen', to: 'deckTop' } }],
      },
    ],
  },

  // ---- META #49 ----
  // 中文原文：回合结束时，转换为“蚊式 F Mk II”。
  mosquito_b_mk_iv: {
    cardId: 'mosquito_b_mk_iv',
    abilities: [
      {
        trigger: 'turnEnd',
        effects: [{ op: 'transform', target: { kind: 'self' }, cardId: 'mosquito_f_mk_ii' }],
      },
    ],
  },

  // ---- META #69 ----
  // 中文原文：压制 1 个单位。将 2 个“卫戍”加入支援阵线。
  desert_dust: {
    cardId: 'desert_dust',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'pin', target: { kind: 'chosen' } },
          { op: 'summon', side: 'self', cardId: 'garrison', count: 2, line: 'support' },
        ],
      },
    ],
  },

  // ---- META #73 ----
  // 中文原文：使友方总部获得 +7 防御力。
  fortification: {
    cardId: 'fortification',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 7 } }] },
    ],
  },

  // ---- META #107 ----
  // 中文原文：若友方总部防御力不小于 30，对 1 个总部造成 20 点伤害。抽 4 张牌。
  the_commonwealth: {
    cardId: 'the_commonwealth',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'conditional',
            condition: { kind: 'stat', of: 'selfHQ', stat: 'hp', op: 'gte', value: 30 },
            // “1 个总部”取敌方总部（自身总部不可能作为攻击收益目标）
            then: [{ op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 20 }],
          },
          { op: 'draw', side: 'self', count: 4 },
        ],
      },
    ],
  },

  // ---- META #115 ----
  // 中文原文：敌方随机将 1 张手牌放回卡组顶，友方抽 1 张牌。
  mi5: {
    cardId: 'mi5',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'enemyHandCardToDeckTop', params: { count: 1, random: true } },
          { op: 'draw', side: 'self', count: 1 },
        ],
      },
    ],
  },

  // ---- META #123 ----
  // 中文原文：抽 2 张牌。
  convoy_hx_175: {
    cardId: 'convoy_hx_175',
    abilities: [{ trigger: 'order', effects: [{ op: 'draw', side: 'self', count: 2 }] }],
  },

  // ---- META #131 ----
  // 中文原文：将 1 张“生产”和 1 张“计划”加入手中。
  protected_convoy: {
    cardId: 'protected_convoy',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'addCardToHand', side: 'self', cardId: 'production' },
          { op: 'addCardToHand', side: 'self', cardId: 'plan' },
        ],
      },
    ],
  },

  // ---- META #147 ----
  // 中文原文：部署：使所有敌方陆军撤退。
  churchill_mk_iii_avre: {
    cardId: 'churchill_mk_iii_avre',
    abilities: [
      {
        trigger: 'deploy',
        effects: [{ op: 'custom', id: 'moveUnitZone', params: { of: 'all', side: 'enemy', type: 'ground', to: 'hand' } }],
      },
    ],
  },

  // ---- META #154 ----
  // 中文原文：部署：使友方总部获得 +4 防御力。
  the_glamour_boys: {
    cardId: 'the_glamour_boys',
    abilities: [
      { trigger: 'deploy', effects: [{ op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 4 } }] },
    ],
  },
};
