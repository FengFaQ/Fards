#!/usr/bin/env node
/**
 * verify-data.mjs — 数据完整性总检查（CI / 提交前跑）
 * ------------------------------------------------------------------
 * 检查项：
 *   A. public/data/cards.json      张数（期望 1646）、card_id 唯一、import_id 唯一、
 *                                  关键字段齐全、字段类型正确、阵营/类型/稀有度白名单
 *   B. public/data/meta.json       与 cards.json 一致（uniqueCount / stats 对得上）
 *   C. public/data/images-manifest.json + public/cards/  卡图覆盖率、缺失清单（不致命）
 *   D. public/data/cardbacks.json  条数 + 本地文件存在性
 *   E. deck_code                  用 src/data/deckcode.ts（转译后）对 _work/decks.json
 *                                  做 decode + roundtrip，统计通过率
 *   F. public/fonts/               字体文件存在性
 *   G. featured-decks.json         结构校验（schema 字段齐全）
 *
 * 退出码：0 = 全绿；1 = 有致命问题（A/B/D 失败或 codec 通过率 < 阈值）
 * 用法：node scripts/verify-data.mjs [--json=_work/verify-report.json] [--deck-sample=500]
 */

import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const o = { json: '_work/verify-report.json', deckSample: 0, expectCards: 1646 };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'json') o.json = v;
    else if (k === 'deck-sample') o.deckSample = Number(v);
    else if (k === 'expect-cards') o.expectCards = Number(v);
  }
  return o;
}
const opt = parseArgs(process.argv);

/* ------------------------------------------------------------------ 小工具 */

const failures = [];
const warnings = [];
const sections = [];
const ok = (label, detail = '') => {
  sections.push({ label, status: 'ok', detail });
  console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
};
const bad = (label, detail) => {
  failures.push({ label, detail });
  sections.push({ label, status: 'fail', detail });
  console.log(`  ✗ ${label}  ${detail}`);
};
const warn = (label, detail) => {
  warnings.push({ label, detail });
  sections.push({ label, status: 'warn', detail });
  console.log(`  ! ${label}  ${detail}`);
};
const head = (title) => console.log(`\n${title}`);

async function readJSON(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}
function fileSize(path) {
  try {
    return require('node:fs').statSync(resolve(ROOT, path)).size;
  } catch {
    return 0;
  }
}
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------ A/B 卡牌 */

const CARD_REQUIRED_STR = ['cardId', 'importId', 'nameZh', 'nameEn', 'faction', 'type', 'rarity', 'set', 'pool', 'imageLocal', 'imageRemote'];
const CARD_REQUIRED_NUM = ['kredits', 'operationCost', 'attack', 'defense'];
const FACTIONS = new Set(['Germany', 'USA', 'Britain', 'Japan', 'Soviet', 'France', 'Italy', 'Finland', 'Poland', 'Anzac', 'Neutral']);
const RARITIES = new Set(['Standard', 'Limited', 'Special', 'Elite']);
const TYPES = new Set(['infantry', 'tank', 'artillery', 'fighter', 'bomber', 'destroyer', 'battleship', 'order', 'countermeasure']);
const POOLS = new Set(['active', 'reserve', 'derived']);

let cards = [];
let meta = null;

async function checkCards() {
  head('A. public/data/cards.json');
  try {
    cards = await readJSON('public/data/cards.json');
  } catch (e) {
    bad('cards.json 可读', e.message);
    return;
  }
  if (!Array.isArray(cards)) {
    bad('cards.json 是数组', `实际是 ${typeof cards}`);
    return;
  }
  ok('cards.json 可读', `${cards.length} 张，${(fileSize('public/data/cards.json') / 1024).toFixed(1)}KB`);

  if (cards.length !== opt.expectCards) bad('卡牌总数', `期望 ${opt.expectCards}，实际 ${cards.length}`);
  else ok('卡牌总数 = 1646');

  const ids = new Set();
  const importIds = new Set();
  const dupIds = [];
  const dupImports = [];
  const missingFields = [];
  const typeErrors = [];
  const badFactions = [];
  const badTypes = [];
  const badRarities = [];
  const badPools = [];
  const keywordIssues = [];

  for (const card of cards) {
    if (ids.has(card.cardId)) dupIds.push(card.cardId);
    ids.add(card.cardId);
    if (importIds.has(card.importId)) dupImports.push(card.importId);
    importIds.add(card.importId);

    const missing = [...CARD_REQUIRED_STR, ...CARD_REQUIRED_NUM].filter(
      (k) => card[k] === undefined || card[k] === null || card[k] === ''
    );
    if (missing.length) missingFields.push({ cardId: card.cardId, missing });
    for (const k of CARD_REQUIRED_NUM) {
      if (typeof card[k] !== 'number') typeErrors.push(`${card.cardId}.${k}=${JSON.stringify(card[k])}`);
    }
    if (!Array.isArray(card.attributes)) typeErrors.push(`${card.cardId}.attributes 非数组`);
    if (!Array.isArray(card.keywordsNormalized)) typeErrors.push(`${card.cardId}.keywordsNormalized 非数组`);
    if (!FACTIONS.has(card.faction)) badFactions.push(`${card.cardId}:${card.faction}`);
    if (!TYPES.has(card.type)) badTypes.push(`${card.cardId}:${card.type}`);
    if (!RARITIES.has(card.rarity)) badRarities.push(`${card.cardId}:${card.rarity}`);
    if (!POOLS.has(card.pool)) badPools.push(`${card.cardId}:${card.pool}`);
    if (!/^\/cards\/[^/]+\.webp$/.test(String(card.imageLocal))) keywordIssues.push(`${card.cardId}.imageLocal=${card.imageLocal}`);
    if (card.keywordsNormalized?.some((k) => typeof k !== 'string' || k !== k.trim() || !k)) {
      keywordIssues.push(`${card.cardId}.keywordsNormalized 含非法项`);
    }
  }

  dupIds.length ? bad('card_id 唯一', `重复 ${dupIds.length}：${dupIds.slice(0, 5).join(',')}`) : ok('card_id 唯一');
  dupImports.length ? bad('import_id 唯一', `重复 ${dupImports.length}`) : ok('import_id 唯一');
  missingFields.length
    ? bad('关键字段齐全', `${missingFields.length} 张缺字段，例：${JSON.stringify(missingFields[0])}`)
    : ok('关键字段齐全', `${CARD_REQUIRED_STR.length + CARD_REQUIRED_NUM.length} 个必填字段`);
  typeErrors.length ? bad('字段类型', `${typeErrors.length} 处异常，例：${typeErrors[0]}`) : ok('字段类型正确');
  badFactions.length ? bad('faction 取值', `${badFactions.length} 处未知：${badFactions.slice(0, 3).join(',')}`) : ok('faction 取值合法');
  badTypes.length ? bad('type 取值', `${badTypes.length} 处未知：${badTypes.slice(0, 3).join(',')}`) : ok('type 取值合法');
  badRarities.length ? bad('rarity 取值', `${badRarities.length} 处未知`) : ok('rarity 取值合法');
  badPools.length ? bad('pool 取值', `${badPools.length} 处未知`) : ok('pool 取值合法');
  keywordIssues.length ? warn('imageLocal / keywords 格式', `${keywordIssues.length} 处异常，例：${keywordIssues[0]}`) : ok('imageLocal / keywords 格式');

  const importLens = cards.reduce((m, c) => {
    const n = String(c.importId).length;
    m[n] = (m[n] ?? 0) + 1;
    return m;
  }, {});
  if (importLens['2'] !== cards.length) warn('import_id 长度', `非全 2 位：${JSON.stringify(importLens)}（retribution_j 为 1 位特例）`);
  else ok('import_id 均为 2 位');
}

async function checkMeta() {
  head('B. public/data/meta.json');
  try {
    meta = await readJSON('public/data/meta.json');
  } catch (e) {
    bad('meta.json 可读', e.message);
    return;
  }
  ok('meta.json 可读', `${meta.fetchedAt}`);
  if (meta.uniqueCount === cards.length) ok('meta.uniqueCount 与 cards.json 一致', `${meta.uniqueCount}`);
  else bad('meta.uniqueCount', `meta=${meta.uniqueCount} cards=${cards.length}`);
  if (meta.apiTotal === cards.length) ok('meta.apiTotal 与 cards.json 一致');
  else warn('meta.apiTotal', `api=${meta.apiTotal} cards=${cards.length}`);

  // 统计对账
  const actual = { faction: {}, type: {}, rarity: {}, set: {}, pool: {} };
  for (const card of cards) {
    actual.faction[card.faction] = (actual.faction[card.faction] ?? 0) + 1;
    actual.type[card.type] = (actual.type[card.type] ?? 0) + 1;
    actual.rarity[card.rarity] = (actual.rarity[card.rarity] ?? 0) + 1;
    actual.set[card.set] = (actual.set[card.set] ?? 0) + 1;
    actual.pool[card.pool] = (actual.pool[card.pool] ?? 0) + 1;
  }
  let mismatch = 0;
  const mismatchDetail = [];
  for (const key of Object.keys(actual)) {
    const expect = meta.stats?.[key] ?? {};
    for (const [k, v] of Object.entries(actual[key])) {
      if (v !== expect[k]) {
        mismatch++;
        if (mismatchDetail.length < 5) mismatchDetail.push(`${key}.${k}: meta=${expect[k]} actual=${v}`);
      }
    }
  }
  mismatch ? bad('meta.stats 与实测统计一致', `${mismatch} 处不一致：${mismatchDetail.join('; ')}`) : ok('meta.stats 与实测统计一致', '5 个维度');
}

/* ------------------------------------------------------------------ C 卡图 */

async function checkImages() {
  head('C. 卡图');
  let manifest = null;
  try {
    manifest = await readJSON('public/data/images-manifest.json');
    ok('images-manifest.json 可读', `已下载 ${manifest.count}/${manifest.total}，${(manifest.bytes / 1048576).toFixed(1)}MB`);
  } catch {
    warn('images-manifest.json', '不存在（先跑 node scripts/fetch-images.mjs）');
  }
  let files = 0;
  try {
    files = (await readdir(resolve(ROOT, 'public/cards'))).filter((f) => f.endsWith('.webp')).length;
  } catch {
    /* 目录不存在 */
  }
  const total = cards.length || 1646;
  const pct = ((files / total) * 100).toFixed(1);
  if (files >= total) ok('卡图文件齐全', `${files}/${total}`);
  else warn('卡图未齐全', `${files}/${total}（${pct}%），缺失不影响构建，运行时会回退远程`);

  if (manifest && manifest.cardIds) {
    const cardIds = new Set(cards.map((c) => c.cardId));
    const unknown = manifest.cardIds.filter((id) => !cardIds.has(id));
    unknown.length ? warn('manifest 含数据集外 cardId', `${unknown.length} 个`) : ok('manifest cardId 均在数据集内');
  }

  // 缺失清单
  try {
    const missing = await readJSON('public/data/image-missing.json');
    if (missing.cardsMissing > 0) warn('image-missing.json', `${missing.cardsMissing} 张卡图下载失败`);
    else ok('image-missing.json', '0 张失败');
  } catch {
    warn('image-missing.json', '不存在');
  }
}

/* ------------------------------------------------------------------ D 卡背 */

async function checkCardBacks() {
  head('D. 卡背');
  try {
    const payload = await readJSON('public/data/cardbacks.json');
    const data = Array.isArray(payload) ? payload : payload.data;
    ok('cardbacks.json 可读', `${data.length} 条`);
    const withFile = data.filter((d) => d.file);
    if (!withFile.length) {
      bad('卡背 file 字段', '全部缺失');
      return;
    }
    let missing = 0;
    for (const back of withFile.slice(0, 500)) {
      try {
        await stat(resolve(ROOT, 'public/cardbacks', back.file));
      } catch {
        missing++;
      }
    }
    missing ? warn('卡背本地文件', `抽样前 500 条中缺 ${missing}`) : ok('卡背本地文件', `抽样前 ${Math.min(500, withFile.length)} 条均存在`);
  } catch (e) {
    warn('cardbacks.json', `读取失败：${e.message}`);
  }
}

/* ------------------------------------------------------------------ E deck code */

async function buildDeckCodeModule() {
  const outDir = resolve(ROOT, '_work/tstable');
  await mkdir(outDir, { recursive: true });
  for (const name of ['types', 'importMap', 'deckcode']) {
    const src = await readFile(resolve(ROOT, 'src/data', `${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, isolatedModules: true },
      fileName: `${name}.ts`,
    });
    const patched = outputText.replace(/(from\s+['"])(\.\/[A-Za-z0-9_]+)(['"])/g, '$1$2.mjs$3');
    await writeFile(resolve(outDir, `${name}.mjs`), patched, 'utf8');
  }
  return import(new URL(`file://${resolve(outDir, 'deckcode.mjs').replace(/\\/g, '/')}`).href);
}

async function checkDeckCode() {
  head('E. deck_code 编解码');
  let mod;
  try {
    mod = await buildDeckCodeModule();
  } catch (e) {
    bad('deckcode.ts 转译', e.message);
    return { passRate: null };
  }
  const { decodeDeckCode, encodeDeckCode, FACTION_CODE } = mod;
  ok('deckcode.ts 转译并加载', `阵营码 ${Object.keys(FACTION_CODE).length} 个`);

  // 自检：构造一个卡组往返（按多重集比较，因为编码会按份数分组重排）
  try {
    const sampleCards = cards.slice(0, 5).map((c, i) => ({ cardId: c.cardId, count: (i % 4) + 1 }));
    const code = encodeDeckCode({ mainFaction: 'USA', allyFaction: 'Germany', cards: sampleCards });
    const back = decodeDeckCode(code);
    const key = (list) => list.map((c) => `${c.cardId}:${c.count}`).sort().join(',');
    const same =
      back.mainFaction === 'USA' &&
      back.allyFaction === 'Germany' &&
      key(back.cards) === key(sampleCards);
    same ? ok('构造卡组编码/解码往返', code.slice(0, 44) + '…') : bad('构造卡组往返', `不一致：${key(back.cards)} vs ${key(sampleCards)}`);
  } catch (e) {
    bad('构造卡组往返', e.message);
  }

  // 真实卡组
  let decks = null;
  try {
    decks = await readJSON('_work/decks.json');
  } catch {
    warn('_work/decks.json', '不存在，跳过真实卡组 roundtrip（先跑 node scripts/fetch-decks.mjs）');
    return { passRate: null };
  }
  const sample = opt.deckSample > 0 ? decks.slice(0, opt.deckSample) : decks;
  let total = 0; // 有 deck_code 的卡组
  let garbage = 0; // 码本身不是 deck code（如 "test123"）
  let decodeOk = 0;
  let sane = 0; // 快照合法（39 张、副本 ≤4）→ 可用于卡牌/roundtrip 对账
  let cardsOk = 0;
  let factionOk = 0;
  let exactOk = 0; // encode(decode(x)) === x
  let semanticOk = 0; // decode(encode(decode(x))) 与 decode(x) 等价（忽略历史单字符头写法）
  let legacyHeader = 0; // 单字符阵营头的历史写法
  const examples = [];
  for (const deck of sample) {
    const code = deck.deck_code;
    if (!code) continue;
    total++;
    if (!code.startsWith('%%')) {
      garbage++;
      continue;
    }
    const snap = deck.cards_snapshot ?? [];
    const totalCards = snap.reduce((s, c) => s + (c.count ?? 0), 0);
    const maxCount = Math.max(0, ...snap.map((c) => c.count ?? 0));
    const isSane = totalCards === 39 && maxCount <= 4;
    if (isSane) sane++;
    let decoded;
    try {
      decoded = decodeDeckCode(code);
      decodeOk++;
    } catch (e) {
      if (examples.length < 5) examples.push({ code: code.slice(0, 60), error: e.message });
      continue;
    }
    if (decoded.mainFaction === deck.main_faction && (decoded.allyFaction ?? null) === (deck.ally_faction ?? null)) factionOk++;
    if (isSane) {
      const snapshot = snap.map((c) => `${c.card_id}:${c.count}`).sort().join(',');
      const got = decoded.cards.map((c) => `${c.cardId}:${c.count}`).sort().join(',');
      if (snapshot === got) cardsOk++;
    }
    try {
      const re = encodeDeckCode(decoded);
      if (re === code) exactOk++;
      else {
        // 历史写法：%%2|… ↔ 规范写法 %%22|…
        if (/^%%([0-9a-zA-Z])\|/.test(code) && re.length === code.length + 1) legacyHeader++;
        const again = decodeDeckCode(re);
        const k = (list) => list.map((c) => `${c.cardId}:${c.count}`).sort().join(',');
        if (again.mainFaction === decoded.mainFaction && (again.allyFaction ?? null) === (decoded.allyFaction ?? null) && k(again.cards) === k(decoded.cards)) {
          semanticOk++;
        }
      }
    } catch (e) {
      if (examples.length < 5) examples.push({ code: code.slice(0, 60), error: e.message });
    }
  }
  const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(2)}%` : 'n/a');
  total ? ok('真实卡组样本', `${total} 个（其中快照合法 ${sane} 个；非 deck code 垃圾数据 ${garbage} 个）`) : warn('真实卡组样本', '0 个');

  // 广场脏数据的容差：允许 1% 解码失败（实测 0.05%）
  if (decodeOk / Math.max(total, 1) >= 0.99) {
    ok('解码成功率', `${decodeOk}/${total} ${pct(decodeOk, total)}${garbage ? `（含 ${garbage} 个垃圾数据，已计入失败）` : ''}`);
  } else bad('解码成功率', `${decodeOk}/${total} ${pct(decodeOk, total)}`);
  if (factionOk / Math.max(decodeOk, 1) >= 0.99) ok('阵营一致率', `${factionOk}/${decodeOk} ${pct(factionOk, decodeOk)}`);
  else bad('阵营一致率', `${factionOk}/${decodeOk} ${pct(factionOk, decodeOk)}`);
  // 卡牌对账只统计"快照合法"的卡组（广场里有 32 个坏码/恶搞卡组，其 cards_snapshot 与 code 本身矛盾）
  if (cardsOk / Math.max(sane, 1) >= 0.98) {
    ok('卡牌多重集一致率（快照合法样本）', `${cardsOk}/${sane} ${pct(cardsOk, sane)}`);
  } else bad('卡牌多重集一致率', `${cardsOk}/${sane} ${pct(cardsOk, sane)}`);
  if (exactOk / Math.max(decodeOk, 1) >= 0.99) {
    ok(`roundtrip 逐字符一致率`, `${exactOk}/${decodeOk} ${pct(exactOk, decodeOk)}${legacyHeader ? `（另有 ${legacyHeader} 例历史单字符头写法）` : ''}`);
  } else bad('roundtrip 逐字符一致率', `${exactOk}/${decodeOk} ${pct(exactOk, decodeOk)}`);
  if (semanticOk + exactOk === decodeOk) ok('语义一致性（两种头部写法都等价）', `${decodeOk}/${decodeOk}`);
  else bad('语义一致性', `${semanticOk + exactOk}/${decodeOk}`);
  if (examples.length) console.log(`    失败例：${JSON.stringify(examples.slice(0, 3))}`);
  return { passRate: exactOk / Math.max(decodeOk, 1), total, sane, garbage, exactOk, decodeOk, cardsOk, factionOk, legacyHeader };
}

/* ------------------------------------------------------------------ F 字体 */

async function checkFonts() {
  head('F. 字体');
  const dir = resolve(ROOT, 'public/fonts');
  if (!existsSync(dir)) return warn('public/fonts', '目录不存在');
  const files = await readdir(dir);
  const fonts = files.filter((f) => /\.(woff2|ttf|otf)$/i.test(f));
  if (fonts.length) ok('字体文件', `${fonts.length} 个：${fonts.join(', ')}`);
  else warn('字体文件', '未找到 woff2/ttf/otf');
  const license = files.find((f) => /OFL|LICENSE|README/i.test(f));
  license ? ok('字体许可说明', license) : warn('字体许可说明', '缺 OFL/LICENSE/README');
}

/* ------------------------------------------------------------------ G 热门卡组 */

async function checkFeatured() {
  head('G. featured-decks.json');
  try {
    const list = await readJSON('public/data/featured-decks.json');
    if (!Array.isArray(list)) return bad('featured-decks.json', '不是数组');
    if (list.length < 12) warn('热门卡组条数', `${list.length}（期望 12~24）`);
    else ok('热门卡组条数', `${list.length}`);
    const required = ['slug', 'name', 'mainFaction', 'deckCode', 'cards'];
    const missing = [];
    let cardsValid = 0;
    for (const deck of list) {
      const lack = required.filter((k) => deck[k] === undefined || deck[k] === null || deck[k] === '');
      if (lack.length) missing.push({ slug: deck.slug, lack });
      if (Array.isArray(deck.cards) && deck.cards.length && deck.cards.every((c) => c.cardId && c.count > 0)) cardsValid++;
    }
    missing.length ? bad('热门卡组字段', `${missing.length} 条缺字段：${JSON.stringify(missing[0])}`) : ok('热门卡组字段齐全');
    cardsValid === list.length ? ok('热门卡组 cards 合法') : bad('热门卡组 cards', `${cardsValid}/${list.length}`);
  } catch (e) {
    warn('featured-decks.json', `读取失败：${e.message}`);
  }
}

/* ------------------------------------------------------------------ main */

async function main() {
  console.log('='.repeat(72));
  console.log('Fards 数据完整性检查');
  console.log(`根目录：${ROOT}`);
  console.log('='.repeat(72));
  await checkCards();
  await checkMeta();
  await checkImages();
  await checkCardBacks();
  const deckcode = await checkDeckCode();
  await checkFonts();
  await checkFeatured();

  // 阈值：roundtrip 逐字符 ≥99%（余下 0.5% 是广场里历史单字符头写法，语义仍正确）
  const fatal = failures.length > 0 || (deckcode.passRate !== null && deckcode.passRate < 0.99);
  console.log('\n' + '='.repeat(72));
  console.log(`结论：${failures.length ? `${failures.length} 个致命问题` : '无致命问题'}；警告 ${warnings.length} 个`);
  if (failures.length) for (const f of failures) console.log(`  ✗ ${f.label}: ${f.detail}`);
  if (deckcode.passRate !== null) console.log(`deckcode roundtrip 通过率：${(deckcode.passRate * 100).toFixed(2)}%`);
  console.log('='.repeat(72));

  const report = {
    generatedAt: new Date().toISOString(),
    cardsCount: cards.length,
    failures,
    warnings,
    deckcode,
    sections,
  };
  await mkdir(dirname(resolve(ROOT, opt.json)), { recursive: true });
  await writeFile(resolve(ROOT, opt.json), JSON.stringify(report, null, 2), 'utf8');
  console.log(`报告：${opt.json}`);
  process.exitCode = fatal ? 1 : 0;
}

main().catch((e) => {
  console.error('[verify-data] 失败:', e);
  process.exit(1);
});
