/**
 * 苏联（USSR / 数据集中 faction = `Soviet`）卡牌脚本
 * ------------------------------------------------------------------
 * 数据集中本阵营共 277 张：可构筑 254 张 + 衍生/老兵形态 23 张（衍生卡脚本放 tokens.ts）。
 * 实现优先级见 docs/META_CARDS.md；覆盖进度见 docs/CARD_COVERAGE.md。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 */

import type { CardScript } from '../types';

export const USSR_CARD_SCRIPTS: Record<string, CardScript> = {
  // 阶段二开始填充（先做 docs/META_CARDS.md 中的苏联高热度卡）。
};
