# public/fonts — 字体来源与许可

本项目是 AGPL-3.0-or-later 的开源项目，所用字体均为 **SIL Open Font License 1.1**（可自由分发/嵌入/商用，需保留许可文本）。
字体文件由 `node scripts/fetch-fonts.mjs` 下载，许可文本也从官方渠道取得。

## 已收录

| 文件 | 字体 | 用途 | 来源 | 许可 |
|---|---|---|---|---|
| `BlackOpsOne-Regular.woff2` | **Black Ops One** | 大标题 / 军械牌匾风格的 stencil 数字与标题 | [google/fonts · ofl/blackopsone](https://github.com/google/fonts/tree/main/ofl/blackopsone)（本次实际从 jsDelivr fontsource 镜像取得，内容同源） | OFL-1.1（`OFL-BlackOpsOne.txt`） |
| `Oswald-VariableFont_wght.woff2` | **Oswald**（可变字重 200–700） | 窄体：数字、统计、密集小标题、费用/攻击/防御数值 | [google/fonts · ofl/oswald](https://github.com/google/fonts/tree/main/ofl/oswald)（同上） | OFL-1.1（`OFL-Oswald.txt`） |
| `OFL-BlackOpsOne.txt` / `OFL-Oswald.txt` | SIL OFL 1.1 全文 | 许可合规 | 字体上游 LICENSE | — |

> **下载说明（失败记录）**：`scripts/fetch-fonts.mjs` 优先请求
> `https://raw.githubusercontent.com/google/fonts/main/...`，但本机/本网络环境被 TLS 中间人拦截，
> 报 `unable to get local issuer certificate`，因此脚本自动回退到 jsDelivr 的 fontsource 镜像
> （`https://cdn.jsdelivr.net/npm/@fontsource/black-ops-one@5/...`），拿到的是同款字体的 **woff2**（体积更小，浏览器首选）。
> 若网络环境正常，重跑脚本会优先命中 GitHub raw 的 ttf。

## 用法（CSS）

```css
@font-face {
  font-family: 'Black Ops One';
  src: url('/fonts/BlackOpsOne-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'Oswald';
  src: url('/fonts/Oswald-VariableFont_wght.woff2') format('woff2-variations'),
       url('/fonts/Oswald-VariableFont_wght.woff2') format('woff2');
  font-weight: 200 700;
  font-display: swap;
}
```

> 部署在子路径（`vite.config.ts` 的 `base`，CI 为 `/Fards/`）时，`url()` 应写
> `/Fards/fonts/...` 或用 `import.meta.env.BASE_URL` 拼接；也可以把 `@font-face` 放进
> 由 Vite 处理 CSS（相对路径 `./fonts/...`）。

## 中文回退（重要）

以上两款字体**只含拉丁字符集**（军事题材排版用）。中文使用**系统字体栈回退**，不随仓库分发 CJK 字体
（思源/Noto Sans SC 单字重 woff2 也有 3~8MB，且中文卡牌文本用系统黑体观感已足够）：

```css
--font-sans: 'Oswald', 'Black Ops One', system-ui, -apple-system, 'Segoe UI',
             'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB',
             'Source Han Sans SC', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', sans-serif;
```

Windows 上中文回退到 **Microsoft YaHei**，macOS 上 **PingFang SC**，Linux 上一般有 Noto Sans CJK / 文泉驿。

**如果将来需要统一中文观感**（三端一致），推荐 **Noto Sans SC**（OFL-1.1，与本文英文字体同许可），可选两种方案：

1. CDN 引入（简单，但依赖外网）：
   `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap`
   或 jsDelivr：`https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5/400.css`
2. 自托管子集（体积可控，推荐长期方案）：用 `fonttools pyftsubset` 只保留本项目用到的汉字
   （卡牌名称 + 描述约 3000~4000 个字形），可压到 300~600KB/字重：
   ```bash
   pyftsubset NotoSansSC-Regular.otf --text-file=used-chars.txt \
     --flavor=woff2 --output-file=public/fonts/NotoSansSC-subset.woff2
   ```
   本项目卡牌中文文本可用 `scripts/fetch-cards.mjs` 产出的 `cards.json` 里 `nameZh`/`description` 生成 `used-chars.txt`。

## 重新下载 / 校验

```bash
node scripts/fetch-fonts.mjs           # 缺失则下载（已有且 >1KB 会跳过），失败时退出码 2
node scripts/fetch-fonts.mjs --force   # 强制重新下载
node scripts/verify-data.mjs           # 数据总检查里会校验字体文件与许可文本是否存在
```

下载结果（含每个文件的来源 URL、大小、格式）会写到 `public/fonts/_download-report.json`，便于审计。
