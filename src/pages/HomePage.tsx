import { Link, useNavigate } from 'react-router-dom';
import { FactionBadge } from '../ui/components/FactionBadge';
import {
  IconArrowRight,
  IconBrain,
  IconCards,
  IconDeck,
  IconExternal,
  IconImage,
  IconLink,
  IconShield,
  IconSwords,
  IconTrophy,
} from '../ui/components/icons';
import { copyText } from '../ui/lib/clipboard';
import { factionMeta } from '../ui/lib/format';
import type { FeaturedDeck } from '../ui/lib/dataBridge';
import { useCards, useFeaturedDecks } from '../ui/lib/useCards';
import { toast } from '../ui/stores/toastStore';

const REPO_URL = 'https://github.com/FengFaQ/Fards';

const FEATURES = [
  {
    icon: IconShield,
    title: '完整前线规则',
    text: '前线 / 支援线双线战场，克雷迪特成长、疲劳、士气与指令时序，按官方规则还原。',
  },
  {
    icon: IconLink,
    title: '卡组导入导出',
    text: '兼容 KARDS deck code 与分享 URL，一键复制、保存多套战斗群，随时换装。',
  },
  {
    icon: IconImage,
    title: '自动出图',
    text: '一键生成横版卡组概览图，费用曲线、类型分布与主副阵营一目了然。',
  },
  {
    icon: IconBrain,
    title: 'AI 对战',
    text: '内置决策 AI 替你试跑卡组，先把曲线和节奏打顺，再上真人战场。',
  },
];

const ENTRIES = [
  {
    to: '/cards',
    icon: IconCards,
    eyebrow: 'COLLECTION',
    title: '卡牌图鉴',
    text: '全量卡牌档案，按阵营、类型、稀有度、费用与关键字检索。',
    action: '查阅档案',
  },
  {
    to: '/deck',
    icon: IconDeck,
    eyebrow: 'DECK BUILDER',
    title: '卡组构筑',
    text: '主阵营 + 盟军编制，同名上限与精英配额实时校验，曲线即时可视。',
    action: '开始构筑',
  },
  {
    to: '/battle',
    icon: IconSwords,
    eyebrow: 'BATTLE',
    title: '开始对战',
    text: '用你的战斗群对局 AI，检验开局节奏、解场手段与后期续航。',
    action: '进入战场',
  },
];

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-2xl leading-none tracking-wider text-brass-300 sm:text-3xl">
        {value}
      </span>
      <span className="mt-1 font-body text-[10px] tracking-[0.24em] text-field-500 uppercase">
        {label}
      </span>
    </div>
  );
}

function FeaturedDeckTile({ deck }: { deck: FeaturedDeck }) {
  const navigate = useNavigate();
  const faction = factionMeta(deck.faction);
  const ally = deck.allyFaction ? factionMeta(deck.allyFaction) : null;
  const total = deck.deck?.cards.reduce((sum, c) => sum + c.count, 0) ?? 0;

  const handleCopy = async () => {
    if (!deck.deckCode) {
      toast('该战斗群没有可复制的卡组代码', 'warn');
      return;
    }
    const ok = await copyText(deck.deckCode);
    toast(ok ? '卡组代码已复制到剪贴板' : '复制失败，请手动选择代码', ok ? 'success' : 'error');
  };

  return (
    <article
      className="group relative w-[286px] shrink-0 snap-start overflow-hidden rounded border border-field-700/70 bg-field-900/70 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-brass-600/60 hover:shadow-[var(--shadow-lift)]"
      style={{
        backgroundImage: `linear-gradient(135deg, ${faction.color}1a 0%, transparent 45%)`,
      }}
    >
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ backgroundColor: faction.color }} />
      <div className="flex items-center justify-between gap-2">
        <FactionBadge faction={deck.faction} size="xs" />
        {ally && (
          <span className="font-body text-[9px] tracking-wider text-field-500">
            盟军 {ally.zh}
          </span>
        )}
      </div>
      <h3 className="mt-2.5 line-clamp-1 font-display text-base tracking-wide text-field-100">
        {deck.name}
      </h3>
      <p className="mt-1 line-clamp-2 min-h-[2.4em] font-body text-[11px] leading-snug text-field-400">
        {deck.description || `${faction.zh}主力编制，共 ${total || '—'} 张卡牌。`}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-field-700/60 pt-2.5">
        <span className="font-body text-[10px] tracking-wider text-field-500">
          {deck.author ? `编制 ${deck.author}` : '公开构筑'}
          {deck.views !== undefined ? ` · ${deck.views} 赞` : ''}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-sm border border-field-600/70 px-1.5 py-1 font-body text-[9px] tracking-wider text-field-300 transition-colors hover:border-brass-600/60 hover:text-brass-300"
            title="复制 deck code"
          >
            代码
          </button>
          <button
            type="button"
            onClick={() => navigate(`/deck?featured=${encodeURIComponent(deck.id)}`)}
            className="flex items-center gap-1 rounded-sm border border-brass-600/50 bg-brass-500/10 px-1.5 py-1 font-body text-[9px] tracking-wider text-brass-300 transition-colors hover:bg-brass-500/20"
            title="在构筑器中打开"
          >
            载入
            <IconArrowRight size={10} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const { cards } = useCards();
  const { decks } = useFeaturedDecks();

  return (
    <div className="pb-2">
      {/* ============ Hero ============ */}
      <section className="relative overflow-hidden border-b border-field-700/60">
        <div className="fards-grid-bg pointer-events-none absolute inset-0 opacity-60" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 20% 0%, rgb(195 155 58 / 0.14), transparent 55%), radial-gradient(ellipse at 90% 100%, rgb(93 122 63 / 0.12), transparent 50%)',
          }}
        />
        <div className="pointer-events-none absolute -top-20 right-[-6%] hidden h-[420px] w-[420px] rotate-12 rounded-full border border-brass-700/20 lg:block" />
        <div className="pointer-events-none absolute -top-10 right-[2%] hidden h-[300px] w-[300px] rotate-12 rounded-full border border-brass-700/15 lg:block" />

        <div className="relative mx-auto grid w-full max-w-[1500px] items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.25fr_0.75fr] lg:px-8 lg:py-20">
          <div className="animate-[rise_500ms_cubic-bezier(0.16,1,0.3,1)_both]">
            <p className="fards-label flex items-center gap-2.5 text-brass-500">
              <span className="inline-block h-px w-8 bg-brass-600/70" />
              OPEN SOURCE · KARDS DECK TESTING
            </p>

            <h1 className="mt-4 font-display text-6xl leading-none tracking-[0.08em] text-transparent sm:text-7xl lg:text-8xl">
              <span className="bg-gradient-to-b from-brass-200 via-brass-400 to-brass-700 bg-clip-text drop-shadow-[0_2px_0_rgb(0_0_0/0.5)]">
                FARDS
              </span>
            </h1>

            <p className="mt-4 font-body text-xl tracking-[0.14em] text-field-100 sm:text-2xl">
              KARDS 卡组对战测试场
            </p>
            <p className="mt-3 max-w-xl font-body text-[13px] leading-relaxed text-field-300">
              开源网页版卡组构筑与对战测试工具。覆盖全量卡牌档案，支持主副阵营编制、同名与精英配额实时校验、
              一键导入导出 deck code，以及自动化出图。非官方同人项目，仅供娱乐与卡组测试。
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link to="/deck" className="fards-btn fards-btn-primary px-5 py-2.5">
                <IconDeck size={16} />
                开始构筑战斗群
              </Link>
              <Link to="/cards" className="fards-btn px-4 py-2.5">
                <IconCards size={15} />
                卡牌图鉴
              </Link>
              <Link to="/battle" className="fards-btn fards-btn-ghost px-4 py-2.5">
                直接对战
                <IconArrowRight size={14} />
              </Link>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-9 gap-y-4 border-t border-field-700/60 pt-5">
              <HeroStat value={cards.length ? String(cards.length) : '—'} label="卡牌档案" />
              <HeroStat value="9" label="主战阵营" />
              <HeroStat value="39" label="标准编制" />
              <HeroStat value="4" label="同名上限" />
            </div>
          </div>

          {/* 作战简报 */}
          <aside className="fards-panel fards-rivets relative hidden overflow-hidden p-5 lg:block">
            <div className="absolute inset-x-0 top-0 h-1 fards-hazard opacity-70" />
            <div className="flex items-center justify-between">
              <span className="fards-label text-brass-500">作战简报 / FIELD BRIEF</span>
              <span className="rounded-sm border border-brass-600/50 px-1.5 py-0.5 font-mono text-[9px] text-brass-400">
                F-001
              </span>
            </div>
            <p className="mt-3 font-display text-lg leading-snug tracking-wide text-field-100">
              先把编制打顺，
              <br />
              再上真人战场。
            </p>
            <dl className="mt-4 space-y-2.5">
              {[
                ['数据快照', cards.length ? `${cards.length} 张卡牌` : '加载中…'],
                ['卡池范围', '现役 / 预备 / 衍生'],
                ['编制规则', '39 张 · 同名 4 · 精英 1'],
                ['出图协议', '?action=overview_horizontal'],
              ].map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 border-b border-field-700/40 pb-2">
                  <dt className="font-body text-[11px] tracking-wider text-field-500">{key}</dt>
                  <dd className="truncate font-body text-[11px] text-field-200">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-green" />
              <span className="font-body text-[10px] tracking-[0.18em] text-field-400 uppercase">
                Data link online
              </span>
            </div>
            <span className="pointer-events-none absolute -right-6 -bottom-6 font-display text-7xl text-brass-500/5 select-none">
              HQ
            </span>
          </aside>
        </div>
      </section>

      {/* ============ 三个入口 ============ */}
      <section className="mx-auto w-full max-w-[1500px] px-4 pt-10 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {ENTRIES.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.to}
                to={entry.to}
                className="fards-panel group relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 hover:border-brass-600/50 hover:shadow-[var(--shadow-lift)]"
              >
                <span className="pointer-events-none absolute -right-3 -bottom-3 font-display text-6xl text-brass-500/5 transition-colors group-hover:text-brass-500/10 select-none">
                  <Icon size={72} />
                </span>
                <div className="flex items-center justify-between">
                  <span className="fards-label text-brass-500">{entry.eyebrow}</span>
                  <Icon size={20} className="text-field-400 transition-colors group-hover:text-brass-400" />
                </div>
                <h2 className="mt-3 font-display text-xl tracking-wide text-field-100">{entry.title}</h2>
                <p className="mt-1.5 min-h-[3em] font-body text-[12px] leading-relaxed text-field-400">
                  {entry.text}
                </p>
                <span className="mt-2 inline-flex items-center gap-1.5 font-body text-[11px] tracking-[0.16em] text-brass-400 transition-transform group-hover:translate-x-0.5">
                  {entry.action}
                  <IconArrowRight size={12} />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ============ 玩法特性 ============ */}
      <section className="mx-auto w-full max-w-[1500px] px-4 pt-12 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-end justify-between border-b border-field-700/60 pb-2">
          <h2 className="fards-title text-lg">战场特性</h2>
          <span className="font-body text-[10px] tracking-[0.22em] text-field-600 uppercase">
            Core Mechanics
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="fards-panel-raised group relative overflow-hidden p-4">
                <span className="absolute top-2 right-3 font-display text-2xl text-brass-500/15">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-brass-600/40 bg-field-950/60 text-brass-400 transition-colors group-hover:border-brass-500/70 group-hover:text-brass-300">
                  <Icon size={18} />
                </div>
                <h3 className="mt-3 font-display text-sm tracking-[0.12em] text-field-100">
                  {feature.title}
                </h3>
                <p className="mt-1.5 font-body text-[11px] leading-relaxed text-field-400">
                  {feature.text}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ============ 热门卡组 ============ */}
      {decks.length > 0 && (
        <section className="mx-auto w-full max-w-[1500px] px-4 pt-12 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-end justify-between border-b border-field-700/60 pb-2">
            <h2 className="fards-title flex items-center gap-2 text-lg">
              <IconTrophy size={17} className="text-brass-500" />
              热门战斗群
            </h2>
            <span className="font-body text-[10px] tracking-[0.22em] text-field-600 uppercase">
              Featured Decks
            </span>
          </div>
          <div className="fards-scroll flex snap-x gap-3 overflow-x-auto pb-3">
            {decks.slice(0, 8).map((deck) => (
              <FeaturedDeckTile key={deck.id} deck={deck} />
            ))}
          </div>
        </section>
      )}

      {/* ============ 免责声明 ============ */}
      <section className="mx-auto w-full max-w-[1500px] px-4 pt-12 sm:px-6 lg:px-8">
        <div className="fards-panel relative overflow-hidden p-5">
          <div className="absolute inset-y-0 left-0 w-1 fards-hazard opacity-60" />
          <div className="flex flex-col gap-3 pl-2 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <p className="fards-label mb-1.5 text-brass-500">免责声明 / DISCLAIMER</p>
              <p className="font-body text-[11px] leading-relaxed text-field-400">
                本项目为
                <span className="text-field-200">非官方同人项目</span>
                ，与 1939 Games 无任何关联，未获其授权或背书。KARDS 及相关卡牌名称、美术素材、商标版权归{' '}
                <span className="text-field-200">1939 Games</span> 所有。本项目仅供卡组构筑测试与个人娱乐，
                不得用于任何商业用途。代码以 AGPL-3.0 协议开源，欢迎审阅与改进。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="fards-btn fards-btn-ghost py-1.5 text-[11px]">
                <IconExternal size={13} />
                GitHub / FengFaQ/Fards
              </a>
              <Link to="/about" className="fards-btn fards-btn-ghost py-1.5 text-[11px]">
                关于项目
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
