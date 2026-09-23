/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TexasSnapshot } from '../../shared/src/protocol';
import { TexasGameView } from '../src/views/TexasGameView';

const player = (seat: 'A' | 'B', nickname: string, stack: number, totalBet: number) => ({
  seat,
  positionLabel: seat === 'A' ? '按钮位 BTN' : '小盲 SB',
  nickname,
  connected: true,
  stack,
  totalBet,
  roundBet: totalBet,
  folded: false,
  allIn: false,
  isHost: seat === 'A',
});

const snapshot = (version: number, firstStack: number, firstBet: number): TexasSnapshot => ({
  public: {
    gameId: 'texas',
    roomId: 'demo',
    phase: 'preflop',
    handNumber: 1,
    version,
    players: [player('A', '甲', firstStack, firstBet), player('B', '乙', 900, 20)],
    spectators: [],
    chat: [],
    hostSeat: 'A',
    dealerSeat: 'A',
    smallBlindSeat: 'B',
    bigBlindSeat: 'A',
    currentTurn: 'A',
    community: [],
    pot: 20 + firstBet,
    currentBet: firstBet,
    minRaise: 20,
    settlement: null,
  },
  private: {
    seat: 'A',
    holeCards: [],
  },
});

describe('德州扑克桌面筹码表现', () => {
  it('根据余额显示筹码堆，并在玩家下注增加时生成入池动画', () => {
    const { container, rerender } = render(<TexasGameView snapshot={snapshot(1, 980, 20)} onCommand={vi.fn()} onLeave={vi.fn()} testMode={false} />);

    expect(screen.getByLabelText('980 筹码')).toBeInTheDocument();
    expect(container.querySelectorAll('.texas-chip-stack').length).toBe(2);
    expect(container.querySelector('.texas-chip-flight')).not.toBeInTheDocument();

    rerender(<TexasGameView snapshot={snapshot(2, 940, 60)} onCommand={vi.fn()} onLeave={vi.fn()} testMode={false} />);

    expect(screen.getByLabelText('940 筹码')).toBeInTheDocument();
    expect(screen.getByLabelText('投入 40 筹码')).toBeInTheDocument();
    expect(screen.getByText('+40')).toBeInTheDocument();
  });
});
