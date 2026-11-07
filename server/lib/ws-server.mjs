/**
 * server/lib/ws-server.mjs — LAN 服务器用的 WebSocket 服务端（零依赖优先）
 * ------------------------------------------------------------------
 * 为什么不是"必须装 ws"：
 *   本项目的 `npm run lan` 面向"下载即用"的普通玩家，多一个原生/网络依赖就多一层失败可能。
 *   所以这里提供一个 ~250 行的 RFC 6455 服务端子集实现（文本帧 / ping-pong / close /
 *   分片 / 掩码 / 16&64 位长度 / 背压），足够承载本协议的 JSON 文本消息；
 *   同时**如果**环境里装了 `ws`，会自动优先使用它（生产级实现，行为更完备）。
 *
 * 对外接口（与后端无关）：
 *   const wss = await attachWebSocketServer(httpServer, { path, maxPayload, pingIntervalMs, onConnection })
 *   wss.backend   // 'ws' | 'builtin'
 *   wss.connections  // Set<Peer>
 *   await wss.close(code, reason)
 *
 * Peer（统一封装）：
 *   peer.id          连接 id（短字符串）
 *   peer.remote      远端地址（ip:port）
 *   peer.send(text)  发送文本帧（超限/已关闭则丢弃）
 *   peer.close(code, reason)
 *   peer.terminate()
 *   peer.isOpen
 *   peer.onMessage(fn) / peer.onClose(fn)   // fn(text) / fn(code, reason)
 */

import crypto from 'node:crypto';

let connectionSeq = 0;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/* ============================================================
 * 1. ws 后端（若已安装）
 * ============================================================ */

async function attachWithWs(server, options, onConnection) {
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({
    server,
    path: options.path,
    maxPayload: options.maxPayload,
    // 客户端心跳由我们自己发 ping 帧；这里关掉 ws 自带的
    perMessageDeflate: false,
  });
  const connections = new Set();

  wss.on('connection', (socket, req) => {
    const id = `c${++connectionSeq}`;
    const peer = wrapWsSocket(id, socket, req);
    connections.add(peer);
    onConnection(peer);
    peer.onClose(() => connections.delete(peer));
  });

  return {
    backend: 'ws',
    connections,
    wss,
    async close(code = 1001, reason = 'server shutting down') {
      for (const peer of connections) {
        try {
          peer.close(code, reason);
        } catch {
          /* ignore */
        }
      }
      await new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

function wrapWsSocket(id, socket, req) {
  const messageHandlers = new Set();
  const closeHandlers = new Set();
  let closeInfo = null;

  const peer = {
    id,
    remote: `${req?.socket?.remoteAddress ?? '?'}:${req?.socket?.remotePort ?? 0}`,
    backend: 'ws',
    get isOpen() {
      return socket.readyState === 1; /* OPEN */
    },
    send(text) {
      if (socket.readyState !== 1) return false;
      try {
        socket.send(text, { binary: false }, () => {});
        return true;
      } catch {
        return false;
      }
    },
    close(code = 1000, reason = '') {
      try {
        socket.close(code, reason);
      } catch {
        /* ignore */
      }
    },
    /** 发一个 WebSocket ping 帧（浏览器会自动回 pong） */
    ping() {
      try {
        socket.ping();
      } catch {
        /* ignore */
      }
    },
    terminate() {
      try {
        socket.terminate();
      } catch {
        /* ignore */
      }
    },
    /** 收到任何 pong/pong 帧或消息都算"活着"；ws 后端由 ws 维护 isAlive，这里用时间戳 */
    lastSeen: Date.now(),
    onMessage(fn) {
      messageHandlers.add(fn);
      return () => messageHandlers.delete(fn);
    },
    onClose(fn) {
      closeHandlers.add(fn);
      return () => closeHandlers.delete(fn);
    },
    _fireClose(code, reason) {
      if (closeInfo) return;
      closeInfo = { code, reason };
      for (const fn of closeHandlers) {
        try {
          fn(code, reason);
        } catch {
          /* ignore */
        }
      }
    },
  };

  socket.on('message', (data, isBinary) => {
    peer.lastSeen = Date.now();
    if (isBinary) return;
    const text = typeof data === 'string' ? data : data.toString('utf8');
    for (const fn of messageHandlers) {
      try {
        fn(text);
      } catch {
        /* 单个处理器异常不影响连接 */
      }
    }
  });
  socket.on('pong', () => {
    peer.lastSeen = Date.now();
  });
  socket.on('close', (code) => peer._fireClose(code ?? 1006, ''));
  socket.on('error', () => {
    /* ws 会在 error 后触发 close；避免未捕获异常 */
  });

  return peer;
}

/* ============================================================
 * 2. 内置后端（零依赖 RFC 6455 子集）
 * ============================================================ */

const OP_CONT = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

const CLOSE_NORMAL = 1000;
const CLOSE_GOING_AWAY = 1001;
const CLOSE_PROTOCOL_ERROR = 1002;
const CLOSE_UNSUPPORTED = 1003;
const CLOSE_TOO_BIG = 1009;
const CLOSE_INTERNAL = 1011;

function attachBuiltin(server, options, onConnection) {
  const connections = new Set();
  const sockets = new Set();

  const wss = {
    backend: 'builtin',
    connections,
    handleUpgrade(req, socket, head) {
      const key = req.headers['sec-websocket-key'];
      if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
        socket.destroy();
        return;
      }
      const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
      const lines = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
      ];
      if (req.headers['sec-websocket-protocol']) {
        lines.push(`Sec-WebSocket-Protocol: ${String(req.headers['sec-websocket-protocol']).split(',')[0].trim()}`);
      }
      socket.write(lines.join('\r\n') + '\r\n\r\n');

      const id = `c${++connectionSeq}`;
      const peer = createBuiltinPeer(id, socket, req, options);
      connections.add(peer);
      sockets.add(socket);
      onConnection(peer);

      if (head && head.length) peer._feed(head);

      socket.on('data', (chunk) => peer._feed(chunk));
      socket.on('error', () => peer._destroy(CLOSE_INTERNAL, 'socket error'));
      socket.on('close', () => {
        sockets.delete(socket);
        peer._fireClose(peer._closeCode ?? 1006, peer._closeReason ?? '');
      });
      socket.setNoDelay(true);
    },
    async close(code = CLOSE_GOING_AWAY, reason = 'server shutting down') {
      for (const peer of [...connections]) {
        try {
          peer.close(code, reason);
        } catch {
          /* ignore */
        }
      }
      for (const socket of [...sockets]) {
        try {
          socket.end();
        } catch {
          /* ignore */
        }
      }
      connections.clear();
      sockets.clear();
    },
  };

  return wss;
}

function createBuiltinPeer(id, socket, req, options) {
  const messageHandlers = new Set();
  const closeHandlers = new Set();
  let buffer = Buffer.alloc(0);
  let fragments = null; /* { opcode, parts:[Buffer], size } */
  let closed = false;
  let closeCode;
  let closeReason;
  const sendQueue = [];
  let writing = false;

  const peer = {
    id,
    remote: `${req.socket.remoteAddress ?? '?'}:${req.socket.remotePort ?? 0}`,
    backend: 'builtin',
    lastSeen: Date.now(),
    get isOpen() {
      return !closed && !socket.destroyed;
    },
    send(text) {
      if (!peer.isOpen) return false;
      const frame = encodeFrame(OP_TEXT, Buffer.from(String(text), 'utf8'));
      if (frame.length > options.maxPayload + 64) return false;
      enqueue(frame);
      return true;
    },
    close(code = CLOSE_NORMAL, reason = '') {
      if (closed) return;
      closed = true;
      closeCode = code;
      closeReason = reason;
      try {
        socket.write(encodeFrame(OP_CLOSE, encodeClosePayload(code, reason)));
      } catch {
        /* ignore */
      }
      try {
        socket.end();
      } catch {
        /* ignore */
      }
    },
    terminate() {
      peer._destroy(CLOSE_GOING_AWAY, 'terminated');
    },
    /** 发一个 WebSocket ping 帧 */
    ping() {
      if (peer.isOpen) enqueue(encodeFrame(OP_PING, Buffer.alloc(0)));
    },
    onMessage(fn) {
      messageHandlers.add(fn);
      return () => messageHandlers.delete(fn);
    },
    onClose(fn) {
      closeHandlers.add(fn);
      return () => closeHandlers.delete(fn);
    },

    /* ---------------- 内部 ---------------- */

    _fireClose(code, reason) {
      if (peer._firedClose) return;
      peer._firedClose = true;
      for (const fn of closeHandlers) {
        try {
          fn(code, reason);
        } catch {
          /* ignore */
        }
      }
    },
    _destroy(code, reason) {
      closeCode = code;
      closeReason = reason;
      closed = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    },
    _emitMessage(text) {
      peer.lastSeen = Date.now();
      for (const fn of messageHandlers) {
        try {
          fn(text);
        } catch {
          /* ignore */
        }
      }
    },
    _feed(chunk) {
      if (closed) return;
      peer.lastSeen = Date.now();
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      try {
        while (parseOneFrame()) {
          /* 继续解析下一帧 */
        }
      } catch (err) {
        peer._destroy(CLOSE_PROTOCOL_ERROR, String(err?.message ?? err));
      }
    },
  };

  /* ---- 发送：带背压的队列 ---- */
  function enqueue(frame) {
    if (closed || socket.destroyed) return;
    sendQueue.push(frame);
    flush();
  }

  function flush() {
    if (writing || closed) return;
    while (sendQueue.length) {
      const frame = sendQueue.shift();
      const ok = socket.write(frame);
      if (!ok) {
        writing = true;
        socket.once('drain', () => {
          writing = false;
          flush();
        });
        return;
      }
    }
  }

  /* ---- 帧解析（返回是否消费了一帧） ---- */
  function parseOneFrame() {
    if (buffer.length < 2) return false;
    const b0 = buffer[0];
    const b1 = buffer[1];
    const fin = (b0 & 0x80) !== 0;
    const rsv = b0 & 0x70;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let payloadLen = b1 & 0x7f;
    let offset = 2;

    if (rsv !== 0) throw new Error('RSV 位非零（不支持扩展）');
    if (!masked) throw new Error('客户端帧必须带掩码');

    if (payloadLen === 126) {
      if (buffer.length < offset + 2) return false;
      payloadLen = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      if (buffer.length < offset + 8) return false;
      const big = buffer.readBigUInt64BE(offset);
      if (big > BigInt(options.maxPayload)) throw new Error(`帧过大：${big}`);
      payloadLen = Number(big);
      offset += 8;
    }

    const maskKey = buffer.subarray(offset, offset + 4);
    if (maskKey.length < 4) return false;
    offset += 4;

    if (payloadLen > options.maxPayload) throw new Error(`帧过大：${payloadLen} > ${options.maxPayload}`);
    if (buffer.length < offset + payloadLen) return false;

    const payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
    for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3];
    buffer = buffer.subarray(offset + payloadLen);

    // 控制帧不可分片、长度 ≤125
    if (opcode >= 0x8) {
      if (!fin) throw new Error('控制帧不可分片');
      if (payload.length > 125) throw new Error('控制帧载荷过长');
      if (opcode === OP_CLOSE) {
        const { code, reason } = decodeClosePayload(payload);
        peer._closeCode = code ?? CLOSE_NORMAL;
        peer._closeReason = reason;
        peer.close(code ?? CLOSE_NORMAL, reason);
        return false;
      }
      if (opcode === OP_PING) {
        enqueue(encodeFrame(OP_PONG, payload));
        return true;
      }
      if (opcode === OP_PONG) {
        peer.lastSeen = Date.now();
        return true;
      }
      throw new Error(`未知控制帧 opcode=${opcode}`);
    }

    // 数据帧
    if (opcode === OP_BINARY) throw new Error('本协议只接受文本帧');

    if (fragments) {
      if (opcode !== OP_CONT) throw new Error('分片未结束却收到新的数据帧');
      fragments.parts.push(payload);
      fragments.size += payload.length;
      if (fragments.size > options.maxPayload) throw new Error(`分片消息过大：${fragments.size}`);
      if (fin) {
        const full = Buffer.concat(fragments.parts);
        fragments = null;
        peer._emitMessage(full.toString('utf8'));
      }
      return true;
    }

    if (opcode === OP_TEXT) {
      if (fin) {
        peer._emitMessage(payload.toString('utf8'));
      } else {
        fragments = { opcode, parts: [payload], size: payload.length };
      }
      return true;
    }
    if (opcode === OP_CONT) throw new Error('孤立的续帧');
    throw new Error(`不支持的数据帧 opcode=${opcode}`);
  }

  return peer;
}

/* ---- 帧编解码工具 ---- */

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode; // FIN=1，服务端不掩码
  return Buffer.concat([header, payload]);
}

function encodeClosePayload(code, reason) {
  const reasonBuf = Buffer.from(String(reason ?? '').slice(0, 120), 'utf8');
  const payload = Buffer.alloc(2 + reasonBuf.length);
  payload.writeUInt16BE(code, 0);
  reasonBuf.copy(payload, 2);
  return payload;
}

function decodeClosePayload(payload) {
  if (payload.length < 2) return { code: CLOSE_NORMAL, reason: '' };
  const code = payload.readUInt16BE(0);
  const reason = payload.subarray(2).toString('utf8');
  return { code, reason };
}

/* ============================================================
 * 3. 统一入口
 * ============================================================ */

/**
 * 给 http.Server 挂上 WebSocket 端点。
 * 会自动尝试 `ws` 包；未安装时回退到内置实现。
 *
 * @param {import('node:http').Server} httpServer
 * @param {{ path?: string, maxPayload?: number, pingIntervalMs?: number, onConnection: (peer:any)=>void }} options
 */
export async function attachWebSocketServer(httpServer, options) {
  const opts = {
    path: '/ws',
    maxPayload: 256 * 1024,
    pingIntervalMs: 30_000,
    // 后端选择：auto（默认，优先 ws）| ws | builtin
    backend: process.env.LAN_WS_BACKEND || 'auto',
    ...options,
  };

  let backend = null;
  if (opts.backend !== 'builtin') {
    try {
      backend = await attachWithWs(httpServer, opts, (peer) => opts.onConnection(peer));
    } catch {
      backend = null;
    }
  }

  if (!backend) {
    backend = attachBuiltin(httpServer, opts, (peer) => opts.onConnection(peer));
    httpServer.on('upgrade', (req, socket, head) => {
      let pathname = '/';
      try {
        pathname = new URL(req.url, 'http://lan.local').pathname;
      } catch {
        pathname = '/';
      }
      if (pathname !== opts.path) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      backend.handleUpgrade(req, socket, head);
    });
  }

  // 服务端心跳：定期发 ping 帧，长时间无任何回应的连接直接终止（防"幽灵连接"占房）
  const timer = setInterval(() => {
    const now = Date.now();
    for (const peer of [...backend.connections]) {
      if (now - peer.lastSeen > opts.pingIntervalMs * 3) {
        try {
          peer.terminate();
        } catch {
          /* ignore */
        }
        continue;
      }
      try {
        peer.ping?.();
      } catch {
        /* ignore */
      }
    }
  }, opts.pingIntervalMs);
  timer.unref?.();

  const originalClose = backend.close.bind(backend);
  return {
    backend: backend.backend,
    connections: backend.connections,
    path: opts.path,
    async close(code, reason) {
      clearInterval(timer);
      await originalClose(code, reason);
    },
  };
}
