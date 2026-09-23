/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TexasSnapshot } from '../../shared/src/protocol';
import { TexasGameView } from '../src/views/TexasGameView';

const snapshot: TexasSnapshot = {
  public: {
    gameId: 'texas', roomId: 'texas', phase: 'preflop', handNumber: 1, version: 1,
    players: [
      { seat: 'A', nickname: '甲', connected: true, stack: 980, totalBet: 20, roundBet: 20, folded: false, allIn: false, isHost: true },
      { seat: 'B', nickname: '乙', connected: true, stack: 990, totalBet: 10, roundBet: 10, folded: false, allIn: false, isHost: false },
    ],
    spectators: [], hostSeat: 'A', dealerSeat: 'A', smallBlindSeat: 'B', bigBlindSeat: 'A', currentTurn: 'B',
    community: [], pot: 30, currentBet: 20, minRaise: 20, settlement: null,
  },
  private: {
    seat: 'A', holeCards: [
      { id: 'A-spades', rank: 'A', suit: 'spades' },
      { id: 'K-hearts', rank: 'K', suit: 'hearts' },
    ],
  },
};

describe('德州横屏提示', () => {
  it('竖屏时提示用户横屏查看牌桌', () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.screen, 'orientation', { configurable: true, value: { lock } });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });

    render(<TexasGameView snapshot={snapshot} onCommand={vi.fn()} onLeave={vi.fn()} testMode={false} />);

    expect(screen.getByText('当前设备未自动旋转，已启用横向适配；如支持自动旋转，请将手机横过来。')).toBeInTheDocument();
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('portrait fallback remains usable when orientation lock is unavailable', () => {
    Object.defineProperty(window, 'screen', { configurable: true, value: { orientation: undefined } });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });

    render(<TexasGameView snapshot={snapshot} onCommand={vi.fn()} onLeave={vi.fn()} testMode={false} />);

    expect(document.documentElement.classList.contains('texas-orientation-fallback')).toBe(false);
    expect(screen.queryByRole('dialog', { name: '\u6a2a\u5c4f\u63d0\u793a' })).not.toBeInTheDocument();
  });

  it('横屏时不显示遮罩', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });

    render(<TexasGameView snapshot={snapshot} onCommand={vi.fn()} onLeave={vi.fn()} testMode={false} />);

    expect(screen.queryByRole('dialog', { name: '横屏提示' })).not.toBeInTheDocument();
  });
});
