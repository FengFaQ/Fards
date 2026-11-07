import { useMemo } from 'react';
import type { UiCard } from '../lib/dataBridge';
import { factionMeta } from '../lib/format';
import type { SavedDeck } from '../stores/deckStore';
import {
  QUICK_FACTIONS,
  lanCardCount,
  lanDeckLabel,
  resolveLanDeck,
  validateLanDeck,
  type DeckChoice,
} from './deckPayload';
import { IconCheck, IconAlert, IconCards } from '../components/icons';

export interface LanDeckPickerProps {
  decks: SavedDeck[];
  choice: DeckChoice | null;
  onChange: (choice: DeckChoice) => void;
  cards: UiCard[];
  disabled?: boolean;
  className?: string;
  title?: string;
}

/** 局域网大厅的卡组选择：已保存卡组 or 快速编组 */
export function LanDeckPicker({
  decks,
  choice,
  onChange,
  cards,
  disabled = false,
  className = '',
  title = '作战编成',
}: LanDeckPickerProps) {
  const resolved = useMemo(() => resolveLanDeck(choice, decks, cards), [choice, decks, cards]);
  const check = useMemo(() => validateLanDeck(resolved), [resolved]);

  return (
    <section className={`fards-panel p-3.5 ${className}`}>
      <div className="mb-2 flex items-center justify-between border-b border-field-700/60 pb-2">
        <p className="fards-label text-brass-500">{title}</p>
        <span className="font-body text-[10px] text-field-500">
          {lanCardCount(resolved)} / 39 张
        </span>
      </div>

      <div className="space-y-1.5">
        {decks.map((deck) => {
          const active = choice?.kind === 'saved' && choice.id === deck.id;
          const total = deck.cards.reduce((sum, entry) => sum + entry.count, 0);
          const faction = factionMeta(deck.faction);
          return (
            <button
              key={deck.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ kind: 'saved', id: deck.id })}
              className={`flex w-full items-center justify-between gap-2 rounded border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'border-brass-500/80 bg-brass-500/10'
                  : 'border-field-700/60 bg-field-950/40 hover:border-field-500'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3.5 w-[3px] shrink-0 rounded-[1px]"
                  style={{ backgroundColor: faction.color }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-body text-xs text-field-100">{deck.name}</span>
                  <span className="mt-0.5 block font-body text-[9px] tracking-wider text-field-500">
                    {faction.zh}
                    {deck.allyFaction ? ` + ${factionMeta(deck.allyFaction).zh}` : ''} · {total} 张
                  </span>
                </span>
              </span>
              {active && <IconCheck size={13} className="shrink-0 text-brass-400" />}
            </button>
          );
        })}

        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              kind: 'quick',
              faction: choice?.kind === 'quick' ? choice.faction : 'Germany',
            })
          }
          className={`flex w-full items-center justify-between gap-2 rounded border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            choice?.kind === 'quick'
              ? 'border-brass-500/80 bg-brass-500/10'
              : 'border-field-700/60 bg-field-950/40 hover:border-field-500'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconCards size={14} className="shrink-0 text-brass-500" />
            <span className="min-w-0">
              <span className="block font-body text-xs text-field-100">快速编组</span>
              <span className="mt-0.5 block font-body text-[9px] tracking-wider text-field-500">
                按标准曲线自动生成 39 张可用卡组
              </span>
            </span>
          </span>
          {choice?.kind === 'quick' && <IconCheck size={13} className="shrink-0 text-brass-400" />}
        </button>

        {choice?.kind === 'quick' && (
          <div className="flex items-center gap-2 pl-1">
            <span className="fards-label text-[10px] text-field-500">主阵营</span>
            <select
              value={choice.faction}
              disabled={disabled}
              onChange={(event) => onChange({ kind: 'quick', faction: event.target.value })}
              className="fards-select py-1"
              aria-label="快速编组阵营"
            >
              {QUICK_FACTIONS.map((faction) => (
                <option key={faction} value={faction}>
                  {factionMeta(faction).zh}
                </option>
              ))}
            </select>
          </div>
        )}

        {decks.length === 0 && (
          <p className="px-1 pt-1 font-body text-[10px] leading-relaxed text-field-500">
            还没有保存的卡组：可以直接用「快速编组」，或先去卡组构筑页保存一套。
          </p>
        )}
      </div>

      <div
        className={`mt-2.5 rounded border px-2.5 py-2 ${
          check.ok ? 'border-ink-green/40 bg-ink-green/5' : 'border-amber-600/40 bg-amber-500/5'
        }`}
      >
        <p className="flex items-center gap-1.5 font-body text-[10px] tracking-wider">
          {check.ok ? (
            <IconCheck size={11} className="text-emerald-300" />
          ) : (
            <IconAlert size={11} className="text-amber-300" />
          )}
          <span className={check.ok ? 'text-emerald-300' : 'text-amber-300'}>
            {check.ok ? '编制校验通过' : '编制校验未通过'}
          </span>
          <span className="ml-auto max-w-[62%] truncate text-field-500">{lanDeckLabel(resolved)}</span>
        </p>
        {!check.ok && check.errors.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {check.errors.slice(0, 3).map((error) => (
              <li key={error} className="font-body text-[10px] leading-snug text-amber-300/90">
                · {error}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default LanDeckPicker;
