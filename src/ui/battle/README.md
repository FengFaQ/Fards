# src/ui/battle —— 战场 UI（归属：battle 页负责人）

这个目录为后续「对战页」预留。**当前实现者不要改动 `src/pages/BattlePage.tsx` 与
`src/pages/DeckOverviewPage.tsx` 之外的页面**；App.tsx 已经保留 `/battle` 路由（独立全屏，不套站点外壳），
并在 `window.location.search` 带 `?action=` 时直接渲染 `DeckOverviewPage`。

## 可用基础设施（由 ui-forge 提供，可直接复用）

- 路由：`#/battle?deck=<deckId>` —— deckId 来自构筑页保存的 localStorage 卡组。
- 状态：`src/ui/stores/deckStore.ts`（`useDeckStore`，含 `decks` / `loadSavedDeck`），
  卡组形状 `SavedDeck = { id, name, faction, allyFaction, cards: { cardId, count }[] }`。
- 卡牌：`src/ui/lib/useCards.ts` → `useCards()`，返回 `{ cards, byId, loading }`。
- 卡图：`src/ui/lib/dataBridge.ts` → `cardImageSources(card)`（自动回退），`loadCardBacksSafe()`。
- 组件：`CardView`（卡面懒加载 + 骨架）、`Dialog`、`ToastViewport`+`toast()`、`StatBadge`、
  `FactionBadge`、`CurveChart`、`EmptyState`、`icons.tsx`。
- 设计令牌与动画类：`src/styles/global.css`（`.fards-panel` `.fards-card` `.fards-btn` `.fards-skeleton` 等）。
- 引擎契约：`src/engine/types.ts`（`GameState` / `GameCommand` / `GameEvent`）。

## 约定

- 战场是全屏页面：不要依赖 `AppShell`，自己管理布局与滚动。
- 图片一律 `loading="lazy"` + 骨架屏；缺失图用阵营色占位。
- 动效克制，只用 CSS transition/keyframes，不新增第三方动画库。
- 需要新依赖先找 lead 批准；不要改 `src/engine/**`、`src/data/**`、`package.json` 等他人写入范围。
