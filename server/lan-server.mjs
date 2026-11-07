#!/usr/bin/env node
/**
 * server/lan-server.mjs — Fards 局域网对战服务器
 * ------------------------------------------------------------------
 * 职责（只做三件事，**不跑规则引擎**）：
 *   1. 静态托管 `dist/`（SPA fallback：找不到的页面回 index.html）
 *   2. WebSocket `/ws`：房间创建/加入、对端消息中转、心跳、错误码
 *   3. `/healthz`：健康检查（版本 / 房间数 / 连接数）
 *
 * 规则引擎运行在房主浏览器里（host 权威），服务器只搬消息 —— 见 src/net/protocol.ts。
 *
 * 用法：
 *   node server/lan-server.mjs                    # 端口 8080，托管 ./dist
 *   node server/lan-server.mjs --port=9000 --dir=dist
 *   PORT=8080 LAN_DIR=dist node server/lan-server.mjs
 *   node server/lan-server.mjs --quiet            # 只打印启动横幅与错误
 *
 * 依赖：node 内置模块；WebSocket 后端优先用 `ws`（若已安装），否则用内置 RFC6455 子集实现。
 */

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { resolve, join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { attachWebSocketServer } from './lib/ws-server.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const VERSION = '1.0.0';

/* ============================================================
 * 参数
 * ============================================================ */

function parseArgs(argv) {
  const out = {
    port: Number(process.env.PORT) || 8080,
    dir: process.env.LAN_DIR || 'dist',
    host: process.env.LAN_HOST || '0.0.0.0',
    quiet: false,
    maxPayload: 256 * 1024,
    pingInterval: 30_000,
    idleTimeout: 30 * 60 * 1000,
  };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'port') out.port = Number(v);
    else if (k === 'dir') out.dir = v;
    else if (k === 'host') out.host = v;
    else if (k === 'quiet') out.quiet = true;
    else if (k === 'max-payload') out.maxPayload = Number(v);
    else if (k === 'idle-timeout') out.idleTimeout = Number(v) * 1000;
  }
  // 0 表示随机端口（测试用）
  if (!Number.isFinite(out.port) || out.port < 0 || out.port > 65535) out.port = 8080;
  return out;
}

const args = parseArgs(process.argv);
const STATIC_ROOT = resolve(ROOT, args.dir);
const STARTED_AT = Date.now();

const log = (...a) => console.log('[lan]', ...a);
const debug = (...a) => {
  if (!args.quiet) console.log('[lan]', ...a);
};

/* ============================================================
 * 静态文件
 * ============================================================ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
};

/** 这些前缀下的资源缺失要返回真 404（不能 SPA fallback，否则 JSON 请求拿到 HTML） */
const NO_FALLBACK_PREFIXES = ['/assets/', '/data/', '/cards/', '/cardbacks/', '/fonts/'];

function safeResolve(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null; // 非法编码
  }
  if (pathname.includes('\0')) return null;
  const rel = normalize(pathname).replace(/^([/\\])+/, '');
  const abs = resolve(join(STATIC_ROOT, rel));
  if (abs !== STATIC_ROOT && !abs.startsWith(STATIC_ROOT + sep)) return null; // 路径穿越
  return { abs, pathname: '/' + rel.replace(/\\/g, '/') };
}

async function sendFile(req, res, abs, pathname) {
  let st;
  try {
    st = await stat(abs);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;

  const ext = extname(abs).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': st.size,
    'cache-control': pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache, must-revalidate',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  await new Promise((done) => {
    const stream = createReadStream(abs);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
      done();
    });
    stream.on('end', done);
    stream.pipe(res);
  });
  return true;
}

async function handleStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  const target = safeResolve(req.url ?? '/');
  if (!target) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  if (target.pathname === '/healthz' || target.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(
      JSON.stringify({
        ok: true,
        name: 'fards-lan-server',
        version: VERSION,
        protocolVersion: PROTOCOL_VERSION,
        wsBackend: wss?.backend ?? 'none',
        rooms: rooms.size,
        connections: wss?.connections.size ?? 0,
        uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
        staticDir: STATIC_ROOT,
      })
    );
    return;
  }

  if (await sendFile(req, res, target.abs, target.pathname)) return;

  // 目录 → index.html
  const indexPath = join(target.abs, 'index.html');
  if (await sendFile(req, res, indexPath, target.pathname + '/index.html')) return;

  const ext = extname(target.pathname);
  const noFallback = !!ext || NO_FALLBACK_PREFIXES.some((p) => target.pathname.startsWith(p));
  if (!noFallback) {
    const appIndex = join(STATIC_ROOT, 'index.html');
    if (await sendFile(req, res, appIndex, '/index.html')) return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(noFallback ? 'Not Found' : 'Not Found（未找到 dist/index.html，请先 npm run build）');
}

/* ============================================================
 * 房间与协议
 * ============================================================ */

/** 与 src/net/protocol.ts 的 LAN_PROTOCOL_VERSION 保持一致 */
const PROTOCOL_VERSION = 1;

/** 房间码字符集：去掉 I/O/0/1 等易混字符 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

/** 单连接限流：每秒最多 30 条 */
const RATE_LIMIT_PER_SEC = 30;

/** @type {Map<string, Room>} */
const rooms = new Map();

/** @type {any} */
let wss = null;

/** @typedef {{code:string, host:any, guest:any|null, createdAt:number, lastActivity:number, hostName:string, guestName:string|null}} Room */

function newRoomCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  // 极端情况：扩容到 5 位
  return newRoomCodeLong();
}

function newRoomCodeLong() {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

function send(peer, message) {
  if (!peer?.isOpen) return false;
  return peer.send(JSON.stringify(message));
}

function sendError(peer, code, message) {
  send(peer, { type: 'error', code, message });
}

function sanitizeName(raw, fallback = '玩家') {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 24);
  return name || fallback;
}

function touchRoom(room) {
  room.lastActivity = Date.now();
}

function peerOf(room, peer) {
  return room.host === peer ? room.guest : room.host;
}

function leaveRoom(peer, { notify = true, reason } = {}) {
  const code = peer.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  peer.roomCode = null;
  peer.role = null;
  if (!room) return;

  if (room.host === peer) {
    // 房主离开 → 整房销毁
    const guest = room.guest;
    rooms.delete(code);
    debug(`房间 ${code} 销毁（房主离开）`);
    if (guest) {
      guest.roomCode = null;
      guest.role = null;
      if (notify) send(guest, { type: 'peerLeave', name: peer.name });
    }
    return;
  }

  if (room.guest === peer) {
    room.guest = null;
    room.guestName = null;
    touchRoom(room);
    debug(`房间 ${code} 客机离开（房间保留）`);
    if (notify) send(room.host, { type: 'peerLeave', name: peer.name });
    return;
  }

  // 兜底：房间成员表与连接状态不一致
  room.guest = room.guest === peer ? null : room.guest;
  room.host = room.host === peer ? null : room.host;
  if (!room.host) rooms.delete(code);
}

function checkProtocol(peer, msg) {
  const version = msg?.protocolVersion;
  if (version === undefined || version === null) return true; // 老客户端不传，按当前版本处理
  if (Number(version) !== PROTOCOL_VERSION) {
    sendError(
      peer,
      'protocol_mismatch',
      `协议版本不一致：服务器 v${PROTOCOL_VERSION}，客户端 v${version}。请让双方使用同一版本的页面（刷新重试）`
    );
    return false;
  }
  return true;
}

function handleMessage(peer, raw) {
  // ---- 限流 ----
  const now = Date.now();
  if (now - peer.rateWindowStart >= 1000) {
    peer.rateWindowStart = now;
    peer.rateCount = 0;
  }
  peer.rateCount++;
  if (peer.rateCount > RATE_LIMIT_PER_SEC) {
    if (!peer.rateWarned) {
      peer.rateWarned = true;
      sendError(peer, 'rate_limited', '消息过于频繁，请稍后再试');
    }
    return;
  }
  if (now - peer.rateWindowStart >= 1000) peer.rateWarned = false;

  // ---- 解析 ----
  if (raw.length > args.maxPayload) {
    sendError(peer, 'bad_message', '消息过大');
    return;
  }
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendError(peer, 'bad_message', '消息不是合法 JSON');
    return;
  }
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
    sendError(peer, 'bad_message', '消息缺少 type 字段');
    return;
  }

  switch (msg.type) {
    case 'create': {
      if (!checkProtocol(peer, msg)) return;
      if (peer.roomCode) {
        sendError(peer, 'already_in_room', '你已经在房间里了');
        return;
      }
      const code = newRoomCode();
      const room = {
        code,
        host: peer,
        guest: null,
        createdAt: now,
        lastActivity: now,
        hostName: sanitizeName(msg.name, '房主'),
        guestName: null,
      };
      peer.name = room.hostName;
      peer.role = 'host';
      peer.roomCode = code;
      rooms.set(code, room);
      send(peer, { type: 'room', code, selfId: peer.id, role: 'host' });
      debug(`房间 ${code} 创建（房主：${peer.name}，连接 ${peer.id}）`);
      return;
    }

    case 'join': {
      if (!checkProtocol(peer, msg)) return;
      if (peer.roomCode) {
        sendError(peer, 'already_in_room', '你已经在房间里了');
        return;
      }
      const code = String(msg.code ?? '')
        .trim()
        .toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        sendError(peer, 'room_not_found', `房间不存在：${code || '(空)'}。请确认房间码，或让房主重新创建`);
        return;
      }
      if (room.guest) {
        sendError(peer, 'room_full', '房间已满（每房 2 人）');
        return;
      }
      if (room.host === peer) {
        sendError(peer, 'already_in_room', '你是该房间的房主');
        return;
      }
      peer.name = sanitizeName(msg.name, '访客');
      peer.role = 'guest';
      peer.roomCode = code;
      room.guest = peer;
      room.guestName = peer.name;
      touchRoom(room);
      send(peer, { type: 'room', code, selfId: peer.id, role: 'guest', peerName: room.hostName });
      send(room.host, { type: 'peerJoin', name: peer.name });
      debug(`房间 ${code} 加入（访客：${peer.name}，连接 ${peer.id}）`);
      return;
    }

    case 'relay': {
      const code = peer.roomCode;
      if (!code) {
        sendError(peer, 'not_in_room', '尚未加入房间');
        return;
      }
      const room = rooms.get(code);
      if (!room) {
        sendError(peer, 'not_in_room', '房间已关闭');
        return;
      }
      const other = peerOf(room, peer);
      if (!other || !other.isOpen) {
        // 对手还没进来/已离开：静默丢弃（客户端会重发 hello，不该把 UI 打成 error）
        return;
      }
      const data = msg.data;
      if (!data || typeof data !== 'object' || typeof data.t !== 'string') {
        sendError(peer, 'bad_message', 'relay.data 必须是带 t 字段的对端消息');
        return;
      }
      touchRoom(room);
      send(other, { type: 'relay', from: peer.id, data });
      return;
    }

    case 'leave': {
      leaveRoom(peer, { notify: true });
      return;
    }

    case 'ping': {
      send(peer, { type: 'pong' });
      return;
    }

    default: {
      sendError(peer, 'bad_message', `未知消息类型：${msg.type}`);
    }
  }
}

/* ============================================================
 * WS 连接
 * ============================================================ */

function onConnection(peer) {
  peer.name = '玩家';
  peer.roomCode = null;
  peer.role = null;
  peer.rateWindowStart = Date.now();
  peer.rateCount = 0;
  peer.rateWarned = false;

  debug(`连接 ${peer.id} 接入（${peer.remote}），当前 ${wss.connections.size} 个连接`);
  send(peer, { type: 'welcome', version: PROTOCOL_VERSION });

  peer.onMessage((text) => handleMessage(peer, text));
  peer.onClose((code, reason) => {
    leaveRoom(peer, { notify: true });
    debug(`连接 ${peer.id} 断开（code=${code}${reason ? ` ${reason}` : ''}）`);
  });
}

/* ============================================================
 * 回收 / 关闭
 * ============================================================ */

const reaper = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = now - (room.lastActivity ?? room.createdAt ?? now);
    if (idle > args.idleTimeout) {
      debug(`回收空闲房间 ${code}（空闲 ${Math.round(idle / 60000)} 分钟）`);
      if (room.host) {
        room.host.roomCode = null;
        room.host.role = null;
        send(room.host, { type: 'peerLeave', name: room.guestName ?? '对手' });
      }
      if (room.guest) {
        room.guest.roomCode = null;
        room.guest.role = null;
        send(room.guest, { type: 'peerLeave', name: room.hostName });
      }
      rooms.delete(code);
    }
  }
}, 60_000);
reaper.unref?.();

async function shutdown(signal) {
  log(`收到 ${signal}，正在关闭…`);
  clearInterval(reaper);
  try {
    await wss?.close(1001, 'server shutting down');
  } catch {
    /* ignore */
  }
  for (const room of rooms.values()) {
    room.host?.terminate?.();
    room.guest?.terminate?.();
  }
  rooms.clear();
  server.close(() => {
    log('已关闭');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

/* ============================================================
 * HTTP + 启动
 * ============================================================ */

const server = http.createServer((req, res) => {
  handleStatic(req, res).catch((err) => {
    console.error('[lan] 静态服务异常:', err?.message ?? err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  });
});

server.on('clientError', (err, socket) => {
  try {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  } catch {
    /* ignore */
  }
});

/** 判断是否虚拟网卡/VPN（这些地址一般不是访客该用的，单独分组并排后面） */
const VIRTUAL_HINTS = [
  'vethernet',
  'wsl',
  'hyper-v',
  'docker',
  'vmware',
  'virtualbox',
  'vbox',
  'radmin',
  'tailscale',
  'zerotier',
  'tap-windows',
  'openvpn',
  'wireguard',
  'loopback',
  'bluetooth',
  'npcap',
];

/** 真实局域网网卡名的正向特征（优先展示） */
const PHYSICAL_HINTS = ['wlan', 'wi-fi', 'wifi', 'ethernet', '以太网', '无线', 'en0', 'eth0', 'wlp', '本地连接'];

function lanAddresses() {
  const all = [];
  const ifaces = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifaces)) {
    for (const info of list ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      const lower = name.toLowerCase();
      const virtual = VIRTUAL_HINTS.some((h) => lower.includes(h)) || /^172\.(1[7-9]|2\d|3[01])\./.test(info.address) && lower.includes('vethernet');
      const physical = PHYSICAL_HINTS.some((h) => lower.includes(h));
      const privateIp = /^192\.168\./.test(info.address) || /^10\./.test(info.address) || /^172\.(1[6-9]|2\d|3[01])\./.test(info.address);
      // 排序权重：物理网卡 + 私网地址 > 私网地址 > 其它
      const score = (physical ? 100 : 0) + (privateIp ? 50 : 0) + (virtual ? -80 : 0);
      all.push({ name, address: info.address, virtual, physical, privateIp, score });
    }
  }
  all.sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));
  return all;
}

async function main() {
  // 静态目录检查（不致命：缺 dist 时仍可用 WS 做联机测试）
  let hasIndex = true;
  try {
    await stat(join(STATIC_ROOT, 'index.html'));
  } catch {
    hasIndex = false;
  }

  wss = await attachWebSocketServer(server, {
    path: '/ws',
    maxPayload: args.maxPayload,
    pingIntervalMs: args.pingInterval,
    onConnection,
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(args.port, args.host, () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });

  const actualPort = server.address().port;
  const ips = lanAddresses();
  const recommended = ips.filter((i) => !i.virtual);
  const others = ips.filter((i) => i.virtual);
  const line = '='.repeat(64);

  console.log(line);
  console.log('  Fards 局域网对战服务器');
  console.log(line);
  console.log(`  版本      : v${VERSION}（协议 v${PROTOCOL_VERSION}，WS 后端：${wss.backend}）`);
  console.log(`  静态目录  : ${STATIC_ROOT}${hasIndex ? '' : '  ⚠ 未找到 index.html，请先 npm run build'}`);
  console.log(`  监听      : ${args.host}:${actualPort}`);
  console.log('');
  console.log('  房主把下面「局域网地址」发给访客，浏览器打开后进入 局域网对战 输入房间码：');
  if (recommended.length) {
    for (const { name, address } of recommended) {
      console.log(`    局域网  http://${address}:${actualPort}   (${name})`);
    }
  } else {
    console.log('    （未识别到物理网卡，先试下面「其它网卡」里形如 192.168.x.x 的地址）');
  }
  console.log(`    本机    http://127.0.0.1:${actualPort}`);
  if (others.length) {
    console.log('');
    console.log('  以下为虚拟网卡 / VPN（WSL、Hyper-V、Radmin、Tailscale 等，一般不用发给访客）：');
    for (const { name, address } of others) {
      console.log(`    http://${address}:${actualPort}   (${name})`);
    }
  }
  console.log('');
  console.log(`  健康检查  http://127.0.0.1:${actualPort}/healthz`);
  console.log('');
  if (ips.length === 0) {
    console.log('  ⚠ 未检测到任何局域网 IP：请确认已连接 Wi-Fi/网线，或检查防火墙/网络适配器。');
  } else {
    console.log('  提示：Windows 首次运行会弹防火墙提示，请勾选「专用网络」并允许访问（见 docs/LAN.md）。');
  }
  console.log('  按 Ctrl+C 停止服务器。');
  console.log(line);

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[lan] 启动失败:', err?.message ?? err);
  if (String(err?.code) === 'EADDRINUSE') {
    console.error(`[lan] 端口 ${args.port} 已被占用：换一个端口，例如 npm run lan -- --port=8090`);
  }
  process.exit(1);
});
