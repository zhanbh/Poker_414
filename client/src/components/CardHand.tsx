import { Card, Rank, sortCards } from '../../../shared/src/cards';

export function cardLabel(card: Card): string {
  return card.kind === 'joker' ? (card.joker === 'small' ? '小王' : '大王') : `${card.rank}${{ clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }[card.suit]}`;
}

export function cardColorClass(card: Card): string {
  return card.kind === 'joker'
    ? `joker ${card.joker}`
    : card.suit === 'diamonds' || card.suit === 'hearts' ? 'red' : 'black';
}

function cardClassName(card: Card, selected: boolean): string {
  return ['card', cardColorClass(card), selected ? 'selected' : ''].filter(Boolean).join(' ');
}

export function CardHand({
  cards,
  main = null,
  selectedIds,
  onToggle,
  dimmed = false,
}: {
  readonly cards: readonly Card[];
  readonly main?: Rank | null;
  readonly selectedIds: readonly string[];
  readonly onToggle: (card: Card) => void;
  readonly dimmed?: boolean;
}) {
  const orderedCards = sortCards(cards, main);
  return (
    <div className={`card-hand${dimmed ? ' dimmed' : ''}`} aria-label={dimmed ? '已弃牌的手牌' : '我的手牌'}>
      {orderedCards.map((card) => (
        <button
          className={cardClassName(card, selectedIds.includes(card.id))}
          key={card.id}
          type="button"
          disabled={dimmed}
          aria-label={cardLabel(card)}
          onClick={() => onToggle(card)}
        >
          {cardLabel(card)}
        </button>
      ))}
    </div>
  );
}
