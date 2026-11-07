/**
 * Fards 局域网对战协议（客户端 ↔ 本地 LAN 服务器 ↔ 对端客户端）
 * ------------------------------------------------------------------
 * 拓扑：LAN 服务器只做「房间 + 消息中转 + 静态站点托管」，不跑规则引擎。
 * 规则引擎运行在 **房主（host）浏览器** 内（权威端）：
 *   - host 持有完整 GameState，接收 guest 指令 → applyCommand → 广播脱敏视图
 *   - guest 不运行引擎，只渲染 host 下发的 LanGameView，并发送指令
 * 这样既保证规则一致、又避免在服务器上跑 TS 引擎。
 */

export const LAN_PROTOCOL_VERSION = 1;

/** 卡组传输格式（与服务端/其它模块解耦的轻量结构） */
export interface LanDeckPayload {
  name: string;
  mainFaction: string;
  allyFaction: string | null;
  cards: { cardId: string; count: number }[];
}

// ============================================================
// 客户端 → 服务器
// ============================================================

export type ClientToServer =
  | { type: 'create'; name: string; protocolVersion?: number }
  | { type: 'join'; code: string; name: string; protocolVersion?: number }
  | { type: 'relay'; data: PeerMessage }
  | { type: 'leave' }
  | { type: 'ping' };

// ============================================================
// 服务器 → 客户端
// ============================================================

export interface LanRoomInfo {
  code: string;
  selfId: string;
  role: LanRole;
  peerName?: string;
}

export type LanRole = 'host' | 'guest';

export type ServerToClient =
  | ({ type: 'room' } & LanRoomInfo)
  | { type: 'peerJoin'; name: string }
  | { type: 'peerLeave'; name?: string }
  | { type: 'relay'; from: string; data: PeerMessage }
  | { type: 'error'; code: LanErrorCode; message: string }
  | { type: 'pong' }
  | { type: 'welcome'; version: number };

export type LanErrorCode =
  | 'bad_message'
  | 'room_not_found'
  | 'room_full'
  | 'already_in_room'
  | 'not_in_room'
  | 'protocol_mismatch'
  | 'rate_limited'
  | 'internal';

// ============================================================
// 对端消息（host ↔ guest，经服务器中转）
// ============================================================

/** 脱敏后的对局视图（由 host 生成，guest 渲染） */
export interface LanGameView {
  /** 观察者玩家下标（host=0，guest=1） */
  perspective: 0 | 1;
  /** 脱敏后的引擎状态（对手手牌/牌库/盖牌内容已隐藏） */
  state: import('@/engine/types').GameState;
  /** 观察者当前合法动作（host 侧计算后下发） */
  legalActions: import('@/engine/types').LegalAction[];
  /** 仅当需要观察者做选择时存在 */
  pendingChoice: import('@/engine/types').PendingChoice | null;
  /** 对局版本号（用于丢弃过期视图） */
  seq: number;
}

export type PeerMessage =
  /** guest → host：报到（名字 + 卡组） */
  | { t: 'hello'; name: string; deck: LanDeckPayload }
  /** host → guest：确认连接 + 房间信息（含双方名字） */
  | { t: 'hostInfo'; hostName: string; guestName: string }
  /** guest → host：卡组校验结果请求 / host → guest：校验结果 */
  | { t: 'deckCheck'; ok: boolean; errors: string[] }
  /** 任一方 → 对端：准备状态 */
  | { t: 'ready'; ready: boolean }
  /** host → guest：开局（seed / 先手方 / 初始视图） */
  | { t: 'start'; seed: number; firstPlayer: 0 | 1; view: LanGameView }
  /** host → guest：对局视图同步（每次状态变化） */
  | { t: 'sync'; view: LanGameView; events: import('@/engine/types').GameEvent[] }
  /** guest → host：提交一条游戏指令 */
  | { t: 'command'; cmd: import('@/engine/types').GameCommand }
  /** guest → host：提交抉择结果 */
  | { t: 'choice'; choiceId: string; selection: string[] }
  /** 任一方 → 对端：离开/投降提示 */
  | { t: 'leave'; reason?: string }
  /** 聊天/提示（可选） */
  | { t: 'toast'; text: string };

// ============================================================
// 工具：类型守卫与序列化
// ============================================================

export function isPeerMessage(value: unknown): value is PeerMessage {
  return !!value && typeof value === 'object' && typeof (value as { t?: unknown }).t === 'string';
}

export function encodeMessage(message: ClientToServer | ServerToClient | PeerMessage): string {
  return JSON.stringify(message);
}

export function decodeMessage<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 生成 4 位房间码（服务器端使用，客户端仅用于展示/复制） */
export function formatRoomCode(code: string): string {
  return code.toUpperCase();
}
