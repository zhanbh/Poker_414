import { describe, expect, it } from 'vitest';
import { createMahjongDeck, isBigWindWin, isWinningMahjongHand, mahjongWaits, MahjongMeld, sortMahjongTiles } from '../src/mahjong';

describe('Mahjong shared rules', () => {
  it('creates a 128-tile deck without green and white dragons', () => {
    const deck = createMahjongDeck();
    expect(deck).toHaveLength(128);
    expect(new Set(deck.map((tile) => tile.id)).size).toBe(128);
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
});
