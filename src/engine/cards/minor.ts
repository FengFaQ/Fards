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
 */

import type { CardScript } from '../types';

export const MINOR_CARD_SCRIPTS: Record<string, CardScript> = {
  // 阶段二开始填充。
};
