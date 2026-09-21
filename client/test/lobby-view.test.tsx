/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LobbyView } from '../src/views/LobbyView';
import { PublicSnapshot } from '../../shared/src/protocol';

const lobby: PublicSnapshot = {
  roomId: '414', phase: 'lobby', handNumber: 0, version: 1, hostSeat: 'A',
  players: [
    { seat: 'A', nickname: '甲', team: 'AC', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 0, burstAnnounced: false, ready: false, remainingHand: [], isHost: true },
    { seat: 'B', nickname: '乙', team: 'BD', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 0, burstAnnounced: false, ready: false, remainingHand: [], isHost: false },
  ],
  levels: { AC: '3', BD: '3' }, completedRounds: { AC: 0, BD: 0 }, candidateLeader: null,
  currentTurn: null, effectiveMain: null, openingMode: 'normal', modeTeam: null, openingTurn: null, openingSkippedSeats: [], trick: null,
  publicLastPlay: null, finishOrder: [], burstAnnounced: [], burstPendingSeat: null, differenceAvailable: false, settlement: null,
};

describe('大厅视图', () => {
  it('显示四个固定座位、1队/2队组队和房主，四人未到齐不能开始', () => {
    const onStart = vi.fn();
    render(<LobbyView snapshot={lobby} ownSeat="A" onStart={onStart} onRemove={vi.fn()} onLeave={vi.fn()} testMode={false} />);

    expect(screen.getByRole('heading', { name: '1队' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2队' })).toBeInTheDocument();
    expect(screen.getByText('房主')).toBeInTheDocument();
    expect(screen.getByText('等待开局')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始游戏' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '移除甲' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '移除乙' })).toBeInTheDocument();
    expect(screen.getAllByText(/空位/)).toHaveLength(2);
    expect(onStart).not.toHaveBeenCalled();
  });
});
