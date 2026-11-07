#!/usr/bin/env node
/**
 * analyze-decks.mjs — 用公开卡组做统计，为 docs/DECK_RULES.md 提供证据
 *
 * 统计项（每个都输出分布 + 边界值，文档里直接引用）：
 *   T1 卡组总张数分布              → 标准卡组到底 39 还是 40？
 *   T2 单卡副本数分布（1/2/3/4）    → 同名卡上限
 *   T3 精英卡：每卡副本数 & 每卡组张数 → 精英上限
 *   T4 盟军卡张数分布              → 盟军上限（12？）
 *   T5 主阵营卡张数分布            → 主阵营最少张数
 *   T6 阵营组合（主/盟军对）分布    → 是否允许同阵营、无盟军
 *   T7 费用曲线 & 类型分布         → 参考数据
 *   T8 阵营码表交叉验证            → %% 头部两位 vs API main/ally
 *   T9 预备池卡牌使用情况          → 公开卡组是否使用 reserve 池
 *   T10 分组数与码结构             → ';' 分组语义验证
 *
 * 用法：node scripts/analyze-decks.mjs [--decks=_work/decks.json] [--json=_work/deck-stats.json]
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const o = { decks: '_work/decks.json', cards: 'public/data/cards.json', json: '_work/deck-stats.json' };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'decks') o.decks = v;
    else if (k === 'cards') o.cards = v;
    else if (k === 'json') o.json = v;
  }
  return o;
}
const opt = parseArgs(process.argv);

const cards = JSON.parse(await readFile(resolve(ROOT, opt.cards), 'utf8'));
const byId = new Map(cards.map((c) => [c.cardId, c]));
const decks = JSON.parse(await readFile(resolve(ROOT, opt.decks), 'utf8'));

/* ------------------------------------------------------------------ 工具 */

const dist = (values) => {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => a[0] - b[0]));
};
const quantiles = (sorted, qs = [0, 0.5, 0.9, 0.95, 0.99, 1]) => {
  const out = {};
  for (const q of qs) out[`p${Math.round(q * 100)}`] = sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  return out;
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (n, d) => `${((n / d) * 100).toFixed(2)}%`;

const CODE_TO_FACTION = {
  1: 'Germany', 2: 'Britain', 3: 'Japan', 4: 'Soviet', 5: 'USA', 6: 'France',
  7: 'Italy', 8: 'Poland', 9: 'Finland', a: 'Anzac', 0: 'Neutral',
};

/* ------------------------------------------------------------------ 逐卡组解析 */

const parsed = [];
for (const deck of decks) {
  const code = deck.deck_code;
  if (!code) continue;
  const snapshot = (deck.cards_snapshot ?? []).map((c) => ({ cardId: c.card_id, count: c.count }));
  const total = snapshot.reduce((s, c) => s + c.count, 0);
  const main = deck.main_faction;
  const ally = deck.ally_faction;

  // %% 头部
  const body = code.slice(2);
  const sep = body.indexOf('|');
  const header = sep >= 0 ? body.slice(0, sep) : body.slice(0, 2);
  const mainDigit = header[0];
  const allyDigit = header.length > 1 ? header[1] : header[0];
  const codeMain = CODE_TO_FACTION[mainDigit] ?? `?${mainDigit}`;
  const codeAlly = CODE_TO_FACTION[allyDigit] ?? `?${allyDigit}`;

  // 分组结构
  const cardPart = sep >= 0 ? body.slice(sep + 1) : '';
  const groups = cardPart ? cardPart.split(';') : [];
  const groupCounts = groups.map((g) => (g ? g.length / 2 : 0));

  // 阵营归属（用卡表 hostFactions 判）
  let mainCards = 0;
  let allyCards = 0;
  let eliteCards = 0;
  let eliteDistinct = 0;
  let units = 0;
  let orders = 0;
  let reservedCards = 0;
  let missing = 0;
  const byKredits = new Map();
  const byType = new Map();
  const copyDist = new Map();
  const factionTally = new Map();
  for (const item of snapshot) {
    const card = byId.get(item.cardId);
    copyDist.set(item.count, (copyDist.get(item.count) ?? 0) + 1);
    if (!card) {
      missing++;
      continue;
    }
    factionTally.set(card.faction, (factionTally.get(card.faction) ?? 0) + item.count);
    const own = card.faction;
    const hosts = card.hostFactions ?? [];
    const usableMain = own === main || hosts.includes(main) || own === 'Neutral';
    const usableAlly = ally ? own === ally || hosts.includes(ally) : false;
    if (usableMain) mainCards += item.count;
    else if (usableAlly) allyCards += item.count;
    if (card.rarity === 'Elite') {
      eliteCards += item.count;
      eliteDistinct++;
    }
    if (['infantry', 'tank', 'artillery', 'fighter', 'bomber', 'destroyer', 'battleship'].includes(card.type)) units += item.count;
    else orders += item.count;
    if (card.isReserved) reservedCards += item.count;
    byKredits.set(card.kredits, (byKredits.get(card.kredits) ?? 0) + item.count);
    byType.set(card.type, (byType.get(card.type) ?? 0) + item.count);
  }

  parsed.push({
    id: deck.id,
    name: deck.name,
    code,
    total,
    unique: snapshot.length,
    main,
    ally,
    codeMain,
    codeAlly,
    headerOk: codeMain === main && (codeAlly === (ally ?? main)),
    mainCards,
    allyCards,
    eliteCards,
    eliteDistinct,
    units,
    orders,
    reservedCards,
    missing,
    copyDist: Object.fromEntries(copyDist),
    groupCount: groups.length,
    groupCounts,
    maxCopies: Math.max(...snapshot.map((c) => c.count), 0),
    maxGroupCards: Math.max(...groupCounts, 0),
  });
}

const N = parsed.length;
const sum = (fn) => parsed.reduce((s, p) => s + fn(p), 0);

/* ------------------------------------------------------------------ T1 张数 */

const totals = parsed.map((p) => p.total);
const totalDist = dist(totals);
const totalSorted = [...totals].sort((a, b) => a - b);

/**
 * "干净样本"：排除异常卡组（快照张数 != 39，或单卡副本 > 4，或存在数据集外的卡）。
 * 公开卡组广场里有少量脏数据（例如 39 张同一张卡的 meme/坏码卡组），
 * 规则推断必须基于干净样本，否则上界会被污染。
 */
const isClean = (p) => p.total === 39 && p.maxCopies <= 4 && p.missing === 0 && p.groupCount === 4;
const clean = parsed.filter(isClean);
const dirty = parsed.filter((p) => !isClean(p));

/* ------------------------------------------------------------------ T2 副本数 */

const copyDistAll = {};
for (const p of clean) for (const [k, v] of Object.entries(p.copyDist)) copyDistAll[k] = (copyDistAll[k] ?? 0) + v;
// 同名卡在单个卡组中的张数分布（统计单位 = "卡组内的一张卡"）
const perCardCounts = new Map();
const perCardCountsAll = new Map();
for (const deck of decks) {
  if (!deck.deck_code) continue;
  const snapshot = deck.cards_snapshot ?? [];
  const total = snapshot.reduce((s, c) => s + (c.count ?? 0), 0);
  const dirtyDeck = total !== 39 || snapshot.some((c) => (c.count ?? 0) > 4);
  for (const item of snapshot) {
    perCardCountsAll.set(item.count, (perCardCountsAll.get(item.count) ?? 0) + 1);
    if (!dirtyDeck) perCardCounts.set(item.count, (perCardCounts.get(item.count) ?? 0) + 1);
  }
}
const maxCopyPerDeck = Math.max(...clean.map((p) => p.maxCopies), 0);
const maxCopyAll = Math.max(...parsed.map((p) => p.maxCopies), 0);

/* ------------------------------------------------------------------ T3 精英 */

const eliteDist = dist(clean.map((p) => p.eliteCards));
const eliteDistinctDist = dist(clean.map((p) => p.eliteDistinct));
// 精英单卡副本数（是否有 >1）
let eliteCopyViolations = 0;
const eliteCopyDist = {};
for (const deck of decks) {
  if (!deck.deck_code) continue;
  const total = (deck.cards_snapshot ?? []).reduce((s, c) => s + (c.count ?? 0), 0);
  const dirtyDeck = total !== 39 || (deck.cards_snapshot ?? []).some((c) => (c.count ?? 0) > 4);
  for (const item of deck.cards_snapshot ?? []) {
    const card = byId.get(item.card_id);
    if (card?.rarity === 'Elite') {
      if (dirtyDeck) continue;
      eliteCopyDist[item.count] = (eliteCopyDist[item.count] ?? 0) + 1;
      if (item.count > 1) eliteCopyViolations++;
    }
  }
}

/* ------------------------------------------------------------------ T4/T5 阵营 */

const allyCardsArr = clean.map((p) => p.allyCards);
const mainCardsArr = clean.map((p) => p.mainCards);
const allySorted = [...allyCardsArr].sort((a, b) => a - b);
const mainSorted = [...mainCardsArr].sort((a, b) => a - b);
const noAlly = clean.filter((p) => !p.ally).length;
const sameFaction = clean.filter((p) => p.ally && p.ally === p.main).length;

/* ------------------------------------------------------------------ T6 组合 */

const combos = new Map();
for (const p of parsed) {
  const key = `${p.main}${p.ally ? `+${p.ally}` : ''}`;
  combos.set(key, (combos.get(key) ?? 0) + 1);
}

/* ------------------------------------------------------------------ T8 阵营码 */

const headerMismatch = parsed.filter((p) => !p.headerOk);
const codeMainDist = dist(parsed.map((p) => `${p.code.slice(2)[0]}=${p.codeMain}`));
const codeAllyDist = dist(parsed.map((p) => `${p.code.slice(2)[1]}=${p.codeAlly}`));

/* ------------------------------------------------------------------ T9 预备池 */

const reserveDecks = parsed.filter((p) => p.reservedCards > 0).length;
const reservedDist = dist(parsed.map((p) => p.reservedCards));

/* ------------------------------------------------------------------ T10 结构 */

const groupCountDist = dist(parsed.map((p) => p.groupCount));
const maxGroupCards = Math.max(...parsed.map((p) => p.maxGroupCards));
const missingCards = sum((p) => p.missing);
const unitsAvg = mean(parsed.map((p) => p.units));

/* ------------------------------------------------------------------ 输出 */

const report = {
  generatedAt: new Date().toISOString(),
  decksFile: opt.decks,
  decksAnalyzed: N,
  cleanSample: { count: clean.length, dirtyCount: dirty.length, dirtyExamples: dirty.slice(0, 8).map((p) => ({ id: p.id, name: p.name, total: p.total, maxCopies: p.maxCopies, missing: p.missing })) },
  T1_deckSize: { distribution: totalDist, cleanDistribution: dist(clean.map((p) => p.total)), mean: mean(clean.map((p) => p.total)), quantiles: quantiles([...clean.map((p) => p.total)].sort((a, b) => a - b)), exact39: clean.filter((p) => p.total === 39).length, exact40: clean.filter((p) => p.total === 40).length },
  T2_copies: {
    distributionClean: Object.fromEntries([...perCardCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
    distributionAll: Object.fromEntries([...perCardCountsAll.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
    maxCopyPerDeckClean: maxCopyPerDeck,
    maxCopyPerDeckAll: maxCopyAll,
    copyDistAll,
  },
  T3_elite: { perDeckEliteDistribution: eliteDist, perDeckEliteDistinctDistribution: eliteDistinctDist, eliteCopyCountDistribution: eliteCopyDist, eliteCopyViolations, decksWithZeroElite: eliteDist[0] ?? 0, meanElitePerDeck: mean(clean.map((p) => p.eliteCards)) },
  T4_ally: { distribution: dist(allyCardsArr), max: allySorted[allySorted.length - 1], p95: quantiles(allySorted).p95, mean: mean(allyCardsArr), decksAtMax: allyCardsArr.filter((v) => v === allySorted[allySorted.length - 1]).length },
  T5_main: { distribution: dist(mainCardsArr), min: mainSorted[0], p05: quantiles(mainSorted).p5, mean: mean(mainCardsArr) },
  T6_combos: { count: combos.size, top: [...combos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40), noAlly, sameFaction },
  T7_curve: {},
  T8_factionCode: { headerMismatches: headerMismatch.length, headerMismatchExamples: headerMismatch.slice(0, 5).map((p) => p.code), mainDigitDistribution: codeMainDist, allyDigitDistribution: codeAllyDist },
  T9_reserve: { decksWithReserved: reserveDecks, pct: pct(reserveDecks, N), distribution: reservedDist },
  T10_structure: { groupCountDistribution: groupCountDist, maxCardsInSingleGroup: maxGroupCards, uniqueCardsPerDeckMean: mean(parsed.map((p) => p.unique)), unitsMean: unitsAvg, cardsNotInDataset: missingCards, cleanUniqueMean: mean(clean.map((p) => p.unique)) },
};

// T7 费用曲线：全局平均
const kreditsAgg = new Map();
const typesAgg = new Map();
for (const deck of decks) {
  if (!deck.deck_code) continue;
  for (const item of deck.cards_snapshot ?? []) {
    const card = byId.get(item.card_id);
    if (!card) continue;
    kreditsAgg.set(card.kredits, (kreditsAgg.get(card.kredits) ?? 0) + item.count);
    typesAgg.set(card.type, (typesAgg.get(card.type) ?? 0) + item.count);
  }
}
const kreditsTotal = [...kreditsAgg.values()].reduce((s, v) => s + v, 0);
const typesTotal = [...typesAgg.values()].reduce((s, v) => s + v, 0);
report.T7_curve = {
  kredits: Object.fromEntries([...kreditsAgg.entries()].sort((a, b) => a[0] - b[0])),
  kreditsPct: Object.fromEntries([...kreditsAgg.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, pct(v, kreditsTotal)])),
  types: Object.fromEntries([...typesAgg.entries()].sort((a, b) => b[1] - a[1])),
  typesPct: Object.fromEntries([...typesAgg.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v, typesTotal)])),
  avgKredits: [...kreditsAgg.entries()].reduce((s, [k, v]) => s + k * v, 0) / kreditsTotal,
};

await mkdir(dirname(resolve(ROOT, opt.json)), { recursive: true });
await writeFile(resolve(ROOT, opt.json), JSON.stringify(report, null, 2), 'utf8');

/* ---------------- 控制台摘要 ---------------- */
const show = (label, obj) => console.log(`${label}: ${JSON.stringify(obj)}`);
console.log('='.repeat(72));
console.log(`公开卡组统计（样本 ${N} 个，干净样本 ${clean.length} 个 / 脏数据 ${dirty.length} 个，来源 ${opt.decks}）`);
console.log('='.repeat(72));
if (dirty.length) console.log(`脏数据示例：${JSON.stringify(report.cleanSample.dirtyExamples.slice(0, 3))}`);
show('T1 卡组总张数分布（全部）', report.T1_deckSize.distribution);
show('   ⌐ 干净样本 39 张占比', `${report.T1_deckSize.exact39}/${clean.length} ${pct(report.T1_deckSize.exact39, clean.length)}；40 张 ${report.T1_deckSize.exact40} 个`);
show('T2 同名卡张数分布（干净）', report.T2_copies.distributionClean);
show('   ⌐ 干净样本单卡组内最大副本数', report.T2_copies.maxCopyPerDeckClean);
show('T3 每卡组精英张数分布（干净）', report.T3_elite.perDeckEliteDistribution);
show('   ⌐ 精英单卡副本数分布（干净）', report.T3_elite.eliteCopyCountDistribution);
show('   ⌐ 无精英卡组 / 平均精英张数', `${report.T3_elite.decksWithZeroElite} / ${report.T3_elite.meanElitePerDeck.toFixed(2)}`);
show('T4 盟军张数分布（干净）', report.T4_ally.distribution);
show('   ⌐ 盟军最大 / p95 / 均值 / 恰好最大值的卡组数', `${report.T4_ally.max} / ${report.T4_ally.p95} / ${report.T4_ally.mean.toFixed(2)} / ${report.T4_ally.decksAtMax}`);
show('T5 主阵营张数分布（干净）', report.T5_main.distribution);
show('   ⌐ 主阵营最小 / p05 / 均值', `${report.T5_main.min} / ${report.T5_main.p05} / ${report.T5_main.mean.toFixed(2)}`);
show('T6 阵营组合数', `${report.T6_combos.count} 种；无盟军 ${report.T6_combos.noAlly}；同阵营 ${report.T6_combos.sameFaction}`);
show('T7 费用曲线', report.T7_curve.kreditsPct);
show('   ⌐ 平均费用', report.T7_curve.avgKredits.toFixed(2));
show('   ⌐ 类型分布', report.T7_curve.types);
show('T8 阵营码头部不匹配', `${report.T8_factionCode.headerMismatches} 例；主阵营码分布 ${JSON.stringify(report.T8_factionCode.mainDigitDistribution)}`);
show('   ⌐ 盟军码分布', report.T8_factionCode.allyDigitDistribution);
show('T9 使用预备池卡牌的卡组', `${report.T9_reserve.decksWithReserved}/${N} ${report.T9_reserve.pct}`);
show('T10 分组数分布', report.T10_structure.groupCountDistribution);
show('   ⌐ 单组最大卡数 / 干净样本唯一卡数均值', `${report.T10_structure.maxCardsInSingleGroup} / ${report.T10_structure.cleanUniqueMean.toFixed(2)}`);
show('   ⌐ 数据集中不存在的卡（副本数）', report.T10_structure.cardsNotInDataset);
console.log(`\n完整 JSON：${opt.json}`);
