import { Card, Rank, rankIndex } from './cards';
import { analyzeHand, HandAnalysis, HandKind, isBomb } from './hand-types';

export type PlayDeclaration = HandKind | 'difference';

export interface PlayResult {
  readonly legal: boolean;
  readonly hand: HandAnalysis | null;
  readonly clearsTrick: boolean;
  readonly reason?: string;
}

export interface PlayRecommendation {
  readonly cardIds: readonly string[];
  readonly kind: HandKind;
  readonly isDifference: boolean;
}

const bombLevels = new Map<string, number>([
  ['ordinary-bomb:3', 1],
  ['main-bomb:2', 2],
  ['414:3', 3],
  ['ordinary-bomb:4', 4],
  ['main-bomb:3', 5],
  ['ordinary-bomb:5', 6],
  ['main-bomb:4', 7],
  ['ordinary-bomb:6', 8],
  ['main-bomb:5', 9],
  ['main-bomb:6', 10],
]);

function bombLevel(hand: HandAnalysis): number {
  return bombLevels.get(`${hand.kind}:${hand.bombCount ?? hand.length}`) ?? 0;
}

function ordinaryRank(hand: HandAnalysis): number {
  return rankIndex(hand.rank ?? '3');
}

function compareBombs(candidate: HandAnalysis, lead: HandAnalysis): boolean {
  const candidateLevel = bombLevel(candidate);
  const leadLevel = bombLevel(lead);
  if (candidateLevel !== leadLevel) return candidateLevel > leadLevel;
  if (candidate.kind === 'ordinary-bomb' && lead.kind === 'ordinary-bomb' && ordinaryRank(candidate) !== ordinaryRank(lead)) {
    return ordinaryRank(candidate) > ordinaryRank(lead);
  }
  return candidate.wildCount < lead.wildCount;
}

function isSpecialRank(rank: Rank, main: Rank): boolean {
  return rank === '2' || rank === main;
}

function canBeatSingle(candidate: HandAnalysis, lead: HandAnalysis, main: Rank): boolean {
  if (candidate.kind !== 'single' || lead.kind !== 'single') return false;
  const candidateRank = candidate.rank!;
  const leadRank = lead.rank!;

  if (candidateRank === main) return leadRank !== main;
  if (candidateRank === '2') return leadRank !== '2' && leadRank !== main;
  if (isSpecialRank(leadRank, main)) return false;
  return rankIndex(candidateRank) === rankIndex(leadRank) + 1;
}

function canBeatPair(candidate: HandAnalysis, lead: HandAnalysis, main: Rank): boolean {
  if (candidate.kind !== 'pair' || lead.kind !== 'pair') return false;
  const candidateRank = candidate.rank!;
  const leadRank = lead.rank!;

  if (candidateRank === main) return leadRank !== main;
  if (candidateRank === '2') return leadRank !== '2' && leadRank !== main;
  if (isSpecialRank(leadRank, main)) return false;
  return rankIndex(candidateRank) === rankIndex(leadRank) + 1;
}

function canBeatSequence(candidate: HandAnalysis, lead: HandAnalysis): boolean {
  if (candidate.kind !== lead.kind || candidate.startRank === undefined || lead.startRank === undefined) return false;
  if (candidate.length !== lead.length) return false;
  return rankIndex(candidate.startRank) === rankIndex(lead.startRank) + 1;
}

function canBeatBombAgainstLead(candidate: HandAnalysis, lead: HandAnalysis): boolean {
  if (lead.kind === 'consecutive-pairs') {
    return candidate.kind === '414' || bombLevel(candidate) >= 4;
  }
  return true;
}

export function canBeat(candidate: HandAnalysis, lead: HandAnalysis, main: Rank): boolean {
  if (lead.isDifference) return false;
  if (candidate.isDifference) return true;

  if (isBomb(candidate)) {
    if (!canBeatBombAgainstLead(candidate, lead)) return false;
    if (!isBomb(lead)) return true;
    return compareBombs(candidate, lead);
  }

  if (isBomb(lead)) return false;
  if (candidate.kind === 'single' && lead.kind === 'single') return canBeatSingle(candidate, lead, main);
  if (candidate.kind === 'pair' && lead.kind === 'pair') return canBeatPair(candidate, lead, main);
  if ((candidate.kind === 'sequence' || candidate.kind === 'consecutive-pairs') && candidate.kind === lead.kind) {
    return canBeatSequence(candidate, lead);
  }
  return false;
}

export function validatePlay(
  cards: readonly Parameters<typeof analyzeHand>[0][number][],
  lead: HandAnalysis | null,
  main: Rank,
  declaration?: PlayDeclaration,
): PlayResult {
  const hand = analyzeHand(cards, main, {
    responseTo: lead ?? undefined,
    declaredKind: declaration,
  });

  if (!hand) {
    return { legal: false, hand: null, clearsTrick: false, reason: '所选牌不能组成合法牌型' };
  }

  if (!lead) {
    if (hand.isDifference) {
      return { legal: false, hand, clearsTrick: false, reason: '差牌不能主动首出' };
    }
    return { legal: true, hand, clearsTrick: false };
  }

  if (hand.isDifference) {
    if (lead.kind !== 'single' || hand.rank !== lead.rank) {
      return { legal: false, hand, clearsTrick: false, reason: '差牌必须回应同点数单牌' };
    }
    return { legal: true, hand, clearsTrick: true };
  }

  return canBeat(hand, lead, main)
    ? { legal: true, hand, clearsTrick: false }
    : { legal: false, hand, clearsTrick: false, reason: '牌力不足或未贴着管' };
}

function* cardCombinations(cards: readonly Card[], size: number, start = 0, picked: Card[] = []): Generator<Card[]> {
  if (picked.length === size) {
    yield [...picked];
    return;
  }
  const stillNeeded = size - picked.length;
  for (let index = start; index <= cards.length - stillNeeded; index += 1) {
    picked.push(cards[index]);
    yield* cardCombinations(cards, size, index + 1, picked);
    picked.pop();
  }
}

/** Finds the weakest legal response without mutating the player's hand. */
export function findRecommendedPlay(
  cards: readonly Card[],
  lead: HandAnalysis,
  main: Rank,
): PlayRecommendation | null {
  const directSizes = new Set([lead.length, ...(lead.kind === 'single' ? [2] : [])]);
  const directResponses: HandAnalysis[] = [];

  for (const size of directSizes) {
    if (size > cards.length) continue;
    for (const candidateCards of cardCombinations(cards, size)) {
      const result = validatePlay(candidateCards, lead, main);
      if (result.legal && result.hand && !isBomb(result.hand)) directResponses.push(result.hand);
    }
  }

  if (directResponses.length > 0) {
    directResponses.sort((left, right) => {
      const leftKindPriority = left.isDifference ? 1 : 0;
      const rightKindPriority = right.isDifference ? 1 : 0;
      if (leftKindPriority !== rightKindPriority) return leftKindPriority - rightKindPriority;
      const leftRank = left.rank ? (left.rank === main ? 13 : rankIndex(left.rank)) : rankIndex(left.startRank ?? '3');
      const rightRank = right.rank ? (right.rank === main ? 13 : rankIndex(right.rank)) : rankIndex(right.startRank ?? '3');
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (left.wildCount !== right.wildCount) return left.wildCount - right.wildCount;
      return 0;
    });
    const best = directResponses[0];
    return { cardIds: best.cards.map((card) => card.id), kind: best.kind, isDifference: best.isDifference };
  }

  const bombSizes = new Set<number>([lead.length]);
  for (let size = 2; size <= Math.min(cards.length, 6); size += 1) bombSizes.add(size);
  const bombResponses: HandAnalysis[] = [];
  for (const size of bombSizes) {
    if (size > cards.length) continue;
    for (const candidateCards of cardCombinations(cards, size)) {
      const result = validatePlay(candidateCards, lead, main);
      if (result.legal && result.hand && isBomb(result.hand)) bombResponses.push(result.hand);
    }
  }

  bombResponses.sort((left, right) => {
    const levelDifference = bombLevel(left) - bombLevel(right);
    if (levelDifference !== 0) return levelDifference;
    const leftRank = left.rank ? rankIndex(left.rank) : -1;
    const rightRank = right.rank ? rankIndex(right.rank) : -1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.wildCount !== right.wildCount) return left.wildCount - right.wildCount;
    return left.cards.length - right.cards.length;
  });
  const best = bombResponses[0];
  if (!best) return null;
  return { cardIds: best.cards.map((card) => card.id), kind: best.kind, isDifference: best.isDifference };
}

export { bombLevel };
