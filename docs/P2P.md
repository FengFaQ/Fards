# 纯静态站点（GitHub Pages）上的 1v1 联机对战：可行性与落地方案

> 作者：P2P 联机探索者 ｜ 复核时间：2026-11-08 ｜ 关联代码：`src/net/lanSession.ts`、`src/net/protocol.ts`、`server/lan-server.mjs`、`src/ui/stores/battleStore.ts`、`src/pages/LanPage.tsx`
> 本文所有「实测」均在本机（Windows 11 / Edge 157.0.4341.42 / Node 24.22.1 / 出口 182.121.246.72）跑出来的，可用 `_work/p2p/*.mjs` 复现；未实测的地方单独标注「未实测」。

---

## 0. 一句话结论

**可行，且不必自建服务器就能玩**：现有「房主权威 + PeerMessage」协议完全不用改，只要把 WebSocket 换成本地 `RTCPeerConnection` DataChannel；静态站缺的只是「交换 SDP」这一步，用 **P0 手动对战码（两段文本，实测 ~800 字符、握手 0.2~0.5 s）** 兜底、**P1 公共 MQTT broker 自动信令（实测全流程 2.1 s）** 提升体验、**P2 可选自建/TURN** 兜住顽固 NAT，是当前投入产出比最高的组合。

---

## 1. 现状与真正的缺口

| 层 | 现状 | 静态站是否需要改 |
| --- | --- | --- |
| 规则引擎 | 房主浏览器内运行（`battleStore.lanStartHostGame`） | 否 |
| 对局协议 | `PeerMessage`（hello / hostInfo / deckCheck / ready / start / sync / command / choice / leave / toast）+ `LanGameView.seq` | 否 |
| 脱敏 | `src/net/sanitize.ts`，host 侧生成视图 | 否 |
| 传输 | `ws://<host>/ws`，LAN 服务器只做房间码 + 中继 + 静态托管 | **是（唯一缺口）** |
| 信令 | LAN 服务器顺手代劳（同一条 WS） | **是（静态站没有服务器）** |

关键判断：**「传输」和「信令」是两个问题**，不要混在一起评估。

- 传输：WebRTC DataChannel 是浏览器内置能力，**零依赖、DTLS 强制加密、可靠有序**，天然替代 WebSocket。
- 信令：只是「双方各交换一段 1 KB 以内的文本」，**SDP 在本项目极小**（无音视频轨道，实测 715~995 字节），因此「怎么把这 1 KB 送到对面」成了纯工程/产品问题，而不是技术难题。

---

## 2. 实测结论速览

### 2.1 真机 WebRTC 握手（headless Edge + CDP，跑的是仓库里的 `src/net/p2pTransport.ts`）

| 场景 | offer 码长度 | SDP 原始字节 | 握手总耗时 | 结果 |
| --- | --- | --- | --- | --- |
| 手动对战码，无 STUN | 783 字符 | 716 B | 175 ms | connected |
| 手动对战码，Google+Cloudflare STUN | 905 字符 | 995 B | 515 ms | connected，srflx×2（IPv4+IPv6） |
| 公共 MQTT 信令（载荷 AES-GCM 加密） | — | 872 B JSON | **2064 ms**（其中 1406 ms 是连 broker） | connected |

握手后可正常收发 `hello / ready / command / sync / start`，117 KB 的单次 `sync` 视图 26~27 ms 送达，往返时延（同机回环）0~1 ms。
细节见 `_work/p2p/webrtc-verify-result.json`。

### 2.2 值得注意的两个技术细节（实测数据支撑）

1. **不需要 trickle ICE**：等 `icegatheringstate === 'complete'` 把候选写进 SDP，一次交换即可完成握手（上表就是非 trickle）。代价是 offer 生成多花 130~480 ms（STUN 参与时），完全可以接受。
2. **gzip 对战码几乎不省体积（压缩比 0.91~1.10）**：因为本项目 SDP 没有音视频，只有 2~4 条 candidate。所以「对战码」约 **800 字符**，压缩只是锦上添花；真正的痛点是「要粘两次」而不是「太长」。

---

## 3. A. 四条信令路径对比

### 3.1 对比矩阵

| 维度 | A1 手动对战码 | A2 公共 MQTT broker | A3 自建极简信令 | A4 第三方托管（PeerJS Cloud / PartyKit / CF DO / Firebase） |
| --- | --- | --- | --- | --- |
| 是否需要服务器 | **否** | **否**（借公共设施） | 是（一台小机器） | 否（付费用别人的） |
| 是否需要注册/密钥 | 否 | 否（公共 broker 匿名） | 否 | PeerJS Cloud 免密钥；PartyKit/CF 需账号+API |
| 首次连通耗时（实测） | 0.2~0.5 s + 人工复制 2 次 | **2.1 s**（含连 broker） | ~1 s（局域网内） | 未实测（PeerJS 云 `/peerjs/id` 实测 200 OK） |
| 自动化程度 | 人工 | 全自动 | 全自动 | 全自动 |
| 断线重连 | 需再次人工交换 | 可自动重发/重新交换 | 可自动 | 可自动 |
| 可靠性 | **100%（只要有微信/QQ）** | 中（公共设施，无 SLA，实测 3/5 broker 可用） | 高 | 中（PeerJS 公共云经常被吐槽限流/不稳定） |
| 隐私 | **最好**（不经任何第三方） | 差（broker 可读 topic 与载荷，**已用 AES-GCM 封封装缓解**） | 看自建者 | 看厂商 |
| 长期稳定性 | 取决于产品形态 | 中（EMQX 公共 broker 已长期运营，但明确「非生产」） | 最高 | 取决于免费额度策略 |
| 与「纯静态站」冲突 | 无 | 无 | **有**（但可作为可选增强） | 无（但引入 SDK 与账号） |
| 成本 | 0 | 0 | ≥1 台机器/月 | 免费额度内 0，超出按月计费 |
| 落地工作量 | ~0.5 天（已完成 PoC） | ~1~2 天（已完成 PoC） | ~1 天（另需运维） | ~1 天 + 账号配置 |
| 推荐度 | **P0 必做** | **P1 推荐** | P2 可选 | P1 备选（PeerJS） |

### 3.2 A1 手动信令（复制粘贴 / 对战码）

**能，而且只要 2 次复制**：

```
房主：点「生成对战码」→ 复制 →（微信/QQ 发给好友）
好友：粘贴 → 点「生成回执码」→ 复制 → 发回
房主：粘贴回执 → 自动开局
```

- **需要 trickle ICE 吗？** 不需要。等 ICE 收集完成（host+srflx 全部进 SDP）后再编码，一次往返就够。若做 trickle（边收集边发 candidate），反而要多几条消息、多几次复制，得不偿失 —— 本项目是回合制卡牌，握手多 300 ms 完全无感。
- **体积**：实测 783~905 字符，`P2P1-` 前缀 + base64url，手机上一屏能看全；微信里甚至能直接点开链接（可做 `#/p2p?code=...` 深链，把「粘贴」降级为「点链接」，但**房主的回执仍需粘贴一次**，因为 WebRTC 至少要一次反向）。
- **可达性**：双方都拿 host/srflx 候选，家庭宽带（cone NAT）成功率很高；对称 NAT / 移动网络会失败（见 §5）。
- **UX 评估**：用户已经接受「创建房间 / 加入房间」，再接受「复制一条、粘一条」的门槛不高。**建议做成一个「对战码」输入框 + 一键复制**，并显示「已复制」提示，别暴露 SDP 这种概念。
- **风险**：码通过聊天软件转发 → 对方若是「半分钟内没粘」，offer 的 ICE 端口可能已过时（DTLS 未开始前一般仍可用，但 ICE consent 会随时间劣化）；建议在 UI 上标注「对战码 2 分钟内有效」。另外移动端输入框粘贴长文本容易截断，要 `normalizeSignalCode()` 去掉所有空白与破折号。

### 3.3 A2 公共信令服务（公共 MQTT / WebSocket echo / 公共 Firebase）

**实测（2026-11-08，本机 WSS 直连 + QoS0 回环 2.4 KB 载荷）**：

| 服务 | 端点 | 结果 | 备注 |
| --- | --- | --- | --- |
| EMQX 公共 broker | `wss://broker.emqx.io:8084/mqtt` | ✅ CONNACK 0，回环 373 ms | **必须带子协议 `mqtt`**，否则握手 400 |
| EMQX 公共 broker | `ws://broker.emqx.io:8083/mqtt` | ✅ 可用 | 仅 http 页面；https 页面会被混合内容拦 |
| HiveMQ 公共 broker | `wss://broker.hivemq.com:8884/mqtt` | ✅ CONNACK 0，回环 206 ms | 不带子协议也能连 |
| Mosquitto test | `wss://test.mosquitto.org:8081/mqtt` | ❌ ECONNRESET | 不稳定 |
| Eclipse IoT | `wss://mqtt.eclipseprojects.io:443/mqtt` | ❌ 握手超时 | 不可用 |
| PeerJS 公共信令云 | `https://0.peerjs.com/peerjs/id` | ✅ 200 + uuid | 免密钥，可直接服务 `peerjs` 客户端 |
| ntfy.sh | `https://ntfy.sh/v1/health` | ✅ `{"healthy":true}` | HTTP 长轮询/SSE 广播，可作备用信令（未做完整联调） |

**公共 WebSocket echo 服务**（`echo.websocket.org` / `ws.postman-echo.com` / `socketsbay`）**不适合**：它们只把消息回给发送者，没有「房间/广播」语义，除非自己在上层跑一个「谁在线」轮询协议 —— 那还不如直接用 MQTT。

**结论**：公共 MQTT 是「零部署、免密钥、能用」的最优公共通道，适合作为 P1。用 topic `fards/p2p/v1/<room>/<host|guest>` 约定房间。

风险（必须写进产品文档）：

1. **无 SLA**：EMQX/HiveMQ 明确是「公共测试用」，随时限流/改策略/关停；实测 5 个候选里 2 个已挂 → **必须做 broker 列表轮询 + 手动兜底**（这正好是 P0 存在的意义）。
2. **隐私**：topic 可枚举、载荷明文可读（SDP 里有公网 IP 与 IPv6，实测 `182.121.246.72`、`2408:8221:...`）。→ 已实现「房间口令 → HKDF → AES-GCM」封装（`sealSignal/openSignal`，实测错钥匙解密被拒），broker 只能看到密文与元数据。
3. **QoS0 会丢包**：应在 800 ms 间隔重发 3~5 次，接收端按 `selfId` + 幂等去重（PoC 里已按 `selfId` 过滤回声）。
4. **限流**：单条消息几百字节、一局只发 2~6 条，远低于任何公共 broker 的限制。
5. **Firebase**：需要项目 + 数据库配置（免费 Spark 计划有并发连接限制），作为 A4 而非 A2；`trystero` 已把它封装好，若要选第三方库可考虑。

### 3.4 A3 自建极简信令服务器

- 事实：`Ayame`（Go，WebSocket 信令，Apache-2.0，337★，2026-10 仍在更新）、`@yrzhao/aves-node`（Node 库，MIT，需 `ws` + 可选 redis/mongo）、`@colyseus/webrtc`（MIT，2★，Colyseus 作为信令服务器）都属于这一类。
- 与本项目冲突程度：**不冲突，只是「多一个部署物」**。现在的 `server/lan-server.mjs` 已经承担了「中继」，只要在里面加一个 `signal` 分支（房间 → 转发 offer/answer），局域网模式立刻升级为「跨网 P2P + 局域网内直连」。工作量约 1 天。
- 但「纯静态站」的初心是「打开网页就能玩」。**建议双模式**：默认走 A1/A2（零部署）；检测到「同源有 `/ws` 信令」时（例如用户用 `npm run lan` 打开）自动升级为 A3。这样静态站体验不退化，重度玩家/局域网内玩家拿到更低延迟。

### 3.5 A4 第三方托管

| 方案 | 成本 | 门槛 | 评价 |
| --- | --- | --- | --- |
| **PeerJS 公共云** | 免费、无 key | 零（`new Peer()` 即连 `0.peerjs.com`） | 最省事的「开箱可用信令」；但公共云长期被反馈不稳定/限流，且 `peerjs` 包 2.1 MB（未压缩）、依赖多；建议只作为 P1 备选，不作为首选 |
| **PartyKit** | 有免费额度，超出按量 | 需 GitHub 登录 + 部署 | 本质是「帮你托管一个 WS 服务器」，多一个运维对象；对一个 1v1 卡牌项目过重 |
| **Cloudflare Durable Objects** | 需 Workers 付费计划（免费额度不含 DO 的持久化配额，政策多变） | 需账号 + Wrangler 部署 | 技术最干净（WebSocket Hibernation 做信令很合适），但**引入付费与账号依赖**，与「纯静态」目标偏离最大 |
| **Firebase Realtime DB** | Spark 免费层（有并发/流量上限） | 需 Google 账号 + 项目配置 | 可用，但把「一个房间一次握手」的负载放到一个重 SDK 上不划算 |

---

## 4. 参考库逐个核实（npm + GitHub API，2026-11-08）

| # | 包 / 项目 | 版本 | 许可 | 最近发布 | TS 类型 | 体积（unpacked） | 关键事实 | 适配度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `twinwire` | 3.0.1 | MIT | 2026-11-04 | ✅ | 1.58 MB | README 明说「WebSocket 传会话 + WebRTC 传状态」，`npm i node-datachannel`（服务端）；GitHub **1★**，仓库 2026-10-25 才建 | ❌ **不适用**：它假设你有游戏服务器；且过新、无社区验证 |
| 2 | `@p2play-js/p2p-game` | 0.3.0 | MIT | 2026-06-19 | ✅ | 159 KB | 必须有 `new WebSocketSignaling(id, room, 'ws://…')` —— **自带信令服务器才跑**；19★；≤4 人 | ❌ 不适用（信令要自建），但其 API 设计值得借鉴 |
| 3 | `@carverjs/multiplayer` | 1.1.0 | MIT | 2026-09-02 | ✅ | 1.51 MB | peer 依赖 `@carverjs/core`、`@react-three/fiber`、`firebase`；信号走 MQTT 或 Firebase；绑定 CarverJS/Three | ❌ 不适用（绑框架 + 重依赖） |
| 4 | `rollback-netcode` | 0.0.6 | MIT | 2026-02-05 | ✅ | 340 KB | 帧同步/回滚，需要固定 tick 与确定性模拟；peer 依赖 `pako` | ❌ 不适用（回合制卡牌用不上，且引擎非定步长） |
| 5 | `@yrzhao/aves-node` | 1.1.0 | MIT | 2026-05-10 | ✅ | 225 KB | Node 端 WebRTC 信令服务器库；可选 redis/mongo | ⚠️ 仅 P2 自建时考虑（我们已有更轻的自绘方案） |
| 6 | `Ayame`（npm 上的 `ayame` 是 2023 年的空壳，255 B，**不是同一个东西**） | — | Apache-2.0 | 2026-10-20（GitHub） | — | Go 二进制 | 真正的 Ayame = `OpenAyame/ayame`，337★，Go 信令服务器 | ⚠️ 仅 P2；对 1v1 是重武器 |
| 7 | `@colyseus/webrtc` | 1.0.0 | MIT | 2026-03-27 | ✅ | 32 KB | 「Colyseus as a Signaling Server for WebRTC」，GitHub **2★** | ❌ 不适用（需要 Colyseus 服务器；与静态站目标相反） |
| 8 | `@geckos.io/*` | 3.1.0 | BSD-3 | 2026-03-27 | ✅ | 81 KB | UDP over WebRTC，**服务器权威**（Node 侧跑 WebRTC） | ❌ 不适用（要服务器；1487★ 但不解决本项目问题） |
| 9 | `peerjs` | 1.5.5 | MIT | 2025-06-07 | ✅ | 2.1 MB | 13.5k★；默认连公共云 `0.peerjs.com`（实测可用）；自带信令 + 连接管理 | ⚠️ **P1 备选**：省事，但重依赖 + 公共云不稳定 |
| 10 | `trystero` | 0.26.0 | MIT | 2026-10-04 | ✅ | **44 KB** | 2.8k★；`joinRoom()` 一行；策略可选 BitTorrent / Nostr（默认）/ MQTT / Supabase / Firebase / IPFS / 自建 relay；包已拆分为 `@trystero-p2p/*` 子包 | ✅ **最契合的现成库**（P1 若不想维护 MQTT 客户端就用它） |

**结论**：用户列的 7 个库里，**没有一个是「静态站 + 无需自建」的**（除了 PeerJS 公共云）。真正的候选只有：自研传输（推荐）、`trystero/mqtt`（次选）、`peerjs`（兜底）。前两个都 MIT，AGPL-3 兼容。

---

## 5. B. NAT 穿透：无 TURN 时到底能不能连

### 5.1 本机实测（同一个本地 UDP 端口打 6 个 STUN 服务器）

| STUN 服务器 | 映射结果 |
| --- | --- |
| `stun.l.google.com:19302` | 182.121.246.72:**56577** |
| `stun1.l.google.com:19302` | 182.121.246.72:**56577** |
| `stun.cloudflare.com:3478` | 182.121.246.72:**56577** |
| `global.stun.twilio.com:3478` | 182.121.246.72:**56577** |
| `stun.nextcloud.com:443` | 182.121.246.72:**56577** |
| `stun.relay.metered.ca:80` | 182.121.246.72:**56577** |

→ **端口不随目的地变化 = cone NAT（endpoint-independent mapping）**，这类网络 STUN 打洞成功率最高。

### 5.2 成功率（工程经验值，非本机实测）

| 组合 | STUN-only 成功率（经验值） | 说明 |
| --- | --- | --- |
| 双方都是 cone NAT（家庭宽带） | **~85~95%** | 本项目的主力场景 |
| 一方 cone + 一方对称 NAT / 双栈不一致 | ~30~60% | 需要 TURN |
| 双方都在移动网络（4G/5G CGNAT） | **<20%** | 强烈建议 TURN |
| 同一局域网 | **≈100%** | host candidate 直连；实测 host×2 即连上（26 ms） |
| 企业网/校园网（UDP 全禁） | 0% | 只能用 TURN over TCP/TLS 443 |

> 结论：**公共 STUN 够用，但不能只靠 STUN**。本地对战（单机双开/同 Wi-Fi）必然可连；互联网对战需要 TURN 兜底，否则会有 5~15% 的玩家「点了没反应」。

### 5.3 公共 STUN 现状（实测 6/6 存活）

`stun.l.google.com:19302`、`stun1.l.google.com:19302`、`stun.cloudflare.com:3478`、`global.stun.twilio.com:3478`、`stun.nextcloud.com:443`、`stun.relay.metered.ca:80` 全部返回 `XOR-MAPPED-ADDRESS`。`stun.nextcloud.com:443` 走 443 端口，对「只放行 443」的网络有奇效，建议默认带上。

### 5.4 免费 TURN 现状（这是本报告最需要预警的一条）

| 方案 | 实测结果 | 结论 |
| --- | --- | --- |
| **Open Relay Project（`openrelay.metered.ca`）** | DNS 解析到 **192.0.2.1**（RFC 5737 保留的 TEST-NET-1 文档地址），UDP/TCP 全部超时 | ❌ **已下线/已停用**，网上大量教程仍在推荐它 —— 不要用 |
| Metered 新版 TURN（`relay.metered.ca:80`） | TCP 80 可连（620 ms） | ⚠️ 需要到 metered.ca 后台申请 **API key** 派生短时凭据；免费额度按流量计（额度数值随时调整，**未实测**） |
| ExpressTURN（`relay1.expressturn.net:3478`） | TCP 3478 可连 | ⚠️ 需注册账号拿 username/credential；免费额度按流量（**未实测**） |
| Twilio Network Traversal（`global.turn.twilio.com:3478`） | 可连（201 ms） | 💰 付费（有试用额度） |
| Cloudflare Calls TURN（`turn.cloudflare.com:3478`） | 可连（645 ms） | 💰 需 Cloudflare 账号 + 应用凭据；有免费额度（**数值未核实**） |
| 自建 coturn | — | 唯一「长期可控」的方案；一台 1 vCPU/1 GB 的小机器 + 50~100 GB/月流量足够 1v1 卡牌（实测单次 sync 117 KB，但回合制频率低） |

> **注意**：`stun.cloudflare.com:3478` 的 TCP 探测超时属正常（它只服务 UDP）；`turn.cloudflare.com:3478` 只接受 TURN 分配请求。
> 另：任何「免费 TURN」都要读隐私条款 —— 中继意味着**你的对局流量经过第三方**（虽然 DataChannel 的 DTLS 仍是端到端加密，TURN 只能看到密文与元数据）。

### 5.5 局域网内一定可连吗？

**是（有前提）**：双方在同一广播域时，host candidate 直连（实测 26 ms 打通）。但要注意两个现代浏览器的「隐私保护」：

- 实测 SDP 里的 host candidate 是 **mDNS 混淆的 `.local` 主机名**（`7a607d87-….local`），不是真实内网 IP。同局域网靠 mDNS 解析成功；若路由/防火墙屏蔽 mDNS（部分企业网），host 候选失效，会退化到 srflx 打洞。
- 页面若部署在 **https**（GitHub Pages 是 https），WebRTC 完全可用；但 http 局域网页面也 OK（`127.0.0.1`/局域网 IP 在 Chrome 里被当作安全上下文）。**唯一硬要求：不能是 `file://` 打开**（无 secure context 时部分能力受限，且无法用 mDNS）。

---

## 6. C. 与现有协议的整合设计

### 6.1 分层：传输可替换，协议与引擎零改动

```
            ┌──────────────────────────── UI（LanPage / BattlePage） ───────────────────────────┐
            │  只认 LanSession 的形状：snapshot / onView / onCommand / sendCommand / startGame …   │
            └───────────────────────────────────┬────────────────────────────────────────────────┘
                                                │  (同一套 PeerMessage)
                    ┌───────────────────────────┴───────────────────────────┐
              LanSession（现有）                                    P2PTransport（新增）
             WebSocket → LAN 服务器中继                            RTCPeerConnection → DataChannel
                    │                                                     │
              信令：创建/加入房间（服务器代劳）                        信令：对战码 / 公共 MQTT / 自建
```

**设计原则**：`P2PTransport` 的方法名、事件名、`snapshot` 字段与 `LanSession` **逐一对应**（`P2PSnapshot extends LanSnapshot`），这样将来接进 `battleStore` 时不需要改任何一行 UI/引擎代码，只要换「拿 session 的地方」。

### 6.2 最小改动接入（建议，需要 Lead 批准改 `lanSession.ts`）

```ts
// src/net/lanSession.ts 末尾（示意，约 6 行）
let singleton: LanSession | P2PTransport | null = null;
export function setActiveSession(s: LanSession | P2PTransport | null) { singleton = s; }
export function getLanSession(): LanSession {            // 返回类型不动，避免全仓库类型连锁
  if (!singleton) singleton = new LanSession({ name: '' });
  return singleton as LanSession;
}
```

然后在 P2P 页面里 `setActiveSession(new P2PTransport({role:'host'}))`，再跳 `#/battle?mode=lan&role=host…` —— `BattlePage`/`battleStore` **一行都不用改**。
（`P2PTransport` 的收发语义已与 `LanSession` 对齐，见 §6.3；这也是本 PoC 刻意保持同名方法的原因。）

若 Lead 不想动 `lanSession.ts`，替代方案：新增 `src/net/sessionRegistry.ts`，把 `battleStore` 的 8 处 `getLanSession()` 改成 `getActiveSession()`（改动面更大，不推荐）。

### 6.3 DataChannel 语义与现有协议的映射

| 现有（WS 中转） | P2P | 说明 |
| --- | --- | --- |
| `create` / `join` + `room` 消息 | 本地生成房间号（12 位 Crockford Base32），双方各自记录 | 语义等价：有 `roomCode` 才算「在房间里」 |
| `peerJoin` / `peerLeave` | `dc.onopen` / `dc.onclose` | 客机进房 = 通道打开 |
| `relay { data: PeerMessage }` | `dc.send(JSON.stringify(PeerMessage))` | **完全不变**，仍是 JSON 文本 |
| `ping` / `pong`（服务器心跳） | DataChannel 自带 SCTP 心跳 + `connectionState`；另加应用层 `__p2p ping` 测 RTT | 实测 RTT 0~1 ms（同机） |
| 服务器错误码 `LanErrorCode` | 保留字段（`errorCode`），P2P 场景多数映射为 `internal` | UI 文案映射不动 |
| `welcome {version}` | 无（没有服务器） | 用对战码里的 `v` 字段做版本校验（`decodeSignalCode` 会拒绝更高版本） |

**通道配置**：`ordered: true`、可靠模式（默认），标签 `fards`。回合制卡牌不需要 unordered/unreliable；将来若要「拖拽/动画进度」之类高频状态，再单开一个 `{ordered:false, maxRetransmits:0}` 的通道。

**大小与背压**：实测单条 117 KB 的 `sync` 26 ms 送达。建议：一次 `sync` 控制在 **256 KB 以内**（Chrome 单消息上限的量级），并在 host 侧按 `requestAnimationFrame` 合并连续状态变化（现有 `broadcastView` 已经是「每次状态变化一次」，P1 可加 16 ms 去抖）。

**握手时序（P0 手动）**：

```
host: createDataChannel('fards') → createOffer → setLocalDescription → 等 ICE 完 → 对战码(offer)
guest: 粘贴 → setRemoteDescription(offer) → createAnswer → 等 ICE 完 → 回执码(answer)
host: 粘贴 → setRemoteDescription(answer) → ondatachannel → onopen → 状态 in-room
guest: onopen → 自动 sendHello()（与 LanSession「收到 room 消息后自动 hello」一致）
host: onHello → deckCheck → ready/start 流程完全复用
```

**断线/重连**：

- 现状（WS）：`LanSession` 有 `reconnectTimer` 字段但**并未实现自动重连**，断线即 `closed`。所以 P2P 不实现自动重连**不算退化**。
- P2P 阶段化：`connectionState === 'disconnected'` → 等 5 s 自动恢复（ICE restart 在无信令通道时无法协商）；`failed` → 提示「换网络/用局域网模式」。
- P1（有 MQTT 信令）后可做 **ICE restart 重连**：重新 `createOffer({iceRestart:true})` → 经 broker 重发 → 对局状态由 host 全量 `sync` 补回（`LanGameView.seq` 天然支持覆盖式恢复）。这是 P2P 相比 LAN 服务器的**优势**（服务器模式下客机换网必须回大厅）。

### 6.4 已实现的文件（本次 PoC）

| 文件 | 作用 | 依赖 |
| --- | --- | --- |
| `src/net/p2pSignal.ts` | 对战码编解码（gzip+base64url）、房间口令、AES-GCM 封装、ICE 收敛等待、候选统计 | 0 |
| `src/net/p2pSignalMqtt.ts` | 浏览器内最小 MQTT 3.1.1 over WSS 客户端 + 信令通道（订阅/发布/心跳/解密/去重） | 0 |
| `src/net/p2pTransport.ts` | `P2PTransport`：三阶段手动信令、DataChannel 收发、`LanSession` 同名事件与方法 | 0 |
| `src/pages/P2PTestPage.tsx` | 手动对战码 UI + MQTT 自动模式 UI + 消息自检 | react（已有） |

**没有新增任何 npm 依赖**（`package.json` 未改）。

---

## 7. D. 推荐方案与分阶段计划

### 7.1 推荐

> **自研零依赖传输层（`p2pTransport.ts`，已完成 PoC）+ 三档信令（P0 手动对战码 → P1 公共 MQTT → P2 可选自建/TURN），不引入第三方联机库。**

理由：

1. 传输需求极窄：**一条可靠有序通道 + JSON 文本**。用 twinwire/p2play/geckos 都是「为实时动作游戏设计的重型框架」，引入后要么被它绑死 lobby/权威模型，要么它的服务器假设与「静态站」冲突。
2. 协议已经被 `PeerMessage` 定义好了，`lanSession` 的方法面也很小（约 20 个方法），照抄一遍比适配别人的抽象更便宜、更可控。
3. 依赖越少，AGPL 合规与「Pages 纯静态构建」越简单（当前 bundle 新增 ~18 KB 未压缩）。
4. P0 的「对战码」不只是兜底：它同时是**最可靠的回退路径**（公共 broker 哪天挂了，产品不至于不能用），也是**局域网/无外网环境的唯一办法**。

### 7.2 分阶段计划

| 阶段 | 内容 | 验收标准 | 工作量 |
| --- | --- | --- | --- |
| **P0**（已完成 PoC） | 手动对战码：host 生成 / guest 回执 / 粘贴即连；`#/p2p` 页面；不接引擎，只做传输自检 | ① 同机两个 RTCPeerConnection 互连（**已验证**，3 个场景）② 真机双机互连（待做，需第二台机器）③ 断线提示正确 ④ `tsc/encoding/build/test` 全绿 | 0.5 天（已做完）+ 0.5 天真机验证 |
| **P1**（信令已 PoC，待接 UI） | 公共 MQTT 自动信令：房间码（6 位）→ 自动交换 SDP；broker 轮询 + 重发；载荷加密；失败时**自动降级到手输对战码** | ① 两台不同网络机器输入房间码 3 s 内进房 ② broker 全挂时提示并给手动入口 ③ 30 局成功率 ≥85% | 1~2 天 |
| **P1.5** | 接入现有大厅/对战：按 §6.2 的 6 行 diff 换 `getLanSession()`；`LanPage` 增加「互联网 P2P」入口（`?p2p=1` 隐藏，默认不显示） | ① 房主权威对局完整可玩 ② 现有 LAN 流程零回归 ③ e2e 测试（`lan-e2e.test.ts` 的 P2P 版本） | 2~3 天 |
| **P2**（可选） | 自建信令 + coturn 双模式；或 `trystero/mqtt` 替换自研信令（如果不想维护 MQTT 客户端） | ① 同一份静态构建既能零部署也能自建 ② 对称 NAT 下成功率 ≥95% | 3~5 天（含运维文档） |

### 7.3 UX 草案（对战码模式）

```
[创建房间]  →  「把这个码发给好友」  [复制]  P2P1-eyJ2IjoxLCJ...
             ↓ 好友回执
[粘贴好友的回执码] → [连接]  → 「连接成功，开始对战」
```

- 对战码框用 `textarea` + 单行省略显示（首尾各 12 字符 + `…`），点「粘贴」调用 `navigator.clipboard.readText()`（https 下可用，失败则提示手动 Ctrl+V）。
- 显示「候选：host 2 / srflx 2 / relay 0」，出问题时一眼看出是不是没拿到 srflx（= STUN 被墙）。
- 失败文案要分三档：`srflx=0 → 你的网络挡住了 UDP/STUN`、`有 srflx 但 failed → 双方 NAT 太严，需要中继`、`ICE 收集超时 → 网络慢，重试`。

---

## 8. E. 安全与合规

### 8.1 加密与隐私

| 链路 | 加密情况 | 结论 |
| --- | --- | --- |
| 对局数据（`PeerMessage`） | **DTLS-SRTP 强制加密**（WebRTC 规范，不可关闭），端到端，不经过任何服务器 | 比现在的 `ws://` 明文中继**更安全** |
| 手动对战码 | 明文，但只经「用户自己选的聊天软件」 | 可接受；码里有公网 IP，建议 UI 提示「只发给对手」 |
| 公共 MQTT 信令 | 传输 WSS 加密，但 broker 可见 topic 与载荷 | **已实现 AES-GCM 封装**（房间口令派生密钥），broker 只能看到密文 |
| TURN 中继 | 中继方只能看到 DTLS 密文 | 但**对端 IP 对 TURN 运营方可见** |
| host candidate | 浏览器默认 mDNS 混淆（实测 `.local`） | 不暴露内网 IP；但 srflx 暴露**公网 IP**（这是 P2P 的固有代价） |

**额外风险：P2P 天然对对手暴露公网 IP**（LAN 服务器模式不会）。若要彻底隐藏 IP，只能走 TURN 中继（或干脆回到服务器中转）。这一条必须在「互联网 P2P」入口的说明里写清楚 —— 这也是建议 P1.5 默认**不显式**暴露 P2P 入口的原因。

### 8.2 作弊风险

| 风险 | 现有 LAN 模式 | P2P 模式 | 说明 |
| --- | --- | --- | --- |
| 客机改状态 | 不可能（客机不跑引擎，只渲染脱敏视图） | **同样不可能** | host 权威模型不变；`sanitize.ts` 继续生效 |
| 房主作弊 | 可能（房主跑引擎，是权威） | **同样可能** | 这是既有设计问题，与传输无关；要解决只能服务器权威或加回放校验 |
| 中间人 | 无（同机/同 LAN，走内网） | 无（DTLS 指纹在 SDP 内，信令通道被劫持才能 MITM） | 公共 broker 上：房间码 = 60 bit 随机，猜中概率极低；P1 建议把 `a=fingerprint` 与房间口令绑定后再加密一层 |
| 重放/串台 | 无 | 低：`selfId` + `roomCode` 双重过滤（已实现） | |
| DoS/刷屏 | 服务器可限流 | 无服务器可限流；对手可刷 `command` | P1 在 `handleGuestCommand` 里加「每回合最多 N 条指令」的本地限流（现有代码已有部分防护，需复核） |

### 8.3 许可证兼容性（全部相对 AGPL-3.0-or-later）

| 库 | 许可 | 与 AGPL-3 兼容 | 备注 |
| --- | --- | --- | --- |
| `twinwire` / `@p2play-js/p2p-game` / `rollback-netcode` / `@yrzhao/aves-node` / `peerjs` / `trystero` / `colyseus` / `@colyseus/webrtc` | MIT | ✅ 兼容（宽松许可可并入 AGPL 作品，整体按 AGPL 分发） | 需保留版权与许可声明 |
| `Ayame` | Apache-2.0 | ✅ 兼容（GPLv3/AGPLv3 明确接受 Apache-2.0） | 需保留 NOTICE |
| `@geckos.io/*` | BSD-3-Clause | ✅ 兼容 | |
| `firebase`（Apache-2.0） | Apache-2.0 | ✅（但会把 Google 服务条款一并引入） | |
| 若出现 **GPL-3.0** 依赖 | GPL-3.0 | ⚠️ 可由 GPLv3 §13 并入 AGPLv3，但**不可反向**（AGPL 代码不能进 GPLv3 工程） | 本项目当前无 GPL 依赖 |
| 本项目自身 | AGPL-3.0-or-later | — | **§13 网络使用条款**：任何「通过网络提供服务」的部署（含自建信令服务器，如果它包含本项目代码）都必须向用户提供对应源码。仓库已公开，满足；但**不要**把 `server/lan-server.mjs` 改成闭源分发 |

**本次 PoC 未引入任何依赖**，所以上述许可结论只是「如果将来要引，怎么选」的预案。

---

## 9. 验证记录（可复现）

```powershell
# 1) 传输层单元/集成验证（真浏览器，headless Edge + CDP）
node _work/p2p/build-bundle.mjs     # 用 vite 自带的 rolldown 打包 src/net/p2p*.ts
node _work/p2p/verify-webrtc.mjs    # 三个场景：手动/无STUN、手动/有STUN、MQTT自动+加密
# → _work/p2p/webrtc-verify-result.json

# 2) 页面渲染 + 交互验证（把 P2PTestPage 单独打包，不碰主构建）
npx vite build --config _work/p2p/vite.p2p.config.mjs
node _work/p2p/verify-page.mjs      # 点「创建房间（房主）」→ 生成对战码；切 MQTT → 连 broker 订阅
# → _work/p2p/page-verify-result.json + _work/p2p/shots/*.png

# 3) 网络事实核查
node _work/p2p/stun-probe.mjs       # STUN 6/6 存活；TURN 现状
node _work/p2p/nat-type.mjs         # 同一 socket 打 6 个 STUN → cone NAT 判定
node _work/p2p/tcp-probe.mjs        # TURN/信令端点 TCP 可达性
node _work/p2p/mqtt-probe.mjs       # 5 个公共 MQTT broker 的 CONNACK/回环/时延
```

**已实测**：真浏览器 RTCPeerConnection 握手、DataChannel 承载全部 `PeerMessage` 类型、117 KB 载荷、MQTT 公共 broker 全链路、AES-GCM 封装、6 个 STUN 服务器、5 个 broker、TURN 端点可达性、PeerJS 公共云 HTTP 端点；另外 `P2PTestPage` 在真浏览器里渲染无异常、点「创建房间（房主）」成功产出 925 字符对战码、切到公共信令后成功连上 `broker.emqx.io` 并 SUBACK（`_work/p2p/page-verify-result.json`，唯一报错是临时打包没带 `public/fonts` 导致的字体 404，与页面逻辑无关）。

**未实测（需真机/双网络才能验证）**：

1. 两台**不同网络**的机器之间打洞成功率的真实分布（本文的 85~95% 是经验值）。
2. 对称 NAT / 移动网络下的失败表现与 TURN 兜底效果（本机是 cone NAT，无法构造）。
3. 公共 MQTT broker 的长期稳定性与限流阈值（只验证了当下可用）。
4. Safari / iOS 上的表现（Edge 已验；iOS 的 mDNS 与候选收集行为不同，需真机）。
5. `_work/p2p/verify-webrtc.mjs` 用的是 Edge 157 的 headless 模式，**两个 RTCPeerConnection 在同一进程内回环**；跨进程/跨机器的真实 RTT 未测。

---

## 10. 需要 Lead 决策的点

1. **是否允许 P2P 入口默认可见？** P2P 会把玩家公网 IP 暴露给对手（LAN 模式不会）。建议先做 `?p2p=1` 隐藏入口灰度。
2. **是否允许改 `src/net/lanSession.ts`（约 6 行）？** 这是「零改动接入现有对战」的关键；若不许改，就只能新增 registry 并改 `battleStore` 的 8 处调用（面更大）。
3. **是否允许新增 `src/App.tsx` 的一行路由**（`<Route path="/p2p" element={<P2PTestPage />} />`）？本次按写入范围**没有改**路由，页面当前未被挂载（详见 §11）。
4. **依赖策略**：建议维持「自研零依赖」；若不愿维护 MQTT 客户端，备选 `trystero`（MIT / 44 KB / 2.8k★），需 Lead 批准后才写入 `package.json`。
5. **P2 是否要自建 TURN**：如果要，先定「谁出机器、谁付流量」，再谈代码（代码侧只需在 `DEFAULT_ICE_SERVERS` 加一条 `turn:` 配置 + 凭据下发方式）。

---

## 11. PoC 当前状态

| 项 | 状态 |
| --- | --- |
| `src/net/p2pSignal.ts` | ✅ 完成（编码/加密/ICE 收敛） |
| `src/net/p2pSignalMqtt.ts` | ✅ 完成（最小 MQTT 客户端 + 信令通道） |
| `src/net/p2pTransport.ts` | ✅ 完成（与 `LanSession` 同名同语义） |
| `src/pages/P2PTestPage.tsx` | ✅ 完成，**未挂路由**（写入范围限制）；需要一行 `<Route path="/p2p" …>` 才能在站内访问 | 已在真浏览器渲染验证（`_work/p2p/verify-page.mjs`） |
| 真浏览器验证 | ✅ headless Edge 三场景全绿（见 §9） | 手动/无STUN、手动/有STUN、MQTT+加密 |
| 工程门禁 | ✅ `npx tsc --noEmit` / `npm run check:encoding` / `npm run build` / `npm test`（49 tests）全绿 | 无新增依赖，`package.json` 未改 |
| 接入现有大厅/对战 | ⏸ 未做（等 §10 的 2 号决策） |
| 真机双网络联机 | ⏸ 未做（需要两台机器/两条网络） |

> 备选：若想立刻在浏览器里手玩手动对战码，可以用 `_work/p2p/verify-webrtc.mjs` 的方式起一个静态页（它已经在真实浏览器里跑通全套逻辑），或等路由决策后直接打开 `#/p2p?p2p=1`。

---

## 附：已在 Lead 侧完成的接入（2026-11-08）

- 已添加路由：`#/p2p`（`src/App.tsx` 懒加载 `src/pages/P2PTestPage.tsx`），**默认不放进导航**，仅在手动输入地址 / 带 `?p2p=1` 时使用。
- 依赖策略：维持**零依赖自研**（`src/net/p2pSignal.ts` / `p2pSignalMqtt.ts` / `p2pTransport.ts`），暂不引入 trystero/peerjs。
- 未改 `lanSession.ts` 与 battleStore 的 LAN 接线；P2P 目前是独立自检页，用于验证传输层。若要把 P2P 接入真实对战，按本文 §6.2 的 transport 抽象方案推进（需 Lead 批准改动 battleStore/lanSession）。
