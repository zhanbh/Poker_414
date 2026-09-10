import { Card } from '../../../shared/src/cards';

function cardLabel(card: Card): string {
  return card.kind === 'joker' ? (card.joker === 'small' ? '小王' : '大王') : `${card.rank}${{ clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }[card.suit]}`;
}

export function CardHand({
  cards,
  selectedIds,
  onToggle,
}: {
  readonly cards: readonly Card[];
  readonly selectedIds: readonly string[];
  readonly onToggle: (card: Card) => void;
}) {
  return (
    <div className="card-hand" aria-label="我的手牌">
      {cards.map((card) => (
        <button
          className={selectedIds.includes(card.id) ? 'card selected' : 'card'}
          key={card.id}
          type="button"
          aria-label={cardLabel(card)}
          onClick={() => onToggle(card)}
        >
          {cardLabel(card)}
        </button>
      ))}
    </div>
  );
}
