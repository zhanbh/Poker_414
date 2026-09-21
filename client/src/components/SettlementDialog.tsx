import { SettlementMode, SettlementResult, teamLabel } from '../../../shared/src/scoring';

function settlementMessage(result: SettlementResult, mode: SettlementMode, modeTeam: 'AC' | 'BD' | null): string {
  const winner = teamLabel(result.winnerTeam);
  const modeTeamName = modeTeam ? teamLabel(modeTeam) : null;
  switch (result.outcome) {
    case 'grab-two': return `${winner}获胜，${winner}升2级`;
    case 'grab-one': return `${winner}获胜，${winner}升1级`;
    case 'stand-success': return `${modeTeamName ?? winner}立棍成功，${winner}升4级`;
    case 'stand-failure': return `${modeTeamName ?? '挑战方'}立棍失败，${winner}升4级`;
    case 'reverse-success': return `${modeTeamName ?? winner}反立成功，${winner}升8级`;
    case 'reverse-failure': return `${modeTeamName ?? '挑战方'}反立失败，${winner}升8级`;
    case 'flat': return '本局平局，等级不变';
    default: return mode === 'normal' ? `${winner}获胜` : `${winner}获胜`;
  }
}

export function SettlementDialog({
  settlement,
  mode,
  modeTeam,
  onClose,
}: {
  readonly settlement: SettlementResult;
  readonly mode: SettlementMode;
  readonly modeTeam: 'AC' | 'BD' | null;
  readonly onClose: () => void;
}) {
  return (
    <div className="settlement-backdrop">
      <section className="settlement-dialog" role="dialog" aria-modal="true" aria-label="本局结算">
        <p className="settlement-title">本局结束</p>
        <h2>{settlementMessage(settlement, mode, modeTeam)}</h2>
        <p className="settlement-levels">当前等级：{teamLabel('AC')} {settlement.levels.AC} · {teamLabel('BD')} {settlement.levels.BD}</p>
        <button type="button" onClick={onClose}>关闭并准备下一局</button>
      </section>
    </div>
  );
}
