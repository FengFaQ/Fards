/**
 * 构筑页的实时规则校验（表现层）。
 * 规则常量优先取数据层 DECK_RULES；数据层不可用时回退 KARDS 标准值（39 张 / 同名 4 / 精英 1）。
 * 最终合法性以数据层 validateDeck 为准，这里在 store 层做了合并。
 */
import {
  DECK_RULES_VIEW,
  validateDeckWithLayer,
  type DeckData,
  type DeckRuleSet,
  type UiCard,
} from './dataBridge';
import { factionMeta, factionZh, isFactionAllowed, rarityMeta } from './format';

export interface DeckEntryWithCard {
  card: UiCard;
  count: number;
}

export interface AddCheck {
  ok: boolean;
  reason?: string;
}

export const RULES: DeckRuleSet = DECK_RULES_VIEW;

export const deckTotal = (deck: DeckData | null | undefined): number =>
  deck ? deck.cards.reduce((sum, c) => sum + c.count, 0) : 0;

export function deckCountOf(deck: DeckData | null | undefined, cardId: string): number {
  return deck?.cards.find((c) => c.cardId === cardId)?.count ?? 0;
}

export function isElite(card: UiCard): boolean {
  return rarityMeta(card.rarity).key === 'Elite';
}

/** 加卡前的实时校验（同名上限 / 精英上限 / 阵营限制 / 张数上限 / 盟军上限） */
export function checkAddCard(
  card: UiCard,
  deck: DeckData | null | undefined,
  byId?: Map<string, UiCard>,
): AddCheck {
  if (!deck) return { ok: false, reason: '请先确定主阵营，再部署卡牌' };
  if (!isFactionAllowed(card, deck.faction, deck.allyFaction)) {
    return {
      ok: false,
      reason: `编制不符：${factionZh(card.faction)} 卡不能编入以${factionZh(deck.faction)}为主阵营的战斗群`,
    };
  }
  const total = deckTotal(deck);
  if (total >= RULES.deckSize) {
    return { ok: false, reason: `卡组已满 ${RULES.deckSize} 张，请先移除其他卡牌` };
  }
  const count = deckCountOf(deck, card.cardId);
  if (isElite(card)) {
    if (count >= RULES.maxElite) {
      return { ok: false, reason: `精英卡每组限 ${RULES.maxElite} 张` };
    }
  } else if (count >= RULES.maxCopies) {
    return { ok: false, reason: `同名卡上限 ${RULES.maxCopies} 张` };
  }
  if (RULES.maxAllyCards && deck.allyFaction && byId) {
    const ally = factionMeta(deck.allyFaction).key;
    const used = deck.cards.reduce((sum, entry) => {
      const c = byId.get(entry.cardId);
      return c && factionMeta(c.faction).key === ally ? sum + entry.count : sum;
    }, 0);
    const cardIsAlly = factionMeta(card.faction).key === ally;
    if (cardIsAlly && used >= RULES.maxAllyCards) {
      return { ok: false, reason: `盟军卡上限 ${RULES.maxAllyCards} 张` };
    }
  }
  return { ok: true };
}

export type IssueLevel = 'error' | 'warn' | 'info';

/** 编制状态一句话（页头徽章用） */
export function deckStatusLabel(validation: DraftValidation, total: number): string {
  if (validation.legal) return '编制合法';
  if (total < RULES.deckSize) return `还差 ${RULES.deckSize - total} 张`;
  if (total > RULES.deckSize) return `超出 ${total - RULES.deckSize} 张`;
  return '编制待修正';
}

export interface DraftIssue {
  level: IssueLevel;
  text: string;
}

export interface DraftValidation {
  legal: boolean;
  issues: DraftIssue[];
  total: number;
  /** 卡组里存在但当前数据集找不到的卡（通常是 importId 反查失败/数据缺卡） */
  missingCards: string[];
}

/** 完整卡组校验（本地规则 + 数据层 validateDeck 合并） */
export function validateDraft(
  deck: DeckData | null | undefined,
  byId: Map<string, UiCard>,
): DraftValidation {
  if (!deck) {
    return {
      legal: false,
      issues: [{ level: 'info', text: '尚未建立战斗群：先选择主阵营与盟军阵营' }],
      total: 0,
      missingCards: [],
    };
  }

  const issues: DraftIssue[] = [];
  const missingCards: string[] = [];
  const total = deckTotal(deck);

  if (total !== RULES.deckSize) {
    issues.push({
      level: 'error',
      text:
        total < RULES.deckSize
          ? `卡组仅 ${total}/${RULES.deckSize} 张，还需补足 ${RULES.deckSize - total} 张`
          : `卡组 ${total}/${RULES.deckSize} 张，需精简 ${total - RULES.deckSize} 张`,
    });
  }

  let eliteTotal = 0;
  for (const entry of deck.cards) {
    const card = byId.get(entry.cardId);
    if (!card) {
      missingCards.push(entry.cardId);
      continue;
    }
    if (!isFactionAllowed(card, deck.faction, deck.allyFaction)) {
      issues.push({
        level: 'error',
        text: `阵营越权：${card.nameZh}（${factionZh(card.faction)}）不在本战斗群编制内`,
      });
    }
    if (isElite(card)) {
      eliteTotal += entry.count;
      if (entry.count > RULES.maxElite) {
        issues.push({
          level: 'error',
          text: `精英超编：${card.nameZh} ×${entry.count}（上限 ${RULES.maxElite}）`,
        });
      }
    } else if (entry.count > RULES.maxCopies) {
      issues.push({
        level: 'error',
        text: `同名超编：${card.nameZh} ×${entry.count}（上限 ${RULES.maxCopies}）`,
      });
    }
  }

  if (missingCards.length) {
    issues.push({
      level: 'warn',
      text: `${missingCards.length} 张卡未在卡牌库中找到（可能是数据尚未就绪的衍生卡）`,
    });
  }

  if (RULES.maxAllyCards && deck.allyFaction) {
    const ally = factionMeta(deck.allyFaction).key;
    const used = deck.cards.reduce((sum, entry) => {
      const c = byId.get(entry.cardId);
      return c && factionMeta(c.faction).key === ally ? sum + entry.count : sum;
    }, 0);
    if (used > RULES.maxAllyCards) {
      issues.push({
        level: 'error',
        text: `盟军卡超编：${used}/${RULES.maxAllyCards} 张`,
      });
    }
  }

  if (eliteTotal > 0 && issues.length === 0) {
    issues.push({ level: 'info', text: `精英编制 ${eliteTotal} 张 · 已计入总张数` });
  }

  // 合并数据层权威校验结果（按类别去重，避免同一条超编问题被两处重复播报）
  const layer = validateDeckWithLayer(deck);
  let legal = !issues.some((i) => i.level === 'error');
  if (layer) {
    const categoryOf = (text: string): string | null => {
      if (text.includes('精英')) return 'elite';
      if (text.includes('同名')) return 'copies';
      if (text.includes('阵营')) return 'faction';
      if (text.includes('盟军')) return 'ally';
      if (text.includes('张')) return 'size';
      return null;
    };
    const localCategories = new Set(
      issues.filter((i) => i.level === 'error').map((i) => categoryOf(i.text)).filter(Boolean),
    );
    for (const err of layer.errors) {
      if (!err || issues.some((i) => i.text === err)) continue;
      const category = categoryOf(err);
      if (category && localCategories.has(category)) continue;
      issues.push({ level: 'error', text: err });
    }
    for (const warn of layer.warnings) {
      if (warn && !issues.some((i) => i.text === warn)) {
        issues.push({ level: 'warn', text: warn });
      }
    }
    legal = legal && layer.legal;
  }

  return { legal, issues, total, missingCards };
}

/** 卡组统计：曲线、类型分布、单位/指令比 */
export interface DeckStats {
  total: number;
  unique: number;
  units: number;
  orders: number;
  elite: number;
  allyCards: number;
  missing: number;
  /** 下标 = 费用（9 表示 9+） */
  byKredits: number[];
  byType: { key: string; zh: string; count: number }[];
}

const ORDER_TYPES = new Set(['order', 'countermeasure']);

export function computeDeckStats(
  deck: DeckData | null | undefined,
  byId: Map<string, UiCard>,
): DeckStats {
  const byKredits = new Array<number>(10).fill(0);
  const typeMap = new Map<string, number>();
  let total = 0;
  let units = 0;
  let orders = 0;
  let elite = 0;
  let allyCards = 0;
  let missing = 0;
  const ally = deck?.allyFaction ? factionMeta(deck.allyFaction).key : null;

  for (const entry of deck?.cards ?? []) {
    const card = byId.get(entry.cardId);
    total += entry.count;
    if (!card) {
      missing += entry.count;
      continue;
    }
    const bucket = Math.min(Math.max(0, card.kredits), 9);
    byKredits[bucket] += entry.count;
    typeMap.set(card.type, (typeMap.get(card.type) ?? 0) + entry.count);
    if (ORDER_TYPES.has(card.type)) orders += entry.count;
    else units += entry.count;
    if (isElite(card)) elite += entry.count;
    if (ally && factionMeta(card.faction).key === ally) allyCards += entry.count;
  }

  return {
    total,
    unique: deck?.cards.length ?? 0,
    units,
    orders,
    elite,
    allyCards,
    missing,
    byKredits,
    byType: [...typeMap.entries()].map(([key, count]) => ({ key, zh: '', count })),
  };
}

/** 卡组按费用分组（构筑面板展示） */
export function groupDeckByKredit(
  deck: DeckData | null | undefined,
  byId: Map<string, UiCard>,
): { kredit: number; entries: DeckEntryWithCard[] }[] {
  const groups = new Map<number, DeckEntryWithCard[]>();
  for (const entry of deck?.cards ?? []) {
    const card = byId.get(entry.cardId);
    if (!card) continue;
    const bucket = Math.min(Math.max(0, card.kredits), 9);
    const list = groups.get(bucket) ?? [];
    list.push({ card, count: entry.count });
    groups.set(bucket, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([kredit, entries]) => ({
      kredit,
      entries: entries.sort(
        (a, b) =>
          a.card.kredits - b.card.kredits ||
          b.count - a.count ||
          a.card.nameZh.localeCompare(b.card.nameZh, 'zh-Hans-CN'),
      ),
    }));
}
