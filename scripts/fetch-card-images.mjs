#!/usr/bin/env node
/**
 * 卡图镜像脚本 —— 把 docs/_cards.json 里的卡面下载到 public/cards/<card_id>.<ext>
 *
 * 背景（见 docs/GITHUB_RESEARCH.md §5.3）：
 *   - www.kards.com 在部分网络环境不可达，因此默认走 wsrv.nl 图片代理（转 WebP）。
 *   - wsrv 首取需回源（实测 ~10s/张），并发高了会被限流，故默认 concurrency=2 + delay=800ms。
 *   - 支持断点续传：已存在的文件直接跳过，中断后原命令重跑即可。
 *
 * 用法：
 *   node scripts/fetch-card-images.mjs                      # 全量，WebP，限速
 *   node scripts/fetch-card-images.mjs --limit 20           # 先跑 20 张试水
 *   node scripts/fetch-card-images.mjs --concurrency 4      # 网络好时提速
 *   node scripts/fetch-card-images.mjs --direct             # 直连 kards.com 取原生 .avif
 *   node scripts/fetch-card-images.mjs --lang en            # 镜像英文卡面（默认 zh-Hans）
 *
 * 许可：卡面版权归 1939 Games 所有，仅在官方 Community Content Policy 与项目维护者授权下
 *      用于非商业同人项目。详见 README 免责声明与 docs/GITHUB_RESEARCH.md §6。
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : true;
};

const CARDS_JSON = flag('cards', 'docs/_cards.json');
const OUT_DIR = flag('out', 'public/cards');
const LANG = flag('lang', 'zh-Hans');
const CONCURRENCY = Number(flag('concurrency', 2));
const DELAY_MS = Number(flag('delay', 800));
const LIMIT = Number(flag('limit', 0));
const RETRIES = Number(flag('retries', 3));
const DIRECT = flag('direct', false) === true;
const QUALITY = flag('quality', '82');

const WSERV = 'https://wsrv.nl/?url=';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 直连模式输出 .avif；代理模式 wsrv 不支持 avif 输出，只能出 .webp */
const EXT = DIRECT ? '.avif' : '.webp';

function targetUrl(imageUrl) {
  const localized = imageUrl.replace(/\/v\d+\/[^/]+\//, (m) => m.replace(/\/[^/]+\/$/, `/${LANG}/`));
  if (DIRECT) return localized;
  return `${WSERV}${encodeURIComponent(localized)}&output=webp&q=${QUALITY}`;
}

async function exists(p) {
  try {
    const s = await stat(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url, dest) {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error(`payload too small (${buf.length}B)`);
      // 缓冲区完整后再落盘，避免中断留下半截文件
      await writeFile(dest, buf);
      return buf.length;
    } catch (err) {
      if (attempt === RETRIES) throw err;
      await sleep(1500 * attempt);
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const raw = await readFile(CARDS_JSON, 'utf8');
  const cards = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const list = (Array.isArray(cards) ? cards : cards.cards ?? []).filter((c) => c && c.image_url);
  const targets = LIMIT > 0 ? list.slice(0, LIMIT) : list;

  await mkdir(OUT_DIR, { recursive: true });

  console.log(
    `[cards] total=${list.length} target=${targets.length} ext=${EXT} ` +
      `concurrency=${CONCURRENCY} delay=${DELAY_MS}ms mode=${DIRECT ? 'direct' : 'wsrv'}`,
  );

  let done = 0;
  let skipped = 0;
  let failed = 0;
  let bytes = 0;
  let cursor = 0;
  const failures = [];

  const worker = async (id) => {
    while (cursor < targets.length) {
      const card = targets[cursor];
      cursor += 1;
      const dest = path.join(OUT_DIR, `${card.card_id}${EXT}`);
      if (await exists(dest)) {
        skipped += 1;
      } else {
        try {
          const n = await fetchWithRetry(targetUrl(card.image_url), dest);
          bytes += n;
          done += 1;
        } catch (err) {
          failed += 1;
          failures.push(`${card.card_id}: ${err.message}`);
        }
        if ((done + failed) % 25 === 0) {
          console.log(`[cards] +${done} done, ${skipped} skipped, ${failed} failed (${(bytes / 1048576).toFixed(1)} MB)`);
        }
      }
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, (_, i) => worker(i)));

  console.log(`[cards] finished: downloaded=${done} skipped=${skipped} failed=${failed} totalMB=${(bytes / 1048576).toFixed(1)}`);
  if (failures.length) {
    console.log('[cards] failures (重跑同一命令即可续传):');
    for (const f of failures.slice(0, 20)) console.log('  -', f);
    if (failures.length > 20) console.log(`  ... 另有 ${failures.length - 20} 条`);
    process.exitCode = 1;
  }
  // 记录本次运行的指纹，便于核对数据版本
  const digest = createHash('sha1').update(targets.map((c) => c.card_id).join(',')).digest('hex').slice(0, 12);
  console.log(`[cards] manifest=${targets.length} cards, digest=${digest}`);
}

main().catch((err) => {
  console.error('[cards] fatal:', err);
  process.exitCode = 1;
});
