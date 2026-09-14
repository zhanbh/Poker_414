/* @vitest-environment jsdom */
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { RoomSnapshot } from '../../shared/src/protocol';

function snapshot(bConnected: boolean): RoomSnapshot {
  const players = [
    { seat: 'A' as const, nickname: '甲', team: 'AC' as const, connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 14, burstAnnounced: false, ready: false, remainingHand: [], isHost: true },
    { seat: 'B' as const, nickname: '乙', team: 'BD' as const, connected: bConnected, away: false, activeInHand: true, finishedRank: null, handCount: 13, burstAnnounced: false, ready: false, remainingHand: [], isHost: false },
  ];
  return {
    public: {
      roomId: '414', phase: 'opening', handNumber: 1, version: bConnected ? 1 : 2, hostSeat: 'A', players,
      levels: { AC: '3', BD: '3' }, completedRounds: { AC: 0, BD: 0 }, candidateLeader: 'A',
      currentTurn: null, effectiveMain: null, openingMode: 'normal', modeTeam: null, openingTurn: 'A',
      openingSkippedSeats: [], trick: null, publicLastPlay: null, finishOrder: [], burstAnnounced: [],
      burstPendingSeat: null, differenceAvailable: false, settlement: null,
    },
    private: { seat: 'A', hand: [], burstLocked: false },
  };
}

describe('断线提示', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('对局中发现其他玩家断开时提示仍在线玩家', async () => {
    let listener: ((next: RoomSnapshot) => void) | undefined;
    const transport = {
      login: async () => ({ sessionToken: 'session-a', playerId: 'player-a' }),
      join: async () => snapshot(true),
      subscribe: (next: (value: RoomSnapshot) => void) => { listener = next; return () => undefined; },
      onReplaced: () => () => undefined,
      activity: () => undefined,
      command: async () => ({ ok: true as const, snapshot: snapshot(true) }),
    };
    render(<App transport={transport} />);
    await waitFor(() => expect(listener).toBeDefined());

    act(() => listener!(snapshot(true)));
    act(() => listener!(snapshot(false)));

    expect(await screen.findByRole('status')).toHaveTextContent('乙 已退出房间');
  });
});
