#!/usr/bin/env node
/**
 * test-deckcode.mjs — deck_code 编解码的对抗式验证
 * ------------------------------------------------------------------
 * 用本地 typescript（devDependency，无需额外装包）把 src/data 的 3 个 TS 模块
 * 转译到 _work/tstable/*.mjs，然后动态 import，**测的就是线上真实代码**。
 *
 * 验证项（对 _work/decks.json 里的公开卡组逐条跑）：
 *   1. 解码成功且不抛异常
 *   2. 解码出的 mainFaction / allyFaction 与 API 字段一致
 *   3. 解码出的 cards（card_id + count 多重集）与 cards_snapshot 完全一致
 *   4. roundtrip：encodeDeckCode(decode(code)) === code（逐字符相等）
 * 另附负例（非法输入必须抛错）。
 *
 * 用法：
 *   node scripts/test-deckcode.mjs
 *   node scripts/test-deckcode.mjs --decks=_work/decks.json --limit=500
 *   node scripts/test-deckcode.mjs --verbose        # 打印前 20 个失败样例
 *   node scripts/test-deckcode.mjs --dump=_work/deckcode-roundtrip.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/* ------------------------------------------------------------------ args */

function parseArgs(argv) {
  const o = { decks: '_work/decks.json', limit: 0, verbose: false, dump: '', src: 'src/data', build: '_work/tstable' };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'decks') o.decks = v;
    else if (k === 'limit') o.limit = Number(v);
    else if (k === 'verbose') o.verbose = true;
    else if (k === 'dump') o.dump = v;
  }
  return o;
}
const opt = parseArgs(process.argv);

/* ------------------------------------------------------------------ 转译 */

const MODULES = ['types', 'importMap', 'deckcode'];

async function buildModules() {
  const outDir = resolve(ROOT, opt.build);
  await mkdir(outDir, { recursive: true });
  for (const name of MODULES) {
    const src = await readFile(resolve(ROOT, opt.src, `${name}.ts`), 'utf8');
    const { outputText, diagnostics } = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        isolatedModules: true,
        removeComments: false,
      },
      fileName: `${name}.ts`,
      reportDiagnostics: true,
    });
    const fatal = (diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
    if (fatal.length) {
      throw new Error(`转译 ${name}.ts 出错：${fatal.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`);
    }
    // Node ESM 需要显式扩展名：把相对导入补成 .mjs
    const patched = outputText.replace(/(from\s+['"])(\.\/[A-Za-z0-9_]+)(['"])/g, '$1$2.mjs$3');
    await writeFile(resolve(outDir, `${name}.mjs`), patched, 'utf8');
  }
  return outDir;
}

/* ------------------------------------------------------------------ 主流程 */

const normFaction = (f) => {
  if (!f) return '';
  const s = String(f).trim();
  const alias = { USSR: 'Soviet', 'Soviet Union': 'Soviet' };
  return alias[s] ?? s;
};

function cardsKey(list) {
  return list
    .map((c) => `${c.cardId ?? c.card_id}:${c.count}`)
    .sort()
    .join(',');
}

async function main() {
  const outDir = await buildModules();
  const mod = await import(new URL(`file://${resolve(outDir, 'deckcode.mjs').replace(/\\/g, '/')}`).href);
  const { decodeDeckCode, encodeDeckCode, decodeDeckCodeSafe, FACTION_CODE, CODE_TO_FACTION } = mod;

  console.log('='.repeat(72));
  console.log('deck_code 编解码验证');
  console.log('='.repeat(72));
  console.log(`阵营码表（code → 阵营）：${JSON.stringify(CODE_TO_FACTION)}`);

  const decksPath = resolve(ROOT, opt.decks);
  let decks;
  try {
    decks = JSON.parse(await readFile(decksPath, 'utf8'));
  } catch (e) {
    console.error(`读不到 ${opt.decks}（先跑 node scripts/fetch-decks.mjs）：${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(decks)) throw new Error(`${opt.decks} 不是数组`);
  const sample = opt.limit > 0 ? decks.slice(0, opt.limit) : decks;
  console.log(`卡组样本：${sample.length} 个（${opt.decks}）\n`);

  const res = {
    total: 0,
    withCode: 0,
    decodeOk: 0,
    decodeFailed: [],
    factionOk: 0,
    factionMismatch: [],
    cardsOk: 0,
    cardsMismatch: [],
    encodeOk: 0,
    encodeMismatch: [],
    exceptions: [],
  };

  for (const deck of sample) {
    res.total++;
    const code = deck.deck_code ?? deck.deckCode;
    if (!code) continue;
    res.withCode++;

    // 1) 解码
    let decoded;
    try {
      decoded = decodeDeckCode(code);
      res.decodeOk++;
    } catch (e) {
      const safe = decodeDeckCodeSafe(code);
      res.decodeFailed.push({ code, error: e.message, safeError: safe.ok ? 'safe-ok' : safe.error });
      continue;
    }

    // 2) 阵营
    const apiMain = normFaction(deck.main_faction ?? deck.mainFaction);
    const apiAlly = normFaction(deck.ally_faction ?? deck.allyFaction) || null;
    const gotMain = normFaction(decoded.mainFaction);
    const gotAlly = decoded.allyFaction ? normFaction(decoded.allyFaction) : null;
    if (gotMain === apiMain && gotAlly === apiAlly) res.factionOk++;
    else res.factionMismatch.push({ code, api: [apiMain, apiAlly], got: [gotMain, gotAlly] });

    // 3) 卡牌多重集
    const snapshot = (deck.cards_snapshot ?? deck.cards ?? []).map((c) => ({ cardId: c.card_id ?? c.cardId, count: c.count }));
    if (cardsKey(decoded.cards) === cardsKey(snapshot)) res.cardsOk++;
    else {
      res.cardsMismatch.push({
        code,
        decodedCount: cardsKey(decoded.cards),
        snapshotCount: cardsKey(snapshot),
        decodedTotal: decoded.cards.reduce((s, c) => s + c.count, 0),
        snapshotTotal: snapshot.reduce((s, c) => s + c.count, 0),
      });
    }

    // 4) roundtrip
    try {
      const re = encodeDeckCode(decoded);
      if (re === code) res.encodeOk++;
      else res.encodeMismatch.push({ code, reencoded: re });
    } catch (e) {
      res.encodeMismatch.push({ code, error: e.message });
    }
  }

  /* ---------------- 负例 ---------------- */
  const negatives = [
    ['', '空字符串'],
    ['%%', '只有魔数'],
    ['abc', '不以 %% 开头'],
    ['%%99|', '未知阵营码'],
    ['%%5Z|zzzzzzzz', '未知卡牌短码 + 奇数长度'],
    ['%%55|aB', '截断的短码段（单字符）'],
    ['%%55|aBaB', '同组重复卡牌'],
  ];
  const negRes = [];
  for (const [input, label] of negatives) {
    try {
      const d = decodeDeckCode(input);
      negRes.push({ input, label, expect: 'throw', actual: `未抛错，解出 ${d.cards.length} 张` });
    } catch (e) {
      negRes.push({ input, label, expect: 'throw', actual: `抛错 ✓ ${e.message.slice(0, 60)}` });
    }
  }
  const negPass = negRes.filter((r) => r.actual.startsWith('抛错')).length;

  /* ---------------- 报告 ---------------- */
  const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(2)}%` : 'n/a');
  const line = (label, ok, total) => console.log(`${label.padEnd(26)} ${String(ok).padStart(6)} / ${String(total).padEnd(6)} ${pct(ok, total)}`);
  console.log('— 正向指标 —');
  line('解码成功', res.decodeOk, res.withCode);
  line('阵营一致', res.factionOk, res.withCode);
  line('卡牌多重集一致', res.cardsOk, res.withCode);
  line('roundtrip 逐字符一致', res.encodeOk, res.withCode);
  console.log(`\n— 负例（应抛错）—  ${negPass}/${negRes.length} ${pct(negPass, negRes.length)}`);
  for (const r of negRes) if (!r.actual.startsWith('抛错')) console.log(`  ✗ ${JSON.stringify(r.input)} (${r.label}) → ${r.actual}`);

  const problems = res.decodeFailed.length + res.factionMismatch.length + res.cardsMismatch.length + res.encodeMismatch.length;
  if (problems) {
    console.log('\n— 失败明细 —');
    if (res.decodeFailed.length) {
      console.log(`解码失败 ${res.decodeFailed.length} 例：`);
      for (const f of res.decodeFailed.slice(0, opt.verbose ? 30 : 5)) console.log(`  ${f.code.slice(0, 60)} → ${f.error}`);
    }
    if (res.factionMismatch.length) {
      console.log(`阵营不一致 ${res.factionMismatch.length} 例：`);
      for (const f of res.factionMismatch.slice(0, opt.verbose ? 30 : 5)) console.log(`  ${f.code.slice(0, 60)} api=${JSON.stringify(f.api)} got=${JSON.stringify(f.got)}`);
    }
    if (res.cardsMismatch.length) {
      console.log(`卡牌不一致 ${res.cardsMismatch.length} 例（前 3，展示是否只是顺序/分组差异）：`);
      for (const f of res.cardsMismatch.slice(0, 3)) {
        console.log(`  ${f.code.slice(0, 70)}`);
        console.log(`    decoded (${f.decodedTotal}): ${f.decodedCount.slice(0, 220)}`);
        console.log(`    snapshot(${f.snapshotTotal}): ${f.snapshotCount.slice(0, 220)}`);
      }
    }
    if (res.encodeMismatch.length) {
      console.log(`roundtrip 不一致 ${res.encodeMismatch.length} 例：`);
      for (const f of res.encodeMismatch.slice(0, opt.verbose ? 30 : 5)) console.log(`  ${JSON.stringify(f).slice(0, 200)}`);
    }
  } else {
    console.log('\n✓ 全部通过：0 失败');
  }

  // 分组尾部空组统计（验证 "尾部空组省略" 假设）
  const groupCounts = new Map();
  for (const deck of sample) {
    const code = deck.deck_code;
    if (!code) continue;
    const body = code.slice(2).split('|')[1] ?? '';
    const n = body ? body.split(';').length : 0;
    groupCounts.set(n, (groupCounts.get(n) ?? 0) + 1);
  }
  console.log(`\n— 分组数分布（"|" 之后按 ';' 切分的组数）—`);
  console.log('  ' + [...groupCounts.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}组:${c}`).join('  '));

  const summary = {
    testedAt: new Date().toISOString(),
    decksFile: opt.decks,
    totalDecks: res.total,
    withCode: res.withCode,
    decodeOk: res.decodeOk,
    factionOk: res.factionOk,
    cardsOk: res.cardsOk,
    encodeRoundtripOk: res.encodeOk,
    negativeCasesOk: negPass,
    negativeCasesTotal: negRes.length,
    factionCodeMap: FACTION_CODE,
    groupCountDistribution: Object.fromEntries([...groupCounts.entries()].sort((a, b) => a[0] - b[0])),
    failures: {
      decode: res.decodeFailed.slice(0, 50),
      faction: res.factionMismatch.slice(0, 50),
      cards: res.cardsMismatch.slice(0, 50).map((f) => ({ ...f, decodedCount: f.decodedCount.slice(0, 400), snapshotCount: f.snapshotCount.slice(0, 400) })),
      encode: res.encodeMismatch.slice(0, 50),
    },
  };
  if (opt.dump) {
    await mkdir(dirname(resolve(ROOT, opt.dump)), { recursive: true });
    await writeFile(resolve(ROOT, opt.dump), JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\n报告已写入 ${opt.dump}`);
  }

  const allGood = res.decodeOk === res.withCode && res.factionOk === res.withCode && res.cardsOk === res.withCode && res.encodeOk === res.withCode && negPass === negRes.length;
  process.exitCode = allGood ? 0 : 1;
}

main().catch((e) => {
  console.error('[test-deckcode] 失败:', e);
  process.exit(1);
});
