#!/usr/bin/env node
/**
 * fetch-decks.mjs — 抓取公开卡组广场数据（deck code 逆向 + 规则统计的证据来源）
 *
 * 数据源：GET https://1939.kardsdecker.com/api/v1/decks?limit=50&page=N
 *
 * 该接口单页耗时 2~15s 且偶发连接挂死，因此本脚本：
 *   - 逐页落盘 _work/decks-pages/pNN.json（断点续传：已存在且非空则跳过）
 *   - 短超时（25s）+ 重试，单页失败不影响整批
 *   - 完成后合并为 _work/decks.json，并生成 public/data/featured-decks.json
 *
 * 产物：
 *   _work/decks-pages/p01.json …   分页缓存
 *   _work/decks.json               合并后的原始卡组数组
 *   public/data/featured-decks.json 精选热门卡组（规范化，供首页）
 *
 * 用法：
 *   node scripts/fetch-decks.mjs                     # 40 页 ≈ 2000 个卡组
 *   node scripts/fetch-decks.mjs --pages=20 --concurrency=4
 *   node scripts/fetch-decks.mjs --merge-only        # 只用已有分页缓存重新合并
 */

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const API_BASE = 'https://1939.kardsdecker.com/api/v1';
const UA = 'Fards-decktest/0.1 (+deck-fetch; node)';
const PAGES_DIR = resolve(ROOT, '_work/decks-pages');

/* ------------------------------------------------------------------ args */

function parseArgs(argv) {
  const o = { pages: 40, limit: 50, out: '_work/decks.json', featured: 16, concurrency: 4, mergeOnly: false, timeout: 25_000 };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'pages') o.pages = Number(v);
    else if (k === 'limit') o.limit = Number(v);
    else if (k === 'out') o.out = v;
    else if (k === 'featured') o.featured = Number(v);
    else if (k === 'concurrency') o.concurrency = Number(v);
    else if (k === 'merge-only') o.mergeOnly = true;
    else if (k === 'timeout') o.timeout = Number(v);
  }
  return o;
}
const opt = parseArgs(process.argv);

const LOG_FILE = resolve(ROOT, '_work/fetch-decks.log');
try { writeFileSync(LOG_FILE, ''); } catch { /* ignore */ }
const log = (...a) => {
  const line = `[decks ${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch { /* ignore */ }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ http */

const agent = new https.Agent({ keepAlive: true, maxSockets: 8, family: 4 });

function getBuffer(url, { timeoutMs = opt.timeout } = {}) {
  return new Promise((res, rej) => {
    const req = https.get(url, { agent, headers: { 'user-agent': UA, accept: 'application/json' } }, (r) => {
      if ((r.statusCode ?? 0) !== 200) {
        r.resume();
        rej(new Error(`HTTP ${r.statusCode}`));
        return;
      }
      const chunks = [];
      r.on('data', (d) => chunks.push(d));
      r.on('end', () => res(Buffer.concat(chunks)));
      r.on('error', rej);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`超时 ${timeoutMs}ms`)));
    req.on('error', rej);
  });
}

async function getJSON(url, retries = 4) {
  let last;
  for (let i = 1; i <= retries; i++) {
    try {
      return JSON.parse((await getBuffer(url)).toString('utf8'));
    } catch (e) {
      last = e;
      if (i < retries) await sleep(400 * 2 ** (i - 1));
    }
  }
  throw new Error(`GET ${url} 失败: ${last?.message}`);
}

/* ------------------------------------------------------------------ 抓取 */

async function fetchPages() {
  await mkdir(PAGES_DIR, { recursive: true });
  const need = [];
  for (let p = 1; p <= opt.pages; p++) {
    const file = resolve(PAGES_DIR, `p${String(p).padStart(2, '0')}.json`);
    try {
      const st = await stat(file);
      if (st.size > 200) continue; // 已有缓存
    } catch { /* 无缓存 */ }
    need.push({ p, file });
  }
  log(`分页需求：共 ${opt.pages} 页，缓存命中 ${opt.pages - need.length}，待抓 ${need.length}`);

  let cursor = 0;
  const workers = Array.from({ length: Math.min(opt.concurrency, need.length || 1) }, async () => {
    while (cursor < need.length) {
      const { p, file } = need[cursor++];
      const t = Date.now();
      try {
        const json = await getJSON(`${API_BASE}/decks?limit=${opt.limit}&page=${p}`);
        const data = json?.data ?? [];
        await writeFile(file, JSON.stringify(data), 'utf8');
        log(`page ${p}/${opt.pages} -> ${data.length} 个卡组（${Date.now() - t}ms，meta.total=${json?.meta?.total}）`);
      } catch (e) {
        log(`page ${p} 失败：${e.message}`);
      }
      await sleep(100);
    }
  });
  await Promise.all(workers);
}

async function mergePages() {
  const decks = [];
  for (let p = 1; p <= opt.pages; p++) {
    const file = resolve(PAGES_DIR, `p${String(p).padStart(2, '0')}.json`);
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (Array.isArray(data)) decks.push(...data);
    } catch { /* 缺页跳过 */ }
  }
  const seen = new Set();
  const unique = [];
  for (const d of decks) {
    const key = d.id ?? d.share_slug ?? `${d.name}|${d.deck_code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
  }
  await mkdir(dirname(resolve(ROOT, opt.out)), { recursive: true });
  await writeFile(resolve(ROOT, opt.out), JSON.stringify(unique), 'utf8');
  log(`合并写入 ${opt.out}：${unique.length} 个卡组（原始 ${decks.length}，去重 ${decks.length - unique.length}）`);
  return unique;
}

/* ------------------------------------------------------------------ 精选项 */

function normalizeFeatured(d) {
  const cards = Array.isArray(d.cards_snapshot)
    ? d.cards_snapshot.map((c) => ({ cardId: c.card_id, count: c.count }))
    : [];
  return {
    slug: String(d.share_slug ?? d.id ?? ''),
    id: String(d.id ?? d.share_slug ?? ''),
    name: d.name ?? '',
    author: d.author ?? null,
    description: d.description ?? null,
    mainFaction: d.main_faction ?? null,
    allyFaction: d.ally_faction ?? null,
    deckCode: d.deck_code ?? null,
    cards,
    likes: d.like_count ?? 0,
    views: d.view_count ?? 0,
    tags: Array.isArray(d.tags) ? d.tags : [],
  };
}

async function writeFeatured(decks) {
  const featured = decks
    .map(normalizeFeatured)
    .filter((d) => d.deckCode && d.cards.length > 0)
    .sort((a, b) => b.likes - a.likes || b.views - a.views)
    .slice(0, opt.featured);
  await mkdir(resolve(ROOT, 'public/data'), { recursive: true });
  await writeFile(resolve(ROOT, 'public/data/featured-decks.json'), JSON.stringify(featured, null, 2), 'utf8');
  log(`写入 public/data/featured-decks.json：${featured.length} 个热门卡组（top likes=${featured[0]?.likes ?? 0}）`);
}

/* ------------------------------------------------------------------ main */

async function main() {
  if (!opt.mergeOnly) await fetchPages();
  const decks = await mergePages();
  await writeFeatured(decks);
}

main().catch((e) => {
  console.error('[decks] 失败:', e);
  process.exit(1);
});
