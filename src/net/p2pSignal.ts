/**
 * P2P 信令编码工具（零依赖，纯静态站点可用）
 * ------------------------------------------------------------------
 * 纯静态站点（GitHub Pages）没有服务器，SDP/ICE 只能经由「带外通道」交换。
 * 本文件把「一次完整的 WebRTC 握手」压成一段可复制的文本（对战码），并提供：
 *   1. 非 trickle ICE 的等待工具（候选全部进 SDP，一次交换即可）
 *   2. gzip + base64url 编码（4~8 KB 的 SDP 压到 ~1 KB 文本）
 *   3. 房间口令派生的 AES-GCM 封装（公共 MQTT broker 上也能保密 SDP）
 * 不负责：连接建立（见 p2pTransport.ts）、MQTT 传输（见 p2pSignalMqtt.ts）。
 */

export const P2P_SIGNAL_VERSION = 1;
/** 对战码前缀，便于识别与版本演进 */
export const P2P_CODE_PREFIX = 'P2P1';

/** 手动信令的一次交换内容（offer 或 answer） */
export interface P2PSignalPayload {
  v: number;
  kind: 'offer' | 'answer';
  /** 完整 SDP（非 trickle：候选已包含在内） */
  sdp: string;
  /** 房间口令（用于 MQTT topic 与加密派生） */
  room: string;
  /** 玩家代号（可选，仅用于 UI 展示） */
  name?: string;
  /** 发送方一次性 id，防串台 */
  selfId: string;
  ts: number;
}

/** 默认 ICE 服务器：只做 STUN（探测公网地址），不中继流量 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'],
  },
];

/** Crockford Base32（去掉 I/L/O/U，避免手抄歧义） */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 纯数字房间码（便于口头/短信传递），默认 6 位 */
export function createNumericRoomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) out += String(bytes[i] % 10);
  return out;
}

export function createRoomCode(length = 12): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CROCKFORD[bytes[i] % 32];
  return out;
}

export function createSelfId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// base64url / gzip
// ============================================================

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text: string): Uint8Array {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hasCompressionStream(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ============================================================
// 对战码：P2P1-<base64url(gzip(JSON))>
// ============================================================

/** 生成可复制的对战码（一次交换：offer 或 answer） */
export async function encodeSignalCode(payload: P2PSignalPayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ ...payload, v: P2P_SIGNAL_VERSION }));
  const packed = hasCompressionStream() ? await gzip(json) : json;
  return `${P2P_CODE_PREFIX}-${bytesToBase64Url(packed)}`;
}

/** 去掉用户粘贴时带入的空白/换行/破折号噪音 */
export function normalizeSignalCode(raw: string): string {
  return raw.replace(/[\s\u00a0]+/g, '').replace(/[—–－]/g, '-').trim();
}

export async function decodeSignalCode(raw: string): Promise<P2PSignalPayload> {
  const code = normalizeSignalCode(raw);
  if (!code) throw new Error('对战码为空');
  const dash = code.indexOf('-');
  const prefix = dash >= 0 ? code.slice(0, dash) : '';
  const body = dash >= 0 ? code.slice(dash + 1) : code;
  if (prefix && prefix !== P2P_CODE_PREFIX) {
    throw new Error(`对战码版本不匹配（收到 ${prefix}，期望 ${P2P_CODE_PREFIX}）`);
  }
  const bytes = base64UrlToBytes(body);
  let jsonBytes = bytes;
  // gzip 魔数 0x1f 0x8b；不带压缩的实现也能被解出来
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (!hasCompressionStream()) throw new Error('当前浏览器不支持解压对战码（缺少 DecompressionStream）');
    jsonBytes = await gunzip(bytes);
  }
  const text = new TextDecoder().decode(jsonBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('对战码内容无法解析（可能复制不完整）');
  }
  const value = parsed as Partial<P2PSignalPayload>;
  if (!value || typeof value.sdp !== 'string' || (value.kind !== 'offer' && value.kind !== 'answer')) {
    throw new Error('对战码缺少 SDP 内容');
  }
  if (typeof value.v === 'number' && value.v > P2P_SIGNAL_VERSION) {
    throw new Error(`对战码版本过新（${value.v} > ${P2P_SIGNAL_VERSION}），请双方使用同一版本页面`);
  }
  return {
    v: value.v ?? P2P_SIGNAL_VERSION,
    kind: value.kind,
    sdp: value.sdp,
    room: value.room ?? '',
    name: value.name,
    selfId: value.selfId ?? '',
    ts: value.ts ?? 0,
  };
}

/** 展示用分组：每 group 字符插一个空格，便于肉眼核对首尾 */
export function groupSignalCode(code: string, group = 8): string {
  const head = code.slice(0, 5);
  const body = code.slice(5).replace(/-/g, '');
  return `${head}${body.match(new RegExp(`.{1,${group}}`, 'g'))?.join(' ') ?? ''}`;
}

// ============================================================
// 公共 broker 上的载荷加密（口令 → HKDF → AES-GCM）
// ============================================================

const SEAL_PREFIX = 's1';

async function deriveKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('fards-p2p-signal'),
      info: new TextEncoder().encode('signal-v1'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** 用房间口令加密信令载荷（公共 MQTT broker 上看不到 SDP） */
export async function sealSignal(secret: string, plaintext: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${SEAL_PREFIX}.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(cipher))}`;
}

export async function openSignal(secret: string, sealed: string): Promise<string> {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== SEAL_PREFIX) throw new Error('信令载荷格式不匹配');
  const key = await deriveKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(parts[1]) as unknown as BufferSource },
    key,
    base64UrlToBytes(parts[2]) as unknown as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

// ============================================================
// ICE：非 trickle 收敛
// ============================================================

/**
 * 等待 ICE 候选收集完成（把候选全部写进 SDP，做到「一次交换」）。
 * 超时也返回（已收集到的候选照样可用），由调用方自行提示。
 */
export function waitForIceGathering(
  pc: RTCPeerConnection,
  timeoutMs = 6000,
): Promise<{ complete: boolean; elapsedMs: number }> {
  const started = Date.now();
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve({ complete: true, elapsedMs: 0 });
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (complete: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve({ complete, elapsedMs: Date.now() - started });
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

/** 统计 SDP 里的候选类型，用于 UI 自检（host/srflx/relay 各几条） */
export function summarizeCandidates(sdp: string): { host: number; srflx: number; relay: number; prflx: number } {
  const count = (type: string) => (sdp.match(new RegExp(` typ ${type}(\\s|$)`, 'g')) ?? []).length;
  return { host: count('host'), srflx: count('srflx'), relay: count('relay'), prflx: count('prflx') };
}
