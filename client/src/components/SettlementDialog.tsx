import { SettlementMode, SettlementResult } from '../../../shared/src/scoring';

function settlementMessage(result: SettlementResult, mode: SettlementMode, modeTeam: 'AC' | 'BD' | null): string {
  switch (result.outcome) {
    case 'grab-two': return `${result.winnerTeam}获胜，${result.winnerTeam}升2级`;
    case 'grab-one': return `${result.winnerTeam}获胜，${result.winnerTeam}升1级`;
    case 'stand-success': return `${modeTeam ?? result.winnerTeam}立棍成功，${result.winnerTeam}升4级`;
    case 'stand-failure': return `${modeTeam ?? '挑战方'}立棍失败，${result.winnerTeam}升4级`;
    case 'reverse-success': return `${modeTeam ?? result.winnerTeam}反立成功，${result.winnerTeam}升8级`;
    case 'reverse-failure': return `${modeTeam ?? '挑战方'}反立失败，${result.winnerTeam}升8级`;
    case 'flat': return '本局平局，等级不变';
    default: return mode === 'normal' ? `${result.winnerTeam}获胜` : `${result.winnerTeam}获胜`;
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
        <p className="settlement-levels">当前等级：AC {settlement.levels.AC} · BD {settlement.levels.BD}</p>
        <button type="button" onClick={onClose}>关闭并准备下一局</button>
      </section>
    </div>
  );
}
