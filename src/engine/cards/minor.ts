/**
 * 小国与盟军卡牌脚本：France / Italy / Finland / Poland / Anzac / Neutral
 * ------------------------------------------------------------------
 * 数据集中这些阵营共 279 张：可构筑 253 张 + 衍生 26 张（衍生卡脚本放 tokens.ts）。
 *   France 64（可构筑 62）/ Italy 62（61）/ Poland 60（59）/ Finland 44（43）/
 *   Anzac 33（28）/ Neutral 16（全部为衍生，脚本放 tokens.ts）
 * 实现优先级见 docs/META_CARDS.md；覆盖进度见 docs/CARD_COVERAGE.md。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 *
 * 本文件当前批次：META top200 的 A 类小国卡（12 张，rank 见注释）。
 */

import type { CardScript } from '../types';

export const MINOR_CARD_SCRIPTS: Record<string, CardScript> = {
  // ---- META #91 ----
  // 中文原文：双方抽数张牌，直到手牌数为 8。
  phoney_war: {
    cardId: 'phoney_war',
    abilities: [{ trigger: 'order', effects: [{ op: 'custom', id: 'drawBothUntilHandSize', params: { size: 8 } }] }],
  },

  // ---- META #102 ----
  // 中文原文：使所有敌方单位撤退。若不是最右侧手牌，结束回合。
  repel_the_attack: {
    cardId: 'repel_the_attack',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'moveUnitZone', params: { of: 'all', side: 'enemy', to: 'hand' } },
          {
            op: 'conditional',
            condition: { kind: 'not', condition: { kind: 'custom', id: 'usedFromRightmostHandCard' } },
            then: [{ op: 'custom', id: 'endTurn' }],
          },
        ],
      },
    ],
  },

  // ---- META #113 ----
  // 中文原文：部署：将 1 个单位转换为“溃军”。若是友方，抽 2 张牌。
  '15th_wolves_regiment': {
    cardId: '15th_wolves_regiment',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'transform', target: { kind: 'chosen' }, cardId: 'routed_troops' },
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'chosenIsFriendly' },
            then: [{ op: 'draw', side: 'self', count: 2 }],
          },
        ],
      },
    ],
  },

  // ---- META #128 ----
  // 中文原文：部署：将 1 个友方单位转换为“第 24 乌兰骑兵团”。
  '3rd_carpathian': {
    cardId: '3rd_carpathian',
    abilities: [
      {
        trigger: 'deploy',
        target: { kind: 'query', side: 'self', line: 'any', limit: 1 },
        effects: [{ op: 'transform', target: { kind: 'chosen' }, cardId: '24th_uan' }],
      },
    ],
  },

  // ---- META #129 ----
  // 中文原文：本单位攻击敌方总部时，使友方总部获得 +1 防御力，抽 1 张牌。
  dingo: {
    cardId: 'dingo',
    abilities: [
      {
        trigger: 'attack',
        condition: { kind: 'custom', id: 'chosenIsEnemyHQ' },
        effects: [
          { op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 1 } },
          { op: 'draw', side: 'self', count: 1 },
        ],
        text: '本单位攻击敌方总部时，使友方总部获得 +1 防御力，抽 1 张牌',
      },
    ],
  },

  // ---- META #142 ----
  // 中文原文：本单位对战并存活后，获得 +1+1。
  '28th_infantry_regiment': {
    cardId: '28th_infantry_regiment',
    abilities: [
      {
        trigger: 'attack',
        condition: { kind: 'custom', id: 'chosenIsUnit' },
        effects: [{ op: 'buff', target: { kind: 'self' }, attack: 1, hp: 1, permanent: true }],
        text: '本单位对战并存活后，获得 +1+1',
      },
    ],
  },

  // ---- META #146 ----
  // 中文原文：对 1 个单位造成 4 点伤害。若从手中最左侧使用，使友方总部获得 +5 防御力。
  z_special_unit: {
    cardId: 'z_special_unit',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'damage', target: { kind: 'chosen' }, amount: 4 },
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'usedFromLeftmostHandCard' },
            then: [{ op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 5 } }],
          },
        ],
      },
    ],
  },

  // ---- META #162 ----
  // 中文原文：对 1 个敌方目标造成 3 点伤害。使友方总部获得 +5 防御力。
  attack_in_the_colonies: {
    cardId: 'attack_in_the_colonies',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'damageAnyTarget', params: { side: 'enemy', amount: 3, includeHQ: true } },
          { op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 5 } },
        ],
      },
    ],
  },

  // ---- META #168 ----
  // 中文原文：抉择：使友方总部获得 +8 防御力 或 抽 2 张牌。
  call_to_the_colonies: {
    cardId: 'call_to_the_colonies',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'choice',
            prompt: '抉择：总部 +8 防御力，或抽 2 张牌',
            options: [
              { label: '总部 +8 防御力', effects: [{ op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 8 } }] },
              { label: '抽 2 张牌', effects: [{ op: 'draw', side: 'self', count: 2 }] },
            ],
          },
        ],
      },
    ],
  },

  // ---- META #171 ----
  // 中文原文：抽 2 张牌。对友方总部造成 2 点伤害。
  anders_army: {
    cardId: 'anders_army',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'draw', side: 'self', count: 2 },
          { op: 'damage', target: { kind: 'hq', side: 'self' }, amount: 2 },
        ],
      },
    ],
  },

  // ---- META #182 ----
  // 中文原文：压制 1 个单位，若其具有唯一最高的攻击力，将其消灭。
  the_dagger_strikes: {
    cardId: 'the_dagger_strikes',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'pin', target: { kind: 'chosen' } },
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'chosenHasUniqueHighestAttack' },
            then: [{ op: 'destroy', target: { kind: 'chosen' } }],
          },
        ],
      },
    ],
  },

  // ---- META #200 ----
  // 中文原文：抑制所有敌方单位。将 1 个具有闪击的“游击队员”加入支援阵线。
  the_white_death: {
    cardId: 'the_white_death',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'silence', target: { kind: 'query', side: 'enemy', line: 'any' } },
          { op: 'custom', id: 'summonWithKeywords', params: { cardId: 'sissi', line: 'support', keywords: ['blitz'] } },
        ],
      },
    ],
  },

  // ==== B 类批次（META top100）====

  // ---- META #64 ----
  // 中文原文：预报。对 1 个单位造成 2 点伤害。若从手中最左侧使用，改为造成 3 点伤害。
  task_force_44: {
    cardId: 'task_force_44',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'custom', id: 'revealIntel', params: { count: 1 } },
          {
            op: 'conditional',
            condition: { kind: 'custom', id: 'usedFromLeftmostHandCard' },
            then: [{ op: 'damage', target: { kind: 'chosen' }, amount: 3 }],
            else: [{ op: 'damage', target: { kind: 'chosen' }, amount: 2 }],
          },
        ],
      },
    ],
  },

  // ---- META #86 ----
  // 中文原文：将 3 张“抵抗”加入敌方卡组。使友方总部获得 +6 防御力。
  liberation: {
    cardId: 'liberation',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'addCardToEnemyDeck', params: { cardId: 'resistance_b', count: 3 } },
          { op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 6 } },
        ],
      },
    ],
  },

  // ==== B 类批次 2（META #101-150）====

  // ---- META #105 ----
  // 中文原文：使友方总部获得 +3 防御力。额外获得 1 个指挥点槽。
  nzans: {
    cardId: 'nzans',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'custom', id: 'gainHqDefense', params: { side: 'self', amount: 3 } },
          { op: 'custom', id: 'gainKreditSlots', params: { side: 'self', amount: 1 } },
        ],
      },
    ],
  },

  // ---- META #110 ----
  // 中文原文：对所有敌方目标造成 2 点伤害。抽 2 张牌。额外获得 2 个指挥点槽。
  the_anzac_spirit: {
    cardId: 'the_anzac_spirit',
    abilities: [
      {
        trigger: 'order',
        effects: [
          { op: 'damage', target: { kind: 'query', side: 'enemy', line: 'any' }, amount: 2 },
          { op: 'damage', target: { kind: 'hq', side: 'enemy' }, amount: 2 },
          { op: 'draw', side: 'self', count: 2 },
          { op: 'custom', id: 'gainKreditSlots', params: { side: 'self', amount: 2 } },
        ],
      },
    ],
  },

  // ==== P2 批次（META #151-200 的 B 类）====

  // ---- META #175 ----
  // 中文原文：随机复制敌方卡组中的 1 张指令，使友方总部获得等同于其花费的防御力。
  orp_byskawica: {
    cardId: 'orp_byskawica',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'copyRandomEnemyOrderAndGainHqDefense' }] },
    ],
  },

  // ---- META #193 ----
  // 中文原文：从敌方 3 张手牌中选择 1 张并弃掉，将 1 张复制加入友方手牌。
  sabotage: {
    cardId: 'sabotage',
    abilities: [
      { trigger: 'order', effects: [{ op: 'custom', id: 'discardChosenEnemyHandCardCopyToHand', params: { from: 3 } }] },
    ],
  },



  // ==== 长尾自动生成批次（严格模板解析，META 外高热度/Elite/Special）====

  // 中文原文：亡计：将 1 张“第 18 神射手团”洗入卡组。
  '5th_bersaglieri': {
    cardId: '5th_bersaglieri',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'custom',
            id: 'shuffleIntoDeck',
            params: {
              cardId: '18th_bersaglieri',
              count: 1,
              side: 'self',
            },
          },
        ],
      },
    ],
  },

  // 中文原文：亡计：将 1 张“第 18 神射手团”洗入卡组。
  '9th_bersaglieri': {
    cardId: '9th_bersaglieri',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'custom',
            id: 'shuffleIntoDeck',
            params: {
              cardId: '18th_bersaglieri',
              count: 1,
              side: 'self',
            },
          },
        ],
      },
    ],
  },

  // 中文原文：友方单位部署或加入时，使友方总部获得 +2 防御力。
  caproni_ca_133: {
    cardId: 'caproni_ca_133',
    abilities: [
      {
        trigger: 'unitDeployed',
        effects: [
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

  // 中文原文：部署：将 1 张“抵抗”加入敌方卡组。
  expeditionary_corps: {
    cardId: 'expeditionary_corps',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'custom',
            id: 'addCardToEnemyDeck',
            params: {
              cardId: 'resistance_b',
              count: 1,
            },
          },
        ],
      },
    ],
  },

  // 中文原文：本单位对敌方总部造成伤害时，抽 1 张牌。
  farman_f_222: {
    cardId: 'farman_f_222',
    abilities: [
      {
        trigger: 'attack',
        condition: {
          kind: 'custom',
          id: 'chosenIsEnemyHQ',
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

  // 中文原文：部署：将 2 个“第 3 山地团”加入支援阵线。
  fiat_br_20: {
    cardId: 'fiat_br_20',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'summon',
            side: 'self',
            cardId: '3rd_alpini_regiment',
            count: 2,
            line: 'support',
          },
        ],
      },
    ],
  },

  // 中文原文：部署：抑制 1 个敌方单位。
  fokker_d_xxi: {
    cardId: 'fokker_d_xxi',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'silence',
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

  // 中文原文：部署：使 1 个友方单位获得动员。
  h75c1: {
    cardId: 'h75c1',
    abilities: [
      {
        trigger: 'deploy',
        effects: [
          {
            op: 'grantKeyword',
            target: {
              kind: 'chosen',
            },
            keyword: 'mobilize',
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

  // 中文原文：亡计：使所有友方单位撤退。
  l640: {
    cardId: 'l640',
    abilities: [
      {
        trigger: 'death',
        effects: [
          {
            op: 'custom',
            id: 'moveUnitZone',
            params: {
              of: 'all',
              side: 'self',
              to: 'hand',
            },
          },
        ],
      },
    ],
  },

  // 中文原文：将 2 个“军团”加入支援阵线。
  plan_west: {
    cardId: 'plan_west',
    abilities: [
      {
        trigger: 'order',
        effects: [
          {
            op: 'summon',
            side: 'self',
            cardId: 'legions',
            count: 2,
            line: 'support',
          },
        ],
      },
    ],
  },

  // 中文原文：友方回合结束时，将 1 张“总参二局”加入手牌。
  pzl_23_karas: {
    cardId: 'pzl_23_karas',
    abilities: [
      {
        trigger: 'turnEnd',
        effects: [
          {
            op: 'addCardToHand',
            side: 'self',
            cardId: 'section_ii',
            count: 1,
          },
        ],
      },
    ],
  },

  // 中文原文：部署：使 1 个敌方单位撤退。
  raaf_lightning_f4: {
    cardId: 'raaf_lightning_f4',
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
          side: 'enemy',
          line: 'any',
          limit: 1,
        },
      },
    ],
  },

  // 中文原文：使 1 个单位撤退。
  zamo_uprising: {
    cardId: 'zamo_uprising',
    abilities: [
      {
        trigger: 'order',
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

  // 中文原文：本单位受到伤害时，抽 1 张牌。
  zaza_division: {
    cardId: 'zaza_division',
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

  // ==== 手写批次（模板无法覆盖的高热度卡）====

  // 中文原文：对 1 个单位造成 5 点伤害。将等同于溢出伤害的“抵抗”加入敌方卡组。
  arming_the_resistance: {
    cardId: 'arming_the_resistance',
    abilities: [
      {
        trigger: 'order',
        target: { kind: 'query', side: 'any', line: 'any', limit: 1 },
        effects: [
          { op: 'damage', target: { kind: 'chosen' }, amount: 5 },
          { op: 'custom', id: 'addResistanceEqualToOverkill', params: { cardId: 'resistance_b' } },
        ],
      },
    ],
  },
};
