import { memo, useMemo } from 'react';
import type { DeckData, UiCard } from '../lib/dataBridge';
import {
  computeDeckStats,
  groupDeckByKredit,
  RULES,
  validateDraft,
  type DraftIssue,
  type DraftValidation,
  type DeckStats,
} from '../lib/deckUi';
import { cardTypeMeta, cardTypeZh, factionMeta, rarityMeta, typeColor } from '../lib/format';
import { CurveChart } from './CurveChart';
import { TypeBar } from './TypeBar';
import { IconAlert, IconCheck, IconInfo, IconMinus, IconPlus, IconTrash } from './icons';

export interface DeckPanelProps {
  /** 只依赖编制内容（faction/allyFaction/cards）：改名不会让整个面板重渲染 */
  deck: DeckData | null;
  byId: Map<string, UiCard>;
  onAdd: (card: UiCard) => void;
  onRemove: (cardId: string) => void;
  onClear: () => void;
  className?: string;
  /** 页面已算好的统计/校验：传进来避免同一份数据被算两遍 */
  stats?: DeckStats;
  validation?: DraftValidation;
}

const LEVEL_STYLE: Record<DraftIssue['level'], { color: string; icon: typeof IconInfo }> = {
  error: { color: 'text-red-300', icon: IconAlert },
  warn: { color: 'text-amber-300', icon: IconAlert },
  info: { color: 'text-field-400', icon: IconInfo },
};

/** 右侧卡组面板：编制总览 / 曲线 / 类型分布 / 校验 / 卡牌清单 */
function DeckPanelInner({
  deck,
  byId,
  onAdd,
  onRemove,
  onClear,
  className = '',
  stats: statsProp,
  validation: validationProp,
}: DeckPanelProps) {
  const stats = useMemo(() => statsProp ?? computeDeckStats(deck, byId), [statsProp, deck, byId]);
  const validation = useMemo(
    () => validationProp ?? validateDraft(deck, byId),
    [validationProp, deck, byId],
  );
  const groups = useMemo(() => groupDeckByKredit(deck, byId), [deck, byId]);
  const total = stats.total;
  const progress = Math.min(100, Math.round((total / RULES.deckSize) * 100));
  const faction = deck ? factionMeta(deck.faction) : null;
  const typeItems = useMemo(
    () =>
      stats.byType
        .map((item) => ({
          key: item.key,
          label: cardTypeZh(item.key),
          count: item.count,
          color: typeColor(item.key),
        }))
        .sort((a, b) => b.count - a.count),
    [stats],
  );

  if (!deck) {
    return (
      <aside className={`fards-panel fards-no-blur p-4 ${className}`}>
        <p className="fards-label text-brass-500">战斗群编制</p>
        <p className="mt-3 font-body text-xs leading-relaxed text-field-400">
          先在左侧确定主阵营与盟军阵营，随后即可开始编入卡牌。编制进度、克雷迪特曲线与合法性校验会即时更新。
        </p>
        <div className="mt-4 space-y-2">
          {[
            ['标准编制', `${RULES.deckSize} 张`],
            ['同名上限', `${RULES.maxCopies} 张`],
            ['精英上限', `${RULES.maxElite} 张`],
            ['阵营限制', '仅主阵营 + 盟军'],
          ].map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between border-b border-field-700/40 pb-1.5"
            >
              <span className="font-body text-[11px] tracking-wider text-field-500">{key}</span>
              <span className="font-body text-[11px] text-field-200">{value}</span>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className={`fards-panel fards-no-blur flex max-h-[calc(100vh-88px)] flex-col overflow-hidden ${className}`}>
      {/* 编制总览 */}
      <div className="shrink-0 border-b border-field-700/70 bg-field-950/50 p-3.5">
        <div className="flex items-end justify-between">
          <div>
            <p className="fards-label text-[10px] text-brass-500">战斗群编制</p>
            <p className="mt-1 font-display text-2xl leading-none text-field-100">
              {total}
              <span className="ml-1 font-body text-sm text-field-500">/ {RULES.deckSize}</span>
            </p>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body text-[10px] tracking-wider ${
                validation.legal
                  ? 'border-ink-green/60 bg-ink-green/10 text-emerald-300'
                  : 'border-amber-600/60 bg-amber-500/10 text-amber-300'
              }`}
            >
              {validation.legal ? <IconCheck size={11} /> : <IconAlert size={11} />}
              {validation.legal ? '编制合法' : '待修正'}
            </span>
            <p className="mt-1 font-body text-[10px] text-field-500">
              单位 {stats.units} · 指令 {stats.orders}
            </p>
          </div>
        </div>

        {/* 进度条：用 scaleX 代替 width 过渡，避免每帧触发布局（原 transition-[width]） */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-field-800">
          <div
            className="h-full w-full origin-left rounded-full transition-transform duration-300"
            style={{
              transform: `scaleX(${progress / 100})`,
              background:
                total === RULES.deckSize
                  ? 'linear-gradient(to right, #5d7a3f, #9fc06a)'
                  : 'linear-gradient(to right, #7a5d1a, #d8b45f)',
            }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between font-body text-[10px] text-field-500">
          <span>
            {faction?.zh}
            {deck.allyFaction ? ` + ${factionMeta(deck.allyFaction).zh}` : ''}
          </span>
          <span>
            精英 {stats.elite} · 盟军 {stats.allyCards}
          </span>
        </div>
      </div>

      <div className="fards-scroll min-h-0 flex-1 overflow-y-auto">
        {/* 曲线 + 分布 */}
        <div className="space-y-3 border-b border-field-700/60 p-3.5">
          <CurveChart counts={stats.byKredits} target={RULES.deckSize} />
          <div>
            <p className="fards-label mb-1.5 text-field-400">类型分布</p>
            <TypeBar
              total={Math.max(1, stats.total - stats.missing)}
              items={typeItems}
            />
          </div>
        </div>

        {/* 校验信息 */}
        <div className="border-b border-field-700/60 p-3">
          <div className="flex items-center justify-between">
            <p className="fards-label text-field-400">编制校验</p>
            <span className="font-body text-[10px] text-field-500">
              {validation.issues.length} 项
            </span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {validation.issues.slice(0, 6).map((issue, index) => {
              const style = LEVEL_STYLE[issue.level];
              const Icon = style.icon;
              return (
                <li key={index} className={`flex items-start gap-1.5 font-body text-[10px] leading-snug ${style.color}`}>
                  <Icon size={11} className="mt-0.5 shrink-0" />
                  <span>{issue.text}</span>
                </li>
              );
            })}
            {validation.issues.length === 0 && (
              <li className="flex items-center gap-1.5 font-body text-[10px] text-emerald-300">
                <IconCheck size={11} /> 编制完备，可以出击
              </li>
            )}
          </ul>
        </div>

        {/* 卡牌清单 */}
        <div className="p-2.5">
          {groups.length === 0 ? (
            <p className="px-1 py-6 text-center font-body text-[11px] text-field-500">
              尚未编入任何卡牌
            </p>
          ) : (
            groups.map((group) => {
              const groupTotal = group.entries.reduce((sum, entry) => sum + entry.count, 0);
              return (
                <div key={group.kredit} className="mb-2">
                  <div className="mb-1 flex items-center gap-2 px-1">
                    <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-brass-600/50 bg-field-950 font-display text-[9px] text-brass-300">
                      {group.kredit === 9 ? '9+' : group.kredit}
                    </span>
                    <span className="font-body text-[9px] tracking-wider text-field-500">
                      {groupTotal} 张
                    </span>
                    <span className="h-px flex-1 bg-field-700/50" />
                  </div>
                  {group.entries.map(({ card, count }) => {
                    const rarity = rarityMeta(card.rarity);
                    return (
                      <div
                        key={card.cardId}
                        className="group flex items-center gap-1.5 rounded-sm px-1 py-[3px] transition-colors hover:bg-field-800/70"
                        title={`${card.nameZh} · ${card.nameEn}`}
                      >
                        <span
                          className="h-3.5 w-[2px] shrink-0 rounded-full"
                          style={{ backgroundColor: factionMeta(card.faction).color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 truncate">
                            <span className="truncate font-body text-[11px] text-field-100">
                              {card.nameZh}
                            </span>
                            <span className="shrink-0 font-body text-[8px] text-field-500">
                              {cardTypeMeta(card.type).glyph}
                            </span>
                          </span>
                          <span className="block truncate font-body text-[8px] tracking-wider text-field-500">
                            {cardTypeZh(card.type)} · {rarity.zh}
                            {rarity.key === 'Elite' ? ' · 限 1' : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center overflow-hidden rounded-sm border border-field-600/70">
                          <button
                            type="button"
                            aria-label={`移除 ${card.nameZh}`}
                            className="flex h-5 w-5 items-center justify-center text-field-300 transition-colors hover:bg-field-700 hover:text-red-300"
                            onClick={() => onRemove(card.cardId)}
                          >
                            <IconMinus size={10} />
                          </button>
                          <span className="w-5 text-center font-display text-[11px] text-brass-300">
                            {count}
                          </span>
                          <button
                            type="button"
                            aria-label={`添加 ${card.nameZh}`}
                            className="flex h-5 w-5 items-center justify-center text-field-300 transition-colors hover:bg-field-700 hover:text-brass-300"
                            onClick={() => onAdd(card)}
                          >
                            <IconPlus size={10} />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-field-700/70 bg-field-950/60 px-3 py-2">
        <button
          type="button"
          onClick={onClear}
          disabled={stats.total === 0}
          className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-field-600/60 py-1.5 font-body text-[10px] tracking-[0.16em] text-field-400 transition-colors hover:border-red-500/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconTrash size={11} />
          清空编制
        </button>
      </div>
    </aside>
  );
}

export const DeckPanel = memo(DeckPanelInner);
export default DeckPanel;
