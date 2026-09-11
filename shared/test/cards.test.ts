import { describe, expect, it } from 'vitest';
import { joker, sortCards, standardCard } from '../src/cards';

describe('手牌展示排序', () => {
  it('先按单牌、对子、炸牌分组，再按牌面排序', () => {
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
      'two', 'three-clubs', 'three-spades', 'ordinary-5', 'main-5', 'small', 'big',
    ]);
  });

  it('将可灵活解释为414的4和A整理到手牌末尾', () => {
    const cards = [
      standardCard('A', 'hearts', 'ace'),
      standardCard('4', 'spades', 'four'),
      joker('small', 'wild'),
      standardCard('3', 'clubs', 'three'),
      standardCard('2', 'diamonds', 'two'),
    ];

    expect(sortCards(cards, '5').map((card) => card.id)).toEqual(['three', 'two', 'four', 'wild', 'ace']);
  });

  it('按示例将单牌、对子、普通炸和414候选分组', () => {
    const cards = [
      standardCard('4', 'clubs', 'four-1'),
      standardCard('4', 'spades', 'four-2'),
      standardCard('5', 'hearts', 'five'),
      standardCard('6', 'clubs', 'six-1'),
      standardCard('6', 'hearts', 'six-2'),
      standardCard('7', 'clubs', 'seven-1'),
      standardCard('7', 'hearts', 'seven-2'),
      standardCard('8', 'clubs', 'eight-1'),
      standardCard('8', 'hearts', 'eight-2'),
      standardCard('9', 'clubs', 'nine-1'),
      standardCard('9', 'hearts', 'nine-2'),
      standardCard('2', 'clubs', 'two-1'),
      standardCard('2', 'diamonds', 'two-2'),
      standardCard('2', 'hearts', 'two-3'),
      standardCard('A', 'clubs', 'ace-1'),
      standardCard('A', 'diamonds', 'ace-2'),
      standardCard('A', 'hearts', 'ace-3'),
      standardCard('A', 'spades', 'ace-4'),
    ];

    expect(sortCards(cards).map((card) => card.id)).toEqual([
      'five',
      'six-1', 'six-2',
      'seven-1', 'seven-2',
      'eight-1', 'eight-2',
      'nine-1', 'nine-2',
      'two-1', 'two-2', 'two-3',
      'four-1', 'four-2', 'ace-1', 'ace-2', 'ace-3', 'ace-4',
    ]);
  });
});
