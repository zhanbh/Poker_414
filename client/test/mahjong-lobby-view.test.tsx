/* @vitest-environment jsdom */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MahjongPublicSnapshot } from '../../shared/src/protocol';
import { MahjongLobbyView } from '../src/views/MahjongLobbyView';

describe('MahjongLobbyView player cards', () => {
  it('shows nicknames and scores without compass seat labels', () => {
    const snapshot: MahjongPublicSnapshot = {
      gameId: 'mahjong', roomId: 'room', phase: 'lobby', handNumber: 0, version: 1,
      players: ['A', 'B'].map((seat, index) => ({
        seat: seat as 'A' | 'B', seatLabel: ['东家', '南家'][index]!, nickname: ['甲', '乙'][index]!,
        connected: true, handCount: 0, score: 1000, isListening: false, melds: [], discards: [],
        isDealer: index === 0, isHost: index === 0,
      })),
      spectators: [], hostSeat: 'A', dealerSeat: 'A', currentTurn: null, awaitingDiscard: false,
      pendingDiscard: null, responseSeats: [], wallCount: 0,
      wallLayout: { breakSide: null, replacementSide: null, sides: [] },
      diceRoll: null, lastDiscard: null, discardRiver: [], settlement: null,
    };
    const { container } = render(<MahjongLobbyView snapshot={snapshot} ownSeat="A" onStart={vi.fn()} onRemove={vi.fn()} onLeave={vi.fn()} testMode={false} />);
    const cards = [...container.querySelectorAll('.mahjong-lobby-seat')];
    expect(cards[0]?.textContent).toContain('甲');
    expect(cards[0]?.textContent).toContain('1000 积分');
    expect(cards[1]?.textContent).toContain('乙');
    expect(cards[1]?.textContent).toContain('1000 积分');
    expect(cards.map((card) => card.textContent).join(' ')).not.toMatch(/东家|南家|西家|北家/);
  });
});
