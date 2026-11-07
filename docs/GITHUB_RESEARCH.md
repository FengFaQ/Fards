# Fards · 开源情报研究报告（GitHub / 素材 / 许可）

> 采集时间：2026-11-07 · 采集方式：`gh api`（账号 FengFaQ，已认证）+ PowerShell `Invoke-WebRequest` + `repak v0.2.3` 实测
> 星数/更新时间均为采样时点数据。项目定位：网页版 KARDS 卡牌对战测试游戏（TS/React/Vite，AGPL-3.0，GitHub Pages）。

## 0. 结论先行（TL;DR）

1. **没有任何可直接嵌入的 TS 版 KARDS 对战引擎**。现有实现要么是其他语言（Python/C#）、要么无 license、要么只做了一半。引擎必须自研；可复用面只有三块：**卡牌数据管道、deck code 编解码、卡图/字体/音效素材**。
2. **卡组导出图走浏览器端 DOM → PNG**：`snapdom`（首选）/ `html-to-image`（备选）；A4 打印不要出位图，用 `@page` + `window.print()` 出矢量 PDF。
3. **不要碰 7.9GB 的 pak**：实测索引已被 AES 加密，无公开 key，不值得为音效投入。素材改走「卡图入库 + CDN 兜底」：卡图已镜像到 `public/cards/*.webp`（见 §5.3），音效走 CC0，字体走 OFL 直链。

---

## 1. KARDS 生态仓库

| 仓库 | License | ★ | 最近更新 | 可复用点 | 集成成本 | 结论 |
|---|---|---|---|---|---|---|
| [Tuning-Luna/kards-decks-collection-scraper](https://github.com/Tuning-Luna/kards-decks-collection-scraper) | MIT | 11 | 2026-09-11 | 官方 GraphQL 端点、卡图 CDN 模板、分页/去重/断点续爬 | 0.5d（一次性跑脚本） | **采用**（取端点与 URL 规则） |
| [earmer/kards-emulator](https://github.com/earmer/kards-emulator) | 无 | 0 | 2026-09-08 | TS strict 纯逻辑分层：`cards/`、`engine/abilities`、`triggers`、`effects`；1613 卡快照 | 读 0.5d | **只读参考**（无 license，不可拷代码） |
| [Infinovast/kards-toolbox](https://github.com/Infinovast/kards-toolbox) | MIT | 2 | 2026-11-03 | `src/lib/deckCode.ts`：TS 版 `%%` 卡组码编解码（含测试） | 0.5d | **采用** |
| [PJ1059/KARDS-Deck-Tracker](https://github.com/PJ1059/KARDS-Deck-Tracker) | NOASSERTION | 1 | 2026-08-08 | 同款解析器 `app/lib/deck-code.ts`（格式已提取，见 §1.1） | — | 只读参考 |
| [Liuhunck/Kards-Simulator](https://github.com/Liuhunck/Kards-Simulator) | MIT | 4 | 2026-03-09 | 对局规则细节：deploy/advance/attack/credits、种子回放脚本 | 读 0.5d | 规则参考（Python） |
| [CraftSoul/kapi](https://github.com/CraftSoul/kapi) | MIT | 2 | 2026-10-20 | Node+Canvas 卡组图生成服务（布局算法可借鉴） | 1d | 参考布局 |
| [CraftSoul/kards-image-tool](https://github.com/CraftSoul/kards-image-tool) | MIT | 4 | 2026-10-20 | 卡图收藏/卡组构筑前端；用 wsrv 代理绕 CORS | 1d | 参考 |
| [Gary-nope/KARDS-Assets](https://github.com/Gary-nope/KARDS-Assets) | 无 | 6 | 2026-10-28 | UI 图标、卡背、`sfx/`、`bgmusic/` 镜像 | — | 慎用（版权） |
| [KaineRyder/Kards-Deck-Collector](https://github.com/KaineRyder/Kards-Deck-Collector) | 无 | 2 | 2026-05-13 | 沉浸式还原 UI、localforage 持久化、卡背管理 | 读 0.5d | 只读参考 |
| [nachoverdon/KardsDeckBuilderCLI](https://github.com/nachoverdon/KardsDeckBuilderCLI) | MIT | 2 | 2019-05-30 | 导出码 → deck builder URL（Haxe，陈旧） | — | 低价值 |
| [hitman-OLD6/OrC-KSD](https://github.com/hitman-OLD6/OrC-KSD) | AGPL-3.0 | 1 | 2026-11-04 | C#/.NET 触发器内核 + KARDS 风格游戏层 | — | 排除（语言不符） |
| [CCB-TEAM/fyserver](https://github.com/CCB-TEAM/fyserver) | MIT | 13 | 2026-11-06 | KARDS 私服（协议逆向） | — | **排除**（法务风险 + 无技术收益） |
| [CCB-TEAM/kards-sim](https://github.com/CCB-TEAM/kards-sim) | 无 | 3 | 2026-09-26 | 蓝图 Kismet 字节码转 C# | — | 排除 |
| [EvanProgramming/Kards-AI](https://github.com/EvanProgramming/Kards-AI) | 无 | 1 | 2026-08-03 | AlphaZero/PUCT 自博弈（Python） | — | 排除（非规则引擎） |

**判断**：KARDS 没有官方公开 API 文档，卡池数据靠 GraphQL 抓取 + 官方 CDN 图；对战规则无权威开源实现（唯一 TS 尝试是 0★ 的半成品 v0.1）。**引擎自研，规则以官方描述 + 本项目 `_work/cards_raw.json` 为准。**

### 1.1 已解析：KARDS 卡组码格式（可直接实现）

```
%%<主国 1-5><盟友 1-9a>|<两字符 import_id 序列，按份数分组，用 ; 分隔>
```

- 国家编号：`1` Germany、`2` Britain、`3` Japan、`4` Soviet、`5` USA、`6` France、`7` Italy、`8` Poland、`9` Finland、`a` Anzac；主国只允许 1–5。
- 卡牌按**份数分组**：第 0 组 = 各 1 张，第 1 组 = 各 2 张，第 2 组 = 各 3 张……组内每张卡用 **2 个字符**（历史遗留的单字符 ID 允许出现在组尾）。
- 示例结构：`%%21|8A8B;3C` → 主国 Britain、盟友 Germany；`8A`、`8B` 各 1 张，`3C` 2 张。
- 本项目数据侧已具备 `import_id` 字段（见 `_work/cards_raw.json`），编解码可直接落地。

### 1.2 数据源（本机实测）

| 资源 | 地址 | 实测 |
|---|---|---|
| 官方 GraphQL | `https://herokuapi.kards.com/graphql` | ⚠️ 本机直连 30s 超时（需代理） |
| 卡图 CDN 模板 | `https://www.kards.com/images/card/v53/{lang}/{card_id}.avif` | ⚠️ 直连超时 |
| 图片代理（推荐） | `https://wsrv.nl/?url=www.kards.com/images/card/v53/zh-Hans/xxx.avif&output=png` | ✅ 200 / 1.3s / `image/png` |
| 第三方图片代理 | `https://1939.kardsdecker.com/img-proxy?url=...` | ✅ 200，但 14s（慢） |

> `wsrv.nl` 顺带解决 CORS 与 AVIF 兼容问题，**建议作为唯一卡图入口**。

---

## 2. 通用 CCG / 卡牌对战引擎（是否值得基于它做）

| 仓库 | License | ★ | 最近更新 | 能力评估 | 集成成本 | 结论 |
|---|---|---|---|---|---|---|
| [boardgameio/boardgame.io](https://github.com/boardgameio/boardgame.io) | MIT | 12,484 | 2026-10-30 | 回合/阶段状态机、回放、随机数种子化；**联机需自建 server**，静态 Pages 不可用；抽象偏棋盘 | 1–2 周 | **不采用**（只借「种子 + 动作日志」思路） |
| [arcomage/arcomage-hd](https://github.com/arcomage/arcomage-hd) | MIT | 192 | 2025-11-15 | **最强的架构参照**：TS+React+Redux+RxJS、卡牌动画、AI、PWA、多语言、11 年维护 | 读 0.5d | **首要参考** |
| [pmndrs/zustand](https://github.com/pmndrs/zustand) | MIT | 58,899 | 2026-11-06 | 轻量 store，适合对局状态 | 0.5d | **推荐** |
| [statelyai/xstate](https://github.com/statelyai/xstate) | MIT | 30,415 | 2026-11-06 | 显式 FSM，可建模回合/战斗阶段 | 2–3d | 可选（重，但可测） |
| [jleclanche/fireplace](https://github.com/jleclanche/fireplace) | AGPL-3.0 | 748 | 2025-12-19 | 炉石引擎，卡牌脚本 DSL 组织方式极佳；**AGPL 与本项目兼容** | 高（Python 跨语言） | 规则建模参考 |
| [HearthSim/SabberStone](https://github.com/HearthSim/SabberStone) | AGPL-3.0 | 290 | 2022-12-08 | C# 炉石模拟器 + AI 搜索 | — | 排除（C#） |
| [0xFableOrg/0xFable](https://github.com/0xFableOrg/0xFable) | BSD-3-Clause-Clear | 108 | 2024-07-21 | 全链 TCG，链下同步 + 卡牌 UI | 读 0.5d | 次要参考 |

**判断**：这类引擎的「通用性」在卡牌游戏上反而变成负担（目标选择、堆叠、连锁、反击窗口都靠 effect 脚本）。自研 reducer + zustand，把规则写成数据驱动的 effect 表，比适配 boardgame.io 更快。**真正该抄的是 arcomage-hd 的分层：规则 / 动画 / AI 三者解耦。**

---

## 3. 卡组概览图 / 导出图（浏览器端 → PNG / A4）

| 方案 | License | ★ | 最近更新 | 适配度 | 集成成本 | 结论 |
|---|---|---|---|---|---|---|
| [zumerlab/snapdom](https://github.com/zumerlab/snapdom) | MIT | 8,229 | 2026-11-04 | DOM→PNG/SVG，速度快，宣传支持 Web 字体、伪元素、Shadow DOM | 0.5d | **首选** |
| [bubkoo/html-to-image](https://github.com/bubkoo/html-to-image) | MIT | 7,274 | 2026-11-02 | 老牌 foreignObject 方案，生态最稳；跨域图需 CORS，Safari 字体偶有坑 | 0.5d | **备选 / 兜底** |
| [qq15725/modern-screenshot](https://github.com/qq15725/modern-screenshot) | MIT | 2,090 | 2026-04-16 | html-to-image 的现代重写，支持缩放/字体嵌入 | 0.5d | 备选 |
| [tsayen/dom-to-image](https://github.com/tsayen/dom-to-image) | NOASSERTION | 10,768 | 2024-04-08 | 已停更 | — | **不用** |
| [vercel/satori](https://github.com/vercel/satori) | MPL-2.0 | 14,165 | 2026-11-06 | JSX→SVG，无浏览器；CSS 子集有限（渐变/滤镜/阴影弱），字体必须内嵌 | 2–3d | 仅服务端 OG 图 |
| [thx/resvg-js](https://github.com/thx/resvg-js) | MPL-2.0 | 2,008 | 2026-06-30 | Node 侧 SVG→位图（配合 satori） | — | 服务端方案 |
| [konvajs/react-konva](https://github.com/konvajs/react-konva) | MIT | 6,444 | 2026-10-15 | Canvas 场景图，导出 `toDataURL`；适合拖拽排版编辑器 | 3–5d | 仅编辑器需要 |
| [fabricjs/fabric.js](https://github.com/fabricjs/fabric.js) | MIT | 31,548 | 2026-11-05 | 同上，更偏设计器 | 3–5d | 仅编辑器需要 |
| [lovell/sharp](https://github.com/lovell/sharp) | Apache-2.0 | 32,829 | 2026-11-05 | Node 原生，**GitHub Pages 用不了** | — | 排除 |

**推荐组合**

1. **卡组图（横向 / 竖向）**：用 CSS Grid 排 DOM（每行 = 费用，或按国家分栏）→ `await document.fonts.ready` → `snapdom.toPng(node, { scale: 2 })`（失败回退 `html-to-image`）→ canvas 叠水印/页脚 → `toBlob` 下载。跨域卡图必须走 `wsrv.nl`（带 CORS）。
2. **A4 打印**：不要出位图。单独 `print.css`：`@page { size: A4; margin: 12mm }`、隐藏工具栏、卡片高度用 `mm` 单位，然后 `window.print()` → 浏览器直接出矢量 PDF（A4 横向 = `size: A4 landscape`）。
3. **不要引入** satori / sharp：本场景没有服务端渲染需求，收益低于字体内嵌与 CSS 子集适配成本。

---

## 4. Unreal pak 资源提取（7.9GB 实测）

**结论：不要做。** 实测证据：

```
文件: C:\Games\KARDS\default\game\kards\Content\Paks\kards-Windows.pak
大小: 7,937,802,817 B
footer @ fileSize-204: pakVersion=11  indexOffset=7,935,448,308  indexSize=514,256
repak v0.2.3 list →
  trying version V11 failed: pak is encrypted but no key was provided
  trying version V10 failed: used version PathHashIndex but pak is version Fnv64BugFix
```

- **pak 索引已 AES 加密**，`repak`/`FModel` 均需 key；`FModel/Unreal-Game-Keys` 仓库中**没有 kards/1939 条目** → 无公开 key。
- 即使拿到 key：7.9GB + Oodle 压缩，需 FModel（GPL-3.0）GUI 或 repak（Apache-2.0）CLI；提取出的音效/UI 属 1939 Games 版权资产，**不能提交进 AGPL 仓库、不能随 GitHub Pages 发布**。
- 收益对比：官方卡图走 `wsrv.nl` 已可用（实测 1.3s），音效用 CC0 包即可，投入产出不成立。

| 工具 | License | ★ | 最近更新 | 说明 |
|---|---|---|---|---|
| [4sval/FModel](https://github.com/4sval/FModel) | GPL-3.0 | 3,346 | 2026-11-02 | UE 资源浏览器（GUI，需 .NET） |
| [trumank/repak](https://github.com/trumank/repak) | Apache-2.0 | 596 | 2026-02-20 | Rust CLI，本次实测所用（支持 `--aes-key`） |
| [panzi/rust-u4pak](https://github.com/panzi/rust-u4pak) | MPL-2.0 | 165 | 2023-02-01 | Rust 版 u4pak |
| [panzi/u4pak](https://github.com/panzi/u4pak) | 无 | 562 | 2022-10-30 | Python 原版，已停更 |
| [AriesLR/PakMaster](https://github.com/AriesLR/PakMaster) | MIT | 46 | 2026-08-18 | repak/retoc 的 GUI 包装 |

> 若后续确实需要官方音效：`Gary-nope/KARDS-Assets` 有 `audio/sfx`、`audio/bgmusic` 镜像，但同样属侵权再分发，**只能本地使用，不得入库**。

---

## 5. 字体与音效（下载地址均实测 HTTP 200）

### 5.1 军事 stencil / 标题字体（Google Fonts 仓库 raw 直链）

| 字体 | 许可 | 直链 | 大小 |
|---|---|---|---|
| Black Ops One | OFL-1.1 | `https://raw.githubusercontent.com/google/fonts/main/ofl/blackopsone/BlackOpsOne-Regular.ttf` | 167 KB |
| Special Elite（打字机） | Apache-2.0 | `https://raw.githubusercontent.com/google/fonts/main/apache/specialelite/SpecialElite-Regular.ttf` | 166 KB |
| Oswald（可变字重） | OFL-1.1 | `https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf` | 172 KB |
| Noto Sans SC（简体中文） | OFL-1.1 | `https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf` | 17.8 MB |
| Bebas Neue | OFL-1.1 | `https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf` | 61 KB |
| Rajdhani（军用 HUD 感） | OFL-1.1 | `https://raw.githubusercontent.com/google/fonts/main/ofl/rajdhani/Rajdhani-Bold.ttf` | 401 KB |
| Anton | OFL-1.1 | `https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf` | 171 KB |
| Staatliches（stencil 风格） | OFL-1.1 | `https://raw.githubusercontent.com/google/fonts/main/ofl/staatliches/Staatliches-Regular.ttf` | 63 KB |
| Teko（可变） | OFL-1.1 | `https://raw.githubusercontent.com/google/fonts/main/ofl/teko/Teko%5Bwght%5D.ttf` | 292 KB |

- 许可正本：把文件名换成 `OFL.txt` / `LICENSE.txt`，例如 `https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/OFL.txt`（实测 4,483 B）。
- 注意：可变字体路径必须编码成 `%5Bwght%5D`；`NotoSansSC` 17.8MB 建议**子集化**（`pyftsubset`）或改用 Google Fonts CSS 分片加载。
- 字体组合建议：标题 = Black Ops One / Staatliches（stencil，配 KARDS 军械库气质）；正文 = Rajdhani 或 Oswald；中文 = Noto Sans SC（子集）。

### 5.2 音效 / 音乐（CC0 与 CC-BY）

| 来源 | 许可 | 地址 | 说明 |
|---|---|---|---|
| Kenney（CC0 全家桶） | CC0-1.0 | `https://kenney.nl/assets/impact-sounds`、`/ui-audio`、`/interface-sounds`、`/music-jingles` | 均实测 200；爆炸/命中用 impact 变调 + 低通即可做炮击感 |
| Freesound（CC0 过滤） | CC0 混 CC-BY | `https://freesound.org/search/?f=license%3A%22Creative+Commons+0%22` | 实测 200；逐条确认许可，CC-BY 需署名 |
| OpenGameArt | CC0 / CC-BY 混合 | `https://opengameart.org/` | 实测 200；下载页标注许可 |
| 兜底：WebAudio 合成 | 无版权风险 | — | 枪声/无线电噪声/打击音可用噪声+包络生成，零素材、零许可 |

**建议**：UI 点击/卡牌落桌 = Kenney UI 包；炮击/机枪 = Kenney impact 变调 + 随机化 pitch；背景氛围 = CC0 ambient loop；不要直接抓官方音效。

### 5.3 卡图入库（已获授权，含实测瓶颈）

| 项 | 结论 |
|---|---|
| 规模 | `docs/_cards.json` 共 **1646** 张，全部有 `image_url`（`/v53/zh-Hans/`），`card_id` 无非法文件名字符、无重复 |
| 目标路径 | `public/cards/<card_id>.webp`（应用 `dataBridge.ts:225` 的兜底是 `cards/<card_id>.avif`，**需改扩展名或去掉扩展名**） |
| 单张体积 | wsrv `output=webp` 约 **30 KB**（实测 14.8MB / 482 张）；全量约 **50 MB**（`dist/` 同步包含，Pages 1GB 限额内） |
| 源可用性 | `www.kards.com` 直连**不可用**（本机 30s 超时；7897/7890/1080 端口无本地代理）；`herokuapi.kards.com` 同样超时 |
| wsrv 代理 | 可用；**并发要克制**。`--parallel 8` 连续打会触发限流（连接 reset / 90s 超时），冷却后恢复 |
| 实测吞吐 | 3–4 并发 + 150–300ms 间隔，稳定 **约 67 张/分钟** → 全量 **约 25 分钟**（首取 9.7s/张是冷启动单请求，不代表批量速率） |
| 格式 | wsrv **不支持输出 AVIF**（`output=avif` 报 400，`format=avif` 被忽略返回 JPEG），故只能存 WebP |

**已提供**：`scripts/fetch-card-images.mjs`（Node 22，零依赖，可断点续传、限速、失败重试）。
用法：`node scripts/fetch-card-images.mjs --concurrency 2 --delay 800`；中断后重跑会自动跳过已存在文件。
若网络能直连 kards.com，加 `--direct` 直接下载原生 `.avif`（省一次转码、体积更小）。

---

## 6. 版权与许可（AGPL-3.0 同人项目的合规边界）

### 6.0 授权记录（2026-11-07，项目维护者决定）

> 维护者明确授权：**KARDS 官方允许二创，本项目可将卡图等素材纳入仓库并公开发布**，前提是同时满足：
> **① 不进行任何收费（含广告、打赏、内购、付费下载）；② 不宣扬极端民族主义；③ 不含辱骂/仇恨内容。**
> 该决定覆盖本报告 §6.2 原先「素材不入库、仅运行时外链」的建议。以下条件为**持续义务**，不满足即应停止发布。

授权成立后仍需守住的三条底线（非技术问题，属发布纪律）：

1. **非商业**：站点不接广告/赞助/打赏，不提供付费版本，不在发布页放收款码。
2. **内容红线**：卡牌描述、社区投稿、对战表情等 UGC 入口必须过滤极端民族主义、仇恨、辱骂内容；本项目以二战为题材，需在 README 与页面标注「反对一切法西斯主义与战争罪行」。
3. **可撤下**：保留 `NOTICE` + 权利人联系通道，收到下架要求 24h 内暂停 Pages 部署。

### 6.1 关键事实

- KARDS 由 **1939 Games** 运营，官方存在 **Community Content Policy**：`https://support.kards.com/hc/en-us/articles/360027838532-KARDS-Community-License`。多个中文 KARDS 工具（CraftSoul、Gary-nope 等）据此在 README 声明。**本机抓取该页 30s 超时，条款原文需人工复核后再引用（不要照抄结论）。**
- **AGPL-3.0 只覆盖你自己的代码与衍生作品，不改变 1939 对卡图/名称/音效的版权**。素材入库属**再分发**，其正当性来自官方 Community Content Policy + 维护者授权（§6.0），而非 AGPL。
- 部署在 GitHub Pages 属**公开发布**；被投诉时站点可被直接下架（DMCA）。因此素材入库必须配套 `NOTICE`、权利人署名、以及「一键暂停」预案（停用 deploy workflow 即可让站点停止更新）。
- AGPL-3.0 第 13 条（网络交互条款）：**通过网页提供服务的 AGPL 程序，必须向用户提供获取源码的入口**（页脚 "Source" 链接即可）。
- 不要用 "KARDS" 作为产品名/域名主体，不要使用官方 Logo 做站点图标，避免商标混淆。

### 6.2 推荐做法（工程侧）

1. 代码 AGPL-3.0 保留；第三方 MIT/MPL 代码在 `NOTICE` 中列出（snapdom / html-to-image / zustand / 字体 OFL）。
2. **卡图入库 + CDN 兜底**：卡图已镜像为 `public/cards/<card_id>.webp`（见 §5.3），运行时优先本地、`wsrv.nl` 兜底（`dataBridge.cardImageSources` 已实现该顺序，需把兜底名 `.avif` 改成 `.webp`）。
3. **音频不入库**：音效走 CC0（§5.2），避免把 1939 的音频资产一并再分发——这是当前授权里**唯一建议保守**的类别。
3. 全站显著位置（页首 / 页脚 / 首次进入弹窗）放免责声明。
4. 明确非商业：不接广告、不做付费、不打赏、不内购。
5. 提供版权方联系方式与撤下通道（邮箱/Issues），承诺收到通知即删。

### 6.3 免责声明草案（英文 · 直接放 README 顶部）

```markdown
> **Disclaimer / Fan Project Notice**
>
> *Fards* is an **unofficial, non-commercial fan project** and is **not affiliated with,
> endorsed by, sponsored by, or associated with 1939 Games** in any way.
>
> KARDS™ and all related card images, names, artwork, audio and other game assets are
> the property of **1939 Games ehf.** and are used here only for non-commercial,
> educational and fan-tool purposes, in the spirit of 1939 Games' Community Content Policy.
> No ownership of these assets is claimed.
>
> This repository is licensed under **AGPL-3.0**; that license applies only to the
> original source code contained here, not to any third-party game assets.
>
> This project is a **technology demo / playtest sandbox**. It does not provide the
> original game, does not distribute the game client, and is not a substitute for it.
>
> If you are a rights holder and want content removed, please open an issue or contact
> the maintainers — we will comply promptly. This project will be taken down or modified
> at the request of the rights holders.
```

### 6.4 免责声明草案（中文 · README 与页面页脚）

```markdown
> **非官方 · 非商业 · 同人测试项目声明**
>
> 本项目 *Fards* 是**非官方、非商业**的爱好者技术验证项目，与 **1939 Games 无任何隶属、
> 授权、赞助或关联关系**，不代表也不代替官方产品。
>
> KARDS™ 及相关卡牌图像、卡名、美术、音频等游戏素材，其版权均归 **1939 Games ehf.**
> 所有。本项目仅在非商业、学习研究与同人工具范围内引用，遵循官方 Community Content
> Policy 的精神，**不主张任何素材所有权**。
>
> 本仓库以 **AGPL-3.0** 开源，该许可仅覆盖仓库内的原创代码，不覆盖任何第三方游戏素材。
>
> 本项目为技术演示 / 对战测试沙盒，不提供原版游戏本体，不分发游戏客户端。
>
> 若权利人认为内容不当，请通过 Issue 或邮件联系维护者，我们将**立即配合删除或修改**。
```

---

## 7. 给实现方的落地清单

1. **卡图加载**：本地 `public/cards/<card_id>.webp` 优先；远程兜底 `https://wsrv.nl/?url=www.kards.com/images/card/v53/{lang}/{card_id}.avif&output=webp`（本机直连 kards.com 超时，请勿硬编码直连）。`dataBridge.ts:225` 的兜底扩展名需从 `.avif` 改为 `.webp`。
2. **卡组码**：按 §1.1 格式实现 `parseDeckCode` / `encodeDeckCode`，参考 `Infinovast/kards-toolbox`（MIT）。
3. **导出图**：`snapdom` → PNG@2x；打印用 `@page`。字体先 `document.fonts.ready`。
4. **状态管理**：`zustand` + 自研 effect 表；规则分层照抄 `arcomage-hd` 的思路（规则/动画/AI 解耦）。
5. **素材**：字体取 §5.1 直链；音效取 Kenney CC0；卡图已按 §5.3 入库（**不提取 pak**）。
6. **合规**：README 顶部放 §6.3/§6.4 声明；页面显著位置标注「非官方、非商业、反对法西斯主义」；页脚放 AGPL 源码链接（§13 要求）。
