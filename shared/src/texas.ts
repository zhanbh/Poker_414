export type TexasSeat = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export const TEXAS_SEATS: readonly TexasSeat[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const TEXAS_STARTING_STACK = 1_000;
export const TEXAS_SMALL_BLIND = 10;
export const TEXAS_BIG_BLIND = 20;

export type TexasSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type TexasRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface TexasCard {
  readonly id: string;
  readonly suit: TexasSuit;
  readonly rank: TexasRank;
}

export type TexasHandCategory = 'high-card' | 'pair' | 'two-pair' | 'three-of-a-kind' | 'straight' | 'flush' | 'full-house' | 'four-of-a-kind' | 'straight-flush';

export interface TexasHandValue {
  readonly category: TexasHandCategory;
  readonly score: readonly number[];
}

const RANK_VALUE: Readonly<Record<TexasRank, number>> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const SUITS: readonly TexasSuit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS: readonly TexasRank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export function createTexasDeck(random = Math.random): TexasCard[] {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: rank + '-' + suit, suit, rank })));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function combinations(cards: readonly TexasCard[], size: number): TexasCard[][] {
  const result: TexasCard[][] = [];
  const visit = (start: number, current: TexasCard[]) => {
    if (current.length === size) { result.push([...current]); return; }
    for (let index = start; index <= cards.length - (size - current.length); index += 1) {
      current.push(cards[index]);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return result;
}

function compareScore(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function evaluateFive(cards: readonly TexasCard[]): TexasHandValue {
  const values = cards.map((card) => RANK_VALUE[card.rank]).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(values)].sort((a, b) => b - a);
  const straightHigh = unique.length === 5
    ? unique[0] - unique[4] === 4 ? unique[0] : unique.join(',') === '14,5,4,3,2' ? 5 : 0
    : 0;
  if (flush && straightHigh) return { category: 'straight-flush', score: [8, straightHigh] };
  if (groups[0][1] === 4) return { category: 'four-of-a-kind', score: [7, groups[0][0], groups[1][0]] };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { category: 'full-house', score: [6, groups[0][0], groups[1][0]] };
  if (flush) return { category: 'flush', score: [5, ...values] };
  if (straightHigh) return { category: 'straight', score: [4, straightHigh] };
  if (groups[0][1] === 3) return { category: 'three-of-a-kind', score: [3, groups[0][0], ...groups.slice(1).map(([value]) => value)] };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { category: 'two-pair', score: [2, groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2) return { category: 'pair', score: [1, groups[0][0], ...groups.slice(1).map(([value]) => value)] };
  return { category: 'high-card', score: [0, ...values] };
}

export function evaluateTexasHand(cards: readonly TexasCard[]): TexasHandValue {
  if (cards.length < 5) throw new Error('德州扑克至少需要五张牌进行比较');
  return combinations(cards, 5).map(evaluateFive).sort((left, right) => compareScore(right.score, left.score))[0];
}

export function compareTexasHands(left: TexasHandValue, right: TexasHandValue): number {
  return compareScore(left.score, right.score);
}

export function texasCardLabel(card: TexasCard): string {
  const suit = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }[card.suit];
  return card.rank + suit;
}
