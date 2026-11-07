/**
 * 衍生卡脚本（Token / 老兵形态 / 仅可生成）
 * ------------------------------------------------------------------
 * 收录标准：CardDef 中 `isDerived: true` 或 `pool === 'derived'`（共 129 张）。
 * 这些卡不能构筑，只会被效果生成（`op: 'summon'` / `op: 'transform'` / `op: 'addCardToHand'`），
 * 但其中不少带效果文本（如老兵形态、衍生 Token），同样需要脚本。
 *
 * 数据来源追溯：老兵形态卡的 attributes 为 `VeteranOf:<原卡 cardId>`，
 * 原卡为 `BecomesVeteran:<老兵卡 cardId>`；归一化见 `./keywords.ts#parseAttribute`。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 */

import type { CardScript } from '../types';

export const TOKEN_CARD_SCRIPTS: Record<string, CardScript> = {
  // 阶段二开始填充（Token 效果优先于纯老兵形态）。
};
