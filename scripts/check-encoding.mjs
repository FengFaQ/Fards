/**
 * 编码守卫：扫描源码/文档/数据文件，发现非 UTF-8 或典型 GBK 乱码即失败。
 * 用途：防止 Windows PowerShell（Get-Content/Set-Content 默认 GBK）误写中文源码造成乱码。
 *
 * 用法：node scripts/check-encoding.mjs [--fix-latin1]  （CI 与 pre-commit 均可调用）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '_work', 'public/cards', 'public/cardbacks', '.vite']);
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.css', '.html', '.txt', '.yml', '.yaml', '.sh', '.ps1']);
const MAX_SIZE = 3_000_000;
// 典型 UTF-8 被按 GBK 解码后的字符（乱码）
const MOJIBAKE = /[\u951F\u9419\u9410\u93B8\u93C8\u93CD\u93B4\u935A\u935B\u93AC\u59AB\u5B6D\u9525\u9510\u94F9\u935C]/g;

const suspects = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const rel = relative(ROOT, path).replace(/\\/g, '/');
    if (SKIP_DIRS.has(entry.name) || rel === 'node_modules') continue;
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!TEXT_EXT.has(extname(entry.name).toLowerCase())) continue;
    let buf;
    try {
      buf = readFileSync(path);
    } catch {
      continue;
    }
    if (buf.length > MAX_SIZE) continue;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      suspects.push({ path: rel, reason: '非 UTF-8 字节序列（文件不是合法的 UTF-8）' });
      continue;
    }
    if (text.includes('\uFFFD')) {
      suspects.push({ path: rel, reason: '包含 U+FFFD 替换字符（内容已损坏）' });
      continue;
    }
    const hits = text.match(MOJIBAKE);
    if (hits && hits.length > 2) {
      suspects.push({ path: rel, reason: `疑似 GBK 解读 UTF-8 乱码（命中 ${hits.length} 个特征字符）` });
    }
  }
}

walk(ROOT);

if (suspects.length > 0) {
  console.error(`\n[fards] 编码检查失败：发现 ${suspects.length} 个可疑文件\n`);
  for (const s of suspects.slice(0, 50)) console.error(`  ✗ ${s.path}\n      ${s.reason}`);
  console.error('\n修复提示：用编辑器以 UTF-8 重新保存；Windows PowerShell 请用 -Encoding utf8 或改用 Node 写文件。\n');
  process.exit(1);
}
console.log('[fards] 编码检查通过：源码/文档/数据均为合法 UTF-8。');
