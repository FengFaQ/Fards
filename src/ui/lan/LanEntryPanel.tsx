import { useEffect, useState } from 'react';
import type { UiCard } from '../lib/dataBridge';
import type { SavedDeck } from '../stores/deckStore';
import { LanDeckPicker } from './LanDeckPicker';
import { LanNotice } from './LanNotice';
import type { DeckChoice } from './deckPayload';
import {
  describeLanError,
  isValidRoomCode,
  normalizeRoomCode,
  STATIC_HOST_STEPS,
  CONNECT_FAILED_HINT,
} from './lanText';
import { IconArrowRight, IconPlay, IconUser, IconUsers, IconWifi } from '../components/icons';

export interface LanEntryPanelProps {
  name: string;
  onNameChange: (value: string) => void;
  decks: SavedDeck[];
  choice: DeckChoice | null;
  onChoiceChange: (choice: DeckChoice) => void;
  cards: UiCard[];
  busy: boolean;
  actionError: string | null;
  initialCode: string;
  onCreate: () => void;
  onJoin: (code: string) => void;
  deckValid: boolean;
}

/** 大厅未进房状态：玩家名 + 卡组 + 创建/加入房间 */
export function LanEntryPanel({
  name,
  onNameChange,
  decks,
  choice,
  onChoiceChange,
  cards,
  busy,
  actionError,
  initialCode,
  onCreate,
  onJoin,
  deckValid,
}: LanEntryPanelProps) {
  const [code, setCode] = useState(() => normalizeRoomCode(initialCode));

  useEffect(() => {
    if (initialCode) setCode(normalizeRoomCode(initialCode));
  }, [initialCode]);

  const errorInfo = actionError ? describeLanError(actionError) : null;
  const codeOk = isValidRoomCode(code);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="fards-panel fards-rivets p-4">
          <p className="fards-label mb-2 text-brass-500">玩家身份 / CALLSIGN</p>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-brass-600/50 bg-field-950/60 text-brass-400">
              <IconUser size={17} />
            </span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={16}
              placeholder="输入你的代号（会显示给对手）"
              className="fards-input"
              aria-label="玩家名"
            />
          </div>
          <p className="mt-2 font-body text-[10px] leading-relaxed text-field-500">
            代号与卡组只会发送给同房间的对手；局域网服务器不保存任何对局数据。
          </p>
        </section>

        <LanDeckPicker
          decks={decks}
          choice={choice}
          onChange={onChoiceChange}
          cards={cards}
          disabled={busy}
        />
      </div>

      <div className="space-y-4">
        {errorInfo && (
          <LanNotice
            tone={errorInfo.retryable ? 'error' : 'warn'}
            title={errorInfo.title}
            actions={
              <span className="font-body text-[10px] text-field-500">{errorInfo.hint}</span>
            }
          />
        )}

        {/* 创建房间 */}
        <section className="fards-panel relative overflow-hidden p-4">
          <span className="absolute inset-x-0 top-0 h-[2px] bg-brass-500/70" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="fards-label text-brass-500">房主 / HOST</p>
              <h2 className="mt-1 font-display text-lg tracking-[0.1em] text-field-100">创建房间</h2>
            </div>
            <IconWifi size={20} className="text-brass-500/80" />
          </div>
          <p className="mt-1.5 font-body text-[11px] leading-relaxed text-field-400">
            你将成为房主：规则引擎在你的浏览器里运行（权威端），对手通过局域网地址加入。
            创建后把 4 位房间码或局域网链接发给朋友。
          </p>
          <button
            type="button"
            onClick={onCreate}
            disabled={busy || !deckValid || !name.trim()}
            className="fards-btn fards-btn-primary mt-3 w-full py-2.5"
          >
            <IconUsers size={15} />
            {busy ? '正在创建…' : '创建房间'}
          </button>
          {!deckValid && (
            <p className="mt-1.5 font-body text-[10px] text-amber-300/90">
              当前卡组未通过编制校验，修正后才能创建房间。
            </p>
          )}
        </section>

        {/* 加入房间 */}
        <section className="fards-panel relative overflow-hidden p-4">
          <span className="absolute inset-x-0 top-0 h-[2px] bg-field-600/70" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="fards-label text-brass-500">客机 / GUEST</p>
              <h2 className="mt-1 font-display text-lg tracking-[0.1em] text-field-100">加入房间</h2>
            </div>
            <IconPlay size={18} className="text-field-500" />
          </div>
          <label className="mt-2 block">
            <span className="fards-label mb-1 block text-[10px] text-field-500">4 位房间码</span>
            <input
              value={code}
              onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && codeOk && deckValid && !busy) onJoin(code);
              }}
              placeholder="例如 7K2M"
              maxLength={4}
              className="fards-input text-center font-display text-2xl tracking-[0.35em] uppercase"
              aria-label="房间码"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            onClick={() => onJoin(code)}
            disabled={busy || !codeOk || !deckValid || !name.trim()}
            className="fards-btn mt-2.5 w-full py-2.5"
          >
            加入房间
            <IconArrowRight size={14} />
          </button>
          <p className="mt-1.5 font-body text-[10px] leading-relaxed text-field-500">
            {codeOk ? '回车也可以直接加入。' : '房间码为 4 位字母或数字；可通过分享链接自动填入。'}
          </p>
        </section>

        {/* 本地运行说明（静态站默认展示） */}
        <LanNotice
          tone="info"
          title="局域网对战怎么开？"
          actions={null}
          steps={STATIC_HOST_STEPS}
        >
          <p className="mb-1 flex items-center gap-1.5 text-field-400">
            <IconWifi size={12} className="text-brass-500" />
            {CONNECT_FAILED_HINT}
          </p>
        </LanNotice>
      </div>
    </div>
  );
}

export default LanEntryPanel;
