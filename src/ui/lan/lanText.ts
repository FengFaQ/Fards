/**
 * 局域网对战：文案、错误映射与静态站兜底说明
 */
import type { LanStatus } from '@/net/lanSession';

export const STATIC_HOST_TITLE = '当前是静态站点，无法建立局域网连接';

export const STATIC_HOST_STEPS = [
  '在房主电脑的项目目录运行 `npm run lan` 启动局域网服务器（默认端口 8080）',
  '终端会打印局域网地址，例如 http://192.168.1.23:8080',
  '双方用这个地址打开本站（不要用 GitHub Pages 地址），再回到本页创建 / 加入房间',
  '若打不开，请确认两台设备在同一 Wi-Fi，并放行防火墙的 8080 端口',
];

export const CONNECT_FAILED_HINT =
  '局域网对战需要房主在电脑上运行 `npm run lan`，然后用 http://房主IP:8080 打开本页。';

/** 是否运行在静态托管（GitHub Pages 等）——没有 WebSocket 服务 */
export function isStaticHosted(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host.endsWith('.github.io') || host.endsWith('.pages.dev') || host.endsWith('.netlify.app')) {
    return true;
  }
  return false;
}

/** 当前页面所在设备的局域网地址（默认端口 8080） */
export function lanShareUrl(code?: string | null): string {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname || '127.0.0.1';
  const port = window.location.port && window.location.port !== '8080' ? `:${window.location.port}` : ':8080';
  // 局域网服务默认 http；仅当当前页面就是 8080 时沿用 origin
  const origin =
    window.location.port === '8080'
      ? window.location.origin
      : `http://${host}${port}`;
  const query = code ? `?code=${encodeURIComponent(code)}` : '';
  return `${origin}/#/lan${query}`;
}

export function wsEndpointLabel(): string {
  if (typeof window === 'undefined') return '';
  try {
    const override = new URLSearchParams(window.location.search).get('ws');
    if (override) return override;
  } catch {
    /* 忽略 */
  }
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
}

export interface StatusMeta {
  zh: string;
  tone: 'idle' | 'ok' | 'warn' | 'error';
}

export function lanStatusMeta(status: LanStatus): StatusMeta {
  switch (status) {
    case 'connecting':
      return { zh: '连接中', tone: 'warn' };
    case 'in-room':
      return { zh: '已在房间', tone: 'ok' };
    case 'playing':
      return { zh: '对局中', tone: 'ok' };
    case 'closed':
      return { zh: '连接已断开', tone: 'warn' };
    case 'error':
      return { zh: '连接异常', tone: 'error' };
    case 'idle':
    default:
      return { zh: '未连接', tone: 'idle' };
  }
}

export interface LanErrorInfo {
  title: string;
  hint: string;
  retryable: boolean;
}

/** 把服务器/连接错误统一翻译成中文可操作提示（优先用 errorCode，其次解析 message） */
export function describeLanError(raw?: string | null, code?: string | null): LanErrorInfo {
  const text = (raw ?? '').trim();
  const lower = text.toLowerCase();
  const errorCode = (code ?? '').toLowerCase();

  if (errorCode === 'room_not_found') {
    return {
      title: '房间不存在或已关闭',
      hint: '请核对 4 位房间码；房间码由房主创建后显示，房主离开后房间会失效。',
      retryable: true,
    };
  }
  if (errorCode === 'room_full') {
    return {
      title: '房间已满',
      hint: '每个房间只允许两名玩家。请让房主创建新房间，或换一个房间码再加入。',
      retryable: true,
    };
  }
  if (errorCode === 'protocol_mismatch') {
    return {
      title: '协议版本不匹配',
      hint: '双方页面版本不一致。请两人都刷新页面（或重新运行 npm run lan）后再试。',
      retryable: true,
    };
  }
  if (errorCode === 'rate_limited') {
    return { title: '操作过于频繁', hint: '请稍等几秒再试。', retryable: true };
  }
  if (errorCode === 'already_in_room') {
    return { title: '你已在房间中', hint: '请先离开当前房间，再创建或加入新的房间。', retryable: true };
  }
  if (errorCode === 'not_in_room') {
    return { title: '不在房间中', hint: '房间可能已失效，请重新创建或加入房间。', retryable: true };
  }
  if (errorCode === 'bad_message' || errorCode === 'internal') {
    return { title: '服务器处理异常', hint: '请重试；若持续出现请让房主重启 npm run lan。', retryable: true };
  }

  if (!text) {
    return { title: '发生未知错误', hint: '请重试；如果反复失败，请刷新页面。', retryable: true };
  }
  if (/room_not_found|room not found|房间不存在|不存在|not found/i.test(text)) {
    return {
      title: '房间不存在或已关闭',
      hint: '请核对 4 位房间码；房间码由房主创建后显示，房主离开后房间会失效。',
      retryable: true,
    };
  }
  if (/room_full|房间已满|已满/i.test(text)) {
    return {
      title: '房间已满',
      hint: '每个房间只允许两名玩家。请让房主创建新房间，或换一个房间码再加入。',
      retryable: true,
    };
  }
  if (/protocol|协议版本|版本不一致/i.test(text)) {
    return {
      title: '协议版本不匹配',
      hint: '双方页面版本不一致。请两人都刷新页面（或重新运行 npm run lan）后再试。',
      retryable: true,
    };
  }
  if (/rate|频繁/i.test(text)) {
    return { title: '操作过于频繁', hint: '请稍等几秒再试。', retryable: true };
  }
  if (/对手.*离开|peer.*leave|leave/i.test(lower)) {
    return {
      title: '对手已离开房间',
      hint: '可以返回大厅重新创建房间，或让对手重新加入。',
      retryable: true,
    };
  }
  if (/无法连接|连接已关闭|连接异常|websocket|failed|network|timeout|超时/i.test(lower)) {
    return {
      title: '连不上局域网服务器',
      hint: CONNECT_FAILED_HINT,
      retryable: true,
    };
  }
  return { title: text, hint: '请重试；若问题持续，请刷新页面或让房主重启 npm run lan。', retryable: true };
}

/** 房间码格式：4 位字母数字，大写 */
export function normalizeRoomCode(input: string): string {
  return (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(code);
}

export const LAN_NAME_KEY = 'fards.lan.name';

const NAME_POOL = ['铁十字', '红隼', '雷霆', '北极星', '游骑兵', '黑桃'];

export function loadPlayerName(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = window.localStorage.getItem(LAN_NAME_KEY);
    if (stored && stored.trim()) return stored.trim().slice(0, 16);
  } catch {
    /* 忽略 */
  }
  const suffix = Math.floor(Math.random() * 90 + 10);
  return `${NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)]}${suffix}`;
}

export function savePlayerName(name: string): void {
  try {
    window.localStorage.setItem(LAN_NAME_KEY, name.trim().slice(0, 16));
  } catch {
    /* 忽略 */
  }
}
