import { PublicPlayerView } from '../../../shared/src/protocol';
import { PresenceBadge } from './PresenceBadge';

export function PlayerSeat({ seat, player }: { readonly seat: PublicPlayerView['seat']; readonly player: PublicPlayerView | null }) {
  if (!player) {
    return <div className={`player-seat seat-${seat}`}><strong>{seat}</strong><span>空位</span></div>;
  }

  return (
    <div className={`player-seat seat-${seat}`}>
      <strong>{seat}</strong>
      <span>{player.nickname} · {player.handCount}张</span>
      <span>{player.team}</span>
      {player.isHost ? <span className="host-label">房主</span> : null}
      {player.burstAnnounced ? <span className="burst-label">已报爆</span> : null}
      <PresenceBadge away={player.away} />
    </div>
  );
}
