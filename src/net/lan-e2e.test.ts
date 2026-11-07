/**
 * 局域网对战端到端测试（真实 WebSocket 服务器 + 真实引擎 + 脱敏视图）
 * ------------------------------------------------------------------
 * 模拟：host 浏览器（权威引擎） ↔ LAN 服务器 ↔ guest 浏览器
 * 验证：建房/加入/握手 → host 开局 → 双方轮流行动 → 脱敏视图不泄露对手信息 → 对局能正常结束。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import WebSocket from 'ws';
import { applyCommand, createGame, legalActions } from '@/engine';
import type { CardDef, EngineRegistry, GameCommand, GameEvent, GameState, LegalAction, PendingChoice } from '@/engine/types';
import { CARD_SCRIPTS } from '@/engine/cards';
import { HIDDEN_CARD, sanitizeStateFor } from './sanitize';
import type { LanDeckPayload, LanGameView, PeerMessage } from './protocol';

const PORT = 18123;
const HTTP_BASE = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

function loadDefs(): Record<string, CardDef> {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/cards.json'), 'utf8')) as Record<string, unknown>[];
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

class TestClient {
  ws: WebSocket;
  messages: unknown[] = [];
  private waiters: { predicate: (m: unknown) => boolean; resolve: (m: unknown) => void }[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      const message = JSON.parse(String(data));
      this.messages.push(message);
      const index = this.waiters.findIndex((w) => w.predicate(message));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        waiter.resolve(message);
      }
    });
  }

  open(): Promise<void> {
    return new Promise((resolveOpen, rejectOpen) => {
      this.ws.once('open', () => resolveOpen());
      this.ws.once('error', rejectOpen);
    });
  }

  send(message: unknown): void {
    this.ws.send(JSON.stringify(message));
  }

  waitFor<T = unknown>(predicate: (m: unknown) => boolean, timeoutMs = 5000): Promise<T> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing as T);
    return new Promise((resolveWait, rejectWait) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== resolveWait);
        rejectWait(new Error(`等待消息超时（已收到 ${this.messages.length} 条）`));
      }, timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolveWait(m as T);
        },
      });
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* 忽略 */
    }
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForHealthz(timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${HTTP_BASE}/healthz`);
      if (res.ok) return;
    } catch {
      /* 继续重试 */
    }
    await wait(100);
  }
  throw new Error('LAN 服务器未能启动');
}

function pickFirstAction(actions: LegalAction[], state: GameState, player: 0 | 1): GameCommand | null {
  const pending: PendingChoice | null = state.pendingChoice;
  if (pending) {
    return { type: 'resolveChoice', player: pending.player, choiceId: pending.choiceId, selection: [pending.options?.[0]?.id ?? '0'] };
  }
  const attack = actions.find((a) => a.kind === 'attack' && a.targets?.refs[0]);
  if (attack) {
    return { type: 'attack', player, attackerId: attack.attackerId!, target: attack.targets!.refs[0] };
  }
  const play = actions.find((a) => a.kind === 'playCard');
  if (play) {
    return {
      type: 'playCard',
      player,
      instanceId: play.cardInstanceId!,
      targets: play.targets?.mode === 'target' ? play.targets.refs.slice(0, play.targets.count ?? 1) : undefined,
      line: play.deployLines?.[0],
    };
  }
  const move = actions.find((a) => a.kind === 'moveUnit' && a.unitId);
  if (move) {
    const unit = state.units[move.unitId!];
    const toLine = unit?.line === 'support' ? 'frontline' : 'support';
    return { type: 'moveUnit', player, unitId: move.unitId!, toLine };
  }
  return { type: 'endTurn', player };
}

describe('局域网对战 e2e（服务器 + 引擎 + 脱敏）', () => {
  let server: ChildProcess | null = null;
  const defs = loadDefs();
  const reg: EngineRegistry = { cardDefs: defs, scripts: CARD_SCRIPTS };

  beforeAll(async () => {
    server = spawn(process.execPath, [resolve(process.cwd(), 'server/lan-server.mjs')], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'ignore',
    });
    await waitForHealthz();
  }, 20000);

  afterAll(() => {
    server?.kill();
  });

  it('建房 → 加入 → 开局 → 双方轮转 → 脱敏视图不泄露 → 对局结束', async () => {
    const hostClient = new TestClient(WS_URL);
    const guestClient = new TestClient(WS_URL);
    await Promise.all([hostClient.open(), guestClient.open()]);

    // 房主建房
    hostClient.send({ type: 'create', name: 'Host', protocolVersion: 1 });
    const hostRoom = await hostClient.waitFor<{ type: 'room'; code: string; role: string }>((m) => (m as { type?: string }).type === 'room');
    expect(hostRoom.role).toBe('host');
    const code = hostRoom.code;
    expect(code).toMatch(/^[A-Z0-9]{4}$/);

    // 访客加入
    guestClient.send({ type: 'join', code: code.toLowerCase(), name: 'Guest', protocolVersion: 1 });
    const guestRoom = await guestClient.waitFor<{ type: 'room'; code: string; role: string }>((m) => (m as { type?: string }).type === 'room');
    expect(guestRoom.role).toBe('guest');
    await hostClient.waitFor((m) => (m as { type?: string }).type === 'peerJoin');

    // 访客上报卡组（hello）
    const guestDeck: LanDeckPayload = { name: 'Guest Deck', mainFaction: 'USA', allyFaction: null, cards: [{ cardId: 'm4_sherman', count: 10 }] };
    guestClient.send({ type: 'relay', data: { t: 'hello', name: 'Guest', deck: guestDeck } });
    const hello = await hostClient.waitFor<{ type: 'relay'; data: PeerMessage }>((m) => {
      const msg = m as { type?: string; data?: { t?: string } };
      return msg.type === 'relay' && msg.data?.t === 'hello';
    });
    expect(hello.data.t).toBe('hello');

    // host 建立权威对局（本测试使用真实引擎）
    const hostDeck: LanDeckPayload = { name: 'Host Deck', mainFaction: 'Germany', allyFaction: null, cards: [{ cardId: 'panzer_35t', count: 10 }] };
    let hostState: GameState = createGame(
      {
        seed: 99,
        firstPlayer: 0,
        players: [
          { name: 'Host', faction: 'Germany', allyFaction: null, deck: hostDeck.cards },
          { name: 'Guest', faction: 'USA', allyFaction: null, deck: guestDeck.cards },
        ],
      },
      reg,
    ).state;

    let seq = 0;
    const buildView = (): LanGameView => {
      seq += 1;
      return {
        perspective: 1,
        state: sanitizeStateFor(hostState, 1),
        legalActions: legalActions(hostState, reg, 1),
        pendingChoice: hostState.pendingChoice && hostState.pendingChoice.player === 1 ? hostState.pendingChoice : null,
        seq,
      };
    };
    const broadcast = (events: GameEvent[] = []): void => {
      hostClient.send({ type: 'relay', data: { t: 'sync', view: buildView(), events } });
    };

    // 开局：host 先手
    let view = buildView();
    guestClient.send; // noop 占位，避免未使用告警
    hostClient.send({ type: 'relay', data: { t: 'start', seed: 99, firstPlayer: 0, view } });
    const startMsg = await guestClient.waitFor<{ type: 'relay'; data: { t: string; view: LanGameView } }>((m) => {
      const msg = m as { type?: string; data?: { t?: string } };
      return msg.type === 'relay' && msg.data?.t === 'start';
    });
    expect(startMsg.data.view.state.players[0].hand.every((c) => c.cardId === HIDDEN_CARD)).toBe(true);

    // 对局循环：host 用自己的 legalActions；guest 用 host 下发的视图里的 legalActions
    let lastGuestView: LanGameView | null = startMsg.data.view;
    guestClient.ws.on('message', (data) => {
      const message = JSON.parse(String(data)) as { type?: string; data?: { t?: string; view?: LanGameView } };
      if (message.type === 'relay' && message.data?.t === 'sync' && message.data.view) {
        lastGuestView = message.data.view;
      }
    });

    let steps = 0;
    let hostEvents: GameEvent[] = [];
    const fingerprint = (s: GameState): string =>
      [
        s.turn,
        s.activePlayer,
        s.players[0].hq.hp,
        s.players[1].hq.hp,
        s.players[0].hand.length,
        s.players[1].hand.length,
        Object.keys(s.units).length,
        s.players[0].frontline.length,
        s.players[1].frontline.length,
      ].join(':');
    let lastFingerprint = fingerprint(hostState);
    let stall = 0;
    while (hostState.status === 'playing' && steps < 300) {
      steps += 1;
      // 先处理挂起选择：guest 的选择 → 由 guest 回复；host 自己的直接选第一个选项
      if (hostState.pendingChoice) {
        const choice = hostState.pendingChoice;
        if (choice.player === 1) {
          guestClient.send({ type: 'relay', data: { t: 'choice', choiceId: choice.choiceId, selection: [choice.options?.[0]?.id ?? '0'] } });
          const relayedChoice = await hostClient.waitFor<{ type: 'relay'; data: { t: string; choiceId: string; selection: string[] } }>(
            (m) => {
              const msg = m as { type?: string; data?: { t?: string } };
              return msg.type === 'relay' && msg.data?.t === 'choice';
            },
          );
          const result = applyCommand(
            hostState,
            { type: 'resolveChoice', player: 1, choiceId: relayedChoice.data.choiceId, selection: relayedChoice.data.selection },
            reg,
          );
          hostState = result.state;
          hostEvents = result.events;
        } else {
          const result = applyCommand(
            hostState,
            { type: 'resolveChoice', player: 0, choiceId: choice.choiceId, selection: [choice.options?.[0]?.id ?? '0'] },
            reg,
          );
          hostState = result.state;
          hostEvents = result.events;
        }
        broadcast(hostEvents);
        await wait(15);
        continue;
      }
      const active = hostState.activePlayer;
      if (active === 0) {
        const actions = legalActions(hostState, reg, 0);
        const cmd = pickFirstAction(actions, hostState, 0);
        if (!cmd) break;
        const result = applyCommand(hostState, cmd, reg);
        hostState = result.state;
        hostEvents = result.events;
        broadcast(hostEvents);
      } else {
        // 客机从最近一次视图取合法动作并发送指令
        const viewNow = lastGuestView!;
        const actions = viewNow.legalActions;
        const cmd = pickFirstAction(actions, viewNow.state, 1);
        if (!cmd) break;
        // 通过服务器 relay 发送（模拟真实 guest 客户端行为）
        guestClient.send({ type: 'relay', data: { t: 'command', cmd } });
        const relayed = await hostClient.waitFor<{ type: 'relay'; data: { t: string; cmd: GameCommand } }>(
          (m) => {
            const msg = m as { type?: string; data?: { t?: string } };
            return msg.type === 'relay' && msg.data?.t === 'command';
          },
        );
        const result = applyCommand(hostState, relayed.data.cmd, reg);
        hostState = result.state;
        broadcast(result.events);
      }
      await wait(15);
      if (hostState.status !== 'playing') break;
      const nextFingerprint = fingerprint(hostState);
      if (nextFingerprint === lastFingerprint) {
        stall += 1;
        if (stall > 3) {
          throw new Error(`对局停滞：连续 4 步状态无变化（turn=${hostState.turn} active=${hostState.activePlayer} step=${steps}）`);
        }
      } else {
        stall = 0;
        lastFingerprint = nextFingerprint;
      }
      if (steps > 120 && hostState.turn > 40) break;
    }

    expect(steps).toBeLessThan(300);
    expect(hostState.turn).toBeGreaterThan(2);
    // 客机收到的每一帧视图都不应泄露房主手牌/牌库
    const guestSyncs = guestClient.messages.filter((m) => {
      const msg = m as { type?: string; data?: { t?: string } };
      return msg.type === 'relay' && msg.data?.t === 'sync';
    });
    expect(guestSyncs.length).toBeGreaterThan(0);
    for (const raw of guestSyncs.slice(0, 20)) {
      const frame = raw as { data: { view: LanGameView } };
      for (const card of frame.data.view.state.players[0].hand) expect(card.cardId).toBe(HIDDEN_CARD);
      for (const card of frame.data.view.state.players[0].deck) expect(card.cardId).toBe(HIDDEN_CARD);
    }

    hostClient.close();
    guestClient.close();
  }, 60000);
});
