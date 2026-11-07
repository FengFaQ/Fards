import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../ui/components/EmptyState';
import { PageHeader } from '../ui/components/PageHeader';
import { ToastViewport } from '../ui/components/Toast';
import { IconAlert, IconRefresh, IconWifi } from '../ui/components/icons';
import { LanEntryPanel } from '../ui/lan/LanEntryPanel';
import { LanNotice } from '../ui/lan/LanNotice';
import { LanRoomPanel } from '../ui/lan/LanRoomPanel';
import { resolveLanDeck, validateLanDeck, type DeckChoice } from '../ui/lan/deckPayload';
import { setLanHandoff } from '../ui/lan/lanBridge';
import {
  describeLanError,
  isStaticHosted,
  isValidRoomCode,
  lanStatusMeta,
  STATIC_HOST_STEPS,
  wsEndpointLabel,
} from '../ui/lan/lanText';
import { useLanLobby } from '../ui/lan/useLanLobby';
import { useCards } from '../ui/lib/useCards';
import { useSavedDecks } from '../ui/stores/deckStore';
import { toast } from '../ui/stores/toastStore';
import { getLanSession } from '@/net/lanSession';

function StatusChip({ status }: { status: ReturnType<typeof lanStatusMeta> }) {
  const toneClass =
    status.tone === 'ok'
      ? 'border-ink-green/60 bg-ink-green/10 text-emerald-300'
      : status.tone === 'error'
        ? 'border-ink-red/60 bg-ink-red/10 text-red-300'
        : status.tone === 'warn'
          ? 'border-amber-600/60 bg-amber-500/10 text-amber-300'
          : 'border-field-600/60 bg-field-900/60 text-field-400';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-body text-[10px] tracking-[0.16em] ${toneClass}`}>
      <IconWifi size={12} />
      {status.zh}
    </span>
  );
}

export default function LanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cards } = useCards();
  const decks = useSavedDecks();
  const lobby = useLanLobby();
  const session = getLanSession();

  const [choice, setChoice] = useState<DeckChoice | null>(() =>
    decks.length ? { kind: 'saved', id: decks[0].id } : { kind: 'quick', faction: 'Germany' },
  );
  const guestNavigated = useRef(false);

  const initialCode = searchParams.get('code') ?? '';
  const snapshot = lobby.snapshot;
  const statusMeta = lanStatusMeta(snapshot.status);
  const inRoom =
    Boolean(snapshot.roomCode) && (snapshot.status === 'in-room' || snapshot.status === 'playing');
  const isHost = snapshot.role === 'host';

  const selfDeck = useMemo(() => resolveLanDeck(choice, decks, cards), [choice, decks, cards]);
  const selfCheck = useMemo(() => validateLanDeck(selfDeck), [selfDeck]);

  // 选择的本地卡组被删掉时回退到快速编组
  useEffect(() => {
    if (choice?.kind === 'saved' && !decks.some((deck) => deck.id === choice.id)) {
      setChoice(decks.length ? { kind: 'saved', id: decks[0].id } : { kind: 'quick', faction: 'Germany' });
    }
  }, [choice, decks]);

  // 客机：收到开局消息 → 进入战场
  useEffect(() => {
    const off = session.onStart(() => {
      if (guestNavigated.current) return;
      guestNavigated.current = true;
      setLanHandoff({
        role: 'guest',
        selfName: session.snapshot.selfName,
        peerName: session.snapshot.peerName,
        selfDeck: session.getDeck(),
        peerDeck: null,
      });
      navigate(buildBattleUrlRef.current('guest'));
    });
    return off;
  }, [navigate, session]);

  // 兜底：如果页面在开局后重新挂载，用 lastView 直接进战场
  useEffect(() => {
    if (snapshot.status !== 'playing' || snapshot.role !== 'guest' || guestNavigated.current) return;
    guestNavigated.current = true;
    setLanHandoff({
      role: 'guest',
      selfName: snapshot.selfName,
      peerName: snapshot.peerName,
      selfDeck: session.getDeck(),
      peerDeck: null,
    });
    navigate(buildBattleUrlRef.current('guest'));
  }, [snapshot.status, snapshot.role, snapshot.selfName, snapshot.peerName, navigate, session]);

  // 与 BattlePage 的 LAN 参数契约：mode/role/room/name/deck/seed
  // deck 传已保存卡组 id 或阵营名（快速编组），seed=1 保证两边快速编组结果一致
  const deckParam = choice?.kind === 'saved' ? choice.id : choice?.kind === 'quick' ? choice.faction : 'Germany';
  const buildBattleUrl = useCallback(
    (role: 'host' | 'guest') => {
      const query = new URLSearchParams({
        mode: 'lan',
        role,
        room: snapshot.roomCode ?? '',
        name: snapshot.selfName || lobby.name,
        deck: deckParam,
        seed: '1',
      });
      return `/battle?${query.toString()}`;
    },
    [snapshot.roomCode, snapshot.selfName, lobby.name, deckParam],
  );
  const buildBattleUrlRef = useRef(buildBattleUrl);
  buildBattleUrlRef.current = buildBattleUrl;

  const changeChoice = useCallback(
    (next: DeckChoice) => {
      setChoice(next);
      if (inRoom) {
        const deck = resolveLanDeck(next, decks, cards);
        if (deck) lobby.changeDeck(deck);
      }
    },
    [inRoom, decks, cards, lobby],
  );

  const handleCreate = useCallback(() => {
    if (!selfDeck) {
      toast('请先选择或生成一套卡组', 'warn');
      return;
    }
    if (!selfCheck.ok) {
      toast(selfCheck.errors[0] ?? '卡组未通过校验', 'warn');
      return;
    }
    if (!lobby.name.trim()) {
      toast('请先填写玩家代号', 'warn');
      return;
    }
    guestNavigated.current = false;
    void lobby.createRoom(selfDeck);
  }, [selfDeck, selfCheck, lobby]);

  const handleJoin = useCallback(
    (code: string) => {
      if (!selfDeck) {
        toast('请先选择或生成一套卡组', 'warn');
        return;
      }
      if (!selfCheck.ok) {
        toast(selfCheck.errors[0] ?? '卡组未通过校验', 'warn');
        return;
      }
      if (!isValidRoomCode(code)) {
        toast('请输入 4 位房间码', 'warn');
        return;
      }
      guestNavigated.current = false;
      void lobby.joinRoom(code, selfDeck);
    },
    [selfDeck, selfCheck, lobby],
  );

  const handleStart = useCallback(() => {
    if (!selfDeck) return;
    setLanHandoff({
      role: 'host',
      selfName: lobby.name,
      peerName: snapshot.peerName,
      selfDeck,
      peerDeck: lobby.peerDeck,
    });
    session.setDeck(selfDeck);
    navigate(buildBattleUrl('host'));
  }, [selfDeck, lobby.name, lobby.peerDeck, snapshot.peerName, navigate, session, buildBattleUrl]);

  const handleLeave = useCallback(() => {
    lobby.leaveRoom();
    guestNavigated.current = false;
    toast('已离开房间', 'info');
    if (searchParams.get('code')) {
      navigate('/lan', { replace: true });
    }
  }, [lobby, navigate, searchParams]);

  const startHint = useMemo(() => {
    if (!isHost) return null;
    if (!selfCheck.ok) return '我方卡组未通过校验，请先修正卡组';
    if (!snapshot.peerName) return '等待对手加入房间';
    if (!lobby.peerDeckCheck) return '等待对手发送卡组…';
    if (!lobby.peerDeckCheck.ok) return '对手卡组未通过校验，请对手修正后重试';
    if (!lobby.selfReady) return '请先点击「准备就绪」';
    if (!lobby.peerReady) return '等待对手准备';
    return null;
  }, [isHost, selfCheck.ok, snapshot.peerName, lobby.peerDeckCheck, lobby.selfReady, lobby.peerReady]);

  // 与 BattlePage 的 LAN 参数契约（buildBattleUrl 已在文件上方定义）
  const canStart = isHost && !startHint && Boolean(snapshot.peerName);

  const sessionError = snapshot.error;
  const errorInfo = sessionError ? describeLanError(sessionError, lobby.errorCode) : null;
  const showSessionError =
    Boolean(errorInfo) &&
    (snapshot.status === 'error' || (snapshot.status === 'closed' && !inRoom));
  const staticHosted = isStaticHosted();

  // 首页/大厅兜底：无卡片数据时也能进入（快速编组会禁用）
  if (cards.length === 0 && !inRoom) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-6 lg:px-8">
        <PageHeader eyebrow="局域网 / LAN" title="局域网对战" />
        <EmptyState
          title="卡牌数据尚未就绪"
          hint="大厅需要读取卡牌数据来做编制校验，请稍后重试。"
          action={
            <button type="button" className="fards-btn" onClick={() => window.location.reload()}>
              重新加载
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-6 lg:px-8"
      data-lan-status={snapshot.status}
      data-lan-role={snapshot.role ?? ''}
      data-lan-room={snapshot.roomCode ?? ''}
    >
      <PageHeader
        eyebrow="局域网 / LAN · 双人对战"
        title="局域网对战"
        subtitle="同一局域网内两人对战：房主浏览器运行规则引擎（权威端），局域网服务器只做房间与消息中转。"
        actions={
          <>
            <StatusChip status={statusMeta} />
            <span className="hidden items-center gap-1 rounded-sm border border-field-600/60 bg-field-900/60 px-2 py-1 font-mono text-[9px] text-field-500 md:inline-flex">
              {wsEndpointLabel()}
            </span>
            {inRoom && (
              <button type="button" className="fards-btn fards-btn-ghost py-1.5 text-[11px]" onClick={handleLeave}>
                离开房间
              </button>
            )}
            <Link to="/" className="fards-btn fards-btn-ghost py-1.5 text-[11px]">
              返回首页
            </Link>
          </>
        }
      />

      {/* 静态站点兜底 */}
      {staticHosted && !inRoom && (
        <LanNotice
          tone="warn"
          title="当前页面来自静态站点（GitHub Pages），无法连接局域网服务"
          steps={STATIC_HOST_STEPS}
          className="mb-4"
          actions={
            <button
              type="button"
              className="fards-btn fards-btn-ghost py-1.5 text-[11px]"
              onClick={() => window.location.reload()}
            >
              <IconRefresh size={13} />
              重新检测
            </button>
          }
        >
          <p className="text-field-400">
            GitHub Pages 只托管静态文件，没有 WebSocket 服务。请按下面的步骤在本机启动局域网服务器后再打开本页。
          </p>
        </LanNotice>
      )}

      {/* 连接/房间错误 */}
      {showSessionError && errorInfo && (
        <LanNotice
          tone="error"
          title={errorInfo.title}
          className="mb-4"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-body text-[10px] text-field-500">{errorInfo.hint}</span>
              <button
                type="button"
                className="fards-btn fards-btn-ghost py-1.5 text-[11px]"
                onClick={() => window.location.reload()}
              >
                <IconRefresh size={13} />
                重试
              </button>
              <button
                type="button"
                className="fards-btn fards-btn-ghost py-1.5 text-[11px]"
                onClick={handleLeave}
              >
                返回大厅
              </button>
            </div>
          }
        >
          <p className="flex items-start gap-1.5 text-field-400">
            <IconAlert size={12} className="mt-0.5 shrink-0 text-red-300" />
            服务器地址：<span className="font-mono">{wsEndpointLabel()}</span>
          </p>
        </LanNotice>
      )}

      {inRoom && snapshot.roomCode && snapshot.role ? (
        <LanRoomPanel
          role={snapshot.role}
          roomCode={snapshot.roomCode}
          selfName={snapshot.selfName || lobby.name}
          peerName={snapshot.peerName}
          selfReady={lobby.selfReady}
          peerReady={lobby.peerReady}
          selfDeck={session.getDeck()}
          peerDeck={lobby.peerDeck}
          peerDeckCheck={lobby.peerDeckCheck}
          guestDeckOk={snapshot.guestDeckOk}
          guestDeckErrors={snapshot.guestDeckErrors}
          decks={decks}
          choice={choice}
          onChoiceChange={changeChoice}
          cards={cards}
          canStart={canStart}
          startHint={startHint}
          onStart={handleStart}
          onReadyChange={lobby.setReady}
          onLeave={handleLeave}
        />
      ) : (
        <LanEntryPanel
          name={lobby.name}
          onNameChange={lobby.setName}
          decks={decks}
          choice={choice}
          onChoiceChange={changeChoice}
          cards={cards}
          busy={lobby.busy}
          actionError={lobby.actionError}
          initialCode={initialCode}
          onCreate={handleCreate}
          onJoin={handleJoin}
          deckValid={selfCheck.ok}
        />
      )}

      <ToastViewport />
    </div>
  );
}
