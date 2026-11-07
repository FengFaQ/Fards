# 卡牌效果覆盖率分析（CARD_COVERAGE）

> 数据源：`public/data/cards.json`（1646 张，字段为 CardDef 驼峰形式）+ 公开卡组 API `/api/v1/decks`（600 个卡组快照）。
> 生成时间：2026-11-07；生成脚本：`_work/report.mjs` / `_work/lib/classify.mjs`（可重跑，数字自动更新）。
> 本文件是**覆盖率账本**：阶段二每完成一批卡牌脚本或新增一个 custom 原语，都要更新第 5、6 节。

## 0. 结论速览（TL;DR）

- **零脚本卡 95 张**：vanilla 31 张 + 纯关键字 64 张（62 张空文本 + 2 张文本仅关键字）——引擎直接按 CardDef 数值/attributes 工作，**不需要写脚本**。
- **需要脚本 1551 张**：A 类 975 张（59.2%，现有 DSL 即可表达）、B 类 572 张（34.8%，需 21 个 custom 原语）、C 类 4 张（暂不实现）。
- **META top100**：A 类 63 / B 类 36 / 纯关键字 1；B 类只涉及 **16 个 custom 原语**（`kredit_slot`、`remove`、`copy`、`restriction`、`fight`、`intel`、`cost`、`veteran`、`keyword_count`、`develop`、`damage_mod`、`naval`、`add_enemy_deck`、`opcost`、`unit_ability`、`counter`）。也就是说**先把 top100 卡 + 这 16 个原语做出来，实战卡组就有约 99% 的效果正确率**。
- 效果文本高频结构：部署 233 张、亡计 59 张、抉择 43 张、钳击 15 张。

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

> 规则：脚本里先用 `{ op: 'custom', id: '<原语 id>', params: {...} }` 占位（同时保留中文原文注释），并在此处登记；执行器实现后逐个替换回标准 `EffectOp`。**新增/实现原语时同步更新本表与 `docs/META_CARDS.md` 的覆盖桶统计。**

| 原语 id（建议） | DSL 缺口 | 涉及卡数 | 代表卡（按热度） |
| --- | --- | --- | --- |
| `modifyCost` | 卡牌花费增减（含按阵营/类型/费用奇偶/最左最右手牌过滤，含“等同于某值”动态费用） | 123 | `front_and_homeland`（前线与家乡，58 卡组）、`4th_guards_rifles`（近卫步兵第 4 团，55 卡组） |
| `modifyOperationCost` | 行动花费增减/设为固定值 | 76 | `panzer_35t`（35(t) 坦克，34 卡组）、`blitzkrieg`（闪电战，32 卡组） |
| `upgradeVeteran / onVeteranUpgrade` | 老兵升级判定与升级时触发 | 67 | `216th_guards`（近卫步兵第 216 团，50 卡组）、`7_schtzen`（第 7 步枪兵团，17 卡组） |
| `restrictAction` | 行动限制：无法攻击/移动/部署/使用指令/免疫/伤害上限 | 50 | `km_tirpitz`（KM 提尔皮茨号，68 卡组）、`t3485_1945`（T-34-85 1945，46 卡组） |
| `gainKreditSlots` | 指挥点槽（永久槽位）增减；现有 gainKredits 只改当前点数 | 47 | `the_war_machine`（战争机器，100 卡组）、`desperate_measures`（亡命之计，81 卡组） |
| `counterTrigger / countermeasure` | 反制牌挂载与触发（敌方出牌/指向/攻击/空军入场） | 45 | `shibata_regiment`（新发田联队，33 卡组）、`raf_mustang`（RAF 野马，33 卡组） |
| `damageModifier` | 伤害翻倍/减免/上限/无视重甲/溢出转移/伤害类型加成 | 41 | `238th_regiment`（步兵第二百三十八联队，38 卡组）、`593rd_jasco`（第 593 联合通信连，24 卡组） |
| `copyCard / duplicateUnit` | 复制手牌/单位（含“复制加入卡组/手牌/阵线”） | 41 | `meteor`（流星，74 卡组）、`336th_guards_naval`（近卫海军步兵第 336 旅，44 卡组） |
| `grantAbility` | 给单位附加一段持续能力文本（“获得：…”） | 33 | `special_attack`（特攻，34 卡组）、`colossus`（巨人计算机，32 卡组） |
| `revealIntel` | 情报/预报/揭示（查看手牌或卡组顶并可能选择） | 29 | `yokosuka_e14y`（E14Y 零式小型水侦，65 卡组）、`task_force_44`（第 44 特混舰队，42 卡组） |
| `removeFromGame` | 移除出对局（非“消灭”，不触发亡计） | 27 | `meteor`（流星，74 卡组）、`salamander`（He 162 蝾螈，35 卡组） |
| `traitNaval` | 海军属性标记与“算作海军”动态判定 | 22 | `5th_sasebo_snlf`（佐镇第五特别陆战队，37 卡组）、`bpf`（英国太平洋舰队，30 卡组） |
| `discoverFrom` | 开发：从 3 张候选中选择 1 张加入手牌 | 21 | `blitz_doctrine`（闪击战法，40 卡组）、`hampshire_regiment`（汉普郡团，34 卡组） |
| `countBattleKeywords` | 统计“对战词条数”（单位身上的战斗关键字数量），作为条件/数值来源 | 13 | `monastyr`（修道院行动，50 卡组）、`44th_silesia`（西里西亚第 44 团，39 卡组） |
| `forcedFight` | 强制对战（“与 1 个敌方单位战斗”） | 12 | `henschel_hs_129`（Hs 129，65 卡组）、`heinkel_he_219`（He 219 夜枭，17 卡组） |
| `addCardToEnemyDeck` | 将卡加入敌方卡组/手牌 | 11 | `liberation`（解放，35 卡组）、`colossus`（巨人计算机，32 卡组） |
| `setWeather` | 天气（晴天/降雨/风暴）全局修正 | 11 | `coastwatchers`（海岸观察员，12 卡组）、`surprise_engagement`（突发交战，7 卡组） |
| `grantHqAbility` | 给总部附加持续能力（“总部获得：…”） | 9 | `front_formation`（方面军，26 卡组）、`road_to_berlin`（柏林之路，19 卡组） |
| `extraAction` | 额外行动/重置攻击次数/“能在同一回合移动并攻击” | 7 | `windhund_division`（灰猎犬师，22 卡组）、`tactical_withdrawal`（战术撤退，13 卡组） |
| `takeControl` | 控制敌方单位 | 4 | `confusion`（混乱，9 卡组）、`39th_rifle_regiment`（步兵第 39 团，8 卡组） |
| `triggerTwice` | 亡计/部署/非指向部署触发两次 | 2 | `114th_infantry_regiment`（步兵第百十四联队，9 卡组）、`b26_marauder`（B-26 掠夺者，5 卡组） |

> 现有契约里已有但语义不足的部分：`CardScript.counter` 只覆盖 4 种触发；`gainKredits` 不能永久增加指挥点槽；`costDelta` 只能写在脚本自身；`targetSpec` 目前只支持单目标（`targeting.ts` 的 `count` 恒为 1）——“指向 2 个单位/选择 2 张手牌”类卡需要扩展目标数量。

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

| 阵营 | 可构筑卡 | 已写脚本 | 覆盖率 |
|---|---:|---:|---:|
| Germany（`germany.ts`） | 253 | 0 | 0% |
| USA（`usa.ts`） | 254 | 1 | 0.4% |
| Britain（`britain.ts`） | 251 | 1 | 0.4% |
| Japan（`japan.ts`） | 252 | 1 | 0.4% |
| USSR（`ussr.ts`） | 254 | 0 | 0% |
| 小国/盟军（`minor.ts`） | 253 | 0 | 0% |
| 衍生（`tokens.ts`） | 129 | 0 | 0% |
| **合计** | **1517 + 129 衍生** | **3** | **0.2%** |

> 脚本总数以 `src/engine/cards/index.ts#scriptCount()` 为准；上表由阶段二每批完成后手工更新（或用 `_work` 脚本重算）。
