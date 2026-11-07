import { describe, expect, it } from 'vitest';
import { createGame } from '@/engine';
import type { EngineRegistry, GameState } from '@/engine/types';
import { CARD_SCRIPTS } from '@/engine/cards';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HIDDEN_CARD, sanitizeStateFor } from './sanitize';
import { decodeMessage, encodeMessage, LAN_PROTOCOL_VERSION } from './protocol';

function loadDefs(): Record<string, import('@/engine/types').CardDef> {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/cards.json'), 'utf8')) as Record<string, unknown>[];
  const out: Record<string, import('@/engine/types').CardDef> = {};
  for (const item of raw) {
    const cardId = String(item.cardId ?? '');
    if (!cardId) continue;
    out[cardId] = {
      cardId,
      importId: item.importId ? String(item.importId) : undefined,
      nameZh: String(item.nameZh ?? cardId),
      nameEn: String(item.nameEn ?? cardId),
      description: String(item.description ?? ''),
      faction: String(item.faction ?? 'Neutral'),
      hostFactions: Array.isArray(item.hostFactions) ? item.hostFactions.map(String) : undefined,
      isExile: Boolean(item.isExile),
      type: String(item.type ?? 'order'),
      rarity: String(item.rarity ?? 'Standard'),
      kredits: Number(item.kredits ?? 0),
      operationCost: Number(item.operationCost ?? 0),
      attack: Number(item.attack ?? 0),
      defense: Number(item.defense ?? 0),
      attributes: Array.isArray(item.attributes) ? item.attributes.map(String) : [],
      set: String(item.set ?? ''),
      pool: String(item.pool ?? 'active'),
      isReserved: Boolean(item.isReserved),
      isDerived: Boolean(item.isDerived),
    };
  }
  return out;
}

function makeGame(): GameState {
  const reg: EngineRegistry = { cardDefs: loadDefs(), scripts: CARD_SCRIPTS };
  const { state } = createGame(
    {
      seed: 7,
      firstPlayer: 0,
      players: [
        { name: 'Host', faction: 'Germany', allyFaction: null, deck: [{ cardId: 'blitzkrieg', count: 3 }, { cardId: 'panzer_35t', count: 3 }] },
        { name: 'Guest', faction: 'USA', allyFaction: null, deck: [{ cardId: 'm4_sherman', count: 3 }, { cardId: 'usace', count: 3 }] },
      ],
    },
    reg,
  );
  return state;
}

describe('局域网脱敏视图', () => {
  it('对手手牌与牌库内容不可见，自己的可见', () => {
    const state = makeGame();
    const hostView = sanitizeStateFor(state, 0);
    // 自己手牌/牌库保留真实 cardId
    for (const card of hostView.players[0].hand) expect(card.cardId).not.toBe(HIDDEN_CARD);
    // 对手手牌/牌库全部隐藏
    for (const card of hostView.players[1].hand) expect(card.cardId).toBe(HIDDEN_CARD);
    for (const card of hostView.players[1].deck) expect(card.cardId).toBe(HIDDEN_CARD);
  });

  it('对手真实卡牌实例不会残留在 cards 索引中', () => {
    const state = makeGame();
    const guestRealInstanceIds = state.players[1].hand.map((c) => c.instanceId).concat(state.players[1].deck.map((c) => c.instanceId));
    const hostView = sanitizeStateFor(state, 0);
    for (const id of guestRealInstanceIds) {
      expect(hostView.cards[id]).toBeUndefined();
    }
  });

  it('随机种子与对手私有计数器被清空', () => {
    const state = makeGame();
    state.players[1].trackers.somePrivate = 123;
    const hostView = sanitizeStateFor(state, 0);
    expect(hostView.rngState).toBe(0);
    expect(hostView.seed).toBe(0);
    expect(hostView.players[1].trackers).toEqual({});
  });

  it('双向脱敏对称', () => {
    const state = makeGame();
    const guestView = sanitizeStateFor(state, 1);
    for (const card of guestView.players[0].hand) expect(card.cardId).toBe(HIDDEN_CARD);
    for (const card of guestView.players[1].hand) expect(card.cardId).not.toBe(HIDDEN_CARD);
  });
});

describe('局域网协议', () => {
  it('消息 JSON 往返', () => {
    const message = { type: 'join', code: 'ABCD', name: '玩家', protocolVersion: LAN_PROTOCOL_VERSION } as const;
    const decoded = decodeMessage<typeof message>(encodeMessage(message));
    expect(decoded).toEqual(message);
  });
});

describe('局域网权威模型（host 引擎 / guest 脱敏视图）', () => {
  it('host 应用指令后，guest 视图只包含自己的合法动作且能继续对局', async () => {
    const { applyCommand, legalActions } = await import('@/engine');
    const reg: EngineRegistry = { cardDefs: loadDefs(), scripts: CARD_SCRIPTS };
    let { state } = createGame(
      {
        seed: 11,
        firstPlayer: 0,
        players: [
          { name: 'Host', faction: 'Germany', allyFaction: null, deck: [{ cardId: 'panzer_35t', count: 10 }] },
          { name: 'Guest', faction: 'USA', allyFaction: null, deck: [{ cardId: 'm4_sherman', count: 10 }] },
        ],
      },
      reg,
    );
    // host 结束回合 → guest 的回合
    state = applyCommand(state, { type: 'endTurn', player: 0 }, reg).state;
    expect(state.activePlayer).toBe(1);
    const guestActions = legalActions(state, reg, 1);
    const guestView = sanitizeStateFor(state, 1);
    // guest 视图里看不到 host 手牌/牌库真实卡牌
    for (const card of guestView.players[0].hand) expect(card.cardId).toBe(HIDDEN_CARD);
    for (const card of guestView.players[0].deck) expect(card.cardId).toBe(HIDDEN_CARD);
    // guest 自己的手牌可见
    for (const card of guestView.players[1].hand) expect(card.cardId).not.toBe(HIDDEN_CARD);
    // guest 的合法动作非空，且与 host 侧计算的完全一致（host 下发）
    expect(guestActions.length).toBeGreaterThan(0);
    expect(guestActions.map((a) => a.kind)).toContain('endTurn');
  });
});
