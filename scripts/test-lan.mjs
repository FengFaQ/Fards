#!/usr/bin/env node
/**
 * test-lan.mjs — 局域网对战服务器的自包含 e2e 测试（零依赖）
 * ------------------------------------------------------------------
 * 流程：拉起 `server/lan-server.mjs` 子进程 → 用 Node 内置的 WebSocket 客户端模拟
 *       房主 A / 访客 B / 捣乱者 C，走完「建房 → 加入 → 互发 relay → 大消息 →
 *       心跳 → 协议版本错误 → 限流 → 断线清理 → 房主断开销毁房间」全链路。
 *
 * 用法：
 *   node scripts/test-lan.mjs            # 用 dist/ 做静态检查（若存在）
 *   node scripts/test-lan.mjs --port=18080 --verbose
 *   node scripts/test-lan.mjs --url=http://127.0.0.1:8080   # 测已在跑的服务器
 *
 * 退出码：0 全通过；1 有失败。
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/* ------------------------------------------------------------------ args */

function parseArgs(argv) {
  const o = { port: 0, startPort: 18080, verbose: false, url: '', timeout: 12000 };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'port') o.port = Number(v);
    else if (k === 'start-port') o.startPort = Number(v);
    else if (k === 'verbose') o.verbose = true;
    else if (k === 'url') o.url = v;
    else if (k === 'timeout') o.timeout = Number(v);
  }
  return o;
}
const opt = parseArgs(process.argv);

const t0 = Date.now();
const el = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const log = (...a) => console.log(`[test-lan ${el()}]`, ...a);

let failures = 0;
let checks = 0;
function check(name, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ✓ ${name}${detail ? `  ${detail}` : ''}`);
    return true;
  }
  failures++;
  console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`);
  return false;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ HTTP */

async function healthz(baseUrl, timeoutMs = 1500) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(new URL('/healthz', baseUrl), { signal: ac.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function httpGet(baseUrl, path) {
  const res = await fetch(new URL(path, baseUrl));
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', text };
}

/* ------------------------------------------------------------------ 客户端 */

class TestClient {
  constructor(label) {
    this.label = label;
    this.ws = null;
    this.messages = []; // 所有收到的服务端消息（顺序）
    this.waiters = [];
    this.closed = false;
    this.closeInfo = null;
  }

  async connect(url) {
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      msg.__at = Date.now();
      this.messages.push(msg);
      if (opt.verbose) log(`  ${this.label} ← ${JSON.stringify(msg).slice(0, 160)}`);
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(msg)) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          clearTimeout(waiter.timer);
          waiter.resolve(msg);
        }
      }
    });
    ws.addEventListener('close', (ev) => {
      this.closed = true;
      this.closeInfo = { code: ev.code, reason: ev.reason };
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate({ __closed: true })) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          clearTimeout(waiter.timer);
          waiter.resolve({ __closed: true });
        }
      }
    });
    ws.addEventListener('error', () => {
      /* close 事件会跟上 */
    });
    await new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => rejectPromise(new Error(`${this.label} 连接超时`)), opt.timeout);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolvePromise();
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        rejectPromise(new Error(`${this.label} 连接失败`));
      });
    });
    return this;
  }

  send(message) {
    if (!this.ws || this.ws.readyState !== 1) throw new Error(`${this.label} 未连接`);
    const text = JSON.stringify(message);
    this.ws.send(text);
    if (opt.verbose) log(`  ${this.label} → ${text.slice(0, 160)}`);
  }

  /** 等待一条满足条件的服务端消息（含已经收到过的） */
  waitFor(label, predicate, timeoutMs = opt.timeout) {
    const found = this.messages.find((m) => predicate(m));
    if (found) return Promise.resolve(found);
    return new Promise((resolvePromise, rejectPromise) => {
      const waiter = {
        predicate,
        resolve: resolvePromise,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          rejectPromise(new Error(`${this.label} 等到 ${label} 超时；已收到：${JSON.stringify(this.messages.map((m) => m.type)).slice(0, 300)}`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  waitType(type, timeoutMs) {
    return this.waitFor(`type=${type}`, (m) => m.type === type, timeoutMs);
  }

  clear() {
    this.messages = [];
  }

  close(code = 1000) {
    try {
      this.ws?.close(code);
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ 服务器进程 */

let serverProc = null;
let baseUrl = '';
let wsUrl = '';

async function startServer() {
  if (opt.url) {
    baseUrl = opt.url.replace(/\/$/, '');
    wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
    const health = await healthz(baseUrl, 3000);
    if (!health) throw new Error(`--url ${baseUrl} 不是可用的 lan-server（/healthz 不通）`);
    log(`使用已有服务器 ${baseUrl}（v${health.version}，WS ${health.wsBackend}）`);
    return { external: true, health };
  }

  const candidates = opt.port ? [opt.port] : Array.from({ length: 10 }, (_, i) => opt.startPort + i);
  for (const port of candidates) {
    baseUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
    const proc = spawn(process.execPath, [resolve(ROOT, 'server/lan-server.mjs'), `--port=${port}`, '--quiet'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    const out = [];
    proc.stdout.on('data', (d) => out.push(d.toString('utf8')));
    proc.stderr.on('data', (d) => out.push(d.toString('utf8')));

    let health = null;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      await sleep(120);
      health = await healthz(baseUrl);
      if (health) break;
      if (proc.exitCode !== null) break;
    }
    if (health) {
      serverProc = proc;
      log(`lan-server 已启动：${baseUrl}（pid=${proc.pid}，WS 后端 ${health.wsBackend}，静态目录 ${health.staticDir}）`);
      return { external: false, health, output: out };
    }
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    await sleep(150);
  }
  throw new Error('无法启动 lan-server（端口均被占用？）');
}

function stopServer() {
  if (!serverProc) return;
  try {
    serverProc.kill('SIGINT');
  } catch {
    /* ignore */
  }
  serverProc = null;
}

/* ------------------------------------------------------------------ 主流程 */

async function main() {
  console.log('='.repeat(72));
  console.log('Fards 局域网对战服务器 — e2e 测试');
  console.log('='.repeat(72));

  const { health } = await startServer();
  check('服务器 /healthz 可用', !!health?.ok, `version=${health?.version} protocol=${health?.protocolVersion} backend=${health?.wsBackend}`);

  /* ---------------- 静态站点 ---------------- */
  log('① 静态站点');
  const hasDist = existsSync(resolve(ROOT, 'dist/index.html'));
  const root = await httpGet(baseUrl, '/');
  if (hasDist) {
    check('GET / 返回 index.html', root.status === 200 && /text\/html/.test(root.contentType), `HTTP ${root.status}`);
    const spa = await httpGet(baseUrl, '/lan/some/deep/route');
    check('SPA fallback 返回 index.html', spa.status === 200 && /text\/html/.test(spa.contentType), `HTTP ${spa.status}`);
    const data = await httpGet(baseUrl, '/data/cards.json');
    check(
      'GET /data/cards.json 返回 JSON（不会被 SPA fallback 吞掉）',
      data.status === 200 && /application\/json/.test(data.contentType),
      `HTTP ${data.status} ${data.contentType}`
    );
    const missing = await httpGet(baseUrl, '/data/__not_exist__.json');
    check('缺失的 /data/* 返回 404', missing.status === 404, `HTTP ${missing.status}`);
  } else {
    check('dist/ 不存在时静态服务降级为 404（不做 SPA fallback 误判）', root.status === 404, `HTTP ${root.status}`);
  }
  const traversal = await fetch(new URL('/..%2f..%2fpackage.json', baseUrl)).then((r) => r.status);
  check('路径穿越被拦截', traversal === 400 || traversal === 404, `HTTP ${traversal}`);

  /* ---------------- 建房 / 加入 ---------------- */
  log('② 建房与加入');
  const host = await new TestClient('A(host)').connect(wsUrl);
  const welcome = await host.waitType('welcome');
  check('连接后收到 welcome', welcome.type === 'welcome' && welcome.version === 1, `version=${welcome.version}`);

  host.send({ type: 'create', name: '房主小明', protocolVersion: 1 });
  const roomMsg = await host.waitType('room');
  check('create 返回 room(role=host)', roomMsg.role === 'host' && !!roomMsg.selfId, `code=${roomMsg.code} selfId=${roomMsg.selfId}`);
  check('房间码为 4 位、且不含易混字符 I/O/0/1', /^[A-HJ-NP-Z2-9]{4}$/.test(roomMsg.code), roomMsg.code);

  const guest = await new TestClient('B(guest)').connect(wsUrl);
  await guest.waitType('welcome');

  guest.send({ type: 'join', code: 'ZZZZ', name: '访客小红', protocolVersion: 1 });
  const notFound = await guest.waitFor('error room_not_found', (m) => m.type === 'error' && m.code === 'room_not_found');
  check('加入不存在的房间 → room_not_found', !!notFound, notFound.message.slice(0, 40) + '…');

  host.clear();
  guest.clear();
  guest.send({ type: 'join', code: roomMsg.code.toLowerCase(), name: '访客小红', protocolVersion: 1 });
  const guestRoom = await guest.waitType('room');
  check('join 成功（房间码大小写不敏感）', guestRoom.role === 'guest' && guestRoom.code === roomMsg.code, `code=${guestRoom.code}`);
  check('访客拿到房主名字', guestRoom.peerName === '房主小明', String(guestRoom.peerName));
  const peerJoin = await host.waitType('peerJoin');
  check('房主收到 peerJoin', peerJoin.name === '访客小红', peerJoin.name);

  /* ---------------- 满员 ---------------- */
  log('③ 房间满员');
  const third = await new TestClient('C(third)').connect(wsUrl);
  await third.waitType('welcome');
  third.send({ type: 'join', code: roomMsg.code, name: '第三者', protocolVersion: 1 });
  const full = await third.waitFor('error room_full', (m) => m.type === 'error' && m.code === 'room_full');
  check('第三人加入 → room_full', !!full, full.message);

  /* ---------------- relay ---------------- */
  log('④ 消息中转（host ↔ guest）');
  host.clear();
  host.send({
    type: 'relay',
    data: { t: 'hello', name: '访客小红', deck: { name: '测试卡组', mainFaction: 'USA', allyFaction: 'Germany', cards: [{ cardId: 'blitz_doctrine', count: 2 }] } },
  });
  // 注：协议里 hello 是 guest→host，这里故意反向发一条，验证中继不关心方向
  const relayToGuest = await guest.waitFor('relay', (m) => m.type === 'relay');
  check('host → guest relay 送达', relayToGuest.data?.t === 'hello' && relayToGuest.from === roomMsg.selfId, `from=${relayToGuest.from}`);

  guest.clear();
  guest.send({ type: 'relay', data: { t: 'command', cmd: { type: 'endTurn', player: 1 } } });
  const relayToHost = await host.waitFor('relay', (m) => m.type === 'relay');
  check('guest → host relay 送达', relayToHost.data?.t === 'command' && relayToHost.from === guestRoom.selfId, `from=${relayToHost.from}`);

  // 大消息（接近 256KB 上限）验证分片/长度处理
  const bigText = 'x'.repeat(120 * 1024);
  guest.clear();
  guest.send({ type: 'relay', data: { t: 'sync', view: { perspective: 1, state: { log: [{ id: 1, turn: 1, player: 0, kind: 'info', text: bigText }] } }, events: [] } });
  const bigRelay = await guest.waitFor('noop', () => false, 50).catch(() => null); // 占位，避免误判
  void bigRelay;
  const receivedBig = await host.waitFor('大 relay', (m) => m.type === 'relay' && m.data?.t === 'sync', 8000);
  check(
    '120KB 大消息完整送达（扩展长度帧）',
    receivedBig.data.view.state.log[0].text.length === bigText.length,
    `${receivedBig.data.view.state.log[0].text.length} 字符`
  );

  /* ---------------- 心跳 ---------------- */
  log('⑤ 心跳');
  guest.clear();
  guest.send({ type: 'ping' });
  const pong = await guest.waitType('pong');
  check('ping → pong', pong.type === 'pong');

  /* ---------------- 协议版本 ---------------- */
  log('⑥ 协议版本与错误处理');
  const mismatch = await new TestClient('D(mismatch)').connect(wsUrl);
  await mismatch.waitType('welcome');
  mismatch.send({ type: 'create', name: '旧版本', protocolVersion: 999 });
  const mismatchErr = await mismatch.waitFor('error protocol_mismatch', (m) => m.type === 'error' && m.code === 'protocol_mismatch');
  check('协议版本不符 → protocol_mismatch', !!mismatchErr, mismatchErr.message.slice(0, 36) + '…');
  mismatch.send({ type: 'not-a-real-type' });
  const badMsg = await mismatch.waitFor('error bad_message', (m) => m.type === 'error' && m.code === 'bad_message');
  check('未知消息类型 → bad_message', !!badMsg, badMsg.message.slice(0, 30));
  mismatch.send({ type: 'relay', data: { t: 'toast', text: 'hi' } });
  const notInRoom = await mismatch.waitFor('error not_in_room', (m) => m.type === 'error' && m.code === 'not_in_room');
  check('未进房就 relay → not_in_room', !!notInRoom);
  mismatch.close();

  /* ---------------- 限流 ---------------- */
  log('⑦ 限流');
  const flooder = await new TestClient('E(flood)').connect(wsUrl);
  await flooder.waitType('welcome');
  for (let i = 0; i < 80; i++) flooder.send({ type: 'ping' });
  const limited = await flooder
    .waitFor('error rate_limited', (m) => m.type === 'error' && m.code === 'rate_limited', 5000)
    .catch(() => null);
  check('每秒 >30 条 → rate_limited', !!limited);
  flooder.close();

  /* ---------------- 断线清理 ---------------- */
  log('⑧ 断线清理');
  host.clear();
  guest.close();
  const peerLeave = await host.waitFor('peerLeave', (m) => m.type === 'peerLeave', 8000);
  check('访客断开 → 房主收到 peerLeave', !!peerLeave, `name=${peerLeave.name ?? '(空)'}`);

  const healthAfterGuestLeave = await healthz(baseUrl);
  check('访客离开后房间保留（房主还在）', healthAfterGuestLeave.rooms === 1, `rooms=${healthAfterGuestLeave.rooms}`);

  // 房主断开 → 整房销毁
  const guest2 = await new TestClient('B2(guest)').connect(wsUrl);
  await guest2.waitType('welcome');
  guest2.send({ type: 'join', code: roomMsg.code, name: '访客二号', protocolVersion: 1 });
  const guest2Room = await guest2.waitType('room');
  check('空出的房间可被再次加入', guest2Room.role === 'guest');

  guest2.clear();
  host.close();
  const leaveForGuest = await guest2.waitFor('peerLeave（房主断开）', (m) => m.type === 'peerLeave', 8000);
  check('房主断开 → 客机收到 peerLeave（整房销毁）', !!leaveForGuest, `name=${leaveForGuest.name ?? '(空)'}`);

  await sleep(300);
  const healthAfterHostLeave = await healthz(baseUrl);
  check('房主断开后房间被回收', healthAfterHostLeave.rooms === 0, `rooms=${healthAfterHostLeave.rooms}`);

  guest2.send({ type: 'join', code: roomMsg.code, name: 'x', protocolVersion: 1 });
  const gone = await guest2.waitFor('room_not_found', (m) => m.type === 'error' && m.code === 'room_not_found');
  check('已销毁的房间不可加入', !!gone);

  guest2.close();
  third.close();

  /* ---------------- 汇总 ---------------- */
  console.log('');
  console.log('='.repeat(72));
  if (failures === 0) {
    console.log(`✓ 全部通过：${checks} 项检查`);
  } else {
    console.log(`✗ 失败 ${failures} 项 / 共 ${checks} 项`);
  }
  console.log('='.repeat(72));
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(`\n[test-lan] 测试异常：${err?.stack ?? err}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sleep(100);
    stopServer();
  });
