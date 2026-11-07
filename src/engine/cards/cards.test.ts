/**
 * 卡牌脚本注册表自检（vitest）
 * ------------------------------------------------------------------
 * 保护点：
 *  1. 注册表能无冲突加载，脚本 cardId 与注册键一致；
 *  2. 所有 cardId 都存在于卡牌数据集；
 *  3. 关键字归一化与运行时契约一致（heavyArmor2 → heavyArmor:2）；
 *  4. 数据集 attributes 的每个真实取值都能在 KEYWORDS 里找到定义。
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CARD_SCRIPTS, getCardScript, hasCardScript, scriptCount } from './index';
import { KEYWORDS, KEYWORD_ZH, normalizeKeywords, parseAttribute } from './keywords';

const ROOT = path.resolve(__dirname, '../../../');
const CARDS_PATH = path.join(ROOT, 'public/data/cards.json');
const cardDefs: { cardId: string; attributes: string[] }[] = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));
const cardIds = new Set(cardDefs.map((c) => c.cardId));

describe('卡牌脚本注册表', () => {
  it('能正常加载且数量合理', () => {
    expect(scriptCount()).toBeGreaterThan(150);
    expect(Object.keys(CARD_SCRIPTS).length).toBe(scriptCount());
  });

  it('注册键与脚本内 cardId 一致', () => {
    for (const [key, script] of Object.entries(CARD_SCRIPTS)) {
      expect(script.cardId, `注册键 ${key}`).toBe(key);
    }
  });

  it('所有脚本引用的卡牌 id 都存在于数据集', () => {
    for (const id of Object.keys(CARD_SCRIPTS)) {
      expect(cardIds.has(id), `未知卡牌 ${id}`).toBe(true);
    }
  });

  it('getCardScript / hasCardScript 行为一致', () => {
    const first = Object.keys(CARD_SCRIPTS)[0];
    expect(hasCardScript(first)).toBe(true);
    expect(getCardScript(first)?.cardId).toBe(first);
    expect(hasCardScript('__not_a_card__')).toBe(false);
    expect(getCardScript('__not_a_card__')).toBeUndefined();
  });

  it('每个脚本至少有一个 abilities / passives / counter / modes', () => {
    for (const [id, script] of Object.entries(CARD_SCRIPTS)) {
      const hasSomething =
        (script.abilities?.length ?? 0) > 0 ||
        (script.passives?.length ?? 0) > 0 ||
        (script.modes?.length ?? 0) > 0 ||
        !!script.counter;
      expect(hasSomething, `${id} 是空脚本（无意义，应删除）`).toBe(true);
    }
  });
});

describe('关键字归一化', () => {
  it('数值型关键字带上档位', () => {
    expect(normalizeKeywords(['heavyArmor2'])).toEqual(['heavyArmor:2']);
    expect(normalizeKeywords(['intel3', 'blitz'])).toEqual(['intel:3', 'blitz']);
  });

  it('丢弃非行为标记（老兵链接 / 仅可生成）', () => {
    expect(normalizeKeywords(['OnlySpawnable', 'BecomesVeteran:foo_vet', 'VeteranOf:foo', 'guard'])).toEqual(['guard']);
  });

  it('去重且保持顺序', () => {
    expect(normalizeKeywords(['blitz', 'guard', 'blitz'])).toEqual(['blitz', 'guard']);
  });

  it('parseAttribute 保留老兵链接信息', () => {
    expect(parseAttribute('BecomesVeteran:foo_vet')).toEqual({
      kind: 'veteranLink',
      raw: 'BecomesVeteran:foo_vet',
      id: 'veteranBecomes',
      cardId: 'foo_vet',
    });
    expect(parseAttribute('OnlySpawnable')).toEqual({ kind: 'marker', raw: 'OnlySpawnable', id: 'onlySpawnable' });
  });

  it('数据集出现的每个 attribute 都在 KEYWORDS 中可解释', () => {
    const missing = new Set<string>();
    for (const card of cardDefs) {
      for (const attr of card.attributes ?? []) {
        const parsed = parseAttribute(attr);
        const id = parsed.id;
        const known = id in KEYWORDS || id === 'veteranBecomes' || id === 'veteranOf';
        if (!known) missing.add(attr);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('KEYWORD_ZH 覆盖所有 KEYWORDS 条目', () => {
    for (const id of Object.keys(KEYWORDS)) {
      expect(KEYWORD_ZH[id], `缺少中文名：${id}`).toBeTruthy();
    }
  });
});
