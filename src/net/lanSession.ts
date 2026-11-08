/**
 * 局域网会话（框架无关的 WebSocket 客户端）
 * ------------------------------------------------------------------
 * 负责：连接 LAN 服务器 / 创建或加入房间 / 房间内对端消息收发。
 * 不负责：规则引擎（host 侧在 battleStore 内）与 UI 渲染。
 */
import type { GameCommand, GameEvent, LegalAction, PendingChoice } from '@/engine/types';
import type {
  ClientToServer,
  LanDeckPayload,
  LanGameView,
  LanRole,
  PeerMessage,
  ServerToClient,
} from './protocol';
import { LAN_PROTOCOL_VERSION } from './protocol';

export type LanStatus = 'idle' | 'connecting' | 'in-room' | 'playing' | 'closed' | 'error';

export interface LanSnapshot {
  status: LanStatus;
  role: LanRole | null;
  roomCode: string | null;
  selfName: string;
  peerName: string | null;
  /** 自己是否已点准备 */
  selfReady: boolean;
  /** 对端是否已点准备（只由收到的 ready 消息写入） */
  peerReady: boolean;
  guestDeckOk: boolean;
  guestDeckErrors: string[];
  error: string | null;
  errorCode: import('./protocol').LanErrorCode | null;
  lastView: LanGameView | null;
  seq: number;
}

type Listener = () => void;

export interface LanSessionOptions {
  /** 覆盖 WebSocket 地址；默认同源 /ws */
  wsUrl?: string;
  name?: string;
  /** 心跳间隔（ms） */
  heartbeatMs?: number;
}

function defaultWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8080/ws';
  const override = new URLSearchParams(window.location.search).get('ws');
  if (override) return override;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class LanSession {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private viewListeners = new Set<(view: LanGameView, events: GameEvent[]) => void>();
  private commandListeners = new Set<(cmd: GameCommand) => void>();
  private choiceListeners = new Set<(choiceId: string, selection: string[]) => void>();
  private startListeners = new Set<(msg: Extract<PeerMessage, { t: 'start' }>) => void>();
  private helloListeners = new Set<(msg: Extract<PeerMessage, { t: 'hello' }>) => void>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private selfId = '';
  private deck: LanDeckPayload | null = null;

  snapshot: LanSnapshot = {
    status: 'idle',
    role: null,
    roomCode: null,
    selfName: '',
    peerName: null,
    peerReady: false,
    guestDeckOk: false,
    guestDeckErrors: [],
    error: null,
    errorCode: null,
    selfReady: false,
    lastView: null,
    seq: 0,
  };

  constructor(private readonly options: LanSessionOptions = {}) {}

  // ---------------- 订阅 ----------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onView(listener: (view: LanGameView, events: GameEvent[]) => void): () => void {
    this.viewListeners.add(listener);
    return () => this.viewListeners.delete(listener);
  }

  onCommand(listener: (cmd: GameCommand) => void): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  onChoice(listener: (choiceId: string, selection: string[]) => void): () => void {
    this.choiceListeners.add(listener);
    return () => this.choiceListeners.delete(listener);
  }

  onStart(listener: (msg: Extract<PeerMessage, { t: 'start' }>) => void): () => void {
    this.startListeners.add(listener);
    return () => this.startListeners.delete(listener);
  }

  onHello(listener: (msg: Extract<PeerMessage, { t: 'hello' }>) => void): () => void {
    this.helloListeners.add(listener);
    return () => this.helloListeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private patch(partial: Partial<LanSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.emit();
  }

  // ---------------- 连接 ----------------

  private connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }
    if (typeof WebSocket === 'undefined') {
      return Promise.reject(new Error('当前环境不支持 WebSocket'));
    }
    this.patch({ status: 'connecting', error: null });
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.options.wsUrl ?? defaultWsUrl());
      this.ws = ws;
      let settled = false;
      ws.onopen = () => {
        settled = true;
        this.patch({ status: 'in-room' });
        this.startHeartbeat();
        resolve();
      };
      ws.onmessage = (event: MessageEvent) => {
        const text = typeof event.data === 'string' ? event.data : '';
        this.handleServerMessage(text);
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('无法连接局域网服务器（请确认已运行 npm run lan，且与房主在同一局域网）'));
        }
        this.patch({ status: 'error', error: '连接异常' });
      };
      ws.onclose = () => {
        this.stopHeartbeat();
        if (this.snapshot.status !== 'idle') {
          this.patch({ status: this.snapshot.status === 'error' ? 'error' : 'closed' });
        }
        if (!settled) {
          settled = true;
          reject(new Error('连接已关闭'));
        }
      };
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.options.heartbeatMs ?? 20000;
    this.heartbeat = setInterval(() => {
      this.sendRaw({ type: 'ping' });
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private sendRaw(message: ClientToServer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  private sendPeer(message: PeerMessage): void {
    this.sendRaw({ type: 'relay', data: message });
  }

  // ---------------- 房间 ----------------

  async createRoom(name: string, selfDeck?: LanDeckPayload): Promise<void> {
    this.patch({ selfName: name });
    if (selfDeck) this.deck = selfDeck;
    await this.connect();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('创建房间超时')), 10000);
      const off = this.subscribe(() => {
        if (this.snapshot.roomCode) {
          clearTimeout(timer);
          off();
          resolve();
        } else if (this.snapshot.error) {
          clearTimeout(timer);
          off();
          reject(new Error(this.snapshot.error));
        }
      });
      this.sendRaw({ type: 'create', name, protocolVersion: LAN_PROTOCOL_VERSION });
    });
  }

  async joinRoom(code: string, name: string, deck: LanDeckPayload): Promise<void> {
    this.patch({ selfName: name });
    this.deck = deck;
    await this.connect();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('加入房间超时')), 10000);
      const off = this.subscribe(() => {
        if (this.snapshot.roomCode) {
          clearTimeout(timer);
          off();
          resolve();
        } else if (this.snapshot.error) {
          clearTimeout(timer);
          off();
          reject(new Error(this.snapshot.error));
        }
      });
      this.sendRaw({ type: 'join', code: code.toUpperCase().trim(), name, protocolVersion: LAN_PROTOCOL_VERSION });
    });
  }

  /** 房主/客机都可以在进房后补发 hello（客机进房后自动发送） */
  sendHello(): void {
    if (!this.deck || this.snapshot.role !== 'guest') return;
    this.sendPeer({ t: 'hello', name: this.snapshot.selfName, deck: this.deck });
  }

  setDeck(deck: LanDeckPayload): void {
    this.deck = deck;
    if (this.snapshot.role === 'guest') this.sendHello();
  }

  getDeck(): LanDeckPayload | null {
    return this.deck;
  }

  sendReady(ready: boolean): void {
    this.patch({ selfReady: ready });
    this.sendPeer({ t: 'ready', ready });
  }

  sendDeckCheck(ok: boolean, errors: string[]): void {
    this.sendPeer({ t: 'deckCheck', ok, errors });
  }

  /** host 开始对局：发送 seed/firstPlayer + 初始视图 */
  startGame(seed: number, firstPlayer: 0 | 1, view: LanGameView): void {
    this.patch({ status: 'playing' });
    this.sendPeer({ t: 'start', seed, firstPlayer, view });
  }

  /** host 广播最新视图 */
  broadcastView(view: LanGameView, events: GameEvent[]): void {
    this.sendPeer({ t: 'sync', view, events });
  }

  /** guest 提交指令 */
  sendCommand(cmd: GameCommand): void {
    this.sendPeer({ t: 'command', cmd });
  }

  /** guest 提交抉择 */
  sendChoice(choiceId: string, selection: string[]): void {
    this.sendPeer({ t: 'choice', choiceId, selection });
  }

  sendToast(text: string): void {
    this.sendPeer({ t: 'toast', text });
  }

  close(reason?: string): void {
    try {
      if (this.snapshot.roomCode) this.sendPeer({ t: 'leave', reason });
      this.sendRaw({ type: 'leave' });
    } catch {
      /* 忽略 */
    }
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.patch({
      status: 'idle',
      roomCode: null,
      role: null,
      peerName: null,
      lastView: null,
      error: null,
      errorCode: null,
      selfReady: false,
      peerReady: false,
    });
  }

  // ---------------- 消息处理 ----------------

  private handleServerMessage(text: string): void {
    let message: ServerToClient;
    try {
      message = JSON.parse(text) as ServerToClient;
    } catch {
      return;
    }
    switch (message.type) {
      case 'welcome':
        return;
      case 'room':
        this.selfId = message.selfId;
        this.patch({
          status: 'in-room',
          error: null,
          errorCode: null,
          role: message.role,
          roomCode: message.code,
          peerName: message.peerName ?? null,
        });
        if (message.role === 'guest') this.sendHello();
        return;
      case 'peerJoin':
        this.patch({ peerName: message.name });
        return;
      case 'peerLeave':
        this.patch({ peerName: null, peerReady: false, guestDeckOk: false, guestDeckErrors: [] });
        return;
      case 'relay':
        this.handlePeerMessage(message.data);
        return;
      case 'error':
        this.patch({ status: 'error', error: message.message || message.code, errorCode: message.code });
        return;
      case 'pong':
      default:
        return;
    }
  }

  private handlePeerMessage(message: PeerMessage): void {
    switch (message.t) {
      case 'hello':
        for (const listener of this.helloListeners) listener(message);
        return;
      case 'hostInfo':
        this.patch({ peerName: message.hostName });
        return;
      case 'deckCheck':
        this.patch({ guestDeckOk: message.ok, guestDeckErrors: message.errors });
        return;
      case 'ready':
        this.patch({ peerReady: message.ready });
        return;
      case 'start':
        this.patch({ status: 'playing', lastView: message.view, seq: message.view.seq });
        for (const listener of this.startListeners) listener(message);
        return;
      case 'sync':
        this.patch({ lastView: message.view, seq: message.view.seq });
        for (const listener of this.viewListeners) listener(message.view, message.events);
        return;
      case 'command':
        for (const listener of this.commandListeners) listener(message.cmd);
        return;
      case 'choice':
        for (const listener of this.choiceListeners) listener(message.choiceId, message.selection);
        return;
      case 'leave':
        this.patch({ status: 'closed', error: message.reason ?? '对手已离开房间' });
        return;
      case 'toast':
        return;
      default:
        return;
    }
  }

  get id(): string {
    return this.selfId;
  }

  get isHost(): boolean {
    return this.snapshot.role === 'host';
  }
}

/** 全局单例：跨页面（大厅 → 对战）保持连接 */
let singleton: LanSession | null = null;

/**
 * 传输层覆盖：P2P（WebRTC DataChannel）与 LAN（WebSocket）实现同一套收发语义，
 * 对战相关代码只需调用 getLanSession()，由这里决定实际传输。
 * 由 P2P 页面在进入战场前设置；离开/重置时清空。
 */
let transportOverride: LanSession | null = null;

export function setLanTransportOverride(transport: LanSession | null): void {
  transportOverride = transport;
}

export function getLanTransportOverride(): LanSession | null {
  return transportOverride;
}

export function getLanSession(): LanSession {
  if (transportOverride) return transportOverride;
  if (!singleton) singleton = new LanSession({ name: '' });
  return singleton;
}

export function resetLanSession(): void {
  transportOverride = null;
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

export type { LegalAction, PendingChoice };
