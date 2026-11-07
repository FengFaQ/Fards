/**
 * 苏联（USSR / 数据集中 faction = `Soviet`）卡牌脚本
 * ------------------------------------------------------------------
 * 数据集中本阵营共 277 张：可构筑 254 张 + 衍生/老兵形态 23 张（衍生卡脚本放 tokens.ts）。
 * 实现优先级见 docs/META_CARDS.md；覆盖进度见 docs/CARD_COVERAGE.md。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 *
 * 本文件当前批次：META top200 的 A 类苏联卡（22 张，rank 见注释）。
 */

import type { CardScript } from '../types';

export const USSR_CARD_SCRIPTS: Record<string, CardScript> = {
  // ---- META #14 ----
  // 中文原文：其他友方单位被消灭时，使友方总部获得 +2 防御力。
  '329th_engineer_battalion': {
    cardId: '329th_engineer_battalion',
    abilities: [
      {
        trigger: 'unitDestroyed',
        effects: [{ op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 2 } }],
        text: '其他友方单位被消灭时，使友方总部获得 +2 防御力',
      },
    ],
  },

  // ---- META #16 ----
  // 中文原文：亡计：将 1 张“步兵第 414 团”洗入卡组，抽 1 张牌。
  '97th_rifles': {
    cardId: '97th_rifles',
    abilities: [
      {
        trigger: 'death',
        effects: [
          { op: 'custom', id: 'shuffleIntoDeck', params: { cardId: '414th_rifles', count: 1 } },
          { op: 'draw', side: 'self', count: 1 },
        ],
      },
    ],
  },

  // ---- META #23 ----
  // 中文原文：部署：将 1 个“轻步兵”加入支援阵线，将 1 张“爆破”加入手中。
  '3rd_morskoi_pekhoty': {
    cardId: '3rd_morskoi_pekhoty',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          { op: 'summon', side: 'self', cardId: 'light_infantry', line: 'support' },
          { op: 'addCardToHand', side: 'self', cardId: 'blast' },
        ],
      },
    ],
  },

  // ---- META #27 ----
  // 中文原文：亡计：抽 1 张牌。使友方总部获得等同于其花费的防御力。
  '289th_gatchina': {
    cardId: '289th_gatchina',
    abilities: [
      {
        trigger: 'death',
        effects: [
          { op: 'draw', side: 'self', count: 1 },
          { op: 'custom', id: 'gainHqDefense', params: { side: 'self', from: 'selfCost' } },
        ],
      },
    ],
  },

  // ---- META #29 ----
  // 中文原文：抉择：将 1 张“气动雪橇” 或 1 张“扩展苏联研发”加入手中。
  soviet_military_research: {
    cardId: 'soviet_military_research',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: '气动雪橇', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'aerosani' }] },
              { label: '扩展苏联研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'expanded_soviet_research' }] },
            ],
          },
        ],
      },
    ],
  },

  // ---- META #32 ----
  // 中文原文：抽取等同于敌方单位数的卡牌。
  by_the_sword: {
    cardId: 'by_the_sword',
    abilities: [
      {
        trigger: 'order',
        effects: [{ op: 'draw', side: 'self', count: { kind: 'count', target: { kind: 'query', side: 'enemy', line: 'any' } } }],
      },
    ],
  },

  // ---- META #37 ----
  // 中文原文：亡计：将上 1 个被消灭的友方陆军加入支援阵线。
  ilyushin_il10: {
    cardId: 'ilyushin_il10',
    abilities: [
      {
        trigger: 'death',
        effects: [{ op: 'custom', id: 'summonLastDestroyedUnit', params: { side: 'self', type: 'ground', line: 'support' } }],
      },
    ],
  },

  // ---- META #52 ----
  // 中文原文：指向 1 个单位。将其所有者的所有单位转换为此单位。
  victory_banners: {
    cardId: 'victory_banners',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [{ op: 'custom', id: 'convertOwnerUnitsToChosen' }],
      },
    ],
  },

  // ---- META #55 ----
  // 中文原文：对 1 个单位造成 6 点伤害。下个友方回合开始时，失去 2 个指挥点。
  extended_barrage: {
    cardId: 'extended_barrage',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'damage', target: { kind: 'chosen' }, amount: 6 },
          { op: 'custom', id: 'scheduleEffects', params: { when: 'selfTurnStart', effects: [{ op: 'gainKredits', side: 'self', amount: -2 }] } },
        ],
      },
    ],
  },

  // ---- META #65 ----
  // 中文原文：抉择：对所有陆军 或 空军造成 5 点伤害。
  strategic_focus: {
    cardId: 'strategic_focus',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：对所有陆军或所有空军造成 5 点伤害',
            options: [
              {
                label: '所有陆军',
                effects: [{ op: 'damage', target: { kind: 'query', side: 'any', line: 'any', filter: { type: ['infantry', 'tank', 'artillery'] } }, amount: 5 }],
              },
              {
                label: '所有空军',
                effects: [{ op: 'damage', target: { kind: 'query', side: 'any', line: 'any', filter: { type: ['fighter', 'bomber'] } }, amount: 5 }],
              },
            ],
          },
        ],
      },
    ],
  },

  // ---- META #71 ----
  // 中文原文：敌方每抽 1 张牌，对其总部造成 2 点伤害。
  kv1_1941: {
    cardId: 'kv1_1941',
    abilities: [
      {
        trigger: 'cardDrawn',
        anySide: true,
        effects: [{ op: 'custom', id: 'damageEnemyHqIfEnemyDrew', params: { amount: 2 } }],
        text: '敌方每抽 1 张牌，对其总部造成 2 点伤害',
      },
    ],
  },

  // ---- META #72 ----
  // 中文原文：亡计：将 1 个“步兵第 89 团”加入支援阵线。
  '178th_guard_rifles': {
    cardId: '178th_guard_rifles',
    abilities: [
      { trigger: 'death', effects: [{ op: 'summon', side: 'self', cardId: '89th_infantry_regiment', line: 'support' }] },
    ],
  },

  // ---- META #79 ----
  // 中文原文：本单位造成对战伤害时，将等量的“爆破”加入手中。
  // TODO(原语): 需要“对战伤害数值”上下文（damageDealt 触发目前不携带 amount）→ 当前不生效。
  stz5_katyusha: {
    cardId: 'stz5_katyusha',
    abilities: [{ trigger: 'any', effects: [{ op: 'custom', id: 'onCombatDamageAddCards', params: { cardId: 'blast' } }] }],
  },

  // ---- META #92 ----
  // 中文原文：友方步兵具有闪击。
  '909th_roslavl': {
    cardId: '909th_roslavl',
    passives: [
      {
        kind: 'aura',
        affect: { kind: 'query', side: 'self', line: 'any', filter: { type: 'infantry' } },
        grantKeywords: ['blitz'],
        text: '友方步兵具有闪击',
      },
    ],
  },

  // ---- META #119 ----
  // 中文原文：部署：随机消灭另 1 个友方单位。
  little_cobra: {
    cardId: 'little_cobra',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          { op: 'destroy', target: { kind: 'query', side: 'self', line: 'any', filter: { excludeSelf: true }, pick: 'random', limit: 1 } },
        ],
      },
    ],
  },

  // ---- META #121 ----
  // 中文原文：本单位受到伤害时，使友方总部获得等量的防御力。
  '845th_rifles': {
    cardId: '845th_rifles',
    abilities: [
      {
        trigger: 'damageDealt',
        anySide: true,
        condition: { kind: 'custom', id: 'chosenIsSelf' },
        effects: [{ op: 'custom', id: 'gainHqDefense', params: { side: 'self', from: 'lastDamage' } }],
        text: '本单位受到伤害时，使友方总部获得等量的防御力',
      },
    ],
  },

  // ---- META #122 ----
  // 中文原文：亡计：下个友方回合开始时，获得 3 个指挥点。
  '55th_rifles': {
    cardId: '55th_rifles',
    abilities: [
      {
        trigger: 'death',
        effects: [{ op: 'custom', id: 'scheduleEffects', params: { when: 'selfTurnStart', effects: [{ op: 'gainKredits', side: 'self', amount: 3 }] } }],
      },
    ],
  },

  // ---- META #127 ----
  // 中文原文：对 1 个陆军造成 6 点伤害。
  the_hammer: {
    cardId: 'the_hammer',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', filter: { type: ['infantry', 'tank', 'artillery'] }, limit: 1 },
        effects: [{ op: 'damage', target: { kind: 'chosen' }, amount: 6 }],
      },
    ],
  },

  // ---- META #148 ----
  // 中文原文：对 1 个单位和友方总部造成 1 点伤害，抽 1 张牌。
  bloody_sickle: {
    cardId: 'bloody_sickle',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'damage', target: { kind: 'chosen' }, amount: 1 },
          { op: 'damage', target: { kind: 'hq', side: 'self' }, amount: 1 },
          { op: 'draw', side: 'self', count: 1 },
        ],
      },
    ],
  },

  // ---- META #153 ----
  // 中文原文：对所有目标造成 4 点伤害。
  winter_offensive: {
    cardId: 'winter_offensive',
    abilities: [
      { trigger: 'order', effects: [{ op: 'damage', target: { kind: 'query', side: 'any', line: 'any' }, amount: 4 }] },
    ],
  },

  // ---- META #170 ----
  // 中文原文：对 1 个友方单位造成 1 点伤害。随机对 1 个敌方单位造成 4 点伤害。
  rush: {
    cardId: 'rush',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'self', line: 'any', limit: 1 },
        effects: [
          { op: 'damage', target: { kind: 'chosen' }, amount: 1 },
          { op: 'damage', target: { kind: 'query', side: 'enemy', line: 'any', pick: 'random', limit: 1 }, amount: 4 },
        ],
      },
    ],
  },

  // ---- META #192 ----
  // 中文原文：选择 1 张手牌。将其转换为 1 个单位。
  // TODO(原语): “手牌转换为单位”需要手牌区操作原语 → 当前 custom 占位。
  surveil: {
    cardId: 'surveil',
    abilities: [{ trigger: 'order', effects: [{ op: 'custom', id: 'transformHandCardToUnit' }] }],
  },

  // ==== B 类批次（META top100）====

  // ---- META #34 ----
  // 中文原文：若在手中，敌方每抽 1 张牌，获得 -1 花费。
  // TODO(原语): 需要“在手牌中监听敌方抽牌”的钩子 → 当前不生效
  '4th_guards_rifles': {
    cardId: '4th_guards_rifles',
    abilities: [
      {
        trigger: 'cardDrawn',
        anySide: true,
        effects: [{ op: 'custom', id: 'discountWhileInHandOnEnemyDraw', params: { amount: -1 } }],
        text: '若在手中，敌方每抽 1 张牌，获得 -1 花费',
      },
    ],
  },

  // ---- META #44 ----
  // 中文原文：友方回合开始时，对友方总部造成 2 点伤害，抽 1 张牌。第二次后，升为老兵。
  '216th_guards': {
    cardId: '216th_guards',
    abilities: [
      {
        trigger: 'turnStart',
        effects: [
          { op: 'damage', target: { kind: 'hq', side: 'self' }, amount: 2 },
          { op: 'draw', side: 'self', count: 1 },
          { op: 'custom', id: 'trackVeteranProgress', params: { threshold: 2, cardId: '216th_guards_vet' } },
        ],
      },
    ],
  },

  // ---- META #45 ----
  // 中文原文：消灭所有对战词条数不大于 1 的单位。
  monastyr: {
    cardId: 'monastyr',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'destroyUnitsByBattleKeywordCount', params: { max: 1 } }] },
    ],
  },

  // ---- META #54 ----
  // 中文原文：无法被抑制或失去冲击。
  // TODO(原语): 需要“关键字保护/免疫”机制 → 当前不生效
  t3485_1945: {
    cardId: 't3485_1945',
    abilities: [{ trigger: 'any', effects: [{ op: 'custom', id: 'immuneToSilenceAndKeywordLoss' }] }],
  },

  // ---- META #59 ----
  // 中文原文：部署：选择手中的 1 张花费不大于 3 的单位。将 1 个复制加入支援阵线。
  '336th_guards_naval': {
    cardId: '336th_guards_naval',
    abilities: [
      { trigger: 'deploy', effects: [{ op: 'custom', id: 'copyHandUnitToSupport', params: { maxCost: 3 } }] },
    ],
  },

  // ---- META #70 ----
  // 中文原文：部署：每有 1 个对战词条数不小于 2 的友方单位，抽 1 张牌。
  '44th_silesia': {
    cardId: '44th_silesia',
    abilities: [
      { trigger: 'deploy', effects: [{ op: 'custom', id: 'drawPerAllyBattleKeywordAtLeast', params: { count: 2 } }] },
    ],
  },

  // ---- META #87 ----
  // 中文原文：被敌方效果指向时，将 1 个复制加入友方总部相邻处。
  // TODO(原语): 需要“被敌方效果指向”钩子 → 当前不生效
  '75th_rifle_regiment': {
    cardId: '75th_rifle_regiment',
    abilities: [{ trigger: 'any', effects: [{ op: 'custom', id: 'onEnemyTargetedCopyToSupport' }] }],
  },

  // ==== B 类批次 2（META #101-150）====

  // ---- META #140 ----
  // 中文原文：使友方总部获得：“友方回合开始时，受到 1 点伤害，将 1 个‘T-34 1942’加入支援阵线。回合结束时，将其消灭。”
  front_formation: {
    cardId: 'front_formation',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'custom',
            id: 'grantHqAbility',
            params: {
              effects: [
                { op: 'damage', target: { kind: 'hq', side: 'self' }, amount: 1 },
                { op: 'summon', side: 'self', cardId: 't34_1942', line: 'support' },
              ],
            },
          },
        ],
      },
    ],
  },

  // ==== P2 批次（META #151-200 的 B 类）====

  // ---- META #173 ----
  // 中文原文：敌方回合中，友方总部具有免疫。
  // TODO(原语): 需要“总部免疫”被动机制 → 当前不生效
  '15th_motor_rifles': {
    cardId: '15th_motor_rifles',
    abilities: [{ trigger: 'any', effects: [{ op: 'custom', id: 'hqImmuneDuringEnemyTurn' }] }],
  },

  // ---- META #196 ----
  // 中文原文：使敌方总部获得：“每回合，累计受到的伤害不小于 3 时，使友方总部获得 +3 防御力。”
  road_to_berlin: {
    cardId: 'road_to_berlin',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'custom',
            id: 'grantHqAbility',
            params: {
              targetSide: 'enemy',
              thresholdDamage: 3,
              effects: [{ op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 3 } }],
            },
          },
        ],
      },
    ],
  },



  // ==== 长尾自动生成批次（严格模板解析，META 外高热度/Elite/Special）====

  // 中文原文：部署：将 1 张“预备役”加入手牌。
  '1271st_rifles': {
    cardId: '1271st_rifles',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'addCardToHand',
            side: 'self',
            cardId: 'reserves',
            count: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：对所有目标造成 1 点伤害。
  '152mm_howitzer_gun': {
    cardId: '152mm_howitzer_gun',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'query',
              side: 'any',
              line: 'any',
            },
            amount: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：将 1 个“摩托化步兵第 2 师”加入支援阵线。
  '1st_rifles': {
    cardId: '1st_rifles',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'summon',
            side: 'self',
            cardId: '2nd_rifles',
            count: 1,
            line: 'support',
          },
        ],
      },
    ],
  },

  // 中文原文：友方回合结束时，将 1 个“轻步兵”加入同一阵线。
  '25th_infantry_regiment': {
    cardId: '25th_infantry_regiment',
    abilities: [
      {
        trigger: 'turnEnd',
        effects: [
          {
            op: 'summon',
            side: 'self',
            cardId: 'light_infantry',
            count: 1,
            line: 'support',
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：将 1 个“IS-2”加入支援阵线。
  '272nd_guards': {
    cardId: '272nd_guards',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'summon',
            side: 'self',
            cardId: 'iosef_stalin_ii',
            count: 1,
            line: 'support',
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：将 1 个“轻步兵”加入支援阵线。
  '321st_rifle_regiment': {
    cardId: '321st_rifle_regiment',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'summon',
            side: 'self',
            cardId: 'light_infantry',
            count: 1,
            line: 'support',
          },
        ],
      },
    ],
  },

  // 中文原文：友方回合开始时，完全修复本单位。
  '42nd_rifles': {
    cardId: '42nd_rifles',
    abilities: [
      {
        trigger: 'turnStart',
        effects: [
          {
            op: 'heal',
            target: {
              kind: 'self',
            },
            amount: 99,
          },
        ],
      },
    ],
  },

  // 中文原文：部署：对 1 个敌方空军造成 4 点伤害。
  '52k': {
    cardId: '52k',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'chosen',
            },
            amount: 4,
          },
        ],
        target: {
          kind: 'query',
          side: 'enemy',
          line: 'any',
          filter: {
            type: [
              'fighter',
              'bomber',
            ],
          },
          limit: 1,
        },
      },
    ],
  },

  // 中文原文：亡计：将 2 个“步兵第 16 团”加入支援阵线。
  '573rd_rifles': {
    cardId: '573rd_rifles',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'summon',
            side: 'self',
            cardId: '16th_rifles',
            count: 2,
            line: 'support',
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：将 2 张“爆破”加入手中。
  '866th_rifles': {
    cardId: '866th_rifles',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'addCardToHand',
            side: 'self',
            cardId: 'blast',
            count: 2,
          },
        ],
      },
    ],
  },

  // 中文原文：抽 2 张单位。
  arctic_convoy: {
    cardId: 'arctic_convoy',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'custom',
            id: 'drawByType',
            params: {
              type: 'infantry',
              count: 2,
            },
          },
        ],
      },
    ],
  },

  // 中文原文：对 1 个敌方空军造成 4 点伤害。
  burning_sky: {
    cardId: 'burning_sky',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'chosen',
            },
            amount: 4,
          },
        ],
        target: {
          kind: 'query',
          side: 'enemy',
          line: 'any',
          filter: {
            type: [
              'fighter',
              'bomber',
            ],
          },
          limit: 1,
        },
      },
    ],
  },

  // 中文原文：抽 5 张牌，对友方总部造成 5 点伤害。
  five_year_plan: {
    cardId: 'five_year_plan',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'draw',
            side: 'self',
            count: 5,
          },
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'self',
            },
            amount: 5,
          },
        ],
      },
    ],
  },

  // 中文原文：对 1 个单位造成 3 点伤害。
  from_the_people: {
    cardId: 'from_the_people',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'chosen',
            },
            amount: 3,
          },
        ],
        target: {
          kind: 'query',
          side: 'any',
          line: 'any',
          limit: 1,
        },
      },
    ],
  },

  // 中文原文：亡计：将 1 个“伊-16 毛驴”加入支援阵线。
  i15_chaika: {
    cardId: 'i15_chaika',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'summon',
            side: 'self',
            cardId: 'i16_ishak',
            count: 1,
            line: 'support',
          },
        ],
      },
    ],
  },

  // 中文原文：将 3 张“波-2-II”加入手牌。
  night_witches: {
    cardId: 'night_witches',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'addCardToHand',
            side: 'self',
            cardId: 'polikarpov_po2ii',
            count: 3,
          },
        ],
      },
    ],
  },

  // 中文原文：部署：对友方总部造成 2 点伤害。
  su76m: {
    cardId: 'su76m',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'self',
            },
            amount: 2,
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：对友方总部造成 1 点伤害。
  t80: {
    cardId: 't80',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'self',
            },
            amount: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：将 2 个“T-34 1942”加入支援阵线。
  tractor_factories: {
    cardId: 'tractor_factories',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'summon',
            side: 'self',
            cardId: 't34_1942',
            count: 2,
            line: 'support',
          },
        ],
      },
    ],
  },

  // 中文原文：对所有目标造成 1 点伤害。
  winter_warfare: {
    cardId: 'winter_warfare',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'query',
              side: 'any',
              line: 'any',
            },
            amount: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：友方回合开始时，抽 1 张牌，对友方总部造成 1 点伤害。
  yak_7: {
    cardId: 'yak_7',
    abilities: [
      {
        trigger: 'turnStart',
        effects: [
          {
            op: 'draw',
            side: 'self',
            count: 1,
          },
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'self',
            },
            amount: 1,
          },
        ],
      },
    ],
  },

  // ==== 手写批次（模板无法覆盖的高热度卡）====

  // 中文原文：将 2 张“轻步兵”加入手牌，此前每使用过 1 张“预备役”，额外加入 1 张。
  reserves: {
    cardId: 'reserves',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'addCopiesScalingBySelfPlayed', params: { cardId: 'light_infantry', base: 2 } }] },
    ],
  },
};
