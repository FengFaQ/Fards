# Fards

网页版 KARDS 卡组对战测试游戏 —— 用于快速验证卡组构筑与对局节奏的浏览器端工具。
技术栈：TypeScript + React + Vite，构建产物部署到 GitHub Pages。

> **项目状态：开发中。** 本文件为占位版本，最终文案由项目 owner 定稿。

- 仓库：<https://github.com/FengFaQ/Fards>
- 线上地址（Pages）：<https://fengfaq.github.io/Fards/>

## 本地开发

```bash
npm install       # 安装依赖
npm run dev       # 启动开发服务器（Vite）
npm run build     # 生产构建，输出到 dist/
```

其他脚本以 `package.json` 中的定义为准（例如 `npm run preview`、`npm run typecheck`、`npm test`）。

## 构建与部署

- 部署方式：GitHub Actions → GitHub Pages。
- 工作流：[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)，触发条件为 `main` 分支 push 或手动 `workflow_dispatch`。
- 流程：Node 22 → `npm ci`（无 `package-lock.json` 时回退 `npm install`）→ `npm run build` → 上传 `dist/` 并以 Pages 工件发布。
- Pages 由仓库 Settings → Pages 以 `build_type: workflow` 模式启用。
- 仓库强制 `core.autocrlf=false`，避免 Windows 换行污染部署产物。

### 资源文件提交策略（当前决定）

- `node_modules/`、`dist/`、`_work/` 不入库（见 `.gitignore`）。
- **卡牌图片与大体积 JSON 暂时直接入库**，以简化首屏部署流程；若仓库体积或单文件大小触及 GitHub 限制（100 MB/文件、建议 <1 GB/仓库），改为 Git LFS 或在 CI 中由脚本生成。
- `_work/` 为构建期临时目录，永不提交。

## 免责声明

本项目是**非官方同人项目**，与 **1939 Games 无任何隶属、授权、赞助或背书关系**，不代表也不代替官方产品。
KARDS™ 及其相关卡牌名称、美术素材、音频、商标的版权归 **1939 Games** 所有。本项目不主张任何素材所有权。

本项目仅供卡组构筑测试与个人娱乐用途，**不进行任何形式的收费**（无广告、无赞助、无打赏、无内购、无付费版本）。

### 使用边界（硬性）

- **禁止商业化**：不得将本仓库或其部署产物用于任何盈利目的。
- **反对法西斯主义**：本项目以二战为题材，**明确反对一切法西斯主义、侵略战争与战争罪行**。任何卡牌描述、社区投稿、对战文本不得出现宣扬极端民族主义的内容。
- **禁止仇恨与辱骂**：不得利用本项目发布歧视、仇恨、辱骂或骚扰性内容。
- 素材依据 1939 Games 的 [Community Content Policy](https://support.kards.com/hc/en-us/articles/360027838532-KARDS-Community-License) 精神使用。
- **撤下通道**：若权利人或官方认为本项目内容不当，请通过仓库 Issue 联系维护者，我们将在 24 小时内配合删除或暂停部署。

### Disclaimer (English)

> *Fards* is an **unofficial, non-commercial fan project**, not affiliated with, endorsed by,
> sponsored by, or associated with **1939 Games**. KARDS™ and all related card images, names,
> artwork, audio and trademarks are the property of **1939 Games ehf.**
>
> This project is provided purely for deck-building tests and personal entertainment. It is
> **not monetized in any form** (no ads, sponsorship, donations, in-app purchases or paid tiers).
>
> This project **condemns fascism, wars of aggression and war crimes**. It must not be used to
> promote extreme nationalism, hate speech, harassment or discrimination.
>
> Game assets are used in the spirit of 1939 Games' [Community Content Policy](https://support.kards.com/hc/en-us/articles/360027838532-KARDS-Community-License).
> Rights holders may request removal via a repository issue; we will comply within 24 hours.
>
> The source code is licensed **AGPL-3.0**; that license covers original code only, not
> third-party game assets. See [NOTICE](NOTICE) for attributions.

## 许可证

本项目以 **GNU Affero General Public License v3.0 (AGPL-3.0)** 开源，全文见 [LICENSE](LICENSE)。
