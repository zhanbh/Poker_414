import { describe, expect, it } from 'vitest';
import { createDeck, joker, standardCard } from '../src/cards';
import { analyzeHand, getHandOptions } from '../src/hand-types';
import { canBeat, validatePlay } from '../src/rules';
import { canBurst, findBurstCandidates } from '../src/rule-engine';

describe('基础牌模型与单牌规则', () => {
  it('创建一副不重复的54张牌', () => {
    const deck = createDeck();

    expect(deck).toHaveLength(54);
    expect(new Set(deck.map((card) => card.id)).size).toBe(54);
    expect(deck.filter((card) => card.kind === 'joker')).toHaveLength(2);
  });

  it('普通单牌必须贴着管，但2和主可以跳管', () => {
    const main = 'K' as const;
    const lead = analyzeHand([standardCard('5', 'spades')], main);
    const six = analyzeHand([standardCard('6', 'hearts')], main);
    const seven = analyzeHand([standardCard('7', 'clubs')], main);
    const two = analyzeHand([standardCard('2', 'diamonds')], main);
    const trump = analyzeHand([standardCard(main, 'spades')], main);

    expect(lead).not.toBeNull();
    expect(six).not.toBeNull();
    expect(seven).not.toBeNull();
    expect(two).not.toBeNull();
    expect(trump).not.toBeNull();
    expect(canBeat(six!, lead!, main)).toBe(true);
    expect(canBeat(seven!, lead!, main)).toBe(false);
    expect(canBeat(two!, lead!, main)).toBe(true);
    expect(canBeat(trump!, lead!, main)).toBe(true);
    expect(validatePlay([standardCard('7', 'clubs')], lead!, main).legal).toBe(false);
  });

  it('主为3时牌力顺序是4-A<2<3，普通对子也必须贴着管', () => {
    const ace = analyzeHand([standardCard('A', 'spades')], '3');
    const two = analyzeHand([standardCard('2', 'hearts')], '3');
    const mainThree = analyzeHand([standardCard('3', 'clubs')], '3');
    const pairLead = analyzeHand([standardCard('5', 'spades'), standardCard('5', 'hearts')], 'K');
    const pairNext = analyzeHand([standardCard('6', 'spades'), standardCard('6', 'hearts')], 'K');
    const pairJump = analyzeHand([standardCard('8', 'spades'), standardCard('8', 'hearts')], 'K');
    const pairTwo = analyzeHand([standardCard('2', 'spades'), standardCard('2', 'hearts')], 'K');

    expect(canBeat(two!, ace!, '3')).toBe(true);
    expect(canBeat(mainThree!, two!, '3')).toBe(true);
    expect(pairLead?.kind).toBe('pair');
    expect(canBeat(pairNext!, pairLead!, 'K')).toBe(true);
    expect(canBeat(pairJump!, pairLead!, 'K')).toBe(false);
    expect(canBeat(pairTwo!, pairLead!, 'K')).toBe(true);
  });

  it('顺子和连对必须同长度并整体贴着管，主牌在其中按普通牌处理', () => {
    const sequenceLead = analyzeHand(
      [standardCard('3', 'spades'), standardCard('4', 'hearts'), standardCard('5', 'clubs')],
      '5',
    );
    const sequenceNext = analyzeHand(
      [standardCard('4', 'spades'), standardCard('5', 'hearts'), standardCard('6', 'clubs')],
      '5',
    );
    const sequenceJump = analyzeHand(
      [standardCard('5', 'spades'), standardCard('6', 'hearts'), standardCard('7', 'clubs')],
      '5',
    );
    const pairsLead = analyzeHand(
      [standardCard('3', 'spades'), standardCard('3', 'hearts'), standardCard('4', 'clubs'), standardCard('4', 'diamonds'), standardCard('5', 'spades'), standardCard('5', 'hearts')],
      'K',
    );
    const pairsNext = analyzeHand(
      [standardCard('4', 'spades'), standardCard('4', 'hearts'), standardCard('5', 'clubs'), standardCard('5', 'diamonds'), standardCard('6', 'spades'), standardCard('6', 'hearts')],
      'K',
    );

    expect(sequenceLead?.kind).toBe('sequence');
    expect(sequenceLead?.startRank).toBe('3');
    expect(sequenceNext?.kind).toBe('sequence');
    expect(canBeat(sequenceNext!, sequenceLead!, '5')).toBe(true);
    expect(canBeat(sequenceJump!, sequenceLead!, '5')).toBe(false);
    expect(pairsLead?.kind).toBe('consecutive-pairs');
    expect(pairsNext?.kind).toBe('consecutive-pairs');
    expect(canBeat(pairsNext!, pairsLead!, 'K')).toBe(true);
  });

  it('王只能配牌，414中只能替代4而不能替代A', () => {
    const real414 = analyzeHand(
      [standardCard('4', 'spades'), standardCard('4', 'hearts'), standardCard('A', 'clubs')],
      'K',
    );
    const mixed414 = analyzeHand(
      [standardCard('4', 'spades'), joker('small'), standardCard('A', 'clubs')],
      'K',
    );
    const allWildFour = analyzeHand(
      [joker('small'), joker('big'), standardCard('A', 'clubs')],
      'K',
    );
    const invalidAceSubstitute = analyzeHand(
      [standardCard('4', 'spades'), standardCard('4', 'hearts'), joker('small')],
      'K',
    );
    const jokerSingle = analyzeHand([joker('small')], 'K');

    expect(real414?.kind).toBe('414');
    expect(mixed414?.kind).toBe('414');
    expect(allWildFour?.kind).toBe('414');
    expect(invalidAceSubstitute?.kind).toBe('ordinary-bomb');
    expect(jokerSingle).toBeNull();
  });

  it('王可以填补顺子或连对的缺口，但不能跨越2或环绕', () => {
    const sequenceWithJoker = analyzeHand(
      [standardCard('3', 'spades'), standardCard('4', 'hearts'), joker('small'), standardCard('6', 'clubs')],
      'K',
    );
    const pairsWithJoker = analyzeHand(
      [standardCard('3', 'spades'), standardCard('3', 'hearts'), standardCard('4', 'clubs'), joker('small'), standardCard('5', 'spades'), standardCard('5', 'hearts')],
      'K',
    );
    const sequenceWithTwo = analyzeHand(
      [standardCard('Q', 'spades'), standardCard('K', 'hearts'), standardCard('A', 'clubs'), standardCard('2', 'diamonds')],
      'K',
    );

    expect(sequenceWithJoker?.kind).toBe('sequence');
    expect(sequenceWithJoker?.startRank).toBe('3');
    expect(pairsWithJoker?.kind).toBe('consecutive-pairs');
    expect(sequenceWithTwo).toBeNull();
  });

  it('识别普通炸、主炸、414，并按炸牌阶梯比较', () => {
    const ordinaryThree = analyzeHand(
      [standardCard('5', 'spades'), standardCard('5', 'hearts'), standardCard('5', 'clubs')],
      '6',
    );
    const mainTwo = analyzeHand(
      [standardCard('6', 'spades'), standardCard('6', 'hearts')],
      '6',
    );
    const fourOneFour = analyzeHand(
      [standardCard('4', 'spades'), standardCard('4', 'hearts'), standardCard('A', 'clubs')],
      '6',
    );
    const ordinaryFourWithJoker = analyzeHand(
      [standardCard('5', 'spades'), standardCard('5', 'hearts'), standardCard('5', 'clubs'), joker('small')],
      '6',
    );
    const mainThree = analyzeHand(
      [standardCard('6', 'spades'), standardCard('6', 'hearts'), standardCard('6', 'clubs')],
      '6',
    );
    const naturalThree = analyzeHand(
      [standardCard('6', 'spades'), standardCard('6', 'hearts'), standardCard('6', 'clubs')],
      'K',
    );
    const fakeThree = analyzeHand(
      [standardCard('6', 'spades'), standardCard('6', 'hearts'), joker('small')],
      'K',
    );

    expect(ordinaryThree?.kind).toBe('ordinary-bomb');
    expect(mainTwo?.kind).toBe('main-bomb');
    expect(fourOneFour?.kind).toBe('414');
    expect(ordinaryFourWithJoker?.bombCount).toBe(4);
    expect(mainThree?.kind).toBe('main-bomb');
    expect(naturalThree?.kind).toBe('ordinary-bomb');
    expect(fakeThree?.wildCount).toBe(1);
    expect(canBeat(mainTwo!, ordinaryThree!, '6')).toBe(true);
    expect(canBeat(fourOneFour!, mainTwo!, '6')).toBe(true);
    expect(canBeat(ordinaryFourWithJoker!, fourOneFour!, '6')).toBe(true);
    expect(canBeat(mainThree!, ordinaryFourWithJoker!, '6')).toBe(true);
    expect(canBeat(naturalThree!, fakeThree!, 'K')).toBe(true);
    expect(canBeat(ordinaryThree!, ordinaryFourWithJoker!, '6')).toBe(false);
  });

  it('差牌只能在回应同点数单牌时声明，且一旦成立不可被压过', () => {
    const lead = analyzeHand([standardCard('5', 'spades')], 'K');
    const difference = validatePlay(
      [standardCard('5', 'hearts'), joker('small')],
      lead,
      'K',
      'difference',
    );
    const wrongRank = validatePlay(
      [standardCard('6', 'hearts'), joker('small')],
      lead,
      'K',
      'difference',
    );
    const cannotLead = validatePlay(
      [standardCard('5', 'hearts'), standardCard('5', 'clubs')],
      null,
      'K',
      'difference',
    );

    expect(difference.legal).toBe(true);
    expect(difference.hand?.isDifference).toBe(true);
    expect(difference.clearsTrick).toBe(true);
    expect(wrongRank.legal).toBe(false);
    expect(cannotLead.legal).toBe(false);
  });

  it('连对不能由三张普通炸或两张主炸管，但414和更高炸可以', () => {
    const lead = analyzeHand(
      [standardCard('3', 'spades'), standardCard('3', 'hearts'), standardCard('4', 'clubs'), standardCard('4', 'diamonds'), standardCard('5', 'spades'), standardCard('5', 'hearts')],
      '6',
    );
    const ordinaryThree = analyzeHand(
      [standardCard('7', 'spades'), standardCard('7', 'hearts'), standardCard('7', 'clubs')],
      '6',
    );
    const mainTwo = analyzeHand(
      [standardCard('6', 'spades'), standardCard('6', 'hearts')],
      '6',
    );
    const ordinaryFour = analyzeHand(
      [standardCard('7', 'spades'), standardCard('7', 'hearts'), standardCard('7', 'clubs'), joker('small')],
      '6',
    );
    const fourOneFour = analyzeHand(
      [standardCard('4', 'spades'), standardCard('4', 'hearts'), standardCard('A', 'clubs')],
      '6',
    );
    const mainThree = analyzeHand(
      [standardCard('6', 'spades'), standardCard('6', 'hearts'), standardCard('6', 'clubs')],
      '6',
    );

    expect(canBeat(ordinaryThree!, lead!, '6')).toBe(false);
    expect(canBeat(mainTwo!, lead!, '6')).toBe(false);
    expect(canBeat(ordinaryFour!, lead!, '6')).toBe(true);
    expect(canBeat(fourOneFour!, lead!, '6')).toBe(true);
    expect(canBeat(mainThree!, lead!, '6')).toBe(true);
  });

  it('可查询同一组选牌的多种解释，交由出牌声明选择', () => {
    const options = getHandOptions(
      [standardCard('5', 'spades'), standardCard('5', 'hearts')],
      '5',
    );

    expect(options.some((option) => option.kind === 'main-bomb')).toBe(true);
    expect(options.some((option) => option.kind === 'pair')).toBe(true);
  });

  it('爆牌只判断全部剩余手牌是否能组成一手可首出的牌型', () => {
    const cases = [
      [standardCard('4', 'spades'), standardCard('4', 'hearts'), standardCard('4', 'clubs')],
      [standardCard('3', 'spades'), standardCard('4', 'hearts'), standardCard('5', 'clubs'), standardCard('6', 'diamonds')],
      [standardCard('3', 'spades'), standardCard('3', 'hearts'), standardCard('4', 'clubs'), standardCard('4', 'diamonds'), standardCard('5', 'spades'), standardCard('5', 'hearts')],
      [standardCard('4', 'spades'), standardCard('4', 'hearts'), standardCard('A', 'clubs')],
    ];

    expect(cases.every((cards) => canBurst(cards, 'K'))).toBe(true);
    expect(findBurstCandidates(cases[3], 'K').some((candidate) => candidate.kind === '414')).toBe(true);
    expect(canBurst([joker('small')], 'K')).toBe(false);
  });
});
