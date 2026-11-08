/**
 * 对战页（全屏，独立于站点外壳）
 * 路由：#/battle
 * 调试参数（仅本地验证用）：
 *   #/battle?demo=1&auto=3  —— 自动生成双方卡组、模拟 3 轮后停在玩家回合，便于截图/回归
 */
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getLanSession } from '@/net/lanSession';
import { useBattleStore } from '../ui/stores/battleStore';
import { useDeckStore } from '../ui/stores/deckStore';
import BattleScreen from '../ui/battle/BattleScreen';
import CardImagePreloadOverlay from '../ui/battle/CardImagePreloadOverlay';
import LanWaiting from '../ui/battle/LanWaiting';
import SetupScreen from '../ui/battle/SetupScreen';
import { lanDeckForFaction, fromDeckPayload, toDeckPayload } from '../ui/battle/lan';
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
  const startFromQuery = useBattleStore((state) => state.startFromQuery);
  const stopAI = useBattleStore((state) => state.stopAI);

  const [params] = useSearchParams();
  const demo = params.get('demo');
  const auto = Number(params.get('auto') ?? '3');
  const autostart = params.get('autostart');
  const deckArg = params.get('deck');
  const factionArg = params.get('faction');
  const difficultyArg = params.get('difficulty');
  const seedArg = params.get('seed');
  const simulate = Number(params.get('simulate') ?? '0');
  const modeParam = params.get('mode');
  const roleParam = params.get('role');
  const roomParam = params.get('room');
  const nameParam = params.get('name');
  const debugArg = params.get('debug');
  const autoStarted = useRef(false);
  const lanInitRef = useRef(false);
  const debugRef = useRef(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => () => stopAI(), [stopAI]);

  useEffect(() => {
    if (!demo || demoStarted || !hasRegistry || phase !== 'setup') return;
    void startDemoBattle(Number.isFinite(auto) ? auto : 3);
  }, [demo, auto, demoStarted, hasRegistry, phase, startDemoBattle]);

  // QA/截图入口：#/battle?autostart=1&deck=<deckId|faction>&faction=Germany&difficulty=normal&seed=1
  // 附加 simulate=N：开局后用本地 AI 快进 N 轮（仅用于截图/回归，不参与正常对局）
  useEffect(() => {
    if (!autostart || autoStarted.current) return;
    if (!hasRegistry || phase !== 'setup') return;
    if (modeParam === 'lan') return;
    autoStarted.current = true;
    void (async () => {
      await startFromQuery({ deck: deckArg, faction: factionArg, difficulty: difficultyArg, seed: seedArg });
      if (Number.isFinite(simulate) && simulate > 0) {
        useBattleStore.getState().debugSimulate(Math.floor(simulate));
      }
    })();
  }, [autostart, deckArg, factionArg, difficultyArg, seedArg, simulate, hasRegistry, phase, startFromQuery, modeParam]);

  // 局域网入口：#/battle?mode=lan&role=host|guest[&room=ABCD][&deck=Germany][&name=xxx][&seed=1]
  // 连接保持在 getLanSession() 单例里，路由切换不会断开；大厅已建房/加入时这里只挂监听。
  useEffect(() => {
    if (modeParam !== 'lan' || (roleParam !== 'host' && roleParam !== 'guest')) return;
    if (!hasRegistry || lanInitRef.current) return;
    lanInitRef.current = true;
    void (async () => {
      const session = getLanSession();
      const role: 'host' | 'guest' = roleParam === 'guest' ? 'guest' : 'host';
      const name = (nameParam ?? '').trim() || (role === 'host' ? '房主' : '客机');
      const seedNum = Number(seedArg);
      const seed = Number.isFinite(seedNum) && seedNum > 0 ? Math.floor(seedNum) : 20261107;
      const store = useBattleStore.getState();
      const cards = store.cards;
      const savedDecks = useDeckStore.getState().decks;
      const wanted = (deckArg ?? '').trim();
      const saved = savedDecks.find((deck) => deck.id === wanted || deck.name === wanted) ?? null;
      // 优先用大厅已交给 session 的卡组（joinRoom/createRoom 时传入的真实卡组）
      const sessionDeck = session.getDeck();
      const deck =
        (sessionDeck ? fromDeckPayload(sessionDeck) : null) ??
        saved ??
        lanDeckForFaction(wanted || (role === 'host' ? 'Germany' : 'Soviet'), cards, seed).deck;
      const deckName = sessionDeck?.name ?? saved?.name ?? `${deck.faction} 局域网战斗群`;
      try {
        if (role === 'host') {
          if (!session.snapshot.roomCode) {
            await session.createRoom(name, toDeckPayload(deck, name));
          }
          store.lanAttachHost({ selfDeck: deck, selfName: name, autoStart: true, seed });
          await store.lanStartHostGame({ seed });
        } else {
          const room = (roomParam ?? '').trim();
          if (!session.snapshot.roomCode) {
            if (!room) throw new Error('缺少房间码（room=XXXX）');
            await session.joinRoom(room, name, toDeckPayload(deck, name));
          }
          store.lanAttachGuest({ selfDeck: deck, selfName: name });
        }
        useBattleStore.setState({
          playerDeck: {
            faction: deck.faction,
            allyFaction: deck.allyFaction,
            name: deckName,
            count: deck.cards.reduce((sum, entry) => sum + entry.count, 0),
          },
        });
      } catch (err) {
        console.error('[battle] 局域网初始化失败', err);
        useBattleStore.getState().lanFail(err instanceof Error ? err.message : '局域网连接失败');
      }
    })();
  }, [modeParam, roleParam, roomParam, deckArg, nameParam, seedArg, hasRegistry]);

  // QA 场景：#/battle?debug=duel —— 直接摆一个双方都有兵、可攻击/布防/检视的战场
  useEffect(() => {
    if (debugArg !== 'duel' || debugRef.current) return;
    if (modeParam === 'lan' || !hasRegistry) return;
    debugRef.current = true;
    useBattleStore.getState().debugSetupScenario();
  }, [debugArg, modeParam, hasRegistry]);

  const mode = useBattleStore((state) => state.mode);
  const storeState = useBattleStore((state) => state.state);
  const imagePreload = useBattleStore((state) => state.imagePreload);

  if (phase === 'boot' || (booting && !hasRegistry)) return <BootScreen />;
  if (!hasRegistry) return <ErrorScreen message={error ?? '未加载到任何卡牌'} />;
  // 开局卡图预载浮层：AI 对局在 setup/结束态之上盖住，LAN 双方在战场之上盖住
  const preloadOverlay = imagePreload?.active ? (
    <CardImagePreloadOverlay progress={imagePreload} />
  ) : null;
  if (mode === 'lan-host' || mode === 'lan-guest') {
    return (
      <>
        {storeState ? <BattleScreen /> : <LanWaiting />}
        {preloadOverlay}
      </>
    );
  }
  if (phase === 'setup') return <>{preloadOverlay ?? <SetupScreen />}</>;
  return (
    <>
      <BattleScreen />
      {preloadOverlay}
    </>
  );
}
