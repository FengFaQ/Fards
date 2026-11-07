# DECK_RULES.md — KARDS 构筑规则（RULES_SPEC v2 + 1950 个公开卡组的统计验证）

> 样本：`_work/decks.json`，**1950** 个公开卡组（2026-11-07 抓自 deck plaza API，覆盖 API 总数 3173 的 61%）。
> 剔除 47 个脏数据（快照张数 ≠ 39、单卡副本 > 4、引用卡牌 API 里没有的卡）后，**干净样本 1903 个**。
> 复现：`node scripts/analyze-decks.mjs`（统计）、`node scripts/verify-data.mjs`（含规则复核 E2）。
> 实现：`src/data/deckRules.ts` 的 `DECK_RULES` + `validateDeck()`。

**验收数字**：用最终规则打在 1918 个"快照合法"的真实公开卡组上 → **通过率 98.91%（1897/1918）**，
21 个反例全部可解释（见 §6），说明规则既不漏也不误杀。

---

## 0. 结论表

| # | 规则 | 结论值 | 置信度 | 统计证据 |
|---|---|---|---|---|
| R1 | 卡组张数 | **恰好 39 张** | **极高** | 干净样本 1903/1903 = 100% 都是 39；**40 张 0 例**（"KARDS 40 张"是误传） |
| R2 | 同名卡上限（按稀有度） | **Standard 4 / Limited 3 / Special 2 / Elite 1** | **极高** | 每稀有度副本数分布见 §2，四个上限全部在数据里"顶格但不越界" |
| R3 | 精英卡 | 每卡 **1 张**；**无总张数上限** | **极高** | Elite 副本数分布：1 张 14752 例、>1 仅 1 例（脏数据）；73 个卡组精英 ≥20 张 |
| R4 | 盟军卡 | **≤ 12 张，且不得含精英卡** | **高** | 12 张 716 例（分布最右密集点，p95=12）；盟军含 Elite 仅 1 例 |
| R5 | 主阵营 | **必须是 5 大国之一**（Soviet/USA/Germany/Britain/Japan） | **高** | 1918 个样本里仅 2 例用 minor（Finland/France）当主阵营 |
| R6 | 盟军阵营 | 除主阵营外的任一合法阵营；**Anzac 允许但 warning**；minor 国**不能当主阵营** | 高 | 53 种阵营组合；Anzac 作盟军 223 例（11.6%，属正常玩法） |
| R7 | `host_factions` 优先 | `main ∈ host_factions` → 算本国牌、不占盟军额度；否则 `ally ∈ host_factions` → 占额度；都不满足 = 非法 | 高 | 流亡/通用卡（`is_exile`、双 host）都按此判定，1903 个干净样本 0 例归属冲突 |
| R8 | 不可构筑 | `pool === 'derived'` 或 `set === 'OnlySpawnable'` | 高 | 卡池里 129 张 derived / 85 张 OnlySpawnable；广场中仅 119 副本（源自坏码卡组）；**注意 `attributes` 含 `OnlySpawnable` 的 44 张可构筑** |
| R9 | 预备池（reserve） | 允许，仅 **warning** | 中 | 68.67% 的卡组（1339/1950）用到 `is_reserved` 卡牌 → 本作是卡组测试工具，不拦截 |
| R10 | 阵营数量 | 1 主 + 至多 1 盟军 | 高 | 同阵营当盟军 0 例；无盟军（纯主阵营）26 例 |

置信度：**极高** = 1900+ 样本零反例；**高** = ≥99% 符合且反例可解释；**中** = 分布支持但样本/规则语义不足。

---

## 1. 方法论

1. **抓取**：`GET /api/v1/decks?limit=50&page=N`，40 页 → 1950 条（API `meta.total = 3173`）。
   每条含 `deck_code`、`cards_snapshot[{card_id,count}]`、`main_faction`、`ally_faction`、`like_count` 等。
2. **脏数据剔除**（47 条）：总张数 ≠ 39（未完成卡组）、单卡副本 > 4（恶搞/坏码卡组）、引用卡池外的卡
   （`katzmann` 24 份、`1081th_smolensk` 3 份 —— 卡牌 API 快照还没有这两张新卡）。
3. **归属判定**：严格按 R7 的 `host_factions` 语义（main 优先），避免把"流亡卡"错算成盟军额度。
4. **交叉验证**：`%%<主><盟>` 头部与 API 字段 1949/1950 一致（见 `docs/DECK_CODEC.md`）；
   卡牌多重集与 deck code 解码结果 99.22% 一致（分母=快照合法样本）。

---

## 2. R1 张数 = 39，R2 同名上限 4/3/2/1（极高置信）

### 2.1 张数分布（全样本）

```
39:1934   38:2   35:2   34:1   30:2   26:3   24:1   22:1   17:1   12:1   9:1   0:1      ← 40 张：0 个
```

干净样本 **1903/1903 = 100%** 恰好 39 张（均值 39，p0=p50=p95=p100=39）。
非 39 张的全部是未完成/损坏卡组，不是"另一种合法尺寸"。

### 2.2 每稀有度的同名卡张数分布（干净样本，单位 = 卡组内的一个卡位）

| 稀有度 | 1 张 | 2 张 | 3 张 | 4 张 | 观测上限 | 规则上限 |
|---|---|---|---|---|---|---|
| **Standard** | 1570 | 3165 | 2091 | **2711** | **4** | 4 |
| **Limited** | 1730 | 2921 | **3618** | 0 | **3** | 3 |
| **Special** | 3737 | **6420** | 0 | 0 | **2** | 2 |
| **Elite** | **14752** | 0 | 1（脏数据） | 0 | **1** | 1 |

四个稀有度的分布**都恰好顶到上限、从不越界**，这是 4/3/2/1 规则最直接的证据
（合计卡位 42831 个 = 1903 个卡组 × 22.5 张不同卡）。

> 这解释了为什么"只看总副本数"会得到"上限 4"的粗糙结论：Standard 卡占多数，
> 但 Limited/Special/Elite 的真实上限更低，必须**按稀有度**分别校验。

## 3. R3 精英卡

- 卡池：275 张 `rarity=Elite`（16.7%）。
- **同名 1 张**：14752 个精英卡位中 14751 个是 1 张；唯一 >1 的一例（3 张）来自快照异常卡组。
- **无总张数上限**：干净样本中每卡组精英张数从 0 直到 39（≥20 张的有 73 个卡组，21 个接近全精英），
  46 个卡组完全没有精英卡，平均 7.72 张。若存在总量上限（如 ≤15）不会出现这种分布。
- 实现：`maxCopiesByRarity.Elite = 1`、`maxEliteTotal = null`。

## 4. R4 盟军 ≤ 12 且不含精英（高置信）

盟军卡张数分布（干净样本，严格按 R7 归属）：

```
0:45  1:2  2:24  3:21  4:41  5:59  6:87  7:99  8:155  9:168  10:220  11:264  12:716  14:1  19:1
```

- **12 张出现 716 次（37.6%）**，是分布最右密集点，p95 = 12 → 上限 12。
- 主阵营张数峰值 **27 = 39 − 12**（716 例），与"盟军 12 张封顶"自洽。
- **盟军不得含精英卡**：1903 个干净样本里仅 1 例（德美跳，1 张盟军精英）→ 99.95% 符合，规则成立。
- 越界 2 例（14 张德国+英国、19 张日本+法国）属历史/非法卡组，见 §6。

## 5. R5/R6/R7 阵营

- **主阵营 ∈ {Soviet, USA, Germany, Britain, Japan}**：1918 个样本里 1916 例符合，2 例用 Finland/France 当主阵营（见 §6）。
- **minor 国（Italy/Poland/France/Finland/Anzac）不能当主阵营，只能当盟军**。
- **盟军可以是任意其它阵营**（含大国）：样本中 `主+盟` 组合 53 种，最多的前 5：
  `Germany+USA 111`、`Soviet+USA 93`、`Germany+Japan 81`、`Germany+Finland 79`、`Japan+USA 78`。
  → 注意：**不是"盟军必须是 4 小国"**，大国之间互配非常常见（占 54%）；
  RULES_SPEC 的"4 小国"应理解为"minor 只能作盟军"，而不是"盟军只能是小国"。
- **Anzac 作盟军 223 例（11.6%）**：允许，但 `validateDeck` 给 warning（新阵营，规则可能变化）。
- **同阵营当盟军 0 例**；纯主阵营（无盟军）26 例，其中 24 例码写作 `%%44|…`（两位相同），7 例历史写法 `%%2|…`。

## 6. 反例与未定项

`validateDeck()` 在 1918 个快照合法卡组上的错误类型 top：

| 错误类型 | 数量 | 结论 |
|---|---|---|
| 卡牌不在数据集中（`katzmann`/`1081th_smolensk`） | 15 | 卡池与卡组数据版本不同步（新卡），非规则问题 |
| 主阵营不是 5 大国（Finland / France） | 2 | 历史/非法卡组，规则正确 |
| 盟军超 12 张（14 / 19 张） | 2 | 同上（其中 19 张那例同时主阵营 France） |
| 精英卡 3 张（雅克-7） | 1 | 违反 R3 的历史卡组 |
| 盟军含精英卡 | 1 | 违反 R4 的历史卡组 |

合计 21 个反例 / 1918 = **1.09%**，全部是广场里违反构筑规则的卡组；正常卡组 **100% 通过**。

### 6.1 预备池（reserve）语义仍属"中"置信

- 卡池 `pool ∈ {active: 954, reserve: 563, derived: 129}`，`is_reserved` 标记 563 张。
- 广场里 68.67% 的卡组使用了 reserve 卡 → 广场不限制。游戏内可能对应"轮换/经典赛制"开关，
  本项目按"卡组测试工具"口径 **允许 + warning**（`DECK_RULES.allowReservedInStandard = true`）。
- 未来若要做赛制区分：改这一个常量 + `DeckFormat`（已定义 `standard | reserve | draft`）。

### 6.2 未观测到的可能规则

广场数据无法证实/证伪（广场本身不校验）：主题/成就类限制、装饰性内容（卡背/称号）、
竞技场（draft）独立规则、盟军是否还有"按费用"的隐性限制。这些留待游戏内实测补。

---

## 7. 与代码的对应关系

`src/data/deckRules.ts`：

```ts
export const DECK_RULES = {
  deckSize: 39, minDeckSize: 39,                     // R1
  maxCopies: 4,                                      // 兼容字段（Standard 口径）
  maxCopiesByRarity: { Standard: 4, Limited: 3, Special: 2, Elite: 1 },  // R2
  eliteCopies: 1, maxEliteTotal: null,               // R3
  maxAllyCards: 12, allyEliteForbidden: true,        // R4
  mainFactions: ['Soviet','USA','Germany','Britain','Japan'],            // R5
  minorFactions: ['Italy','Poland','France','Finland'],
  warnAllyFactions: ['Anzac'],                       // R6
  unbuildablePools: ['derived'], unbuildableSets: ['OnlySpawnable'],     // R8
  allowReservedInStandard: true,                     // R9（warning）
};
```

`validateDeck(deck, cards?) → { valid, errors, warnings, stats }`：

- **errors**：主阵营非法 / 张数超限 / 同名超稀有度上限 / 精英 >1 / 盟军 >12 / 盟军含精英 /
  卡牌不在数据集 / 卡牌既不属于主阵营也不属于盟军 / `pool=derived`、`set=OnlySpawnable`；
- **warnings**：卡组未满 39、卡表未加载、盟军=主阵营、盟军=Anzac、含预备池卡牌；
- **stats**：`{ total, byType, byKredits, units, orders, elite, mainFactionCards, allyFactionCards }`
  （`mainFactionCards` 含 `main ∈ host_factions` 的流亡卡；`allyFactionCards` 即计入 12 张额度的部分）。

辅助导出：`MAJOR_FACTIONS` / `MINOR_FACTIONS` / `COPY_LIMIT_BY_RARITY` / `isCardUsableBy()` /
`classifyCard()` / `maxCopiesOf()` / `deckSizeDelta()` / `encodeIssues()` / `describeRules()`。

## 8. 参考数据（费用曲线 / 类型分布，供 UI 参考）

全样本 1950 卡组、76050 张卡位的费用分布：0 费 1.72%、1 费 26.37%、2 费 21.33%、3 费 18.41%、
4 费 13.90%、5 费 7.38%、6 费 4.60%、7 费 3.11%、8 费 1.06%、9 费 0.80%、10 费 0.99%、12 费 0.32%，
**平均费用 2.96**。

类型分布：指令 order 35285、步兵 infantry 22340、坦克 tank 6643、战机 fighter 6164、轰炸机 bomber 2296、
反制 countermeasure 2043、炮兵 artillery 1030。卡组平均 22.26 张不同卡（即平均 16.74 个重复卡位）。
