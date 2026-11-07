#!/usr/bin/env node
/**
 * fetch-decks.mjs — 抓取公开卡组广场数据（用于 deck code 逆向与规则统计）
 *
 * 数据源：GET https://1939.kardsdecker.com/api/v1/decks?limit=50&page=N
 * 产物：
 *   _work/decks.json          原始卡组数组（含 cards_snapshot / deck_code / like_count …）
 *   public/data/featured-decks.json  精选热门卡组（按 like_count 排序取前 N 条，规范化）
 *
 * 用法：
 *   node scripts/fetch-decks.mjs                 # 抓 20 页 = 1000 个卡组
 *   node scripts/fetch-decks.mjs --pages=40      # 抓 2000 个
 *   node scripts/fetch-decks.mjs --pages=2 --featured=12
 *
 * 零运行时依赖。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const API_BASE = 'https://1939.kardsdecker.com/api/v1';
const UA = 'Fards-decktest/0.1 (+deck-fetch; node)';

function parseArgs(argv) {
  const o = { pages: 20, limit: 50, out: '_work/decks.json', featured: 16, cache: true, concurrency: 3 };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'pages') o.pages = Number(v);
    else if (k === 'limit') o.limit = Number(v);
    else if (k === 'out') o.out = v;
    else if (k === 'featured') o.featured = Number(v);
    else if (k === 'concurrency') o.concurrency = Number(v);
    else if (k === 'cache') o.cache = v !== 'false';
  }
  return o;
}
const opt = parseArgs(process.argv);
/** 同时写 stdout 和 _work/fetch-decks.log（后台 job 里 stdout 可能被缓冲，日志文件更可靠） */
import { appendFileSync, writeFileSync } from 'node:fs';
const LOG_FILE = resolve(ROOT, '_work/fetch-decks.log');
try { writeFileSync(LOG_FILE, ''); } catch { /* ignore */ }
const log = (...a) => {
  const line = `[decks ${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch { /* ignore */ }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const agent = new https.Agent({ keepAlive: true, maxSockets: 8, family: 4 });

function getBuffer(url, { timeoutMs = 120_000 } = {}) {
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
      if (i < retries) await sleep(600 * 2 ** (i - 1));
    }
  }
  throw new Error(`GET ${url} 失败: ${last?.message}`);
}

function normalizeDeck(d) {
  return {
    id: d.id ?? d.share_slug ?? null,
    name: d.name ?? '',
    author: d.author ?? null,
    description: d.description ?? null,
    mainFaction: d.main_faction ?? null,
    allyFaction: d.ally_faction ?? null,
    deckCode: d.deck_code ?? null,
    cards: Array.isArray(d.cards_snapshot)
      ? d.cards_snapshot.map((c) => ({ cardId: c.card_id, count: c.count }))
      : [],
    tags: Array.isArray(d.tags) ? d.tags : [],
    likes: d.like_count ?? 0,
    views: d.view_count ?? 0,
    createdAt: d.created_at ?? null,
    updatedAt: d.updated_at ?? null,
  };
}

async function main() {
  const pages = [];
  for (let p = 1; p <= opt.pages; p++) pages.push(p);

  const decks = [];
  const pageResults = new Array(pages.length);
  let cursor = 0;
  const concurrency = Math.max(1, opt.concurrency ?? 3);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pages.length) }, async () => {
      while (cursor < pages.length) {
        const idx = cursor++;
        const p = pages[idx];
        let json;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            json = await getJSON(`${API_BASE}/decks?limit=${opt.limit}&page=${p}`);
            break;
          } catch (e) {
            log(`page ${p} 第 ${attempt} 次失败: ${e.message}`);
            if (attempt === 3) json = null;
          }
        }
        pageResults[idx] = json?.data ?? [];
        log(`page ${p}/${opt.pages} -> ${pageResults[idx].length} 个卡组（meta.total=${json?.meta?.total}）`);
        await sleep(80);
      }
    })
  );
  for (const page of pageResults) if (page) decks.push(...page);

  // 去掉重复 id
  const seen = new Set();
  const unique = [];
  for (const d of decks) {
    const key = d.id ?? d.share_slug ?? JSON.stringify(d.deck_code) + d.name;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
  }

  await mkdir(dirname(resolve(ROOT, opt.out)), { recursive: true });
  await writeFile(resolve(ROOT, opt.out), JSON.stringify(unique), 'utf8');
  log(`写入 ${opt.out}：${unique.length} 个卡组（去重 ${decks.length - unique.length}）`);

  // 精选：按 like_count 降序，取前 N，规范化
  const featured = unique
    .map(normalizeDeck)
    .filter((d) => d.deckCode && d.cards.length > 0)
    .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0) || (b.views ?? 0) - (a.views ?? 0))
    .slice(0, opt.featured)
    .map((d) => ({
      slug: String(d.id ?? ''),
      name: d.name,
      author: d.author,
      mainFaction: d.mainFaction,
      allyFaction: d.allyFaction,
      deckCode: d.deckCode,
      cards: d.cards,
      likes: d.likes,
      tags: d.tags,
    }));

  await writeFile(resolve(ROOT, 'public/data/featured-decks.json'), JSON.stringify(featured, null, 2), 'utf8');
  log(`写入 public/data/featured-decks.json：${featured.length} 个热门卡组（top likes=${featured[0]?.likes ?? 0}）`);
}

main().catch((e) => {
  console.error('[decks] 失败:', e);
  process.exit(1);
});
