/**
 * 战斗日志：右侧可折叠抽屉，显示最近 30 条，按事件类型着色并自动滚到底部。
 */
import { useEffect, useRef } from 'react';
import type { GameLogEntry } from '@/engine/types';
import { useBattleStore } from '../stores/battleStore';
import { IconX } from '../components/icons';

const KIND_STYLE: Record<GameLogEntry['kind'], string> = {
  info: 'text-field-300',
  play: 'text-brass-300',
  attack: 'text-orange-300',
  damage: 'text-red-300',
  death: 'text-red-400',
  draw: 'text-sky-300',
  kredit: 'text-amber-300',
  choice: 'text-violet-300',
  effect: 'text-emerald-300',
  system: 'text-field-500',
};

const KIND_MARK: Record<GameLogEntry['kind'], string> = {
  info: '·',
  play: '◆',
  attack: '⚔',
  damage: '✳',
  death: '✝',
  draw: '↧',
  kredit: '¢',
  choice: '?',
  effect: '✧',
  system: '—',
};

const EMPTY: GameLogEntry[] = [];

export function LogPanel() {
  const open = useBattleStore((state) => state.logOpen);
  const toggle = useBattleStore((state) => state.toggleLog);
  const log = useBattleStore((state) => state.state?.log ?? EMPTY);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const entries = log.slice(-30);

  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open, log.length]);

  return (
    <aside
      className={`relative z-30 shrink-0 overflow-hidden border-l border-field-700/70 bg-field-950/80 backdrop-blur-md transition-[width] duration-200 ease-out ${
        open ? 'w-[266px]' : 'w-0 border-l-0'
      }`}
      aria-hidden={!open}
    >
      <div className="absolute inset-y-0 right-0 flex w-[266px] flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-field-700/70 px-3 py-2">
          <div>
            <p className="fards-label text-[9px] text-brass-500">战况记录</p>
            <p className="font-display text-[11px] tracking-[0.16em] text-field-200">
              最近 {entries.length} 条
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label="收起日志"
            className="rounded-sm border border-field-600/60 p-1 text-field-400 transition-colors hover:border-brass-500/60 hover:text-brass-300"
          >
            <IconX size={12} />
          </button>
        </header>
        <div ref={scrollRef} className="fards-scroll battle-log min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
          {entries.length === 0 && (
            <p className="py-8 text-center font-body text-[11px] text-field-600">暂无战况</p>
          )}
          <ul className="space-y-[3px]">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={`flex items-start gap-1.5 font-body text-[10px] leading-snug ${KIND_STYLE[entry.kind] ?? 'text-field-300'}`}
              >
                <span className="mt-[1px] w-3 shrink-0 text-center opacity-60">{KIND_MARK[entry.kind]}</span>
                <span className="shrink-0 font-display text-[8px] tracking-wider text-field-600">
                  T{entry.turn}
                </span>
                <span className="min-w-0 flex-1 break-words">{entry.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <footer className="shrink-0 border-t border-field-700/70 px-3 py-1.5">
          <p className="font-body text-[8px] tracking-[0.14em] text-field-600">
            ◆ 出牌 · ⚔ 攻击 · ✳ 伤害 · ✝ 阵亡
          </p>
        </footer>
      </div>
    </aside>
  );
}

export default LogPanel;
