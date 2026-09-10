import { Card, RANKS, Rank, SEQUENCE_RANKS, isJoker, rankIndex } from './cards';

export type HandKind =
  | 'single'
  | 'pair'
  | 'sequence'
  | 'consecutive-pairs'
  | 'ordinary-bomb'
  | 'main-bomb'
  | '414';

export interface HandAnalysis {
  readonly kind: HandKind;
  readonly cards: readonly Card[];
  readonly rank?: Rank;
  readonly startRank?: Rank;
  readonly length: number;
  readonly pairCount?: number;
  readonly bombCount?: number;
  readonly wildCount: number;
  readonly isDifference: boolean;
}

export interface AnalyzeOptions {
  readonly responseTo?: HandAnalysis;
  readonly declaredKind?: HandKind | 'difference';
}

function wildCount(cards: readonly Card[]): number {
  return cards.filter(isJoker).length;
}

function naturalCounts(cards: readonly Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    if (card.kind === 'standard') {
      counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    }
  }
  return counts;
}

function isExactPairForRank(cards: readonly Card[], rank: Rank): boolean {
  if (cards.length !== 2) return false;
  const counts = naturalCounts(cards);
  return [...counts.keys()].every((candidate) => candidate === rank) && (counts.get(rank) ?? 0) + wildCount(cards) === 2;
}

function pairOptions(cards: readonly Card[]): HandAnalysis[] {
  if (cards.length !== 2) return [];
  return RANKS.filter((rank) => isExactPairForRank(cards, rank)).map((rank) => ({
    kind: 'pair',
    cards,
    rank,
    length: 2,
    wildCount: wildCount(cards),
    isDifference: false,
  }));
}

function sequenceOptions(cards: readonly Card[]): HandAnalysis[] {
  if (cards.length < 3 || cards.length > SEQUENCE_RANKS.length) return [];
  const counts = naturalCounts(cards);
  if ([...counts.values()].some((count) => count > 1)) return [];

  return SEQUENCE_RANKS.slice(0, SEQUENCE_RANKS.length - cards.length + 1)
    .map((startRank, start) => ({ startRank, start }))
    .filter(({ start }) => {
      const window = new Set<Rank>(SEQUENCE_RANKS.slice(start, start + cards.length));
      return [...counts.keys()].every((rank) => window.has(rank));
    })
    .map(({ startRank }) => ({
      kind: 'sequence',
      cards,
      startRank,
      length: cards.length,
      wildCount: wildCount(cards),
      isDifference: false,
    }));
}

function consecutivePairOptions(cards: readonly Card[]): HandAnalysis[] {
  if (cards.length < 6 || cards.length % 2 !== 0) return [];
  const pairCount = cards.length / 2;
  const counts = naturalCounts(cards);
  if ([...counts.values()].some((count) => count > 2)) return [];

  return SEQUENCE_RANKS.slice(0, SEQUENCE_RANKS.length - pairCount + 1)
    .map((startRank, start) => ({ startRank, start }))
    .filter(({ start }) => {
      const window = new Set<Rank>(SEQUENCE_RANKS.slice(start, start + pairCount));
      return [...counts.keys()].every((rank) => window.has(rank));
    })
    .map(({ startRank }) => ({
      kind: 'consecutive-pairs',
      cards,
      startRank,
      length: cards.length,
      pairCount,
      wildCount: wildCount(cards),
      isDifference: false,
    }));
}

function bombOptions(cards: readonly Card[], main: Rank): HandAnalysis[] {
  if (cards.length < 2) return [];
  const counts = naturalCounts(cards);
  const options: HandAnalysis[] = [];

  if (cards.length >= 2 && (counts.get(main) ?? 0) + wildCount(cards) === cards.length && [...counts.keys()].every((rank) => rank === main)) {
    options.push({
      kind: 'main-bomb',
      cards,
      rank: main,
      length: cards.length,
      bombCount: cards.length,
      wildCount: wildCount(cards),
      isDifference: false,
    });
  }

  if (cards.length >= 3) {
    for (const rank of RANKS) {
      if (rank === main) continue;
      if ((counts.get(rank) ?? 0) + wildCount(cards) === cards.length && [...counts.keys()].every((candidate) => candidate === rank)) {
        options.push({
          kind: 'ordinary-bomb',
          cards,
          rank,
          length: cards.length,
          bombCount: cards.length,
          wildCount: wildCount(cards),
          isDifference: false,
        });
      }
    }
  }

  return options;
}

function fourOneFourOptions(cards: readonly Card[]): HandAnalysis[] {
  if (cards.length !== 3) return [];
  const counts = naturalCounts(cards);
  const jokerCount = wildCount(cards);
  const naturalFour = counts.get('4') ?? 0;
  const naturalAce = counts.get('A') ?? 0;
  const onlyFourAndAce = [...counts.keys()].every((rank) => rank === '4' || rank === 'A');

  if (!onlyFourAndAce || naturalAce !== 1 || naturalFour + jokerCount !== 2) return [];

  return [{
    kind: '414',
    cards,
    length: 3,
    wildCount: jokerCount,
    isDifference: false,
  }];
}

export function analyzeHand(cards: readonly Card[], main: Rank, options: AnalyzeOptions = {}): HandAnalysis | null {
  const candidates = getHandOptions(cards, main);
  const declared = options.declaredKind;

  if (declared === 'difference') {
    if (options.responseTo?.kind !== 'single') return null;
    const matchingPair = pairOptions(cards).find((candidate) => candidate.rank === options.responseTo?.rank);
    return matchingPair ? { ...matchingPair, isDifference: true } : null;
  }

  const filtered = declared ? candidates.filter((candidate) => candidate.kind === declared) : candidates;
  if (filtered.length === 0) return null;

  if (options.responseTo?.kind === 'single') {
    const matchingDifference = filtered.find((candidate) => candidate.kind === 'pair' && candidate.rank === options.responseTo?.rank);
    if (matchingDifference) return matchingDifference;
  }

  return preferredCandidate(filtered);
}

export function getHandOptions(cards: readonly Card[], main: Rank): HandAnalysis[] {
  if (cards.length === 0) return [];

  const candidates: HandAnalysis[] = [];
  if (cards.length === 1 && cards[0].kind === 'standard') {
    candidates.push({
      kind: 'single',
      cards,
      rank: cards[0].rank,
      length: 1,
      wildCount: 0,
      isDifference: false,
    });
  }

  candidates.push(...fourOneFourOptions(cards));
  candidates.push(...consecutivePairOptions(cards));
  candidates.push(...sequenceOptions(cards));
  candidates.push(...bombOptions(cards, main));
  candidates.push(...pairOptions(cards));
  return candidates;
}

function preferredCandidate(candidates: readonly HandAnalysis[]): HandAnalysis {
  const priority: Record<HandKind, number> = {
    '414': 70,
    'main-bomb': 60,
    'ordinary-bomb': 50,
    'consecutive-pairs': 40,
    sequence: 30,
    pair: 20,
    single: 10,
  };

  return [...candidates].sort((left, right) => {
    const priorityDifference = priority[right.kind] - priority[left.kind];
    if (priorityDifference !== 0) return priorityDifference;
    return (rankIndex(right.rank ?? right.startRank ?? '3') - rankIndex(left.rank ?? left.startRank ?? '3'));
  })[0];
}

export function isBomb(hand: HandAnalysis): boolean {
  return hand.kind === 'ordinary-bomb' || hand.kind === 'main-bomb' || hand.kind === '414';
}
