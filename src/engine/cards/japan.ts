/**
 * 日本（Japan）卡牌脚本
 * ------------------------------------------------------------------
 * 数据集中本阵营共 264 张：可构筑 252 张 + 衍生/老兵形态 12 张（衍生卡脚本放 tokens.ts）。
 * 实现优先级见 docs/META_CARDS.md；覆盖进度见 docs/CARD_COVERAGE.md。
 *
 * 脚本格式与 DSL 语义约定见 `./index.ts` 顶部注释。
 * 每张卡必须在其 cardId 上方写一行「中文原文：…」，便于校对与回归。
 */

import type { CardScript } from '../types';

export const JAPAN_CARD_SCRIPTS: Record<string, CardScript> = {
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
};
