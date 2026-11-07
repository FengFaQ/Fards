import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getLanSession, type LanSnapshot } from '@/net/lanSession';
import type { LanDeckPayload } from '@/net/protocol';
import { validateLanDeck, type LanDeckCheck } from './deckPayload';
import { loadPlayerName, savePlayerName } from './lanText';

export interface LanLobby {
  snapshot: LanSnapshot;
  name: string;
  setName: (value: string) => void;
  selfReady: boolean;
  peerReady: boolean;
  peerDeck: LanDeckPayload | null;
  peerDeckCheck: LanDeckCheck | null;
  busy: boolean;
  actionError: string | null;
  /** lead 若给 snapshot 补了 errorCode，这里透传；否则 null（由文案兜底映射） */
  errorCode: string | null;
  clearError: () => void;
  createRoom: (deck: LanDeckPayload) => Promise<boolean>;
  joinRoom: (code: string, deck: LanDeckPayload) => Promise<boolean>;
  changeDeck: (deck: LanDeckPayload) => void;
  setReady: (ready: boolean) => void;
  leaveRoom: () => void;
}

/**
 * 局域网大厅状态 Hook
 * - 用 useSyncExternalStore 订阅 LanSession.snapshot（单例，跨页面保持连接）
 * - 房主通过 onHello 收到客机卡组并回传校验结果（deckCheck）
 * - 兼容两种 ready 语义：若 snapshot 有 selfReady 字段（lead 的补丁）优先使用，
 *   否则退回本地记录 + 时间窗忽略自己回声（旧字段 peerReady 被双向复用）。
 */
export function useLanLobby(): LanLobby {
  const session = getLanSession();
  const snapshot = useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.snapshot,
    () => session.snapshot,
  );

  const patched = snapshot as LanSnapshot & { selfReady?: boolean; errorCode?: string | null };
  const hasSplitReady = typeof patched.selfReady === 'boolean';
  const errorCode = patched.errorCode ?? null;

  const [name, setNameState] = useState<string>(() => loadPlayerName());
  const [localSelfReady, setLocalSelfReady] = useState(false);
  const [localPeerReady, setLocalPeerReady] = useState(false);
  const [peerDeck, setPeerDeck] = useState<LanDeckPayload | null>(null);
  const [peerDeckCheck, setPeerDeckCheck] = useState<LanDeckCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /** 自己点准备会同步写 snapshot.peerReady；用时间窗忽略自己的回声（旧语义） */
  const ignorePeerUntil = useRef(0);

  const selfReady = hasSplitReady ? Boolean(patched.selfReady) : localSelfReady;
  const peerReady = hasSplitReady ? snapshot.peerReady : localPeerReady;

  useEffect(() => {
    savePlayerName(name);
  }, [name]);

  // 订阅会话变化：同步“对手就绪/离开”等派生状态
  useEffect(() => {
    const off = session.subscribe(() => {
      const snap = session.snapshot;
      const maybeSplit = snap as LanSnapshot & { selfReady?: boolean };
      if (typeof maybeSplit.selfReady !== 'boolean') {
        // 旧语义：peerReady 被双向复用，只在非自己操作的时间窗内采信
        if (performance.now() >= ignorePeerUntil.current) {
          setLocalPeerReady(snap.peerReady);
        }
      }
      if (!snap.roomCode) {
        setLocalSelfReady(false);
        setLocalPeerReady(false);
      }
      if (!snap.peerName) {
        setPeerDeck(null);
        setPeerDeckCheck(null);
      }
    });
    return off;
  }, [session]);

  // 房主：收到客机 hello → 校验卡组并回执
  useEffect(() => {
    const off = session.onHello((message) => {
      setPeerDeck(message.deck);
      const check = validateLanDeck(message.deck);
      setPeerDeckCheck(check);
      if (session.snapshot.role === 'host') {
        session.sendDeckCheck(check.ok, check.errors);
      }
    });
    return off;
  }, [session]);

  const setName = useCallback((value: string) => {
    setNameState(value.slice(0, 16));
  }, []);

  const createRoom = useCallback(
    async (deck: LanDeckPayload): Promise<boolean> => {
      const clean = name.trim() || '房主';
      savePlayerName(clean);
      setBusy(true);
      setActionError(null);
      try {
        await session.createRoom(clean, deck);
        session.setDeck(deck);
        return true;
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [name, session],
  );

  const joinRoom = useCallback(
    async (code: string, deck: LanDeckPayload): Promise<boolean> => {
      const clean = name.trim() || '玩家';
      savePlayerName(clean);
      setBusy(true);
      setActionError(null);
      try {
        await session.joinRoom(code, clean, deck);
        return true;
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [name, session],
  );

  const changeDeck = useCallback(
    (deck: LanDeckPayload) => {
      session.setDeck(deck);
    },
    [session],
  );

  const setReady = useCallback(
    (ready: boolean) => {
      ignorePeerUntil.current = performance.now() + 80;
      setLocalSelfReady(ready);
      session.sendReady(ready);
    },
    [session],
  );

  const leaveRoom = useCallback(() => {
    session.close();
    setLocalSelfReady(false);
    setLocalPeerReady(false);
    setPeerDeck(null);
    setPeerDeckCheck(null);
    setActionError(null);
  }, [session]);

  const clearError = useCallback(() => setActionError(null), []);

  return {
    snapshot,
    name,
    setName,
    selfReady,
    peerReady,
    peerDeck,
    peerDeckCheck,
    busy,
    actionError,
    errorCode,
    clearError,
    createRoom,
    joinRoom,
    changeDeck,
    setReady,
    leaveRoom,
  };
}
