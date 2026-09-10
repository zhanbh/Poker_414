import { describe, expect, it } from 'vitest';
import { joker, standardCard } from '../../shared/src/cards';
import { analyzeHand } from '../../shared/src/hand-types';
import { canBurst } from '../../shared/src/rule-engine';

describe('已确认规则回归', () => {
  it('主牌在顺子中按普通牌，主5时555王是主4炸', () => {
    const sequence = analyzeHand([standardCard('3', 'spades'), standardCard('4', 'hearts'), standardCard('5', 'clubs')], '5');
    const mainFour = analyzeHand([standardCard('5', 'spades'), standardCard('5', 'hearts'), standardCard('5', 'clubs'), joker('small')], '5');

    expect(sequence?.kind).toBe('sequence');
    expect(mainFour?.kind).toBe('main-bomb');
    expect(mainFour?.bombCount).toBe(4);
  });

  it('报爆只接收完整手牌，并覆盖对子、连对和414', () => {
    expect(canBurst([standardCard('4', 'spades'), standardCard('4', 'hearts'), standardCard('4', 'clubs')], 'K')).toBe(true);
    expect(canBurst([standardCard('3', 'spades'), standardCard('3', 'hearts'), standardCard('4', 'clubs'), standardCard('4', 'diamonds'), standardCard('5', 'spades'), standardCard('5', 'hearts')], 'K')).toBe(true);
    expect(canBurst([standardCard('4', 'spades'), standardCard('4', 'hearts'), standardCard('A', 'clubs')], 'K')).toBe(true);
  });
});
