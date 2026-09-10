import { OpeningChoice } from '../../../shared/src/game-state';

export function StandDialog({
  mode,
  ownSeat,
  onChoose,
}: {
  readonly mode: 'normal' | 'stand' | 'reverse';
  readonly ownSeat: OpeningChoice['seat'];
  readonly onChoose: (choice: OpeningChoice) => void;
}) {
  return (
    <section className="stand-dialog" aria-label="首牌权选择">
      <strong>首牌权与立棍</strong>
      {mode === 'normal' ? <button type="button" onClick={() => onChoose({ kind: 'normal' })}>正常开打</button> : null}
      {mode === 'normal' ? <button type="button" disabled={!ownSeat} onClick={() => ownSeat && onChoose({ kind: 'stand', seat: ownSeat })}>立棍</button> : null}
      {mode === 'stand' ? <button type="button" onClick={() => onChoose({ kind: 'normal' })}>不反立</button> : null}
      {mode === 'stand' ? <button type="button" disabled={!ownSeat} onClick={() => ownSeat && onChoose({ kind: 'reverse', seat: ownSeat })}>反立</button> : null}
    </section>
  );
}
