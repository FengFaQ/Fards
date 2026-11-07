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
};
