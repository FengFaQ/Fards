import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './ui/components/AppShell';
import { FontFaces } from './ui/components/FontFaces';
import { ToastViewport } from './ui/components/Toast';
import AboutPage from './pages/AboutPage';
import BattlePage from './pages/BattlePage';
import CardsPage from './pages/CardsPage';
import DeckBuilderPage from './pages/DeckBuilderPage';
import DeckOverviewPage from './pages/DeckOverviewPage';
import HomePage from './pages/HomePage';

/**
 * 路由骨架
 * - 普通路由用 hash（GitHub Pages 兼容）
 * - 出图兼容：?action=overview_horizontal|overview_vertical|print_template&deck_code=...|deck_slug=...
 *   该参数在 window.location.search 上，命中时直接渲染 DeckOverviewPage（不套站点外壳，便于截图/打印）
 * - /battle 由另一位同事实现，独立于站点外壳（全屏战场），本文件只保留路由
 */
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (action) {
    return (
      <>
        <FontFaces />
        <DeckOverviewPage action={action} params={params} />
      </>
    );
  }

  return (
    <>
      <FontFaces />
      <Routes>
        {/* 带站点外壳的常规页面 */}
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/deck" element={<DeckBuilderPage />} />
          <Route path="/deck/:shareId" element={<DeckBuilderPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>

        {/* 全屏页面：战场与出图页不套外壳 */}
        <Route path="/battle" element={<BattlePage />} />
        <Route
          path="/overview"
          element={<DeckOverviewPage action="overview_horizontal" params={params} />}
        />
      </Routes>
      <ToastViewport />
    </>
  );
}
