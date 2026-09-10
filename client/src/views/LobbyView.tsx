import { PublicSnapshot } from '../../../shared/src/protocol';
import { PlayerSeat } from '../components/PlayerSeat';

export function LobbyView({ snapshot, ownSeat, onStart, onRemove }: {
  readonly snapshot: PublicSnapshot;
  readonly ownSeat: 'A' | 'B' | 'C' | 'D' | null;
  readonly onStart: () => void;
  readonly onRemove: (seat: 'A' | 'B' | 'C' | 'D') => void;
}) {
  const playersBySeat = new Map(snapshot.players.map((player) => [player.seat, player]));
  const full = snapshot.players.length === 4;
  return (
    <main className="lobby-view">
      <header><h1>414 房间 {snapshot.roomId}</h1><span>等待开局</span></header>
      <div className="team-grid">
        <section><h2>AC 队</h2><PlayerSeat seat="A" player={playersBySeat.get('A') ?? null} /><PlayerSeat seat="C" player={playersBySeat.get('C') ?? null} /></section>
        <section><h2>BD 队</h2><PlayerSeat seat="B" player={playersBySeat.get('B') ?? null} /><PlayerSeat seat="D" player={playersBySeat.get('D') ?? null} /></section>
      </div>
      {snapshot.players.find((player) => player.seat === ownSeat)?.isHost ? <button type="button" onClick={onStart} disabled={!full}>开始游戏</button> : null}
      {snapshot.players.find((player) => player.seat === ownSeat)?.isHost ? <div className="remove-actions">{snapshot.players.map((player) => <button type="button" key={player.seat} onClick={() => onRemove(player.seat)}>移除{player.nickname}</button>)}</div> : null}
    </main>
  );
}
