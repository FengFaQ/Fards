# 前端性能优化记录

> 目标：卡牌游戏的「流畅」= 交互响应快 + 动画不卡顿（不追求 3D 帧率）。
> 本文记录优化策略、测量方法与优化前后数据（数据持续补充）。

## 1. 优化策略

### 1.1 Zustand 状态订阅
- 组件只订阅需要的切片（例如手牌组件只订阅 `hand`，不订阅整个 `gameState`）。
- 选择器返回对象/数组时使用 `useShallow`（`zustand/react/shallow`），避免 `Object.is` 比较导致的整页重渲染。
- 高频状态（鼠标位置、拖拽预览、倒计时）用 `store.subscribe + useRef` 直接操作 DOM/Canvas，绕过 React 渲染。

### 1.2 渲染策略：静态 vs 高频
- 静态/低频 UI（手牌、按钮、面板）交给 React + Tailwind。
- 高频/密集动画区域（战场单位与特效）优先使用 CSS 合成层动画；若未来出现大量同时动画，再考虑 PixiJS 混合渲染（当前未启用）。

### 1.3 动画性能
- 只动画 `transform` 与 `opacity`（GPU 合成，不触发布局/重绘）；避免 width/height/top/left 过渡。
- 对即将动画的元素临时设置 `will-change: transform`。
- 伤害飘字、临时提示等 DOM 节点复用（对象池思路），减少 GC 抖动。
- 尊重 `prefers-reduced-motion`。

### 1.4 长列表
- 卡牌图鉴（1646 张）使用窗口化/虚拟网格：只渲染可视区 ±1 屏，固定列宽/行高，保留筛选、排序、懒加载与详情弹窗。
- 构筑页卡池使用同一套虚拟列表 hook。

## 2. 测量方法

使用 Edge 无头 + CDP（`_work/measure-live.mjs`）测量：

- DOM 节点数：`document.querySelectorAll('*').length`
- 导航时间：`performance.getEntriesByType('navigation')` / `paint`（首次绘制、FCP）
- 滚动帧率：2s 内 `requestAnimationFrame` 计数与长帧（>34ms）次数

运行：

```bash
node _work/measure-live.mjs                        # 线上基线
node _work/measure-live.mjs http://127.0.0.1:5173  # 本地 dev
```

## 3. 基线数据（2026-11-08，线上 `fengfaq.github.io/Fards/`）

| 页面 | DOM 节点 | 首绘 / FCP | 备注 |
|---|---:|---|---|
| 首页 `#/` | 435 | 2312ms / 2948ms | 含远程图片/字体 |
| 图鉴 `#/cards` | 1361 | 680ms / 680ms | 懒加载图片 15 张 |
| 构筑 `#/deck` | 252 | 296ms / 296ms | |
| 图鉴滚动 2s | — | **57 fps / 长帧 0** | scrollBy 24px/帧 |

## 4. 优化结果

### 4.1 代码分割（路由级 React.lazy）
- 改动：`src/App.tsx` 页面全部懒加载，首屏只加载外壳 + 当前路由 chunk。
- 构建产物：入口 JS 从 **778.85 kB → 229.95 kB**（gzip 217 kB → 72 kB）；BattlePage 独立 chunk 258 kB 仅在进入对战时加载。

### 4.2 本地构建实测（Vite preview，127.0.0.1:4173，2026-11-08）

| 页面 | DOM 节点 | 首绘 / FCP |
|---|---:|---|
| 首页 | 442 | 56ms / 64ms |
| 图鉴 | **681**（优化前线上 1361） | 64ms / 64ms |
| 构筑 | 265 | 68ms / 68ms |
| 图鉴滚动 2s | — | 56 fps，长帧 1 |

### 4.3 对局内卡图
- 开局预载（双方各前 10 张，去重 ≤20）：进场后缓存立即命中，手牌卡图 5/5 走 `blob:`。
- 后台预载剩余卡牌；对局结束 `releaseImageCache()` 后统计归零（投降/击杀 HQ/撤离/再来一局四条路径均验证）。


## 5. 已知限制

- 卡图远程加载（wsrv CDN）首次不受本地缓存控制；对局内由 `imageCache.ts` 预载缓解（开局前 20 张、后台其余）。
- 浏览器 HTTP 缓存不受页面控制；页面只管理自己创建的 objectURL 缓存并在对局结束时释放。
