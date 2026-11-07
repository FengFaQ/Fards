import { describe, expect, it } from 'vitest';
import type { CardDef, CardScript, EngineRegistry, GameSetup } from './types';
import { createGame, applyCommand, legalActions, getDef } from './index';

function makeRegistry(): EngineRegistry {
  const def = (cardId: string, partial: Partial<CardDef> & Pick<CardDef, 'type'>): CardDef => {
    const base: CardDef = {
      cardId,
      importId: 'zz',
      nameZh: cardId,
      nameEn: cardId,
      description: '',
      faction: 'Germany',
      hostFactions: ['Germany'],
      isExile: false,
      rarity: 'Standard',
      kredits: 1,
      operationCost: 1,
      attack: 1,
      defense: 1,
      attributes: [],
      set: 'Base',
      pool: 'active',
      type: 'infantry',
    };
    return { ...base, ...partial, cardId };
  };
  const cardDefs: Record<string, CardDef> = {
    inf: def('inf', { type: 'infantry', kredits: 2, attack: 2, defense: 2, operationCost: 1 }),
    blitz_tank: def('blitz_tank', { type: 'tank', kredits: 2, attack: 2, defense: 2, operationCost: 1, attributes: ['blitz'] }),
    order_dmg: def('order_dmg', { type: 'order', kredits: 1, attack: 0, defense: 0, operationCost: 0 }),
    guard_inf: def('guard_inf', { type: 'infantry', kredits: 1, attack: 1, defense: 4, operationCost: 1, attributes: ['guard'] }),
  };
  const scripts: Record<string, CardScript> = {
    order_dmg: {
      cardId: 'order_dmg',
      targetSpec: { kind: 'query', side: 'enemy', line: 'any', limit: 1 },
      abilities: [
        {
          trigger: 'order',
          effects: [{ op: 'damage', target: { kind: 'chosen' }, amount: 2 }],
        },
      ],
    },
  };
  return { cardDefs, scripts };
}

function setup(): GameSetup {
  return {
    seed: 42,
    firstPlayer: 0,
    players: [
      { name: 'P1', faction: 'Germany', allyFaction: null, deck: [{ cardId: 'inf', count: 20 }] },
      { name: 'P2', faction: 'Germany', allyFaction: null, deck: [{ cardId: 'inf', count: 20 }] },
    ],
    config: { startingHandSize: 3 },
  };
}

describe('引擎基础流程', () => {
  const reg = makeRegistry();

  it('开局：手牌/克雷迪特/先手', () => {
    const { state } = createGame(setup(), reg);
    expect(state.status).toBe('playing');
    expect(state.activePlayer).toBe(0);
    expect(state.players[0].hand).toHaveLength(3);
    expect(state.players[0].kredits).toBe(1);
    expect(state.players[0].maxKredits).toBe(1);
    // 先手首回合跳过摸牌
    expect(state.players[0].deck).toHaveLength(17);
    expect(state.players[1].hand).toHaveLength(3);
    expect(state.players[1].deck).toHaveLength(17);
  });

  it('费用不足不能出牌', () => {
    const { state } = createGame(setup(), reg);
    const card = state.players[0].hand.find((c) => c.cardId === 'inf')!;
    const result = applyCommand(state, { type: 'playCard', player: 0, instanceId: card.instanceId, line: 'support' }, reg);
    expect(result.state.players[0].hand).toHaveLength(3);
    expect(Object.keys(result.state.units)).toHaveLength(0);
  });

  it('结束回合→资源增长→部署与攻击', () => {
    let { state } = createGame(setup(), reg);
    let r = applyCommand(state, { type: 'endTurn', player: 0 }, reg);
    state = r.state;
    expect(state.activePlayer).toBe(1);
    expect(state.players[1].kredits).toBe(1);
    expect(state.players[1].hand).toHaveLength(4);
    r = applyCommand(state, { type: 'endTurn', player: 1 }, reg);
    state = r.state;
    expect(state.activePlayer).toBe(0);
    expect(state.players[0].kredits).toBe(2);
    expect(state.players[0].maxKredits).toBe(2);

    // 部署 2 费步兵到前线（空前线可抢占；只有前线单位能攻击敌方总部）
    const card = state.players[0].hand.find((c) => c.cardId === 'inf')!;
    r = applyCommand(state, { type: 'playCard', player: 0, instanceId: card.instanceId, line: 'frontline' }, reg);
    state = r.state;
    expect(Object.values(state.units)).toHaveLength(1);
    expect(state.frontlineController).toBe(0);
    expect(state.players[0].kredits).toBe(0);

    // 没克雷迪特，无法攻击（行动花费=1）
    expect(legalActions(state, reg, 0).filter((a) => a.kind === 'attack')).toHaveLength(0);

    // 过一回合再攻击
    r = applyCommand(state, { type: 'endTurn', player: 0 }, reg);
    state = r.state;
    r = applyCommand(state, { type: 'endTurn', player: 1 }, reg);
    state = r.state;
    expect(state.players[0].kredits).toBe(3);
    const attacker = Object.values(state.units)[0];
    r = applyCommand(state, { type: 'attack', player: 0, attackerId: attacker.unitId, target: { kind: 'hq', player: 1 } }, reg);
    state = r.state;
    expect(state.players[1].hq.hp).toBe(18);
    expect(state.players[0].kredits).toBe(2);
  });

  it('指令结算伤害与目标合法性', () => {
    let { state } = createGame(setup(), reg);
    state.players[0].kredits = 5;
    let r = applyCommand(state, { type: 'endTurn', player: 0 }, reg);
    state = r.state;
    const p2card = state.players[1].hand[0];
    state.players[1].kredits = 5;
    r = applyCommand(state, { type: 'playCard', player: 1, instanceId: p2card.instanceId, line: 'support' }, reg);
    state = r.state;
    const enemyUnit = Object.values(state.units)[0];
    r = applyCommand(state, { type: 'endTurn', player: 1 }, reg);
    state = r.state;
    state.players[0].kredits = 5;
    const orderInstance = { instanceId: 'c_order_test', cardId: 'order_dmg', owner: 0 as const, source: 'created' as const };
    state.cards[orderInstance.instanceId] = orderInstance;
    state.players[0].hand.push(orderInstance);
    r = applyCommand(
      state,
      {
        type: 'playCard',
        player: 0,
        instanceId: orderInstance.instanceId,
        targets: [{ kind: 'unit', unitId: enemyUnit.unitId }],
      },
      reg,
    );
    state = r.state;
    // 2 点伤害直接击杀 2/2 单位 → 单位离场
    expect(state.units[enemyUnit.unitId]).toBeUndefined();
    expect(state.players[0].discard.some((c) => c.instanceId === orderInstance.instanceId)).toBe(true);
  });

  it('guard 会限制攻击目标', () => {
    const reg2 = makeRegistry();
    let { state } = createGame(setup(), reg2);
    let r = applyCommand(state, { type: 'endTurn', player: 0 }, reg2);
    state = r.state;
    r = applyCommand(state, { type: 'endTurn', player: 1 }, reg2);
    state = r.state;
    // 玩家0 部署 2/2 步兵到前线
    const inf = state.players[0].hand.find((c) => c.cardId === 'inf')!;
    r = applyCommand(state, { type: 'playCard', player: 0, instanceId: inf.instanceId, line: 'frontline' }, reg2);
    state = r.state;
    expect(getDef(reg2, state.units[Object.keys(state.units)[0]].cardId)).toBeTruthy();
    expect(state.frontlineController).toBe(0);
  });
});
