#!/usr/bin/env node
/**
 * fetch-fonts.mjs — 下载 UI 字体（军事 stencil + 窄体拉丁），并生成 README 素材
 *
 * 字体（均为 SIL Open Font License 1.1，可随 AGPL 项目分发）：
 *   - Black Ops One（标题/军械牌匾风格 stencil）
 *   - Oswald（窄体，用于数字/小标题）
 * 中文：不随仓库分发 CJK 字体（体积大），使用系统字体栈回退，
 *       可选从 CDN 加 Noto Sans SC（见 public/fonts/README.md）。
 *
 * 来源优先级：
 *   1. GitHub raw：https://raw.githubusercontent.com/google/fonts/main/<path>%（官方 ttf 源）
 *   2. fontsource CDN（woff2，体积小、浏览器友好）
 *
 * 用法：node scripts/fetch-fonts.mjs [--force]
 */

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'public/fonts');
const UA = 'Fards-decktest/0.1 (+font-fetch; node)';
const force = process.argv.includes('--force');

const agent = new https.Agent({ keepAlive: true, maxSockets: 6, family: 4 });

function download(url, redirects = 0) {
  return new Promise((res, rej) => {
    const req = https.get(url, { agent, headers: { 'user-agent': UA, accept: '*/*' } }, (r) => {
      const st = r.statusCode ?? 0;
      if (st >= 300 && st < 400 && r.headers.location && redirects < 6) {
        r.resume();
        download(new URL(r.headers.location, url).toString(), redirects + 1).then(res, rej);
        return;
      }
      if (st !== 200) {
        r.resume();
        rej(new Error(`HTTP ${st}`));
        return;
      }
      const chunks = [];
      r.on('data', (d) => chunks.push(d));
      r.on('end', () => res(Buffer.concat(chunks)));
      r.on('error', rej);
    });
    req.setTimeout(60_000, () => req.destroy(new Error('超时 60s')));
    req.on('error', rej);
  });
}

/** 候选：{ name, file, urls[] } —— 按顺序尝试 */
const FONTS = [
  {
    name: 'Black Ops One',
    file: 'BlackOpsOne-Regular.ttf',
    license: 'OFL-1.1',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/blackopsone/BlackOpsOne-Regular.ttf',
      'https://cdn.jsdelivr.net/npm/@fontsource/black-ops-one@5/files/black-ops-one-latin-400-normal.woff2',
    ],
  },
  {
    name: 'Oswald',
    file: 'Oswald-VariableFont_wght.ttf',
    license: 'OFL-1.1',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf',
      'https://cdn.jsdelivr.net/npm/@fontsource-variable/oswald@5/files/oswald-latin-wght-normal.woff2',
    ],
  },
  {
    name: 'Black Ops One (license)',
    file: 'OFL-BlackOpsOne.txt',
    license: 'OFL-1.1',
    licenseOnly: true,
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/blackopsone/OFL.txt'],
  },
  {
    name: 'Oswald (license)',
    file: 'OFL-Oswald.txt',
    license: 'OFL-1.1',
    licenseOnly: true,
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/OFL.txt'],
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const results = [];
  for (const font of FONTS) {
    const dest = resolve(OUT_DIR, font.file);
    try {
      const st = await stat(dest);
      if (st.size > 1024 && !force) {
        results.push({ ...font, file: font.file, bytes: st.size, source: 'cached' });
        console.log(`= ${font.file} 已存在（${(st.size / 1024).toFixed(1)}KB），跳过`);
        continue;
      }
    } catch {
      /* 不存在 */
    }
    let done = false;
    for (const url of font.urls) {
      try {
        const buf = await download(url);
        if (buf.length < 1024) throw new Error(`文件过小 ${buf.length}B`);
        // 候选 URL 可能返回 woff2，按魔数修正扩展名
        const isWoff2 = buf.subarray(0, 4).toString('latin1') === 'wOF2';
        const isTtf = buf.subarray(0, 4).toString('latin1') === '\x00\x01\x00\x00';
        let fileName = font.file;
        if (isWoff2 && !font.licenseOnly) fileName = font.file.replace(/\.ttf$/, '.woff2');
        await writeFile(resolve(OUT_DIR, fileName), buf);
        console.log(`✓ ${fileName}  ←  ${url}  (${(buf.length / 1024).toFixed(1)}KB, ${isWoff2 ? 'woff2' : isTtf ? 'ttf' : 'unknown'})`);
        results.push({ ...font, file: fileName, bytes: buf.length, source: url, format: isWoff2 ? 'woff2' : 'ttf' });
        done = true;
        break;
      } catch (e) {
        console.log(`  ! ${url} → ${e.message}`);
      }
    }
    if (!done) {
      console.log(`✗ ${font.name} 全部来源失败`);
      results.push({ ...font, bytes: 0, failed: true });
    }
  }
  await writeFile(resolve(OUT_DIR, '_download-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), 'utf8');
  const failed = results.filter((r) => r.failed);
  console.log(failed.length ? `\n完成：${results.length - failed.length} 成功 / ${failed.length} 失败` : '\n完成：全部成功');
  if (failed.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error('[fonts] 失败:', e);
  process.exit(1);
});
