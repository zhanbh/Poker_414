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

function specialFourOneFourValue(card: Card): number {
  if (card.kind === 'standard' && card.rank === '4') return 0;
  if (card.kind === 'joker') return 1;
  return 2;
}

function compareSpecialFourOneFourCards(left: Card, right: Card, main: Rank | null): number {
  return specialFourOneFourValue(left) - specialFourOneFourValue(right) || compareCards(left, right, main);
}

function takeFlexibleFourOneFourGroup(cards: readonly Card[]): { readonly group: Card[]; readonly usedIds: ReadonlySet<string> } | null {
  const fours = cards.filter((card): card is StandardCard => card.kind === 'standard' && card.rank === '4');
  const aces = cards.filter((card): card is StandardCard => card.kind === 'standard' && card.rank === 'A');
  const jokers = cards.filter(isJoker);
  if (aces.length !== 1 || fours.length + jokers.length !== 2) return null;

  const group = [...fours, ...jokers, ...aces];
  return { group, usedIds: new Set(group.map((card) => card.id)) };
}

function displayGroupPriority(rank: Rank, count: number, main: Rank | null): number {
  if (count === 1) return 10;
  if (count === 2 && rank !== main) return 20;
  if (rank === main && count >= 2) return 40 + (count - 2) * 20;
  if (count >= 3) return 30 + (count - 3) * 20;
  return 200;
}

interface DisplayGroup {
  readonly cards: Card[];
  readonly priority: number;
  readonly rank: Rank | null;
  readonly order: number;
}

/**
 * Returns a display-only hand order grouped by the strongest useful hand shape.
 * Singles come first, then pairs, bombs, flexible 414 candidates and jokers.
 * The grouping never decides which cards the player must play.
 */
export function sortCards(cards: readonly Card[], main: Rank | null = null): Card[] {
  const specialGroup = takeFlexibleFourOneFourGroup(cards);
  const usedIds = specialGroup?.usedIds ?? new Set<string>();
  const groups: DisplayGroup[] = [];
  let order = 0;

  if (specialGroup) {
    groups.push({
      cards: [...specialGroup.group].sort((left, right) => compareSpecialFourOneFourCards(left, right, main)),
      priority: 45,
      rank: null,
      order: order++,
    });
  }

  for (const rank of RANKS) {
    const rankCards = cards.filter((card): card is StandardCard => card.kind === 'standard' && card.rank === rank && !usedIds.has(card.id));
    if (rankCards.length === 0) continue;
    groups.push({
      cards: rankCards.sort((left, right) => compareCards(left, right, main)),
      priority: displayGroupPriority(rank, rankCards.length, main),
      rank,
      order: order++,
    });
  }

  const remainingJokers = cards.filter((card) => card.kind === 'joker' && !usedIds.has(card.id));
  if (remainingJokers.length > 0) {
    groups.push({
      cards: remainingJokers.sort((left, right) => compareCards(left, right, main)),
      priority: 210,
      rank: null,
      order: order++,
    });
  }

  return groups
    .sort((left, right) => left.priority - right.priority
      || (left.rank && right.rank ? rankSortValue(left.rank, main) - rankSortValue(right.rank, main) : 0)
      || left.order - right.order)
    .flatMap((group) => group.cards);
}
