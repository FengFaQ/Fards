import type { LanDeckPayload, LanRole } from '@/net/protocol';
import type { UiCard } from '../lib/dataBridge';
import { factionMeta } from '../lib/format';
import { copyText } from '../lib/clipboard';
import { toast } from '../stores/toastStore';
import type { SavedDeck } from '../stores/deckStore';
import { LanDeckPicker } from './LanDeckPicker';
import type { DeckChoice, LanDeckCheck } from './deckPayload';
import { lanCardCount, lanDeckLabel } from './deckPayload';
import { lanShareUrl } from './lanText';
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconLink,
  IconLogout,
  IconPlay,
  IconShield,
  IconUser,
  IconUsers,
  IconWifi,
} from '../components/icons';

export interface LanRoomPanelProps {
  role: LanRole;
  roomCode: string;
  selfName: string;
  peerName: string | null;
  selfReady: boolean;
  peerReady: boolean;
  selfDeck: LanDeckPayload | null;
  peerDeck: LanDeckPayload | null;
  peerDeckCheck: LanDeckCheck | null;
  /** 客机侧：房主回传的卡组校验结果 */
  guestDeckOk: boolean;
  guestDeckErrors: string[];
  decks: SavedDeck[];
  choice: DeckChoice | null;
  onChoiceChange: (choice: DeckChoice) => void;
  cards: UiCard[];
  canStart: boolean;
  startHint: string | null;
  onStart: () => void;
  onReadyChange: (ready: boolean) => void;
  onLeave: () => void;
}

function ReadyBadge({ ready }: { ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body text-[10px] tracking-wider ${
        ready
          ? 'border-ink-green/60 bg-ink-green/10 text-emerald-300'
          : 'border-field-600/60 bg-field-950/60 text-field-400'
      }`}
    >
      {ready ? <IconCheck size={10} /> : <IconShield size={10} />}
      {ready ? '已准备' : '未准备'}
    </span>
  );
}

function PlayerSlot({
  title,
  name,
  roleZh,
  ready,
  self,
  note,
  noteTone = 'muted',
}: {
  title: string;
  name: string;
  roleZh: string;
  ready: boolean;
  self: boolean;
  note: string;
  noteTone?: 'muted' | 'ok' | 'warn';
}) {
  return (
    <section
      className={`fards-panel relative overflow-hidden p-3.5 ${
        self ? 'border-brass-600/40' : ''
      }`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-[2px] ${
          self ? 'bg-brass-500/80' : 'bg-field-600/70'
        }`}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="fards-label text-[10px] text-field-500">{title}</span>
        <span className="inline-flex items-center gap-1 font-body text-[9px] tracking-[0.18em] text-field-500 uppercase">
          {self ? <IconUser size={10} /> : <IconUsers size={10} />}
          {roleZh}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
            name ? 'border-brass-600/60 text-brass-300' : 'border-field-600/60 text-field-500'
          }`}
        >
          <IconUser size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-display text-sm tracking-wide ${name ? 'text-field-100' : 'text-field-500'}`}>
            {name || '等待加入…'}
          </p>
          <p
            className={`mt-0.5 truncate font-body text-[10px] leading-snug ${
              noteTone === 'ok'
                ? 'text-emerald-300/90'
                : noteTone === 'warn'
                  ? 'text-amber-300/90'
                  : 'text-field-500'
            }`}
          >
            {note}
          </p>
        </div>
        <ReadyBadge ready={ready} />
      </div>
    </section>
  );
}

/** 已进房状态：房间码 / 局域网链接 / 玩家槽位 / 卡组 / 准备与开始 */
export function LanRoomPanel({
  role,
  roomCode,
  selfName,
  peerName,
  selfReady,
  peerReady,
  selfDeck,
  peerDeck,
  peerDeckCheck,
  guestDeckOk,
  guestDeckErrors,
  decks,
  choice,
  onChoiceChange,
  cards,
  canStart,
  startHint,
  onStart,
  onReadyChange,
  onLeave,
}: LanRoomPanelProps) {
  const isHost = role === 'host';
  const shareUrl = lanShareUrl(roomCode);

  const copy = async (text: string, okMessage: string) => {
    const ok = await copyText(text);
    toast(ok ? okMessage : '复制失败，请手动选择文本', ok ? 'success' : 'error');
  };

  const peerNote = isHost
    ? peerName
      ? peerDeckCheck
        ? peerDeckCheck.ok
          ? `对手卡组校验通过 · ${lanCardCount(peerDeck)} 张`
          : `对手卡组校验未通过（${peerDeckCheck.errors.length} 项）`
        : '已加入，等待对手发送卡组…'
      : '把房间码或局域网链接发给朋友'
    : '房主卡组不公开';

  return (
    <div
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"
      data-lan-room-code={roomCode}
      data-lan-role={role}
      data-lan-self-ready={selfReady ? '1' : '0'}
      data-lan-peer-ready={peerReady ? '1' : '0'}
      data-lan-can-start={canStart ? '1' : '0'}
      data-lan-peer-name={peerName ?? ''}
    >
      <div className="space-y-4">
        {/* 房间码 */}
        <section className="fards-panel fards-rivets relative overflow-hidden p-4">
          <span className="absolute inset-x-0 top-0 h-1 fards-hazard opacity-60" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="fards-label text-brass-500">房间码 / ROOM CODE</p>
              <div className="mt-1.5 flex items-center gap-2">
                {roomCode.split('').map((char, index) => (
                  <span
                    key={`${char}-${index}`}
                    className="flex h-12 w-10 items-center justify-center rounded-sm border border-brass-600/70 bg-field-950/80 font-display text-2xl text-brass-200 shadow-[inset_0_0_12px_rgb(195_155_58/0.08)]"
                  >
                    {char}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => copy(roomCode, '房间码已复制')}
                  className="ml-1 rounded-sm border border-field-600/70 p-2 text-field-300 transition-colors hover:border-brass-600/60 hover:text-brass-300"
                  aria-label="复制房间码"
                  title="复制房间码"
                >
                  <IconCopy size={14} />
                </button>
              </div>
            </div>
            <div className="text-right">
              <p className="fards-label text-[10px] text-field-500">我的身份</p>
              <p className="mt-1 font-display text-sm tracking-[0.14em] text-brass-300">
                {isHost ? '房主 / HOST' : '客机 / GUEST'}
              </p>
              <p className="mt-0.5 font-body text-[10px] text-field-500">{selfName}</p>
            </div>
          </div>

          <div className="mt-3 rounded border border-field-700/60 bg-field-950/50 p-2.5">
            <p className="mb-1 flex items-center gap-1.5 font-body text-[10px] tracking-wider text-field-400">
              <IconWifi size={11} className="text-brass-500" />
              局域网地址（发给对手，打开即自动填入房间码）
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-field-200">
                {shareUrl}
              </code>
              <button
                type="button"
                onClick={() => copy(shareUrl, '局域网链接已复制')}
                className="flex shrink-0 items-center gap-1 rounded-sm border border-field-600/70 px-1.5 py-1 font-body text-[9px] tracking-wider text-field-300 transition-colors hover:border-brass-600/60 hover:text-brass-300"
              >
                <IconLink size={10} />
                复制
              </button>
            </div>
          </div>
        </section>

        {/* 玩家槽位 */}
        <div className="grid gap-3 sm:grid-cols-2">
          <PlayerSlot
            title="我方 / SELF"
            name={selfName}
            roleZh={isHost ? '房主' : '客机'}
            ready={selfReady}
            self
            note={
              isHost
                ? '你运行规则引擎，负责开局与判定'
                : guestDeckOk
                  ? `房主已确认你的卡组 · ${lanCardCount(selfDeck)} 张`
                  : '等待房主确认你的卡组…'
            }
            noteTone={isHost ? 'muted' : guestDeckOk ? 'ok' : 'muted'}
          />
          <PlayerSlot
            title="对手 / PEER"
            name={peerName ?? ''}
            roleZh={isHost ? '客机' : '房主'}
            ready={peerReady}
            self={false}
            note={peerNote}
            noteTone={peerDeckCheck && !peerDeckCheck.ok ? 'warn' : peerName ? 'ok' : 'muted'}
          />
        </div>

        {/* 卡组（客机更换会自动重新报到） */}
        <LanDeckPicker
          decks={decks}
          choice={choice}
          onChange={onChoiceChange}
          cards={cards}
          title={isHost ? '我方卡组（对局使用）' : '我的卡组（对手会看到编制）'}
        />

        {/* 校验错误 */}
        {isHost && peerDeckCheck && !peerDeckCheck.ok && (
          <div className="rounded border border-amber-600/50 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 font-body text-[11px] tracking-wider text-amber-300">
              <IconAlert size={12} />
              对手卡组未通过校验，开局前需要对手修正：
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {peerDeckCheck.errors.slice(0, 6).map((error) => (
                <li key={error} className="font-body text-[10px] leading-snug text-amber-300/90">
                  · {error}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!isHost && guestDeckErrors.length > 0 && (
          <div className="rounded border border-amber-600/50 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 font-body text-[11px] tracking-wider text-amber-300">
              <IconAlert size={12} />
              房主对你的卡组提出异议：
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {guestDeckErrors.slice(0, 6).map((error) => (
                <li key={error} className="font-body text-[10px] leading-snug text-amber-300/90">
                  · {error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 控制面板 */}
      <aside className="space-y-4 self-start lg:sticky lg:top-[76px]">
        <section className="fards-panel p-4">
          <p className="fards-label mb-2 text-brass-500">出征控制 / READY</p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-field-700/60 bg-field-950/50 px-2 py-2">
              <p className="font-body text-[9px] tracking-[0.16em] text-field-500 uppercase">我这里</p>
              <div className="mt-1">
                <ReadyBadge ready={selfReady} />
              </div>
            </div>
            <div className="rounded border border-field-700/60 bg-field-950/50 px-2 py-2">
              <p className="font-body text-[9px] tracking-[0.16em] text-field-500 uppercase">对手</p>
              <div className="mt-1">
                <ReadyBadge ready={peerReady} />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onReadyChange(!selfReady)}
            className={`fards-btn mt-3 w-full py-2.5 ${selfReady ? 'fards-btn-ghost' : 'fards-btn-primary'}`}
          >
            {selfReady ? '取消准备' : '准备就绪'}
          </button>

          {isHost ? (
            <>
              <button
                type="button"
                onClick={onStart}
                disabled={!canStart}
                className="fards-btn fards-btn-primary mt-2 w-full py-2.5"
                title={startHint ?? '双方就绪后开始'}
              >
                <IconPlay size={14} />
                开始对战
              </button>
              <p className="mt-1.5 min-h-[2.4em] font-body text-[10px] leading-relaxed text-field-500">
                {startHint ?? '双方准备就绪、对手卡组校验通过后即可开局。'}
              </p>
            </>
          ) : (
            <div className="mt-2 rounded border border-field-700/60 bg-field-950/50 px-3 py-2.5 text-center">
              <p className="font-body text-[11px] text-field-300">
                {peerReady ? '房主已准备，等待房主开始…' : '等待房主准备并开始对局…'}
              </p>
              <p className="mt-0.5 font-body text-[9px] tracking-wider text-field-500">
                开局后会自动进入战场
              </p>
            </div>
          )}

          <div className="mt-3 border-t border-field-700/60 pt-3">
            <p className="mb-1.5 font-body text-[10px] tracking-wider text-field-500">
              我方卡组：{lanDeckLabel(selfDeck)}
              {selfDeck ? ` · ${factionMeta(selfDeck.mainFaction).zh}` : ''}
            </p>
            <button
              type="button"
              onClick={onLeave}
              className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-field-600/60 py-1.5 font-body text-[10px] tracking-[0.16em] text-field-400 transition-colors hover:border-red-500/50 hover:text-red-300"
            >
              <IconLogout size={11} />
              离开房间
            </button>
          </div>
        </section>

        <section className="fards-panel p-4">
          <p className="fards-label mb-2 text-field-500">局域网提示</p>
          <ul className="space-y-1.5 font-body text-[10px] leading-relaxed text-field-400">
            <li>· 房主浏览器运行规则引擎；客机只渲染房主下发的视图。</li>
            <li>· 若对手打不开地址，检查是否同一 Wi-Fi 与防火墙 8080 端口。</li>
            <li>· 刷新页面会断开房间，需要重新创建/加入。</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

export default LanRoomPanel;
