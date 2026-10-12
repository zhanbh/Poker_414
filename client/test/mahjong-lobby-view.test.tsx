/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MahjongPublicSnapshot } from '../../shared/src/protocol';
import { MahjongLobbyView } from '../src/views/MahjongLobbyView';

const createLobbySnapshot = (): MahjongPublicSnapshot => ({
  gameId: 'mahjong', roomId: 'room', phase: 'lobby', handNumber: 0, version: 1,
  players: ['A', 'B', 'C', 'D'].map((seat, index) => ({
    seat: seat as 'A' | 'B' | 'C' | 'D', seatLabel: ['东家', '南家', '西家', '北家'][index]!, nickname: ['甲', '乙', '丙', '丁'][index]!,
    connected: true, handCount: 0, score: 1000, isListening: false, melds: [], discards: [],
    isDealer: index === 0, isHost: index === 0, ready: index === 0,
  })),
  spectators: [], hostSeat: 'A', dealerSeat: 'A', currentTurn: null, awaitingDiscard: false,
  pendingDiscard: null, responseSeats: [], wallCount: 0,
  wallLayout: { breakSide: null, replacementSide: null, sides: [] },
  diceRoll: null, lastDiscard: null, discardRiver: [], settlement: null,
});

describe('MahjongLobbyView player cards', () => {
  it('shows nicknames and scores without compass seat labels', () => {
    const snapshot = createLobbySnapshot();
    const onReady = vi.fn();
    const { container } = render(<MahjongLobbyView snapshot={snapshot} ownSeat="A" onReady={onReady} onRemove={vi.fn()} onLeave={vi.fn()} testMode={false} />);
    const cards = [...container.querySelectorAll('.mahjong-lobby-seat')];
    expect(cards[0]?.textContent).toContain('甲');
    expect(cards[0]?.textContent).toContain('1000 积分');
    expect(cards[1]?.textContent).toContain('乙');
    expect(cards[1]?.textContent).toContain('1000 积分');
    expect(cards.map((card) => card.textContent).join(' ')).not.toMatch(/东家|南家|西家|北家/);
    expect(screen.getByText('4/4 人已入座 · 已准备 1/4')).toBeInTheDocument();
    expect(screen.getByText('已准备')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '已准备（点击取消）' }));
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('room is not full yet, so preparation is visible but disabled', () => {
    const snapshot = createLobbySnapshot();
    render(<MahjongLobbyView snapshot={{ ...snapshot, players: snapshot.players.slice(0, 2) }} ownSeat="A" onReady={vi.fn()} onRemove={vi.fn()} onLeave={vi.fn()} testMode={false} />);

    expect(screen.getByText('2/4 人已入座 · 已准备 1/4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已准备（点击取消）' })).toBeDisabled();
  });
});
