#!/usr/bin/env node
/**
 * fetch-cards.mjs — 抓取 KARDS 全量卡牌数据
 *
 * 数据源：https://1939.kardsdecker.com/api/v1/cards?limit=50&page=N
 * 产物：
 *   public/data/cards.json   数组，**camelCase**，字段与 src/data/types.ts 的 Card 接口一一对应
 *                            （额外带 imageLocal = /cards/<cardId>.avif、keywordsNormalized）
 *   _work/cards.raw.json     原始 API 数组（snake_case，保留全部原始字段，供追溯/重新映射）
 *   public/data/meta.json    抓取元信息 + faction/type/rarity/set/pool 统计 + 质量检查
 *
 * 零运行时依赖，仅用 node 内置模块（node>=18 的全局 fetch）。
 *
 * 用法：
 *   node scripts/fetch-cards.mjs
 *   node scripts/fetch-cards.mjs --limit=50 --out=public/data
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const API_BASE = 'https://1939.kardsdecker.com/api/v1';
const DEFAULT_LIMIT = 50; // API 单页上限
const MAX_PAGE_RETRY = 4;
const REQUEST_TIMEOUT_MS = 45_000;
const CONCURRENCY = 4;
const UA = 'Fards-decktest/0.1 (+data-fetch; node)';

/* ------------------------------------------------------------------ args */

function parseArgs(argv) {
  const out = { limit: DEFAULT_LIMIT, out: 'public/data', rawOut: '_work/cards.raw.json' };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'limit') out.limit = Number(val);
    else if (key === 'out') out.out = val;
    else if (key === 'raw-out') out.rawOut = val;
  }
  return out;
}

const args = parseArgs(process.argv);
const OUT_DIR = resolve(ROOT, args.out);

/* ------------------------------------------------------------------ util */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function getJSON(url, { retries = MAX_PAGE_RETRY } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { accept: 'application/json', 'user-agent': UA },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const backoff = 500 * 2 ** (attempt - 1);
        log(`  ! ${url} 失败(${attempt}/${retries}): ${err.message}，${backoff}ms 后重试`);
        await sleep(backoff);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`GET 失败 ${url}: ${lastErr?.message ?? lastErr}`);
}

async function pool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

function countBy(list, keyFn) {
  const m = new Map();
  for (const item of list) {
    const k = keyFn(item);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
}

/* ------------------------------------------------- 原始 → Card（camelCase） */

/**
 * attributes 里混了三种东西：
 *   1. 真关键字：blitz / guard / smokescreen / ambush / fury / shock / bond / alpine / pincer / covert / salvage / mobilize …
 *   2. 带等级的关键字：heavyArmor1|2|3、intel1|2|3  → 归一为 `heavyArmor:1` / `intel:2`
 *      （格式与 src/engine/keywords.ts 的 parseAttribute 完全一致，含数值）
 *   3. 数据关联标记：BecomesVeteran:<cardId> / VeteranOf:<cardId>（老兵升级链）、OnlySpawnable（仅生成池）
 * 归一化只保留 (1)(2)。
 */
function normalizeKeywords(attributes) {
  const out = [];
  for (const attr of attributes ?? []) {
    if (typeof attr !== 'string' || !attr) continue;
    if (attr === 'OnlySpawnable') continue;
    if (attr.startsWith('BecomesVeteran:') || attr.startsWith('VeteranOf:')) continue;
    const m = /^([a-zA-Z]+)(\d+)$/.exec(attr);
    const id = m ? `${m[1].charAt(0).toLowerCase()}${m[1].slice(1)}:${Number(m[2])}` : attr;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** wsrv.nl 代理（webp 400w）：运行时卡图远程兜底 */
function wsrvImageUrl(rawUrl, width = 400) {
  if (!rawUrl) return '';
  return `https://wsrv.nl/?url=${encodeURIComponent(String(rawUrl).replace(/^https?:\/\//, ''))}&output=webp&w=${width}`;
}

function toCard(raw) {
  return {
    cardId: raw.card_id,
    importId: raw.import_id,
    nameZh: raw.name_zh,
    nameEn: raw.name_en,
    description: raw.description ?? '',
    descriptionEn: raw.description_en ?? undefined,
    faction: raw.faction,
    hostFactions: raw.host_factions ?? [],
    isExile: !!raw.is_exile,
    type: raw.type,
    rarity: raw.rarity,
    kredits: raw.kredits,
    operationCost: raw.operation_cost,
    attack: raw.attack,
    defense: raw.defense,
    attributes: raw.attributes ?? [],
    set: raw.set,
    pool: raw.pool,
    isReserved: !!raw.is_reserved,
    isDerived: !!raw.is_derived,
    imageUrl: raw.image_url,
    imageProxyUrl: raw.image_proxy_url,
    /** 本地卡图 URL（BASE_URL='/' 时为 /cards/<cardId>.webp；loadCards 会按部署 base 拼前缀） */
    imageLocal: `/cards/${raw.card_id}.webp`,
    /** 远程兜底卡图（wsrv.nl webp） */
    imageRemote: wsrvImageUrl(raw.image_url),
    keywordsNormalized: normalizeKeywords(raw.attributes),
  };
}

/* ------------------------------------------------------------------ main */

async function main() {
  const startedAt = new Date();
  log(`[fetch-cards] API=${API_BASE} limit=${args.limit} out=${args.out}`);

  const first = await getJSON(`${API_BASE}/cards?limit=${args.limit}&page=1`);
  const total = first.meta?.total;
  const totalPages = first.meta?.total_pages;
  if (!Number.isFinite(total) || !Number.isFinite(totalPages)) {
    throw new Error(`响应 meta 缺少 total/total_pages: ${JSON.stringify(first.meta)}`);
  }
  log(`[fetch-cards] meta.total=${total} total_pages=${totalPages}`);

  const pages = [];
  for (let p = 1; p <= totalPages; p++) pages.push(p);

  const pageData = await pool(
    pages,
    async (page) => {
      if (page === 1) return first;
      const json = await getJSON(`${API_BASE}/cards?limit=${args.limit}&page=${page}`);
      if (!Array.isArray(json.data)) throw new Error(`page ${page} 无 data 数组`);
      if (page % 10 === 0) log(`  page ${page}/${totalPages} … 累计 ${page * args.limit}`);
      return json;
    },
    CONCURRENCY
  );

  /** @type {any[]} API 原始对象（snake_case） */
  const rawCards = [];
  for (const json of pageData) rawCards.push(...json.data);

  // 去重（以 card_id 为键，保留首次出现）
  const seen = new Map();
  const dupIds = [];
  for (const card of rawCards) {
    if (seen.has(card.card_id)) {
      dupIds.push(card.card_id);
      continue;
    }
    seen.set(card.card_id, card);
  }
  const uniqueRaw = [...seen.values()].sort((a, b) => String(a.card_id).localeCompare(String(b.card_id)));
  const cards = uniqueRaw.map(toCard);

  // 质量检查（在原始字段上做）
  const REQUIRED = ['card_id', 'import_id', 'name_zh', 'name_en', 'faction', 'type', 'rarity', 'kredits', 'set', 'pool'];
  const missingFields = [];
  for (const card of uniqueRaw) {
    const lack = REQUIRED.filter((k) => card[k] === undefined || card[k] === null || card[k] === '');
    if (lack.length) missingFields.push({ card_id: card.card_id, missing: lack });
  }

  const importIdCount = new Map();
  for (const card of uniqueRaw) importIdCount.set(card.import_id, (importIdCount.get(card.import_id) ?? 0) + 1);
  const dupImportIds = [...importIdCount.entries()]
    .filter(([, n]) => n > 1)
    .map(([id, n]) => ({ import_id: id, count: n, cards: uniqueRaw.filter((c) => c.import_id === id).map((c) => c.card_id) }));

  const finishedAt = new Date();
  const cardsJson = JSON.stringify(cards);
  const rawJson = JSON.stringify(uniqueRaw);

  const meta = {
    source: `${API_BASE}/cards`,
    fetchedAt: finishedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    apiTotal: total,
    apiTotalPages: totalPages,
    pageLimit: args.limit,
    fetchedCount: rawCards.length,
    uniqueCount: cards.length,
    schema: 'camelCase == src/data/types.ts Card (CardDef 字段 + imageLocal + keywordsNormalized)',
    duplicateCardIds: dupIds,
    missingRequiredFields: missingFields,
    importIdConflicts: dupImportIds,
    imageBase: 'public/cards/<cardId>.avif',
    files: {
      'public/data/cards.json': `${(Buffer.byteLength(cardsJson) / 1024).toFixed(1)}KB`,
      '_work/cards.raw.json': `${(Buffer.byteLength(rawJson) / 1024).toFixed(1)}KB`,
    },
    stats: {
      faction: countBy(uniqueRaw, (c) => c.faction),
      hostFactionsLength: countBy(uniqueRaw, (c) => String(c.host_factions?.length ?? 0)),
      type: countBy(uniqueRaw, (c) => c.type),
      rarity: countBy(uniqueRaw, (c) => c.rarity),
      set: countBy(uniqueRaw, (c) => c.set),
      pool: countBy(uniqueRaw, (c) => c.pool),
      isReserved: countBy(uniqueRaw, (c) => String(!!c.is_reserved)),
      isExile: countBy(uniqueRaw, (c) => String(!!c.is_exile)),
      isDerived: countBy(uniqueRaw, (c) => String(!!c.is_derived)),
      kredits: countBy(uniqueRaw, (c) => String(c.kredits)),
      importIdChars: countBy(uniqueRaw, (c) => `len${String(c.import_id).length}`),
    },
  };
  const metaJson = JSON.stringify(meta, null, 2);

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(dirname(resolve(ROOT, args.rawOut)), { recursive: true });
  await writeFile(resolve(OUT_DIR, 'cards.json'), cardsJson, 'utf8');
  await writeFile(resolve(OUT_DIR, 'meta.json'), metaJson, 'utf8');
  await writeFile(resolve(ROOT, args.rawOut), rawJson, 'utf8');

  log('');
  log(`[fetch-cards] 完成：${cards.length} 张卡（API total=${total}）`);
  log(`  public/data/cards.json    ${(Buffer.byteLength(cardsJson) / 1024).toFixed(1)}KB`);
  log(`  public/data/meta.json     ${(Buffer.byteLength(metaJson) / 1024).toFixed(1)}KB`);
  log(`  _work/cards.raw.json      ${(Buffer.byteLength(rawJson) / 1024).toFixed(1)}KB`);
  log(`  重复 card_id: ${dupIds.length}；字段缺失: ${missingFields.length}；import_id 冲突: ${dupImportIds.length}`);
  if (dupImportIds.length) log(`  ! import_id 冲突: ${JSON.stringify(dupImportIds)}`);
  log(`  faction: ${JSON.stringify(meta.stats.faction)}`);
  log(`  type:    ${JSON.stringify(meta.stats.type)}`);
  log(`  rarity:  ${JSON.stringify(meta.stats.rarity)}`);
  log(`  pool:    ${JSON.stringify(meta.stats.pool)}`);
  log(`  importId 长度: ${JSON.stringify(meta.stats.importIdChars)}`);

  if (cards.length !== total) console.warn(`[fetch-cards] 警告：抓取数 ${cards.length} != API total ${total}`);
}

main().catch((err) => {
  console.error('[fetch-cards] 失败:', err);
  process.exit(1);
});
