/**
 * P2P 传输层（WebRTC DataChannel）——与 lanSession 相同的收发语义
 * ------------------------------------------------------------------
 * 目标：把「传输层」从 WebSocket 服务器换成 P2P，协议（PeerMessage）、引擎、
 * UI 一律不动。房主权威模型保持不变：
 *   host 跑引擎 → 通过 DataChannel 下发 LanGameView；guest 只渲染 + 回传指令。
 *
 * 与 LanSession 的对应关系（刻意保持同名方法，便于将来做 transport 抽象）：
 *   LanSession.createRoom / joinRoom   ↔  P2PTransport.createOfferCode / acceptOfferCode
 *   LanSession.onStart / onView / onCommand / onChoice / onHello  ↔  同名
 *   LanSession.sendCommand / sendChoice / sendReady / broadcastView / startGame  ↔  同名
 *   LanSession.snapshot（LanSnapshot） ↔  P2PTransport.snapshot（LanSnapshot & { 额外字段 }）
 *
 * 信令（SDP/ICE）不在本文件里：调用方先拿 offer/answer 文本（本地复制或经 MQTT），
 * 再喂给 acceptOfferCode / acceptAnswerCode。这样传输与信令彻底解耦。
 *
 * 连接特性：DTLS 加密（浏览器强制）、可靠有序、NAT 穿透只靠 STUN（无 TURN 时可能失败）。
 */
import type { GameCommand, GameEvent } from '@/engine/types';
import type { LanDeckPayload, LanGameView, LanRole, PeerMessage } from './protocol';
import { LAN_PROTOCOL_VERSION } from './protocol';
import type { LanSnapshot, LanStatus } from './lanSession';
import {
  DEFAULT_ICE_SERVERS,
  createRoomCode,
  createSelfId,
  decodeSignalCode,
  encodeSignalCode,
  summarizeCandidates,
  waitForIceGathering,
  type P2PSignalPayload,
} from './p2pSignal';

/** 数据通道标签：双方都必须一致 */
export const P2P_CHANNEL_LABEL = 'fards';

/** 控制帧（不是 PeerMessage，避免污染对端协议处理） */
const CONTROL_TAG = '__p2p';

type Listener = () => void;

export interface P2PTransportOptions {
  role: LanRole;
  name?: string;
  /** 覆盖 ICE 服务器（默认只用 STUN；需要中继时在这里加 TURN） */
  iceServers?: RTCIceServer[];
  /** ICE 收集超时（ms）；超时后仍用已收集到的候选生成对战码 */
  gatherTimeoutMs?: number;
  /** 调试日志（PoC 页面直接显示） */
  onLog?: (line: string) => void;
}

/** 在 LanSnapshot 之上补充 P2P 专属状态（其余字段与 LanSession 完全一致） */
export interface P2PSnapshot extends LanSnapshot {
  /** RTCPeerConnection.connectionState 镜像 */
  connection: RTCPeerConnectionState | 'idle';
  /** 本地 SDP 里的候选统计，用于「为什么连不上」的自检 */
  candidates: { host: number; srflx: number; relay: number; prflx: number };
  /** 最近一次 DataChannel ping 的往返时延（ms） */
  rttMs: number | null;
  /** 已发送/已接收的 PeerMessage 条数 */
  sent: number;
  received: number;
}

function emptySnapshot(role: LanRole, name: string): P2PSnapshot {
  return {
    status: 'idle',
    role,
    roomCode: null,
    selfName: name,
    peerName: null,
    selfReady: false,
    peerReady: false,
    guestDeckOk: false,
    guestDeckErrors: [],
    error: null,
    errorCode: null,
    lastView: null,
    seq: 0,
    connection: 'idle',
    candidates: { host: 0, srflx: 0, relay: 0, prflx: 0 },
    rttMs: null,
    sent: 0,
    received: 0,
  };
}

export class P2PTransport {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly viewListeners = new Set<(view: LanGameView, events: GameEvent[]) => void>();
  private readonly commandListeners = new Set<(cmd: GameCommand) => void>();
  private readonly choiceListeners = new Set<(choiceId: string, selection: string[]) => void>();
  private readonly startListeners = new Set<(msg: Extract<PeerMessage, { t: 'start' }>) => void>();
  private readonly helloListeners = new Set<(msg: Extract<PeerMessage, { t: 'hello' }>) => void>();
  private readonly outbox: string[] = [];
  private deck: LanDeckPayload | null = null;

  readonly selfId: string;
  snapshot: P2PSnapshot;

  constructor(private readonly options: P2PTransportOptions) {
    this.selfId = createSelfId();
    this.snapshot = emptySnapshot(options.role, options.name ?? (options.role === 'host' ? '房主' : '客机'));
  }

  // ---------------- 订阅（与 LanSession 同名同签名） ----------------

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

  private patch(partial: Partial<P2PSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.emit();
  }

  private log(line: string): void {
    this.options.onLog?.(line);
  }

  get isHost(): boolean {
    return this.options.role === 'host';
  }

  get id(): string {
    return this.selfId;
  }

  // ---------------- 信令：载荷层（任何通道都可用：手动对战码 / MQTT / 自建） ----------------

  /**
   * host：生成 offer 信令载荷。
   * 关键点是「非 trickle」：等 ICE 收集完成，候选全写进 SDP，所以整次握手只要单向一次交换。
   */
  async createOfferPayload(): Promise<{ payload: P2PSignalPayload; room: string; cands: P2PSnapshot['candidates'] }> {
    const pc = this.ensurePeer();
    const channel = pc.createDataChannel(P2P_CHANNEL_LABEL, { ordered: true });
    this.bindChannel(channel, true);
    this.patch({ status: 'connecting', error: null });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.log('offer 已生成，等待 ICE 收集…');
    const gathered = await waitForIceGathering(pc, this.options.gatherTimeoutMs ?? 6000);
    const sdp = pc.localDescription?.sdp ?? offer.sdp ?? '';
    const cands = summarizeCandidates(sdp);
    this.patch({ candidates: cands });
    if (!gathered.complete) this.log(`ICE 收集超时（${gathered.elapsedMs}ms），使用已收集的候选`);
    this.log(`候选统计 host=${cands.host} srflx=${cands.srflx} relay=${cands.relay}`);
    const room = createRoomCode(12);
    this.patch({ roomCode: room });
    const payload = this.buildPayload('offer', sdp, room);
    this.log(`offer 载荷就绪（SDP ${sdp.length} 字节）`);
    return { payload, room, cands };
  }

  /** guest：吃下 offer 载荷，生成 answer 载荷（回传给 host） */
  async acceptOfferPayload(
    payload: P2PSignalPayload,
  ): Promise<{ payload: P2PSignalPayload; room: string; cands: P2PSnapshot['candidates'] }> {
    if (payload.kind !== 'offer') throw new Error('收到的是 answer，不是 offer');
    const pc = this.ensurePeer();
    this.patch({ status: 'connecting', roomCode: payload.room || null, error: null });
    await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.log('answer 已生成，等待 ICE 收集…');
    const gathered = await waitForIceGathering(pc, this.options.gatherTimeoutMs ?? 6000);
    const sdp = pc.localDescription?.sdp ?? answer.sdp ?? '';
    const cands = summarizeCandidates(sdp);
    this.patch({ candidates: cands });
    if (!gathered.complete) this.log(`ICE 收集超时（${gathered.elapsedMs}ms），使用已收集的候选`);
    this.log(`候选统计 host=${cands.host} srflx=${cands.srflx} relay=${cands.relay}`);
    return { payload: this.buildPayload('answer', sdp, payload.room || ''), room: payload.room || '', cands };
  }

  /** host：吃下 guest 的 answer 载荷，握手完成 */
  async acceptAnswerPayload(payload: P2PSignalPayload): Promise<void> {
    if (payload.kind !== 'answer') throw new Error('收到的是 offer，不是 answer');
    const pc = this.pc;
    if (!pc) throw new Error('请先生成 offer');
    if (pc.remoteDescription && pc.signalingState === 'stable') throw new Error('已经完成过握手');
    await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
    this.log('已接受 answer，等待 DataChannel 打开…');
  }

  // ---------------- 信令：文本「对战码」层（P0 手动复制粘贴） ----------------

  /** host：生成可复制的 offer 对战码 */
  async createOfferCode(): Promise<{ code: string; room: string; cands: P2PSnapshot['candidates'] }> {
    const { payload, room, cands } = await this.createOfferPayload();
    const code = await encodeSignalCode(payload);
    this.log(`对战码已生成：${code.length} 字符`);
    return { code, room, cands };
  }

  /** guest：吃下 offer 对战码，返回 answer 对战码 */
  async acceptOfferCode(code: string): Promise<{ code: string; room: string; cands: P2PSnapshot['candidates'] }> {
    const offer = await decodeSignalCode(code);
    if (offer.kind !== 'offer') throw new Error('这是 answer 码，客机需要的是房主的 offer 码');
    const result = await this.acceptOfferPayload(offer);
    const answerCode = await encodeSignalCode(result.payload);
    this.log(`回执码已生成：${answerCode.length} 字符`);
    return { code: answerCode, room: result.room, cands: result.cands };
  }

  /** host：吃下 guest 的 answer 对战码 */
  async acceptAnswerCode(code: string): Promise<void> {
    const answer = await decodeSignalCode(code);
    if (answer.kind !== 'answer') throw new Error('这是 offer 码，房主需要的是「对手回执码」');
    await this.acceptAnswerPayload(answer);
  }

  private buildPayload(kind: 'offer' | 'answer', sdp: string, room: string): P2PSignalPayload {
    return {
      v: LAN_PROTOCOL_VERSION,
      kind,
      sdp,
      room,
      name: this.snapshot.selfName,
      selfId: this.selfId,
      ts: Date.now(),
    };
  }

  // ---------------- 连接管理 ----------------

  private ensurePeer(): RTCPeerConnection {
    if (this.pc) return this.pc;
    if (typeof RTCPeerConnection === 'undefined') throw new Error('当前环境不支持 WebRTC');
    const pc = new RTCPeerConnection({
      iceServers: this.options.iceServers ?? DEFAULT_ICE_SERVERS,
    });
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.patch({ connection: state });
      this.log(`connectionState=${state}`);
      if (state === 'failed') {
        this.patch({ status: 'error', error: 'P2P 连接失败：NAT 穿透未成功（可能需要 TURN 中继）' });
      } else if (state === 'disconnected') {
        this.log('连接抖动，等待自动恢复…');
      } else if (state === 'closed' && this.snapshot.status !== 'idle') {
        this.patch({ status: 'closed' });
      }
    };
    pc.onicecandidateerror = (event) => {
      if (event.errorCode) this.log(`ICE 候选错误 ${event.errorCode}（${event.url}）`);
    };
    pc.ondatachannel = (event) => {
      this.log(`收到 DataChannel：${event.channel.label}`);
      this.bindChannel(event.channel, false);
    };
    return pc;
  }

  private bindChannel(channel: RTCDataChannel, isHost: boolean): void {
    this.channel = channel;
    channel.onopen = () => {
      this.log('DataChannel 已打开');
      this.patch({ status: 'in-room', error: null, errorCode: null });
      // 与 LanSession 一致：客机进房后自动 hello（带卡组）
      if (!isHost && this.deck) this.sendHello();
      this.flush();
    };
    channel.onclose = () => {
      this.log('DataChannel 已关闭');
      if (this.snapshot.status !== 'idle') {
        this.patch({ status: 'closed', error: this.snapshot.error ?? '对手已断开连接' });
      }
    };
    channel.onerror = (event) => {
      const message = (event as unknown as { error?: { message?: string } }).error?.message;
      this.log(`DataChannel 错误：${message ?? 'unknown'}`);
    };
    channel.onmessage = (event: MessageEvent) => {
      const text = typeof event.data === 'string' ? event.data : '';
      if (text) this.handleIncoming(text);
    };
  }

  // ---------------- 发送 ----------------

  private rawSend(text: string): void {
    const channel = this.channel;
    if (!channel || channel.readyState !== 'open') {
      this.outbox.push(text);
      return;
    }
    channel.send(text);
  }

  private flush(): void {
    while (this.outbox.length) {
      const text = this.outbox.shift();
      if (!text) continue;
      if (!this.channel || this.channel.readyState !== 'open') {
        this.outbox.unshift(text);
        return;
      }
      this.channel.send(text);
    }
  }

  private sendPeer(message: PeerMessage): void {
    if (!this.channel || this.channel.readyState !== 'open') {
      // 未连通时排队（重启/慢握手不丢指令），由 flush 补发
      this.outbox.push(JSON.stringify(message));
      return;
    }
    this.channel.send(JSON.stringify(message));
    this.patch({ sent: this.snapshot.sent + 1 });
  }

  // ---------------- 与 LanSession 对齐的对外方法 ----------------

  setDeck(deck: LanDeckPayload): void {
    this.deck = deck;
    if (this.options.role === 'guest' && this.channel?.readyState === 'open') this.sendHello();
  }

  getDeck(): LanDeckPayload | null {
    return this.deck;
  }

  sendHello(): void {
    if (!this.deck || this.options.role !== 'guest') return;
    this.sendPeer({ t: 'hello', name: this.snapshot.selfName, deck: this.deck });
  }

  sendReady(ready: boolean): void {
    this.patch({ selfReady: ready });
    this.sendPeer({ t: 'ready', ready });
  }

  sendDeckCheck(ok: boolean, errors: string[]): void {
    this.sendPeer({ t: 'deckCheck', ok, errors });
  }

  startGame(seed: number, firstPlayer: 0 | 1, view: LanGameView): void {
    this.patch({ status: 'playing' });
    this.sendPeer({ t: 'start', seed, firstPlayer, view });
  }

  broadcastView(view: LanGameView, events: GameEvent[]): void {
    this.sendPeer({ t: 'sync', view, events });
  }

  sendCommand(cmd: GameCommand): void {
    this.sendPeer({ t: 'command', cmd });
  }

  sendChoice(choiceId: string, selection: string[]): void {
    this.sendPeer({ t: 'choice', choiceId, selection });
  }

  sendToast(text: string): void {
    this.sendPeer({ t: 'toast', text });
  }

  /** 主动测量 DataChannel 往返时延 */
  ping(): void {
    if (!this.channel || this.channel.readyState !== 'open') return;
    this.channel.send(JSON.stringify({ [CONTROL_TAG]: 'ping', ts: Date.now() }));
  }

  // ---------------- 接收 ----------------

  private handleIncoming(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (parsed && typeof parsed === 'object' && CONTROL_TAG in (parsed as Record<string, unknown>)) {
      const control = parsed as { ts?: number; [CONTROL_TAG]: unknown };
      if (control[CONTROL_TAG] === 'ping' && typeof control.ts === 'number') {
        if (this.channel?.readyState === 'open') {
          this.channel.send(JSON.stringify({ [CONTROL_TAG]: 'pong', ts: control.ts }));
        }
      } else if (control[CONTROL_TAG] === 'pong' && typeof control.ts === 'number') {
        this.patch({ rttMs: Date.now() - control.ts });
      }
      return;
    }
    this.patch({ received: this.snapshot.received + 1 });
    this.handlePeerMessage(parsed as PeerMessage);
  }

  /** 与 LanSession.handlePeerMessage 完全一致的语义 */
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
      default:
        return;
    }
  }

  // ---------------- 收尾 ----------------

  /** 关闭前尽力发一条 leave，让对端立刻收到「对手离开」 */
  close(reason?: string): void {
    try {
      if (this.channel?.readyState === 'open' && this.snapshot.roomCode) {
        this.channel.send(JSON.stringify({ t: 'leave', reason } satisfies PeerMessage));
      }
    } catch {
      /* 忽略 */
    }
    try {
      this.channel?.close();
    } catch {
      /* 忽略 */
    }
    try {
      this.pc?.close();
    } catch {
      /* 忽略 */
    }
    this.channel = null;
    this.pc = null;
    this.outbox.length = 0;
    this.snapshot = { ...this.snapshot, status: 'idle' as LanStatus, connection: 'idle' };
    this.emit();
  }

  /** 供页面展示：当前是否已连通（可直接进对局） */
  get connected(): boolean {
    return this.channel?.readyState === 'open';
  }
}
