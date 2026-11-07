/**
 * 挂起选择的弹窗：引擎出现 pendingChoice 时必须由玩家决策，否则对局无法推进。
 * 目前引擎主要产出 mode='option'（抉择分支）；unit/card 模式也做兼容。
 */
import { useBattleStore } from '../stores/battleStore';
import Dialog from '../components/Dialog';
import CardFace from './CardFace';
import { IconInfo } from '../components/icons';

export function ChoiceDialog() {
  const choice = useBattleStore((state) => state.state?.pendingChoice ?? null);
  const state = useBattleStore((state) => state.state);
  const byId = useBattleStore((state) => state.byId);
  const resolve = useBattleStore((state) => state.resolveChoiceWith);

  if (!choice || choice.player !== 0 || !state) return null;

  const options = (choice.options ?? []).filter((option) => !option.disabled);
  const unitCandidates = (choice.unitCandidates ?? [])
    .map((unitId) => state.units[unitId])
    .filter(Boolean);
  const cardCandidates = (choice.cardCandidates ?? [])
    .map((instanceId) => state.cards[instanceId])
    .filter(Boolean);

  return (
    <Dialog
      open
      onClose={() => undefined}
      eyebrow="战术抉择"
      title={choice.prompt || '请选择'}
      width="md"
      footer={
        choice.optional ? (
          <div className="flex justify-end">
            <button type="button" className="fards-btn fards-btn-ghost" onClick={() => resolve([])}>
              跳过
            </button>
          </div>
        ) : (
          <p className="font-body text-[10px] tracking-[0.14em] text-field-500">
            必须做出选择才能继续结算
          </p>
        )
      }
    >
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-sm border border-brass-600/30 bg-brass-500/5 px-3 py-2 font-body text-[11px] leading-relaxed text-field-300">
          <IconInfo size={13} className="mt-[1px] shrink-0 text-brass-400" />
          效果结算需要你指定目标或分支，选择后将立即生效。
        </p>

        {choice.mode === 'option' && (
          <div className="space-y-2">
            {options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                onClick={() => resolve([option.id])}
                className="group flex w-full items-center gap-3 rounded-sm border border-field-600/70 bg-field-900/70 px-3 py-2.5 text-left transition-colors hover:border-brass-500/80 hover:bg-field-800/80"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-brass-600/60 bg-field-950 font-display text-[11px] text-brass-300">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-[12px] text-field-100">{option.label}</span>
                  {option.detail && (
                    <span className="block font-body text-[10px] text-field-500">{option.detail}</span>
                  )}
                </span>
              </button>
            ))}
            {options.length === 0 && (
              <button type="button" className="fards-btn w-full" onClick={() => resolve([])}>
                继续结算
              </button>
            )}
          </div>
        )}

        {choice.mode === 'unit' && (
          <div className="flex flex-wrap gap-2">
            {unitCandidates.map((unit) => (
              <button
                key={unit!.unitId}
                type="button"
                onClick={() => resolve([unit!.unitId])}
                className="w-[76px] shrink-0 rounded-sm border border-field-600/60 p-[2px] transition-colors hover:border-brass-500/80"
              >
                <CardFace card={byId.get(unit!.cardId)} className="h-full w-full" />
                <span className="mt-1 block truncate font-body text-[9px] text-field-300">
                  {byId.get(unit!.cardId)?.nameZh ?? unit!.cardId}
                </span>
              </button>
            ))}
            {unitCandidates.length === 0 && (
              <button type="button" className="fards-btn w-full" onClick={() => resolve([])}>
                没有可选单位，继续
              </button>
            )}
          </div>
        )}

        {choice.mode === 'card' && (
          <div className="flex flex-wrap gap-2">
            {cardCandidates.map((instance) => (
              <button
                key={instance!.instanceId}
                type="button"
                onClick={() => resolve([instance!.instanceId])}
                className="w-[76px] shrink-0 rounded-sm border border-field-600/60 p-[2px] transition-colors hover:border-brass-500/80"
              >
                <CardFace card={byId.get(instance!.cardId)} className="h-full w-full" />
                <span className="mt-1 block truncate font-body text-[9px] text-field-300">
                  {byId.get(instance!.cardId)?.nameZh ?? instance!.cardId}
                </span>
              </button>
            ))}
            {cardCandidates.length === 0 && (
              <button type="button" className="fards-btn w-full" onClick={() => resolve([])}>
                没有可选卡牌，继续
              </button>
            )}
          </div>
        )}

        {choice.mode === 'slot' && (
          <button type="button" className="fards-btn w-full" onClick={() => resolve([])}>
            按当前部署位置继续
          </button>
        )}
      </div>
    </Dialog>
  );
}

export default ChoiceDialog;
