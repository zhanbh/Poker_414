import { Rank, rankIndex } from './cards';
import { analyzeHand, HandAnalysis, HandKind, isBomb } from './hand-types';

export type PlayDeclaration = HandKind | 'difference';

export interface PlayResult {
  readonly legal: boolean;
  readonly hand: HandAnalysis | null;
  readonly clearsTrick: boolean;
  readonly reason?: string;
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

export { bombLevel };
