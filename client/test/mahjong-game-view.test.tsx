/* @vitest-environment jsdom */
import { fireEvent, render } from '@testing-library/react';
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
          score: index === 1 ? 1_003 : 999,
          isListening: false,
          melds: index === 0 ? [{ kind: 'concealed-kong', tiles: [...meldTiles, deck[65]!] }]
            : index === 1 ? [{ kind: 'concealed-kong', tiles: [] }] : [],
          discards: [],
          isDealer: index === 0,
          isHost: index === 0,
        })),
        spectators: [], hostSeat: 'A', dealerSeat: 'A', currentTurn: null, awaitingDiscard: false,
        pendingDiscard: null, responseSeats: [], wallCount: 28,
        wallLayout: { breakSide: 'A', replacementSide: 'B', sides: seats.map((seat) => ({ seat, liveTiles: 6, replacementTiles: seat === 'B' ? 4 : 0 })) },
        diceRoll: [2, 5], lastDiscard: null,
        discardRiver: [{ seat: 'A', tile: discards[0]! }, { seat: 'B', tile: discards[1]! }],
        revealedHands: seats.map((seat, index) => ({ seat, nickname: ['甲', '乙', '丙', '丁'][index]!, hand: hands[index]! })),
        settlement: { winnerSeat: 'B', winnerNickname: '乙', type: 'self-draw', payments: { A: -1, B: 3, C: -1, D: -1 }, transfers: [
          { from: 'A', to: 'B', amount: 1 }, { from: 'C', to: 'B', amount: 1 }, { from: 'D', to: 'B', amount: 1 },
        ] },
      },
      private: { seat: 'A', hand: hands[0]!, availableActions: [], spectator: false },
    };

    const announcing: MahjongSnapshot = {
      ...snapshot,
      public: {
        ...snapshot.public, phase: 'playing', version: 11, settlement: null, revealedHands: undefined,
        players: snapshot.public.players.map((player) => ({ ...player, score: 1000 })),
        winAnnouncement: { winnerSeat: 'B', winnerNickname: '乙', type: 'self-draw', winPattern: 'standard' },
      },
    };
    const props = { onCommand: vi.fn(), onLeave: vi.fn(), testMode: false };
    const { container, rerender } = render(<MahjongGameView snapshot={announcing} {...props} />);
    expect(container.querySelector('.mahjong-seat-left.winner-announced .mahjong-win-badge')?.textContent).toBe('胡!');
    expect(container.querySelector('.mahjong-win-announcement')?.textContent).toContain('乙');
    expect(container.querySelector('.mahjong-win-announcement')?.textContent).toContain('自摸');
    expect(container.querySelector('.mahjong-table-settlement')).toBeNull();

    rerender(<MahjongGameView snapshot={announcing} interactionEffect={{ id: 'interaction-1', targetSeat: 'B', interaction: 'water' }} {...props} />);
    expect(container.querySelector('.mahjong-seat-left .room-interaction-effect')?.getAttribute('aria-label')).toBe('泼水动画');
    expect(container.querySelector('.mahjong-seat-bottom .room-interaction-effect')).toBeNull();

    rerender(<MahjongGameView snapshot={{ ...announcing, public: {
      ...announcing.public,
      winAnnouncement: { winnerSeat: 'B', winnerNickname: '乙', type: 'discard-win', winPattern: 'standard', payingSeat: 'A', isCardang: true },
    } }} {...props} />);
    expect(container.querySelector('.mahjong-seat-bottom.discarder-announced .mahjong-discarder-badge')?.textContent).toBe('点炮');
    expect(container.querySelector('.mahjong-win-announcement')?.textContent).toContain('卡当');
    expect(container.querySelector('.mahjong-win-announcement')?.textContent).toContain('甲 点炮');

    rerender(<MahjongGameView snapshot={{ ...announcing, public: {
      ...announcing.public,
      winAnnouncement: { winnerSeat: 'B', winnerNickname: '乙', type: 'self-draw', winPattern: 'bao', isCardang: true, isBaoZhongBao: true },
    } }} {...props} />);
    expect(container.querySelector('.mahjong-win-announcement')?.textContent).toContain('宝中宝');
    expect(container.querySelector('.mahjong-discarder-badge')).toBeNull();

    rerender(<MahjongGameView snapshot={snapshot} {...props} />);
    const table = container.querySelector('.mahjong-table');
    expect(table?.querySelector('.mahjong-table-settlement')?.textContent).toContain('本局结束');
    expect(table?.querySelector('.mahjong-table-settlement')?.textContent).toContain('乙 获胜 · 自摸');
    expect(table?.querySelectorAll('.mahjong-score-row')).toHaveLength(4);
    expect(table?.querySelector('.mahjong-score-row.mine')?.textContent).toContain('1000 → 999');
    expect(table?.querySelector('.mahjong-score-row.mine')?.textContent).toContain('付 乙 1');
    expect(table?.querySelectorAll('.mahjong-score-row')[1]?.textContent).toContain('收 甲 1 · 收 丙 1 · 收 丁 1');
    expect(table?.querySelectorAll('.mahjong-own-hand .mahjong-face, .mahjong-revealed-hand .mahjong-face')).toHaveLength(52);
    expect(Array.from(table?.querySelectorAll('.mahjong-discard-tiles .mahjong-face') ?? []).map((tile) => tile.getAttribute('aria-label')))
      .toEqual(discards.map((tile) => tile.label));
    expect(table?.querySelector('.mahjong-seat-left .mahjong-seat-melds .mahjong-meld')).not.toBeNull();
    expect(table?.querySelector('.mahjong-player-avatar')).toBeNull();
    expect(table?.querySelector('.mahjong-seat-bottom .mahjong-player-card')?.textContent).toContain('甲');
    expect(table?.querySelector('.mahjong-seat-bottom .mahjong-player-card')?.textContent).toContain('999 分');
    expect(table?.querySelector('.mahjong-seat-bottom .mahjong-player-card')?.textContent).not.toContain('东家');
    expect(table?.querySelector('.mahjong-face-art')?.getAttribute('style')).toContain('background-position');
    expect(table?.querySelector('.mahjong-face-art img')).toBeNull();
    expect(table?.querySelectorAll('.mahjong-seat-left .mahjong-meld .mahjong-tile-back')).toHaveLength(4);
    expect(table?.querySelectorAll('.mahjong-seat-left .mahjong-meld .mahjong-face')).toHaveLength(0);
    expect(table?.querySelectorAll('.mahjong-seat-bottom .mahjong-meld .mahjong-face')).toHaveLength(4);

    const discardWin = {
      ...snapshot,
      public: {
        ...snapshot.public,
        settlement: { ...snapshot.public.settlement!, type: 'discard-win' as const, payingSeat: 'A' as const },
      },
    };
    rerender(<MahjongGameView snapshot={discardWin} {...props} />);
    expect(container.querySelector('.mahjong-score-row:nth-child(1) .mahjong-score-role.discarder')?.textContent).toBe('点炮');
    expect(container.querySelector('.mahjong-score-row:nth-child(2) .mahjong-score-role.winner')?.textContent).toBe('胡牌');
  });
});

describe('MahjongGameView discard interaction', () => {
  it('discards the selected tile when the player taps the empty table, without a discard prompt', () => {
    const seats: MahjongSeat[] = ['A', 'B', 'C', 'D'];
    const deck = createMahjongDeck();
    const hands = seats.map((_, index) => deck.slice(index * 13, (index + 1) * 13));
    const snapshot: MahjongSnapshot = {
      public: {
        gameId: 'mahjong', roomId: 'mahjong', phase: 'playing', handNumber: 1, version: 2,
        players: seats.map((seat, index) => ({
          seat, seatLabel: ['东家', '南家', '西家', '北家'][index]!, nickname: ['甲', '乙', '丙', '丁'][index]!,
          connected: true, handCount: 13, score: 1000, isListening: false, melds: [], discards: [], isDealer: index === 0, isHost: index === 0,
        })),
        spectators: [], hostSeat: 'A', dealerSeat: 'A', currentTurn: 'A', awaitingDiscard: true,
        pendingDiscard: null, responseSeats: [], wallCount: 83,
        wallLayout: { breakSide: 'A', replacementSide: 'B', sides: seats.map((seat) => ({ seat, liveTiles: seat === 'B' ? 11 : seat === 'A' ? 0 : 34, replacementTiles: seat === 'B' ? 4 : 0 })) },
        diceRoll: [1, 1], lastDiscard: null, discardRiver: [], settlement: null,
      },
      private: { seat: 'A', hand: hands[0]!, availableActions: ['discard', 'listen'], spectator: false },
    };
    const onCommand = vi.fn();
    const { container, rerender } = render(<MahjongGameView snapshot={snapshot} onCommand={onCommand} onLeave={vi.fn()} testMode={false} />);
    const table = container.querySelector('.mahjong-table')!;
    const tile = container.querySelector('.mahjong-own-hand .mahjong-face')!;

    expect(table.querySelectorAll('.mahjong-seat-right .mahjong-concealed-hand .mahjong-tile-edge')).toHaveLength(13);
    expect(table.querySelector('.mahjong-seat-right .mahjong-player-meta')?.textContent).toContain('1000 分');
    expect(table.querySelectorAll('.mahjong-wall-stack .mahjong-tile-back')).toHaveLength(42);
    expect(table.querySelector('.mahjong-discard-pile')).not.toBeNull();
    expect(table.querySelector('.mahjong-discard-tiles')?.children).toHaveLength(0);
    expect(table.textContent).not.toContain('公共牌河');

    fireEvent.click(tile);
    fireEvent.click(table);

    expect(onCommand).toHaveBeenCalledWith('discard', { tileId: hands[0]![0]!.id });
    expect(container.querySelector('.mahjong-action-dock')?.parentElement).toBe(table);
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.trim().startsWith('出牌'))).toBe(false);

    onCommand.mockClear();
    fireEvent.click(tile);
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(tile);
    expect(onCommand).toHaveBeenCalledExactlyOnceWith('discard', { tileId: hands[0]![0]!.id });

    const physicalWall = {
      ...snapshot,
      public: {
        ...snapshot.public,
        wallLayout: {
          breakSide: 'C' as const,
          replacementSide: 'C' as const,
          breakStack: 2,
          sides: seats.map((seat) => ({
            seat,
            liveTiles: seat === 'C' ? 2 : 0,
            replacementTiles: seat === 'C' ? 2 : 0,
            stacks: Array.from({ length: 17 }, (_, index) => ({
              index,
              liveTiles: seat === 'C' && index === 2 ? 2 : 0,
              replacementTiles: seat === 'C' && index === 0 ? 2 : 0,
            })),
          })),
        },
      },
    } satisfies MahjongSnapshot;
    rerender(<MahjongGameView snapshot={physicalWall} onCommand={onCommand} onLeave={vi.fn()} testMode={false} />);
    const topStacks = container.querySelectorAll('.mahjong-wall-top .mahjong-wall-stack');
    expect(topStacks).toHaveLength(17);
    expect(topStacks[0]?.querySelector('.replacement')).not.toBeNull();
    expect(topStacks[1]?.classList.contains('empty')).toBe(true);
    expect(topStacks[2]?.querySelector('.mahjong-tile-back')).not.toBeNull();
    rerender(<MahjongGameView snapshot={{ ...physicalWall, private: { ...physicalWall.private, seat: 'C' } }} onCommand={onCommand} onLeave={vi.fn()} testMode={false} />);
    const bottomStacks = container.querySelectorAll('.mahjong-wall-bottom .mahjong-wall-stack');
    expect(bottomStacks).toHaveLength(17);
    expect(bottomStacks[16]?.querySelector('.replacement')).not.toBeNull();
  });

  it('discards a hand tile dragged onto the table', () => {
    const seats: MahjongSeat[] = ['A', 'B', 'C', 'D'];
    const deck = createMahjongDeck();
    const hand = deck.slice(0, 14);
    const snapshot: MahjongSnapshot = {
      public: {
        gameId: 'mahjong', roomId: 'mahjong', phase: 'playing', handNumber: 1, version: 2,
        players: seats.map((seat, index) => ({
          seat, seatLabel: ['东家', '南家', '西家', '北家'][index]!, nickname: ['甲', '乙', '丙', '丁'][index]!,
          connected: true, handCount: 13, score: 1000, isListening: false, melds: [], discards: [], isDealer: index === 0, isHost: index === 0,
        })),
        spectators: [], hostSeat: 'A', dealerSeat: 'A', currentTurn: 'A', awaitingDiscard: true,
        pendingDiscard: null, responseSeats: [], wallCount: 83,
        wallLayout: { breakSide: 'A', replacementSide: 'B', sides: seats.map((seat) => ({ seat, liveTiles: seat === 'B' ? 11 : seat === 'A' ? 0 : 34, replacementTiles: seat === 'B' ? 4 : 0 })) },
        diceRoll: [1, 1], lastDiscard: null, discardRiver: [], settlement: null,
      },
      private: { seat: 'A', hand, availableActions: ['discard'], drawnTileId: hand[13]!.id, spectator: false },
    };
    const onCommand = vi.fn();
    const { container } = render(<MahjongGameView snapshot={snapshot} onCommand={onCommand} onLeave={vi.fn()} testMode={false} />);
    const table = container.querySelector('.mahjong-table')!;
    Object.defineProperty(table, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, x: 0, y: 0, toJSON: () => ({}) }) });
    const discardPile = table.querySelector('.mahjong-discard-pile')!;
    Object.defineProperty(discardPile, 'getBoundingClientRect', { value: () => ({ left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200, x: 100, y: 100, toJSON: () => ({}) }) });
    const tile = container.querySelector('.mahjong-own-hand .mahjong-face')!;

    fireEvent(tile, new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 320 }));
    fireEvent(tile, new MouseEvent('pointermove', { bubbles: true, clientX: 45, clientY: 280 }));
    fireEvent(tile, new MouseEvent('pointerup', { bubbles: true, clientX: 190, clientY: 180 }));

    expect(onCommand).toHaveBeenCalledWith('discard', { tileId: hand[0]!.id });
    onCommand.mockClear();
    const nextTile = container.querySelectorAll('.mahjong-own-hand .mahjong-face')[1]!;
    fireEvent(nextTile, new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 320 }));
    fireEvent(nextTile, new MouseEvent('pointermove', { bubbles: true, clientX: 45, clientY: 280 }));
    fireEvent(nextTile, new MouseEvent('pointerup', { bubbles: true, clientX: 50, clientY: 50 }));
    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe('MahjongGameView response actions', () => {
  it('shows chi options only after tapping the eat circle and keeps them beside the player controls', () => {
    const seats: MahjongSeat[] = ['A', 'B', 'C', 'D'];
    const deck = createMahjongDeck();
    const hand = deck.slice(0, 13);
    const chiOptions = [[hand[0]!.id, hand[1]!.id], [hand[2]!.id, hand[3]!.id]];
    const snapshot: MahjongSnapshot = {
      public: {
        gameId: 'mahjong', roomId: 'mahjong', phase: 'playing', handNumber: 1, version: 3,
        players: seats.map((seat, index) => ({
          seat, seatLabel: ['东家', '南家', '西家', '北家'][index]!, nickname: ['甲', '乙', '丙', '丁'][index]!,
          connected: true, handCount: 13, score: 1000, isListening: false, melds: [], discards: [], isDealer: index === 0, isHost: index === 0,
        })),
        spectators: [], hostSeat: 'A', dealerSeat: 'A', currentTurn: null, awaitingDiscard: false,
        pendingDiscard: { seat: 'D', tile: deck[30]! }, responseSeats: ['A'], wallCount: 70,
        wallLayout: { breakSide: 'A', replacementSide: 'B', sides: seats.map((seat) => ({ seat, liveTiles: 17, replacementTiles: seat === 'B' ? 4 : 0 })) },
        diceRoll: [2, 5], lastDiscard: { seat: 'D', tile: deck[30]! }, discardRiver: [{ seat: 'D', tile: deck[30]! }], settlement: null,
      },
      private: { seat: 'A', hand, availableActions: ['chi', 'pass'], chiOptions, spectator: false },
    };
    const onCommand = vi.fn();
    const { container, getByRole } = render(<MahjongGameView snapshot={snapshot} onCommand={onCommand} onLeave={vi.fn()} testMode={false} />);
    const dock = container.querySelector('.mahjong-action-dock')!;

    expect(dock.parentElement).toBe(container.querySelector('.mahjong-table'));
    expect(dock.querySelectorAll('.mahjong-action-circle')).toHaveLength(2);
    expect(container.querySelector('.mahjong-chi-picker')).toBeNull();
    expect(container.textContent).not.toContain('选择响应');

    fireEvent.click(getByRole('button', { name: '吃' }));

    const picker = dock.querySelector('.mahjong-chi-picker')!;
    const choices = picker.querySelectorAll('.mahjong-chi-choice');
    expect(choices).toHaveLength(2);
    expect(choices[0]?.querySelectorAll('.mahjong-face')).toHaveLength(3);

    fireEvent.click(getByRole('button', { name: '过' }));
    expect(dock.querySelector('.mahjong-chi-picker')).toBeNull();
    expect(onCommand).toHaveBeenNthCalledWith(1, 'pass', {});

    fireEvent.click(getByRole('button', { name: '吃' }));
    const reopenedChoices = dock.querySelectorAll('.mahjong-chi-choice');
    expect(reopenedChoices).toHaveLength(2);

    fireEvent.click(reopenedChoices[0]!);
    expect(onCommand).toHaveBeenNthCalledWith(2, 'chi', { tileIds: chiOptions[0] });
  });
});

describe('MahjongGameView listen information privacy', () => {
  it('hides the bao tile before listening and reveals it only after listening succeeds', () => {
    const seats: MahjongSeat[] = ['A', 'B', 'C', 'D'];
    const deck = createMahjongDeck();
    const hand = deck.slice(0, 14);
    const waitTile = deck[30]!;
    const baoTile = deck[40]!;
    const snapshot: MahjongSnapshot = {
      public: {
        gameId: 'mahjong', roomId: 'mahjong', phase: 'playing', handNumber: 1, version: 5,
        players: seats.map((seat, index) => ({
          seat, seatLabel: ['东家', '南家', '西家', '北家'][index]!, nickname: ['甲', '乙', '丙', '丁'][index]!,
          connected: true, handCount: 14, score: 1000, isListening: false, melds: [], discards: [], isDealer: index === 0, isHost: index === 0,
        })),
        spectators: [], hostSeat: 'A', dealerSeat: 'A', currentTurn: 'A', awaitingDiscard: true,
        pendingDiscard: null, responseSeats: [], wallCount: 48,
        wallLayout: { breakSide: 'A', replacementSide: 'B', sides: seats.map((seat) => ({ seat, liveTiles: 11, replacementTiles: seat === 'B' ? 4 : 0 })) },
        diceRoll: [2, 5], lastDiscard: null, discardRiver: [], settlement: null,
      },
      private: {
        seat: 'A', hand, availableActions: ['discard', 'listen'], drawnTileId: hand[13]!.id, spectator: false,
        listenTileIds: [hand[0]!.id], listenOptions: [{ discardTileId: hand[0]!.id, waits: [waitTile] }],
      },
    };
    const props = { onCommand: vi.fn(), onLeave: vi.fn(), testMode: false };
    const { container, rerender } = render(<MahjongGameView snapshot={snapshot} {...props} />);

    fireEvent.click(container.querySelector('.mahjong-own-hand button')!);
    expect(container.querySelector('.mahjong-listen-preview strong')?.textContent).toBe('打出此牌可听');
    expect(container.querySelector('.mahjong-bao-preview')).toBeNull();

    const postDiscardSnapshot: MahjongSnapshot = {
      ...snapshot,
      public: {
        ...snapshot.public,
        version: 6,
        awaitingDiscard: false,
        pendingDiscard: { seat: 'A', tile: hand[0]! },
        lastDiscard: { seat: 'A', tile: hand[0]! },
        discardRiver: [{ seat: 'A', tile: hand[0]! }],
      },
      private: {
        seat: 'A', hand: hand.slice(1), availableActions: ['listen', 'pass'],
        postDiscardListenWaits: [waitTile], spectator: false,
      },
    };
    rerender(<MahjongGameView snapshot={postDiscardSnapshot} {...props} />);
    expect(container.querySelector('.mahjong-listen-preview strong')?.textContent).toBe('已出牌，可选择听牌');
    expect(container.querySelector('.mahjong-bao-preview')).toBeNull();
    fireEvent.click(container.querySelector('button[aria-label="听"]')!);
    fireEvent.click(container.querySelector('button[aria-label="暂不听"]')!);
    expect(props.onCommand).toHaveBeenNthCalledWith(1, 'listen', {});
    expect(props.onCommand).toHaveBeenNthCalledWith(2, 'pass', {});

    const listeningSnapshot: MahjongSnapshot = {
      ...snapshot,
      public: { ...snapshot.public, version: 6, players: snapshot.public.players.map((player) => player.seat === 'A' ? { ...player, isListening: true } : player) },
      private: {
        ...snapshot.private, availableActions: [], isListening: true, listenWaits: [waitTile], baoTile,
        discardableTileId: hand[13]!.id,
        opponentHands: seats.filter((seat) => seat !== 'A').map((seat, index) => ({
          seat, nickname: ['乙', '丙', '丁'][index]!, hand: [waitTile],
        })),
      },
    };
    rerender(<MahjongGameView snapshot={listeningSnapshot} {...props} />);

    expect(container.querySelector('.mahjong-listen-preview strong')?.textContent).toBe('已听牌');
    expect(container.querySelector('.mahjong-bao-preview .mahjong-face')?.getAttribute('aria-label')).toBe(baoTile.label);
    expect(container.querySelector('.mahjong-bao-preview b')?.textContent).toBe('宝');
    expect(container.querySelectorAll('.mahjong-revealed-hand')).toHaveLength(3);
    expect(container.querySelectorAll('.mahjong-revealed-hand .mahjong-face')).toHaveLength(3);
  });
});
