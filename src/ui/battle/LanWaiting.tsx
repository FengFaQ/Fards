/**
 * 局域网等待/异常界面：战场尚未开始时（对手未加入、房主未开始、连接异常）显示。
 * 一旦 host 下发 start / sync 视图，battleStore.state 出现，BattlePage 会切到 BattleScreen。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBattleStore } from '../stores/battleStore';
import { IconAlert, IconArrowRight, IconCards, IconLink, IconSwords } from '../components/icons';

export function LanWaiting() {
  const navigate = useNavigate();
  const role = useBattleStore((s) => s.lanRole);
  const roomCode = useBattleStore((s) => s.lanRoomCode);
  const peerName = useBattleStore((s) => s.lanPeerName);
  const status = useBattleStore((s) => s.lanStatus);
  const error = useBattleStore((s) => s.lanError);
  const leave = useBattleStore((s) => s.lanLeave);
  const [copied, setCopied] = useState(false);

  const broken = status === 'closed' || status === 'error';
  const connecting = status === 'idle' || status === 'connecting';
  const isHost = role === 'host';

  const copyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const backToLobby = () => {
    leave();
    navigate('/lan');
  };

  return (
    <div className="battle-root relative flex h-screen w-full items-center justify-center overflow-hidden px-4">
      <div className="w-full max-w-[560px]">
        <div className="fards-panel fards-rivets relative overflow-hidden border-brass-600/40">
          <div className="fards-hazard pointer-events-none absolute inset-x-0 top-0 h-1 opacity-40" />
          <div className="px-6 py-6">
            <p className="fards-label flex items-center gap-2 text-[10px] text-brass-500">
              <span className="inline-block h-px w-6 bg-brass-600/70" />
              LAN BATTLE · 局域网对战
            </p>

            {broken ? (
              <>
                <div className="mt-3 flex items-center gap-2 text-ink-red">
                  <IconAlert size={18} />
                  <h1 className="font-display text-xl tracking-[0.12em]">
                    {status === 'closed' ? '连接已断开' : '连接异常'}
                  </h1>
                </div>
                <p className="mt-2 font-body text-[12px] leading-relaxed text-field-300">
                  {error ?? '与局域网服务器或对手的连接已中断。'}
                </p>
                <p className="mt-1 font-body text-[10px] leading-relaxed text-field-500">
                  请确认双方在同一局域网、且已运行 <span className="text-brass-300">npm run lan</span>，然后回到大厅重新建房/加入。
                </p>
              </>
            ) : (
              <>
                <h1 className="mt-3 font-display text-xl tracking-[0.12em] text-field-100">
                  {isHost ? '等待对手加入房间' : '等待房主开始对战'}
                </h1>
                <p className="mt-2 font-body text-[12px] leading-relaxed text-field-400">
                  {isHost
                    ? '把房间码发给同一局域网的对手；对手加入并准备后，房主点「开始对战」即可。'
                    : '已加入房间，正在等待房主开局。开局后会自动进入战场。'}
                </p>

                <div className="mt-4 flex items-center gap-3 rounded-sm border border-field-700/70 bg-field-950/60 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="fards-label text-[9px] text-field-500">房间码</p>
                    <p className="font-display text-2xl leading-none tracking-[0.3em] text-brass-300">
                      {roomCode ?? '——'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    disabled={!roomCode}
                    className="fards-btn fards-btn-ghost px-3 py-1.5 text-[10px] disabled:opacity-40"
                  >
                    <IconLink size={12} />
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-sm border border-field-700/60 bg-field-950/40 px-2.5 py-2">
                    <p className="font-body text-[9px] tracking-[0.16em] text-field-500 uppercase">我的身份</p>
                    <p className="mt-1 font-display text-[13px] text-field-100">
                      {isHost ? '房主 · 权威端' : '客机 · 渲染端'}
                    </p>
                  </div>
                  <div className="rounded-sm border border-field-700/60 bg-field-950/40 px-2.5 py-2">
                    <p className="font-body text-[9px] tracking-[0.16em] text-field-500 uppercase">对手</p>
                    <p className="mt-1 font-display text-[13px] text-field-100">
                      {peerName ?? (connecting ? '连接中…' : '尚未加入')}
                    </p>
                  </div>
                </div>

                <ul className="mt-4 space-y-1.5 font-body text-[10px] leading-relaxed text-field-500">
                  <li className="flex items-center gap-1.5">
                    <IconSwords size={11} className="shrink-0 text-brass-500" />
                    房主浏览器跑规则引擎，客机只渲染；指令经局域网服务器中转。
                  </li>
                  <li className="flex items-center gap-1.5">
                    <IconCards size={11} className="shrink-0 text-brass-500" />
                    双方卡组需通过 39 张合法性校验（现有卡组或大厅快速编组）。
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="battle-pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-brass-400" />
                    {connecting ? '正在连接局域网服务器…' : '连接正常，保持此页面不要关闭。'}
                  </li>
                </ul>
              </>
            )}

            <div className="mt-5 flex items-center justify-between gap-2 border-t border-field-700/60 pt-3">
              <button type="button" className="fards-btn fards-btn-ghost px-3 py-1.5 text-[11px]" onClick={backToLobby}>
                返回大厅
              </button>
              {isHost && !broken && (
                <span className="flex items-center gap-1 font-body text-[10px] tracking-[0.12em] text-field-600">
                  等待对手
                  <IconArrowRight size={11} />
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="mt-3 text-center font-body text-[9px] tracking-[0.14em] text-field-600">
          局域网直连 · 仅同网段可用 · 不经过互联网
        </p>
      </div>
    </div>
  );
}

export default LanWaiting;
