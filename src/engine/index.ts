/**
 * Fards 引擎公共出口。
 * UI / AI 只需从这里 import，不要深入内部文件。
 */
export * from './types';
export { nextRandom, seedFrom, randInt, shuffleWith } from './rng';
export * from './keywords';
export * from './state';
export * from './targeting';
export * from './game';
export {
  createCtx,
  executeEffects,
  processTriggers,
  fireBoardTriggers,
  fireUnitTrigger,
  runAbility,
  dealDamage,
  healTarget,
  destroyTarget,
  destroyUnitAndTrigger,
  moveUnitToLine,
  recomputeAuras,
  resolveInt,
  resolveCondition,
  resolveEffectTargets,
  CUSTOM_HANDLERS,
  CUSTOM_CONDITIONS,
} from './effects/executor';
export type { ExecCtx, TriggerItem, CustomHandler } from './effects/executor';
