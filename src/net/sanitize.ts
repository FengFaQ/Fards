/**
 * 对局状态脱敏：host 把完整 GameState 变成“guest 可看”的视图。
 * 原则：不泄露对手手牌/牌库顺序/盖牌内容/随机种子/私密计数器。
 */
import type { CardInstance, GameState, PendingChoice, PlayerIndex } from '@/engine/types';

const HIDDEN_CARD_ID = '__hidden__';

function makeHiddenInstance(owner: PlayerIndex, index: number): CardInstance {
  return {
    instanceId: `hidden:${owner}:${index}`,
    cardId: HIDDEN_CARD_ID,
    owner,
    source: 'deck',
  };
}

/** 把某个玩家手牌/牌库替换为占位实例，并从 cards 索引里移除真实信息 */
function hideZone(state: GameState, owner: PlayerIndex, zone: 'hand' | 'deck'): void {
  const player = state.players[owner];
  const realInstances = player[zone];
  const hidden: CardInstance[] = [];
  for (let i = 0; i < realInstances.length; i++) {
    const fake = makeHiddenInstance(owner, i);
    hidden.push(fake);
  }
  // 移除真实实例（防止通过 state.cards 反查 cardId）
  for (const instance of realInstances) {
    delete state.cards[instance.instanceId];
  }
  for (const fake of hidden) {
    state.cards[fake.instanceId] = fake;
  }
  player[zone] = hidden;
}

/** 盖牌（反制）隐藏内容 */
function hideCounters(state: GameState, owner: PlayerIndex): void {
  const player = state.players[owner];
  player.counters = player.counters.map((counter, index) => {
    delete state.cards[counter.instanceId];
    const fake: CardInstance = {
      instanceId: `hidden:counter:${owner}:${index}`,
      cardId: HIDDEN_CARD_ID,
      owner,
      source: 'created',
    };
    state.cards[fake.instanceId] = fake;
    return fake;
  });
}

/**
 * 生成观察者视角的脱敏状态。
 * - 对手手牌/牌库内容、反制牌内容、随机种子、私有计数器全部隐藏
 * - 自己的手牌/牌库保持真实（渲染需要）
 * - 弃牌堆、单位、日志保持公开
 */
export function sanitizeStateFor(state: GameState, viewer: PlayerIndex): GameState {
  const clone = structuredClone(state) as GameState;
  const opponent = (viewer === 0 ? 1 : 0) as PlayerIndex;
  hideZone(clone, opponent, 'hand');
  hideZone(clone, opponent, 'deck');
  hideCounters(clone, opponent);
  clone.players[opponent].trackers = {};
  clone.players[viewer].trackers = { ...clone.players[viewer].trackers };
  // 随机种子/随机状态属于私密信息，避免被预测抽牌
  clone.seed = 0;
  clone.rngState = 0;
  // 只有轮到自己选择时才暴露必选信息
  if (clone.pendingChoice && clone.pendingChoice.player !== viewer) {
    clone.pendingChoice = null;
  }
  return clone;
}

/** 判断某个 cardId 是否为本协议中的隐藏占位 */
export function isHiddenCardId(cardId: string | undefined | null): boolean {
  return !cardId || cardId === HIDDEN_CARD_ID;
}

export const HIDDEN_CARD = HIDDEN_CARD_ID;
