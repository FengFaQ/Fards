#!/usr/bin/env node
/**
 * gen-import-map.mjs — 从 public/data/cards.json 生成 src/data/importMap.ts
 *
 * deck_code 里编码的是卡牌的 2 位 base62 短码（API 字段 import_id），
 * 运行时需要用 importId ⇄ cardId 双向映射，故在此构建成静态 TS 常量，
 * 避免 UI/引擎在运行时再解析 1.1MB 的 cards.json 才能解卡组码。
 *
 * 用法：node scripts/gen-import-map.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const cards = JSON.parse(await readFile(resolve(ROOT, 'public/data/cards.json'), 'utf8'));
if (!Array.isArray(cards) || !cards.length) throw new Error('cards.json 为空');

const importToCard = {};
const cardToImport = {};
let anomalies = 0;
for (const card of cards) {
  const importId = card.importId ?? card.import_id;
  const cardId = card.cardId ?? card.card_id;
  if (!importId || !cardId) throw new Error(`卡牌缺 importId/cardId: ${JSON.stringify(card).slice(0, 120)}`);
  if (String(importId).length !== 2) anomalies++;
  if (importToCard[importId] && importToCard[importId] !== cardId) {
    throw new Error(`importId 冲突: ${importId} -> ${importToCard[importId]} / ${cardId}`);
  }
  importToCard[importId] = cardId;
  cardToImport[cardId] = importId;
}

const q = (s) => `'${s}'`;
const lines = [];
lines.push('/**');
lines.push(' * 自动生成文件 — 请勿手改。来源：scripts/gen-import-map.mjs ← public/data/cards.json');
lines.push(' *');
lines.push(' * deck_code 内使用 2 位 base62 短码（API: import_id）标识卡牌。');
lines.push(` * 卡牌数：${cards.length}；异常长度短码：${anomalies}（见 docs/DECK_CODEC.md 边缘情况）`);
lines.push(' */');
lines.push('');
lines.push('/** importId → cardId */');
lines.push('export const IMPORT_TO_CARD: Readonly<Record<string, string>> = {');
for (const [k, v] of Object.entries(importToCard).sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`  ${q(k)}: ${q(v)},`);
}
lines.push('};');
lines.push('');
lines.push('/** cardId → importId */');
lines.push('export const CARD_TO_IMPORT: Readonly<Record<string, string>> = {');
for (const [k, v] of Object.entries(cardToImport).sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`  ${q(k)}: ${q(v)},`);
}
lines.push('};');
lines.push('');
lines.push('/** base62 字符集（deck code 短码字母表，顺序未参与解码，仅用于校验） */');
lines.push('export const IMPORT_ID_CHARSET = \'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\';');
lines.push('');
lines.push('/** deck_code 中短码的固定长度（2）；个别卡（如 retribution_j = "z"）为 1，属数据特例 */');
lines.push('export const IMPORT_ID_LENGTH = 2;');
lines.push('');

const ts = lines.join('\n');
await writeFile(resolve(ROOT, 'src/data/importMap.ts'), ts, 'utf8');
console.log(
  `[gen-import-map] 写入 src/data/importMap.ts：${Object.keys(importToCard).length} 条映射，` +
    `${(Buffer.byteLength(ts) / 1024).toFixed(1)}KB，异常长度 ${anomalies}`
);
