# 卡牌效果覆盖率分析（CARD_COVERAGE）

> 数据源：`public/data/cards.json`（1646 张，字段为 CardDef 驼峰形式）+ 公开卡组 API `/api/v1/decks`（600 个卡组快照）。
> 生成时间：2026-11-07；生成脚本：`_work/report.mjs` / `_work/lib/classify.mjs`（可重跑，数字自动更新）。
> 本文件是**覆盖率账本**：阶段二每完成一批卡牌脚本或新增一个 custom 原语，都要更新第 5、6 节。

## 0. 结论速览（TL;DR）

- **零脚本卡 95 张**：vanilla 31 张 + 纯关键字 64 张（62 张空文本 + 2 张文本仅关键字）——引擎直接按 CardDef 数值/attributes 工作，**不需要写脚本**。
- **需要脚本 1551 张**：A 类 975 张（59.2%，现有 DSL 即可表达）、B 类 572 张（34.8%，需 21 个 custom 原语）、C 类 4 张（暂不实现）。
- **META top100**：A 类 63 / B 类 36 / 纯关键字 1；B 类只涉及 **16 个 custom 原语**（`kredit_slot`、`remove`、`copy`、`restriction`、`fight`、`intel`、`cost`、`veteran`、`keyword_count`、`develop`、`damage_mod`、`naval`、`add_enemy_deck`、`opcost`、`unit_ability`、`counter`）。也就是说**先把 top100 卡 + 这 16 个原语做出来，实战卡组就有约 99% 的效果正确率**。
- 效果文本高频结构：部署 233 张、亡计 59 张、抉择 43 张、钳击 15 张。
- **实现进度（阶段二）**：META **top200 中所有 195 张需要脚本的卡已 100% 写完**（另 5 张纯关键字免脚本）；注册表脚本总数 322（可构筑 298 + 衍生 24），覆盖全部可构筑卡的 19.6%。仍未实现的部分只有：非 META 长尾卡（约 1219 张可构筑卡）与 105 张衍生老兵形态；custom 原语缺口见第 6 节。

## 1. 语料概貌

| 维度 | 取值（数量） |
| --- | --- |
| 卡牌总数 | 1646 |
| 类型 | order 636；infantry 527；fighter 141；tank 139；bomber 95；artillery 57；countermeasure 51 |
| 阵营 | USA 284；Soviet 277；Germany 276；Britain 266；Japan 264；France 64；Italy 62；Poland 60；Finland 44；Anzac 33；Neutral 16 |
| 池 | active 954；reserve 563；derived 129 |
| 系列 | Base 350；Allegiance 150；OceaniaStorm 118；Homefront 111；BloodAndIron 111；NavalWarfare 106；Legions 105；Breakthrough 105 … |

> ⚠️ 数据集阵营名与 `src/engine/types.ts#FACTIONS` 不一致：数据里是 `Soviet`（契约里是 `USSR`），另有 `Anzac` / `Neutral` 未列入 FACTIONS；类型里出现 `countermeasure`（51 张）但不在 `CARD_TYPES` 中。已在第 8 节登记，等待 Lead 裁决（脚本侧先用数据原值）。

## 2. 关键字归一化（`src/engine/cards/keywords.ts`）

运行时关键字 id 的权威是 `src/engine/keywords.ts`（Lead 契约），卡牌侧目录 `src/engine/cards/keywords.ts` 从中派生，保证 id 不漂移。数据集 `attributes` 共 **107 个原始取值**，其中真实行为关键字 18 个（含数值档位），其余为老兵链接（44 张 BecomesVeteran + 44 张 VeteranOf）与 `OnlySpawnable`（44 张）。

| 原始 attribute | 规范 KeywordId | 中文名 | 英文名 | 卡数 | 规则说明 |
| --- | --- | --- | --- | --- | --- |
| `blitz` | `blitz` | 闪击 | Blitz | 196 | 部署当回合即可行动/攻击 |
| `guard` | `guard` | 守护 | Guard | 124 | 敌方必须先攻击守护单位 |
| `smokescreen` | `smokescreen` | 烟幕 | Smokescreen | 50 | 不能被敌方单位攻击（可被指令指定） |
| `ambush` | `ambush` | 伏击 | Ambush | 44 | 隐藏状态，首次攻击后解除 |
| `fury` | `fury` | 奋战 | Fury | 44 | 每回合可攻击两次（原文用“奋战”） |
| `shock` | `shock` | 冲击 | Shock | 32 | 部署时可立即行动/冲击（原文用“冲击”） |
| `bond` | `bond` | 协力 | Bond | 26 | 与协力单位联动（原文用“协力”） |
| `alpine` | `alpine` | 山地 | Alpine | 18 | 山地单位 |
| `pincer` | `pincer` | 钳击 | Pincer | 15 | 位于两友方单位之间时触发钳击 |
| `covert` | `covert` | 隐蔽 | Covert | 11 | 隐藏单位，揭示后触发效果 |
| `salvage` | `salvage` | 收缴 | Salvage | 9 | 收缴（原文用“收缴/被收缴单位”） |
| `mobilize` | `mobilize` | 动员 | Mobilize | 8 | 动员状态相关效果 |
| `heavyArmor1` | `heavyArmor:1` | 重甲 1 | Heavy Armor 1 | 39 | 受到伤害 -1 |
| `heavyArmor2` | `heavyArmor:2` | 重甲 2 | Heavy Armor 2 | 11 | 受到伤害 -2 |
| `heavyArmor3` | `heavyArmor:3` | 重甲 3 | Heavy Armor 3 | 1 | 受到伤害 -3 |
| `intel1` | `intel:1` | 情报 1 | Intel 1 | 11 | 查看敌方 1 张随机手牌 |
| `intel2` | `intel:2` | 情报 2 | Intel 2 | 9 | 查看敌方 2 张随机手牌 |
| `intel3` | `intel:3` | 情报 3 | Intel 3 | 4 | 查看敌方 3 张随机手牌 |
| `OnlySpawnable` | `onlySpawnable` | 仅可生成 | Spawn Only | 44 | 不可构筑，只能由效果生成（数据标记） |
| BecomesVeteran:* | `veteranBecomes:<cardId>` | 可升为老兵 | Becomes Veteran | 44 | 原卡 → 老兵卡链接（数据标记） |
| `VeteranOf:*` | `veteranOf:<cardId>` | 老兵形态 | Veteran Of | 44 | 老兵卡 → 原卡链接（数据标记） |

导出 API（`src/engine/cards/keywords.ts`）：

- `KEYWORDS: Record<string, { id; zh; en; desc; icon? }>` —— 基础关键字 + 数值档位 + 数据标记 + 预留关键字（`barrage` 弹幕、`immune` 免疫、`naval` 海军）。
- `normalizeKeywords(attributes: string[] | undefined): string[]` —— 委托运行时归一化：`heavyArmor2 → heavyArmor:2`、`intel1 → intel:1`，丢弃老兵链接/OnlySpawnable，去重保序。
- `KEYWORD_ZH: Record<string, string>` —— 规范 id → 中文名。
- 辅助：`parseAttribute`（保留老兵链接/标记）、`keywordLabel`、`isGameplayKeyword`、`GAMEPLAY_KEYWORD_IDS`。

> 中文名核对：卡面原文用「奋战 / 冲击 / 协力 / 收缴 / 山地 / 闪击 / 守护 / 烟幕 / 伏击 / 隐蔽 / 动员 / 情报 / 重甲 / 老兵」。运行时 `KEYWORD_DEFS` 中 `fury=狂怒`、`bond=协同`、`salvage=回收` 与原文用词不一致（仅展示层，不影响 id），建议 Lead 同步（见第 8 节）。

## 3. 效果文本结构

### 3.1 空效果文本

| 分类 | 张数 | 处理方式 |
| --- | --- | --- |
| vanilla（无文本、无关键字） | 31 | 不需要脚本 |
| 纯关键字（无文本、有关键字） | 62 | 不需要脚本，attributes 即全部效果 |
| 纯关键字（文本仅关键字词） | 2 | 不需要脚本 |
| 空文本合计 | 95 | — |

### 3.2 触发词分布（按文本前缀统计）

| 触发结构 | 卡数 |
| --- | --- |
| 部署： | 233 |
| 亡计： | 59 |
| 抉择： | 43 |
| 钳击： | 15 |

> 另有大量事件触发（“时，/后，”）与条件结构（“若…”），见 3.4 与第 4 节：事件触发 517 张、条件 173 张、随机 124 张。

### 3.3 句级高频模板（归一化：数字→N，专名→“X”）

| 次数 | 模板 |
| --- | --- |
| 31 | `抽N张牌` |
| 27 | `对N个单位造成N点伤害` |
| 14 | `将N个“X”加入支援阵线` |
| 13 | `使友方总部获得+N防御力` |
| 11 | `抉择：将N张“X”或N张“X”加入手牌` |
| 10 | `额外获得N个指挥点槽` |
| 8 | `压制N个单位` |
| 7 | `部署：将N张“X”加入手牌` |
| 7 | `将N张“X”加入手牌` |
| 6 | `亡计：将N个“X”加入支援阵线` |
| 6 | `抉择：将N张“X”或N张“X”加入手中` |
| 6 | `对N个敌方目标造成N点伤害` |
| 6 | `对所有敌方单位造成N点伤害` |
| 6 | `造成N点伤害` |
| 6 | `使所有友方单位获得+N+N` |
| 5 | `亡计：抽N张牌` |
| 5 | `部署：对N个敌方目标造成N点伤害` |
| 5 | `无法被敌方指令指向` |
| 5 | `部署：从“X”、“X”和“X”中开发N张` |
| 5 | `对坦克造成双倍伤害` |

> 全量：1544 条不同句级模板、161 条出现 ≥2 次（约 90% 的模板只出现一次），长尾极重，所以**不能靠整句匹配**，必须走第 4 节的“原子族 + 组合”路线。

### 3.4 整段文本高频模板（Top 8）

| 次数 | 整段模板 |
| --- | --- |
| 11 | `抉择：将N张“X”或N张“X”加入手牌。` |
| 7 | `部署：将N张“X”加入手牌。` |
| 6 | `亡计：将N个“X”加入支援阵线。` |
| 6 | `抉择：将N张“X”或N张“X”加入手中。` |
| 5 | `部署：从“X”、“X”和“X”中开发N张。` |
| 5 | `对坦克造成双倍伤害。` |
| 5 | `使敌方总部获得：“X”` |
| 5 | `抽N张牌。` |

## 4. 原子族覆盖表

原子的定义见 `_work/lib/classify.mjs#FAMILIES`：一句文本命中某族即计入该族；一张卡命中多个族就多计。“DSL 支持”= 现有 `EffectOp`/`Condition`/`TargetQuery` 组合能否表达。

| 原子族 | 说明 | 命中卡数 | DSL |
| --- | --- | --- | --- |
| `trig_event` | 事件触发 | 517 | ✅ 现成 |
| `aura` | 光环/持续增益 | 456 | ✅ 现成 |
| `buff` | 属性增减 | 451 | ✅ 现成 |
| `damage` | 伤害 | 294 | ✅ 现成 |
| `trig_deploy` | 部署： | 243 | ✅ 现成 |
| `draw` | 抽牌 | 229 | ✅ 现成 |
| `hand_manip` | 手牌操作 | 216 | ✅ 现成 |
| `destroy` | 消灭 | 173 | ✅ 现成 |
| `conditional` | 条件 | 173 | ✅ 现成 |
| `random` | 随机 | 124 | ✅ 现成 |
| `cost` | 花费修正 | 123 | ⚠️ 需原语 |
| `summon` | 召唤/加入阵线 | 104 | ✅ 现成 |
| `add_to_hand` | 加入手牌 | 103 | ✅ 现成 |
| `grant_kw` | 给予/失去关键字 | 96 | ✅ 现成 |
| `transform` | 转换/变形 | 90 | ✅ 现成 |
| `deck_manip` | 卡组操作（洗入/置顶/构筑外） | 88 | ✅ 现成 |
| `opcost` | 行动花费 | 76 | ⚠️ 需原语 |
| `return` | 返回/撤退 | 72 | ✅ 现成 |
| `trig_death` | 亡计： | 68 | ✅ 现成 |
| `veteran` | 老兵机制 | 67 | ⚠️ 需原语 |
| `pin` | 压制 | 59 | ✅ 现成 |
| `set_stats` | 设定数值 | 59 | ✅ 现成 |
| `repeat` | 每有/重复 | 56 | ✅ 现成 |
| `discard` | 弃牌 | 52 | ✅ 现成 |
| `restriction` | 限制/无法/免疫 | 50 | ⚠️ 需原语 |
| `kredit_slot` | 指挥点槽 | 47 | ⚠️ 需原语 |
| `kredit` | 指挥点获取/失去 | 46 | ✅ 现成 |
| `counter` | 反制 | 45 | ⚠️ 需原语 |
| `movement` | 移动/换线/入场 | 44 | ✅ 现成 |
| `trig_choice` | 抉择： | 43 | ✅ 现成 |
| `damage_mod` | 伤害修正/双倍/无视 | 41 | ⚠️ 需原语 |
| `copy` | 复制 | 41 | ⚠️ 需原语 |
| `heal` | 治疗/修复 | 36 | ✅ 现成 |
| `unit_ability` | 单位获得持续能力 | 33 | ⚠️ 需原语 |
| `intel` | 情报/预报/揭示 | 29 | ⚠️ 需原语 |
| `remove` | 移出战场 | 27 | ⚠️ 需原语 |
| `naval` | 海军属性 | 22 | ⚠️ 需原语 |
| `develop` | 开发（发现） | 21 | ⚠️ 需原语 |
| `silence` | 抑制 | 19 | ✅ 现成 |
| `target_spec` | 指向/指定目标 | 15 | ✅ 现成 |
| `trig_pincer` | 钳击： | 13 | ✅ 现成 |
| `keyword_count` | 对战词条数（战斗关键字计数） | 13 | ⚠️ 需原语 |
| `fight` | 强制对战/与X战斗 | 12 | ⚠️ 需原语 |
| `add_enemy_deck` | 塞入敌方卡组 | 11 | ⚠️ 需原语 |
| `weather` | 天气 | 11 | ⚠️ 需原语 |
| `hq_ability` | 总部获得持续能力 | 9 | ⚠️ 需原语 |
| `extra_action` | 额外行动/再行动 | 7 | ⚠️ 需原语 |
| `control` | 控制敌方单位 | 4 | ⚠️ 需原语 |
| `trigger_twice` | 触发两次/翻倍 | 2 | ⚠️ 需原语 |

## 5. 覆盖率策略：A / B / C 三类

| 分类 | 判定标准 | 张数 | 占比 | 处理方式 |
|---|---|---:|---:|---|
| **A 类** | 全部句子都能落到「DSL 支持」的原子族 | 975 | 59.2% | 模板化直译成 `CardScript`，可批量推进；阶段二主力 |
| **B 类** | 句子都能归类，但至少 1 句需要新原语 | 572 | 34.8% | 先用 `{op:'custom', id}` + 登记第 6 节；按 META 热度排优先级 |
| **C 类** | 存在无法归类的句子（机制未考据） | 4 | 0.2% | 暂标 unimplemented（`CARD_COVERAGE` 第 7 节），不影响对战可玩性 |
| 零脚本 | vanilla / 纯关键字 | 95 | 5.8% | 无需脚本 |

**META 卡在各桶中的分布**（说明“先做哪些”最划算）：

| 集合 | A 类 | B 类 | 纯关键字 | 合计 |
| --- | --- | --- | --- | --- |
| top 100 | 63 | 36 | 1 | 100 |
| top 150 | 94 | 54 | 2 | 150 |
| top 200 | 120 | 75 | 5 | 200 |

**实施批次（阶段二）**

1. **批次 1（P0）**：META top 50 + 全部 vanilla/纯关键字卡（无需脚本）+ 第 6 节里 top50 命中的高频原语。
2. **批次 2（P1）**：META 51–150；同批补齐 top150 命中的其余原语（`hq_ability`）。
3. **批次 3（P2）**：META 151–200 + 各阵营高热度剩余卡。
4. **批次 4（收尾）**：A 类剩余卡批量直译；B 类中依赖长尾原语的卡标 `custom` 占位；C 类标 unimplemented。
5. **验收**：每批结束跑 `npx tsc --noEmit`；用 600 卡组随机抽样对局跑 AI 自对弈，检查无异常日志/无卡死；覆盖率数字回写本文件与 `docs/META_CARDS.md`。

## 6. 待实现 custom 原语清单

> 规则：脚本里用 `{ op: 'custom', id: '<原语 id>', params: {...} }`（或 `{ kind: 'custom', id }` 作条件）占位，并在此登记；执行器实现后逐个替换回标准 `EffectOp`。
> 本表由 `_work/custom-spec.json`（规格）+ `_work/validate-scripts.mjs`（实际用量）生成，改脚本后重跑即可刷新。

### 6.1 已在使用中的 custom 操作（`EffectOp`）

| 原语 id | 优先级 | params | 语义 | 出现次数 | 代表卡 |
| --- | --- | --- | --- | --- | --- |
| `gainHqDefense` | P0 | `{side:'self'|'enemy', amount?:number, from?:'selfCost'|'lastDamage'}` | 总部获得/失去 +N 防御力（maxHp 与 hp 同时增加，不能用 heal 代替） | 24 | sincerely_yours +6、fortification +7、the_glamour_boys +4、m3a3_honey +1、329th_engineer_battalion +2 |
| `moveUnitZone` | P0 | `{of:'self'|'chosen'|'all'|'adjacent', to:'hand'|'deckTop', side?, line?, type?, count?}` | 把单位移出手牌/卡组顶（统一“撤退/返回手牌/返回卡组顶/相邻撤退”） | 17 | leopold、fw_190_jagdbomber、komet、queens_own、churchill_mk_iii_avre、uss_missouri |
| `damageAnyTarget` | P0 | `{side:'enemy'|'any', amount:number, includeHQ:boolean, drawIfHQ?:number}` | 对“1 个目标”造成伤害，目标可为单位或总部（可选总部则额外抽牌） | 2 | buzz_bomb、attack_in_the_colonies |
| `damageSplitRandom` | P1 | `{amount:number, side, includeHQ?:boolean}` | N 点伤害随机分配到所有敌方目标 | 1 | b29_superfortress |
| `damageRepeatWhileKill` | P1 | `{side, amount:number}` | 群体伤害，只要有人被消灭就重复一次 | 1 | crossfire |
| `damageTargetAndAdjacent` | P1 | `{side, amount:number, adjacentAmount:number}` | 对选定目标及其相邻目标分别造成伤害 | 1 | bombing_raid |
| `pinAdjacentToChosen` | P1 | `{}` | 压制选定目标及其相邻单位 | 1 | monty |
| `endTurn` | P1 | `{}` | 立即结束当前回合 | 4 | kurume_regiment、banzai、repel_the_attack |
| `shuffleIntoDeck` | P1 | `{cardId, count:number, side?:'self'|'enemy'}` | 将 N 张卡洗入卡组 | 8 | last_rites、kikka、97th_rifles |
| `drawByType` | P1 | `{type, count:number}` | 按类型定向抽牌（如“抽 1 张指令”） | 4 | arado_ar_196 |
| `drawUntilHandSizeMatchesEnemy` | P1 | `{}` | 抽牌直到己方手牌数 = 敌方手牌数 | 1 | enigma |
| `drawPerDistinctUnitType` | P1 | `{}` | 己方每有一种单位类型抽 1 张 | 1 | conquest |
| `drawBothUntilHandSize` | P1 | `{size:number}` | 双方各抽到指定手牌数 | 1 | phoney_war |
| `destroyUnitByStatSum` | P1 | `{side, sum:number, compare:'lte'|'gte', count:number}` | 按“攻击力+防御力”之筛选并消灭（UnitFilter 无此字段） | 1 | fifth_ohio |
| `destroyUnitAndSameName` | P2 | `{maxAttack:number}` | 消灭 1 个单位及所有同名单位 | 1 | overpower |
| `destroyUnitsByCostParity` | P1 | `{parity:'odd'|'even'}` | 消灭所有奇数/偶数花费的单位 | 2 | naval_battle |
| `destroySalvageLowestAttack` | P2 | `{}` | 消灭并收缴所有攻击力最低的单位 | 1 | on_the_ascent |
| `destroyAttacker` | P1 | `{}` | 反制：消灭发起攻击的单位（需要反制上下文携带攻击者） | 1 | counter_strike |
| `summonByStatSum` | P2 | `{count, stat:'attack', sum, faction, type, line}` | 随机召唤若干单位使其属性和为指定值 | 1 | seaborne_invasion |
| `summonLastDestroyedUnit` | P2 | `{side, type:'ground', line}` | 召唤最近被消灭的指定类型单位 | 1 | ilyushin_il10 |
| `summonAndStrike` | P2 | `{cardId, line, side}` | 召唤单位并让它随机攻击敌方单位（伤害=其攻击力） | 1 | audacity |
| `summonWithKeywords` | P2 | `{cardId, line, keywords:string[]}` | 召唤单位并附加关键字 | 1 | the_white_death |
| `buffFactionUnits` | P1 | `{faction, type?, attack?, hp?, side?}` | 按阵营（+类型）批量增益（UnitFilter 无 faction 字段） | 1 | fast_heinz |
| `buffDeckTopUnit` | P2 | `{attack, hp}` | 增益卡组顶的单位 | 1 | uss_the_sullivans |
| `returnHandCardToDeckTop` | P2 | `{count:number}` | 选择手牌放回卡组顶 | 1 | thunderbolt |
| `enemyHandCardToDeckTop` | P2 | `{count:number, random:boolean}` | 敌方随机/选择手牌放回卡组顶 | 1 | mi5 |
| `handCardToDeckThenDraw` | P2 | `{count:number}` | 选择手牌洗入卡组并抽等量牌 | 1 | 10th_recon |
| `transformHandCardToUnit` | P2 | `{}` | 把手牌转换为一个单位 | 1 | surveil |
| `convertOwnerUnitsToChosen` | P2 | `{}` | 把选定单位所有者的所有单位转换为该单位 | 1 | victory_banners |
| `scheduleEffects` | P1 | `{when:'selfTurnStart'|'selfTurnEnd', effects:EffectOp[]}` | 延迟到指定时点执行一组效果（如“下个友方回合开始时失去/获得指挥点”） | 3 | extended_barrage、55th_rifles |
| `watchChosenDeathDraw` | P2 | `{count:number}` | 监视选定单位：其被消灭时抽牌 | 1 | 738_jger_regiment |
| `damageEnemyHqIfEnemyDrew` | P2 | `{amount:number}` | 监听敌方抽牌并伤害其总部（需要 cardDrawn 触发携带着抽牌方） | 1 | kv1_1941 |
| `onCombatDamageAddCards` | P2 | `{cardId}` | 造成对战伤害后按伤害值加入等量卡牌（需要 damageDealt 携带 amount） | 1 | stz5_katyusha |
| `selfStatsWhileHasKeyword` | P2 | `{keyword, attack?, hp?}` | 仅在自身具有某关键字时获得属性（PassiveAura 无法只作用于自身） | 1 | 58th_infantry_regiment |
| `onFriendlyUnitActedBuffPerOperatingCost` | P2 | `{}` | 友方单位行动后按行动花费次数增益（需要“行动后”钩子） | 1 | blue_legion |
| `onGainedAttackBonus` | P2 | `{}` | 被其他效果增加攻击力时触发（需要增益钩子） | 1 | sd_kfz_10_pak_38 |
| `onActedGainAttackPerActionCount` | P2 | `{}` | 行动后按累计行动次数获得属性 | 1 | panther_a_zimmerit |
| `loseKreditSlots` | P0 | `{side, amount}` | 失去 N 个指挥点槽（与 gainKreditSlots 对称，上限/下限夹紧） | 11 | desperate_measures、shelling、southern_plan、last_ditch_force |
| `discoverFromDeck` | P2 | `{side, count}` | 从指定方卡组随机“开发”卡牌加入手牌 | 3 | the_rock_of_gibraltar、air_land_sea |
| `negatePlayedCard` | P2 | `{}` | 反制：取消对方刚打出的卡牌结算 | 2 | ultra、hms_sceptre |
| `negatePlayedCardIfCostAtLeast` | P2 | `{cost}` | 反制：仅当对方卡牌花费 ≥ N 时取消 | 1 | dowding_system |
| `setHqDefense` | P2 | `{side, value}` | 把总部防御力设为固定值 | 1 | alpenfestung |
| `grantHqAbility` | P2 | `{trigger?, effects, targetSide?, thresholdDamage?}` | 给总部附加一段持续能力 | 3 | front_formation、road_to_berlin、contest_doctrine |
| `damageAnyTargetAndAdjacent` | P2 | `{side, amount, adjacentAmount, includeHQ}` | 对可选目标（单位/总部）及其相邻单位造成伤害 | 1 | aerosani |
| `silenceAdjacentToChosen` | P2 | `{}` | 抑制选定单位及其相邻单位 | 1 | b24j |
| `grantHqKeywordUntilNextTurn` | P2 | `{keyword}` | 总部临时获得关键字，直到下个己方回合开始 | 1 | depth_charges |
| `destroyUnitByMaxCost` | P2 | `{maxCost, count}` | 按花费上限筛选并消灭 | 1 | v1_flying_bomb |
| `destroyUnitByMaxKredits` | P2 | `{side, count}` | 按“攻击力 ≤ 己方指挥点槽数”筛选并消灭 | 1 | commit_the_reserves |
| `extraAction` | P0 | `{}` | 重置一次攻击（已实现） | 1 | windhund_division |
| `modifyOperationCostArea` | P2 | `{side, line, amount}` | 批量修改行动花费（区域） | 1 | blitzkrieg |
| `returnChosenToHandAndCostZero` | P2 | `{}` | 把选定单位返回手牌并使其花费为 0（至回合结束） | 1 | shifting_attack |

### 6.2 已在使用中的 custom 条件（`Condition`）

| 条件 id | 优先级 | params | 语义 | 出现次数 | 代表卡 |
| --- | --- | --- | --- | --- | --- |
| `chosenIsFriendly` | P0 | `{}` | 选定目标属于己方 | 2 | 40_panzergrenadier、15th_wolves_regiment |
| `chosenIsEnemyHQ` | P0 | `{}` | 选定目标是敌方总部（攻击类触发用） | 5 | type_94_tk_early、dingo |
| `chosenIsUnit` | P1 | `{}` | 选定目标是单位（而非总部） | 1 | 28th_infantry_regiment |
| `chosenIsSelf` | P1 | `{}` | 事件目标就是本单位 | 3 | 845th_rifles |
| `ordersPlayedThisTurnAtLeast` | P1 | `{count:number}` | 本回合已使用指令数 ≥ N | 1 | wave_after_wave |
| `deployedFactionTypeLastTurn` | P2 | `{faction, type}` | 上回合部署过指定阵营/兵种的单位 | 1 | forward_observers |
| `friendlyTurnChosenIsEnemy` | P2 | `{}` | 当前是己方回合且事件目标是敌方单位 | 1 | 158_nachschub |
| `friendlyFactionUnitOnFrontline` | P2 | `{faction}` | 前线有指定阵营的友方单位 | 1 | expansion |
| `destroyedBySelf` | P2 | `{}` | 事件中的被消灭单位由本单位消灭 | 1 | 77th_regiment |
| `usedFromLeftmostHandCard` | P2 | `{}` | 本卡是从手牌最左侧打出的 | 2 | z_special_unit |
| `usedFromRightmostHandCard` | P2 | `{}` | 本卡是从手牌最右侧打出的 | 1 | repel_the_attack |
| `chosenHasUniqueHighestAttack` | P2 | `{}` | 选定单位拥有全场唯一最高攻击力 | 1 | the_dagger_strikes |
| `factionIsAlly` | P1 | `{faction}` | 指定阵营是己方的盟军阵营 | 1 | asw_patrol |
| `chosenAttackGtMaxKredits` | P2 | `{}` | 选中单位攻击力大于己方指挥点槽数 | 1 | ferocious_assault |
| `chosenDamaged` | P2 | `{}` | 事件目标已受伤 | 1 | sissi |
| `attackKilledTarget` | P2 | `{}` | 本次攻击消灭了目标 | 2 | windhund_division |
| `deckTopIsNaval` | P2 | `{}` | 卡组顶是海军牌 | 1 | u16 |
| `notAttackedLastTurn` | P2 | `{}` | 上回合己方总部没有被攻击 | 1 | garrison |

### 6.3 其余已用 custom id（长尾，规格以脚本注释为准）

> 这些 id 只在少量卡上使用、多为需要专有钩子的“一次性原语”；执行器未实现时静默 no-op（不报错、不阻断对局），实现后按脚本注释替换即可。

| custom id | 用量 |
| --- | --- |
| `gainKreditSlots` | 10 |
| `revealIntel` | 6 |
| `discoverFrom` | 5 |
| `restrictAction` | 3 |
| `modifyOperationCost` | 3 |
| `modifyCost` | 2 |
| `playedByEnemy` | 2 |
| `addCardToEnemyDeck` | 2 |
| `removeSelfFromGame` | 1 |
| `copySelfToDeckWithMultiplier` | 1 |
| `drawCheapestOrder` | 1 |
| `handOrderToDeckTopCostZero` | 1 |
| `modifyCostOfNonFaction` | 1 |
| `copyEnemyOrdersToDeckAndGrantDraw` | 1 |
| `limitFrontlineSlots` | 1 |
| `modifyEnemyHandCostNextTurn` | 1 |
| `transformPlayedCardToHand` | 1 |
| `discoverToDeckCostZero` | 1 |
| `removeFromGame` | 1 |
| `putCopiesOnOwnerDeckTop` | 1 |
| `grantAbilityToAllEnemyUnits` | 1 |
| `discountWhileInHandOnFriendlyOrder` | 1 |
| `playedCardIsFaction` | 1 |
| `drawOutsideDeckAndCopyToHand` | 1 |
| `summonThenDestroyAtTurnEnd` | 1 |
| `forcedFight` | 1 |
| `attackBonusVsTypes` | 1 |
| `drawAtTurn` | 1 |
| `removeSelfUntilNextTurn` | 1 |
| `phaseOutUnitReturnNextTurnEndAndCopy` | 1 |
| `actedUnitIsFriendlyFaction` | 1 |
| `allyDamageBonus` | 1 |
| `lookTopChooseDraw` | 1 |
| `upgradeVeteran` | 1 |
| `onEnemyTurnEndSummonOrDestroyFrontline` | 1 |
| `adjacentAura` | 1 |
| `drawUnitByCost` | 1 |
| `doubleDamageWhileMaxKreditsLte` | 1 |
| `onFriendlyNavalCardPlayedBuffSelf` | 1 |
| `grantDeathTriggerToAllies` | 1 |
| `buffUnitsInBothDecks` | 1 |
| `onFriendlyRevealDraw` | 1 |
| `phaseOutEnemyUnitUntilSelfLeaves` | 1 |
| `grantKeywordUntilEndOfTurn` | 1 |
| `isEnemyTurn` | 1 |
| `copySelfToHand` | 1 |
| `copyRandomEnemyOrderAndGainHqDefense` | 1 |
| `discardChosenEnemyHandCardCopyToHand` | 1 |
| `addResistanceEqualToOverkill` | 1 |
| `onVeteranUpgradeGrantDefense` | 1 |
| `conditionalCostDelta` | 1 |
| `hqDamageReduction` | 1 |
| `buffDeckUnitsWithRandomKeyword` | 1 |
| `eventVictimIsFriendly` | 1 |
| `kreditSlotAndBuffPerFrontlineUnit` | 1 |
| `discountWhileInHandOnEnemyDraw` | 1 |
| `trackVeteranProgress` | 1 |
| `destroyUnitsByBattleKeywordCount` | 1 |
| `immuneToSilenceAndKeywordLoss` | 1 |
| `copyHandUnitToSupport` | 1 |
| `drawPerAllyBattleKeywordAtLeast` | 1 |
| `onEnemyTargetedCopyToSupport` | 1 |
| `hqImmuneDuringEnemyTurn` | 1 |
| `addCopiesScalingBySelfPlayed` | 1 |

### 6.4 执行器/契约侧缺口（不是卡牌原语）

| 缺口 | 说明 |
| --- | --- |
| `cardDrawn-trigger` | cardDrawn 触发从未 fire（m3a3_honey / kv1_1941 需要），建议 drawCardInternal 后 fireBoardTriggers('cardDrawn', {drawer}) |
| `counter-enemyAttacks` | triggerCounters 只 fire enemyPlaysCard/enemyPlaysUnit，enemyAttacks 未 fire（counter_strike） |
| `counter-context` | CardScript.counter 的 effects 拿不到攻击者/被攻击目标，建议 createCtx 时写入 chosen |
| `unitFilter-faction-cost` | UnitFilter 缺 faction 与 kredits 过滤（“友方德国单位”“花费不大于 N”） |
| `damage-amount-context` | damageDealt/healed 触发不携带数值（stz5_katyusha、845th_rifles）” |
| `self-only-aura` | PassiveAura 无法只作用于自身（58th_infantry_regiment） |

> 现有契约里已有但语义不足的部分：`CardScript.counter` 只覆盖 4 种触发（且拿不到攻击者上下文）；`gainKredits` 不能永久增加指挥点槽；`costDelta` 只能写在脚本自身；`targetSpec`/LegalTargets 目前单目标；“使友方总部获得 +N 防御力”没有原生 op（heal 受 maxHp 上限，不能代替）。
> 未归类的高频文本模式（仍走 custom）：费用修改、行动花费修改、老兵升级、指挥点槽、情报/开发、反制、复制、移出对局、持续能力授予、行动限制、天气、海军属性等，见第 4 节 `⚠️ 需原语` 行。

## 7. C 类 / 零脚本卡清单（unimplemented 与免实现）

**C 类（暂不实现）4 张**（无法归类的句子，规则考据后再补；引擎应按“无脚本卡”降级处理，不阻塞对局）：

| card_id | 中文名 | 阵营/类型 | 中文原文 |
| --- | --- | --- | --- |
| `heartland_defense` | 腹地防御 | Finland/countermeasure | 友方总部受到伤害时，将 1 个“游击队员”加入支援阵线。使其获得同等的攻击力和防御力。 |
| `hit_the_drop_point` | 袭击落点 | Germany/countermeasure | 敌方单位部署时，将其抑制。可影响隐蔽单位。 |
| `long_range_recon` | 远距离侦察 | Japan/order | 使友方总部获得等同于场上所有卡牌数的防御力。 |
| `tip_of_the_spear` | 矛尖 | Germany/order | 消灭 1 个花费不大于 3 的单位。可以指向隐蔽单位。 |

**零脚本卡 95 张 = vanilla 31 张 + 纯关键字 64 张**（引擎直接按 CardDef 数值与 attributes 生效，**不需要写脚本**）。完整 card_id 清单由 `_work/report.json` 的 `vanillaCards` / `keywordOnlyCards` 字段提供，用于回归核对“这些卡确实没有脚本”。

未归类句子（共 4 句）：

| 未归类句子 | 出现次数 |
| --- | --- |
| `使其获得同等的攻击力和防御力` | 1 |
| `可影响隐蔽单位` | 1 |
| `使友方总部获得等同于场上所有卡牌数的防御力` | 1 |
| `可以指向隐蔽单位` | 1 |

## 8. 已知数据/契约问题（需 Lead 裁决）

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 1 | 数据 `faction` 用 `Soviet`，契约 `FACTIONS` 用 `USSR`；另有 `Anzac`/`Neutral` 未列入 | 阵营筛选/卡组合法性校验会漏 | 契约侧补别名映射，或数据层归一化时改写 |
| 2 | 数据 `type` 有 `countermeasure`（51 张），不在 `CARD_TYPES` | 类型筛选/合法性 | 契约补 `countermeasure` |
| 3 | `public/data/cards.json` 的 `keywordsNormalized` 丢失数值且小写化（`heavyArmor1 → heavyarmor`、`intel2 → intel`） | 重甲/情报档位信息丢失 | 数据层改为复用 `src/engine/keywords.ts#normalizeKeywords`（输出 `heavyArmor:1`） |
| 4 | `description` 中含字面 `\r\n` 换行（约 10 张） | 文本解析需预处理 | 数据层清洗；脚本侧已按 \n 处理 |
| 5 | 部分卡面文本用“亡计”，另有“亡记”（历史版本） | 触发词解析 | 统一按“亡计”；已确认数据中“亡记”0 次 |
| 6 | `targetSpec` 只支持单目标数量 | “指向 2 个单位”类卡无法表达 | 扩展 `LegalTargets.count` 与 `playCard.targets` 数组语义 |
| 7 | 运行时 `KEYWORD_DEFS` 的 zh 用词（狂怒/协同/回收）与卡面原文（奋战/协力/收缴）不一致 | 仅 UI 展示 | 建议同步中文名 |

## 9. 阶段二进度账本

> 统计口径：可构筑卡 = 数据集中 `isDerived: false` 的卡；已写脚本数 = 脚本注册表键数量（`_work/validate-scripts.mjs` 实测，见 `_work/script-stats.json`）。

| 阵营文件 | 可构筑卡 | 已写脚本 | 覆盖率 |
| --- | --- | --- | --- |
| `germany.ts` | 253 | 62 | 24.5% |
| `usa.ts` | 254 | 30 | 11.8% |
| `britain.ts` | 251 | 58 | 23.1% |
| `japan.ts` | 252 | 60 | 23.8% |
| `ussr.ts` | 254 | 54 | 21.3% |
| `minor.ts` | 253 | 34 | 13.4% |
| `tokens.ts` | 129（衍生） | 24 | 18.6% |
| **合计** | **1517**（另 129 张衍生） | **322**（其中可构筑 298 + 衍生 24） | **19.6%（可构筑卡口径）** |

脚本总数以 `src/engine/cards/index.ts#scriptCount()` 为准；脚本引用的卡牌 id 均已通过存在性校验（`_work/validate-scripts.mjs`）；custom 原语用量见第 6 节。

## 10. 交付状态（脚本冻结）

> 交付冻结时间：2026-11-07（阶段二收尾）。**此后不再新增卡牌脚本**，避免交付前引入回归。

| 指标 | 数值 |
|---|---|
| 脚本注册表总数 | **322**（`src/engine/cards/index.ts#scriptCount()`） |
| 其中可构筑卡脚本 | **298** |
| 其中衍生卡（Token/老兵形态）脚本 | **24** |
| 可构筑卡覆盖率 | **298 / 1517 = 19.6%** |
| META top150 需脚本卡覆盖 | **148 / 148 = 100%** |
| META top200 需脚本卡覆盖 | **195 / 195 = 100%** |
| 零脚本卡（vanilla + 纯关键字） | 95（无需实现） |
| 未实现长尾 | 可构筑约 1219 张 + 衍生老兵形态 105 张（清单：`_work/longtail-manual.md`） |
| 未实现 custom 原语 | 见第 6 节规格表 + 6.3 长尾表（未实现时静默 no-op，不阻断对局） |
| 质量门禁 | `npm test` 全绿（4 个测试文件 / 38 个测试，含 60 局随机对局 integration）；`tsc --noEmit` 零错误 |

复现方式（全部为脚本，不依赖手工步骤）：

```bash
node _work/report.mjs            # 语料统计 + META 热度 → _work/report.json
node _work/validate-scripts.mjs  # 注册表/引用/阵营归档校验 → _work/script-stats.json
node _work/gen-docs.mjs          # 重新生成本文件与 META_CARDS.md
npm test                         # 引擎 + 卡牌 + AI 全量测试
```
