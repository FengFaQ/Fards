/**
 * P2P 对战大厅：连接建立后选择卡组 / 准备 / 进入战场。
 * ------------------------------------------------------------------
 * 复用现有「房主权威引擎 + LanGameView 脱敏」的对战逻辑：
 *  - 双方在这里完成卡组交换（hello/deckCheck）与准备（ready）
 *  - 进入战场后 P2PTransport 会被设置为全局传输层，battleStore 的 LAN 逻辑直接复用
 *  - 房主进入战场后等 guest hello 自动开局；客机进入后周期重发 hello（见 BattlePage）
 */
import { useEffect, useMemo, useState } from 'react';
import type { LanDeckPayload } from '@/net/protocol';
import type { P2PTransport, P2PSnapshot } from '@/net/p2pTransport';
import { useCards } from '../lib/useCards';
import { useDeckStore } from '../stores/deckStore';
import { LanDeckPicker } from '../lan/LanDeckPicker';
import {
  lanCardCount,
  resolveLanDeck,
  validateLanDeck,
  type DeckChoice,
} from '../lan/deckPayload';
import { copyText } from '../lib/clipboard';
import { toast } from '../stores/toastStore';

export interface P2PLobbyProps {
  transport: P2PTransport;
  snapshot: P2PSnapshot;
  selfName: string;
  onEnter: (role: 'host' | 'guest', deck: LanDeckPayload, seed: number) => void;
}

export function P2PLobby({ transport, snapshot, selfName, onEnter }: P2PLobbyProps) {
  const { cards } = useCards();
  const decks = useDeckStore((s) => s.decks);
  const [choice, setChoice] = useState<DeckChoice | null>({ kind: 'quick', faction: 'Germany' });
  const [peerDeck, setPeerDeck] = useState<LanDeckPayload | null>(null);
  const [peerName, setPeerName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const resolved = useMemo(() => resolveLanDeck(choice, decks, cards), [choice, decks, cards]);
  const check = useMemo(() => validateLanDeck(resolved), [resolved]);
  const role = snapshot.role ?? 'host';
  const ready = snapshot.selfReady;
  const peerReady = snapshot.peerReady;
  const peerDeckOk = check.ok && !!peerDeck;

  // 卡组变化 → 同步给传输层（guest 会自动重发 hello）
  useEffect(() => {
    if (resolved) transport.setDeck(resolved);
  }, [resolved, transport]);

  // 房主：收到客机报到 → 校验卡组并回执
  useEffect(() => {
    if (role !== 'host') return;
    return transport.onHello((message) => {
      const deck = message.deck ?? null;
      const deckCheck = validateLanDeck(deck);
      setPeerName(message.name ?? null);
      setPeerDeck(deck);
      transport.sendDeckCheck(deckCheck.ok, deckCheck.errors);
    });
  }, [role, transport]);

  const room = snapshot.roomCode ?? '(未分配)';
  const canEnter = check.ok && ready && peerReady && (role === 'guest' || peerDeckOk);

  const enter = () => {
    if (!resolved || !canEnter) return;
    onEnter(role, resolved, Math.floor(Date.now() / 1000) % 1_000_000);
  };

  return (
    <section className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_1fr]">
      <div className="fards-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-field-700/60 pb-2">
          <p className="fards-label text-brass-500">P2P 对战大厅</p>
          <span className="font-body text-[10px] tracking-[0.14em] text-field-400">
            {role === 'host' ? '房主（权威端）' : '客机（渲染端）'} · {snapshot.connection}
          </span>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-body text-[11px] tracking-[0.14em] text-field-400">房间码</span>
          <span className="rounded-sm border border-brass-600/60 bg-field-950/80 px-2.5 py-1 font-mono text-[15px] tracking-[0.22em] text-brass-200">
            {room}
          </span>
          <button
            type="button"
            className="fards-btn fards-btn-ghost py-1 text-[11px]"
            onClick={async () => {
              const ok = await copyText(room);
              setCopied(ok);
              if (ok) toast('房间码已复制', 'success');
              window.setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? '已复制' : '复制'}
          </button>
          <span className="font-body text-[10px] text-field-500">
            对手：{peerName ?? snapshot.peerName ?? '等待连接…'}
          </span>
        </div>

        {cards.length > 0 ? (
          <LanDeckPicker decks={decks} choice={choice} onChange={setChoice} cards={cards} title="我的作战编成" />
        ) : (
          <p className="font-body text-[12px] text-field-400">卡牌数据加载中…</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-field-700/60 pt-3">
          <button
            type="button"
            className={`fards-btn py-1.5 text-[12px] ${ready ? 'fards-btn-primary' : ''}`}
            disabled={!check.ok}
            onClick={() => transport.sendReady(!ready)}
          >
            {ready ? '已准备（点击取消）' : '准备'}
          </button>
          <button
            type="button"
            className="fards-btn fards-btn-primary py-1.5 text-[12px]"
            disabled={!canEnter || busy}
            onClick={enter}
          >
            进入战场
          </button>
          <span className="font-body text-[10px] text-field-500">
            卡组 {lanCardCount(resolved)} 张{check.ok ? ' · 合法' : ` · ${check.errors[0] ?? '不合法'}`}
            {' · '}对手{peerReady ? '已准备' : '未准备'}
            {role === 'host' ? ` · 对手卡组${peerDeckOk ? '已校验' : '未就绪'}` : ''}
          </span>
        </div>
        {!check.ok && (
          <p className="mt-2 font-body text-[11px] text-ink-red">{check.errors.slice(0, 3).join('；')}</p>
        )}
      </div>

      <div className="fards-panel p-4">
        <p className="fards-label text-brass-500">连接与规则</p>
        <ul className="mt-2 space-y-2 font-body text-[11px] leading-relaxed text-field-300">
          <li>
            传输：WebRTC DataChannel（直连，不经过游戏服务器）；房主浏览器跑规则引擎，客机只渲染。
          </li>
          <li>双方准备后各自点「进入战场」：房主进入后等待客机报到并自动开局。</li>
          <li>对手手牌/牌库/盖牌/随机种子不会下发到你的浏览器（脱敏视图）。</li>
          <li>没有 TURN 时，少数对称 NAT / 移动网络可能连不上；局域网内一般可直连。</li>
          <li>P2P 会让对手看到你的公网 IP；本页仅供娱乐与卡组测试使用。</li>
        </ul>
        <p className="mt-3 border-t border-field-700/60 pt-2 font-body text-[10px] text-field-500">
          当前代号：{selfName}
        </p>
      </div>
    </section>
  );
}

export default P2PLobby;
