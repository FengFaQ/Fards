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

本项目是**非官方同人项目**，与 1939 Games 无任何关联，未获其授权或背书。
KARDS 及其相关卡牌名称、美术素材、商标的版权归 **1939 Games** 所有。
本项目仅供卡组构筑测试与个人娱乐用途，不得用于商业用途。

## 许可证

本项目以 **GNU Affero General Public License v3.0 (AGPL-3.0)** 开源，全文见 [LICENSE](LICENSE)。
