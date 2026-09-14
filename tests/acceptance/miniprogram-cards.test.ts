import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { Card } from '../../shared/src/cards';

const require = createRequire(import.meta.url);
const { displayHand } = require('../../miniprogram/utils/cards') as {
  displayHand: (cards: Card[], main?: string | null) => Array<Card & { label: string }>;
};

describe('小程序手牌展示', () => {
  it('按牌型分组并按牌面排序，而不是沿用发牌随机顺序', () => {
    const cards = [
      { kind: 'standard', id: 'k', suit: 'clubs', rank: 'K' },
      { kind: 'standard', id: '5', suit: 'clubs', rank: '5' },
      { kind: 'standard', id: '8a', suit: 'clubs', rank: '8' },
      { kind: 'standard', id: '8b', suit: 'hearts', rank: '8' },
      { kind: 'standard', id: '3a', suit: 'clubs', rank: '3' },
      { kind: 'standard', id: '3b', suit: 'diamonds', rank: '3' },
      { kind: 'standard', id: '3c', suit: 'hearts', rank: '3' },
    ] as Card[];

    expect(displayHand(cards).map((card) => card.label)).toEqual(['5', 'K', '8', '8', '3', '3', '3']);
  });
});
