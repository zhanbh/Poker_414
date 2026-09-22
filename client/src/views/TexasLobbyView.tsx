import { TexasPublicSnapshot } from '../../../shared/src/protocol';
import { Seat } from '../../../shared/src/scoring';

const SEATS: readonly Seat[] = ['A', 'B', 'C', 'D'];

export function TexasLobbyView({ snapshot, ownSeat, spectator = false, onStart, onRemove, onLeave, testMode }: {
  readonly snapshot: TexasPublicSnapshot;
  readonly ownSeat: Seat | null;
  readonly spectator?: boolean;
  readonly onStart: () => void;
  readonly onRemove: (seat: Seat) => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
}) {
  const players = new Map(snapshot.players.map((player) => [player.seat, player]));
  const ownPlayer = snapshot.players.find((player) => player.seat === ownSeat);
  return (
    <main className="texas-lobby">
      {testMode ? <div className="test-mode-banner" role="status">单机多标签测试模式 · 每个标签页都是独立玩家</div> : null}
      <header className="texas-header"><div><h1>德州扑克房间 {snapshot.roomId}</h1><p>2—4 人无限注 · 1000 筹码 · 盲注 10/20</p></div><span>等待开局</span></header>
      <section className="texas-seats" aria-label="德州扑克座位">
        {SEATS.map((seat) => {
          const player = players.get(seat);
          return <article className={player ? 'texas-seat occupied' : 'texas-seat'} key={seat}>
            <strong>{seat} 位</strong>
            {player ? <><b>{player.nickname}</b><span>{player.stack} 筹码</span>{player.isHost ? <em>房主</em> : null}</> : <span>空位</span>}
          </article>;
        })}
      </section>
      {spectator ? <p className="spectator-banner">观战模式 · 等待牌局开始</p> : null}
      {snapshot.spectators.length > 0 ? <section className="spectator-lobby"><h2>观战席（{snapshot.spectators.length}/4）</h2><p>{snapshot.spectators.map((viewer) => viewer.nickname).join('、')}</p></section> : null}
      {ownPlayer?.isHost ? <button type="button" onClick={onStart} disabled={snapshot.players.length < 2}>开始牌局</button> : null}
      {ownPlayer?.isHost ? <div className="remove-actions">{snapshot.players.filter((player) => player.seat !== ownSeat).map((player) => <button type="button" key={player.seat} onClick={() => onRemove(player.seat)}>移除{player.nickname}</button>)}</div> : null}
      <button type="button" className="leave-room-button" onClick={onLeave}>退出房间并重选玩法</button>
    </main>
  );
}
