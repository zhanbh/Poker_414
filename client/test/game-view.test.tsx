/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { standardCard } from '../../shared/src/cards';
import { RoomSnapshot } from '../../shared/src/protocol';
import { GameView } from '../src/views/GameView';

const playing: RoomSnapshot = {
  public: {
    roomId: '414', phase: 'playing', handNumber: 1, version: 9, hostSeat: 'A',
    players: [
      { seat: 'A', nickname: '甲', team: 'AC', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 3, burstAnnounced: false, isHost: true },
      { seat: 'B', nickname: '乙', team: 'BD', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 4, burstAnnounced: false, isHost: false },
      { seat: 'C', nickname: '丙', team: 'AC', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 5, burstAnnounced: false, isHost: false },
      { seat: 'D', nickname: '丁', team: 'BD', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 6, burstAnnounced: false, isHost: false },
    ],
    levels: { AC: '5', BD: '3' }, completedRounds: { AC: 0, BD: 0 }, candidateLeader: 'A', currentTurn: 'A',
    effectiveMain: '5', openingMode: 'normal', modeTeam: null, trick: null, publicLastPlay: null,
    finishOrder: [], burstAnnounced: [], settlement: null,
  },
  private: {
    seat: 'A', hand: [standardCard('4', 'spades', 'a4'), standardCard('5', 'hearts', 'a5'), standardCard('6', 'clubs', 'a6')], burstLocked: false,
  },
};

describe('对局视图', () => {
  it('显示有效主、当前牌权和四人剩余牌数，但不渲染他人手牌', () => {
    render(<GameView snapshot={playing} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);

    expect(screen.getByText('本手主：5')).toBeInTheDocument();
    expect(screen.getByText('当前牌权：甲')).toBeInTheDocument();
    expect(screen.getByText('乙 · 4张')).toBeInTheDocument();
    expect(screen.getByText('丙 · 5张')).toBeInTheDocument();
    expect(screen.getByText('丁 · 6张')).toBeInTheDocument();
    expect(screen.getByText('4♠')).toBeInTheDocument();
    expect(screen.queryByText('乙的手牌')).not.toBeInTheDocument();
  });

  it('选择自己的牌会触发用户活动，提交操作交给协议命令', () => {
    const onCommand = vi.fn();
    const onActivity = vi.fn();
    render(<GameView snapshot={playing} onCommand={onCommand} onActivity={onActivity} testMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: '4♠' }));
    expect(onActivity).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '出牌' }));
    expect(onCommand).toHaveBeenCalledWith('play', expect.objectContaining({ cardIds: ['a4'] }));
  });
});
