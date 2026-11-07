# META 高热度卡清单（优先实现顺序）

> 数据源：`GET https://1939.kardsdecker.com/api/v1/decks?limit=50&page=1..12` → 600 个公开卡组（含 `cards_snapshot`；原始快照 `_work/decks-raw.json`）。
> 统计口径：**卡组数** = 有多少个卡组带这张卡（更稳，避免满编/单张差异）；**总份数** = 全部卡组中的副本总量。
> 生成时间：2026-11-07；生成脚本 `_work/report.mjs`。覆盖桶含义见 `docs/CARD_COVERAGE.md` 第 5 节。

## 0. 结论速览

- 600 个卡组共出现 **1330 / 1646** 张不同卡（80.8%），有 316 张卡完全没进过卡组。
- **top 200 张卡覆盖了 54.0% 的卡位**（12583/23299 份），是“对战可玩”必须做正确的核心集合。
- top200 覆桶分布：A 类模板卡 120 张、需 custom 原语 75 张、纯关键字 5 张。
- 优先级定义：**P0** = top 1–50（批次 1）、**P1** = 51–150（批次 2）、**P2** = 151–200（批次 3）。

## 1. Top 200 明细

| 优先级 | 排名 | card_id | 中文名 | 阵营 | 类型 | 费用 | 卡组数 | 总份数 | 覆盖桶 | 主要模板族 |
|---:|---:|---|---|---|---|---:|---:|---:|---|---|
| P0 | 1 | `the_war_machine` | 战争机器 | USA | order | 2 | 100 | 308 | B 类（需 custom 原语） | 指挥点槽/属性增减 |
| P0 | 2 | `monty` | 蒙哥马利 | Britain | order | 1 | 94 | 94 | A 类（模板可覆盖） | 压制/光环/持续增益/抽牌 |
| P0 | 3 | `ki30_ann` | Ki-30 九七轻爆 | Japan | bomber | 3 | 87 | 87 | A 类（模板可覆盖） | 伤害/事件触发 |
| P0 | 4 | `royal_research` | 皇家研发 | Britain | order | 3 | 85 | 85 | A 类（模板可覆盖） | 手牌操作/加入手牌/抉择： |
| P0 | 5 | `enigma` | 恩尼格玛 | Germany | order | 4 | 82 | 117 | A 类（模板可覆盖） | 手牌操作 |
| P0 | 6 | `no_46_commando` | 第 46 突击队 | Britain | infantry | 1 | 82 | 233 | A 类（模板可覆盖） | 手牌操作/加入手牌/部署： |
| P0 | 7 | `the_land_girls` | 土地女孩 | Britain | order | 2 | 82 | 211 | A 类（模板可覆盖） | 抽牌 |
| P0 | 8 | `desperate_measures` | 亡命之计 | Japan | order | 2 | 81 | 81 | B 类（需 custom 原语） | 伤害/光环/持续增益/指挥点槽 |
| P0 | 9 | `in_hour_of_need` | 战争需要 | USA | order | 4 | 77 | 181 | B 类（需 custom 原语） | 指挥点槽/属性增减 |
| P0 | 10 | `suppression` | 抑制 | Germany | order | 1 | 76 | 177 | A 类（模板可覆盖） | 抑制/抽牌/条件 |
| P0 | 11 | `forward_observers` | 前进观察员 | Britain | order | 4 | 75 | 133 | A 类（模板可覆盖） | 伤害/光环/持续增益/抽牌 |
| P0 | 12 | `meteor` | 流星 | Britain | fighter | 4 | 74 | 74 | B 类（需 custom 原语） | 移出战场/事件触发/复制 |
| P0 | 13 | `wave_after_wave` | 高潮迭起 | Britain | order | 6 | 74 | 74 | A 类（模板可覆盖） | 伤害/光环/持续增益/条件 |
| P0 | 14 | `329th_engineer_battalion` | 工兵第 329 营 | Soviet | infantry | 1 | 69 | 69 | A 类（模板可覆盖） | 消灭/属性增减/事件触发 |
| P0 | 15 | `km_tirpitz` | KM 提尔皮茨号 | Germany | order | 5 | 68 | 68 | B 类（需 custom 原语） | 伤害/限制/无法/免疫 |
| P0 | 16 | `97th_rifles` | 步兵第 97 团 | Soviet | infantry | 1 | 66 | 66 | A 类（模板可覆盖） | 抽牌/卡组操作（洗入/置顶/构筑外）/亡计： |
| P0 | 17 | `henschel_hs_129` | Hs 129 | Germany | fighter | 5 | 65 | 119 | B 类（需 custom 原语） | 属性增减/事件触发/光环/持续增益 |
| P0 | 18 | `imperial_research` | 帝国研发 | Japan | order | 3 | 65 | 65 | A 类（模板可覆盖） | 手牌操作/加入手牌/抉择： |
| P0 | 19 | `yokosuka_e14y` | E14Y 零式小型水侦 | Japan | fighter | 3 | 65 | 159 | B 类（需 custom 原语） | 情报/预报/揭示/部署：/抽牌 |
| P0 | 20 | `2nd_raiding_brigade` | 第二挺进团 | Japan | infantry | 3 | 65 | 65 | A 类（模板可覆盖） | 消灭/部署： |
| P0 | 21 | `reich_research` | 德意志帝国研发 | Germany | order | 3 | 63 | 63 | A 类（模板可覆盖） | 手牌操作/加入手牌/抉择： |
| P0 | 22 | `sincerely_yours` | 诚挚问候 | Britain | order | 4 | 62 | 62 | A 类（模板可覆盖） | 属性增减/抽牌 |
| P0 | 23 | `3rd_morskoi_pekhoty` | 海军步兵第 3 旅 | Soviet | infantry | 1 | 61 | 167 | A 类（模板可覆盖） | 手牌操作/加入手牌/召唤/加入阵线 |
| P0 | 24 | `arado_ar_196` | Ar 196 | Germany | fighter | 1 | 60 | 92 | A 类（模板可覆盖） | 抽牌/部署：/条件 |
| P0 | 25 | `m3a3_honey` | M3A3 甜心 | Britain | tank | 2 | 60 | 151 | A 类（模板可覆盖） | 抽牌/属性增减/事件触发 |
| P0 | 26 | `158_nachschub` | 第 158 补给营 | Germany | infantry | 1 | 59 | 59 | A 类（模板可覆盖） | 指挥点获取/失去/消灭/事件触发 |
| P0 | 27 | `289th_gatchina` | 加特契纳第 289 团 | Soviet | infantry | 2 | 59 | 59 | A 类（模板可覆盖） | 抽牌/亡计：/设定数值 |
| P0 | 28 | `front_and_homeland` | 前线与家乡 | Germany | order | 4 | 58 | 58 | B 类（需 custom 原语） | 抽牌/属性增减/花费修正 |
| P0 | 29 | `soviet_military_research` | 苏联军事研发 | Soviet | order | 3 | 58 | 58 | A 类（模板可覆盖） | 手牌操作/加入手牌/抉择： |
| P0 | 30 | `ki61itei` | Ki-61-I 三式战一型丁 飞燕 | Japan | fighter | 6 | 58 | 93 | A 类（模板可覆盖） | 伤害/属性增减/亡计： |
| P0 | 31 | `asw_patrol` | 反潜巡逻 | USA | order | 7 | 57 | 133 | B 类（需 custom 原语） | 指挥点槽/属性增减/消灭 |
| P0 | 32 | `by_the_sword` | 以剑之名 | Soviet | order | 4 | 56 | 91 | A 类（模板可覆盖） | 抽牌 |
| P0 | 33 | `no_9_commando` | 第 9 突击队 | Britain | infantry | 1 | 55 | 139 | A 类（模板可覆盖） | 设定数值/部署： |
| P0 | 34 | `4th_guards_rifles` | 近卫步兵第 4 团 | Soviet | infantry | 9 | 55 | 55 | B 类（需 custom 原语） | 抽牌/手牌操作/属性增减 |
| P0 | 35 | `77th_regiment` | 步兵第七十七联队 | Japan | infantry | 3 | 55 | 83 | A 类（模板可覆盖） | 召唤/加入阵线/消灭/事件触发 |
| P0 | 36 | `km_bismarck` | KM 俾斯麦号 | Germany | order | 10 | 54 | 54 | A 类（模板可覆盖） | 伤害 |
| P0 | 37 | `ilyushin_il10` | 伊尔-10 | Soviet | fighter | 3 | 54 | 54 | A 类（模板可覆盖） | 召唤/加入阵线/消灭/亡计： |
| P0 | 38 | `85_pioneer_company` | 第 85 先锋连 | Britain | infantry | 1 | 53 | 53 | B 类（需 custom 原语） | 属性增减/花费修正/事件触发 |
| P0 | 39 | `middlesex_regiment` | 米德尔塞克斯团 | Britain | infantry | 1 | 53 | 98 | A 类（模板可覆盖） | 手牌操作/加入手牌/部署： |
| P0 | 40 | `heinkel_he_115` | He 115 | Germany | bomber | 2 | 52 | 52 | A 类（模板可覆盖） | 手牌操作/加入手牌/事件触发 |
| P0 | 41 | `2nd_west_africa` | 第 2 西非旅 | Britain | infantry | 1 | 52 | 175 | B 类（需 custom 原语） | 抽牌/花费修正/部署： |
| P0 | 42 | `bombing_raid` | 轰炸突袭 | Japan | order | 4 | 51 | 51 | A 类（模板可覆盖） | 伤害/光环/持续增益 |
| P0 | 43 | `island_defense` | 岛屿防御 | Japan | order | 4 | 51 | 106 | A 类（模板可覆盖） | 抽牌/条件/属性增减 |
| P0 | 44 | `216th_guards` | 近卫步兵第 216 团 | Soviet | infantry | 3 | 50 | 138 | B 类（需 custom 原语） | 伤害/抽牌/事件触发 |
| P0 | 45 | `monastyr` | 修道院行动 | Soviet | order | 8 | 50 | 50 | B 类（需 custom 原语） | 消灭/对战词条数（战斗关键字计数） |
| P0 | 46 | `leopold` | 利奥波德 | Germany | artillery | 10 | 49 | 49 | A 类（模板可覆盖） | 手牌操作/返回/撤退/部署： |
| P0 | 47 | `kurume_regiment` | 久留米联队 | Japan | infantry | 2 | 49 | 86 | A 类（模板可覆盖） | 亡计： |
| P0 | 48 | `queens_own` | 女王直属卡梅伦高地人团 | Britain | infantry | 7 | 49 | 49 | A 类（模板可覆盖） | 卡组操作（洗入/置顶/构筑外）/返回/撤退/部署： |
| P0 | 49 | `mosquito_b_mk_iv` | 蚊式 B Mk IV | Britain | bomber | 4 | 49 | 84 | A 类（模板可覆盖） | 转换/变形/事件触发 |
| P0 | 50 | `war_bonds` | 战争债券 | USA | order | 5 | 48 | 96 | B 类（需 custom 原语） | 指挥点槽/属性增减/抽牌 |
| P1 | 51 | `fw_190_jagdbomber` | Fw 190 A-3/U3 | Germany | fighter | 5 | 47 | 47 | A 类（模板可覆盖） | 手牌操作/返回/撤退/部署： |
| P1 | 52 | `victory_banners` | 胜利旗帜 | Soviet | order | 7 | 47 | 47 | A 类（模板可覆盖） | 指向/指定目标/转换/变形 |
| P1 | 53 | `1st_signal_regiment` | 电信第一联队 | Japan | infantry | 1 | 47 | 47 | A 类（模板可覆盖） | 伤害/消灭/事件触发 |
| P1 | 54 | `t3485_1945` | T-34-85 1945 | Soviet | tank | 6 | 46 | 46 | B 类（需 custom 原语） | 抑制/给予/失去关键字/限制/无法/免疫 |
| P1 | 55 | `extended_barrage` | 持续弹幕 | Soviet | order | 2 | 46 | 108 | A 类（模板可覆盖） | 伤害/指挥点获取/失去/事件触发 |
| P1 | 56 | `capitulation` | 一触即溃 | Germany | order | 9 | 45 | 45 | A 类（模板可覆盖） | 转换/变形/光环/持续增益 |
| P1 | 57 | `production_order` | 生产令 | USA | order | 1 | 45 | 86 | A 类（模板可覆盖） | 手牌操作/加入手牌/抉择： |
| P1 | 58 | `ferocious_assault` | 猛袭 | Japan | order | 2 | 44 | 82 | B 类（需 custom 原语） | 消灭/指挥点槽/条件 |
| P1 | 59 | `336th_guards_naval` | 近卫海军步兵第 336 旅 | Soviet | infantry | 4 | 44 | 44 | B 类（需 custom 原语） | 手牌操作/花费修正/部署： |
| P1 | 60 | `15th_cavalry_regiment` | 骑兵第十五联队 | Japan | infantry | 1 | 44 | 109 | 纯关键字（空文本） | 纯关键字 |
| P1 | 61 | `type_94_tk` | 九四式轻装甲车 | Japan | tank | 1 | 44 | 116 | A 类（模板可覆盖） | 手牌操作/加入手牌/部署： |
| P1 | 62 | `10th_recon` | 搜索第十联队 | Japan | infantry | 2 | 44 | 44 | A 类（模板可覆盖） | 手牌操作/部署：/抽牌 |
| P1 | 63 | `buzz_bomb` | 嗡嗡炸弹 | Germany | order | 1 | 43 | 122 | A 类（模板可覆盖） | 伤害/抽牌/条件 |
| P1 | 64 | `task_force_44` | 第 44 特混舰队 | Anzac | order | 2 | 42 | 112 | B 类（需 custom 原语） | 情报/预报/揭示/伤害/手牌操作 |
| P1 | 65 | `strategic_focus` | 战略重心 | Soviet | order | 7 | 42 | 42 | A 类（模板可覆盖） | 伤害/抉择： |
| P1 | 66 | `expansion` | 扩张 | Japan | order | 1 | 42 | 126 | A 类（模板可覆盖） | 抽牌/条件 |
| P1 | 67 | `gordon_highlanders` | 戈登高地人团 | Britain | infantry | 6 | 41 | 41 | B 类（需 custom 原语） | 手牌操作/部署：/卡组操作（洗入/置顶/构筑外） |
| P1 | 68 | `blitz_doctrine` | 闪击战法 | Germany | order | 2 | 40 | 73 | B 类（需 custom 原语） | 开发（发现）/手牌操作/加入手牌 |
| P1 | 69 | `desert_dust` | 沙尘满目 | Britain | order | 3 | 39 | 39 | A 类（模板可覆盖） | 压制/召唤/加入阵线 |
| P1 | 70 | `44th_silesia` | 西里西亚第 44 团 | Soviet | infantry | 3 | 39 | 74 | B 类（需 custom 原语） | 抽牌/部署：/每有/重复 |
| P1 | 71 | `kv1_1941` | KV-1 1941 | Soviet | tank | 6 | 39 | 39 | A 类（模板可覆盖） | 伤害/抽牌 |
| P1 | 72 | `178th_guard_rifles` | 近卫步兵第 178 团 | Soviet | infantry | 2 | 39 | 90 | A 类（模板可覆盖） | 召唤/加入阵线/亡计： |
| P1 | 73 | `fortification` | 防御工事 | Britain | order | 3 | 39 | 95 | A 类（模板可覆盖） | 属性增减 |
| P1 | 74 | `crossfire` | 交叉火力 | Germany | order | 5 | 38 | 48 | A 类（模板可覆盖） | 伤害/光环/持续增益/消灭 |
| P1 | 75 | `shelling` | 炮击 | Britain | order | 5 | 38 | 38 | B 类（需 custom 原语） | 伤害/压制/光环/持续增益 |
| P1 | 76 | `ki46_dinah_iii` | Ki-46 百式司侦 | Japan | fighter | 3 | 38 | 38 | B 类（需 custom 原语） | 抽牌/花费修正/部署： |
| P1 | 77 | `238th_regiment` | 步兵第二百三十八联队 | Japan | infantry | 2 | 38 | 93 | B 类（需 custom 原语） | 伤害/伤害修正/双倍/无视/指挥点槽 |
| P1 | 78 | `5th_sasebo_snlf` | 佐镇第五特别陆战队 | Japan | infantry | 1 | 37 | 70 | B 类（需 custom 原语） | 属性增减/事件触发/海军属性 |
| P1 | 79 | `stz5_katyusha` | STZ-5 喀秋莎 | Soviet | artillery | 3 | 37 | 64 | A 类（模板可覆盖） | 伤害/手牌操作/加入手牌 |
| P1 | 80 | `banzai` | 万岁冲锋 | Japan | order | 6 | 37 | 37 | A 类（模板可覆盖） | 消灭 |
| P1 | 81 | `strategic_bombing` | 战略轰炸 | USA | order | 6 | 36 | 36 | B 类（需 custom 原语） | 伤害/指挥点槽 |
| P1 | 82 | `southern_plan` | 南进计划 | Japan | order | 4 | 36 | 69 | B 类（需 custom 原语） | 指挥点槽/属性增减 |
| P1 | 83 | `komet` | Me 163 彗星 | Germany | fighter | 6 | 36 | 36 | A 类（模板可覆盖） | 手牌操作/返回/撤退/事件触发 |
| P1 | 84 | `kriegsmarine` | 战争海军 | Germany | order | 7 | 36 | 36 | A 类（模板可覆盖） | 伤害/弃牌/手牌操作 |
| P1 | 85 | `salamander` | He 162 蝾螈 | Germany | fighter | 4 | 35 | 35 | B 类（需 custom 原语） | 移出战场/事件触发 |
| P1 | 86 | `liberation` | 解放 | France | order | 3 | 35 | 69 | B 类（需 custom 原语） | 加入手牌/塞入敌方卡组/属性增减 |
| P1 | 87 | `75th_rifle_regiment` | 步兵第 75 团 | Soviet | infantry | 6 | 35 | 35 | B 类（需 custom 原语） | 复制/事件触发/光环/持续增益 |
| P1 | 88 | `audacity` | 无所畏惧 | Japan | order | 3 | 35 | 35 | A 类（模板可覆盖） | 召唤/加入阵线/伤害/设定数值 |
| P1 | 89 | `tigercat` | F7F 虎猫 | USA | fighter | 6 | 34 | 34 | A 类（模板可覆盖） | 召唤/加入阵线/事件触发 |
| P1 | 90 | `hampshire_regiment` | 汉普郡团 | Britain | infantry | 6 | 34 | 72 | B 类（需 custom 原语） | 开发（发现）/部署： |
| P1 | 91 | `phoney_war` | 假战 | France | order | 5 | 34 | 63 | A 类（模板可覆盖） | 手牌操作 |
| P1 | 92 | `909th_roslavl` | 罗斯拉夫尔第 909 团 | Soviet | infantry | 5 | 34 | 34 | A 类（模板可覆盖） | 给予/失去关键字/光环/持续增益 |
| P1 | 93 | `type_93` | 九三式装甲车 | Japan | tank | 1 | 34 | 86 | A 类（模板可覆盖） | 属性增减/光环/持续增益 |
| P1 | 94 | `panzer_35t` | 35(t) 坦克 | Germany | tank | 2 | 34 | 82 | B 类（需 custom 原语） | 属性增减/行动花费/部署： |
| P1 | 95 | `special_attack` | 特攻 | Japan | order | 2 | 34 | 34 | B 类（需 custom 原语） | 指挥点槽/光环/持续增益/单位获得持续能力 |
| P1 | 96 | `us_military_research` | 美国军事研发 | USA | order | 3 | 33 | 33 | A 类（模板可覆盖） | 手牌操作/加入手牌/抉择： |
| P1 | 97 | `uss_missouri` | USS 密苏里号 | USA | order | 3 | 33 | 33 | A 类（模板可覆盖） | 消灭/返回/撤退/光环/持续增益 |
| P1 | 98 | `type_94_tk_early` | 九四式轻装甲车早期型 | Japan | tank | 1 | 33 | 64 | A 类（模板可覆盖） | 伤害/属性增减/事件触发 |
| P1 | 99 | `alpenfestung` | 阿尔卑斯要塞 | Germany | order | 7 | 33 | 33 | B 类（需 custom 原语） | 设定数值/卡组操作（洗入/置顶/构筑外）/移出战场 |
| P1 | 100 | `shibata_regiment` | 新发田联队 | Japan | infantry | 1 | 33 | 102 | B 类（需 custom 原语） | 伤害/反制/事件触发 |
| P1 | 101 | `raf_mustang` | RAF 野马 | Britain | fighter | 4 | 33 | 33 | B 类（需 custom 原语） | 属性增减/花费修正/抽牌 |
| P1 | 102 | `repel_the_attack` | 击退进攻 | Anzac | order | 4 | 32 | 55 | A 类（模板可覆盖） | 返回/撤退/光环/持续增益/手牌操作 |
| P1 | 103 | `colossus` | 巨人计算机 | Britain | order | 1 | 32 | 54 | B 类（需 custom 原语） | 卡组操作（洗入/置顶/构筑外）/塞入敌方卡组/复制 |
| P1 | 104 | `on_the_ascent` | 如日方升 | Japan | order | 3 | 32 | 32 | A 类（模板可覆盖） | 消灭 |
| P1 | 105 | `nzans` | 新西兰陆军护理队 | Anzac | order | 3 | 32 | 90 | B 类（需 custom 原语） | 属性增减/指挥点槽 |
| P1 | 106 | `blitzkrieg` | 闪电战 | Germany | order | 3 | 32 | 62 | B 类（需 custom 原语） | 属性增减/行动花费/光环/持续增益 |
| P1 | 107 | `the_commonwealth` | 英联邦 | Britain | order | 12 | 32 | 32 | A 类（模板可覆盖） | 伤害/条件/抽牌 |
| P1 | 108 | `40_panzergrenadier` | 第 40 装甲掷弹兵团 | Germany | infantry | 4 | 31 | 44 | A 类（模板可覆盖） | 手牌操作/返回/撤退/部署： |
| P1 | 109 | `blue_legion` | 蓝色军团 | Germany | infantry | 3 | 31 | 57 | A 类（模板可覆盖） | 指挥点获取/失去/事件触发/光环/持续增益 |
| P1 | 110 | `the_anzac_spirit` | 澳新军团精神 | Anzac | order | 8 | 31 | 51 | B 类（需 custom 原语） | 伤害/光环/持续增益/抽牌 |
| P1 | 111 | `554th_rifle_regiment` | 步兵第 554 团 | Soviet | infantry | 0 | 31 | 102 | 纯关键字（空文本） | 纯关键字 |
| P1 | 112 | `to_the_last_man` | 至死方休 | Japan | order | 10 | 31 | 31 | A 类（模板可覆盖） | 消灭 |
| P1 | 113 | `15th_wolves_regiment` | 第 15 狼步兵团 | Poland | infantry | 5 | 30 | 53 | A 类（模板可覆盖） | 转换/变形/部署：/抽牌 |
| P1 | 114 | `sd_kfz_10_pak_38` | Sd Kfz 10 PaK 38 | Germany | tank | 1 | 30 | 96 | A 类（模板可覆盖） | 属性增减/事件触发/光环/持续增益 |
| P1 | 115 | `mi5` | 军情五处 | Britain | order | 3 | 30 | 53 | A 类（模板可覆盖） | 抽牌/卡组操作（洗入/置顶/构筑外）/手牌操作 |
| P1 | 116 | `bpf` | 英国太平洋舰队 | Britain | order | 2 | 30 | 30 | B 类（需 custom 原语） | 开发（发现）/海军属性 |
| P1 | 117 | `fifth_ohio` | 俄亥俄州第 5 步兵团 | USA | infantry | 3 | 29 | 29 | A 类（模板可覆盖） | 消灭/部署： |
| P1 | 118 | `j2m_raiden` | J2M 雷电局地战 | Japan | fighter | 4 | 29 | 50 | B 类（需 custom 原语） | 属性增减/行动花费/反制 |
| P1 | 119 | `little_cobra` | P-39 小蛇 | Soviet | fighter | 3 | 29 | 45 | A 类（模板可覆盖） | 消灭/部署：/随机 |
| P1 | 120 | `shifting_attack` | 转变攻击 | Germany | order | 2 | 29 | 29 | B 类（需 custom 原语） | 手牌操作/返回/撤退/光环/持续增益 |
| P1 | 121 | `845th_rifles` | 步兵第 845 团 | Soviet | infantry | 2 | 29 | 63 | A 类（模板可覆盖） | 治疗/修复/事件触发 |
| P1 | 122 | `55th_rifles` | 步兵第 55 团 | Soviet | infantry | 3 | 29 | 63 | A 类（模板可覆盖） | 指挥点获取/失去/亡计：/事件触发 |
| P1 | 123 | `convoy_hx_175` | HX 175 护航队 | Britain | order | 3 | 29 | 69 | A 类（模板可覆盖） | 抽牌 |
| P1 | 124 | `ki83` | Ki-83 试制重战 | Japan | fighter | 4 | 29 | 29 | A 类（模板可覆盖） | 抽牌/事件触发 |
| P1 | 125 | `stranglehold` | 截断 | Germany | countermeasure | 1 | 28 | 41 | A 类（模板可覆盖） | 指挥点获取/失去/事件触发 |
| P1 | 126 | `18_infantry_regiment` | 第 18 步兵团 | Germany | infantry | 1 | 28 | 78 | A 类（模板可覆盖） | 移动/换线/入场/部署： |
| P1 | 127 | `the_hammer` | 铁锤 | Soviet | order | 3 | 28 | 62 | A 类（模板可覆盖） | 伤害 |
| P1 | 128 | `3rd_carpathian` | 喀尔巴阡第 3 步兵营 | Poland | infantry | 4 | 28 | 97 | A 类（模板可覆盖） | 转换/变形/部署：/光环/持续增益 |
| P1 | 129 | `dingo` | 丁格犬侦察车 | Anzac | tank | 1 | 28 | 81 | A 类（模板可覆盖） | 抽牌/属性增减/事件触发 |
| P1 | 130 | `overcast` | 阴云密布 | USA | order | 2 | 28 | 63 | B 类（需 custom 原语） | 情报/预报/揭示/属性增减/抽牌 |
| P1 | 131 | `protected_convoy` | 护送航运 | Britain | order | 1 | 28 | 73 | A 类（模板可覆盖） | 手牌操作/加入手牌 |
| P1 | 132 | `panzer_ia` | 一号坦克 A 型 | Germany | tank | 1 | 27 | 70 | A 类（模板可覆盖） | 抽牌/部署：/光环/持续增益 |
| P1 | 133 | `ultra` | ULTRA | Britain | countermeasure | 3 | 27 | 27 | B 类（需 custom 原语） | 抽牌/反制/事件触发 |
| P1 | 134 | `storm_division` | 岚兵团 | Japan | infantry | 8 | 27 | 27 | A 类（模板可覆盖） | 属性增减/光环/持续增益 |
| P1 | 135 | `last_ditch_force` | 最后一搏 | Japan | order | 10 | 27 | 27 | B 类（需 custom 原语） | 消灭/指挥点槽/属性增减 |
| P1 | 136 | `20_panzergrenadier` | 第 20 装甲掷弹兵团 | Germany | infantry | 5 | 26 | 44 | A 类（模板可覆盖） | 手牌操作/加入手牌/部署： |
| P1 | 137 | `black_prince` | A43 黑王子 | Britain | tank | 5 | 26 | 26 | B 类（需 custom 原语） | 限制/无法/免疫/返回/撤退/部署： |
| P1 | 138 | `for_freedom` | 为了自由 | USA | order | 1 | 26 | 48 | A 类（模板可覆盖） | 抽牌/属性增减 |
| P1 | 139 | `km_admiral_hipper` | KM 希佩尔海军上将号 | Germany | order | 5 | 26 | 26 | B 类（需 custom 原语） | 手牌操作/返回/撤退/抽牌 |
| P1 | 140 | `front_formation` | 方面军 | Soviet | order | 9 | 26 | 26 | B 类（需 custom 原语） | 总部获得持续能力/单位获得持续能力 |
| P1 | 141 | `commit_the_reserves` | 穷兵黩武 | Japan | order | 2 | 26 | 42 | B 类（需 custom 原语） | 指挥点槽/消灭 |
| P1 | 142 | `28th_infantry_regiment` | 第 28 步兵团 | Poland | infantry | 2 | 26 | 64 | A 类（模板可覆盖） | 属性增减/事件触发 |
| P1 | 143 | `58th_infantry_regiment` | 步兵第五十八联队 | Japan | infantry | 1 | 26 | 52 | A 类（模板可覆盖） | 属性增减/给予/失去关键字/事件触发 |
| P1 | 144 | `kawanishi_h8k` | H8K 二式大艇 | Japan | bomber | 6 | 26 | 26 | B 类（需 custom 原语） | 抽牌/情报/预报/揭示/事件触发 |
| P1 | 145 | `b29_superfortress` | B-29 超级堡垒 | USA | bomber | 12 | 25 | 25 | A 类（模板可覆盖） | 伤害/部署：/随机 |
| P1 | 146 | `z_special_unit` | Z 队 | Anzac | order | 3 | 25 | 49 | A 类（模板可覆盖） | 伤害/手牌操作/属性增减 |
| P1 | 147 | `churchill_mk_iii_avre` | 丘吉尔 Mk III AVRE | Britain | tank | 7 | 25 | 25 | A 类（模板可覆盖） | 返回/撤退/部署：/光环/持续增益 |
| P1 | 148 | `bloody_sickle` | 血红镰刀 | Soviet | order | 1 | 25 | 79 | A 类（模板可覆盖） | 伤害/抽牌 |
| P1 | 149 | `raid` | 奇袭 | Britain | order | 1 | 25 | 42 | B 类（需 custom 原语） | 手牌操作/属性增减/花费修正 |
| P1 | 150 | `593rd_jasco` | 第 593 联合通信连 | USA | infantry | 1 | 24 | 24 | B 类（需 custom 原语） | 伤害修正/双倍/无视 |
| P2 | 151 | `thunderbolt` | 霹雳师 | USA | infantry | 3 | 24 | 24 | A 类（模板可覆盖） | 抽牌/部署：/卡组操作（洗入/置顶/构筑外） |
| P2 | 152 | `conquest` | 征服 | Germany | order | 2 | 24 | 24 | A 类（模板可覆盖） | 抽牌/每有/重复/光环/持续增益 |
| P2 | 153 | `winter_offensive` | 冬季攻势 | Soviet | order | 7 | 24 | 24 | A 类（模板可覆盖） | 伤害 |
| P2 | 154 | `the_glamour_boys` | 魅力男孩高地人团 | Britain | infantry | 5 | 24 | 58 | A 类（模板可覆盖） | 属性增减/部署： |
| P2 | 155 | `hms_sceptre` | HMS 权杖号 | Britain | countermeasure | 2 | 24 | 58 | B 类（需 custom 原语） | 手牌操作/返回/撤退/转换/变形 |
| P2 | 156 | `22_infantry_regiment` | 第 22 步兵团 | Germany | infantry | 2 | 24 | 37 | A 类（模板可覆盖） | 抽牌/事件触发/条件 |
| P2 | 157 | `pams` | 警察辅助信使队 | Britain | order | 1 | 24 | 62 | B 类（需 custom 原语） | 花费修正/开发（发现） |
| P2 | 158 | `seaborne_invasion` | 海上入侵 | USA | order | 8 | 23 | 23 | A 类（模板可覆盖） | 召唤/加入阵线/返回/撤退/随机 |
| P2 | 159 | `naval_battle` | 海战 | USA | order | 7 | 23 | 23 | A 类（模板可覆盖） | 消灭/抉择： |
| P2 | 160 | `second_front` | 第二战线 | Germany | order | 4 | 23 | 54 | B 类（需 custom 原语） | 移出战场/返回/撤退/复制 |
| P2 | 161 | `duress` | 胁迫 | USA | order | 0 | 23 | 44 | A 类（模板可覆盖） | 抑制 |
| P2 | 162 | `attack_in_the_colonies` | 进攻殖民地 | Italy | order | 4 | 23 | 44 | A 类（模板可覆盖） | 伤害/属性增减 |
| P2 | 163 | `iron_from_the_north` | 北方铁矿 | Germany | order | 1 | 23 | 83 | A 类（模板可覆盖） | 指挥点获取/失去/条件/光环/持续增益 |
| P2 | 164 | `211th_tokyo` | 步兵第二百一十一联队 | Japan | infantry | 2 | 23 | 44 | 纯关键字（空文本） | 纯关键字 |
| P2 | 165 | `15_aufklrung` | 第 15 侦察营 | Germany | infantry | 2 | 22 | 61 | B 类（需 custom 原语） | 开发（发现）/反制/部署： |
| P2 | 166 | `30_infantry_regiment` | 第 30 步兵团 | Germany | infantry | 1 | 22 | 71 | B 类（需 custom 原语） | 属性增减/行动花费/事件触发 |
| P2 | 167 | `windhund_division` | 灰猎犬师 | Germany | infantry | 5 | 22 | 22 | B 类（需 custom 原语） | 消灭/事件触发/额外行动/再行动 |
| P2 | 168 | `call_to_the_colonies` | 呼叫殖民地 | France | order | 4 | 22 | 47 | A 类（模板可覆盖） | 抽牌/属性增减/抉择： |
| P2 | 169 | `panzer_iia` | 二号坦克 A 型 | Germany | tank | 1 | 22 | 59 | 纯关键字（空文本） | 纯关键字 |
| P2 | 170 | `rush` | 强袭 | Soviet | order | 1 | 22 | 57 | A 类（模板可覆盖） | 伤害/光环/持续增益/随机 |
| P2 | 171 | `anders_army` | 安德斯军团 | Poland | order | 1 | 22 | 65 | A 类（模板可覆盖） | 抽牌/伤害 |
| P2 | 172 | `last_rites` | 最后的仪式 | Japan | order | 3 | 21 | 21 | A 类（模板可覆盖） | 卡组操作（洗入/置顶/构筑外） |
| P2 | 173 | `15th_motor_rifles` | 摩托化步兵第 15 团 | Soviet | infantry | 3 | 21 | 37 | B 类（需 custom 原语） | 给予/失去关键字/限制/无法/免疫 |
| P2 | 174 | `kyoto_regiment` | 京都联队 | Japan | infantry | 3 | 21 | 42 | B 类（需 custom 原语） | 移出战场/部署： |
| P2 | 175 | `orp_byskawica` | ORP 闪电号 | Poland | order | 3 | 21 | 40 | B 类（需 custom 原语） | 塞入敌方卡组/复制/设定数值 |
| P2 | 176 | `kikka` | 试制橘花 | Japan | fighter | 7 | 21 | 21 | A 类（模板可覆盖） | 卡组操作（洗入/置顶/构筑外）/亡计： |
| P2 | 177 | `n1kj_shiden` | N1K-J 紫电局地战 | Japan | fighter | 5 | 21 | 21 | 纯关键字（空文本） | 纯关键字 |
| P2 | 178 | `fog_of_war` | 战争迷雾 | Britain | order | 4 | 21 | 36 | B 类（需 custom 原语） | 移出战场/卡组操作（洗入/置顶/构筑外）/复制 |
| P2 | 179 | `738_jger_regiment` | 第 738 猎兵团 | Germany | infantry | 1 | 21 | 54 | A 类（模板可覆盖） | 部署：/抽牌/消灭 |
| P2 | 180 | `u16` | U-16 | Germany | order | 2 | 20 | 56 | B 类（需 custom 原语） | 返回/撤退/抽牌/卡组操作（洗入/置顶/构筑外） |
| P2 | 181 | `scouting_party` | 侦察队 | Japan | order | 3 | 20 | 36 | A 类（模板可覆盖） | 召唤/加入阵线 |
| P2 | 182 | `the_dagger_strikes` | 单刀直入 | Italy | order | 3 | 20 | 36 | A 类（模板可覆盖） | 消灭/压制/条件 |
| P2 | 183 | `supply_shortage` | 物资短缺 | Britain | order | 3 | 20 | 37 | B 类（需 custom 原语） | 光环/持续增益/单位获得持续能力 |
| P2 | 184 | `dowding_system` | 道丁系统 | Britain | countermeasure | 3 | 20 | 38 | B 类（需 custom 原语） | 反制/事件触发 |
| P2 | 185 | `overpower` | 摧枯拉朽 | Japan | order | 2 | 20 | 22 | A 类（模板可覆盖） | 消灭 |
| P2 | 186 | `air_land_sea` | 海陆空 | Japan | order | 1 | 20 | 55 | B 类（需 custom 原语） | 开发（发现）/指挥点槽 |
| P2 | 187 | `old_hares` | 老兔子 | Germany | order | 2 | 20 | 54 | A 类（模板可覆盖） | 属性增减/光环/持续增益 |
| P2 | 188 | `bomber_mafia` | 轰炸机黑手党 | USA | order | 4 | 19 | 32 | B 类（需 custom 原语） | 开发（发现）/伤害/指挥点获取/失去 |
| P2 | 189 | `the_professionals` | 专家步兵团 | USA | infantry | 7 | 19 | 19 | B 类（需 custom 原语） | 属性增减/亡计：/随机 |
| P2 | 190 | `the_rock_of_gibraltar` | 直布罗陀巨岩 | Britain | order | 4 | 19 | 19 | B 类（需 custom 原语） | 塞入敌方卡组/开发（发现） |
| P2 | 191 | `uss_the_sullivans` | USS 沙利文兄弟号 | USA | order | 2 | 19 | 70 | A 类（模板可覆盖） | 卡组操作（洗入/置顶/构筑外）/属性增减/抽牌 |
| P2 | 192 | `surveil` | 监视 | Soviet | order | 1 | 19 | 48 | A 类（模板可覆盖） | 手牌操作/指向/指定目标/转换/变形 |
| P2 | 193 | `sabotage` | 毁坏 | France | order | 7 | 19 | 42 | B 类（需 custom 原语） | 弃牌/手牌操作/复制 |
| P2 | 194 | `wellington` | 威灵顿 | Britain | bomber | 7 | 19 | 19 | B 类（需 custom 原语） | 手牌操作/属性增减/花费修正 |
| P2 | 195 | `fast_heinz` | 古德里安 | Germany | order | 1 | 19 | 19 | A 类（模板可覆盖） | 属性增减/光环/持续增益 |
| P2 | 196 | `road_to_berlin` | 柏林之路 | Soviet | order | 1 | 19 | 19 | B 类（需 custom 原语） | 总部获得持续能力/单位获得持续能力 |
| P2 | 197 | `cruiser_scouts` | 巡洋舰侦察机 | Japan | order | 2 | 19 | 41 | B 类（需 custom 原语） | 压制/情报/预报/揭示/指挥点获取/失去 |
| P2 | 198 | `counter_strike` | 反袭 | USA | countermeasure | 2 | 18 | 18 | A 类（模板可覆盖） | 消灭/事件触发 |
| P2 | 199 | `panther_a_zimmerit` | 豹式坦克 A 型 防磁装甲型 | Germany | tank | 3 | 18 | 18 | A 类（模板可覆盖） | 事件触发 |
| P2 | 200 | `the_white_death` | 白色死神 | Finland | order | 4 | 18 | 26 | A 类（模板可覆盖） | 抑制/光环/持续增益/召唤/加入阵线 |

## 2. Top 200 的阵营分布

| 阵营 | 卡数 |
| --- | --- |
| Japan | 44 |
| Germany | 44 |
| Britain | 39 |
| Soviet | 33 |
| USA | 22 |
| Anzac | 6 |
| Poland | 5 |
| France | 4 |
| Italy | 2 |
| Finland | 1 |

## 3. 使用方式（阶段二）

1. 打开 `src/engine/cards/<faction>.ts`，按本表 P0 → P1 → P2 顺序写脚本；每张卡上方写「中文原文：…」。
2. 若卡属于 B 类（需 custom 原语），先写 `{op:'custom', id:'<原语>', params:{...}}` 占位，并在 `docs/CARD_COVERAGE.md` 第 6 节登记；等执行器支持后替换为原生 op。
3. 纯关键字卡（覆盖桶 = 纯关键字）不需要脚本，直接依靠 `attributes` → `normalizeKeywords` 生效。
4. 每完成一批：重跑 `_work/report.mjs`，把本文件第 0 节的数字与 `docs/CARD_COVERAGE.md` 第 9 节的进度表更新为实际值。
5. 卡牌脚本写完一批后自检：`npx tsc --noEmit` + 用带有该卡的卡组跑一局 AI 自对弈（日志无 `custom` 未实现警告）。
