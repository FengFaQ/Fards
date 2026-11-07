#!/usr/bin/env node
/**
 * fetch-images.mjs — 下载卡图 / 卡背（不随仓库分发：public/cards 与 public/cardbacks 走 .gitignore）
 *
 * 通道（按优先级，可用 --via 指定起点）：
 *   1. wsrv.nl 图片代理：`https://wsrv.nl/?url=<host/path>&output=webp&w=400`
 *      —— 实测 1.3~3.1s / 张，返回 webp，顺带解决 AVIF 兼容与 CORS。
 *   2. kardsdecker img-proxy（返回原始 avif，实测 9~18s / 张，作退路）
 *   3. www.kards.com 直链（实测本机 connect ETIMEDOUT，仅作最后兜底）
 *
 * 产物：
 *   public/cards/<cardId>.webp        卡图（默认 400px 宽 webp）
 *   public/cardbacks/<name>.webp      卡背预览（512px 宽 webp，sharp 本地转码）
 *   public/data/cardbacks.json        卡背清单（{id,name,imageUrl,file,localPath}）
 *   public/data/image-missing.json    缺失清单（供 verify-data / UI 回退判断）
 *
 * 特性：并发、跳过已存在、每图重试、断点续传、进度行（配合 run_in_background 观察）。
 * 依赖：仅 node 内置模块；sharp 为可选（仅用于把 png/avif 转 webp，缺失则原样保存）。
 *
 * 用法：
 *   node scripts/fetch-images.mjs                         # 卡图 + 卡背
 *   node scripts/fetch-images.mjs --cards-only --via=wsrv
 *   node scripts/fetch-images.mjs --concurrency=16 --w=400
 *   node scripts/fetch-images.mjs --limit=40              # 冒烟
 */

import { mkdir, readFile, writeFile, stat, unlink, rename } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const API_BASE = 'https://1939.kardsdecker.com/api/v1';
const UA = 'Fards-decktest/0.1 (+image-fetch; node)';
const MIN_VALID_BYTES = 400;

/* ------------------------------------------------------------------ args */

function parseArgs(argv) {
  const o = {
    cards: 'public/data/cards.json',
    out: 'public/cards',
    backsOut: 'public/cardbacks',
    backsJson: 'public/data/cardbacks.json',
    missing: 'public/data/image-missing.json',
    concurrency: 14,
    retries: 4,
    limit: 0,
    width: 400,
    via: 'wsrv',
    cardsOnly: false,
    backsOnly: false,
    skipBacks: false,
    pageSize: 50,
  };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    const num = Number(v);
    switch (k) {
      case 'cards': o.cards = v; break;
      case 'out': o.out = v; break;
      case 'backs-out': o.backsOut = v; break;
      case 'backs-json': o.backsJson = v; break;
      case 'missing': o.missing = v; break;
      case 'concurrency': o.concurrency = num; break;
      case 'retries': o.retries = num; break;
      case 'limit': o.limit = num; break;
      case 'width': o.width = num; break;
      case 'via': o.via = v; break;
      case 'cards-only': o.cardsOnly = true; break;
      case 'backs-only': o.backsOnly = true; break;
      case 'skip-backs': o.skipBacks = true; break;
      default: break;
    }
  }
  return o;
}

const opt = parseArgs(process.argv);
const t0 = Date.now();
const el = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
const log = (...a) => console.log(`[images ${el()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ http */

const agent = new https.Agent({ keepAlive: true, maxSockets: Math.max(48, opt.concurrency * 3), family: 4 });

function getBuffer(url, { timeoutMs = 45_000, redirects = 0 } = {}) {
  return new Promise((res, rej) => {
    const mod = url.startsWith('http://') ? http : https;
    const req = mod.get(url, { agent, headers: { 'user-agent': UA, accept: 'image/webp,image/avif,image/*,*/*' } }, (r) => {
      const status = r.statusCode ?? 0;
      if (status >= 300 && status < 400 && r.headers.location && redirects < 5) {
        r.resume();
        getBuffer(new URL(r.headers.location, url).toString(), { timeoutMs, redirects: redirects + 1 }).then(res, rej);
        return;
      }
      if (status !== 200) {
        r.resume();
        rej(Object.assign(new Error(`HTTP ${status}`), { status }));
        return;
      }
      const chunks = [];
      let bytes = 0;
      r.on('data', (d) => {
        chunks.push(d);
        bytes += d.length;
        if (bytes > 24 * 1024 * 1024) req.destroy(new Error('响应超过 24MB'));
      });
      r.on('end', () => res({ buf: Buffer.concat(chunks), contentType: String(r.headers['content-type'] ?? '') }));
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
      const { buf } = await getBuffer(url, { timeoutMs: 90_000 });
      return JSON.parse(buf.toString('utf8'));
    } catch (e) {
      last = e;
      if (i < retries) await sleep(400 * 2 ** (i - 1));
    }
  }
  throw new Error(`GET ${url} 失败: ${last?.message}`);
}

/* ------------------------------------------------------------------ sharp */

/** sharp 可选加载（缺失时原样落盘） */
let sharpMod = null;
try {
  sharpMod = (await import('sharp')).default;
} catch {
  sharpMod = null;
}

/** 转码为 webp（尽力而为）；失败返回 null 表示保留原字节 */
async function toWebp(buf, width) {
  if (!sharpMod) return null;
  try {
    return await sharpMod(buf, { animated: false }).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ 通道 */

const WSRV = (rawUrl, w) =>
  `https://wsrv.nl/?url=${encodeURIComponent(String(rawUrl).replace(/^https?:\/\//, ''))}&output=webp&w=${w}`;

/** 依次尝试通道；返回 {buf, via} */
async function fetchBytes(card) {
  const cardId = card.cardId ?? card.card_id;
  const imageUrl = card.imageUrl ?? card.image_url;
  const proxyUrl = card.imageProxyUrl ?? card.image_proxy_url;
  const order = opt.via === 'proxy' ? ['proxy', 'wsrv', 'direct'] : opt.via === 'direct' ? ['direct', 'wsrv', 'proxy'] : ['wsrv', 'proxy', 'direct'];
  const errors = [];
  for (const via of order) {
    const url = via === 'wsrv' ? WSRV(imageUrl, opt.width) : via === 'proxy' ? proxyUrl : imageUrl;
    if (!url) continue;
    for (let attempt = 1; attempt <= (via === 'wsrv' ? opt.retries : 2); attempt++) {
      try {
        const { buf, contentType } = await getBuffer(url);
        if (buf.length < MIN_VALID_BYTES) throw new Error(`文件过小 ${buf.length}B (${contentType})`);
        // wsrv 直接给 webp；其余通道用 sharp 转码
        if (via !== 'wsrv') {
          const webp = await toWebp(buf, opt.width);
          if (webp) return { buf: webp, via: `${via}+sharp` };
          return { buf, via, ext: 'avif' };
        }
        return { buf, via };
      } catch (e) {
        errors.push(`${via}#${attempt}: ${e.message}`);
        if (attempt < (via === 'wsrv' ? opt.retries : 2)) await sleep(300 * attempt);
      }
    }
  }
  throw new Error(errors.slice(-4).join(' | '));
}

async function writeFileAtomic(dest, buf) {
  const part = `${dest}.part`;
  await writeFile(part, buf);
  await rename(part, dest);
}

async function pool(items, worker, concurrency) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await worker(item);
      }
    })
  );
}

/* ------------------------------------------------------------------ 卡图 */

async function fetchCardImages(cards) {
  const outDir = resolve(ROOT, opt.out);
  await mkdir(outDir, { recursive: true });

  const pending = [];
  let already = 0;
  for (const card of cards) {
    const cardId = card.cardId ?? card.card_id;
    const dest = resolve(outDir, `${cardId}.webp`);
    try {
      const st = await stat(dest);
      if (st.size >= MIN_VALID_BYTES) {
        already++;
        continue;
      }
    } catch {
      /* 不存在 */
    }
    pending.push({ cardId, dest, card });
  }

  log(`卡图：总计 ${cards.length}，已存在 ${already}，待下载 ${pending.length}，并发 ${opt.concurrency}，通道优先=${opt.via}`);
  if (!pending.length) return { ok: already, failed: [], viaStats: {} };

  const failed = [];
  const viaStats = {};
  let done = 0;
  let bytes = 0;
  const started = Date.now();

  await pool(
    pending,
    async (item) => {
      try {
        const { buf, via } = await fetchBytes(item.card);
        await writeFileAtomic(item.dest, buf);
        bytes += buf.length;
        viaStats[via] = (viaStats[via] ?? 0) + 1;
      } catch (e) {
        failed.push({ cardId: item.cardId, error: e.message });
      }
      done++;
      if (done % 50 === 0 || done === pending.length) {
        const rate = done / ((Date.now() - started) / 1000);
        const eta = Math.round((pending.length - done) / Math.max(rate, 0.01));
        log(
          `卡图进度 ${done}/${pending.length} (${((done / pending.length) * 100).toFixed(1)}%) 失败=${failed.length} ` +
            `已下=${(bytes / 1048576).toFixed(1)}MB 速度=${rate.toFixed(2)}/s ETA=${eta}s`
        );
      }
    },
    opt.concurrency
  );

  log(`卡图通道统计: ${JSON.stringify(viaStats)}`);
  return { ok: already + done - failed.length, failed, viaStats };
}

/* ------------------------------------------------------------------ 卡背 */

async function fetchCardBacks() {
  log('卡背：抓取清单 …');
  const first = await getJSON(`${API_BASE}/card-backs?limit=${opt.pageSize}&page=1`);
  const pages = first.meta?.total_pages ?? 1;
  const raw = [...(first.data ?? [])];
  for (let p = 2; p <= pages; p++) {
    const json = await getJSON(`${API_BASE}/card-backs?limit=${opt.pageSize}&page=${p}`);
    raw.push(...(json.data ?? []));
    if (p % 5 === 0) log(`  卡背清单 page ${p}/${pages}（累计 ${raw.length}）`);
  }
  log(`卡背：清单 ${raw.length} 条（meta.total=${first.meta?.total}）`);

  const used = new Set();
  const backs = raw.map((b) => {
    const rawId = String(b.id ?? '');
    let file = basename(rawId.replace(/\\/g, '/')) || 'unknown.png';
    if (!/\.(png|jpg|jpeg|webp|avif)$/i.test(file)) file += '.png';
    let unique = file;
    let n = 2;
    while (used.has(unique)) {
      unique = file.replace(/(\.\w+)$/, `_${n}$1`);
      n++;
    }
    used.add(unique);
    return { id: rawId, name: String(b.name ?? ''), imageUrl: String(b.image_url ?? b.imageUrl ?? ''), file: unique };
  });

  const outDir = resolve(ROOT, opt.backsOut);
  await mkdir(outDir, { recursive: true });

  const pending = [];
  let already = 0;
  for (const back of backs) {
    const webpName = back.file.replace(/\.(png|jpe?g|avif)$/i, '.webp');
    const dest = resolve(outDir, webpName);
    back.file = webpName;
    back.localPath = `/cardbacks/${webpName}`;
    try {
      const st = await stat(dest);
      if (st.size >= MIN_VALID_BYTES) {
        already++;
        continue;
      }
    } catch {
      /* 尚未下载 */
    }
    if (back.imageUrl) pending.push({ back, dest });
  }

  log(`卡背：已存在 ${already}，待下载 ${pending.length}`);
  const failed = [];
  let done = 0;
  let bytes = 0;
  await pool(
    pending,
    async ({ back, dest }) => {
      try {
        const { buf } = await getBuffer(back.imageUrl, { timeoutMs: 60_000 });
        const webp = await toWebp(buf, 512);
        const out = webp ?? buf;
        // sharp 不可用时保留原始扩展名
        if (!webp) {
          const keep = dest.replace(/\.webp$/, back.imageUrl.match(/\.(png|jpe?g)$/i)?.[0] ?? '.png');
          back.file = basename(keep);
          back.localPath = `/cardbacks/${back.file}`;
          await writeFileAtomic(keep, out);
        } else {
          await writeFileAtomic(dest, out);
        }
        bytes += out.length;
      } catch (e) {
        failed.push({ id: back.id, name: back.name, url: back.imageUrl, error: e.message });
      }
      done++;
      if (done % 50 === 0 || done === pending.length) {
        log(`卡背进度 ${done}/${pending.length} 失败=${failed.length} 已下=${(bytes / 1048576).toFixed(1)}MB`);
      }
    },
    opt.concurrency
  );

  const payload = {
    source: `${API_BASE}/card-backs`,
    fetchedAt: new Date().toISOString(),
    total: backs.length,
    downloaded: already + done - failed.length,
    failed: failed.length,
    localDir: opt.backsOut,
    fileFormat: sharpMod ? 'webp(512w)' : 'original',
    data: backs,
  };
  await mkdir(dirname(resolve(ROOT, opt.backsJson)), { recursive: true });
  await writeFile(resolve(ROOT, opt.backsJson), JSON.stringify(payload, null, 2), 'utf8');
  log(`卡背：清单写入 ${opt.backsJson}（${backs.length} 条）→ ${opt.backsOut}`);
  return { failed, total: backs.length };
}

/** 扫描 public/cards 目录，生成"已下载卡图清单"（运行时本地优先/远程兜底靠它） */
async function writeImagesManifest(allCards) {
  const outDir = resolve(ROOT, opt.out);
  const downloaded = [];
  let bytes = 0;
  for (const card of allCards) {
    const cardId = card.cardId ?? card.card_id;
    try {
      const st = await stat(resolve(outDir, `${cardId}.webp`));
      if (st.size >= MIN_VALID_BYTES) {
        downloaded.push(cardId);
        bytes += st.size;
      }
    } catch {
      /* 缺失 */
    }
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    format: 'webp',
    width: opt.width,
    dir: opt.out,
    total: allCards.length,
    count: downloaded.length,
    missing: allCards.length - downloaded.length,
    bytes,
    cardIds: downloaded,
  };
  const file = resolve(ROOT, 'public/data/images-manifest.json');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(payload), 'utf8');
  log(`卡图清单写入 public/data/images-manifest.json：${downloaded.length}/${allCards.length} 张，${(bytes / 1048576).toFixed(1)}MB`);
  return payload;
}

/* ------------------------------------------------------------------ main */

async function main() {
  const cards = opt.backsOnly ? [] : JSON.parse(await readFile(resolve(ROOT, opt.cards), 'utf8'));
  if (!opt.backsOnly && !Array.isArray(cards)) throw new Error(`${opt.cards} 不是数组`);
  const limited = opt.limit > 0 ? cards.slice(0, opt.limit) : cards;

  const cardResult = opt.backsOnly ? { ok: 0, failed: [], viaStats: {} } : await fetchCardImages(limited);
  if (!opt.backsOnly && opt.limit === 0) await writeImagesManifest(limited);
  const backResult = opt.cardsOnly || opt.skipBacks ? { failed: [], total: 0 } : await fetchCardBacks();

  const payload = {
    generatedAt: new Date().toISOString(),
    format: 'webp',
    width: opt.width,
    cardsTotal: limited.length,
    cardsPresent: cardResult.ok,
    cardsMissing: cardResult.failed.length,
    cardbacksTotal: backResult.total,
    cardbacksMissing: backResult.failed.length,
    channels: cardResult.viaStats ?? {},
    missingCards: cardResult.failed,
    missingCardbacks: backResult.failed,
  };
  await mkdir(dirname(resolve(ROOT, opt.missing)), { recursive: true });
  await writeFile(resolve(ROOT, opt.missing), JSON.stringify(payload, null, 2), 'utf8');

  log('==================================================');
  log(`完成：卡图 ok=${cardResult.ok} 失败=${cardResult.failed.length}；卡背失败=${backResult.failed.length}`);
  log(`缺失清单：${opt.missing}`);
  if (cardResult.failed.length) {
    log(`前 10 个缺失卡：${cardResult.failed.slice(0, 10).map((f) => f.cardId).join(', ')}`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error('[images] 失败:', e);
  process.exit(1);
});
