import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { MahjongSnapshot } from '../../shared/src/protocol';

interface MahjongPage {
  data: {
    isMyTurn: boolean;
    isListening: boolean;
    canDiscard: boolean;
    availableActions: string[];
    listenTileIds: string[];
    listenOptions: unknown[];
    postDiscardListenWaits: unknown[];
    hand: Array<{ id: string; selected?: boolean }>;
    selectedTileId: string;
    players: Array<{ seat: string; melds: Array<{ tiles: unknown[]; hiddenBacks: number[] }> }>;
    wallSides: Array<{ seat: string; position: string; stacks: Array<{ count: number; replacement: boolean }> }>;
    paymentRows: Array<{ seat: string; before: number; after: number; flow: string }>;
    winAnnouncement: { winnerSeat: string } | null;
  };
  app: { getSnapshot: () => MahjongSnapshot | null; setSnapshot: (snapshot: MahjongSnapshot) => void };
  setData: (patch: Record<string, unknown>) => void;
  runCommand: (type: string, payload: { tileId?: string }) => void;
  onAction: (event: { currentTarget: { dataset: { action: string } } }) => void;
  onTileTap: (event: { currentTarget: { dataset: { id: string } } }) => void;
  updateSnapshot: (snapshot: MahjongSnapshot) => void;
  playDealAnimation: (handNumber: number) => void;
}

function loadPage(): MahjongPage {
  let page: MahjongPage | undefined;
  runInNewContext(readFileSync('miniprogram/pages/mahjong-game/index.js', 'utf8'), {
    Page: (definition: MahjongPage) => { page = definition; },
    require: (request: string) => request.includes('utils/session')
      ? { lostRoomIdentity: () => false, clearStoredIdentity: () => undefined }
      : request.includes('utils/chat') ? { chatMembers: () => [] } : { commandFor: () => ({}) },
  });
  if (!page) throw new Error('Mahjong page was not registered');
  page.setData = (patch) => Object.assign(page!.data, patch);
  return page;
}

describe('Mini-program Mahjong hand interaction', () => {
  it('discards on a quick second tap of the same tile, but not on the first tap', () => {
    const page = loadPage();
    const runCommand = vi.fn();
    page.runCommand = runCommand;
    Object.assign(page.data, {
      isMyTurn: true, isListening: false, canDiscard: true,
      availableActions: ['discard'], listenTileIds: [], listenOptions: [],
      hand: [{ id: 'tile-1' }, { id: 'tile-2' }], selectedTileId: '',
    });
    const tap = { currentTarget: { dataset: { id: 'tile-1' } } };

    page.onTileTap(tap);
    expect(page.data.selectedTileId).toBe('tile-1');
    expect(runCommand).not.toHaveBeenCalled();

    page.onTileTap(tap);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith('discard', { tileId: 'tile-1' });
    expect(page.data.selectedTileId).toBe('');
  });

  it('does not discard when only the listen action is available', () => {
    const page = loadPage();
    const runCommand = vi.fn();
    page.runCommand = runCommand;
    Object.assign(page.data, {
      isMyTurn: true, isListening: false, canDiscard: false,
      availableActions: ['listen'], listenTileIds: [], listenOptions: [],
      hand: [{ id: 'tile-1' }], selectedTileId: '',
    });
    const tap = { currentTarget: { dataset: { id: 'tile-1' } } };
    page.onTileTap(tap);
    page.onTileTap(tap);

    expect(runCommand).not.toHaveBeenCalled();
    expect(page.data.selectedTileId).toBe('tile-1');
  });

  it('confirms listening after an ordinary discard without requiring the discarded tile to remain selected', () => {
    const page = loadPage();
    const runCommand = vi.fn();
    page.runCommand = runCommand;
    Object.assign(page.data, {
      selectedTileId: '', listenTileIds: [], postDiscardListenWaits: [{ id: 'wait-1' }],
    });

    page.onAction({ currentTarget: { dataset: { action: 'listen' } } });

    expect(runCommand).toHaveBeenCalledExactlyOnceWith('listen', {});
  });

  it('prepares four hidden backs for another player’s concealed kong', () => {
    const page = loadPage();
    page.app = { getSnapshot: () => null, setSnapshot: () => undefined };
    page.playDealAnimation = () => undefined;
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'playing', handNumber: 1,
        players: [
          { seat: 'A', nickname: '甲', handCount: 10, score: 1000, melds: [{ kind: 'concealed-kong', tiles: [] }], discards: [] },
          { seat: 'B', nickname: '乙', handCount: 13, score: 1000, melds: [], discards: [] },
        ],
        currentTurn: 'A', awaitingDiscard: true, pendingDiscard: null, responseSeats: [],
        wallCount: 0, wallLayout: { sides: [] }, diceRoll: null, discardRiver: [], settlement: null,
      },
      private: { seat: 'B', hand: [], availableActions: [] },
    } as unknown as MahjongSnapshot;

    page.updateSnapshot(snapshot);

    expect(page.data.players.find((player) => player.seat === 'A')?.melds[0]?.tiles).toHaveLength(0);
    expect(page.data.players.find((player) => player.seat === 'A')?.melds[0]?.hiddenBacks).toHaveLength(4);
  });

  it('keeps the dice break and reserved stacks at fixed positions when rotating the viewer', () => {
    const page = loadPage();
    page.app = { getSnapshot: () => null, setSnapshot: () => undefined };
    page.playDealAnimation = () => undefined;
    const publicState = {
      gameId: 'mahjong', phase: 'playing', handNumber: 1, players: [], currentTurn: 'A', awaitingDiscard: true,
      pendingDiscard: null, responseSeats: [], wallCount: 4,
      wallLayout: {
        breakSide: 'C', replacementSide: 'C', breakStack: 2,
        sides: [{
          seat: 'C', liveTiles: 2, replacementTiles: 2,
          stacks: Array.from({ length: 17 }, (_, index) => ({ index, liveTiles: index === 2 ? 2 : 0, replacementTiles: index === 0 ? 2 : 0 })),
        }],
      },
      diceRoll: [1, 1], discardRiver: [], settlement: null,
    };
    const snapshot = (seat: 'A' | 'C') => ({ public: publicState, private: { seat, hand: [], availableActions: [] } }) as unknown as MahjongSnapshot;

    page.updateSnapshot(snapshot('A'));
    const opposite = page.data.wallSides[0]!;
    expect(opposite.position).toBe('top');
    expect(opposite.stacks).toHaveLength(17);
    expect(opposite.stacks[0]?.replacement).toBe(true);
    expect(opposite.stacks[1]?.count).toBe(0);
    expect(opposite.stacks[2]?.count).toBe(2);

    page.updateSnapshot(snapshot('C'));
    const ownWall = page.data.wallSides[0]!;
    expect(ownWall.position).toBe('bottom');
    expect(ownWall.stacks[16]?.replacement).toBe(true);
  });

  it('marks the winner before settlement and shows all four score flows afterward', () => {
    const page = loadPage();
    page.app = { getSnapshot: () => null, setSnapshot: () => undefined };
    page.playDealAnimation = () => undefined;
    const seats = ['A', 'B', 'C', 'D'];
    const players = seats.map((seat, index) => ({ seat, nickname: ['甲', '乙', '丙', '丁'][index], handCount: 13, score: 1000, melds: [], discards: [] }));
    const base = {
      gameId: 'mahjong', phase: 'playing', handNumber: 1, players, currentTurn: null, awaitingDiscard: false,
      pendingDiscard: null, responseSeats: [], wallCount: 0, wallLayout: { sides: [] }, diceRoll: null, discardRiver: [],
    };
    page.updateSnapshot({
      public: { ...base, winAnnouncement: { winnerSeat: 'B', winnerNickname: '乙', type: 'self-draw', winPattern: 'standard' }, settlement: null },
      private: { seat: 'A', hand: [], availableActions: [] },
    } as unknown as MahjongSnapshot);
    expect(page.data.players.find((player) => player.seat === 'B')).toMatchObject({ isWinner: true });
    expect(page.data.winAnnouncement?.winnerSeat).toBe('B');
    expect(page.data.paymentRows).toHaveLength(0);

    page.updateSnapshot({
      public: {
        ...base, phase: 'settled', players: players.map((player) => ({ ...player, score: player.seat === 'B' ? 1003 : 999 })),
        winAnnouncement: null,
        settlement: { winnerSeat: 'B', winnerNickname: '乙', type: 'self-draw', payments: { A: -1, B: 3, C: -1, D: -1 }, transfers: [
          { from: 'A', to: 'B', amount: 1 }, { from: 'C', to: 'B', amount: 1 }, { from: 'D', to: 'B', amount: 1 },
        ] },
      },
      private: { seat: 'A', hand: [], availableActions: [] },
    } as unknown as MahjongSnapshot);
    expect(page.data.winAnnouncement).toBeNull();
    expect(page.data.paymentRows).toHaveLength(4);
    expect(page.data.paymentRows.find((row) => row.seat === 'A')).toMatchObject({ before: 1000, after: 999, flow: '付 乙 1' });
    expect(page.data.paymentRows.find((row) => row.seat === 'B')?.flow).toContain('收 丁 1');
  });
});
