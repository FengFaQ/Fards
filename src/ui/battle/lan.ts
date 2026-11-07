/**
 * 局域网对战的界面侧适配层。
 * ------------------------------------------------------------------
 * 职责：
 * 1) DeckData ↔ LanDeckPayload 互转；
 * 2) host 侧构造脱敏视图（sanitize + 观察者合法动作）；
 * 3) 大厅/调试参数里的卡组解析（阵营名 / 已保存卡组 id）。
 * 不持有状态（状态在 battleStore + lanSession 单例）。
 */
import type { EngineRegistry, GameEvent, GameState, LegalAction } from '@/engine/types';
import type { LanDeckPayload, LanGameView } from '@/net/protocol';
import { sanitizeStateFor } from '@/net/sanitize';
import { readLanHandoff } from '@/ui/lan/lanBridge';
import type { DeckData, UiCard } from '../lib/dataBridge';
import { buildQuickDeck } from './decks';
import { visibleLegalActions } from './legal';

export const GUEST_INDEX = 1 as const;
export const HOST_INDEX = 0 as const;

/** DeckData → 网络卡组载荷 */
export function toDeckPayload(deck: DeckData, name: string): LanDeckPayload {
  return {
    name,
    mainFaction: deck.faction,
    allyFaction: deck.allyFaction ?? null,
    cards: deck.cards.map((entry) => ({ cardId: entry.cardId, count: entry.count })),
  };
}

/** 网络卡组载荷 → DeckData */
export function fromDeckPayload(payload: LanDeckPayload): DeckData {
  return {
    faction: payload.mainFaction,
    allyFaction: payload.allyFaction ?? null,
    cards: (payload.cards ?? []).map((entry) => ({ cardId: entry.cardId, count: entry.count })),
  };
}

/**
 * host 构造给 guest 的视图：
 * - state 脱敏（对手手牌/牌库/反制、随机种子）
 * - legalActions 用观察者视角计算并过滤反制限制（guest 不本地算）
 * - pendingChoice 只在需要 guest 决策时下发
 */
export function buildGuestView(state: GameState, registry: EngineRegistry, seq: number): LanGameView {
  const sanitized = sanitizeStateFor(state, GUEST_INDEX);
  const legalActions: LegalAction[] = visibleLegalActions(state, registry, GUEST_INDEX);
  return {
    perspective: GUEST_INDEX,
    state: sanitized,
    legalActions,
    pendingChoice: state.pendingChoice && state.pendingChoice.player === GUEST_INDEX ? state.pendingChoice : null,
    seq,
  };
}

/** 网络对局里的事件（用于 guest 侧动画），保持与本地一致的类型 */
export type LanViewEvents = GameEvent[];

/** 按阵营快速编组一套 39 张卡组（局域网调试/大厅默认卡组用） */
export function lanDeckForFaction(
  factionInput: string,
  cards: UiCard[],
  seed = 1,
): { deck: DeckData; name: string; faction: string } {
  const faction = resolveFactionKey(factionInput) ?? 'Germany';
  return {
    deck: buildQuickDeck(faction, cards, seed),
    name: `${faction} 快速战斗群`,
    faction,
  };
}

/* ---------------- 大厅交接数据（ui-forge 提供的 lanBridge） ---------------- */

/** 直接复用大厅的交接结构，避免两处类型漂移 */
export type { LanHandoff } from '@/ui/lan/lanBridge';

/**
 * 读取大厅缓存的对端卡组（`src/ui/lan/lanBridge.ts#readLanHandoff`）。
 * host 用它拿 guest 卡组开局；大厅未写入时返回 null（走 onHello / 等待分支）。
 */
export function readLanHandoffSafe(): import('@/ui/lan/lanBridge').LanHandoff | null {
  try {
    return readLanHandoff() ?? null;
  } catch (error) {
    console.warn('[battle] 读取大厅交接数据失败', error);
    return null;
  }
}

/** 把任意写法（Germany / germany / 德国 / USSR）解析成阵营 key；失败返回 null */export function resolveFactionKey(value: string): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const table: Record<string, string> = {
    germany: 'Germany',
    usa: 'USA',
    'united states': 'USA',
    america: 'USA',
    britain: 'Britain',
    uk: 'Britain',
    japan: 'Japan',
    soviet: 'Soviet',
    ussr: 'Soviet',
    france: 'France',
    italy: 'Italy',
    finland: 'Finland',
    poland: 'Poland',
    anzac: 'Anzac',
    neutral: 'Neutral',
  };
  if (table[lower]) return table[lower];
  const zh: Record<string, string> = {
    德国: 'Germany',
    美国: 'USA',
    英国: 'Britain',
    日本: 'Japan',
    苏联: 'Soviet',
    法国: 'France',
    意大利: 'Italy',
    芬兰: 'Finland',
    波兰: 'Poland',
    澳新: 'Anzac',
    中立: 'Neutral',
  };
  return zh[text] ?? null;
}
