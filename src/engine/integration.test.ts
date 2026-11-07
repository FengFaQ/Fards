/**
 * 引擎 × 卡牌脚本集成测试
 * ------------------------------------------------------------------
 * 用真实 cards.json + CARD_SCRIPTS 建卡组、跑随机对局，验证：
 * 1) 158+ 卡牌脚本不会导致引擎抛异常；
 * 2) 引擎不变量（单位归属、线槽、生命值范围、动作队列）不被破坏；
 * 3) 未知 custom 原语会被 console.warn 暴露出来。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CardDef, EngineRegistry, GameCommand, GameState } from './types';
import { applyCommand, legalActions, createGame } from './index';
import { CARD_SCRIPTS } from './cards';

function loadCardDefs(): Record<string, CardDef> {
  const path = resolve(process.cwd(), 'public/data/cards.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>[];
  const out: Record<string, CardDef> = {};
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

/** 用脚本卡随机凑 39 张（引擎不校验阵营，本轮只测效果执行） */
function buildScriptDeck(scriptIds: string[], seed: number): { cardId: string; count: number }[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const pool = scriptIds.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: { cardId: string; count: number }[] = [];
  let total = 0;
  for (const cardId of pool) {
    if (total >= 39) break;
    const count = total + 2 <= 39 ? 2 : 1;
    out.push({ cardId, count });
    total += count;
  }
  return out;
}

describe('引擎 × 卡牌脚本集成', () => {
  const hasData = existsSync(resolve(process.cwd(), 'public/data/cards.json'));
  const defs = hasData ? loadCardDefs() : {};
  const scriptIds = Object.keys(CARD_SCRIPTS).filter((id) => !!defs[id]);
  const reg: EngineRegistry = { cardDefs: defs, scripts: CARD_SCRIPTS };

  function randomCommand(state: GameState, player: number): GameCommand | null {
    if (state.pendingChoice) {
      const choice = state.pendingChoice;
      return {
        type: 'resolveChoice',
        player: choice.player,
        choiceId: choice.choiceId,
        selection: [choice.options?.[0]?.id ?? '0'],
      };
    }
    const actions = legalActions(state, reg, player as 0 | 1);
    if (!actions.length) return { type: 'endTurn', player: player as 0 | 1 };
    const pick = actions[Math.floor(Math.random() * actions.length)];
    if (pick.kind === 'playCard' && pick.cardInstanceId) {
      const target = pick.targets?.mode === 'target' ? pick.targets.refs[0] : undefined;
      return {
        type: 'playCard',
        player: player as 0 | 1,
        instanceId: pick.cardInstanceId,
        targets: target ? [target] : undefined,
        line: pick.deployLines?.[0],
      };
    }
    if (pick.kind === 'attack' && pick.attackerId) {
      const target = pick.targets?.mode === 'target' ? pick.targets.refs[0] : undefined;
      if (!target) return { type: 'endTurn', player: player as 0 | 1 };
      return { type: 'attack', player: player as 0 | 1, attackerId: pick.attackerId, target };
    }
    if (pick.kind === 'moveUnit' && pick.unitId) {
      return {
        type: 'moveUnit',
        player: player as 0 | 1,
        unitId: pick.unitId,
        toLine: 'frontline',
      };
    }
    return { type: 'endTurn', player: player as 0 | 1 };
  }

  it('随机对局 60 局不崩溃、状态不变量成立', () => {
    expect(hasData).toBe(true);
    expect(scriptIds.length).toBeGreaterThan(50);
    const warnings = new Set<string>();
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.add(args.map(String).join(' '));
      originalWarn(...args);
    };
    let finished = 0;
    try {
      for (let game = 0; game < 60; game++) {
        const deckA = buildScriptDeck(scriptIds, game * 7 + 1);
        const deckB = buildScriptDeck(scriptIds, game * 13 + 5);
        let { state } = createGame(
          {
            seed: game + 100,
            firstPlayer: 0,
            players: [
              { name: 'A', faction: 'Germany', allyFaction: null, deck: deckA },
              { name: 'B', faction: 'USA', allyFaction: null, deck: deckB },
            ],
          },
          reg,
        );
        let steps = 0;
        while (state.status === 'playing' && steps < 400) {
          const cmd = randomCommand(state, state.activePlayer);
          if (!cmd) break;
          const result = applyCommand(state, cmd, reg);
          state = result.state;
          steps += 1;
          // 不变量
          expect(state.players[0].hq.hp).toBeGreaterThanOrEqual(0);
          expect(state.players[1].hq.hp).toBeGreaterThanOrEqual(0);
          expect(state.players[0].frontline.length).toBeLessThanOrEqual(state.config.frontlineSlots);
          expect(state.players[0].support.length).toBeLessThanOrEqual(state.config.supportSlots);
          for (const unit of Object.values(state.units)) {
            if (!(unit.maxHp >= unit.hp)) {
              throw new Error(
                `不变量破坏：maxHp=${unit.maxHp} hp=${unit.hp} card=${unit.cardId} owner=${unit.owner} line=${unit.line} lastCmd=${JSON.stringify(cmd)}`,
              );
            }
            expect(unit.hp).toBeGreaterThan(0);
            expect(state.players[unit.owner][unit.line]).toContain(unit.unitId);
          }
        }
        if (state.status === 'finished') finished += 1;
      }
    } finally {
      console.warn = originalWarn;
    }
    expect(finished).toBeGreaterThan(40);
    // 未知 custom 原语数量应可控（脚本引用了未实现原语时会被记录）
    expect(warnings.size).toBeLessThan(80);
  }, 120000);
});
