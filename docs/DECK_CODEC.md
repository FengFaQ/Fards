# DECK_CODEC.md — KARDS 官方 deck_code 格式逆向与验证报告

> 结论先行：格式已完全解开，**1950 个公开卡组实测 roundtrip 逐字符一致率 99.59%**（7 例历史单字符头写法）、
> 解码成功率 99.95%、阵营一致率 99.95%、卡牌多重集一致率 98.31%（不一致的 32 例全部是广场里的坏码/恶搞卡组）。
>
> 实现：`src/data/deckcode.ts`（编码/解码）、`src/data/importMap.ts`（import_id ⇄ cardId，自动生成）
> 验证：`node scripts/test-deckcode.mjs`（转译真实 TS 源码后跑，报告写到 `_work/deckcode-roundtrip.json`）
> 数据：`_work/decks.json`（1950 个公开卡组，`scripts/fetch-decks.mjs` 抓取）

---

## 1. 格式总览

```
%%<主阵营码><盟军码>|<1 张的短码串>;<2 张的短码串>;<3 张的短码串>;<4 张的短码串>
└┬┘└────┬─────┘└┬┘└─────┬──────┘
 │      │       │        └── 组内：每张卡 2 位 base62 短码直接拼接
 │      │       └─────────── 阵营头与卡牌区的分隔符
 │      └─────────────────── 阵营码：单字符，主阵营在前、盟军在后
 └────────────────────────── 魔数/格式标识，固定 "%%"
```

示例（真实公开卡组，美国主 + 德国盟，39 张）：

```
%%51|bCbEbmcOcPDBdkDNfGj2mPnwpDpypzsytYv6vXvYwJyv;oPv7vhvUzd;cz;oX
     └────────────── 组0：22 张卡各 1 张 ──────────────┘ └─组1─┘ └2┘ └4┘
                                                     5 张卡各 2 张  1张3张 1张4张
                                                     合计 22 + 5×2 + 1×3 + 1×4 = 39
```

### 1.1 字段表

| 片段 | 长度 | 语义 | 备注 |
|---|---|---|---|
| `%%` | 2 | 魔数 / 格式版本 | 官方码固定以 `%%` 开头，可视为 `codeVersion = "v1"` |
| 主阵营码 | 1 | 主阵营 | 单字符 base62，见 §2 |
| 盟军码 | 1 | 盟军阵营 | 与主阵营码相同 = 无盟军（如 `%%44`）；少数历史码省略该字符（见 §6.1） |
| `\|` | 1 | 分隔符 | 阵营头 / 卡牌区 |
| 组 | 4 组 | 第 i 组（0 基）= 每张卡 i+1 张 | 组间 `;`，**总是 4 组 3 个 `;`**，空组就是空串 |
| 短码 | 每卡 2 | base62 import_id | 对应 API 字段 `import_id`，如 `"3L"`、`"4p"` |

### 1.2 为什么是"按副本数分组"

`cards_snapshot` 里每张卡带 `count`（1~4）。对同一卡组，把 4 张的法子拆成"分组下标 + 1"完全等价，
且不需要在串里写数字 —— 这就是官方选择这种编码的原因（码短、无数字、天然限制 1~4）。

**关键验证**：1950 个卡组里，`|` 之后按 `;` 切分**组数恒为 4**（`4组:1949`，另 1 个是坏码）。
对首个样本逐卡核对：组0 的 22 张 = `cards_snapshot` 中 count=1 的 22 张；组1 的 5 张 = count=2 的 5 张；
组2 的 1 张 = count=3 的 `332nd_engineer_regiment`；组3 的 1 张 = count=4 的 `15_aufklrung`。**完全吻合。**

---

## 2. 阵营码表（已用公开卡组双向验证）

| 码 | 阵营（API 名） | 中文 | 验证来源 |
|---|---|---|---|
| `1` | Germany | 德国 | `%%51`（USA+Germany）、`%%1a`（Germany+Anzac） |
| `2` | Britain | 英国 | `%%23`（Britain+Japan）、`%%25`（Britain+USA） |
| `3` | Japan | 日本 | `%%23`、`%%36`（Japan+France） |
| `4` | Soviet | 苏联 | `%%44`（Soviet，无盟军）、`%%41` 等 |
| `5` | USA | 美国 | `%%51`、`%%25` |
| `6` | France | 法国 | `%%36`（Japan+France） |
| `7` | Italy | 意大利 | 全量样本中作为盟军码出现 157 次，与 API `ally_faction=Italy` 全量对齐（0 反例） |
| `8` | Poland | 波兰 | 全量样本中作为盟军码出现 140 次，与 API 对齐（0 反例） |
| `9` | Finland | 芬兰 | `%%19`（Germany+Finland） |
| `a` | Anzac | 澳新军团 | `%%1a`（Germany+Anzac） |
| `0` | Neutral | 中立 | 码表占位；样本中未出现（中立卡由 `host_factions` 决定可入哪些卡组） |

> ⚠️ **命名坑**：卡牌数据里的苏联阵营名是 **`Soviet`**，而 `src/engine/types.ts` 的 `FACTIONS` 写的是 `USSR`；
> 另有引擎未列的 `Anzac`、`Neutral`。跨层比较请统一走 `src/data/types.ts` 的 `normalizeFactionName()`（USSR → Soviet、UK → Britain…）。
>
> 验证方式：对每个卡组把头部两位解出的阵营与 API 的 `main_faction` / `ally_faction` 对比，
> 1950 个样本中 **1949 个一致**（唯一不一致的是一个头部本身损坏的码，见 §6.3）。

---

## 3. 短码（import_id）与换算表

- 短码 = API 字段 `import_id`，**固定 2 位 base62**（字符集 `0-9A-Za-z`，字符串本身即键，不需要转数值）。
- `public/data/cards.json` 的 `importId` 字段即此码；1646 张卡里 **1645 张为 2 位**，唯一例外：
  - `retribution_j`（"惩戒"，衍生卡 / `pool=derived` / `set=OnlySpawnable`）的 `import_id = "z"`，只有 1 位。
    它是衍生卡，理论上不会出现在构筑卡组里，但解码器对"段长奇数且末位是 `z`"做了兼容（见 §6.2）。
- `scripts/gen-import-map.mjs` 从 `cards.json` 生成 `src/data/importMap.ts`：
  `IMPORT_TO_CARD` / `CARD_TO_IMPORT`（1646 条），解码**不依赖网络、不依赖 loadCards**。

---

## 4. 算法

### 4.1 解码 `decodeDeckCode(code)`

```
1. 规范化：去空白 → 若被 URL 编码（%25%25 / %7C / %3B）则 decodeURIComponent
            → 若为分享链接则取 ?deck_code= 参数 → 补 "%%" 头
2. 剥掉 "%%"；按第一个 "|" 切成 header / cardPart
3. header[0] → 主阵营；header[1] → 盟军（缺省或与主相同 → allyFaction = null）
4. cardPart 按 ";" 切分 → 第 i 段（0 基）里的每个 2 位短码 = 该卡 i+1 张
5. 短码 → cardId（查 IMPORT_TO_CARD），同一 cardId 不得重复出现
6. 返回 { codeVersion:'v1', raw, mainFaction, allyFaction, cards:[{cardId, importId, count}] }
```

### 4.2 编码 `encodeDeckCode(deck)`

```
1. 校验：每张卡 count ∈ [1,4]、cardId 不重复、cardId 存在于数据集
2. 分组：groups[count-1].push(importId)
3. 拼装："%%" + 主码 + 盟码 + "|" + groups.map(join('')).join(';')
   —— 总是输出 4 组；第 4 组为空时结果以 ';' 结尾（官方行为，见 §6.4）
```

### 4.3 一些设计取舍

- **对外只用 cardId**：`DecodedDeck.cards[].cardId` 一定有值（不依赖卡表已加载），同时保留 `importId` 便于调试/回显。
- 解码不抛"卡表未加载"这类错误；未知短码才抛（说明数据版本不匹配）。
- `encodeDeckCodeStable()`：先按 cardId 排序再编码，输出稳定（便于 diff/缓存；与官方逐字符一致性只在"保持原顺序"时成立）。

---

## 5. 验证结果（`node scripts/test-deckcode.mjs`）

样本：`_work/decks.json`，1950 个公开卡组（抓取时间为 2026-11-07）。

| 指标 | 通过 / 总数 | 通过率 |
|---|---|---|
| 解码成功（不抛异常） | 1949 / 1950 | **99.95%** |
| 阵营与 API 一致 | 1949 / 1950 | **99.95%** |
| 卡牌多重集与 `cards_snapshot` 一致 | 1917 / 1950 | **98.31%** |
| **roundtrip 逐字符一致** `encode(decode(x)) === x` | 1942 / 1950 | **99.59%** |
| 负例（非法输入必须抛错） | 7 / 7 | 100% |

负例覆盖：空串、只有 `%%`、不以 `%%` 开头、未知阵营码 `%%ZZ|`、未知短码、奇数长度段、同组重复卡。

### 5.1 失败样本分类（全部已定位，非格式理解错误）

| 类别 | 数量 | 说明 |
|---|---|---|
| 广场里的坏码/恶搞卡组 | 32（卡牌不一致） | 例如 `%%33\|;;;`：码里 0 张卡，但 `cards_snapshot` 是 `diplomatic_attach:39`。这类"39 张同一张卡"的卡组也不符合构筑规则，属广场脏数据 |
| 坏码根本不合法 | 1（解码失败） | `deck_code = "test123"`，显然是测试/垃圾数据 |
| 头部损坏 | 1（阵营不一致） | 码头解析出未知阵营字符，`cards_snapshot` 仍可用 |
| 历史单字符头写法 | 7（roundtrip 不一致） | 如 `%%2\|…`（英国、无盟军）vs 我们的规范输出 `%%22\|…`；两种都能正确解码，见 §6.1 |
| 数据集外卡牌 | 15 张副本 | `katzmann`（24 份）、`1081th_smolensk`（3 份）：卡牌 API 快照里还没有这两张卡（新卡/已移除），解码时按其短码抛"未知短码"或跳过 |

---

## 6. 未解/边缘情况

### 6.1 单字符阵营头（7 / 1950 ≈ 0.36%）

无盟军卡组有两种历史写法：

- `%%44|…`（主阵营码重复一次，1950 个样本里 24 例）
- `%%2|…`（只写主阵营码，7 例，如 `%%2|19sQ…`、`%%4|fumup…`）

**两种都能解码**（单字符头 → `allyFaction = null`）。但编码器无法从卡组内容判断原作者用的是哪种写法，
`encodeDeckCode` 统一输出 2 字符头（占 24/31 ≈ 77%，且与 `%%51` 等主流码一致），
这是 7 例 roundtrip 不逐字符相等的唯一原因（语义仍然完全正确）。若需逐字符还原，可在调用侧保留原 `raw`。

### 6.2 1 位短码 `z`（retribution_j）

`retribution_j` 是衍生卡（`pool=derived`、`set=OnlySpawnable`），`import_id = "z"`。
正常构筑不会出现；解码器在"段落长度奇数且最后一字符恰为 `z`"时按 1 位短码处理，否则抛错（宁可报错也不猜）。

### 6.3 头部损坏码（1 例）

样本里有一个码头部不是合法阵营字符、`|` 位置也异常。API 仍给出 `cards_snapshot` 与 `main_faction`，
说明广场存的是历史/编辑器产物。我们的策略：`decodeDeckCode` 抛明确错误，`decodeDeckCodeSafe` 返回 `{ok:false,error}`
（UI/导入流程自行降级）。

### 6.4 尾部空组：**不能裁剪**

官方编码器总是输出 4 组。若卡组没有 4 张的卡，码会以 `;` 结尾：

```
%%36|tCtD5U5C…;tFtJnr…;tQsZ;      ← 第 4 组为空
%%44|jZ7Y8P;8F7Rz1…;;             ← 第 3、4 组为空
```

最初实现按"尾部空组省略"处理，导致 691/1950 例 roundtrip 不逐字符相等，修正后降到 7 例（即 §6.1）。
**这是本次逆向里最关键的一处纠错。**

### 6.5 其他

- 码里没有"卡组名/作者/卡背/版本号"，这些只在 API 的 deck 记录里，不进码。
- 未发现 `%%` 之后有第三个字符的版本号语义；`%%` 只是魔数。
- 未来若加入新阵营，码表可能扩展到 `b`/`c` 等；`CODE_TO_FACTION` 查不到时会抛"未知阵营码"，需同步更新 `FACTION_CODE`。

---

## 7. 复现步骤

```bash
node scripts/fetch-decks.mjs --pages=40      # 抓 ~2000 个公开卡组（分页缓存，可断点续传）
node scripts/fetch-cards.mjs                 # 抓 1646 张卡 → public/data/cards.json
node scripts/gen-import-map.mjs              # 生成 src/data/importMap.ts
node scripts/test-deckcode.mjs               # 解码/编码/roundtrip 验证（本文件的数字来源）
node scripts/verify-data.mjs                 # 数据完整性总检查（含 codec 抽查）
```

## 8. 相关文件

| 文件 | 作用 |
|---|---|
| `src/data/deckcode.ts` | 编解码实现（对外 API：`decodeDeckCode` / `encodeDeckCode` / `decodeDeckCodeSafe` / `encodeDeckCodeStable` / `peekFactions` / `looksLikeDeckCode`） |
| `src/data/importMap.ts` | 自动生成：`IMPORT_TO_CARD` / `CARD_TO_IMPORT` |
| `src/data/types.ts` | `DecodedDeck` 类型与阵营名归一化（`normalizeFactionName`） |
| `scripts/test-deckcode.mjs` | 验证脚本（用本地 typescript 转译真实源码后执行） |
| `_work/deckcode-roundtrip.json` | 最近一次验证的完整报告（含失败样本） |
