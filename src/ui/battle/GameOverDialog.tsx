/**
 * 结算弹窗：胜负 / 原因 / 关键统计 + 再来一局 / 返回部署。
 */
import { Link } from 'react-router-dom';
import { useBattleStore, HUMAN, AI } from '../stores/battleStore';
import Dialog from '../components/Dialog';
import { IconRefresh, IconSwords, IconTrophy, IconAlert } from '../components/icons';

const REASON_TEXT: Record<string, string> = {
  hq_destroyed: '总部被摧毁',
  concede: '主动投降',
  draw: '双方同时失去总部',
  deck_out: '牌库耗尽',
};

export function GameOverDialog() {
  const phase = useBattleStore((state) => state.phase);
  const result = useBattleStore((state) => state.result);
  const state = useBattleStore((state) => state.state);
  const difficulty = useBattleStore((state) => state.difficulty);
  const retry = useBattleStore((state) => state.restartBattle);
  const quit = useBattleStore((state) => state.quitToSetup);

  const open = phase === 'finished' && !!result;
  if (!open || !result) return null;

  const won = result.winner === HUMAN;
  const draw = result.winner === null;
  const title = draw ? '战局胶着' : won ? '胜利' : '败北';
  const tone = draw ? 'text-brass-300' : won ? 'text-emerald-300' : 'text-red-300';
  const Icon = draw ? IconAlert : won ? IconTrophy : IconAlert;
  const me = state?.players[HUMAN];
  const enemy = state?.players[AI];
  const unitsDeployed = state?.trackers.unitsDeployed ?? 0;

  return (
    <Dialog
      open
      onClose={quit}
      eyebrow="战斗结束"
      title={title}
      width="md"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="fards-btn fards-btn-ghost" onClick={quit}>
            返回部署
          </button>
          <div className="flex items-center gap-2">
            <Link to="/deck" className="fards-btn fards-btn-ghost">
              返回卡组
            </Link>
            <button type="button" className="fards-btn fards-btn-primary" onClick={() => void retry()}>
              <IconRefresh size={13} />
              再来一局
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-sm border ${tone} border-current/40 bg-field-900/80`}
            style={{ borderColor: 'currentColor' }}
          >
            <Icon size={26} />
          </span>
          <div className="min-w-0">
            <p className={`font-display text-2xl leading-none tracking-[0.12em] ${tone}`}>{title}</p>
            <p className="mt-1.5 font-body text-[11px] text-field-400">
              结束原因：{REASON_TEXT[result.reason] ?? result.reason}
              {state ? ` · 共 ${state.turn} 个回合 / ${state.round} 轮` : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: '我方总部', value: `${me?.hq.hp ?? 0}/${me?.hq.maxHp ?? 0}`, hint: '剩余生命' },
            { label: '敌方总部', value: `${enemy?.hq.hp ?? 0}/${enemy?.hq.maxHp ?? 0}`, hint: '剩余生命' },
            { label: '部署单位', value: `${unitsDeployed}`, hint: '全场累计' },
            {
              label: '难度',
              value: difficulty === 'easy' ? '新兵' : difficulty === 'hard' ? '王牌' : '老兵',
              hint: 'AI 档位',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-sm border border-field-700/60 bg-field-950/50 px-2.5 py-2"
              title={item.hint}
            >
              <p className="font-body text-[9px] tracking-[0.16em] text-field-500 uppercase">{item.label}</p>
              <p className="mt-1 font-display text-[16px] leading-none text-field-100">{item.value}</p>
            </div>
          ))}
        </div>

        <p className="flex items-center gap-2 font-body text-[10px] leading-relaxed text-field-500">
          <IconSwords size={12} className="shrink-0 text-brass-500" />
          本局使用同一套卡组重开；换卡组请返回卡组页调整编制。
        </p>
      </div>
    </Dialog>
  );
}

export default GameOverDialog;
