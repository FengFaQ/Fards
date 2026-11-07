/**
 * 战场注册表：把数据层的 UiCard 映射成引擎契约的 CardDef，并挂上卡牌脚本。
 * 引擎只接受 { cardDefs, scripts } 形式的只读注册表。
 */
import { CARD_SCRIPTS } from '@/engine/cards';
import type { CardDef, EngineRegistry } from '@/engine/types';
import type { UiCard } from '../lib/dataBridge';

/** 构建引擎注册表（cards 来自 dataBridge.loadAllCards / useCards） */
export function buildRegistry(cards: UiCard[]): EngineRegistry {
  const cardDefs: Record<string, CardDef> = {};
  for (const card of cards) {
    if (!card?.cardId) continue;
    // UiCard 是 CardDef 的超集，引擎只读自己认识的字段，直接引用即可（引擎不会写它）
    cardDefs[card.cardId] = card;
  }
  return { cardDefs, scripts: CARD_SCRIPTS };
}

/** 卡牌快速索引（用于取卡图 / 名称 / 类型） */
export function buildCardIndex(cards: UiCard[]): Map<string, UiCard> {
  return new Map(cards.map((card) => [card.cardId, card]));
}

/** 卡牌脚本数量（用于战场顶部显示“已实现效果”口径，调试用） */
export function scriptCoverage(): number {
  return Object.keys(CARD_SCRIPTS).length;
}
