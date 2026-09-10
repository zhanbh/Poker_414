export const SEQUENCE_RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export const RANKS = [...SEQUENCE_RANKS, '2'] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = (typeof SUITS)[number];
export type JokerKind = 'small' | 'big';

export interface StandardCard {
  readonly kind: 'standard';
  readonly id: string;
  readonly suit: Suit;
  readonly rank: Rank;
}

export interface JokerCard {
  readonly kind: 'joker';
  readonly id: string;
  readonly joker: JokerKind;
}

export type Card = StandardCard | JokerCard;

export function standardCard(rank: Rank, suit: Suit, id = `${suit}-${rank}`): StandardCard {
  return { kind: 'standard', id, suit, rank };
}

export function joker(kind: JokerKind, id = `${kind}-joker`): JokerCard {
  return { kind: 'joker', id, joker: kind };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
  for (const rank of RANKS) {
      deck.push(standardCard(rank, suit));
    }
  }

  deck.push(joker('small'), joker('big'));
  return deck;
}

export function isJoker(card: Card): card is JokerCard {
  return card.kind === 'joker';
}

export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}
