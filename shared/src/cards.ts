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

const SUIT_ORDER: Record<Suit, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
};

function rankSortValue(rank: Rank, main: Rank | null): number {
  if (rank === main) return RANKS.length;
  return rankIndex(rank);
}

function cardSortValue(card: Card, main: Rank | null): number {
  if (card.kind === 'joker') return RANKS.length + (card.joker === 'small' ? 1 : 2);
  return rankSortValue(card.rank, main);
}

function compareCards(left: Card, right: Card, main: Rank | null): number {
  const valueDifference = cardSortValue(left, main) - cardSortValue(right, main);
  if (valueDifference !== 0) return valueDifference;
  if (left.kind === 'joker' && right.kind === 'joker') return left.joker === right.joker ? 0 : left.joker === 'small' ? -1 : 1;
  if (left.kind === 'standard' && right.kind === 'standard') return SUIT_ORDER[left.suit] - SUIT_ORDER[right.suit];
  return left.kind === 'standard' ? -1 : 1;
}

/**
 * Returns a display-only hand order from lowest to highest current card power.
 * The effective main is highest among standard cards; small and big jokers are last.
 */
export function sortCards(cards: readonly Card[], main: Rank | null = null): Card[] {
  return [...cards].sort((left, right) => compareCards(left, right, main));
}
