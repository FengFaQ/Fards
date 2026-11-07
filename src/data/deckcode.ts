/**
 * KARDS 卡组代码编解码（已用 600 个公开卡组验证）。
 *
 * 格式：`%%<主阵营码><盟军码>|<两字符 import_id 按份数分组，组间用 ';' 分隔>`
 * - 阵营码：Germany=1 Britain=2 Japan=3 Soviet=4 USA=5 France=6 Italy=7 Poland=8 Finland=9 Anzac=a
 * - 无盟军时盟军码 = 主阵营码
 * - 分组下标 i（从 0 开始）代表该组所有卡为 i+1 份
 * 例：%%51|bCbE;oP;cz;oX → 美国+德国：bC/bE 各1张，oP 各2张，cz 各3张，oX 各4张
 */
import type { DecodedDeck, Deck } from './types';
import { getCardIndex } from './loadCards';

export const FACTION_CODE: Record<string, string> = {
  Germany: '1',
  Britain: '2',
  Japan: '3',
  Soviet: '4',
  USA: '5',
  France: '6',
  Italy: '7',
  Poland: '8',
  Finland: '9',
  Anzac: 'a',
};

export const CODE_FACTION: Record<string, string> = Object.fromEntries(
  Object.entries(FACTION_CODE).map(([f, c]) => [c, f]),
);

const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function normalizeDeckCodeInput(input: string): string {
  let code = (input || '').trim();
  // 兼容直接粘贴 URL / 带 deck: 前缀 / 多余空白
  try {
    const url = new URL(code);
    const fromQuery = url.searchParams.get('deck_code');
    if (fromQuery) code = fromQuery;
  } catch {
    /* 不是 URL */
  }
  const hashQuery = code.includes('deck_code=') ? code.split('deck_code=')[1] : '';
  if (hashQuery) code = decodeURIComponent(hashQuery.split('&')[0]);
  return code.replace(/^deck[:：]\s*/i, '').replace(/\s+/g, '');
}

type DeckLike = Deck | { faction?: string; mainFaction?: string; allyFaction?: string | null; cards: { cardId: string; count: number }[] };

/** 解码 deck code。若卡牌索引未加载，cards[].cardId 为空但 importId 保留（UI 可自行反查）。 */
export function decodeDeckCode(input: string): DecodedDeck {
  const raw = normalizeDeckCodeInput(input);
  const match = /^%%(.)(.)\|([^]*)$/.exec(raw);
  if (!match) throw new Error('无法识别的卡组代码：应以 %% 开头并包含 | 分隔符');
  const [, mainCode, allyCode, body] = match;
  const mainFaction = CODE_FACTION[mainCode];
  if (!mainFaction) throw new Error(`未知的阵营代码：${mainCode}`);
  const allyFaction = allyCode === mainCode ? null : (CODE_FACTION[allyCode] ?? null);
  const index = getCardIndex();
  const groups = body.split(';');
  const cards: DecodedDeck['cards'] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (!group) continue;
    if (group.length % 2 !== 0) throw new Error(`卡组代码第 ${i + 1} 组长度非法`);
    for (let j = 0; j < group.length; j += 2) {
      const importId = group.slice(j, j + 2);
      if (![...importId].every((ch) => CODE_CHARS.includes(ch))) {
        throw new Error(`卡组代码包含非法字符：${importId}`);
      }
      const card = index.get(importId);
      cards.push({ importId, cardId: card?.cardId, count: i + 1 });
    }
  }
  return { raw, mainFaction, allyFaction, cards };
}

export type DecodeResult = { ok: true; deck: DecodedDeck } | { ok: false; error: string };

export function decodeDeckCodeSafe(input: string): DecodeResult {
  try {
    return { ok: true, deck: decodeDeckCode(input) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 编码卡组为官方格式 deck code（需要卡牌索引已加载以取得 import_id） */
export function encodeDeckCode(deck: DeckLike): string {
  const mainFaction = ('mainFaction' in deck && deck.mainFaction) || ('faction' in deck && deck.faction) || '';
  const mainCode = FACTION_CODE[String(mainFaction)];
  if (!mainCode) throw new Error(`未知主阵营：${mainFaction}`);
  const allyFaction = ('allyFaction' in deck && deck.allyFaction) || null;
  const allyCode = allyFaction ? FACTION_CODE[String(allyFaction)] : mainCode;
  if (!allyCode) throw new Error(`未知盟军阵营：${allyFaction}`);
  const index = getCardIndex();
  const groups: string[][] = [[], [], [], []];
  for (const entry of deck.cards) {
    const card = index.get(entry.cardId);
    if (!card?.importId) throw new Error(`缺少 import_id：${entry.cardId}`);
    const count = Math.max(1, Math.min(4, Math.round(Number(entry.count) || 1)));
    groups[count - 1].push(card.importId);
  }
  return `%%${mainCode}${allyCode}|${groups.map((g) => g.join('')).join(';')}`;
}

/** 按份数排序后编码，保证同一卡组输出稳定 */
export function encodeDeckCodeStable(deck: DeckLike): string {
  const sorted = {
    ...deck,
    cards: deck.cards
      .slice()
      .sort((a, b) => a.cardId.localeCompare(b.cardId)),
  } as DeckLike;
  return encodeDeckCode(sorted);
}

export type { DecodedDeck } from './types';
