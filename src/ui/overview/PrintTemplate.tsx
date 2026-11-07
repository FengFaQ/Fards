import { useState } from 'react';
import { cardImageSources, type UiCard } from '../lib/dataBridge';
import { factionMeta } from '../lib/format';
import { POSTER_DISCLAIMER, POSTER_FOOTER_RIGHT, type PosterModel } from './posterModel';
import './overview.css';

const CARDS_PER_PAGE = 9;

function PrintCard({ card, count }: { card: UiCard; count: number }) {
  const sources = cardImageSources(card);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const faction = factionMeta(card.faction);
  const src = sources[index];

  return (
    <div className="print-card">
      {!failed && src ? (
        <img
          src={src}
          alt={card.nameZh}
          loading="eager"
          decoding="async"
          onError={() => {
            setIndex((value) => {
              const next = value + 1;
              if (next >= sources.length) setFailed(true);
              return next;
            });
          }}
        />
      ) : null}
      {failed || !src ? (
        <div
          className="print-card-fallback"
          style={{ background: `linear-gradient(150deg, ${faction.shade}, #12140d)` }}
        >
          <span style={{ color: faction.color, fontSize: '8pt', letterSpacing: '0.18em' }}>
            {faction.zh}
          </span>
          <span style={{ fontSize: '9pt', lineHeight: 1.25 }}>{card.nameZh}</span>
          <span style={{ color: '#a8a08a', fontSize: '8pt' }}>
            {card.kredits} 费 · {card.attack}/{card.defense}
          </span>
        </div>
      ) : null}
      {count > 1 && <span className="print-card-count">×{count}</span>}
      {/* 裁切角标 */}
      <span className="print-crop top-0 left-0 border-t-2 border-l-2" />
      <span className="print-crop top-0 right-0 border-t-2 border-r-2" />
      <span className="print-crop right-0 bottom-0 border-r-2 border-b-2" />
      <span className="print-crop bottom-0 left-0 border-b-2 border-l-2" />
    </div>
  );
}

export interface PrintTemplateProps {
  model: PosterModel;
  /** 每页卡牌数（默认 9 = 3×3） */
  perPage?: number;
}

/**
 * A4 打印模板：3 列 × 63×88mm 卡牌，带裁切线
 * - 每页页眉：FARDS 水印 + 卡组名 + 阵营 + 页码
 * - 页脚：免责声明 + 协议
 */
export function PrintTemplate({ model, perPage = CARDS_PER_PAGE }: PrintTemplateProps) {
  const pages: { card: UiCard; count: number }[][] = [];
  for (let i = 0; i < model.cards.length; i += perPage) {
    pages.push(model.cards.slice(i, i + perPage));
  }
  if (pages.length === 0) pages.push([]);
  const totalPages = pages.length;

  return (
    <div className="space-y-0">
      {pages.map((cards, pageIndex) => (
        <section key={pageIndex} className="print-sheet">
          <header
            className="mb-2 flex items-end justify-between border-b pb-1.5"
            style={{ borderColor: 'rgba(26,25,15,0.35)' }}
          >
            <div className="flex items-baseline gap-3">
              <span
                className="font-display text-[18px] leading-none tracking-[0.18em]"
                style={{ color: '#1a190f' }}
              >
                FARDS
              </span>
              <span
                className="font-body text-[8px] tracking-[0.28em] uppercase"
                style={{ color: 'rgba(26,25,15,0.55)' }}
              >
                Deck Print Template
              </span>
            </div>
            <div className="text-right">
              <p className="font-body text-[12px] font-semibold leading-tight">{model.title}</p>
              <p className="font-body text-[8px] tracking-[0.16em]" style={{ color: 'rgba(26,25,15,0.6)' }}>
                {model.faction.zh}
                {model.ally ? ` + ${model.ally.zh}` : ''} · {model.stats.total} 张 · 第 {pageIndex + 1}/
                {totalPages} 页
              </p>
            </div>
          </header>

          <div className="print-grid">
            {cards.map((item) => (
              <PrintCard key={item.card.cardId} card={item.card} count={item.count} />
            ))}
          </div>

          <footer
            className="mt-2 flex items-end justify-between border-t pt-1.5"
            style={{ borderColor: 'rgba(26,25,15,0.3)' }}
          >
            <span className="font-body text-[7px] leading-tight" style={{ color: 'rgba(26,25,15,0.55)' }}>
              {POSTER_DISCLAIMER}
            </span>
            <span className="font-body text-[7px]" style={{ color: 'rgba(26,25,15,0.45)' }}>
              {POSTER_FOOTER_RIGHT}
            </span>
          </footer>
        </section>
      ))}
    </div>
  );
}

export default PrintTemplate;
