import { describe, expect, it } from 'vitest';
import { createMahjongDeck, hasMahjongListenYao, hasMahjongPairStructure, isBigWindWin, isWinningMahjongHand, mahjongWaits, MahjongMeld, sortMahjongTiles } from '../src/mahjong';

describe('Mahjong shared rules', () => {
  it('creates the standard 136-tile deck including green and white dragons', () => {
    const deck = createMahjongDeck();
    expect(deck).toHaveLength(136);
    expect(new Set(deck.map((tile) => tile.id)).size).toBe(136);
    expect(deck.some((tile) => tile.label === '發')).toBe(true);
    expect(deck.some((tile) => tile.label === '白')).toBe(true);
  });

  it('recognizes a standard hand and seven pairs', () => {
    const deck = createMahjongDeck();
    const byLabel = new Map<string, typeof deck[number]>();
    for (const tile of deck) if (!byLabel.has(tile.label)) byLabel.set(tile.label, tile);
    const standard = ['1万', '2万', '3万', '4万', '5万', '6万', '7万', '8万', '9万', '东', '东', '东', '中', '中'].map((label) => byLabel.get(label)!);
    expect(isWinningMahjongHand(standard)).toBe(true);
    const pairs = ['1万', '1万', '2万', '2万', '3万', '3万', '东', '东', '南', '南', '中', '中', '北', '北'].map((label) => {
      const matches = deck.filter((tile) => tile.label === label);
      return matches.shift()!;
    });
    expect(isWinningMahjongHand(sortMahjongTiles(pairs))).toBe(true);
  });

  it('red center only satisfies the terminal-tile listening restriction and is never a joker', () => {
    const deck = createMahjongDeck();
    const tile = (suit: string, rank: number | string, copy = 0) => deck.find((candidate) => candidate.suit === suit && candidate.rank === rank && candidate.id.endsWith('-' + copy))!;
    const hand = [tile('characters', 5), tile('characters', 6), tile('characters', 7), tile('bamboo', 1)];
    const red = tile('dragons', 'red');

    expect(isWinningMahjongHand([...hand, red], 3)).toBe(false);
    expect(isWinningMahjongHand([...hand, tile('bamboo', 1, 1)], 3)).toBe(true);
    expect(mahjongWaits(hand, 3).map((wait) => wait.label)).not.toContain('中');

    const byLabel = new Map<string, typeof deck>();
    for (const candidate of deck) byLabel.set(candidate.label, [...(byLabel.get(candidate.label) ?? []), candidate]);
    const falseSevenPairs = ['1万', '1万', '2万', '2万', '3万', '3万', '4万', '4万', '5万', '5万', '6万', '6万', '东', '中']
      .map((label) => byLabel.get(label)!.shift()!);
    expect(isWinningMahjongHand(falseSevenPairs)).toBe(false);
  });

  it('counts a terminal tile in an exposed chi toward the listening requirement', () => {
    const deck = createMahjongDeck();
    const tile = (suit: string, rank: number | string) => deck.find((candidate) => candidate.suit === suit && candidate.rank === rank)!;
    const hand = [tile('characters', 5), tile('characters', 6), tile('characters', 7)];
    const chi: MahjongMeld = { kind: 'chi', tiles: [tile('dots', 1), tile('dots', 2), tile('dots', 3)] };

    expect(hasMahjongListenYao(hand, tile('bamboo', 2))).toBe(false);
    expect(hasMahjongListenYao(hand, tile('bamboo', 2), [chi])).toBe(true);
    expect(hasMahjongListenYao(hand, tile('dragons', 'red'))).toBe(true);
  });

  it('includes waits that complete an exposed pong as big-wind self-draws', () => {
    const deck = createMahjongDeck();
    const tile = (suit: string, rank: number | string, copy = 0) => deck.find((candidate) => candidate.suit === suit && candidate.rank === rank && candidate.id.endsWith('-' + copy))!;
    const pongs: MahjongMeld[] = [
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 2, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('bamboo', 3, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 6, copy)) },
    ];
    const hand = [tile('characters', 5), tile('characters', 6), tile('characters', 7), tile('bamboo', 1)];
    const waits = mahjongWaits(hand, 3, pongs).map((wait) => wait.label);

    expect(waits).toEqual(expect.arrayContaining(['1条', '2筒', '3条', '6筒']));
    expect(isBigWindWin(hand, tile('dots', 2, 3), pongs)).toBe(true);
    expect(isBigWindWin(hand, tile('dots', 4), pongs)).toBe(false);
  });

  it('does not allow a big-wind tile to make a scattered hand ready', () => {
    const deck = createMahjongDeck();
    const tile = (suit: string, rank: number | string, copy = 0) => deck.find((candidate) => candidate.suit === suit && candidate.rank === rank && candidate.id.endsWith('-' + copy))!;
    const whitePong: MahjongMeld[] = [{ kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dragons', 'white', copy)) }];
    const hand = [
      tile('characters', 3), tile('characters', 3, 1), tile('characters', 5),
      tile('bamboo', 1), tile('bamboo', 2), tile('bamboo', 3),
      tile('bamboo', 5), tile('bamboo', 5, 1), tile('bamboo', 6), tile('dots', 3),
    ];

    expect(isBigWindWin(hand, tile('dragons', 'white', 3), whitePong)).toBe(true);
    expect(mahjongWaits(hand, 1, whitePong)).toEqual([]);
  });

  it('accepts two pairs or a triplet, but rejects concealed sequences with only one pair', () => {
    const deck = createMahjongDeck();
    const copies = (suit: string, rank: number | string, count: number) => deck
      .filter((tile) => tile.suit === suit && tile.rank === rank).slice(0, count);
    const twoPairs = [...copies('characters', 2, 2), ...copies('dots', 7, 2), ...copies('bamboo', 1, 1)];
    const triplet = copies('dragons', 'green', 3);
    const allSequences = [
      ...copies('characters', 1, 1), ...copies('characters', 2, 1), ...copies('characters', 3, 1),
      ...copies('bamboo', 4, 1), ...copies('bamboo', 5, 1), ...copies('bamboo', 6, 1),
      ...copies('dots', 1, 1), ...copies('dots', 2, 1), ...copies('dots', 3, 1), ...copies('winds', 'east', 2),
    ];
    const onePairPlusChiTile = [copies('winds', 'east', 2)[0]!, copies('winds', 'east', 2)[1]!, copies('characters', 1, 2)[1]!];
    expect(hasMahjongPairStructure(twoPairs)).toBe(true);
    expect(hasMahjongPairStructure(triplet)).toBe(true);
    expect(hasMahjongPairStructure(allSequences)).toBe(false);
    expect(hasMahjongPairStructure(onePairPlusChiTile)).toBe(false);
    expect(hasMahjongPairStructure(onePairPlusChiTile, [{ kind: 'chi', tiles: [
      ...copies('bamboo', 1, 1), ...copies('bamboo', 2, 1), ...copies('bamboo', 3, 1),
    ] }])).toBe(false);
    expect(hasMahjongPairStructure(onePairPlusChiTile, [{ kind: 'concealed-kong', tiles: copies('dots', 6, 4) }])).toBe(true);
    expect(hasMahjongPairStructure(onePairPlusChiTile, [{ kind: 'peng', tiles: copies('dots', 6, 3) }])).toBe(true);
  });
});
