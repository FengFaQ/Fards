import { useEffect, useState, type JSX } from 'react';
import { cardImageSources, type UiCard } from '../lib/dataBridge';
import {
  cardKeywords,
  cardTypeMeta,
  factionMeta,
  keywordMeta,
  rarityMeta,
} from '../lib/format';
import { IconAlert, IconX } from './icons';

export interface InspectCardData {
  cardId: string;
  nameZh: string;
  nameEn?: string;
  /** 已解析好的图片 URL（本地/远程由调用方决定，多级兜底由调用方处理） */
  imageSrc?: string;
  factionZh?: string;
  /** 步兵 / 坦克 / … */
  typeZh?: string;
  rarityZh?: string;
  /** 已中文化的词条名 */
  keywords: string[];
  /** 部署花费（克雷迪特） */
  kredits: number;
  /** 行动花费 */
  operationCost: number;
  /** 单位当前攻击 */
  attack?: number;
  /** 单位当前血量 */
  hp?: number;
  maxHp?: number;
  armor?: number;
  /** 指令/单位效果文本 */
  description?: string;
  isUnit: boolean;
  /** 例如「已行动」「被压制」 */
  note?: string;
  side?: 'self' | 'enemy' | 'neutral';
}

export interface CardInspectPanelProps {
  card: InspectCardData | null;
  onClose?: () => void;
  className?: string;
}

/** 战场单位当前状态（用于把 UiCard 合成 InspectCardData） */
export interface InspectUnitState {
  attack?: number;
  hp?: number;
  maxHp?: number;
  armor?: number;
  /** 关键词 id（如 blitz/fury）或已中文化文本都支持 */
  keywords?: string[];
  note?: string;
  side?: 'self' | 'enemy' | 'neutral';
  isUnit?: boolean;
}

/**
 * 便捷转换：卡牌定义 + 可选单位当前状态 → InspectCardData
 * （battle-forge 可选用；不传 unitState 时展示卡牌基础数值）
 */
export function inspectFromCard(card: UiCard, unitState?: InspectUnitState): InspectCardData {
  const faction = factionMeta(card.faction);
  const type = cardTypeMeta(card.type);
  const rarity = rarityMeta(card.rarity);
  const isUnitByType = type.key !== 'order' && type.key !== 'countermeasure';
  const rawKeywords = unitState?.keywords?.length
    ? unitState.keywords
    : cardKeywords(card).map((keyword) => keyword.zh);
  const keywords = rawKeywords
    .map((raw) => {
      const meta = keywordMeta(raw);
      return meta.internal ? '' : meta.zh;
    })
    .filter(Boolean);

  return {
    cardId: card.cardId,
    nameZh: card.nameZh,
    nameEn: card.nameEn,
    imageSrc: cardImageSources(card)[0],
    factionZh: faction.zh,
    typeZh: type.zh,
    rarityZh: rarity.zh,
    keywords,
    kredits: card.kredits,
    operationCost: card.operationCost,
    attack: unitState?.attack ?? (isUnitByType ? card.attack : undefined),
    hp: unitState?.hp ?? (isUnitByType ? card.defense : undefined),
    maxHp: unitState?.maxHp ?? (isUnitByType ? card.defense : undefined),
    armor: unitState?.armor,
    description: card.description,
    isUnit: unitState?.isUnit ?? isUnitByType,
    note: unitState?.note,
    side: unitState?.side ?? 'neutral',
  };
}

const SIDE_META: Record<NonNullable<InspectCardData['side']>, { zh: string; color: string }> = {
  self: { zh: '我方', color: '#d8b45f' },
  enemy: { zh: '敌方', color: '#d2553f' },
  neutral: { zh: '中立', color: '#a8a08a' },
};

function StatCell({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'kredit' | 'attack' | 'hp';
}) {
  const color =
    tone === 'kredit'
      ? 'text-brass-300'
      : tone === 'attack'
        ? 'text-orange-300'
        : tone === 'hp'
          ? 'text-red-300'
          : 'text-field-100';
  return (
    <div className="rounded-sm border border-field-700/70 bg-field-950/60 px-2 py-1.5">
      <dt className="font-body text-[9px] tracking-[0.16em] text-field-500 uppercase">{label}</dt>
      <dd className={`mt-0.5 font-display text-[13px] leading-none tracking-wide ${color}`}>{value}</dd>
    </div>
  );
}

/**
 * 卡片状态候选框（Inspect Panel）
 * ------------------------------------------------------------------
 * 战场右下角固定面板：点击/悬停卡片时由调用方把数据传进来（card=null 返回 null）。
 * - 军事档案风：军绿近黑底 + 黄铜描边 + 扫描线
 * - 卡图 object-contain（68/84/104px 三档），失败退回阵营色占位
 * - 两列数值：部署 / 行动 / 血量 / 攻击（+装甲）
 * - 底部备注（已行动 / 被压制 等）
 * 响应式：<1024px 宽 260px，≥1024px 宽 340px；固定 bottom-24（96px）避免遮挡手牌。
 */
export default function CardInspectPanel({
  card,
  onClose,
  className = '',
}: CardInspectPanelProps): JSX.Element | null {
  const [imageFailed, setImageFailed] = useState(false);
  const cardId = card?.cardId ?? null;

  useEffect(() => {
    setImageFailed(false);
  }, [cardId]);

  if (!card) return null;

  const side = SIDE_META[card.side ?? 'neutral'];
  const showImage = Boolean(card.imageSrc) && !imageFailed;
  const hpText =
    card.hp !== undefined ? `${card.hp}${card.maxHp !== undefined ? ` / ${card.maxHp}` : ''}` : '—';

  return (
    <aside
      key={card.cardId}
      className={`fards-inspect-panel fards-inspect-scan fixed right-4 bottom-24 z-[60] w-[260px] overflow-hidden rounded border border-brass-600/50 bg-field-950/95 shadow-[0_18px_50px_rgb(0_0_0/0.65)] backdrop-blur-md lg:w-[340px] ${className}`}
      role="complementary"
      aria-label={`卡片状态：${card.nameZh}`}
      data-inspect-card={card.cardId}
    >
      {/* 侧边阵营/归属色条 */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: side.color }} />

      {/* 头部 */}
      <header className="flex items-center justify-between gap-2 border-b border-field-700/70 bg-field-900/70 px-3 py-2 pl-4">
        <div className="flex items-center gap-2">
          <span className="font-display text-[10px] tracking-[0.2em] text-brass-300 uppercase">
            卡片状态 / INSPECT
          </span>
          <span
            className="rounded-sm border px-1 py-[1px] font-body text-[9px] tracking-[0.18em]"
            style={{ borderColor: `${side.color}88`, color: side.color }}
          >
            {side.zh}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭卡片状态"
            className="rounded-sm border border-field-600/60 p-1 text-field-400 transition-colors hover:border-brass-500/60 hover:text-brass-300"
          >
            <IconX size={12} />
          </button>
        )}
      </header>

      <div className="fards-scroll max-h-[calc(100vh-16rem)] overflow-y-auto px-3 py-2.5 pl-4">
        {/* 卡图 + 名称 */}
        <div className="flex gap-3">
          <figure className="relative w-[68px] shrink-0 overflow-hidden rounded-sm border border-field-600/70 bg-field-900 lg:w-[84px]">
            <div className="aspect-[5/7] w-full">
              {showImage ? (
                <img
                  src={card.imageSrc}
                  alt={card.nameZh}
                  loading="eager"
                  decoding="async"
                  onError={() => setImageFailed(true)}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-field-800 to-field-950 p-1 text-center">
                  <span className="font-display text-[9px] tracking-[0.16em] text-field-500">
                    {card.factionZh ?? '—'}
                  </span>
                  <span className="line-clamp-3 font-body text-[9px] leading-tight text-field-300">
                    {card.nameZh}
                  </span>
                </div>
              )}
            </div>
          </figure>

          <div className="min-w-0 flex-1">
            <h3 className="truncate font-body text-[15px] leading-tight font-semibold tracking-wide text-field-100">
              {card.nameZh}
            </h3>
            {card.nameEn && (
              <p className="mt-0.5 truncate font-body text-[9px] tracking-[0.16em] text-field-500 uppercase">
                {card.nameEn}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {card.factionZh && <span className="fards-tag">{card.factionZh}</span>}
              {card.typeZh && <span className="fards-tag">{card.typeZh}</span>}
              {card.rarityZh && (
                <span className="fards-tag border-brass-600/40 text-brass-300">{card.rarityZh}</span>
              )}
              {!card.isUnit && <span className="fards-tag text-field-400">指令</span>}
            </div>
          </div>
        </div>

        {/* 词条 */}
        {card.keywords.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.keywords.slice(0, 8).map((keyword) => (
              <span
                key={keyword}
                className="rounded-sm border border-brass-700/50 bg-brass-500/10 px-1.5 py-[1px] font-body text-[9px] tracking-wider text-brass-200"
              >
                {keyword}
              </span>
            ))}
          </div>
        )}

        {/* 数值：部署 / 行动 / 血量 / 攻击（+装甲） */}
        <dl className="mt-2.5 grid grid-cols-2 gap-1.5">
          <StatCell label="部署花费" value={`${card.kredits} 克`} tone="kredit" />
          <StatCell label="行动花费" value={`${card.operationCost}`} />
          <StatCell label="血量" value={hpText} tone="hp" />
          <StatCell
            label="攻击"
            value={card.attack !== undefined ? `${card.attack}` : '—'}
            tone="attack"
          />
          {typeof card.armor === 'number' && card.armor > 0 && (
            <StatCell label="装甲" value={`${card.armor}`} />
          )}
        </dl>

        {/* 效果文本 */}
        {card.description && card.description.trim() && (
          <div className="fards-parchment mt-2.5 rounded-sm border border-field-700/60 bg-field-900/50 px-2 py-1.5">
            <p className="mb-1 font-body text-[8px] tracking-[0.2em] text-brass-500 uppercase">
              作战条令
            </p>
            <p className="font-body text-[10px] leading-relaxed text-field-300">
              {card.description}
            </p>
          </div>
        )}

        {/* 状态备注 */}
        {card.note && (
          <p className="mt-2 flex items-start gap-1.5 rounded-sm border border-amber-600/40 bg-amber-500/10 px-2 py-1 font-body text-[10px] leading-snug text-amber-200">
            <IconAlert size={11} className="mt-[1px] shrink-0" />
            <span>{card.note}</span>
          </p>
        )}
      </div>
    </aside>
  );
}
