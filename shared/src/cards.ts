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

function takeFourOneFourGroups(cards: readonly Card[], main: Rank | null): { readonly groups: Card[][]; readonly remaining: Card[] } {
  const fours = cards.filter((card): card is StandardCard => card.kind === 'standard' && card.rank === '4');
  const aces = cards.filter((card): card is StandardCard => card.kind === 'standard' && card.rank === 'A');
  const jokers = cards.filter(isJoker);
  const used = new Set<string>();
  const groups: Card[][] = [];

  for (const ace of aces) {
    const substitutes = [...fours, ...jokers].filter((card) => !used.has(card.id));
    if (substitutes.length < 2) break;

    const selected = substitutes.slice(0, 2).sort((left, right) => compareCards(left, right, main));
    used.add(ace.id);
    selected.forEach((card) => used.add(card.id));
    groups.push([...selected, ace]);
  }

  return { groups, remaining: cards.filter((card) => !used.has(card.id)) };
}

/** Returns a display-only hand order: low to high, with the current main above 2. */
export function sortCards(cards: readonly Card[], main: Rank | null = null): Card[] {
  const { groups, remaining } = takeFourOneFourGroups(cards, main);
  const orderedRemaining = [...remaining].sort((left, right) => compareCards(left, right, main));
  const entries: Array<{ cards: Card[]; key: number; group: boolean; order: number }> = [
    ...groups.map((group, order) => ({ cards: group, key: rankSortValue('4', main), group: true, order })),
    ...orderedRemaining.map((card, order) => ({ cards: [card], key: cardSortValue(card, main), group: false, order })),
  ];

  return entries
    .sort((left, right) => left.key - right.key || Number(right.group) - Number(left.group) || left.order - right.order)
    .flatMap((entry) => entry.cards);
}
