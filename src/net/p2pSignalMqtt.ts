/**
 * 公共 MQTT broker 信令通道（浏览器内最小 MQTT 3.1.1 客户端，零运行时依赖）
 * ------------------------------------------------------------------
 * 为什么是 MQTT：纯静态站点需要一个「双方都能连、不用自建」的广播通道。
 * 公共 MQTT broker 恰好满足：WSS 直连、免注册、按 topic 广播、单条消息 ≤256 KB，
 * 而 WebRTC 信令（SDP offer/answer）压缩后只有 1~2 KB。
 *
 * 只实现需要的子集：CONNECT / CONNACK / SUBSCRIBE / SUBACK / PUBLISH(QoS0) /
 * PINGREQ / PINGRESP / DISCONNECT。QoS0 可能丢包，所以上层用「重发 + 幂等」兜底。
 *
 * 安全：broker 是公共的，任何人猜中 topic 都能订阅到 SDP（含内网 IP）。
 * 提供 secret 时，载荷用 AES-GCM 加密（密钥由房间口令经 HKDF 派生，见 p2pSignal.ts）。
 */
import type { P2PSignalPayload } from './p2pSignal';
import { openSignal, sealSignal } from './p2pSignal';

/** 实测可用的公共 broker（2026-11 复核：均 WSS 可连、可回环一条 2.4 KB 载荷） */
export const DEFAULT_SIGNAL_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
] as const;

export type MqttSignalState = 'idle' | 'connecting' | 'ready' | 'closed' | 'error';

export interface MqttSignalOptions {
  /** broker 地址；默认按 DEFAULT_SIGNAL_BROKERS 依次尝试 */
  url?: string;
  fallbackUrls?: string[];
  /** 房间口令（同时参与 topic 与密钥派生） */
  room: string;
  role: 'host' | 'guest';
  /** 提供则加密载荷；双方必须一致 */
  secret?: string;
  name?: string;
  selfId: string;
  /** 收到对端信令 */
  onSignal: (payload: P2PSignalPayload, raw: string) => void;
  onState?: (state: MqttSignalState, detail?: string) => void;
  keepaliveSec?: number;
  debug?: (line: string) => void;
}

// ============================================================
// MQTT 3.1.1 编解码（最小子集）
// ============================================================

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeLength(length: number): number[] {
  const out: number[] = [];
  let value = length;
  do {
    let digit = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) digit |= 0x80;
    out.push(digit);
  } while (value > 0);
  return out;
}

function utf8Field(text: string): number[] {
  const bytes = encoder.encode(text);
  return [(bytes.length >> 8) & 0xff, bytes.length & 0xff, ...bytes];
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function frame(header: number, body: Uint8Array): Uint8Array {
  return new Uint8Array([header, ...encodeLength(body.length), ...body]);
}

function connectPacket(clientId: string, keepaliveSec: number): Uint8Array {
  const body = new Uint8Array([
    ...utf8Field('MQTT'),
    0x04, // protocol level 3.1.1
    0x02, // clean session
    (keepaliveSec >> 8) & 0xff,
    keepaliveSec & 0xff,
    ...utf8Field(clientId),
  ]);
  return frame(0x10, body);
}

function subscribePacket(packetId: number, topic: string): Uint8Array {
  const body = new Uint8Array([
    (packetId >> 8) & 0xff,
    packetId & 0xff,
    ...utf8Field(topic),
    0x00, // QoS0
  ]);
  return frame(0x82, body);
}

function publishPacket(topic: string, payload: Uint8Array): Uint8Array {
  const body = new Uint8Array([...utf8Field(topic), ...payload]);
  return frame(0x30, body);
}

const PINGREQ = new Uint8Array([0xc0, 0x00]);
const DISCONNECT = new Uint8Array([0xe0, 0x00]);

interface ParsedFrame {
  header: number;
  body: Uint8Array;
}

/** 增量解析：处理 WS 分片与粘包 */
function createFrameParser(onFrame: (frame: ParsedFrame) => void) {
  let buffer: Uint8Array = new Uint8Array(0);
  return (chunk: Uint8Array) => {
    buffer = concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 2) return;
      let multiplier = 1;
      let length = 0;
      let cursor = 1;
      let complete = false;
      while (cursor < buffer.length) {
        const byte = buffer[cursor];
        length += (byte & 0x7f) * multiplier;
        multiplier *= 128;
        cursor += 1;
        if ((byte & 0x80) === 0) {
          complete = true;
          break;
        }
        if (multiplier > 128 ** 4) return; // 非法长度，放弃
      }
      if (!complete) return;
      if (buffer.length < cursor + length) return;
      onFrame({ header: buffer[0], body: buffer.slice(cursor, cursor + length) });
      buffer = buffer.slice(cursor + length);
    }
  };
}

function readPublish(body: Uint8Array): { topic: string; payload: Uint8Array } {
  const topicLength = (body[0] << 8) | body[1];
  const topic = decoder.decode(body.slice(2, 2 + topicLength));
  return { topic, payload: body.slice(2 + topicLength) };
}

// ============================================================
// 通道
// ============================================================

export class MqttSignalChannel {
  /** 自己发布到的 topic（对端订阅它） */
  readonly publishTopic: string;
  /** 自己订阅的 topic（对端发布到它） */
  readonly subscribeTopic: string;

  private ws: WebSocket | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private packetId = 1;
  private state: MqttSignalState = 'idle';
  private parse = createFrameParser((frame) => this.handleFrame(frame));

  constructor(private readonly options: MqttSignalOptions) {
    const peer = options.role === 'host' ? 'guest' : 'host';
    this.publishTopic = `fards/p2p/v1/${options.room}/${options.role}`;
    this.subscribeTopic = `fards/p2p/v1/${options.room}/${peer}`;
  }

  get currentState(): MqttSignalState {
    return this.state;
  }

  private setState(state: MqttSignalState, detail?: string): void {
    this.state = state;
    this.options.onState?.(state, detail);
  }

  private log(line: string): void {
    this.options.debug?.(line);
  }

  /** 按 broker 列表依次尝试（首个成功即停止） */
  async connect(): Promise<void> {
    const urls = this.options.url
      ? [this.options.url]
      : [...(this.options.fallbackUrls ?? []), ...DEFAULT_SIGNAL_BROKERS];
    const unique = [...new Set(urls)];
    let lastError: unknown = null;
    for (const url of unique) {
      this.setState('connecting', url);
      try {
        await this.connectOne(url);
        return;
      } catch (error) {
        lastError = error;
        this.log(`broker ${url} 连接失败：${error instanceof Error ? error.message : String(error)}`);
        this.teardown();
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError ?? '没有可用 broker');
    this.setState('error', message);
    throw new Error(`公共信令服务器均不可用：${message}`);
  }

  private connectOne(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // 浏览器要求 https 页面只能用 wss；MQTT over WebSocket 还要求子协议 "mqtt"
      let ws: WebSocket;
      try {
        ws = new WebSocket(url, 'mqtt');
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const clientId = `fards-${this.options.selfId}-${Math.random().toString(36).slice(2, 8)}`;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('连接超时（8s）'));
      }, 8000);

      ws.onopen = () => {
        this.log(`broker 已连接：${url}`);
        try {
          ws.send(connectPacket(clientId, this.options.keepaliveSec ?? 30));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      ws.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          this.parse(new Uint8Array(data));
        } else if (typeof data === 'string') {
          this.parse(encoder.encode(data));
        }
      };
      ws.onerror = () => {
        if (settled) {
          this.setState('error', 'broker 连接中断');
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(new Error('无法连接 broker'));
      };
      ws.onclose = () => {
        this.stopKeepalive();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('broker 关闭了连接'));
          return;
        }
        if (this.state !== 'closed') this.setState('closed', 'broker 连接已关闭');
      };

      // CONNACK 到达才视为就绪
      this.onConnack = (code) => {
        if (settled) return;
        if (code !== 0) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`broker 拒绝连接（CONNACK 0x${code.toString(16)}）`));
          return;
        }
        settled = true;
        clearTimeout(timer);
        try {
          ws.send(subscribePacket(this.packetId++, this.subscribeTopic));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        this.startKeepalive();
        this.setState('ready', url);
        this.log(`订阅 ${this.subscribeTopic}`);
        resolve();
      };
    });
  }

  private onConnack: ((code: number) => void) | null = null;

  private handleFrame(frame: ParsedFrame): void {
    const type = frame.header >> 4;
    if (type === 2) {
      this.onConnack?.(frame.body[1] ?? 0xff);
      return;
    }
    if (type === 9) {
      this.log('SUBACK');
      return;
    }
    if (type === 13) {
      return; // PINGRESP
    }
    if (type === 3) {
      const { topic, payload } = readPublish(frame.body);
      if (topic !== this.subscribeTopic) return;
      const raw = decoder.decode(payload);
      void this.dispatch(raw);
    }
  }

  private async dispatch(raw: string): Promise<void> {
    try {
      let json = raw;
      if (raw.startsWith('s1.')) {
        if (!this.options.secret) {
          this.log('收到加密信令但本地没有房间口令，忽略');
          return;
        }
        json = await openSignal(this.options.secret, raw);
      }
      const payload = JSON.parse(json) as P2PSignalPayload;
      if (!payload || typeof payload.sdp !== 'string') return;
      if (payload.selfId && payload.selfId === this.options.selfId) return; // 自己发的回声
      this.log(`收到对端信令：${payload.kind}（${payload.sdp.length} 字节 SDP）`);
      this.options.onSignal(payload, raw);
    } catch (error) {
      this.log(`信令解析失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 发布一条信令（QoS0：调用方负责重发） */
  async publishSignal(payload: P2PSignalPayload): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('信令通道未连接');
    const json = JSON.stringify({ ...payload, name: payload.name ?? this.options.name });
    const body = this.options.secret ? await sealSignal(this.options.secret, json) : json;
    this.ws.send(publishPacket(this.publishTopic, encoder.encode(body)));
    this.log(`已发布 ${payload.kind} → ${this.publishTopic}`);
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    const interval = Math.max(15, (this.options.keepaliveSec ?? 30) / 2) * 1000;
    this.keepalive = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(PINGREQ);
    }, interval);
  }

  private stopKeepalive(): void {
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
  }

  private teardown(): void {
    this.stopKeepalive();
    try {
      this.ws?.close();
    } catch {
      /* 忽略 */
    }
    this.ws = null;
  }

  close(): void {
    this.stopKeepalive();
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(DISCONNECT);
      this.ws?.close();
    } catch {
      /* 忽略 */
    }
    this.ws = null;
    this.state = 'closed';
    this.options.onState?.('closed');
  }
}
