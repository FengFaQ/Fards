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

  // ==== B 类批次（META top100）====

  // ---- META #12 ----
  // 中文原文：本单位攻击后，移除本单位。将 1 张具有双倍攻击力和防御力的复制加入卡组。
  meteor: {
    cardId: 'meteor',
    abilities: [
      {
        trigger: 'attack',
        effects: [
          { op: 'custom', id: 'removeSelfFromGame' },
          { op: 'custom', id: 'copySelfToDeckWithMultiplier', params: { multiplier: 2 } },
        ],
      },
    ],
  },

  // ---- META #38 ----
  // 中文原文：每回合，友方使用的第一张指令具有 -1 花费。
  // TODO(原语): 需要“每回合首张指令”钩子 + 临时费用修正 → 当前不生效
  '85_pioneer_company': {
    cardId: '85_pioneer_company',
    abilities: [
      {
        trigger: 'orderPlayed',
        oncePerTurn: true,
        effects: [{ op: 'custom', id: 'modifyCost', params: { target: 'handAll', amount: -1, duration: 'turn' } }],
        text: '每回合，友方使用的第一张指令具有 -1 花费',
      },
    ],
  },

  // ---- META #41 ----
  // 中文原文：部署：抽取花费最低的指令。若是构筑之外的牌，重复此效果。
  '2nd_west_africa': {
    cardId: '2nd_west_africa',
    abilities: [
      { trigger: 'deploy', effects: [{ op: 'custom', id: 'drawCheapestOrder', params: { repeatIfUnowned: true } }] },
    ],
  },

  // ---- META #67 ----
  // 中文原文：部署：选择手中的 1 张指令。使其花费为 0 并将其返回卡组顶。
  gordon_highlanders: {
    cardId: 'gordon_highlanders',
    abilities: [
      { trigger: 'deploy', effects: [{ op: 'custom', id: 'handOrderToDeckTopCostZero' }] },
    ],
  },

  // ---- META #75 ----
  // 中文原文：压制所有敌方单位，对其造成 1 点伤害。敌方失去 1 个指挥点槽。
  shelling: {
    cardId: 'shelling',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'pin', target: { kind: 'query', side: 'enemy', line: 'any' } },
          { op: 'damage', target: { kind: 'query', side: 'enemy', line: 'any' }, amount: 1 },
          { op: 'custom', id: 'loseKreditSlots', params: { side: 'enemy', amount: 1 } },
        ],
      },
    ],
  },

  // ---- META #90 ----
  // 中文原文：部署：从“HX 175 护航队”、“沙漠之鼠”和“防御工事”中开发 1 张。
  hampshire_regiment: {
    cardId: 'hampshire_regiment',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'choice',
            prompt: '开发：选择 1 张加入手牌',
            options: [
              { label: 'HX 175 护航队', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'convoy_hx_175' }] },
              { label: '沙漠之鼠', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'the_desert_rats' }] },
              { label: '防御工事', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'fortification' }] },
            ],
          },
        ],
      },
    ],
  },

  // ==== B 类批次 2（META #101-150）====

  // ---- META #101 ----
  // 中文原文：友方非英国卡牌具有 +2 花费。被敌方指向或攻击时，抽 1 张牌。
  raf_mustang: {
    cardId: 'raf_mustang',
    abilities: [
      // TODO(原语): 非英国友方卡牌费用 +2 需要 modifyCost 支持 “非指定阵营”
      { trigger: 'any', effects: [{ op: 'custom', id: 'modifyCostOfNonFaction', params: { faction: 'Britain', amount: 2 } }] },
      { trigger: 'attacked', effects: [{ op: 'draw', side: 'self', count: 1 }] },
    ],
  },

  // ---- META #103 ----
  // 中文原文：随机将敌方卡组中的 3 张指令的复制洗入友方卡组。使其获得：“抽 1 张牌。”
  colossus: {
    cardId: 'colossus',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'copyEnemyOrdersToDeckAndGrantDraw', params: { count: 3 } }] },
    ],
  },

  // ---- META #116 ----
  // 中文原文：从“爆破”、“计划”和“生产”中开发 1 张，开发 1 张英国海军牌。
  bpf: {
    cardId: 'bpf',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '开发：选择 1 张加入手牌',
            options: [
              { label: '爆破', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'blast' }] },
              { label: '计划', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'plan' }] },
              { label: '生产', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'production' }] },
            ],
          },
          { op: 'custom', id: 'discoverFrom', params: { faction: 'Britain', maxCost: 4 } },
        ],
      },
    ],
  },

  // ---- META #133 ----
  // 中文原文：敌方使用指令时，将其反制，抽 1 张牌。
  ultra: {
    cardId: 'ultra',
    counter: {
      trigger: 'enemyUsesOrder',
      text: '敌方使用指令时，将其反制，抽 1 张牌。',
      effects: [{ op: 'custom', id: 'negatePlayedCard' }, { op: 'draw', side: 'self', count: 1 }],
    },
  },

  // ---- META #137 ----
  // 中文原文：前线至多有 2 个单位。部署：使前线所有单位撤退。
  black_prince: {
    cardId: 'black_prince',
    abilities: [
      // TODO(原语): “前线至多 2 个单位”是持续限制，需要被动槽位上限
      { trigger: 'any', effects: [{ op: 'custom', id: 'limitFrontlineSlots', params: { count: 2 } }] },
      {
        trigger: 'deploy',
        effects: [{ op: 'custom', id: 'moveUnitZone', params: { of: 'all', side: 'any', line: 'frontline', to: 'hand' } }],
      },
    ],
  },

  // ---- META #149 ----
  // 中文原文：下个敌方回合中，敌方手牌具有 +2 花费。
  raid: {
    cardId: 'raid',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'modifyEnemyHandCostNextTurn', params: { amount: 2 } }] },
    ],
  },

  // ==== P2 批次（META #151-200 的 B 类）====

  // ---- META #155 ----
  // 中文原文：敌方使用指令时，将其反制，转换为“计划”并返回手牌。
  hms_sceptre: {
    cardId: 'hms_sceptre',
    counter: {
      trigger: 'enemyUsesOrder',
      text: '敌方使用指令时，将其反制，转换为“计划”并返回手牌。',
      effects: [{ op: 'custom', id: 'negatePlayedCard' }, { op: 'custom', id: 'transformPlayedCardToHand', params: { cardId: 'plan' } }],
    },
  },

  // ---- META #157 ----
  // 中文原文：开发 1 张花费不大于 4 的英国指令。将其加入卡组，使其花费为 0。
  pams: {
    cardId: 'pams',
    abilities: [
      {
        trigger: 'order',
        effects: [{ op: 'custom', id: 'discoverToDeckCostZero', params: { faction: 'Britain', type: 'order', maxCost: 4 } }],
      },
    ],
  },

  // ---- META #178 ----
  // 中文原文：移除 1 个单位。将 2 张复制置于所有者卡组顶。
  fog_of_war: {
    cardId: 'fog_of_war',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'custom', id: 'removeFromGame' },
          { op: 'custom', id: 'putCopiesOnOwnerDeckTop', params: { count: 2 } },
        ],
      },
    ],
  },

  // ---- META #183 ----
  // 中文原文：使所有敌方单位获得：“本单位所有者回合开始时，对本单位造成 1 点伤害。”
  supply_shortage: {
    cardId: 'supply_shortage',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'custom',
            id: 'grantAbilityToAllEnemyUnits',
            params: { trigger: 'turnStart', effects: [{ op: 'damage', target: { kind: 'self' }, amount: 1 }] },
          },
        ],
      },
    ],
  },

  // ---- META #184 ----
  // 中文原文：敌方使用花费不小于 4 的指令时，将其反制。
  dowding_system: {
    cardId: 'dowding_system',
    counter: {
      trigger: 'enemyUsesOrder',
      text: '敌方使用花费不小于 4 的指令时，将其反制。',
      effects: [{ op: 'custom', id: 'negatePlayedCardIfCostAtLeast', params: { cost: 4 } }],
    },
  },

  // ---- META #190 ----
  // 中文原文：开发 1 张敌方卡组中的牌，然后开发 1 张友方卡组中的牌。
  the_rock_of_gibraltar: {
    cardId: 'the_rock_of_gibraltar',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'discoverFromDeck', params: { side: 'enemy', count: 1 } },
          { op: 'custom', id: 'discoverFromDeck', params: { side: 'self', count: 1 } },
        ],
      },
    ],
  },

  // ---- META #194 ----
  // 中文原文：若在手牌中，友方使用指令时，获得 -2 花费。
  // TODO(原语): 需要“在手牌中监听友方出指令”的钩子 → 当前不生效
  wellington: {
    cardId: 'wellington',
    abilities: [
      {
        trigger: 'orderPlayed',
        effects: [{ op: 'custom', id: 'discountWhileInHandOnFriendlyOrder', params: { amount: -2 } }],
        text: '若在手牌中，友方使用指令时，获得 -2 花费',
      },
    ],
  },
};
