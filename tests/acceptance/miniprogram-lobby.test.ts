import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { RoomSnapshot } from '../../shared/src/protocol';

interface LobbyPageDefinition {
  data: { players: unknown[]; playerCount?: number; full?: boolean };
  app: { setSnapshot: (snapshot: RoomSnapshot) => void };
  setData: (patch: Record<string, unknown>) => void;
  updateSnapshot: (snapshot: RoomSnapshot) => void;
}

function loadLobbyPage(): LobbyPageDefinition {
  let definition: LobbyPageDefinition | undefined;
  runInNewContext(readFileSync('miniprogram/pages/lobby/index.js', 'utf8'), {
    Page: (page: LobbyPageDefinition) => { definition = page; },
    require: () => ({ commandFor: () => ({}) }),
  });
  if (!definition) throw new Error('Mini-program lobby page was not registered');
  return definition;
}

function lobbySnapshot(playerCount: number): RoomSnapshot {
  const seats = ['A', 'B', 'C', 'D'] as const;
  const players = seats.slice(0, playerCount).map((seat, index) => ({
    seat,
    nickname: 'Player' + index,
    team: (seat === 'A' || seat === 'C' ? 'AC' : 'BD') as 'AC' | 'BD',
    connected: true,
    away: false,
    activeInHand: true,
    finishedRank: null,
    handCount: 0,
    burstAnnounced: false,
    ready: false,
    remainingHand: [],
    isHost: index === 0,
  }));
  return {
    public: {
      phase: 'lobby', roomId: '414', handNumber: 0, version: 1, players,
      hostSeat: 'A', levels: { AC: '3', BD: '3' }, completedRounds: { AC: 0, BD: 0 },
      candidateLeader: null, currentTurn: null, effectiveMain: null, openingMode: 'normal',
      modeTeam: null, openingTurn: null, openingSkippedSeats: [], trick: null, publicLastPlay: null,
      burstPendingSeat: null, differenceAvailable: false, finishOrder: [], burstAnnounced: [], settlement: null,
    },
    private: { seat: 'A', hand: [], burstLocked: false },
  };
}

describe('Mini-program lobby', () => {
  it('counts seated players instead of fixed seat placeholders', () => {
    const page = loadLobbyPage();
    page.app = { setSnapshot: () => undefined };
    page.setData = (patch) => Object.assign(page.data, patch);

    page.updateSnapshot(lobbySnapshot(2));

    expect(page.data.playerCount).toBe(2);
    expect(page.data.full).toBe(false);
  });
});
