import { Card, Rank, sortCards } from '../../../shared/src/cards';
import { cardLabel, cardColorClass } from './CardHand';

type SpectatorHand = { readonly seat: 'A' | 'B' | 'C' | 'D'; readonly nickname: string; readonly hand: Card[] };

export function SpectatorHands({ hands, main }: { readonly hands: readonly SpectatorHand[]; readonly main: Rank | null }) {
  return (
    <section className="spectator-hands" aria-label="上帝视角全部手牌">
      <div className="hand-toolbar"><strong>上帝视角 · 全部手牌</strong><span>仅观战可见</span></div>
      <div className="spectator-hand-grid">
        {hands.map((player) => <section className="spectator-hand" key={player.seat}>
          <h3>{player.seat} · {player.nickname}（{player.hand.length}张）</h3>
          <div className="played-cards">
            {sortCards(player.hand, main).map((card) => <span className={`played-card ${cardColorClass(card)}`} key={card.id}>{cardLabel(card)}</span>)}
          </div>
        </section>)}
      </div>
    </section>
  );
}
