/**
 * 对战准备：选择卡组（已保存 / 快速编组 / 热门卡组）+ 选择 AI 阵营与难度 + 开始对战。
 * 无卡组时提供「去构筑」入口，同时提供快速编组让用户零门槛试玩。
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DeckData, FeaturedDeck } from '../lib/dataBridge';
import { DECK_FACTIONS, factionMeta, factionZh } from '../lib/format';
import { computeDeckStats, validateDraft } from '../lib/deckUi';
import { useDeckStore } from '../stores/deckStore';
import { useFeaturedDecks } from '../lib/useCards';
import { buildQuickDeck, deckCardCount, quickDeckName } from './decks';
import { DIFFICULTY_META, type AIDifficulty } from './aiBridge';
import { useBattleStore } from '../stores/battleStore';
import CurveChart from '../components/CurveChart';
import EmptyState from '../components/EmptyState';
import FactionBadge from '../components/FactionBadge';
import { IconAlert, IconArrowRight, IconCards, IconDeck, IconPlay, IconSwords } from '../components/icons';
import CardFace from './CardFace';

type DeckMode = 'saved' | 'quick' | 'featured';

const MODE_LABEL: Record<DeckMode, string> = {
  saved: '我的卡组',
  quick: '快速编组',
  featured: '热门卡组',
};

export function SetupScreen() {
  const decks = useDeckStore((state) => state.decks);
  const cards = useBattleStore((state) => state.cards);
  const byId = useBattleStore((state) => state.byId);
  const error = useBattleStore((state) => state.error);
  const startBattle = useBattleStore((state) => state.startBattle);
  const { decks: featured } = useFeaturedDecks();

  const [mode, setMode] = useState<DeckMode>(decks.length ? 'saved' : 'quick');
  const [deckId, setDeckId] = useState<string | null>(decks[0]?.id ?? null);
  const [quickFaction, setQuickFaction] = useState('Germany');
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [aiFaction, setAiFaction] = useState('Soviet');
  const [difficulty, setDifficulty] = useState<AIDifficulty>('normal');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (decks.length && !decks.some((deck) => deck.id === deckId)) setDeckId(decks[0].id);
  }, [decks, deckId]);

  useEffect(() => {
    if (featured.length && !featuredId) setFeaturedId(featured[0].id);
  }, [featured, featuredId]);

  const quickDeck = useMemo<DeckData | null>(
    () => (cards.length ? buildQuickDeck(quickFaction, cards, 7) : null),
    [quickFaction, cards],
  );
  const savedDeck = decks.find((deck) => deck.id === deckId) ?? decks[0] ?? null;
  const featuredDeck: FeaturedDeck | null = featured.find((deck) => deck.id === featuredId) ?? null;

  const activeDeck: DeckData | null =
    mode === 'quick' ? quickDeck : mode === 'saved' ? savedDeck : featuredDeck?.deck ?? null;
  const deckName =
    mode === 'quick'
      ? quickDeckName(quickFaction)
      : mode === 'saved'
        ? savedDeck?.name ?? '未命名战斗群'
        : featuredDeck?.name ?? '未命名战斗群';

  // 阵营冲突时自动换一个对手阵营
  useEffect(() => {
    if (!activeDeck) return;
    if (aiFaction === activeDeck.faction) {
      const next = DECK_FACTIONS.find((faction) => faction !== activeDeck.faction) ?? 'Soviet';
      setAiFaction(next);
    }
  }, [activeDeck, aiFaction]);

  const stats = useMemo(() => computeDeckStats(activeDeck, byId), [activeDeck, byId]);
  const validation = useMemo(() => validateDraft(activeDeck, byId), [activeDeck, byId]);
  const total = deckCardCount(activeDeck);
  const sampleCards = useMemo(() => {
    if (!activeDeck) return [];
    return activeDeck.cards
      .slice()
      .sort((a, b) => (byId.get(a.cardId)?.kredits ?? 0) - (byId.get(b.cardId)?.kredits ?? 0))
      .slice(0, 10)
      .map((entry) => ({ entry, card: byId.get(entry.cardId) }))
      .filter((item) => !!item.card);
  }, [activeDeck, byId]);

  const canStart = !!activeDeck && total > 0 && !starting;
  const tooSmall = total > 0 && total < 20;

  const onStart = async () => {
    if (!activeDeck || !canStart) return;
    setStarting(true);
    try {
      await startBattle({ deck: activeDeck, deckName, aiFaction, difficulty, seed: Date.now() });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="battle-root relative min-h-screen w-full overflow-x-hidden text-field-100">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1220px] flex-col px-4 py-4 sm:px-6">
        {/* 页头 */}
        <header className="relative flex flex-wrap items-end justify-between gap-3 border-b border-field-700/60 pb-3">
          <div>
            <p className="fards-label flex items-center gap-2 text-brass-500">
              <span className="inline-block h-px w-6 bg-brass-600/70" />
              FARDS // BATTLE STATION
            </p>
            <h1 className="fards-title mt-1.5 text-2xl leading-none sm:text-3xl">战场部署</h1>
            <p className="mt-1.5 max-w-xl font-body text-[11px] leading-relaxed text-field-400">
              选定作战卡组与假想敌，进入回合制推演。总部被摧毁或主动投降即结束本局。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="fards-btn fards-btn-ghost px-3 py-1.5 text-[11px]">
              返回大厅
            </Link>
            <Link to="/deck" className="fards-btn fards-btn-ghost px-3 py-1.5 text-[11px]">
              <IconDeck size={13} />
              卡组构筑
            </Link>
          </div>
        </header>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-sm border border-ink-red/50 bg-ink-red/10 px-3 py-2">
            <IconAlert size={14} className="shrink-0 text-red-300" />
            <p className="font-body text-[11px] text-red-200">卡牌数据加载失败：{error}</p>
          </div>
        )}

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
          {/* 左上：选择卡组 */}
          <section className="fards-panel flex min-h-0 flex-col overflow-hidden">
            <header className="flex shrink-0 items-center justify-between border-b border-field-700/70 bg-field-950/50 px-3.5 py-2.5">
              <div>
                <p className="fards-label text-[10px] text-brass-500">第一步</p>
                <h2 className="font-display text-[13px] tracking-[0.14em] text-field-100">选择作战卡组</h2>
              </div>
              <div className="flex items-center gap-1">
                {(['saved', 'quick', 'featured'] as DeckMode[]).map((item) => {
                  const disabled = item === 'saved' ? decks.length === 0 : item === 'featured' ? featured.length === 0 : false;
                  return (
                    <button
                      key={item}
                      type="button"
                      disabled={disabled}
                      onClick={() => setMode(item)}
                      className={`rounded-sm border px-2 py-1 font-body text-[10px] tracking-[0.1em] transition-colors ${
                        mode === item
                          ? 'border-brass-500/70 bg-brass-500/15 text-brass-200'
                          : 'border-field-600/60 text-field-400 hover:border-brass-600/60 hover:text-brass-300'
                      } ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
                    >
                      {MODE_LABEL[item]}
                    </button>
                  );
                })}
              </div>
            </header>

            <div className="fards-scroll min-h-0 flex-1 overflow-y-auto p-3">
              {mode === 'saved' && (
                <div className="space-y-1.5">
                  {decks.length === 0 ? (
                    <EmptyState
                      title="还没有保存的卡组"
                      hint="先去构筑页编成一套战斗群，或直接使用「快速编组」开打。"
                      action={
                        <Link to="/deck" className="fards-btn fards-btn-primary px-4 py-1.5 text-[11px]">
                          <IconArrowRight size={13} /> 去构筑
                        </Link>
                      }
                    />
                  ) : (
                    decks.map((deck) => {
                      const selected = deck.id === (savedDeck?.id ?? '');
                      const faction = factionMeta(deck.faction);
                      return (
                        <button
                          key={deck.id}
                          type="button"
                          onClick={() => setDeckId(deck.id)}
                          className={`flex w-full items-center gap-2.5 rounded-sm border px-2.5 py-2 text-left transition-colors ${
                            selected
                              ? 'border-brass-500/70 bg-brass-500/10'
                              : 'border-field-700/60 bg-field-900/40 hover:border-brass-600/60 hover:bg-field-800/50'
                          }`}
                        >
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border font-display text-[12px]"
                            style={{
                              borderColor: `${faction.color}88`,
                              color: faction.color,
                              backgroundColor: `${faction.color}1f`,
                            }}
                          >
                            {faction.zh.slice(0, 1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-[12px] tracking-[0.06em] text-field-100">
                              {deck.name}
                            </span>
                            <span className="mt-0.5 block truncate font-body text-[9px] tracking-[0.1em] text-field-500">
                              {faction.zh}
                              {deck.allyFaction ? ` + ${factionMeta(deck.allyFaction).zh}` : ''} ·{' '}
                              {deckCardCount(deck)} 张 · 更新于{' '}
                              {new Date(deck.updatedAt).toLocaleDateString('zh-CN')}
                            </span>
                          </span>
                          {selected && (
                            <span className="shrink-0 rounded-sm border border-brass-500/60 px-1.5 py-[1px] font-body text-[8px] tracking-[0.14em] text-brass-300">
                              已选
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                  {decks.length > 0 && (
                    <p className="px-1 pt-1 font-body text-[9px] text-field-600">
                      卡组来自构筑页保存（本地 localStorage）。修改编制请前往
                      <Link to="/deck" className="fards-link ml-1">
                        卡组构筑
                      </Link>
                      。
                    </p>
                  )}
                </div>
              )}

              {mode === 'quick' && (
                <div>
                  <p className="mb-2 font-body text-[10px] leading-relaxed text-field-400">
                    按阵营自动配一套 30 张的可用卡组（会随卡牌数据更新），无需先去构筑页。
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {DECK_FACTIONS.map((faction) => {
                      const meta = factionMeta(faction);
                      const selected = faction === quickFaction;
                      return (
                        <button
                          key={faction}
                          type="button"
                          onClick={() => setQuickFaction(faction)}
                          className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors ${
                            selected
                              ? 'border-brass-500/70 bg-brass-500/10'
                              : 'border-field-700/60 bg-field-900/40 hover:border-brass-600/60'
                          }`}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                          <span className="truncate font-body text-[11px] text-field-200">{meta.zh}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 rounded-sm border border-field-700/50 bg-field-950/40 p-2.5">
                    <p className="fards-label text-[9px] text-field-500">快速编组预览</p>
                    <p className="mt-1 font-body text-[10px] text-field-300">
                      {quickDeckName(quickFaction)} · {total} 张 · 单位 {stats.units} / 指令 {stats.orders}
                    </p>
                  </div>
                </div>
              )}

              {mode === 'featured' && (
                <div className="space-y-1.5">
                  {featured.length === 0 ? (
                    <EmptyState title="暂无热门卡组" hint="数据层尚未提供 featured-decks.json。" />
                  ) : (
                    featured.map((deck) => {
                      const selected = deck.id === featuredId;
                      return (
                        <button
                          key={deck.id}
                          type="button"
                          onClick={() => setFeaturedId(deck.id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-sm border px-2.5 py-2 text-left transition-colors ${
                            selected ? 'border-brass-500/70 bg-brass-500/10' : 'border-field-700/60 bg-field-900/40 hover:border-brass-600/60'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-display text-[12px] text-field-100">{deck.name}</span>
                            <span className="block truncate font-body text-[9px] text-field-500">
                              {factionZh(deck.faction)} · {deck.deck ? deckCardCount(deck.deck) : 0} 张
                            </span>
                          </span>
                          {selected && (
                            <span className="shrink-0 font-body text-[8px] tracking-[0.14em] text-brass-300">已选</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* 卡组预览 */}
            <div className="shrink-0 border-t border-field-700/70 bg-field-950/40 p-3">
              {activeDeck ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <FactionBadge faction={activeDeck.faction} size="sm" showEn />
                      {activeDeck.allyFaction && (
                        <FactionBadge faction={activeDeck.allyFaction} size="xs" />
                      )}
                      <span className="font-body text-[10px] text-field-500">
                        {total} 张 · 单位 {stats.units} · 指令 {stats.orders}
                      </span>
                      <span
                        className={`rounded-sm border px-1.5 py-[1px] font-body text-[9px] ${
                          validation.legal
                            ? 'border-ink-green/60 bg-ink-green/10 text-emerald-300'
                            : 'border-amber-600/60 bg-amber-500/10 text-amber-300'
                        }`}
                        title={validation.issues.map((issue) => issue.text).join('；') || '编制合法'}
                      >
                        {validation.legal ? '编制合法' : '非标准编制'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sampleCards.map(({ entry, card }) => (
                        <div
                          key={entry.cardId}
                          className="relative w-[40px] shrink-0"
                          title={`${card!.nameZh} · ${card!.kredits} 费`}
                        >
                          <CardFace card={card!} className="h-full w-full" />
                          <span className="absolute right-0 bottom-0 rounded-tl-[2px] bg-field-950/90 px-0.5 font-display text-[8px] text-brass-300">
                            ×{entry.count}
                          </span>
                        </div>
                      ))}
                      {sampleCards.length === 0 && (
                        <span className="font-body text-[10px] text-field-600">卡组为空</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-[190px]">
                    <CurveChart counts={stats.byKredits} height={60} target={30} />
                  </div>
                </div>
              ) : (
                <p className="font-body text-[10px] text-field-500">尚未选择卡组。</p>
              )}
            </div>
          </section>

          {/* 右侧：敌方情报 */}
          <section className="fards-panel flex min-h-0 flex-col overflow-hidden">
            <header className="shrink-0 border-b border-field-700/70 bg-field-950/50 px-3.5 py-2.5">
              <p className="fards-label text-[10px] text-brass-500">第二步</p>
              <h2 className="font-display text-[13px] tracking-[0.14em] text-field-100">假想敌设定</h2>
            </header>

            <div className="fards-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <div>
                <p className="fards-label mb-1.5 text-[9px] text-field-400">敌方阵营</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {DECK_FACTIONS.map((faction) => {
                    const meta = factionMeta(faction);
                    const selected = faction === aiFaction;
                    return (
                      <button
                        key={faction}
                        type="button"
                        onClick={() => setAiFaction(faction)}
                        className={`flex items-center gap-1.5 rounded-sm border px-1.5 py-1.5 transition-colors ${
                          selected
                            ? 'border-brass-500/80 bg-brass-500/12 text-brass-200'
                            : 'border-field-700/60 bg-field-900/40 text-field-300 hover:border-brass-600/60'
                        }`}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="truncate font-body text-[10px]">{meta.zh}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="fards-label mb-1.5 text-[9px] text-field-400">AI 难度</p>
                <div className="space-y-1.5">
                  {(['easy', 'normal', 'hard'] as AIDifficulty[]).map((level) => {
                    const meta = DIFFICULTY_META[level];
                    const selected = difficulty === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDifficulty(level)}
                        className={`flex w-full items-center gap-2 rounded-sm border px-2.5 py-1.5 text-left transition-colors ${
                          selected
                            ? 'border-brass-500/70 bg-brass-500/10'
                            : 'border-field-700/60 bg-field-900/40 hover:border-brass-600/60'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border font-display text-[10px] ${
                            selected ? 'border-brass-500/70 text-brass-200' : 'border-field-600/60 text-field-400'
                          }`}
                        >
                          {level === 'easy' ? 'Ⅰ' : level === 'normal' ? 'Ⅱ' : 'Ⅲ'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-body text-[11px] text-field-100">
                            {meta.zh}
                            <span className="ml-1 font-body text-[8px] tracking-[0.18em] text-field-500">
                              {meta.en}
                            </span>
                          </span>
                          <span className="block truncate font-body text-[9px] text-field-500">{meta.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-sm border border-field-700/60 bg-field-950/40 p-2.5">
                <p className="fards-label text-[9px] text-field-500">作战简报</p>
                <ul className="mt-1 space-y-1 font-body text-[10px] leading-relaxed text-field-400">
                  <li className="flex items-center gap-1.5">
                    <IconSwords size={11} className="shrink-0 text-brass-500" />
                    总部 20 生命，前 2 / 支援 4，克雷迪特每回合 +1
                  </li>
                  <li className="flex items-center gap-1.5">
                    <IconCards size={11} className="shrink-0 text-brass-500" />
                    敌方卡组按阵营自动编成；难度影响其决策质量
                  </li>
                  <li className="flex items-center gap-1.5">
                    <IconAlert size={11} className="shrink-0 text-amber-400" />
                    {tooSmall
                      ? `当前卡组只有 ${total} 张，抽空后很快进入疲劳`
                      : '对局过程不保存战绩，仅用于卡组测试'}
                  </li>
                </ul>
              </div>
            </div>

            <footer className="shrink-0 border-t border-field-700/70 bg-field-950/60 p-3">
              <div className="mb-2 flex items-center justify-between font-body text-[10px] text-field-500">
                <span className="truncate">
                  {activeDeck ? deckName : '请先选择卡组'}
                </span>
                <span className="shrink-0 text-field-400">
                  vs {factionZh(aiFaction)} · {DIFFICULTY_META[difficulty].zh}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void onStart()}
                disabled={!canStart}
                className="fards-btn fards-btn-primary w-full py-2.5 text-[13px]"
              >
                <IconPlay size={15} />
                {starting ? '正在部署…' : '开始对战'}
              </button>
              {!activeDeck && (
                <p className="mt-2 text-center font-body text-[10px] text-field-600">
                  没有可用卡组？先
                  <Link to="/deck" className="fards-link mx-1">
                    去构筑
                  </Link>
                  或切换到「快速编组」。
                </p>
              )}
            </footer>
          </section>
        </div>

        <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-field-700/50 pt-2 font-body text-[9px] tracking-[0.14em] text-field-600">
          <span>非官方同人项目 · 仅用于卡组测试与娱乐</span>
          <span>ENGINE CONTRACT v1 · 回合制推演</span>
        </footer>
      </div>
    </div>
  );
}

export default SetupScreen;
