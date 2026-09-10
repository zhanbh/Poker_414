import { Rank, sortCards } from '../../../shared/src/cards';
import { PublicPlayerView } from '../../../shared/src/protocol';
import { PresenceBadge } from './PresenceBadge';
import { cardColorClass, cardLabel } from './CardHand';

export function PlayerSeat({ seat, player, isCurrentTurn = false, showRemainingHand = false, main = null, isDiscarded = false }: {
  readonly seat: PublicPlayerView['seat'];
  readonly player: PublicPlayerView | null;
  readonly isCurrentTurn?: boolean;
  readonly showRemainingHand?: boolean;
  readonly main?: Rank | null;
  readonly isDiscarded?: boolean;
}) {
  if (!player) {
    return <div className={`player-seat seat-${seat}`}><div className="player-identity"><div className="player-avatar"><span>{seat}</span></div><span>空位</span></div></div>;
  }

  return (
    <div className={`player-seat seat-${seat}${isDiscarded ? ' discarded-player' : ''}`}>
      <div className="player-identity">
        <div className={`player-avatar${isCurrentTurn ? ' current-turn' : ''}${isDiscarded ? ' discarded-avatar' : ''}`} aria-current={isCurrentTurn ? 'true' : undefined} aria-label={isDiscarded ? `${seat}已弃牌` : seat}>
          <span>{seat}</span>
          {isDiscarded ? <span className="discarded-mark" aria-label="已弃牌">弃牌</span> : player.burstAnnounced ? <span className="burst-mark" aria-label="爆">爆</span> : null}
        </div>
        <div className="player-info">
          <strong>{player.nickname} · {player.handCount}张</strong>
          <span>{player.team}</span>
          {player.isHost ? <span className="host-label">房主</span> : null}
          {player.ready ? <span className="ready-label">已准备</span> : null}
          <PresenceBadge away={player.away} />
        </div>
      </div>
      {showRemainingHand && player.remainingHand.length > 0 ? <div className={`remaining-hand${isDiscarded ? ' discarded-hand' : ''}`} aria-label={`${seat}剩余手牌`}>
        <div className="played-cards">
          {sortCards(player.remainingHand, main).map((card) => <span className={`played-card ${cardColorClass(card)}`} key={card.id}>{cardLabel(card)}</span>)}
        </div>
      </div> : null}
    </div>
  );
}
