/**
 * 对战页（全屏，独立于站点外壳）
 * 路由：#/battle
 * 调试参数（仅本地验证用）：
 *   #/battle?demo=1&auto=3  —— 自动生成双方卡组、模拟 3 轮后停在玩家回合，便于截图/回归
 */
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useBattleStore } from '../ui/stores/battleStore';
import BattleScreen from '../ui/battle/BattleScreen';
import SetupScreen from '../ui/battle/SetupScreen';
import { IconAlert } from '../ui/components/icons';
import '../ui/battle/battle.css';

function BootScreen() {
  return (
    <div className="battle-root flex h-screen w-full flex-col items-center justify-center gap-4 text-field-100">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-brass-500/40" />
        <span className="h-8 w-8 rounded-full border-2 border-brass-500/30 border-t-brass-400" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
      <div className="text-center">
        <p className="fards-title text-lg">战场初始化</p>
        <p className="mt-1 font-body text-[11px] tracking-[0.18em] text-field-500">
          正在校验引擎契约与卡牌注册表…
        </p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="battle-root flex h-screen w-full items-center justify-center px-6">
      <div className="fards-panel max-w-md p-6 text-center">
        <div className="mx-auto mb-3 w-fit rounded-full border border-ink-red/50 p-3 text-ink-red">
          <IconAlert size={22} />
        </div>
        <h1 className="fards-title text-lg">卡牌数据不可用</h1>
        <p className="mt-2 font-body text-[11px] leading-relaxed text-field-400">{message}</p>
        <p className="mt-3 font-body text-[10px] leading-relaxed text-field-500">
          对局需要 public/data/cards.json（或数据层 loadCards）就绪。请确认开发服务器已启动且数据文件存在。
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button type="button" className="fards-btn" onClick={() => window.location.reload()}>
            重新加载
          </button>
          <Link to="/" className="fards-btn fards-btn-ghost">
            返回大厅
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BattlePage() {
  const phase = useBattleStore((state) => state.phase);
  const booting = useBattleStore((state) => state.booting);
  const error = useBattleStore((state) => state.error);
  const hasRegistry = useBattleStore((state) => state.registry !== null);
  const demoStarted = useBattleStore((state) => state.demoStarted);
  const init = useBattleStore((state) => state.init);
  const startDemoBattle = useBattleStore((state) => state.startDemoBattle);
  const stopAI = useBattleStore((state) => state.stopAI);

  const [params] = useSearchParams();
  const demo = params.get('demo');
  const auto = Number(params.get('auto') ?? '3');

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => () => stopAI(), [stopAI]);

  useEffect(() => {
    if (!demo || demoStarted || !hasRegistry || phase !== 'setup') return;
    void startDemoBattle(Number.isFinite(auto) ? auto : 3);
  }, [demo, auto, demoStarted, hasRegistry, phase, startDemoBattle]);

  if (phase === 'boot' || (booting && !hasRegistry)) return <BootScreen />;
  if (!hasRegistry) return <ErrorScreen message={error ?? '未加载到任何卡牌'} />;
  if (phase === 'setup') return <SetupScreen />;
  return <BattleScreen />;
}
