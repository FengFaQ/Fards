/**
 * 合法动作过滤（表现层补丁）
 * ------------------------------------------------------------------
 * 引擎的 legalActions 没有过滤「反制牌造成的临时限制」：
 *   players[x].trackers['restrict:deploy:untilTurn'] / 'restrict:attack:untilTurn'
 * 命中时 applyCommand 会静默拒绝，但 UI 仍会把卡/单位高亮成可选。
 * 这里在 UI 侧先把这类动作剔除，避免“点了没反应”。
 * （根因已在 targeting.ts 待修；修好后本文件可退化为纯 re-export。）
 */
import { legalActions } from '@/engine';
import type { EngineRegistry, GameState, LegalAction, PlayerIndex } from '@/engine/types';

const ORDER_TYPES = new Set(['order', 'countermeasure']);

/** 当前是否被反制限制了部署 / 攻击 */
export function restrictionsOf(state: GameState, player: PlayerIndex): { deploy: boolean; attack: boolean } {
  const trackers = state.players[player].trackers;
  const turn = state.turn;
  return {
    deploy: (trackers['restrict:deploy:untilTurn'] ?? 0) >= turn,
    attack: (trackers['restrict:attack:untilTurn'] ?? 0) >= turn,
  };
}

/** 过滤掉会被引擎静默拒绝的动作 */
export function visibleLegalActions(
  state: GameState,
  reg: EngineRegistry,
  player: PlayerIndex,
): LegalAction[] {
  const actions = legalActions(state, reg, player);
  const { deploy, attack } = restrictionsOf(state, player);
  if (!deploy && !attack) return actions;
  return actions.filter((action) => {
    if (attack && action.kind === 'attack') return false;
    if (deploy && action.kind === 'playCard') {
      const instance = action.cardInstanceId ? state.cards[action.cardInstanceId] : undefined;
      const def = instance ? reg.cardDefs[instance.cardId] : undefined;
      // 只有单位卡受“无法部署”限制，指令照常结算
      if (def && !ORDER_TYPES.has(def.type)) return false;
    }
    return true;
  });
}
