import { useState } from 'react';
import { cardImageSources, type UiCard } from '../lib/dataBridge';
import { factionMeta, rarityMeta } from '../lib/format';
import { posterLayout, POSTER_DISCLAIMER, POSTER_FOOTER_LEFT, POSTER_FOOTER_RIGHT, type PosterModel } from './posterModel';
import './overview.css';

function PosterCardImage({ card, count, width }: { card: UiCard; count: number; width: number }) {
  const sources = cardImageSources(card);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const faction = factionMeta(card.faction);
  const rarity = rarityMeta(card.rarity);
  const src = sources[index];

  return (
    <div
      className="relative overflow-hidden rounded-[3px] border border-brass-600/30 bg-field-950"
      style={{ width, aspectRatio: '500 / 702' }}
    >
      {!failed && src ? (
        <img
          src={src}
          alt={card.nameZh}
          loading="eager"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setIndex((value) => {
              const next = value + 1;
              if (next >= sources.length) setFailed(true);
              return next;
            });
          }}
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
      {(!loaded || failed) && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1.5 text-center"
          style={{
            background: `linear-gradient(150deg, ${faction.shade} 0%, #12140d 65%, ${faction.color}33 100%)`,
          }}
        >
          <span className="font-display text-[8px] tracking-[0.16em]" style={{ color: faction.color }}>
            {faction.zh}
          </span>
          <span className="line-clamp-3 font-body text-[9px] leading-tight text-field-100">
            {card.nameZh}
          </span>
          <span className="font-body text-[8px] text-field-400">
            {card.kredits} 费 · {card.attack}/{card.defense}
          </span>
        </div>
      )}
      <span
        className="absolute inset-y-0 left-0 z-[2] w-[2px]"
        style={{ backgroundColor: rarity.color }}
      />
      <span className="absolute right-0 bottom-0 left-0 z-[1] h-[16%] bg-gradient-to-t from-field-950/85 to-transparent" />
      {count > 1 && (
        <span className="absolute top-1 right-1 z-[3] rounded-sm border border-brass-500/60 bg-field-950/90 px-1 font-display text-[9px] leading-[14px] text-brass-300">
          ×{count}
        </span>
      )}
    </div>
  );
}

function MiniCurve({ values }: { values: number[] }) {
  const series = [...values];
  while (series.length < 10) series.push(0);
  const max = Math.max(1, ...series);
  return (
    <div>
      <div className="flex h-[62px] items-end gap-[3px] border-b border-brass-700/30 pb-[2px]">
        {series.slice(0, 10).map((value, index) => (
          <div key={index} className="flex flex-1 flex-col items-center justify-end gap-[2px]">
            {value > 0 && (
              <span className="font-body text-[8px] leading-none text-brass-300/90">{value}</span>
            )}
            <span
              className="w-full rounded-t-[1px] bg-gradient-to-t from-brass-700/80 to-brass-300/90"
              style={{ height: value === 0 ? 2 : Math.max(3, (value / max) * 52) }}
            />
          </div>
        ))}
      </div>
      <div className="mt-[2px] flex gap-[3px]">
        {series.slice(0, 10).map((_, index) => (
          <span key={index} className="flex-1 text-center font-mono text-[7px] text-field-600">
            {index === 9 ? '9+' : index}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniTypes({ model }: { model: PosterModel }) {
  const items = model.stats.byType.filter((item) => item.count > 0);
  const total = Math.max(1, model.stats.units + model.stats.orders);
  return (
    <div>
      <div className="flex h-[9px] w-full overflow-hidden rounded-sm border border-brass-700/30">
        {items.map((item) => (
          <span
            key={item.key}
            style={{ width: `${(item.count / total) * 100}%`, backgroundColor: item.color }}
          />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-[3px]">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between font-body text-[8px] text-field-300">
            <span className="flex min-w-0 items-center gap-1">
              <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="font-display text-[8px] text-field-100">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-[4px] border border-brass-600/20 bg-field-900/90 p-3">
      <div className="absolute top-2 left-3 h-[2px] w-[22px] bg-brass-700/80" />
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-display text-[10px] tracking-[0.2em] text-brass-300/90">{title}</span>
        {subtitle && <span className="font-body text-[8px] tracking-wider text-field-600">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

export interface DeckPosterProps {
  model: PosterModel;
  /** 屏幕上按比例缩放（导出画布不缩放） */
  scale?: number;
}

/** DOM 预览版海报（与 Canvas 导出共用布局参数） */
export function DeckPoster({ model, scale = 1 }: DeckPosterProps) {
  const layout = posterLayout(model.kind, model.cards.length);
  const { cols, cardW } = layout.gridFit;
  const horizontal = model.kind === 'horizontal';

  return (
    <div
      className="overview-poster relative shrink-0 overflow-hidden"
      style={{ width: layout.width * scale, height: layout.height * scale }}
    >
      <div
        style={{
          width: layout.width,
          height: layout.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
        className="relative bg-field-950"
      >
        {/* 背景层 */}
        <div className="pointer-events-none absolute inset-0 fards-grid-bg opacity-50" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% -12%, rgba(216,180,95,0.18), transparent 55%), radial-gradient(ellipse at 50% 115%, rgba(93,122,63,0.12), transparent 60%)',
          }}
        />
        <div className="pointer-events-none absolute inset-[14px] border-2 border-brass-600/35" />
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
          <span
            key={corner}
            className={`pointer-events-none absolute h-[30px] w-[30px] border-brass-500/70 ${
              corner.includes('top') ? 'top-[14px] border-t-[3px]' : 'bottom-[14px] border-b-[3px]'
            } ${corner.includes('left') ? 'left-[14px] border-l-[3px]' : 'right-[14px] border-r-[3px]'}`}
          />
        ))}

        {/* 头部 */}
        <header
          className="absolute right-0 left-0 flex items-start justify-between"
          style={{ top: layout.padding + 18, paddingLeft: layout.padding, paddingRight: layout.padding }}
        >
          <div>
            <p className="font-display text-[44px] leading-none tracking-[0.16em] text-brass-200">
              FARDS
            </p>
            <p className="mt-1 font-body text-[11px] tracking-[0.28em] text-field-500">
              KARDS 卡组对战测试场
            </p>
            <p className="mt-0.5 font-body text-[9px] tracking-[0.3em] text-brass-500">
              DECK OVERVIEW · 卡组概览
            </p>
          </div>

          <div className={horizontal ? 'min-w-0 flex-1 pl-12' : 'min-w-0 flex-1 pl-4'}>
            <h1 className="truncate font-body text-[26px] leading-tight font-semibold tracking-wide text-field-100">
              {model.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-3.5 w-[3px] rounded-[1px]"
                  style={{ backgroundColor: model.faction.color }}
                />
                <span className="font-body text-[12px] tracking-[0.14em]" style={{ color: model.faction.color }}>
                  {model.faction.zh}
                </span>
              </span>
              {model.ally && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-3.5 w-[3px] rounded-[1px]"
                    style={{ backgroundColor: model.ally.color }}
                  />
                  <span className="font-body text-[12px] tracking-[0.14em]" style={{ color: model.ally.color }}>
                    盟军 {model.ally.zh}
                  </span>
                </span>
              )}
              <span className="font-body text-[10px] tracking-wider text-field-400">
                {model.stats.total} 张编制 · {model.stats.unique} 种卡牌
              </span>
            </div>
            {model.subtitle && (
              <p className="mt-1 font-body text-[10px] text-field-500">{model.subtitle}</p>
            )}
          </div>

          {horizontal && (
            <div className="shrink-0 pl-6 text-right">
              <p className="font-display text-[54px] leading-none text-brass-200">
                {model.stats.total}
              </p>
              <p className="font-body text-[9px] tracking-[0.28em] text-field-500">总张数 / CARDS</p>
              <p className="mt-1 font-body text-[10px] text-field-400">
                单位 {model.stats.units} · 指令 {model.stats.orders}
              </p>
            </div>
          )}
        </header>

        <div
          className="absolute right-0 left-0 h-px"
          style={{
            top: layout.padding + layout.headerH - 12,
            marginLeft: layout.padding,
            marginRight: layout.padding,
            background:
              'linear-gradient(to right, rgba(195,155,58,0.05), rgba(195,155,58,0.55), rgba(195,155,58,0.05))',
          }}
        />

        {/* 卡牌网格 */}
        <div
          className="absolute flex content-start justify-center"
          style={{
            top: layout.grid.y,
            left: layout.grid.x,
            width: layout.grid.width,
            height: layout.grid.height,
            flexWrap: 'wrap',
            gap: 10,
            columnGap: 10,
            rowGap: 10,
          }}
        >
          {model.cards.map((item) => (
            <PosterCardImage
              key={item.card.cardId}
              card={item.card}
              count={item.count}
              width={cardW}
            />
          ))}
          {model.cards.length === 0 && (
            <p className="font-body text-sm text-field-500">卡组为空</p>
          )}
        </div>

        {/* 横版统计栏 */}
        {layout.sidebar && (
          <aside
            className="absolute flex flex-col gap-2.5"
            style={{
              top: layout.sidebar.y,
              left: layout.sidebar.x,
              width: layout.sidebar.width,
              height: layout.sidebar.height,
            }}
          >
            <Panel title="费用曲线 / CURVE" subtitle={`${model.stats.total} 张`}>
              <MiniCurve values={model.stats.byKredits} />
            </Panel>
            <Panel title="类型分布 / TYPES">
              <MiniTypes model={model} />
            </Panel>
            <Panel title="编制统计 / MANIFEST">
              <div className="space-y-1">
                {[
                  ['单位', model.stats.units],
                  ['指令 / 反制', model.stats.orders],
                  ['精英卡', model.stats.elite],
                  ['盟军卡', model.stats.allyCards],
                  ['卡牌种类', model.stats.unique],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between border-b border-brass-700/15 pb-1 font-body text-[10px]"
                  >
                    <span className="text-field-500">{label}</span>
                    <span className="text-field-100">{value}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        )}

        {/* 竖版统计带 */}
        {layout.statsBand && (
          <div
            className="absolute grid grid-cols-3 gap-3"
            style={{
              top: layout.statsBand.y,
              left: layout.statsBand.x,
              width: layout.statsBand.width,
              height: layout.statsBand.height,
            }}
          >
            <Panel title="费用曲线 / CURVE">
              <MiniCurve values={model.stats.byKredits} />
            </Panel>
            <Panel title="类型分布 / TYPES">
              <MiniTypes model={model} />
            </Panel>
            <Panel title="编制统计 / MANIFEST">
              <div className="space-y-1">
                {[
                  ['张数', model.stats.total],
                  ['种类', model.stats.unique],
                  ['单位', model.stats.units],
                  ['指令', model.stats.orders],
                  ['精英', model.stats.elite],
                  ['盟军', model.stats.allyCards],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between border-b border-brass-700/15 pb-1 font-body text-[10px]"
                  >
                    <span className="text-field-500">{label}</span>
                    <span className="text-field-100">{value}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {/* 页脚 */}
        <footer
          className="absolute right-0 left-0 flex items-end justify-between"
          style={{ bottom: layout.padding - 6, paddingLeft: layout.padding, paddingRight: layout.padding }}
        >
          <span className="font-body text-[10px] tracking-[0.16em] text-brass-500">
            {POSTER_FOOTER_LEFT}
          </span>
          <span className="max-w-[52%] text-center font-body text-[9px] leading-snug text-field-600">
            {POSTER_DISCLAIMER}
          </span>
          <span className="text-right font-body text-[9px] text-field-600">{POSTER_FOOTER_RIGHT}</span>
        </footer>

        <span className="pointer-events-none absolute right-6 bottom-16 font-display text-[90px] leading-none text-brass-500/[0.04] select-none">
          {cols}×{Math.ceil(model.cards.length / Math.max(1, cols))}
        </span>
      </div>
    </div>
  );
}

export default DeckPoster;
