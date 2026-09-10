import { describe, expect, it } from 'vitest';
import { joker, sortCards, standardCard } from '../src/cards';

describe('手牌展示排序', () => {
  it('按普通牌、2、主、大小王排序，并按花色稳定排列', () => {
    const cards = [
      standardCard('5', 'spades', 'main-5'),
      standardCard('2', 'clubs', 'two'),
      standardCard('3', 'spades', 'three-spades'),
      standardCard('3', 'clubs', 'three-clubs'),
      standardCard('5', 'diamonds', 'ordinary-5'),
      joker('big', 'big'),
      joker('small', 'small'),
    ];

    expect(sortCards(cards, '5').map((card) => card.id)).toEqual([
      'three-clubs', 'three-spades', 'two', 'ordinary-5', 'main-5', 'small', 'big',
    ]);
  });

  it('将414牌型整理成连续的一组', () => {
    const cards = [
      standardCard('A', 'hearts', 'ace'),
      standardCard('4', 'spades', 'four'),
      joker('small', 'wild'),
      standardCard('3', 'clubs', 'three'),
      standardCard('2', 'diamonds', 'two'),
    ];

    expect(sortCards(cards, '5').map((card) => card.id)).toEqual(['three', 'four', 'wild', 'ace', 'two']);
  });
});
