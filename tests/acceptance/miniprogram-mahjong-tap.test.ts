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
    hand: Array<{ id: string; selected?: boolean }>;
    selectedTileId: string;
    players: Array<{ seat: string; melds: Array<{ tiles: unknown[]; hiddenBacks: number[] }> }>;
  };
  app: { getSnapshot: () => MahjongSnapshot | null; setSnapshot: (snapshot: MahjongSnapshot) => void };
  setData: (patch: Record<string, unknown>) => void;
  runCommand: (type: string, payload: { tileId: string }) => void;
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
});
