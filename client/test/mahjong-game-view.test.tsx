/* @vitest-environment jsdom */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MahjongSnapshot } from '../../shared/src/protocol';
import { createMahjongDeck, MahjongSeat } from '../../shared/src/mahjong';
import { MahjongGameView } from '../src/views/MahjongGameView';

describe('MahjongGameView settlement', () => {
  it('keeps settlement on the table and reveals every remaining hand above the shared ordered discard river', () => {
    const seats: MahjongSeat[] = ['A', 'B', 'C', 'D'];
    const deck = createMahjongDeck();
    const hands = seats.map((_, index) => deck.slice(index * 13, (index + 1) * 13));
    const discards = deck.slice(60, 62);
    const meldTiles = deck.slice(62, 65);
    const snapshot: MahjongSnapshot = {
      public: {
        gameId: 'mahjong', roomId: 'mahjong', phase: 'settled', handNumber: 3, version: 12,
        players: seats.map((seat, index) => ({
          seat,
          seatLabel: ['东家', '南家', '西家', '北家'][index]!,
          nickname: ['甲', '乙', '丙', '丁'][index]!,
          connected: true,
          handCount: hands[index]!.length,
          score: 1_000,
          isListening: false,
          melds: index === 1 ? [{ kind: 'peng', tiles: meldTiles }] : [],
          discards: [],
          isDealer: index === 0,
          isHost: index === 0,
        })),
        spectators: [], hostSeat: 'A', dealerSeat: 'A', currentTurn: null, awaitingDiscard: false,
        pendingDiscard: null, responseSeats: [], wallCount: 28, diceRoll: [2, 5], lastDiscard: null,
        discardRiver: [{ seat: 'A', tile: discards[0]! }, { seat: 'B', tile: discards[1]! }],
        revealedHands: seats.map((seat, index) => ({ seat, nickname: ['甲', '乙', '丙', '丁'][index]!, hand: hands[index]! })),
        settlement: { winnerSeat: 'B', winnerNickname: '乙', type: 'self-draw', payments: { A: -1, B: 3, C: -1, D: -1 } },
      },
      private: { seat: 'A', hand: hands[0]!, availableActions: [], spectator: false },
    };

    const { container } = render(<MahjongGameView snapshot={snapshot} onCommand={vi.fn()} onLeave={vi.fn()} testMode={false} />);
    const table = container.querySelector('.mahjong-table');
    expect(table?.querySelector('.mahjong-table-settlement')?.textContent).toContain('本局结束');
    expect(table?.querySelector('.mahjong-table-settlement')?.textContent).toContain('乙 获胜 · 自摸');
    expect(table?.querySelectorAll('.mahjong-own-hand .mahjong-face, .mahjong-revealed-hand .mahjong-face')).toHaveLength(52);
    expect(Array.from(table?.querySelectorAll('.mahjong-discard-tiles .mahjong-face') ?? []).map((tile) => tile.getAttribute('aria-label')))
      .toEqual(discards.map((tile) => tile.label));
    expect(table?.querySelector('.mahjong-seat-left .mahjong-seat-melds .mahjong-meld')).not.toBeNull();
  });
});
