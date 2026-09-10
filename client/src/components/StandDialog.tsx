import { OpeningChoice } from '../../../shared/src/game-state';
import { Seat, Team, teamOf } from '../../../shared/src/scoring';

export function StandDialog({
  mode,
  ownSeat,
  modeTeam,
  openingTurn,
  onChoose,
}: {
  readonly mode: 'normal' | 'stand' | 'reverse';
  readonly ownSeat: Seat | null;
  readonly modeTeam: Team | null;
  readonly openingTurn: Seat | null;
  readonly onChoose: (choice: OpeningChoice) => void;
}) {
  const canAct = Boolean(ownSeat && openingTurn === ownSeat);
  const isOpponent = Boolean(ownSeat && modeTeam && teamOf(ownSeat) !== modeTeam);
  const showReverse = mode === 'reverse' && isOpponent;
  const waitingFor = openingTurn && openingTurn !== ownSeat ? '等待 ' + openingTurn + ' 选择' : null;
  return (
    <section className="stand-dialog" aria-label="首牌权选择">
      <strong>{mode === 'reverse' ? (isOpponent ? '反立选择' : '等待对方反立') : mode === 'stand' ? '队友抢立选择' : '立棍选择'}</strong>
      {showReverse
        ? <button type="button" disabled={!canAct} onClick={() => ownSeat && onChoose({ kind: 'reverse', seat: ownSeat })}>反立</button>
        : mode !== 'reverse'
          ? <button type="button" disabled={!canAct} onClick={() => ownSeat && onChoose({ kind: 'stand', seat: ownSeat })}>立棍</button>
          : null}
      <button type="button" disabled={!canAct} onClick={() => onChoose({ kind: 'pass' })}>跳过</button>
      {waitingFor ? <span>{waitingFor}</span> : null}
    </section>
  );
}
