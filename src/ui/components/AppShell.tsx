import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconExternal } from './icons';

const NAV = [
  { to: '/cards', label: '卡牌图鉴', hint: 'COLLECTION' },
  { to: '/deck', label: '卡组构筑', hint: 'DECK BUILDER' },
  { to: '/battle', label: '开始对战', hint: 'BATTLE' },
  { to: '/lan', label: '局域网', hint: 'LAN' },
  { to: '/p2p', label: 'P2P 联机', hint: 'PEER TO PEER' },
  { to: '/about', label: '关于', hint: 'ABOUT' },
];

const REPO_URL = 'https://github.com/FengFaQ/Fards';

function useScrollTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
}

/** 应用外壳：顶部导航 + 内容区 + 页脚 */
export function AppShell() {
  useScrollTopOnNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-field-700/70 bg-field-950/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center gap-3 px-3 sm:gap-6 sm:px-6">
          <Link to="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Fards 首页">
            <span className="fards-rivets relative flex h-10 w-10 items-center justify-center rounded-sm border border-brass-600/70 bg-gradient-to-b from-field-800 to-field-950 shadow-[0_0_14px_rgb(195_155_58/0.12)] transition-colors group-hover:border-brass-400/80">
              <span className="font-display text-xl leading-none text-brass-400">F</span>
              <span className="absolute inset-x-1 bottom-0.5 h-px bg-brass-600/50" />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-display text-lg tracking-[0.24em] text-brass-300 transition-colors group-hover:text-brass-200">
                FARDS
              </span>
              <span className="mt-1 font-body text-[8px] tracking-[0.26em] text-field-500 uppercase">
                KARDS 卡组对战测试场
              </span>
            </span>
          </Link>

          <nav className="fards-scroll flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto sm:gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group relative flex shrink-0 flex-col items-center justify-center px-2.5 py-2 font-body text-[12px] tracking-[0.14em] whitespace-nowrap transition-colors sm:px-3.5 ${
                    isActive
                      ? 'text-brass-300'
                      : 'text-field-300 hover:text-field-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span>{item.label}</span>
                    <span
                      className={`mt-0.5 hidden font-body text-[7px] tracking-[0.22em] sm:block ${
                        isActive ? 'text-brass-600' : 'text-field-600'
                      }`}
                    >
                      {item.hint}
                    </span>
                    <span
                      className={`absolute inset-x-1.5 bottom-0 h-[2px] transition-colors duration-200 ${
                        isActive
                          ? 'bg-brass-500 shadow-[0_0_8px_rgb(195_155_58/0.6)]'
                          : 'bg-transparent group-hover:bg-field-600'
                      }`}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-sm border border-field-600/60 bg-field-900/60 px-2 py-1 font-body text-[9px] tracking-[0.16em] text-field-400 uppercase md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-green" />
              非官方同人
            </span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1.5 rounded-sm border border-field-600/60 bg-field-900/60 px-2 py-1.5 font-body text-[10px] tracking-wider text-field-400 transition-colors hover:border-brass-600/60 hover:text-brass-300"
              title="GitHub 仓库"
            >
              <IconExternal size={13} />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-10 border-t border-field-700/60 bg-field-950/80">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-6">
          <div className="grid gap-5 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="font-display text-sm tracking-[0.24em] text-brass-400">FARDS</p>
              <p className="mt-2 max-w-md font-body text-[11px] leading-relaxed text-field-400">
                非官方同人项目，仅供卡组构筑测试与娱乐使用，不提供任何商业服务。KARDS 及卡牌名称、美术素材、商标版权归{' '}
                <span className="text-field-200">1939 Games</span> 所有。
              </p>
            </div>
            <div>
              <p className="fards-label mb-2 text-field-500">协议</p>
              <ul className="space-y-1 font-body text-[11px] text-field-400">
                <li>AGPL-3.0 开源</li>
                <li>
                  <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="fards-link">
                    GitHub · FengFaQ/Fards
                  </a>
                </li>
                <li>卡牌数据来自公开 API，仅供测试</li>
              </ul>
            </div>
            <div>
              <p className="fards-label mb-2 text-field-500">站点</p>
              <ul className="space-y-1 font-body text-[11px] text-field-400">
                <li>
                  <Link to="/cards" className="transition-colors hover:text-brass-300">
                    卡牌图鉴
                  </Link>
                </li>
                <li>
                  <Link to="/deck" className="transition-colors hover:text-brass-300">
                    卡组构筑
                  </Link>
                </li>
                <li>
                  <Link to="/about" className="transition-colors hover:text-brass-300">
                    关于与免责
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-6 flex flex-col items-start justify-between gap-1.5 border-t border-field-700/50 pt-4 font-body text-[10px] tracking-wider text-field-600 sm:flex-row sm:items-center">
            <span>© {new Date().getFullYear()} Fards · 非官方 KARDS 卡组测试工具</span>
            <span className="tracking-[0.2em] uppercase">Deployed on GitHub Pages</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AppShell;
