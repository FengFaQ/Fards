/**
 * 卡牌脚本注册表（声明式 DSL 数据，不含执行逻辑）
 * ==================================================================
 * 执行器：`src/engine/effects/executor.ts`（Lead 维护）。
 * 本目录只写数据：每张卡的 `CardScript` 描述“什么时候、对谁、做什么”。
 *
 * ------------------------------------------------------------------
 * 脚本格式（详见 src/engine/types.ts 第 9–11 节）
 * ------------------------------------------------------------------
 * {
 *   cardId: 'welsh_guards',
 *   // 中文原文：部署：使 1 个目标获得 +1 防御力。
 *   abilities: [{
 *     trigger: 'deploy',                    // deploy/order/death/attack/attacked/turnStart/…
 *     target: { kind: 'query', side: 'any', line: 'any', limit: 1 },  // 打出时需要玩家选的目标
 *     effects: [{ op: 'buff', target: { kind: 'chosen' }, hp: 1 }],
 *   }],
 * }
 *
 * ------------------------------------------------------------------
 * DSL 语义约定（Lead 定，脚本作者必须遵守）
 * ------------------------------------------------------------------
 * 1. `{ kind: 'chosen' }`   —— 指代该 ability 的 `target` 选定的目标。
 * 2. `{ kind: 'self' }`     —— 指代卡牌自身：单位卡 = 该单位；指令卡 = 无效。
 * 3. `{ kind: 'hq', side }` —— 总部；`side` 相对脚本拥有者（self/enemy）。
 * 4. 所有 `side: 'self' | 'enemy'` 都相对**脚本拥有者**，不是相对当前行动方。
 * 5. 指令卡（order）与反制卡（countermeasure）使用 `trigger: 'order'` / `counter`。
 * 6. 无法用现有 EffectOp 表达时用 `{ op: 'custom', id: '...' }`，并把原语需求登记到
 *    docs/CARD_COVERAGE.md 的「待实现 custom 原语」章节（同时通知 Lead）。
 * 7. 数值型关键字使用运行时 id：`heavyArmor:2`、`intel:1`（不要写 `heavy_armor_2`）。
 *
 * ------------------------------------------------------------------
 * 文件划分
 * ------------------------------------------------------------------
 * - germany.ts / usa.ts / britain.ts / japan.ts / ussr.ts —— 五大主阵营
 *   （数据集中苏联卡 `faction` 写作 `Soviet`，脚本按 `ussr.ts` 归档）。
 * - minor.ts —— 小国与盟军：France / Italy / Finland / Poland / Anzac / Neutral。
 * - tokens.ts —— 衍生卡（`isDerived: true` 或 `pool: 'derived'`，含老兵形态与 Token）。
 *
 * 注意：`vanilla`（无效果文本且无关键字）与 `keyword_only`（仅关键字、无效果文本）
 * 的卡**不需要脚本** —— 引擎直接依据 CardDef 数值与 attributes 工作。
 * 覆盖率账本见 docs/CARD_COVERAGE.md；热度优先级见 docs/META_CARDS.md。
 */

import type { CardScript } from '../types';
import { GERMANY_CARD_SCRIPTS } from './germany';
import { USA_CARD_SCRIPTS } from './usa';
import { BRITAIN_CARD_SCRIPTS } from './britain';
import { JAPAN_CARD_SCRIPTS } from './japan';
import { USSR_CARD_SCRIPTS } from './ussr';
import { MINOR_CARD_SCRIPTS } from './minor';
import { TOKEN_CARD_SCRIPTS } from './tokens';

/** 合并多个分阵营注册表，并在重复 cardId 时立即报错（保持注册表唯一真源） */
function mergeScripts(...parts: [string, Record<string, CardScript>][]): Record<string, CardScript> {
  const merged: Record<string, CardScript> = {};
  const origin: Record<string, string> = {};
  for (const [file, scripts] of parts) {
    for (const [cardId, script] of Object.entries(scripts)) {
      const prev = origin[cardId];
      if (prev) {
        throw new Error(`[cards] 卡牌脚本重复注册：${cardId} 同时出现在 ${prev} 与 ${file}`);
      }
      if (script.cardId !== cardId) {
        throw new Error(`[cards] 脚本 cardId 不一致：注册键 ${cardId}，脚本内 cardId ${script.cardId}`);
      }
      merged[cardId] = script;
      origin[cardId] = file;
    }
  }
  return merged;
}

/** 全量卡牌脚本（按 cardId 索引） */
export const CARD_SCRIPTS: Record<string, CardScript> = mergeScripts(
  ['germany.ts', GERMANY_CARD_SCRIPTS],
  ['usa.ts', USA_CARD_SCRIPTS],
  ['britain.ts', BRITAIN_CARD_SCRIPTS],
  ['japan.ts', JAPAN_CARD_SCRIPTS],
  ['ussr.ts', USSR_CARD_SCRIPTS],
  ['minor.ts', MINOR_CARD_SCRIPTS],
  ['tokens.ts', TOKEN_CARD_SCRIPTS],
);

/** 取某张卡的脚本；无脚本（vanilla / 纯关键字 / 未实现）返回 undefined */
export function getCardScript(cardId: string): CardScript | undefined {
  return CARD_SCRIPTS[cardId];
}

/** 是否已为该卡编写脚本 */
export function hasCardScript(cardId: string): boolean {
  return cardId in CARD_SCRIPTS;
}

/** 已实现脚本数量（覆盖率统计用） */
export function scriptCount(): number {
  return Object.keys(CARD_SCRIPTS).length;
}

export { KEYWORDS, KEYWORD_ZH, normalizeKeywords, keywordLabel, isGameplayKeyword, parseAttribute } from './keywords';
export type { CardKeywordDef } from './keywords';
