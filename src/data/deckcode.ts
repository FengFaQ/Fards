/**
 * deckcode.ts — KARDS 官方 deck_code 编解码（逆向自 2000+ 公开卡组，见 docs/DECK_CODEC.md）
 * ------------------------------------------------------------------
 * 格式：
 *
 *   %%<主阵营码><盟军码>|<1张的短码串>;<2张的短码串>;<3张的短码串>;<4张的短码串>
 *
 * - `%%`    ：魔数/格式标识（官方码固定前缀）
 * - 阵营码  ：单字符。主阵营在前、盟军在后；纯主阵营卡组两位相同（如 `%%44` = 苏联 / 无盟军）
 *             1=Germany 2=Britain 3=Japan 4=Soviet 5=USA 6=France 7=Italy 8=Poland 9=Finland
 *             a=Anzac 0=Neutral
 * - `|`    ：阵营头与卡牌区的分隔符
 * - `;`    ：按"副本数"分组的分隔符；第 i 组（0 基）里的每张卡都是 i+1 张
 * - 短码    ：每张卡 2 位 base62（= API 字段 `import_id`），组内直接拼接
 * - **总是 4 组**（3 个 `;`）：没有 4 张卡时以 `;` 结尾，如 `%%36|…;…;tQsZ;`
 *
 * 例：`%%51|bCbEbm…yv;oPv7vhvUzd;cz;oX`
 *     → 美国主 + 德国盟；22 张各 1 张，5 张卡各 2 张，1 张卡 3 张，1 张卡 4 张（合计 39）
 *
 * 对外接口**统一用 cardId**（import_id 只作为内部编码细节，DecodedDeck.cards 里同时保留 importId）。
 * 纯 TS、无框架依赖：UI / 引擎 / node 脚本均可直接 import；不依赖 loadCards（换算表是静态常量）。
 */

import type { DecodedDeck, DeckCard } from './types';
import { CARD_TO_IMPORT, IMPORT_ID_LENGTH, IMPORT_TO_CARD } from './importMap';
import { normalizeFactionName } from './types';

/* ============================================================
 * 1. 类型
 * ============================================================ */

export type DecodeResult = { ok: true; deck: DecodedDeck } | { ok: false; error: string };

/** 编码入参：结构上兼容 Deck / DecodedDeck / ui 的 DeckData（faction 别名） */
export interface EncodableDeck {
  mainFaction?: string | null;
  faction?: string | null;
  allyFaction?: string | null;
  cards: ReadonlyArray<{ cardId: string; count: number }>;
}

/* ============================================================
 * 2. 阵营码表
 * ============================================================ */

/**
 * 阵营 → 单字符码。
 * 1~6 由公开卡组双向验证（%%51 美国+德国、%%23 英国+日本、%%36 日本+法国、
 * %%44 苏联无盟军、%%19 德国+芬兰、%%1a 德国+澳新），7/8/0 见 docs/DECK_CODEC.md。
 */
export const FACTION_CODE: Readonly<Record<string, string>> = {
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
  Neutral: '0',
};

/** 码 → 阵营（FACTION_CODE 反表） */
export const CODE_TO_FACTION: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FACTION_CODE).map(([faction, code]) => [code, faction])
);

/** 兼容别名（早期 seed 用的名字） */
export const CODE_FACTION: Readonly<Record<string, string>> = CODE_TO_FACTION;

const DECK_CODE_HEAD = '%%';
const HEADER_SEP = '|';
const GROUP_SEP = ';';
const MAX_COPIES = 4;

/* ============================================================
 * 3. 工具
 * ============================================================ */

function factionToCode(faction: string | null | undefined): string {
  if (!faction) throw new Error('阵营为空，无法编码卡组码');
  const name = normalizeFactionName(String(faction));
  const code = FACTION_CODE[name];
  if (!code) throw new Error(`未知阵营 "${faction}"，无法编码卡组码`);
  return code;
}

function codeToFaction(code: string): string {
  const faction = CODE_TO_FACTION[code];
  if (!faction) throw new Error(`未知阵营码 "${code}"（deck code 头部非法）`);
  return faction;
}

/**
 * 规范化输入：去空白；兼容被 URL 编码过的码；兼容直接粘贴分享链接
 * （`...?deck_code=%%51%7C...`）或带 `deck:` 前缀。
 */
export function normalizeDeckCodeInput(input: string): string {
  let code = String(input ?? '').trim();
  if (!code) throw new Error('卡组码为空');
  // 分享链接
  if (/^https?:\/\//i.test(code)) {
    try {
      const url = new URL(code);
      const fromQuery = url.searchParams.get('deck_code') ?? url.searchParams.get('code');
      if (fromQuery) code = fromQuery;
      else if (url.hash.includes('deck_code=')) code = url.hash.split('deck_code=')[1].split('&')[0];
    } catch {
      /* 不是合法 URL，继续按普通字符串处理 */
    }
  }
  if (code.includes('deck_code=')) code = code.split('deck_code=')[1].split('&')[0];
  code = code.replace(/^deck[:：]\s*/i, '');
  if (code.includes('%25') || code.includes('%7C') || code.includes('%3B')) {
    try {
      code = decodeURIComponent(code);
    } catch {
      /* 保持原样 */
    }
  }
  code = code.replace(/\s+/g, '');
  if (!code.startsWith(DECK_CODE_HEAD)) {
    if (/^[0-9a-zA-Z]{2}\|/.test(code)) code = DECK_CODE_HEAD + code;
    else throw new Error(`卡组码必须以 "%%" 开头：${code.slice(0, 12)}…`);
  }
  return code;
}

/** 把一段 base62 短码串切成 importId 列表（处理个别 1 位短码特例，见 docs） */
function splitImportIds(segment: string): string[] {
  const ids: string[] = [];
  let i = 0;
  while (i < segment.length) {
    if (i + IMPORT_ID_LENGTH <= segment.length) {
      ids.push(segment.slice(i, i + IMPORT_ID_LENGTH));
      i += IMPORT_ID_LENGTH;
      continue;
    }
    const one = segment.slice(i);
    if (IMPORT_TO_CARD[one]) {
      ids.push(one);
      i = segment.length;
      continue;
    }
    throw new Error(`卡牌短码错位：剩余 "${one}" 无法解析（段内短码应为 2 位）`);
  }
  return ids;
}

/* ============================================================
 * 4. 解码
 * ============================================================ */

/**
 * 解码官方 deck code。
 * @throws Error 输入非法（空、缺 `%%`、阵营码未知、短码不在数据集中、同卡重复…）
 */
export function decodeDeckCode(code: string): DecodedDeck {
  const raw = normalizeDeckCodeInput(code);
  const body = raw.slice(DECK_CODE_HEAD.length);
  const sepIndex = body.indexOf(HEADER_SEP);

  const headerPart = sepIndex >= 0 ? body.slice(0, sepIndex) : body.slice(0, 2);
  const cardPart = sepIndex >= 0 ? body.slice(sepIndex + 1) : '';

  if (headerPart.length < 1 || headerPart.length > 2) {
    throw new Error(`卡组码阵营头长度异常："${headerPart}"（应为 1~2 个字符）`);
  }
  const mainFaction = codeToFaction(headerPart[0]);
  const allyFaction = headerPart.length === 2 ? codeToFaction(headerPart[1]) : mainFaction;

  const cards: Array<DeckCard & { importId: string }> = [];
  if (cardPart) {
    const groups = cardPart.split(GROUP_SEP);
    const seen = new Map<string, number>();
    groups.forEach((segment, groupIndex) => {
      if (!segment) return;
      const count = groupIndex + 1;
      if (count > MAX_COPIES) throw new Error(`卡组码出现第 ${count} 张分组，超过单卡上限 ${MAX_COPIES}`);
      for (const importId of splitImportIds(segment)) {
        const cardId = IMPORT_TO_CARD[importId];
        if (!cardId) throw new Error(`未知卡牌短码 "${importId}"`);
        if (seen.has(cardId)) throw new Error(`卡牌 "${cardId}" 在卡组码中重复出现（${seen.get(cardId)} 份与 ${count} 份冲突）`);
        seen.set(cardId, count);
        cards.push({ cardId, importId, count });
      }
    });
  }

  return {
    codeVersion: 'v1',
    raw,
    mainFaction,
    allyFaction: allyFaction === mainFaction ? null : allyFaction,
    cards,
  };
}

/** 解码，不抛异常 */
export function decodeDeckCodeSafe(code: string): DecodeResult {
  try {
    return { ok: true, deck: decodeDeckCode(code) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ============================================================
 * 5. 编码
 * ============================================================ */

/**
 * 编码为官方 deck code。
 * - 每张卡 count ∈ [1,4]，同 cardId 不可重复
 * - 卡片必须在数据集内（否则拿不到 import_id，抛错）
 * - 输出 `%%<main><ally>|组1;组2;…`，尾部空组省略，与官方逐字符一致
 */
export function encodeDeckCode(deck: EncodableDeck): string {
  if (!deck || !Array.isArray(deck.cards)) throw new Error('encodeDeckCode: 缺少 cards 数组');
  const mainFaction = deck.mainFaction ?? deck.faction ?? null;
  if (!mainFaction) throw new Error('encodeDeckCode: 缺少 mainFaction');
  const mainCode = factionToCode(mainFaction);
  const allyCode = deck.allyFaction ? factionToCode(deck.allyFaction) : mainCode;

  const groups: string[][] = [[], [], [], []];
  const seen = new Set<string>();
  for (const item of deck.cards) {
    const rawId = String(item?.cardId ?? '');
    const count = Number(item?.count);
    if (!rawId) throw new Error('encodeDeckCode: 存在空 cardId');
    if (!Number.isInteger(count) || count < 1 || count > MAX_COPIES) {
      throw new Error(`encodeDeckCode: 卡牌 "${rawId}" 副本数 ${item?.count} 非法（应为 1~${MAX_COPIES}）`);
    }
    if (seen.has(rawId)) throw new Error(`encodeDeckCode: 卡牌 "${rawId}" 重复出现`);
    seen.add(rawId);
    const importId = CARD_TO_IMPORT[rawId] ?? CARD_TO_IMPORT[rawId.trim().toLowerCase()];
    if (!importId) throw new Error(`encodeDeckCode: 数据集里没有卡牌 "${rawId}"`);
    groups[count - 1].push(importId);
  }

  // 官方编码器**总是输出 4 组**（3 个 ';'），即使尾部组为空：
  //   %%51|g0;g1;cz;oX（4 组都有卡）
  //   %%36|g0;g1;tQsZ;  （第 4 组为空 → 以 ';' 结尾）
  // 因此这里不裁剪尾部空组，否则与官方码不逐字符相等（1950 个公开卡组里 691 例差异即此）。
  const body = groups.map((g) => g.join('')).join(GROUP_SEP);
  return `${DECK_CODE_HEAD}${mainCode}${allyCode}${HEADER_SEP}${body}`;
}

/** 按 cardId 排序后编码（同一卡组输出稳定，便于 diff/缓存） */
export function encodeDeckCodeStable(deck: EncodableDeck): string {
  return encodeDeckCode({
    ...deck,
    cards: [...deck.cards].sort((a, b) => String(a.cardId).localeCompare(String(b.cardId))),
  });
}

/* ============================================================
 * 6. 便捷函数
 * ============================================================ */

/** 结构上像不像卡组码（不做数据集校验） */
export function looksLikeDeckCode(code: string): boolean {
  return /^%%[0-9a-zA-Z]{1,2}(\||$)/.test(String(code ?? '').trim());
}

/** 快速取阵营（不完整解码；失败返回 null） */
export function peekFactions(code: string): { mainFaction: string; allyFaction: string | null } | null {
  try {
    const raw = normalizeDeckCodeInput(code);
    const body = raw.slice(DECK_CODE_HEAD.length);
    const idx = body.indexOf(HEADER_SEP);
    const header = idx >= 0 ? body.slice(0, idx) : body.slice(0, 2);
    const mainFaction = codeToFaction(header[0]);
    const allyFaction = header.length === 2 ? codeToFaction(header[1]) : mainFaction;
    return { mainFaction, allyFaction: allyFaction === mainFaction ? null : allyFaction };
  } catch {
    return null;
  }
}

export type { DecodedDeck };
