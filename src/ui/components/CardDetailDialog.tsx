import { memo, useMemo } from 'react';
import type { UiCard } from '../lib/dataBridge';
import { cardKeywords, cardTypeMeta, factionMeta, poolZh, rarityMeta, setZh } from '../lib/format';
import { CardView } from './CardView';
import { Dialog } from './Dialog';
import { FactionBadge } from './FactionBadge';
import { StatBadge } from './StatBadge';
import { IconPlus } from './icons';

export interface CardDetailDialogProps {
  card: UiCard | null;
  open: boolean;
  onClose: () => void;
  /** 同名卡在卡牌库中的数量 */
  sameNameCount?: number;
  /** 当前卡组中已有张数 */
  deckCount?: number;
  onAdd?: (card: UiCard) => void;
  addDisabledReason?: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="fards-label text-[10px] text-field-500">{label}</span>
      <span className="font-body text-xs text-field-200">{children}</span>
    </div>
  );
}

/** 卡牌详情弹窗：大图 + 全字段 + 效果文本 + 关键字 */
function CardDetailDialogInner({
  card,
  open,
  onClose,
  sameNameCount,
  deckCount = 0,
  onAdd,
  addDisabledReason,
}: CardDetailDialogProps) {
  const faction = factionMeta(card?.faction);
  const rarity = rarityMeta(card?.rarity);
  const type = cardTypeMeta(card?.type);
  const keywords = useMemo(() => (card ? cardKeywords(card) : []), [card]);

  return (
    <Dialog
      open={open && Boolean(card)}
      onClose={onClose}
      width="xl"
      eyebrow={card ? `${faction.zh} · ${rarity.zh} · ${setZh(card.set)}` : undefined}
      title={card?.nameZh}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-body text-[11px] text-field-400">
            {card?.nameEn}
            {card?.importId ? ` · ${card.importId}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="fards-btn fards-btn-ghost" onClick={onClose}>
              关闭
            </button>
            {onAdd && card && (
              <button
                type="button"
                className="fards-btn fards-btn-primary"
                onClick={() => onAdd(card)}
                disabled={Boolean(addDisabledReason)}
                title={addDisabledReason ?? '加入当前卡组'}
              >
                <IconPlus size={14} />
                加入卡组
                {deckCount > 0 && <span className="text-[10px] opacity-80">已编入 ×{deckCount}</span>}
              </button>
            )}
          </div>
        </div>
      }
    >
      {card && (
        <div className="grid gap-5 md:grid-cols-[280px_1fr]">
          <div className="mx-auto w-full max-w-[280px]">
            <CardView card={card} size="lg" eager nameplate={false} />
            <div className="mt-2 flex items-center justify-center gap-2">
              <FactionBadge faction={card.faction} size="sm" />
              <span className="fards-tag">{type.zh}</span>
              <span
                className="fards-tag"
                style={{ borderColor: `${rarity.color}66`, color: rarity.color }}
              >
                {rarity.zh}
              </span>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              <h3 className="font-display text-xl leading-tight tracking-wide text-brass-200">
                {card.nameZh}
              </h3>
              <p className="mt-0.5 font-body text-[11px] tracking-[0.2em] text-field-500 uppercase">
                {card.nameEn}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatBadge kind="kredit" value={card.kredits} size="md" />
              {type.key !== 'order' && type.key !== 'countermeasure' && (
                <>
                  <StatBadge kind="attack" value={card.attack} size="md" />
                  <StatBadge kind="defense" value={card.defense} size="md" />
                </>
              )}
              <StatBadge kind="operation" value={card.operationCost} size="md" />
            </div>

            <div className="fards-parchment rounded border border-field-700/60 bg-field-950/40 p-3">
              <p className="fards-label mb-1.5 text-brass-500">作战条令</p>
              <p className="font-body text-[13px] leading-relaxed whitespace-pre-wrap text-field-100">
                {card.description?.trim() || '（无附加效果）'}
              </p>
              {card.descriptionEn && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-body text-[10px] tracking-[0.16em] text-field-500 uppercase hover:text-brass-400">
                    英文原文
                  </summary>
                  <p className="mt-1 font-body text-[11px] leading-relaxed text-field-400">
                    {card.descriptionEn}
                  </p>
                </details>
              )}
            </div>

            {keywords.length > 0 && (
              <div>
                <p className="fards-label mb-1.5 text-field-500">关键字</p>
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((keyword) => (
                    <span
                      key={keyword.id}
                      className="fards-tag border-brass-600/40 text-brass-300"
                      title={keyword.raw}
                    >
                      {keyword.zh}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 rounded border border-field-700/50 bg-field-900/40 p-3 sm:grid-cols-3">
              <Field label="卡包">{setZh(card.set)}</Field>
              <Field label="卡池">{poolZh(card.pool)}</Field>
              <Field label="卡牌 ID">
                <code className="font-mono text-[10px] text-field-300">{card.cardId}</code>
              </Field>
              <Field label="同名牌数量">{sameNameCount ?? '—'} 种</Field>
              <Field label="当前卡组">{deckCount > 0 ? `×${deckCount}` : '未编入'}</Field>
              <Field label="衍生">{card.isDerived ? '衍生卡' : '常规卡'}</Field>
            </div>

            {addDisabledReason && (
              <p className="font-body text-[11px] text-amber-400/90">⚠ {addDisabledReason}</p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

export const CardDetailDialog = memo(CardDetailDialogInner);
export default CardDetailDialog;
