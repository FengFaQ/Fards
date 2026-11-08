import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './ui/components/AppShell';
import { FontFaces } from './ui/components/FontFaces';
import { ToastViewport } from './ui/components/Toast';

/**
 * 路由骨架
 * - 普通路由用 hash（GitHub Pages 兼容）
 * - 出图兼容：?action=overview_horizontal|overview_vertical|print_template&deck_code=...|deck_slug=...
 *   该参数在 window.location.search 上，命中时直接渲染 DeckOverviewPage（不套站点外壳，便于截图/打印）
 * - /battle 独立于站点外壳（全屏战场）
 * - 页面级 React.lazy 代码分割：首屏只加载外壳 + 当前路由的 chunk
 */
const HomePage = lazy(() => import('./pages/HomePage'));
const CardsPage = lazy(() => import('./pages/CardsPage'));
const DeckBuilderPage = lazy(() => import('./pages/DeckBuilderPage'));
const DeckOverviewPage = lazy(() => import('./pages/DeckOverviewPage'));
const BattlePage = lazy(() => import('./pages/BattlePage'));
const LanPage = lazy(() => import('./pages/LanPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const P2PTestPage = lazy(() => import('./pages/P2PTestPage'));

function RouteFallback({ label = '正在加载' }: { label?: string }) {
  return (
    <div className="flex min-h-[420px] w-full flex-col items-center justify-center gap-3 text-field-300">
      <div className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-brass-500/30" />
        <span
          className="h-7 w-7 rounded-full border-2 border-brass-500/30 border-t-brass-400"
          style={{ animation: 'spin 0.9s linear infinite' }}
        />
      </div>
      <p className="font-body text-[11px] tracking-[0.22em] uppercase">{label}…</p>
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (action) {
    return (
      <Suspense fallback={<RouteFallback label="正在生成出图" />}>
        <FontFaces />
        <DeckOverviewPage action={action} params={params} />
      </Suspense>
    );
  }

  return (
    <>
      <FontFaces />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* 带站点外壳的常规页面 */}
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/cards" element={<CardsPage />} />
            <Route path="/deck" element={<DeckBuilderPage />} />
            <Route path="/deck/:shareId" element={<DeckBuilderPage />} />
            <Route path="/lan" element={<LanPage />} />
            <Route path="/about" element={<AboutPage />} />
            {/* 实验页：纯静态站 P2P 联机 PoC（手动对战码 / 公共 MQTT 信令） */}
            <Route path="/p2p" element={<P2PTestPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>

          {/* 全屏页面：战场与出图页不套外壳 */}
          <Route path="/battle" element={<BattlePage />} />
          <Route
            path="/overview"
            element={<DeckOverviewPage action="overview_horizontal" params={params} />}
          />
        </Routes>
      </Suspense>
      <ToastViewport />
    </>
  );
}
