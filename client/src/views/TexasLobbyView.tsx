import { TexasPublicSnapshot } from '../../../shared/src/protocol';
import { TEXAS_SEATS, TexasSeat } from '../../../shared/src/texas';
import { LandscapeGate } from '../components/LandscapeGate';
import { RoomPurposeNotice } from '../components/RoomPurposeNotice';

const SEATS = TEXAS_SEATS;

export function TexasLobbyView({ snapshot, ownSeat, spectator = false, onStart, onRemove, onLeave, testMode }: {
  readonly snapshot: TexasPublicSnapshot;
  readonly ownSeat: TexasSeat | null;
  readonly spectator?: boolean;
  readonly onStart: () => void;
  readonly onRemove: (seat: TexasSeat) => void;
  readonly onLeave: () => void;
  readonly testMode: boolean;
}) {
  const players = new Map(snapshot.players.map((player) => [player.seat, player]));
  const ownPlayer = snapshot.players.find((player) => player.seat === ownSeat);
  return (
    <main className="texas-lobby">
      {testMode ? <div className="test-mode-banner" role="status">单机多标签测试模式 · 每个标签页都是独立玩家</div> : null}
      <header className="texas-header"><div><h1>德州扑克房间 {snapshot.roomId}</h1><p>2—8 人无限注 · 1000 筹码 · 盲注 10/20</p></div><span>等待开局</span></header>
      <RoomPurposeNotice />
      <LandscapeGate />
      <section className="texas-lobby-table" aria-label="德州扑克座位">
        <div className="texas-table-felt">
          <strong>德州扑克</strong>
          <span>{snapshot.players.length} 人已入座 · 至少 2 人开局</span>
          <small>后加入者优先占用空位，等待下一局</small>
          {ownPlayer?.isHost ? <button type="button" onClick={onStart} disabled={snapshot.players.length < 2}>开始牌局</button> : null}
        </div>
        {SEATS.map((seat) => {
          const player = players.get(seat);
          const canKick = Boolean(player && ownPlayer && player.seat !== ownSeat && (ownPlayer.isHost || !player.connected));
          return <article className={'texas-seat texas-seat-position texas-seat-' + seat + (player ? ' occupied' : '') + (canKick ? ' kickable' : '')} key={seat}>
            <strong>{player?.positionLabel ?? seat + ' 位'}</strong>
            {player ? <><b>{player.nickname}</b><span>{player.stack} 筹码</span>{player.isHost ? <em>房主</em> : null}{player.waiting ? <em>等待下一局</em> : null}{!player.connected ? <em className="offline">已断开</em> : null}</> : <span>空位</span>}
            {canKick ? <button type="button" className="texas-seat-remove" onClick={() => onRemove(player!.seat)}>{ownPlayer?.isHost ? '移除' : '踢出'}</button> : null}
          </article>;
        })}
      </section>
      {spectator ? <p className="spectator-banner">观战模式 · 等待牌局开始</p> : null}
      {snapshot.spectators.length > 0 ? <section className="spectator-lobby"><h2>观战席（{snapshot.spectators.length}/4）</h2><p>{snapshot.spectators.map((viewer) => viewer.nickname).join('、')}</p></section> : null}
      <button type="button" className="leave-room-button" onClick={onLeave}>退出房间并重选玩法</button>
    </main>
  );
}
