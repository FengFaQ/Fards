/**
 * 德国（Germany）卡牌脚本
 * ------------------------------------------------------------------
 * 数据集中本阵营共 276 张：可构筑 253 张 + 衍生/老兵形态 23 张（衍生卡脚本放 tokens.ts）。
 * 实现优先级见 docs/META_CARDS.md；覆盖进度见 docs/CARD_COVERAGE.md。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 *
 * 本文件当前批次：META top200 的 A 类德国卡（28 张，rank 见注释）。
 * `custom` 占位 = 执行器尚未实现该原语，id/params 约定见 docs/CARD_COVERAGE.md 第 6 节。
 */

import type { CardScript } from '../types';

export const GERMANY_CARD_SCRIPTS: Record<string, CardScript> = {
  // ---- META #5 ----
  // 中文原文：抽数张牌，直到友方手牌数与敌方相同。
  enigma: {
    cardId: 'enigma',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'drawUntilHandSizeMatchesEnemy' }] },
    ],
  },

  // ---- META #10 ----
  // 中文原文：抑制 1 个单位。若有友方空军，抽 1 张牌。
  suppression: {
    cardId: 'suppression',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'silence', target: { kind: 'chosen' } },
          {
            op: 'conditional',
            condition: {
              kind: 'count',
              target: { kind: 'query', side: 'self', line: 'any', filter: { type: ['fighter', 'bomber'] } },
              op: 'gt',
              value: 0,
            },
            then: [{ op: 'draw', side: 'self', count: 1 }],
          },
        ],
      },
    ],
  },

  // ---- META #21 ----
  // 中文原文：抉择：将 1 张“V-1 飞行炸弹” 或 1 张“扩展德意志帝国研发”加入手牌。
  reich_research: {
    cardId: 'reich_research',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：选择 1 张加入手牌',
            options: [
              { label: 'V-1 飞行炸弹', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'v1_flying_bomb' }] },
              { label: '扩展德意志帝国研发', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'expanded_reich_rd' }] },
            ],
          },
        ],
      },
    ],
  },

  // ---- META #24 ----
  // 中文原文：部署：若友方单位数不大于敌方单位，抽 1 张指令。
  arado_ar_196: {
    cardId: 'arado_ar_196',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'conditional',
            condition: {
              kind: 'count',
              target: { kind: 'query', side: 'self', line: 'any' },
              op: 'lte',
              value: { kind: 'count', target: { kind: 'query', side: 'enemy', line: 'any' } },
            },
            then: [{ op: 'custom', id: 'drawByType', params: { type: 'order', count: 1 } }],
          },
        ],
      },
    ],
  },

  // ---- META #26 ----
  // 中文原文：一回合一次，友方回合中消灭敌方单位时，获得 2 个指挥点。
  '158_nachschub': {
    cardId: '158_nachschub',
    abilities: [
      {
        trigger: 'unitDestroyed',
        anySide: true,
        oncePerTurn: true,
        condition: { kind: 'custom', id: 'friendlyTurnChosenIsEnemy' },
        effects: [{ op: 'gainKredits', side: 'self', amount: 2 }],
        text: '一回合一次：友方回合中消灭敌方单位时，获得 2 个指挥点',
      },
    ],
  },

  // ---- META #36 ----
  // 中文原文：对 1 个总部造成 8 点伤害。
  km_bismarck: {
    cardId: 'km_bismarck',
    abilities: [
      { trigger: 'order', effects: [{ op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 8 }] },
    ],
  },

  // ---- META #40 ----
  // 中文原文：本单位攻击后，将 1 张“战利品”加入手牌。
  heinkel_he_115: {
    cardId: 'heinkel_he_115',
    abilities: [
      { trigger: 'attack', effects: [{ op: 'addCardToHand', side: 'self', cardId: 'spoils_of_war' }] },
    ],
  },

  // ---- META #46 ----
  // 中文原文：部署：将所有敌方单位返回手牌。
  leopold: {
    cardId: 'leopold',
    abilities: [
      {
        trigger: 'deploy',
        effects: [{ op: 'custom', id: 'moveUnitZone', params: { of: 'all', side: 'enemy', to: 'hand' } }],
      },
    ],
  },

  // ---- META #51 ----
  // 中文原文：部署：将 1 个敌方陆军返回手牌。
  fw_190_jagdbomber: {
    cardId: 'fw_190_jagdbomber',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'enemy', line: 'any', filter: { type: ['infantry', 'tank', 'artillery'] }, limit: 1 },
        effects: [{ op: 'custom', id: 'moveUnitZone', params: { of: 'chosen', to: 'hand' } }],
      },
    ],
  },

  // ---- META #56 ----
  // 中文原文：将所有敌方单位转换为“溃军”。
  capitulation: {
    cardId: 'capitulation',
    abilities: [
      {
        trigger: 'order',
        effects: [{ op: 'transform', target: { kind: 'query', side: 'enemy', line: 'any' }, cardId: 'routed_troops' }],
      },
    ],
  },

  // ---- META #63 ----
  // 中文原文：对 1 个敌方目标造成 1 点伤害。若是总部，抽 1 张牌。
  buzz_bomb: {
    cardId: 'buzz_bomb',
    abilities: [
      {
        trigger: 'order',
        effects: [{ op: 'custom', id: 'damageAnyTarget', params: { side: 'enemy', amount: 1, includeHQ: true, drawIfHQ: 1 } }],
      },
    ],
  },

  // ---- META #74 ----
  // 中文原文：对所有敌方单位造成 1 点伤害。若有单位被消灭，重复此效果。
  crossfire: {
    cardId: 'crossfire',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'damageRepeatWhileKill', params: { side: 'enemy', amount: 1 } }] },
    ],
  },

  // ---- META #83 ----
  // 中文原文：友方回合结束时，将本单位返回手牌。
  komet: {
    cardId: 'komet',
    abilities: [
      { trigger: 'turnEnd', effects: [{ op: 'custom', id: 'moveUnitZone', params: { of: 'self', to: 'hand' } }] },
    ],
  },

  // ---- META #84 ----
  // 中文原文：对敌方总部造成等同于其手牌数的伤害，敌方随机弃 1 张牌。
  kriegsmarine: {
    cardId: 'kriegsmarine',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: { kind: 'stat', of: 'enemyHQ', stat: 'handSize' } },
          { op: 'discard', side: 'enemy', count: 1, random: true },
        ],
      },
    ],
  },

  // ---- META #108 ----
  // 中文原文：部署：将 1 个单位返回手牌。若是友方单位，抽 1 张牌。
  '40_panzergrenadier': {
    cardId: '40_panzergrenadier',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'custom', id: 'moveUnitZone', params: { of: 'chosen', to: 'hand' } },
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'chosenIsFriendly' },
            then: [{ op: 'draw', side: 'self', count: 1 }],
          },
        ],
      },
    ],
  },

  // ---- META #109 ----
  // 中文原文：友方单位行动后，行动每花费 1 个指挥点，使其获得一次 +1+1。
  // TODO(原语): 需执行器提供“单位行动后”钩子 + 本回合行动花费统计 → 当前不生效。
  blue_legion: {
    cardId: 'blue_legion',
    abilities: [
      { trigger: 'any', effects: [{ op: 'custom', id: 'onFriendlyUnitActedBuffPerOperatingCost' }] },
    ],
  },

  // ---- META #114 ----
  // 中文原文：因其他卡牌增加攻击力时，具有 +1 攻击力，直到回合结束。
  // TODO(原语): 需执行器提供“被友方效果增益”钩子 → 当前不生效。
  sd_kfz_10_pak_38: {
    cardId: 'sd_kfz_10_pak_38',
    abilities: [{ trigger: 'any', effects: [{ op: 'custom', id: 'onGainedAttackBonus' }] }],
  },

  // ---- META #125 ----
  // 中文原文：敌方部署单位时，失去剩余指挥点。
  stranglehold: {
    cardId: 'stranglehold',
    counter: {
      trigger: 'enemyPlaysUnit',
      text: '敌方部署单位时，失去剩余指挥点。',
      effects: [{ op: 'setKredits', side: 'enemy', value: 0 }],
    },
  },

  // ---- META #126 ----
  // 中文原文：部署：移至前线。
  '18_infantry_regiment': {
    cardId: '18_infantry_regiment',
    abilities: [
      { trigger: 'deploy', effects: [{ op: 'moveUnit', target: { kind: 'self' }, toLine: 'frontline' }] },
    ],
  },

  // ---- META #132 ----
  // 中文原文：部署：若有友方步兵，抽 1 张牌。
  panzer_ia: {
    cardId: 'panzer_ia',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'conditional',
            condition: {
              kind: 'count',
              target: { kind: 'query', side: 'self', line: 'any', filter: { type: 'infantry' } },
              op: 'gt',
              value: 0,
            },
            then: [{ op: 'draw', side: 'self', count: 1 }],
          },
        ],
      },
    ],
  },

  // ---- META #136 ----
  // 中文原文：部署：将 1 张“35(t) 坦克”和 1 张“协同作战”加入手牌。
  '20_panzergrenadier': {
    cardId: '20_panzergrenadier',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          { op: 'addCardToHand', side: 'self', cardId: 'panzer_35t' },
          { op: 'addCardToHand', side: 'self', cardId: 'combined_arms' },
        ],
      },
    ],
  },

  // ---- META #152 ----
  // 中文原文：友方单位每有一种单位类型，抽 1 张牌。
  conquest: {
    cardId: 'conquest',
    abilities: [{ trigger: 'order', effects: [{ op: 'custom', id: 'drawPerDistinctUnitType' }] }],
  },

  // ---- META #156 ----
  // 中文原文：友方回合结束时，若前线有友方单位，抽 1 张牌。
  '22_infantry_regiment': {
    cardId: '22_infantry_regiment',
    abilities: [
      {
        trigger: 'turnEnd',
        effects: [
          {
            op: 'conditional',
            condition: {
              kind: 'count',
              target: { kind: 'query', side: 'self', line: 'frontline' },
              op: 'gt',
              value: 0,
            },
            then: [{ op: 'draw', side: 'self', count: 1 }],
          },
        ],
      },
    ],
  },

  // ---- META #163 ----
  // 中文原文：若前线有友方单位，获得 3 个指挥点。
  iron_from_the_north: {
    cardId: 'iron_from_the_north',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'conditional',
            condition: {
              kind: 'count',
              target: { kind: 'query', side: 'self', line: 'frontline' },
              op: 'gt',
              value: 0,
            },
            then: [{ op: 'gainKredits', side: 'self', amount: 3 }],
          },
        ],
      },
    ],
  },

  // ---- META #179 ----
  // 中文原文：部署：指向 1 个单位。其被消灭时，抽 1 张牌。
  '738_jger_regiment': {
    cardId: '738_jger_regiment',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [{ op: 'custom', id: 'watchChosenDeathDraw', params: { count: 1 } }],
      },
    ],
  },

  // ---- META #187 ----
  // 中文原文：使 1 个步兵或坦克具有 +5 攻击力，直到回合结束。
  old_hares: {
    cardId: 'old_hares',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', filter: { type: ['infantry', 'tank'] }, limit: 1 },
        effects: [{ op: 'buff', target: { kind: 'chosen' }, attack: 5, permanent: false }],
      },
    ],
  },

  // ---- META #195 ----
  // 中文原文：使所有友方德国坦克获得 +2+1。
  fast_heinz: {
    cardId: 'fast_heinz',
    abilities: [
      {
        trigger: 'order',
        effects: [{ op: 'custom', id: 'buffFactionUnits', params: { faction: 'Germany', type: 'tank', attack: 2, hp: 1 } }],
      },
    ],
  },

  // ---- META #199 ----
  // 中文原文：本单位行动后，获得等同于本局对战本单位行动次数的数值。
  // TODO(原语): 需执行器维护“本单位累计行动次数”并支持行动后钩子 → 当前不生效。
  panther_a_zimmerit: {
    cardId: 'panther_a_zimmerit',
    abilities: [{ trigger: 'any', effects: [{ op: 'custom', id: 'onActedGainAttackPerActionCount' }] }],
  },
};
