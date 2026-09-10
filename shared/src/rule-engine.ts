import { Card, Rank } from './cards';
import { analyzeHand, getHandOptions, HandAnalysis, HandKind } from './hand-types';

export interface BurstCandidate {
  readonly kind: HandKind;
  readonly wildCount: number;
}

/**
 * 爆牌只判断整手能否一次组成一手可首出的牌，不返回具体配牌方案给公共视图。
 */
export function findBurstCandidates(cards: readonly Card[], main: Rank): BurstCandidate[] {
  const candidates = getHandOptions(cards, main)
    .filter((candidate) => !candidate.isDifference)
    .map((candidate) => ({ kind: candidate.kind, wildCount: candidate.wildCount }));
  const unique = new Map<string, BurstCandidate>();
  for (const candidate of candidates) {
    unique.set(`${candidate.kind}:${candidate.wildCount}`, candidate);
  }
  return [...unique.values()];
}

export function canBurst(cards: readonly Card[], main: Rank): boolean {
  return findBurstCandidates(cards, main).length > 0;
}

export function chooseBurstCandidate(cards: readonly Card[], main: Rank, kind: HandKind): HandAnalysis | null {
  return analyzeHand(cards, main, { declaredKind: kind });
}
