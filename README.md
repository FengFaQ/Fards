# Fards · 开源 KARDS 卡组对战测试场

> **非官方同人项目 / Unofficial fan project** — 与 1939 Games 无关，仅供娱乐与卡组测试，非商业用途。
> KARDS 及相关卡牌素材、名称版权归 **1939 Games** 所有。本项目不提供任何绕过付费/解锁的途径，也不包含游戏本体文件。

**在线试玩：<https://fengfaq.github.io/Fards/>**

Fards 是一个纯前端的网页版「KARDS 风格」卡牌对战工具：把你在 KARDS 里构筑的卡组（deck code 直接粘贴）拿到这里，
与 AI 对战测试强度、曲线与配合，或者用来做卡组展示图 / A4 打印清单。全部逻辑在浏览器本地运行，不需要注册、不上传任何数据。

---

## ✨ 功能

| 模块 | 说明 |
|---|---|
| 🃏 卡牌图鉴 | 1646 张卡牌全量档案：阵营 / 类型 / 稀有度 / 费用 / 卡池 / 关键字筛选，中英文搜索，卡面大图与完整效果文本 |
| 🛠 卡组构筑 | 主阵营 + 盟军阵营；按官方规则实时校验（39 张、标准 4 / 限定 3 / 特殊 2 / 精英 1、盟军 ≤ 12 张）；费用曲线、类型分布；本地多卡组保存 |
| 📥 导入导出 | 兼容官方 `deck_code`（`%%51\|...` 分组格式），支持粘贴代码 / URL；导出 deck_code、JSON、出图链接 |
| ⚔️ 对战 AI | 三档难度（新兵 / 老兵 / 王牌）；完整回合制、克雷迪特与行动花费、前线争夺、支援线、士气伤害、反制牌 |
| 🖼 卡组自动出图 | `?action=overview_horizontal` / `overview_vertical` / `print_template`，支持 `deck_code` 与 `deck_slug`，PNG 导出与 A4 打印模板（3 列、裁切线） |
| 📖 规则文档 | [`docs/RULES_SPEC.md`](docs/RULES_SPEC.md)、[`docs/KEYWORDS.md`](docs/KEYWORDS.md)、[`docs/CARD_COVERAGE.md`](docs/CARD_COVERAGE.md) |

## ⚔️ 已实现的对战规则（依据考据校准）

- **总部**：20 点生命；总部位于支援线一侧，只能被前线单位 / 空军 / 炮兵攻击。
- **克雷迪特（指挥点）**：初始 1 槽，每回合 +1，自然增长封顶 12，跳费卡可突破到 24。
- **行动花费**：单位攻击 / 移动需支付其 operation cost；费用可被卡牌效果增减。
- **战线**：支援线各 4 槽；**前线为共享 5 槽、同一时间只有一方占领**；占领前线才能继续向前线增兵。
- **战斗**：步兵 / 坦克只能打相邻战线；炮兵任意战线、无视守护且不受反击；轰炸机任意战线但被敌方战斗机封锁、防守不反击；空军只能被战斗机攻击。
- **关键字**：闪击、守护、烟幕、伏击、奋战（双次攻击）、重甲 N（仅减免单位攻击伤害）、冲击、协力、山地、钳击、隐蔽、情报 N、收缴、动员、老兵。
- **其他**：士气伤害（牌库空时第 n 次抽牌受 n 点）、手牌上限 9、反制牌（敌方出牌 / 攻击时触发）、老兵升级、抉择、延迟效果。

卡牌脚本覆盖：**600 个公开卡组中出现的热门卡（META top200）效果 100% 脚本化**；其余卡牌按数值 / 关键字自动生效，
无法脚本化的长尾效果会优雅降级（见 [`docs/CARD_COVERAGE.md`](docs/CARD_COVERAGE.md) 的进度与缺口说明）。

## 🧱 技术栈

Vite 8 · React 19 · TypeScript 5.9 · Tailwind CSS 4 · zustand 5 · Vitest 5

- 引擎：`src/engine/`（纯 TypeScript、可序列化状态、`applyCommand` 纯函数式 reducer、声明式效果 DSL、可复盘种子随机数）
- 数据层：`src/data/`（卡牌数据、`deck_code` 编解码、构筑校验）
- 界面：`src/pages/` + `src/ui/`（军事档案风格设计系统、战场动画、卡组出图）
- 文档：`docs/`（规则考据、关键字、卡牌覆盖、数据格式、GitHub 侦察报告）

## 🚀 本地运行

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 引擎 / 脚本 / AI 回归测试（40 项）
npm run check      # 编码守卫 + tsc 类型检查 + 测试（提交前跑这个）
npm run build      # 产物在 dist/
```

数据脚本（可选，仓库已带 `public/data/*.json`）：

```bash
npm run data:cards    # 从 kardsdecker 公共 API 抓取全量卡牌
npm run data:images   # 下载卡图（本地开发用；产物不入库，线上走 CDN 代理）
npm run data:verify   # 校验数据完整性 / deck_code 往返
```

## 📁 目录速览

```
src/engine/         对战引擎（状态机 / 目标规则 / 效果执行器 / 卡牌脚本 / AI）
src/data/           卡牌与卡组数据、deck_code 编解码、构筑校验
src/ui/             设计系统、卡牌组件、战场界面、卡组出图
src/pages/          首页 / 图鉴 / 构筑 / 对战 / 出图 / 关于
public/data/        卡牌、卡背、热门卡组数据（可公开分发的事实性数据）
public/fonts/       开源字体（OFL-1.1）
docs/               规则考据与开发文档
scripts/            数据抓取 / 校验脚本
```

## 🔗 数据与素材

- 卡牌数据：<https://1939.kardsdecker.com/api/v1/cards>（公开 API，感谢该站维护者）
- 卡图：KARDS 官方 CDN，经 <https://wsrv.nl> 转码为 WebP（解决跨域与体积问题）。
  卡图**不随仓库分发**；本地开发可自行下载到 `public/cards/`，线上运行时按需加载。
- 字体：[Black Ops One](https://fonts.google.com/specimen/Black+Ops+One) 与 [Oswald](https://fonts.google.com/specimen/Oswald)（SIL Open Font License 1.1）。

## ⚠️ 免责声明

本项目是**非官方、非商业**的同人工具，仅供玩家娱乐与卡组测试使用：

- 与 1939 Games 无任何关联，未获其授权或背书；
- 不包含 KARDS 游戏客户端文件，不提供任何付费内容绕过；
- 卡牌名称、效果文本、美术素材版权归 1939 Games 所有，若权利方要求，将立即移除相关内容；
- 对局结果、AI 表现与官方客户端可能存在差异，仅供测试参考。

## 📄 许可证

[GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）。源码：<https://github.com/FengFaQ/Fards>

依据 AGPL §13，通过网络使用本服务的用户有权获取对应源码 —— 上方仓库链接即为源码。

### 使用边界（硬性） · Usage Boundaries

- **禁止商业化 / No monetization**：不得将本仓库或其部署产物用于任何盈利目的（无广告、赞助、打赏、内购、付费版本）。
- **反对法西斯主义 / Against fascism**：本项目以二战为题材，明确反对一切法西斯主义、侵略战争与战争罪行；不得用于宣扬极端民族主义。
- **禁止仇恨与辱骂 / No hate or abuse**：不得利用本项目发布歧视、仇恨、辱骂或骚扰性内容。
- 素材依据 1939 Games 的 [Community Content Policy](https://support.kards.com/hc/en-us/articles/360027838532-KARDS-Community-License) 精神使用；**撤下通道**：权利人可通过仓库 Issue 联系维护者，我们将在 24 小时内删除或暂停部署。
- 卡牌图片版权归 1939 Games 所有，不主张任何素材所有权；本项目不提供游戏本体文件。
