import { PublicSnapshot } from '../../../shared/src/protocol';
import { PlayerSeat } from '../components/PlayerSeat';

export function LobbyView({ snapshot, ownSeat, spectator = false, onStart, onRemove, onLeave, testMode }: {
  readonly snapshot: PublicSnapshot;
  readonly ownSeat: 'A' | 'B' | 'C' | 'D' | null;
  readonly onStart: () => void;
  readonly onRemove: (seat: 'A' | 'B' | 'C' | 'D') => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
  readonly spectator?: boolean;
}) {
  const playersBySeat = new Map(snapshot.players.map((player) => [player.seat, player]));
  const full = snapshot.players.length === 4;
  const spectators = snapshot.spectators ?? [];
  return (
    <main className="lobby-view">
      {testMode ? <div className="test-mode-banner" role="status">单机四人测试模式 · 每个标签页都是独立玩家</div> : null}
      <header><h1>414 房间 {snapshot.roomId}</h1><span>等待开局</span></header>
      <div className="team-grid">
        <section><h2>AC 队</h2><PlayerSeat seat="A" player={playersBySeat.get('A') ?? null} /><PlayerSeat seat="C" player={playersBySeat.get('C') ?? null} /></section>
        <section><h2>BD 队</h2><PlayerSeat seat="B" player={playersBySeat.get('B') ?? null} /><PlayerSeat seat="D" player={playersBySeat.get('D') ?? null} /></section>
      </div>
      {spectator ? <p className="spectator-banner">观战模式 · 等待四名玩家开局</p> : null}
      {spectators.length > 0 ? <section className="spectator-lobby"><h2>观战席（{spectators.length}/4）</h2><p>{spectators.map((viewer) => `${viewer.nickname}${viewer.connected ? '' : '（已断开）'}`).join('、')}</p></section> : null}
      {snapshot.players.find((player) => player.seat === ownSeat)?.isHost ? <button type="button" onClick={onStart} disabled={!full}>开始游戏</button> : null}
      {snapshot.players.find((player) => player.seat === ownSeat)?.isHost ? <div className="remove-actions">{snapshot.players.filter((player) => player.seat !== ownSeat).map((player) => <button type="button" key={player.seat} onClick={() => onRemove(player.seat)}>移除{player.nickname}</button>)}</div> : null}
      <button type="button" className="leave-room-button" onClick={onLeave}>退出房间</button>
    </main>
  );
}
