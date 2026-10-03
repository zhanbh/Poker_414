import { describe, expect, it } from 'vitest';
import { createMahjongDeck, isWinningMahjongHand, sortMahjongTiles } from '../src/mahjong';

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
});
