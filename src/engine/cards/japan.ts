/**
 * 日本（Japan）卡牌脚本
 * ------------------------------------------------------------------
 * 数据集中本阵营共 264 张：可构筑 252 张 + 衍生/老兵形态 12 张（衍生卡脚本放 tokens.ts）。
 * 实现优先级见 docs/META_CARDS.md；覆盖进度见 docs/CARD_COVERAGE.md。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 *
 * 本文件当前批次：META top200 的 A 类日本卡（25 张，rank 见注释）。
 */

import type { CardScript } from '../types';

export const JAPAN_CARD_SCRIPTS: Record<string, CardScript> = {
  // ---- META #3 ----
  // 中文原文：本单位攻击时，对敌方总部造成 2 点伤害。
  ki30_ann: {
    cardId: 'ki30_ann',
    abilities: [
      {
        trigger: 'attack',
        effects: [{ op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 2, source: 'unit' }],
      },
    ],
  },

  // ---- META #18 ----
  // 中文原文：抉择：将 1 张“气球炸弹” 或 1 张“扩展帝国研发”加入手中。
  imperial_research: {
    cardId: 'imperial_research',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: '气球炸弹', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'balloon_bombs' }] },
              { label: '扩展帝国研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'expanded_imperial_rd' }] },
            ],
          },
        ],
      },
    ],
  },

  // ---- META #20 ----
  // 中文原文：部署：消灭 1 个攻击力不大于 2 的敌方单位。
  '2nd_raiding_brigade': {
    cardId: '2nd_raiding_brigade',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'enemy', line: 'any', filter: { maxAttack: 2 }, limit: 1 },
        effects: [{ op: 'destroy', target: { kind: 'chosen' } }],
      },
    ],
  },

  // ---- META #30 ----
  // 中文原文：亡计：对敌方总部造成 2 点伤害，使友方总部获得 +2 防御力。
  ki61itei: {
    cardId: 'ki61itei',
    abilities: [
      {
        trigger: 'death',
        effects: [
          { op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 2 },
          { op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 2 } },
        ],
      },
    ],
  },

  // ---- META #35 ----
  // 中文原文：本单位消灭 1 个单位后，将 1 个“塞班混成守备队”加入支援阵线。
  '77th_regiment': {
    cardId: '77th_regiment',
    abilities: [
      {
        trigger: 'unitDestroyed',
        anySide: true,
        condition: { kind: 'custom', id: 'destroyedBySelf' },
        effects: [{ op: 'summon', side: 'self', cardId: '20th_infantry_regiment', line: 'support' }],
        text: '本单位消灭单位后，将 1 个“塞班混成守备队”加入支援阵线',
      },
    ],
  },

  // ---- META #42 ----
  // 中文原文：对 1 个敌方目标造成 3 点伤害，对其相邻目标造成 2 点伤害。
  bombing_raid: {
    cardId: 'bombing_raid',
    abilities: [
      {
        trigger: 'order',
        effects: [{ op: 'custom', id: 'damageTargetAndAdjacent', params: { side: 'enemy', amount: 3, adjacentAmount: 2 } }],
      },
    ],
  },

  // ---- META #43 ----
  // 中文原文：若友方总部防御力不大于 10，抽 1 张牌。使友方总部获得 +8 防御力。
  island_defense: {
    cardId: 'island_defense',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'conditional',
            condition: { kind: 'stat', of: 'selfHQ', stat: 'hp', op: 'lte', value: 10 },
            then: [{ op: 'draw', side: 'self', count: 1 }],
          },
          { op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 8 } },
        ],
      },
    ],
  },

  // ---- META #47 ----
  // 中文原文：亡计：结束回合。
  kurume_regiment: {
    cardId: 'kurume_regiment',
    abilities: [{ trigger: 'death', effects: [{ op: 'custom', id: 'endTurn' }] }],
  },

  // ---- META #53 ----
  // 中文原文：其他友方单位被消灭时，对敌方总部造成 1 点伤害。
  '1st_signal_regiment': {
    cardId: '1st_signal_regiment',
    abilities: [
      {
        trigger: 'unitDestroyed',
        effects: [{ op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 1 }],
        text: '其他友方单位被消灭时，对敌方总部造成 1 点伤害',
      },
    ],
  },

  // ---- META #61 ----
  // 中文原文：部署：将 1 张“偷袭”加入手牌。
  type_94_tk: {
    cardId: 'type_94_tk',
    abilities: [{ trigger: 'deploy', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'surprise_attack' }] }],
  },

  // ---- META #62 ----
  // 中文原文：部署：选择 1 张手牌。将其洗入卡组，抽 1 张牌。
  '10th_recon': {
    cardId: '10th_recon',
    abilities: [{ trigger: 'deploy', effects: [{ op: 'custom', id: 'handCardToDeckThenDraw', params: { count: 1 } }] }],
  },

  // ---- META #66 ----
  // 中文原文：若前线有友方日本单位，抽 2 张牌。
  expansion: {
    cardId: 'expansion',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'friendlyFactionUnitOnFrontline', params: { faction: 'Japan' } },
            then: [{ op: 'draw', side: 'self', count: 2 }],
          },
        ],
      },
    ],
  },

  // ---- META #80 ----
  // 中文原文：消灭所有攻击力不大于 4 的单位，结束回合。
  banzai: {
    cardId: 'banzai',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'destroy', target: { kind: 'query', side: 'any', line: 'any', filter: { maxAttack: 4 } } },
          { op: 'custom', id: 'endTurn' },
        ],
      },
    ],
  },

  // ---- META #88 ----
  // 中文原文：将 1 个“D3A2 九九舰爆”加入支援阵线。其随机对 1 个敌方单位造成等同于其攻击力的伤害。
  audacity: {
    cardId: 'audacity',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'summonAndStrike', params: { cardId: 'aichi_d3a2', line: 'support', side: 'enemy' } }] },
    ],
  },

  // ---- META #93 ----
  // 中文原文：其他友方单位具有 +1 攻击力。
  type_93: {
    cardId: 'type_93',
    passives: [
      {
        kind: 'aura',
        affect: { kind: 'query', side: 'self', line: 'any', filter: { excludeSelf: true } },
        attackDelta: 1,
        text: '其他友方单位具有 +1 攻击力',
      },
    ],
  },

  // ---- META #98 ----
  // 中文原文：本单位对敌方总部造成伤害后，获得 +1 攻击力。
  type_94_tk_early: {
    cardId: 'type_94_tk_early',
    abilities: [
      {
        trigger: 'attack',
        condition: { kind: 'custom', id: 'chosenIsEnemyHQ' },
        effects: [{ op: 'buff', target: { kind: 'self' }, attack: 1, permanent: true }],
        text: '本单位对敌方总部造成伤害后，获得 +1 攻击力',
      },
    ],
  },

  // ---- META #104 ----
  // 中文原文：消灭并收缴所有攻击力最低的单位。
  on_the_ascent: {
    cardId: 'on_the_ascent',
    abilities: [{ trigger: 'order', effects: [{ op: 'custom', id: 'destroySalvageLowestAttack' }] }],
  },

  // ---- META #112 ----
  // 中文原文：消灭所有单位。
  to_the_last_man: {
    cardId: 'to_the_last_man',
    abilities: [
      { trigger: 'order', effects: [{ op: 'destroy', target: { kind: 'query', side: 'any', line: 'any' } }] },
    ],
  },

  // ---- META #124 ----
  // 中文原文：友方回合开始时，友方抽 1 张牌，敌方抽 2 张牌。
  ki83: {
    cardId: 'ki83',
    abilities: [
      {
        trigger: 'turnStart',
        effects: [
          { op: 'draw', side: 'self', count: 1 },
          { op: 'draw', side: 'enemy', count: 2 },
        ],
      },
    ],
  },

  // ---- META #134 ----
  // 中文原文：其他友方日本单位具有 +2 攻击力。
  storm_division: {
    cardId: 'storm_division',
    passives: [
      {
        kind: 'aura',
        affect: { kind: 'query', side: 'self', line: 'any', filter: { excludeSelf: true } },
        attackDelta: 2,
        text: '其他友方日本单位具有 +2 攻击力',
      },
    ],
  },

  // ---- META #143 ----
  // 中文原文：具有冲击时，具有 +2 攻击力。
  // TODO(原语): 需要“只作用于自身”的光环（PassiveAura 的 affect 无法限定为自身）→ 当前用 custom 占位。
  '58th_infantry_regiment': {
    cardId: '58th_infantry_regiment',
    abilities: [{ trigger: 'any', effects: [{ op: 'custom', id: 'selfStatsWhileHasKeyword', params: { keyword: 'shock', attack: 2 } }] }],
  },

  // ---- META #172 ----
  // 中文原文：将 8 张“神风特攻队”洗入卡组。
  last_rites: {
    cardId: 'last_rites',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'shuffleIntoDeck', params: { cardId: 'kamikaze', count: 8 } }] },
    ],
  },

  // ---- META #176 ----
  // 中文原文：亡计：将 4 张“神风特攻队”洗入卡组。
  kikka: {
    cardId: 'kikka',
    abilities: [
      { trigger: 'death', effects: [{ op: 'custom', id: 'shuffleIntoDeck', params: { cardId: 'kamikaze', count: 4 } }] },
    ],
  },

  // ---- META #181 ----
  // 中文原文：将 2 个“搜索第三十三联队”加入支援阵线。
  scouting_party: {
    cardId: 'scouting_party',
    abilities: [
      { trigger: 'order', effects: [{ op: 'summon', side: 'self', cardId: '33rd_recon', count: 2, line: 'support' }] },
    ],
  },

  // ---- META #185 ----
  // 中文原文：消灭 1 个攻击力不大于 2 的单位和其他同名单位。
  overpower: {
    cardId: 'overpower',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'destroyUnitAndSameName', params: { maxAttack: 2 } }] },
    ],
  },

  // ==== B 类批次（META top100）====

  // ---- META #8 ----
  // 中文原文：对所有敌方目标造成 2 点伤害。友方失去 1 个指挥点槽。
  desperate_measures: {
    cardId: 'desperate_measures',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'damage', target: { kind: 'query', side: 'enemy', line: 'any' }, amount: 2 },
          { op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 2 },
          { op: 'custom', id: 'loseKreditSlots', params: { side: 'self', amount: 1 } },
        ],
      },
    ],
  },

  // ---- META #19 ----
  // 中文原文：部署：预报。若指挥点数为 0，抽 1 张牌。
  yokosuka_e14y: {
    cardId: 'yokosuka_e14y',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          { op: 'custom', id: 'revealIntel', params: { count: 1 } },
          {
            op: 'conditional',
            condition: { kind: 'stat', of: 'selfHQ', stat: 'kredits', op: 'eq', value: 0 },
            then: [{ op: 'draw', side: 'self', count: 1 }],
          },
        ],
      },
    ],
  },

  // ---- META #58 ----
  // 中文原文：消灭 1 个步兵。若其攻击力大于友方指挥点槽数，失去 1 个指挥点槽。
  ferocious_assault: {
    cardId: 'ferocious_assault',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', filter: { type: 'infantry' }, limit: 1 },
        effects: [
          { op: 'destroy', target: { kind: 'chosen' } },
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'chosenAttackGtMaxKredits' },
            then: [{ op: 'custom', id: 'loseKreditSlots', params: { side: 'self', amount: 1 } }],
          },
        ],
      },
    ],
  },

  // ---- META #76 ----
  // 中文原文：部署：抽 2 张花费为 1 的单位。
  ki46_dinah_iii: {
    cardId: 'ki46_dinah_iii',
    abilities: [
      { trigger: 'deploy', effects: [{ op: 'custom', id: 'drawUnitByCost', params: { cost: 1, count: 2 } }] },
    ],
  },

  // ---- META #77 ----
  // 中文原文：若指挥点槽数不大于 3，造成双倍伤害。
  // TODO(原语): 需要“条件性伤害翻倍”钩子 → 当前不生效
  '238th_regiment': {
    cardId: '238th_regiment',
    abilities: [{ trigger: 'any', effects: [{ op: 'custom', id: 'doubleDamageWhileMaxKreditsLte', params: { maxKredits: 3 } }] }],
  },

  // ---- META #78 ----
  // 中文原文：友方使用海军牌时，获得 +1+1。亡计：洗切卡组，抽 1 张牌。
  '5th_sasebo_snlf': {
    cardId: '5th_sasebo_snlf',
    abilities: [
      {
        // TODO(原语): 需要“友方使用海军牌”钩子（cardPlayed + naval 判定）→ 当前不生效
        trigger: 'any',
        effects: [{ op: 'custom', id: 'onFriendlyNavalCardPlayedBuffSelf', params: { attack: 1, hp: 1 } }],
      },
      { trigger: 'death', effects: [{ op: 'draw', side: 'self', count: 1 }] },
    ],
  },

  // ---- META #82 ----
  // 中文原文：额外获得 1 个指挥点槽。敌方失去 1 个指挥点槽。
  southern_plan: {
    cardId: 'southern_plan',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'gainKreditSlots', params: { side: 'self', amount: 1 } },
          { op: 'custom', id: 'loseKreditSlots', params: { side: 'enemy', amount: 1 } },
        ],
      },
    ],
  },

  // ---- META #95 ----
  // 中文原文：失去 1 个指挥点槽。使所有友方单位获得：“亡计：对敌方总部造成 1 点伤害。获得 1 个指挥点槽。”
  special_attack: {
    cardId: 'special_attack',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'loseKreditSlots', params: { side: 'self', amount: 1 } },
          { op: 'custom', id: 'grantDeathTriggerToAllies', params: { amount: 1 } },
        ],
      },
    ],
  },

  // ---- META #100 ----
  // 中文原文：敌方使用指令时，对其总部造成 1 点伤害。
  // TODO(原语): 需要“敌方使用指令”钩子（卡牌事件类触发）→ 当前不生效
  shibata_regiment: {
    cardId: 'shibata_regiment',
    abilities: [
      {
        trigger: 'orderPlayed',
        anySide: true,
        effects: [{ op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 1 }],
        text: '敌方使用指令时，对其总部造成 1 点伤害',
      },
    ],
  },

  // ==== B 类批次 2（META #101-150）====

  // ---- META #118 ----
  // 中文原文：敌方使用指令时，获得 +1+1 和 -1 行动花费。
  // TODO(原语): 需要“敌方使用指令”钩子 → 当前不生效
  j2m_raiden: {
    cardId: 'j2m_raiden',
    abilities: [
      {
        trigger: 'orderPlayed',
        anySide: true,
        condition: { kind: 'custom', id: 'playedByEnemy' },
        effects: [
          { op: 'buff', target: { kind: 'self' }, attack: 1, hp: 1, permanent: true },
          { op: 'custom', id: 'modifyOperationCost', params: { amount: -1 } },
        ],
        text: '敌方使用指令时，获得 +1+1 和 -1 行动花费',
      },
    ],
  },

  // ---- META #135 ----
  // 中文原文：消灭所有单位。双方失去 6 个指挥点槽。使双方卡组中的单位获得 +3 攻击力。
  last_ditch_force: {
    cardId: 'last_ditch_force',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'destroy', target: { kind: 'query', side: 'any', line: 'any' } },
          { op: 'custom', id: 'loseKreditSlots', params: { side: 'self', amount: 6 } },
          { op: 'custom', id: 'loseKreditSlots', params: { side: 'enemy', amount: 6 } },
          { op: 'custom', id: 'buffUnitsInBothDecks', params: { attack: 3 } },
        ],
      },
    ],
  },

  // ---- META #141 ----
  // 中文原文：消灭 1 个攻击力不大于友方指挥点槽数的单位。失去 1 个指挥点槽。
  commit_the_reserves: {
    cardId: 'commit_the_reserves',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'destroyUnitByMaxKredits', params: { side: 'any', count: 1 } },
          { op: 'custom', id: 'loseKreditSlots', params: { side: 'self', amount: 1 } },
        ],
      },
    ],
  },

  // ---- META #144 ----
  // 中文原文：友方预报时，抽 1 张牌。部署：预报。
  kawanishi_h8k: {
    cardId: 'kawanishi_h8k',
    abilities: [
      // TODO(原语): 需要“友方预报/情报”钩子 → 当前仅部署时的预报生效
      { trigger: 'any', effects: [{ op: 'custom', id: 'onFriendlyRevealDraw', params: { count: 1 } }] },
      { trigger: 'deploy', effects: [{ op: 'custom', id: 'revealIntel', params: { count: 1 } }] },
    ],
  },

  // ==== P2 批次（META #151-200 的 B 类）====

  // ---- META #174 ----
  // 中文原文：部署：移除 1 个敌方单位，直到本单位离开战场。
  kyoto_regiment: {
    cardId: 'kyoto_regiment',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'enemy', line: 'any', limit: 1 },
        effects: [{ op: 'custom', id: 'phaseOutEnemyUnitUntilSelfLeaves' }],
      },
    ],
  },

  // ---- META #186 ----
  // 中文原文：开发 1 张卡组中的牌。失去 1 个指挥点槽。
  air_land_sea: {
    cardId: 'air_land_sea',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'discoverFromDeck', params: { side: 'self', count: 1 } },
          { op: 'custom', id: 'loseKreditSlots', params: { side: 'self', amount: 1 } },
        ],
      },
    ],
  },

  // ---- META #197 ----
  // 中文原文：压制 1 个单位并预报。若指挥点数为 0，具有情报 3。
  cruiser_scouts: {
    cardId: 'cruiser_scouts',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'pin', target: { kind: 'chosen' } },
          {
            op: 'conditional',
            condition: { kind: 'stat', of: 'selfHQ', stat: 'kredits', op: 'eq', value: 0 },
            then: [{ op: 'custom', id: 'revealIntel', params: { count: 3 } }],
            else: [{ op: 'custom', id: 'revealIntel', params: { count: 1 } }],
          },
        ],
      },
    ],
  },



  // ==== 长尾自动生成批次（严格模板解析，META 外高热度/Elite/Special）====

  // 中文原文：亡计：对敌方总部造成 2 点伤害。
  '1st_taipei_regiment': {
    cardId: '1st_taipei_regiment',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'enemy',
            },
            amount: 2,
          },
        ],
      },
    ],
  },

  // 中文原文：本单位受到伤害时，抽 1 张牌。
  '33rd_recon': {
    cardId: '33rd_recon',
    abilities: [
      {
        trigger: 'damageDealt',
        condition: {
          kind: 'custom',
          id: 'chosenIsSelf',
        },
        effects: [
          {
            op: 'draw',
            side: 'self',
            count: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：对所有敌方单位造成 1 点伤害。
  '56th_recon': {
    cardId: '56th_recon',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'query',
              side: 'enemy',
              line: 'any',
            },
            amount: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：抽 1 张牌。
  '61st_infantry_regiment': {
    cardId: '61st_infantry_regiment',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'draw',
            side: 'self',
            count: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：对敌方总部造成 2 点伤害，使友方总部获得 +2 防御力。
  '9th_guards_regiment': {
    cardId: '9th_guards_regiment',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'enemy',
            },
            amount: 2,
          },
          {
            op: 'custom',
            id: 'gainHqDefense',
            params: {
              side: 'self',
              amount: 2,
            },
          },
        ],
      },
    ],
  },

  // 中文原文：消灭 1 个敌方单位。
  blade_of_the_samurai: {
    cardId: 'blade_of_the_samurai',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'destroy',
            target: {
              kind: 'chosen',
            },
          },
        ],
        target: {
          kind: 'query',
          side: 'enemy',
          line: 'any',
          limit: 1,
        },
      },
    ],
  },

  // 中文原文：使所有友方单位获得 +3+1，结束回合。
  calm_before_the_storm: {
    cardId: 'calm_before_the_storm',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'buff',
            target: {
              kind: 'query',
              side: 'self',
              line: 'any',
            },
            attack: 3,
            hp: 1,
            permanent: true,
          },
          {
            op: 'custom',
            id: 'endTurn',
          },
        ],
      },
    ],
  },

  // 中文原文：消灭 1 个友方单位，抽 2 张牌。
  deadly_duty: {
    cardId: 'deadly_duty',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'destroy',
            target: {
              kind: 'chosen',
            },
          },
          {
            op: 'draw',
            side: 'self',
            count: 2,
          },
        ],
        target: {
          kind: 'query',
          side: 'self',
          line: 'any',
          limit: 1,
        },
      },
    ],
  },

  // 中文原文：消灭 1 个单位，随机弃 1 张牌。
  divine_wind: {
    cardId: 'divine_wind',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'destroy',
            target: {
              kind: 'chosen',
            },
          },
          {
            op: 'discard',
            side: 'enemy',
            count: 1,
            random: true,
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

  // 中文原文：亡计：对敌方总部造成 1 点伤害，使友方总部获得 +1 防御力。
  kfu_regiment: {
    cardId: 'kfu_regiment',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'enemy',
            },
            amount: 1,
          },
          {
            op: 'custom',
            id: 'gainHqDefense',
            params: {
              side: 'self',
              amount: 1,
            },
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：对敌方总部造成 2 点伤害。
  ki43_hayabusa: {
    cardId: 'ki43_hayabusa',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'enemy',
            },
            amount: 2,
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：消灭所有单位。
  ki49_storm_dragon: {
    cardId: 'ki49_storm_dragon',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'destroy',
            target: {
              kind: 'query',
              side: 'any',
              line: 'any',
            },
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：对敌方总部造成 2 点伤害。
  mito_regiment: {
    cardId: 'mito_regiment',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'enemy',
            },
            amount: 2,
          },
        ],
      },
    ],
  },

  // 中文原文：部署：将 1 张“IJN 御藏号”洗入卡组。
  n1k1_kyofu: {
    cardId: 'n1k1_kyofu',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'custom',
            id: 'shuffleIntoDeck',
            params: {
              cardId: 'ijn_mikura',
              count: 1,
              side: 'self',
            },
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：抽 1 张牌。
  shoge_detachment: {
    cardId: 'shoge_detachment',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'draw',
            side: 'self',
            count: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：敌方随机弃 1 张牌。
  takasaki_regiment: {
    cardId: 'takasaki_regiment',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'discard',
            side: 'enemy',
            count: 1,
            random: true,
          },
        ],
      },
    ],
  },

  // 中文原文：对所有敌方目标造成 1 点伤害。
  tora_tora_tora: {
    cardId: 'tora_tora_tora',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'query',
              side: 'enemy',
              line: 'any',
            },
            amount: 1,
          },
        ],
      },
    ],
  },

  // ==== 手写批次（模板无法覆盖的高热度卡）====

  // 中文原文：使 1 个友方战斗机具有 +1 攻击力和奋战，直到回合结束。
  burst_of_fire: {
    cardId: 'burst_of_fire',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'self', line: 'any', filter: { type: 'fighter' }, limit: 1 },
        effects: [
          { op: 'buff', target: { kind: 'chosen' }, attack: 1, permanent: false },
          // TODO(原语): 关键字需支持“直到回合结束”
          { op: 'custom', id: 'grantKeywordUntilEndOfTurn', params: { keyword: 'fury' } },
        ],
      },
    ],
  },

  // 中文原文：部署：对 1 个敌方目标造成 1 点伤害。亡计：若是敌方回合，将 1 张复制加入手牌。
  '106th_infantry_regiment': {
    cardId: '106th_infantry_regiment',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'enemy', line: 'any', limit: 1 },
        effects: [{ op: 'damage', target: { kind: 'chosen' }, amount: 1 }],
      },
      {
        trigger: 'death',
        condition: { kind: 'custom', id: 'isEnemyTurn' },
        effects: [{ op: 'custom', id: 'copySelfToHand' }],
        text: '亡计：若是敌方回合，将 1 张复制加入手牌',
      },
    ],
  },
};
