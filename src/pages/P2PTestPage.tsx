/**
 * P2P 联机实验页（未挂路由，需在 App.tsx 加一行 <Route path="/p2p" …>）
 * ------------------------------------------------------------------
 * 作用：在纯静态站点（无 WebSocket 服务器）上验证 1v1 联机可行性。
 *   - 手动模式：复制「对战码」互相粘贴（1 次往返，零依赖，100% 可用）
 *   - 自动模式：公共 MQTT broker 交换 SDP（房间码 12 位，载荷 AES-GCM 加密）
 * 只做「传输层自检」，不驱动规则引擎；接进正式对战见 docs/P2P.md §6.2。
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../ui/components/PageHeader';
import { DEFAULT_SIGNAL_BROKERS, MqttSignalChannel } from '@/net/p2pSignalMqtt';
import { createRoomCode } from '@/net/p2pSignal';
import { P2PTransport, type P2PSnapshot } from '@/net/p2pTransport';
import { savePlayerName, loadPlayerName } from '../ui/lan/lanText';

type Mode = 'manual' | 'mqtt';
type Role = 'host' | 'guest';

function useSnapshot(transport: P2PTransport | null): P2PSnapshot | null {
  return useSyncExternalStore(
    useCallback((onChange: () => void) => (transport ? transport.subscribe(onChange) : () => {}), [transport]),
    useCallback(() => transport?.snapshot ?? null, [transport]),
    useCallback(() => transport?.snapshot ?? null, [transport]),
  );
}

const STATUS_TONE: Record<string, string> = {
  idle: 'text-field-400 border-field-600/60 bg-field-900/60',
  connecting: 'text-amber-300 border-amber-600/60 bg-amber-500/10',
  'in-room': 'text-emerald-300 border-ink-green/60 bg-ink-green/10',
  playing: 'text-emerald-300 border-ink-green/60 bg-ink-green/10',
  closed: 'text-field-300 border-field-600/60 bg-field-900/60',
  error: 'text-red-300 border-ink-red/60 bg-ink-red/10',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-body text-[11px] tracking-[0.14em] text-field-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-sm border border-field-600/70 bg-field-950/70 px-2.5 py-2 font-mono text-[12px] text-field-100 outline-none focus:border-ink-green/70';

function CopyRow({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [value]);
  return (
    <button type="button" className="fards-btn fards-btn-ghost py-1.5 text-[11px]" onClick={() => void copy()}>
      {copied ? '已复制' : label}
    </button>
  );
}

export default function P2PTestPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const gated = params.get('p2p') !== '1';

  const [mode, setMode] = useState<Mode>('manual');
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState(() => loadPlayerName() || '玩家');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const [offerCode, setOfferCode] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [answerCode, setAnswerCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [brokerState, setBrokerState] = useState<string>('');

  const transportRef = useRef<P2PTransport | null>(null);
  const channelRef = useRef<MqttSignalChannel | null>(null);
  const [transport, setTransport] = useState<P2PTransport | null>(null);
  const snapshot = useSnapshot(transport);

  const pushLog = useCallback((line: string) => {
    setLogs((prev) => [...prev.slice(-59), line]);
  }, []);

  useEffect(() => {
    savePlayerName(name);
  }, [name]);

  const teardown = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    transportRef.current?.close('离开');
    transportRef.current = null;
    setTransport(null);
    setOfferCode('');
    setAnswerCode('');
    setAnswerInput('');
    setBrokerState('');
    setError(null);
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(
    (nextRole: Role): P2PTransport => {
      transportRef.current?.close('重开');
      const created = new P2PTransport({
        role: nextRole,
        name: name.trim() || '玩家',
        onLog: (line) => pushLog(`${nextRole === 'host' ? '房主' : '客机'} ${line}`),
      });
      transportRef.current = created;
      setTransport(created);
      setError(null);
      return created;
    },
    [name, pushLog],
  );

  // ---------------- 手动对战码 ----------------

  const buildOffer = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const created = start('host');
      const result = await created.createOfferCode();
      setOfferCode(result.code);
      setRoomCode(result.room);
      pushLog(`对战码：${result.code.length} 字符`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [pushLog, start]);

  const acceptAnswer = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!transportRef.current) throw new Error('请先生成对战码');
      await transportRef.current.acceptAnswerCode(answerInput);
      setAnswerInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [answerInput]);

  const buildAnswer = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const created = start('guest');
      const result = await created.acceptOfferCode(offerCode);
      setAnswerCode(result.code);
      setRoomCode(result.room);
      pushLog(`回执码：${result.code.length} 字符`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [offerCode, pushLog, start]);

  // ---------------- 公共 MQTT 自动信令 ----------------

  const startMqttHost = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const created = start('host');
      const room = createRoomCode(12);
      setRoomCode(room);
      const channel = new MqttSignalChannel({
        room,
        role: 'host',
        // 房间码同时充当信令加密口令：broker 上只能看到密文
        secret: room,
        selfId: created.selfId,
        name,
        onState: (state, detail) => setBrokerState(detail ? `${state} · ${detail}` : state),
        onSignal: (payload) => {
          if (payload.kind !== 'answer') return;
          void created
            .acceptAnswerPayload(payload)
            .then(() => pushLog('收到对手回执，等待通道打开…'))
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
        },
        debug: (line) => pushLog(`信令 ${line}`),
      });
      channelRef.current = channel;
      await channel.connect();
      const offer = await created.createOfferPayload();
      await channel.publishSignal(offer.payload);
      pushLog(`已发布 offer（${offer.payload.sdp.length} 字节 SDP）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [name, pushLog, start]);

  const joinMqttGuest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const room = roomInput.trim().toUpperCase();
      if (room.length < 8) throw new Error('请输入完整的房间码（12 位）');
      const created = start('guest');
      setRoomCode(room);
      const channel = new MqttSignalChannel({
        room,
        role: 'guest',
        secret: room,
        selfId: created.selfId,
        name,
        onState: (state, detail) => setBrokerState(detail ? `${state} · ${detail}` : state),
        onSignal: (payload) => {
          if (payload.kind !== 'offer') return;
          void created
            .acceptOfferPayload(payload)
            .then((result) => channel.publishSignal(result.payload))
            .then(() => pushLog('已发回 answer，等待通道打开…'))
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
        },
        debug: (line) => pushLog(`信令 ${line}`),
      });
      channelRef.current = channel;
      await channel.connect();
      pushLog(`已加入房间 ${room}，等待房主 offer…`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [name, pushLog, roomInput, start]);

  const connected = snapshot?.status === 'in-room' || snapshot?.status === 'playing';
  const status = snapshot?.status ?? 'idle';

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-7 sm:px-6">
      <PageHeader
        eyebrow="实验特性 / P2P WebRTC"
        title="P2P 联机自检"
        subtitle="不经过任何游戏服务器：房主权威引擎不变，只把 WebSocket 换成 WebRTC DataChannel。"
        actions={
          <>
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-body text-[10px] tracking-[0.16em] ${STATUS_TONE[status] ?? STATUS_TONE.idle}`}
            >
              {status}
            </span>
            <button type="button" className="fards-btn fards-btn-ghost py-1.5 text-[11px]" onClick={teardown}>
              重置
            </button>
            <Link to="/" className="fards-btn fards-btn-ghost py-1.5 text-[11px]">
              返回首页
            </Link>
          </>
        }
      />

      {gated && (
        <div className="mb-4 rounded-sm border border-amber-600/60 bg-amber-500/10 px-3 py-2 font-body text-[12px] text-amber-200">
          该页面默认不对外暴露。真实入口需带 <code className="font-mono">?p2p=1</code>；同时还需要在{' '}
          <code className="font-mono">src/App.tsx</code> 里挂上 <code className="font-mono">/p2p</code> 路由（见 docs/P2P.md）。
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-sm border border-ink-red/60 bg-ink-red/10 px-3 py-2 font-body text-[12px] text-red-200">
          {error}
        </div>
      )}

      {!transport ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-sm border border-field-700/60 bg-field-900/40 p-4">
            <h2 className="mb-3 font-display text-[13px] tracking-[0.2em] text-field-200">1. 选择信令方式</h2>
            <div className="mb-3 flex gap-2">
              {(['manual', 'mqtt'] as Mode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`fards-btn py-1.5 text-[11px] ${mode === item ? '' : 'fards-btn-ghost'}`}
                  onClick={() => setMode(item)}
                >
                  {item === 'manual' ? '对战码（手动）' : '公共信令（自动）'}
                </button>
              ))}
            </div>
            <p className="font-body text-[11px] leading-relaxed text-field-400">
              {mode === 'manual'
                ? '零依赖，100% 可用：复制一段文本发给对手，对手回一段文本。适合先验证「能不能连」。'
                : `走公共 MQTT broker（默认 ${DEFAULT_SIGNAL_BROKERS[0]}）交换 SDP，无需自建服务器；载荷用房间码派生的密钥加密。`}
            </p>
            <div className="mt-3">
              <Field label="玩家代号">
                <input className={inputClass} value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="rounded-sm border border-field-700/60 bg-field-900/40 p-4">
            <h2 className="mb-3 font-display text-[13px] tracking-[0.2em] text-field-200">2. 选择角色</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="fards-btn py-1.5 text-[11px]"
                disabled={busy}
                onClick={() => (mode === 'manual' ? void buildOffer() : void startMqttHost())}
              >
                创建房间（房主）
              </button>
              <button
                type="button"
                className="fards-btn fards-btn-ghost py-1.5 text-[11px]"
                disabled={busy}
                onClick={() => setRole('guest')}
              >
                加入房间（客机）
              </button>
            </div>
            {role === 'guest' && mode === 'manual' && (
              <div className="mt-3 space-y-2">
                <Field label="粘贴房主的对战码">
                  <textarea
                    className={`${inputClass} h-24 resize-none`}
                    value={offerCode}
                    placeholder="P2P1-…"
                    onChange={(e) => setOfferCode(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="fards-btn py-1.5 text-[11px]"
                  disabled={busy || !offerCode.trim()}
                  onClick={() => void buildAnswer()}
                >
                  生成回执码
                </button>
              </div>
            )}
            {role === 'guest' && mode === 'mqtt' && (
              <div className="mt-3 space-y-2">
                <Field label="房间码（12 位）">
                  <input
                    className={inputClass}
                    value={roomInput}
                    placeholder="XXXXXXXXXXXX"
                    onChange={(e) => setRoomInput(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="fards-btn py-1.5 text-[11px]"
                  disabled={busy || roomInput.trim().length < 8}
                  onClick={() => void joinMqttGuest()}
                >
                  加入
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-sm border border-field-700/60 bg-field-900/40 p-4">
            <h2 className="mb-3 font-display text-[13px] tracking-[0.2em] text-field-200">
              {role === 'host' || snapshot?.role === 'host' ? '房主' : '客机'} · 连接状态
            </h2>
            <dl className="space-y-1.5 font-mono text-[11px] text-field-300">
              <div className="flex justify-between">
                <dt className="text-field-500">connectionState</dt>
                <dd>{snapshot?.connection ?? 'idle'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-field-500">房间</dt>
                <dd>{snapshot?.roomCode ?? roomCode ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-field-500">候选 host/srflx/relay</dt>
                <dd>
                  {snapshot
                    ? `${snapshot.candidates.host}/${snapshot.candidates.srflx}/${snapshot.candidates.relay}`
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-field-500">RTT</dt>
                <dd>{snapshot?.rttMs != null ? `${snapshot.rttMs} ms` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-field-500">已发 / 已收</dt>
                <dd>
                  {snapshot?.sent ?? 0} / {snapshot?.received ?? 0}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-field-500">信令通道</dt>
                <dd className="max-w-[60%] truncate text-right">{brokerState || '手动'}</dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="fards-btn fards-btn-ghost py-1.5 text-[11px]"
                disabled={!connected}
                onClick={() => transport?.ping()}
              >
                测 RTT
              </button>
              {connected && (
                <button
                  type="button"
                  className="fards-btn fards-btn-ghost py-1.5 text-[11px]"
                  onClick={() => {
                    transport?.sendReady(!snapshot?.selfReady);
                  }}
                >
                  {snapshot?.selfReady ? '取消准备' : '准备就绪'}
                </button>
              )}
              <button type="button" className="fards-btn fards-btn-ghost py-1.5 text-[11px]" onClick={teardown}>
                断开
              </button>
            </div>

            {connected && (
              <p className="mt-3 rounded-sm border border-ink-green/40 bg-ink-green/10 px-2.5 py-2 font-body text-[11px] text-emerald-200">
                DataChannel 已建立：传输层可用。接入正式对战只需把 <code className="font-mono">getLanSession()</code>{' '}
                换成这个 P2PTransport（见 docs/P2P.md §6.2）。
              </p>
            )}
          </div>

          <div className="rounded-sm border border-field-700/60 bg-field-900/40 p-4">
            <h2 className="mb-3 font-display text-[13px] tracking-[0.2em] text-field-200">
              {snapshot?.role === 'host' || role === 'host' ? '把对战码发给对手' : '把回执码发回房主'}
            </h2>
            {offerCode && (
              <div className="mb-3 space-y-1.5">
                <Field label={`offer 对战码（${offerCode.length} 字符）`}>
                  <textarea className={`${inputClass} h-24 resize-none`} readOnly value={offerCode} />
                </Field>
                <CopyRow value={offerCode} label="复制对战码" />
              </div>
            )}
            {answerCode && (
              <div className="mb-3 space-y-1.5">
                <Field label={`answer 回执码（${answerCode.length} 字符）`}>
                  <textarea className={`${inputClass} h-24 resize-none`} readOnly value={answerCode} />
                </Field>
                <CopyRow value={answerCode} label="复制回执码" />
              </div>
            )}
            {snapshot?.role === 'host' && (
              <div className="space-y-1.5">
                <Field label="粘贴对手的回执码">
                  <textarea
                    className={`${inputClass} h-20 resize-none`}
                    value={answerInput}
                    placeholder="P2P1-…"
                    onChange={(e) => setAnswerInput(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="fards-btn py-1.5 text-[11px]"
                  disabled={busy || !answerInput.trim()}
                  onClick={() => void acceptAnswer()}
                >
                  连接
                </button>
              </div>
            )}
            {mode === 'mqtt' && roomCode && (
              <div className="mt-3 space-y-1.5 border-t border-field-700/50 pt-3">
                <Field label="房间码（双方输入同一个）">
                  <input className={inputClass} readOnly value={roomCode} />
                </Field>
                <CopyRow value={roomCode} label="复制房间码" />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-sm border border-field-700/60 bg-field-950/60 p-3">
        <h2 className="mb-2 font-display text-[12px] tracking-[0.2em] text-field-300">日志</h2>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-field-400">
          {logs.length ? logs.join('\n') : '（暂无）'}
        </pre>
      </div>

      <p className="mt-4 font-body text-[11px] leading-relaxed text-field-500">
        提示：P2P 会让对手看到你的公网 IP；没有 TURN 时对称 NAT / 移动网络可能连不上。局域网内一定可连（host
        候选直连）。详见 <code className="font-mono">docs/P2P.md</code>。
      </p>
    </div>
  );
}
