/**
 * 局域网大厅 → 对战页 的交接缓存
 * ------------------------------------------------------------------
 * battle-forge 的 BattlePage 在 `#/battle?mode=lan&role=host|guest` 时读取本缓存：
 * 大厅在跳转前写入双方卡组（LanDeckPayload），对战页自取所需。
 */
import type { LanDeckPayload, LanRole } from '@/net/protocol';

export interface LanHandoff {
  role: LanRole;
  selfName: string;
  peerName: string | null;
  selfDeck: LanDeckPayload | null;
  peerDeck: LanDeckPayload | null;
  createdAt: number;
}

let handoff: LanHandoff | null = null;

export function setLanHandoff(next: Omit<LanHandoff, 'createdAt'>): void {
  handoff = { ...next, createdAt: Date.now() };
}

export function readLanHandoff(): LanHandoff | null {
  return handoff;
}

export function clearLanHandoff(): void {
  handoff = null;
}
