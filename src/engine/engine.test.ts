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
    guard_inf: def('guard_inf', { type: 'infantry', kredits: 1, attack: 1, defense: 4, operationCost: 1, attributes: ['guard'] }),
    artillery: def('artillery', { type: 'artillery', kredits: 1, attack: 1, defense: 2, operationCost: 1 }),
    order_dmg: def('order_dmg', { type: 'order', kredits: 1, attack: 0, defense: 0, operationCost: 0 }),
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
    // 测试用紧凑开局：先手 3 张、后手不额外、首回合跳过摸牌
    config: { startingHandSize: 3, secondPlayerExtraCards: 0, firstTurnSkipsDraw: true },
  };
}

describe('引擎基础流程', () => {
  const reg = makeRegistry();

  it('开局：手牌 / 克雷迪特 / 先手', () => {
    const { state } = createGame(setup(), reg);
    expect(state.status).toBe('playing');
    expect(state.activePlayer).toBe(0);
    expect(state.players[0].hand).toHaveLength(3);
    expect(state.players[0].kredits).toBe(1);
    expect(state.players[0].maxKredits).toBe(1);
    expect(state.players[0].deck).toHaveLength(17);
    expect(state.players[1].hand).toHaveLength(3);
    expect(state.players[1].deck).toHaveLength(17);
    expect(state.frontlineController).toBeNull();
  });

  it('费用不足不能出牌', () => {
    const { state } = createGame(setup(), reg);
    const card = state.players[0].hand.find((c) => c.cardId === 'inf')!;
    const result = applyCommand(state, { type: 'playCard', player: 0, instanceId: card.instanceId, line: 'support' }, reg);
    expect(result.state.players[0].hand).toHaveLength(3);
    expect(Object.keys(result.state.units)).toHaveLength(0);
  });

  it('回合推进→部署到支援线→移动需花费→前线单位可攻击总部', () => {
    let { state } = createGame(setup(), reg);
    // 回合 1: 玩家0 结束
    let r = applyCommand(state, { type: 'endTurn', player: 0 }, reg);
    state = r.state;
    expect(state.activePlayer).toBe(1);
    expect(state.players[1].kredits).toBe(1);
    expect(state.players[1].hand).toHaveLength(4); // 摸 1 张
    // 回合 2: 玩家1 结束
    r = applyCommand(state, { type: 'endTurn', player: 1 }, reg);
    state = r.state;
    expect(state.activePlayer).toBe(0);
    expect(state.players[0].kredits).toBe(2);
    expect(state.players[0].maxKredits).toBe(2);

    // 部署 2 费步兵 → 只能部署到支援线
    const card = state.players[0].hand.find((c) => c.cardId === 'inf')!;
    r = applyCommand(state, { type: 'playCard', player: 0, instanceId: card.instanceId, line: 'frontline' }, reg);
    state = r.state;
    const unit = Object.values(state.units)[0];
    expect(unit.line).toBe('support');
    expect(state.players[0].kredits).toBe(0);
    expect(state.frontlineController).toBeNull();

    // 支援线单位没有攻击总部的合法目标（HQ 需前线单位）
    const hqTargets = legalActions(state, reg, 0)
      .filter((a) => a.kind === 'attack')
      .flatMap((a) => a.targets?.refs ?? [])
      .filter((t) => t.kind === 'hq');
    expect(hqTargets).toHaveLength(0);

    // 过两回合，攒费用后移动 + 攻击
    r = applyCommand(state, { type: 'endTurn', player: 0 }, reg);
    state = r.state;
    r = applyCommand(state, { type: 'endTurn', player: 1 }, reg);
    state = r.state;
    expect(state.players[0].kredits).toBe(3);
    r = applyCommand(state, { type: 'moveUnit', player: 0, unitId: unit.unitId, toLine: 'frontline' }, reg);
    state = r.state;
    expect(state.units[unit.unitId].line).toBe('frontline');
    expect(state.frontlineController).toBe(0);
    expect(state.players[0].kredits).toBe(2); // 移动支付行动花费 1
    r = applyCommand(state, { type: 'attack', player: 0, attackerId: unit.unitId, target: { kind: 'hq', player: 1 } }, reg);
    state = r.state;
    expect(state.players[1].hq.hp).toBe(18);
    expect(state.players[0].kredits).toBe(1); // 攻击支付行动花费 1
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

  it('前线共享槽位与部署限制', () => {
    const reg2 = makeRegistry();
    let { state } = createGame(setup(), reg2);
    let r = applyCommand(state, { type: 'endTurn', player: 0 }, reg2);
    state = r.state;
    r = applyCommand(state, { type: 'endTurn', player: 1 }, reg2);
    state = r.state;
    // 玩家0 跳费到 3，部署并移入前线
    state.players[0].kredits = 3;
    const card = state.players[0].hand.find((c) => c.cardId === 'inf')!;
    r = applyCommand(state, { type: 'playCard', player: 0, instanceId: card.instanceId }, reg2);
    state = r.state;
    const unit = Object.values(state.units)[0];
    r = applyCommand(state, { type: 'moveUnit', player: 0, unitId: unit.unitId, toLine: 'frontline' }, reg2);
    state = r.state;
    expect(state.frontlineController).toBe(0);
    expect(getDef(reg2, unit.cardId)?.type).toBe('infantry');
    // 支援线容量 4
    expect(state.players[0].support.length).toBeLessThanOrEqual(4);
  });
});
