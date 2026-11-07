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
      {
        // unitActed：chosen = 行动单位；按该单位行动花费的次数增益（原语待实现）
        trigger: 'unitActed',
        effects: [{ op: 'custom', id: 'onFriendlyUnitActedBuffPerOperatingCost' }],
        text: '友方单位行动后，行动每花费 1 个指挥点，使其获得一次 +1+1',
      },
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
    abilities: [
      {
        trigger: 'unitActed',
        effects: [{ op: 'custom', id: 'onActedGainAttackPerActionCount' }],
        text: '本单位行动后，获得等同于本局对战本单位行动次数的数值',
      },
    ],
  },

  // ==== B 类批次（META top100）====

  // ---- META #15 ----
  // 中文原文：对敌方总部造成 4 点伤害。下个敌方回合中，敌方无法部署单位。
  km_tirpitz: {
    cardId: 'km_tirpitz',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 4 },
          { op: 'custom', id: 'restrictAction', params: { action: 'deploy', scope: 'enemyNextTurn' } },
        ],
      },
    ],
  },

  // ---- META #17 ----
  // 中文原文：对抗陆军和总部时，具有 +2 攻击力。部署：与 1 个敌方单位战斗。
  henschel_hs_129: {
    cardId: 'henschel_hs_129',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'enemy', line: 'any', limit: 1 },
        effects: [{ op: 'custom', id: 'forcedFight' }],
      },
      {
        // TODO(原语): “对抗指定类型目标时 +N 攻击力”需要伤害计算钩子 → 当前不生效
        trigger: 'any',
        effects: [{ op: 'custom', id: 'attackBonusVsTypes', params: { types: ['infantry', 'tank', 'artillery', 'hq'], attack: 2 } }],
      },
    ],
  },

  // ---- META #28 ----
  // 中文原文：在第四回合抽取。使卡组中的所有奇数花费的德国卡牌获得 -1 花费。
  front_and_homeland: {
    cardId: 'front_and_homeland',
    abilities: [
      {
        trigger: 'order',
        effects: [
          // 近似：只按阵营过滤（modifyCost 暂不支持 faction+parity 组合）
          { op: 'custom', id: 'modifyCost', params: { target: 'faction', faction: 'Germany', amount: -1 } },
          { op: 'custom', id: 'drawAtTurn', params: { turn: 4 } },
        ],
      },
    ],
  },

  // ---- META #68 ----
  // 中文原文：开发 1 张德国轻型坦克。将 1 张“竞争战法”加入手牌。
  blitz_doctrine: {
    cardId: 'blitz_doctrine',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'discoverFrom', params: { faction: 'Germany', type: 'tank', maxCost: 3 } },
          { op: 'addCardToHand', side: 'self', cardId: 'contest_doctrine' },
        ],
      },
    ],
  },

  // ---- META #85 ----
  // 中文原文：本单位攻击后，移除本单位，直到下个友方回合开始。
  // 注：曾用 phaseOutUntilNextTurn，但该实现会把单位留在 state.units 而不在任何阵线数组里，
  //     触发 integration.test.ts 的“单位必须在其阵线数组”不变量（已报 Lead）。暂用等价占位原语。
  salamander: {
    cardId: 'salamander',
    abilities: [
      { trigger: 'attack', effects: [{ op: 'custom', id: 'removeSelfUntilNextTurn', params: { phase: true } }] },
    ],
  },

  // ---- META #94 ----
  // 中文原文：部署：若有友方步兵，获得 -1 行动花费。
  panzer_35t: {
    cardId: 'panzer_35t',
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
            then: [{ op: 'custom', id: 'modifyOperationCost', params: { amount: -1 } }],
          },
        ],
      },
    ],
  },

  // ---- META #99 ----
  // 中文原文：使友方总部的防御力为 25。从卡组顶移除 10 张牌。
  alpenfestung: {
    cardId: 'alpenfestung',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'setHqDefense', params: { side: 'self', value: 25 } },
          { op: 'mill', side: 'self', count: 10 },
        ],
      },
    ],
  },

  // ==== B 类批次 2（META #101-150）====

  // ---- META #106 ----
  // 中文原文：使前线所有友方单位获得 +3 攻击力和 -1 行动花费，直到回合结束。
  blitzkrieg: {
    cardId: 'blitzkrieg',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'buff', target: { kind: 'query', side: 'self', line: 'frontline' }, attack: 3, permanent: false },
          { op: 'custom', id: 'modifyOperationCostArea', params: { side: 'self', line: 'frontline', amount: -1 } },
        ],
      },
    ],
  },

  // ---- META #120 ----
  // 中文原文：将 1 个友方单位返回手牌。使其花费为 0，直到回合结束。
  shifting_attack: {
    cardId: 'shifting_attack',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'self', line: 'any', limit: 1 },
        effects: [{ op: 'custom', id: 'returnChosenToHandAndCostZero' }],
      },
    ],
  },

  // ---- META #139 ----
  // 中文原文：将 1 个单位返回手牌。下个敌方回合开始时，敌方无法增加指挥点槽或抽牌。
  km_admiral_hipper: {
    cardId: 'km_admiral_hipper',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'custom', id: 'moveUnitZone', params: { of: 'chosen', to: 'hand' } },
          { op: 'custom', id: 'restrictAction', params: { action: 'kreditSlot', scope: 'enemyNextTurn' } },
          { op: 'custom', id: 'restrictAction', params: { action: 'draw', scope: 'enemyNextTurn' } },
        ],
      },
    ],
  },

  // ==== P2 批次（META #151-200 的 B 类）====

  // ---- META #160 ----
  // 中文原文：移除 1 个德国陆军。下个敌方回合结束时，将其返回并复制。
  second_front: {
    cardId: 'second_front',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'self', line: 'any', filter: { faction: 'Germany', type: ['infantry', 'tank', 'artillery'] }, limit: 1 },
        effects: [{ op: 'custom', id: 'phaseOutUnitReturnNextTurnEndAndCopy' }],
      },
    ],
  },

  // ---- META #165 ----
  // 中文原文：部署：开发 1 张德国反制。
  '15_aufklrung': {
    cardId: '15_aufklrung',
    abilities: [
      { trigger: 'deploy', effects: [{ op: 'custom', id: 'discoverFrom', params: { faction: 'Germany', type: 'countermeasure' } }] },
    ],
  },

  // ---- META #166 ----
  // 中文原文：友方德国单位行动后，本单位获得 -1 行动花费。
  // TODO(原语): 需要“友方单位行动后”钩子 → 当前不生效
  '30_infantry_regiment': {
    cardId: '30_infantry_regiment',
    abilities: [
      {
        // 需要判断“行动单位是友方德国单位” → 用 custom 条件 + modifyOperationCost 作用于自身
        trigger: 'unitActed',
        condition: { kind: 'custom', id: 'actedUnitIsFriendlyFaction', params: { faction: 'Germany' } },
        effects: [{ op: 'custom', id: 'modifyOperationCost', params: { amount: -1 } }],
        text: '友方德国单位行动后，本单位获得 -1 行动花费',
      },
    ],
  },

  // ---- META #167 ----
  // 中文原文：本单位攻击并消灭单位后，能再次行动。
  windhund_division: {
    cardId: 'windhund_division',
    abilities: [
      {
        trigger: 'attack',
        condition: { kind: 'custom', id: 'attackKilledTarget' },
        effects: [{ op: 'custom', id: 'extraAction' }],
        text: '本单位攻击并消灭单位后，能再次行动',
      },
    ],
  },

  // ---- META #180 ----
  // 中文原文：使 1 个单位撤退。若卡组顶是海军牌，抽 1 张牌。
  u16: {
    cardId: 'u16',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'custom', id: 'moveUnitZone', params: { of: 'chosen', to: 'hand' } },
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'deckTopIsNaval' },
            then: [{ op: 'draw', side: 'self', count: 1 }],
          },
        ],
      },
    ],
  },



  // ==== 长尾自动生成批次（严格模板解析，META 外高热度/Elite/Special）====

  // 中文原文：部署：对敌方总部造成 2 点伤害。
  '10_5_cm_lefh': {
    cardId: '10_5_cm_lefh',
    abilities: [
      {
        trigger: 'deploy',
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

  // 中文原文：友方单位部署时，对敌方总部造成 1 点伤害。
  '15_cm_autokanone': {
    cardId: '15_cm_autokanone',
    abilities: [
      {
        trigger: 'unitDeployed',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'enemy',
            },
            amount: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：部署：使所有友方坦克获得 +2 攻击力。
  '33_panzergrenadier': {
    cardId: '33_panzergrenadier',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'buff',
            target: {
              kind: 'query',
              side: 'self',
              line: 'any',
              filter: {
                type: [
                  'tank',
                ],
              },
            },
            attack: 2,
            permanent: true,
          },
        ],
      },
    ],
  },

  // 中文原文：部署：将 1 张“生产”加入手中。
  '957_volksgrenadier': {
    cardId: '957_volksgrenadier',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'addCardToHand',
            side: 'self',
            cardId: 'production',
            count: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：对 1 个总部造成 3 点伤害。
  air_blitz: {
    cardId: 'air_blitz',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'hq',
              side: 'enemy',
            },
            amount: 3,
          },
        ],
      },
    ],
  },

  // 中文原文：部署：抽 1 张牌。
  fw_190_a: {
    cardId: 'fw_190_a',
    abilities: [
      {
        trigger: 'deploy',
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

  // 中文原文：友方回合开始时，获得 1 个指挥点。
  gebirgspionier_95: {
    cardId: 'gebirgspionier_95',
    abilities: [
      {
        trigger: 'turnStart',
        effects: [
          {
            op: 'gainKredits',
            side: 'self',
            amount: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：本单位对敌方总部造成伤害时，敌方随机弃 1 张牌。
  ju_87_b_stuka: {
    cardId: 'ju_87_b_stuka',
    abilities: [
      {
        trigger: 'attack',
        condition: {
          kind: 'custom',
          id: 'chosenIsEnemyHQ',
        },
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

  // 中文原文：部署：消灭所有敌方空军。
  me_262a_schwalbe: {
    cardId: 'me_262a_schwalbe',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'destroy',
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
            },
          },
        ],
      },
    ],
  },

  // 中文原文：部署：对 1 个敌方单位造成 1 点伤害。
  nebelwerfer_42: {
    cardId: 'nebelwerfer_42',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'damage',
            target: {
              kind: 'chosen',
            },
            amount: 1,
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

  // 中文原文：部署：抽 1 张牌。
  panzer_38t: {
    cardId: 'panzer_38t',
    abilities: [
      {
        trigger: 'deploy',
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

  // 中文原文：部署：使 1 个单位撤退。
  panzer_iv_f2: {
    cardId: 'panzer_iv_f2',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'custom',
            id: 'moveUnitZone',
            params: {
              of: 'chosen',
              to: 'hand',
            },
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

  // 中文原文：消灭 1 个空军，抽 1 张牌。
  sky_barons: {
    cardId: 'sky_barons',
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
            count: 1,
          },
        ],
        target: {
          kind: 'query',
          side: 'any',
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

  // ==== 手写批次（模板无法覆盖的高热度卡，含 custom 占位）====

  // 中文原文：攻击力不小于 4 的友方陆军造成的伤害 +3。
  // TODO(原语): 需要“友方单位伤害加成”光环（PassiveAura 无 damageDelta）
  '110_panzergrenadier': {
    cardId: '110_panzergrenadier',
    abilities: [
      { trigger: 'any', effects: [{ op: 'custom', id: 'allyDamageBonus', params: { minAttack: 4, type: 'ground', amount: 3 } }] },
    ],
  },

  // 中文原文：敌方使用指令后，其随机弃 1 张牌。
  '169_grenadiers': {
    cardId: '169_grenadiers',
    abilities: [
      {
        trigger: 'orderPlayed',
        anySide: true,
        condition: { kind: 'custom', id: 'playedByEnemy' },
        effects: [{ op: 'discard', side: 'enemy', count: 1, random: true }],
        text: '敌方使用指令后，其随机弃 1 张牌',
      },
    ],
  },

  // 中文原文：部署：从卡组顶的 3 张牌中选择 1 张并抽取，将其余 2 张置于卡组底。
  panzer_iiih: {
    cardId: 'panzer_iiih',
    abilities: [
      { trigger: 'deploy', effects: [{ op: 'custom', id: 'lookTopChooseDraw', params: { look: 3, take: 1 } }] },
    ],
  },

  // 中文原文：本单位攻击并消灭 1 个单位时，升为老兵。
  '7_schtzen': {
    cardId: '7_schtzen',
    abilities: [
      {
        trigger: 'attack',
        condition: { kind: 'custom', id: 'attackKilledTarget' },
        effects: [{ op: 'custom', id: 'upgradeVeteran', params: { cardId: '7_schtzen_vet' } }],
        text: '本单位攻击并消灭 1 个单位时，升为老兵',
      },
    ],
  },

  // 中文原文：敌方回合结束时，若可能，将 1 个“三号坦克 J 型”加入前线。否则，消灭前线所有单位。
  // TODO(原语): 反制牌目前只有 4 种触发（enemyPlaysCard/Unit/attacks/usesOrder），缺 enemyTurnEnd
  a_bridge_too_far: {
    cardId: 'a_bridge_too_far',
    counter: {
      trigger: 'enemyPlaysCard',
      text: '敌方回合结束时，若可能，将 1 个“三号坦克 J 型”加入前线。否则，消灭前线所有单位。',
      effects: [
        {
          op: 'custom',
          id: 'onEnemyTurnEndSummonOrDestroyFrontline',
          params: { cardId: 'panzer_iiij', line: 'frontline' },
        },
      ],
    },
  },

  // 中文原文：相邻陆军具有 +1 攻击力。
  // TODO(原语): PassiveAura 无法表达“相邻单位”范围
  sd_kfz_222: {
    cardId: 'sd_kfz_222',
    abilities: [
      { trigger: 'any', effects: [{ op: 'custom', id: 'adjacentAura', params: { type: 'ground', attack: 1 } }] },
    ],
  },
};
