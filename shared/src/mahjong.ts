export const MAHJONG_SEATS = ['A', 'B', 'C', 'D'] as const;
export type MahjongSeat = typeof MAHJONG_SEATS[number];

export const MAHJONG_SEAT_LABELS: Readonly<Record<MahjongSeat, string>> = {
  A: '东家',
  B: '南家',
  C: '西家',
  D: '北家',
};

export type MahjongSuit = 'characters' | 'bamboo' | 'dots' | 'winds' | 'dragons';
export type MahjongRank = number | 'east' | 'south' | 'west' | 'north' | 'red';

export interface MahjongTile {
  readonly id: string;
  readonly suit: MahjongSuit;
  readonly rank: MahjongRank;
  readonly label: string;
  readonly order: number;
}

export type MahjongMeldKind = 'chi' | 'peng' | 'exposed-kong' | 'added-kong' | 'concealed-kong';

export interface MahjongMeld {
  readonly kind: MahjongMeldKind;
  readonly tiles: MahjongTile[];
}

const SUIT_LABELS: Readonly<Record<MahjongSuit, string>> = {
  characters: '万',
  bamboo: '条',
  dots: '筒',
  winds: '',
  dragons: '',
};

const HONOR_LABELS: Readonly<Record<Exclude<MahjongRank, number>, string>> = {
  east: '东',
  south: '南',
  west: '西',
  north: '北',
  red: '中',
};

const HONOR_ORDER: ReadonlyArray<{ readonly suit: 'winds' | 'dragons'; readonly rank: Exclude<MahjongRank, number> }> = [
  { suit: 'winds', rank: 'east' },
  { suit: 'winds', rank: 'south' },
  { suit: 'winds', rank: 'west' },
  { suit: 'winds', rank: 'north' },
  { suit: 'dragons', rank: 'red' },
];

export function tileKey(tile: Pick<MahjongTile, 'suit' | 'rank'>): string {
  return tile.suit + ':' + tile.rank;
}

export function createMahjongDeck(): MahjongTile[] {
  const tiles: MahjongTile[] = [];
  let order = 0;
  for (const suit of ['characters', 'bamboo', 'dots'] as const) {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push({ id: `${suit}-${rank}-${copy}`, suit, rank, label: rank + SUIT_LABELS[suit], order: order++ });
      }
    }
  }
  for (const entry of HONOR_ORDER) {
    for (let copy = 0; copy < 4; copy += 1) {
      tiles.push({ id: `${entry.suit}-${entry.rank}-${copy}`, suit: entry.suit, rank: entry.rank, label: HONOR_LABELS[entry.rank], order: order++ });
    }
  }
  return tiles;
}

export function sortMahjongTiles(tiles: readonly MahjongTile[]): MahjongTile[] {
  return [...tiles].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function nextMahjongSeat(seat: MahjongSeat): MahjongSeat {
  return MAHJONG_SEATS[(MAHJONG_SEATS.indexOf(seat) + 1) % MAHJONG_SEATS.length];
}

function isNumbered(tile: Pick<MahjongTile, 'suit' | 'rank'>): tile is Pick<MahjongTile, 'suit' | 'rank'> & { readonly rank: number } {
  return tile.suit === 'characters' || tile.suit === 'bamboo' || tile.suit === 'dots';
}

function countsFor(tiles: readonly MahjongTile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tile of tiles) counts.set(tileKey(tile), (counts.get(tileKey(tile)) ?? 0) + 1);
  return counts;
}

function isRedCenter(tile: Pick<MahjongTile, 'suit' | 'rank'>): boolean {
  return tile.suit === 'dragons' && tile.rank === 'red';
}

function isSevenPairs(tiles: readonly MahjongTile[]): boolean {
  if (tiles.length !== 14) return false;
  const jokers = tiles.filter(isRedCenter).length;
  const counts = countsFor(tiles.filter((tile) => !isRedCenter(tile)));
  const oddCount = [...counts.values()].filter((count) => count % 2 === 1).length;
  return oddCount <= jokers && (jokers - oddCount) % 2 === 0;
}

function removeMelds(counts: Map<string, number>, orderedKeys: readonly string[], jokers: number): boolean {
  const first = orderedKeys.find((key) => (counts.get(key) ?? 0) > 0);
  if (!first) return jokers % 3 === 0;
  const count = counts.get(first) ?? 0;
  for (let used = 1; used <= Math.min(3, count); used += 1) {
    const missing = 3 - used;
    if (missing > jokers) continue;
    counts.set(first, count - used);
    if (removeMelds(counts, orderedKeys, jokers - missing)) return true;
    counts.set(first, count);
  }
  const [suit, rawRank] = first.split(':');
  const rank = Number(rawRank);
  if ((suit === 'characters' || suit === 'bamboo' || suit === 'dots') && Number.isInteger(rank)) {
    for (const start of [rank - 2, rank - 1, rank]) {
      if (start < 1 || start > 7) continue;
      const sequence = [start, start + 1, start + 2].map((value) => suit + ':' + value);
      if (!sequence.includes(first)) continue;
      const consumed: string[] = [];
      let missing = 0;
      for (const key of sequence) {
        const available = counts.get(key) ?? 0;
        if (available > 0) {
          counts.set(key, available - 1);
          consumed.push(key);
        } else {
          missing += 1;
        }
      }
      if (missing <= jokers && removeMelds(counts, orderedKeys, jokers - missing)) return true;
      consumed.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
    }
  }
  return false;
}

export function isWinningMahjongHand(tiles: readonly MahjongTile[], meldCount = 0): boolean {
  const expected = (4 - meldCount) * 3 + 2;
  if (tiles.length !== expected) return false;
  if (meldCount === 0 && isSevenPairs(tiles)) return true;
  const jokers = tiles.filter(isRedCenter).length;
  const counts = countsFor(tiles.filter((tile) => !isRedCenter(tile)));
  const keys = [...counts.keys()].sort((left, right) => {
    const [leftSuit, leftRank] = left.split(':');
    const [rightSuit, rightRank] = right.split(':');
    return (leftSuit + leftRank).localeCompare(rightSuit + rightRank);
  });
  for (const [pairKey, pairCount] of counts) {
    for (let used = 1; used <= Math.min(2, pairCount); used += 1) {
      const missing = 2 - used;
      if (missing > jokers) continue;
      const remaining = new Map(counts);
      remaining.set(pairKey, pairCount - used);
      if (removeMelds(remaining, keys, jokers - missing)) return true;
    }
  }
  return jokers >= 2 && removeMelds(new Map(counts), keys, jokers - 2);
}

export function isMahjongTerminal(tile: Pick<MahjongTile, 'suit' | 'rank'>): boolean {
  return isNumbered(tile) && (tile.rank === 1 || tile.rank === 9);
}

export function isBigWindWin(hand: readonly MahjongTile[], winningTile: MahjongTile): boolean {
  return matchingTileCount(hand, winningTile) === 3;
}

export function mahjongTileKinds(): MahjongTile[] {
  const kinds = new Map<string, MahjongTile>();
  for (const tile of createMahjongDeck()) {
    const key = tileKey(tile);
    if (!kinds.has(key)) kinds.set(key, tile);
  }
  return [...kinds.values()];
}

export function mahjongWaits(hand: readonly MahjongTile[], meldCount = 0, baoTile?: MahjongTile): MahjongTile[] {
  if (hand.length !== (4 - meldCount) * 3 + 1) return [];
  return mahjongTileKinds().filter((tile) => isWinningMahjongHand([...hand, tile], meldCount)
    || isBigWindWin(hand, tile)
    || Boolean(baoTile && tileKey(tile) === tileKey(baoTile)));
}

export function hasMahjongListenYao(hand: readonly MahjongTile[], winningTile: MahjongTile, baoTile?: MahjongTile): boolean {
  return hand.some((tile) => isMahjongTerminal(tile) || isRedCenter(tile))
    || isMahjongTerminal(winningTile)
    || Boolean(baoTile && tileKey(winningTile) === tileKey(baoTile));
}

export function findTilesByKey(hand: readonly MahjongTile[], key: string, count: number): MahjongTile[] {
  return hand.filter((tile) => tileKey(tile) === key).slice(0, count);
}

export function findChiOptions(hand: readonly MahjongTile[], discard: MahjongTile): MahjongTile[][] {
  if (!isNumbered(discard)) return [];
  const options: MahjongTile[][] = [];
  for (const start of [discard.rank - 2, discard.rank - 1, discard.rank]) {
    if (start < 1 || start > 7 || discard.rank < start || discard.rank > start + 2) continue;
    const keys = [start, start + 1, start + 2].map((rank) => `${discard.suit}:${rank}`);
    const selected: MahjongTile[] = [];
    for (const key of keys) {
      if (key === tileKey(discard)) continue;
      const tile = hand.find((candidate) => tileKey(candidate) === key && !selected.some((item) => item.id === candidate.id));
      if (tile) selected.push(tile);
    }
    if (selected.length === 2) options.push(selected);
  }
  return options;
}

export function matchingTileCount(hand: readonly MahjongTile[], tile: MahjongTile): number {
  return hand.filter((candidate) => tileKey(candidate) === tileKey(tile)).length;
}
