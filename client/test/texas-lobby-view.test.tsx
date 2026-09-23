/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TexasPublicSnapshot } from '../../shared/src/protocol';
import { TexasLobbyView } from '../src/views/TexasLobbyView';

const lobby: TexasPublicSnapshot = {
  gameId: 'texas',
  roomId: 'texas',
  phase: 'lobby',
  handNumber: 0,
  version: 1,
  players: [
    {
      seat: 'A',
      positionLabel: '按钮位 BTN',
      nickname: '甲',
      connected: true,
      stack: 1_000_000,
      totalBet: 0,
      roundBet: 0,
      folded: false,
      allIn: false,
      isHost: true,
    },
  ],
  spectators: [],
  chat: [],
  hostSeat: 'A',
  dealerSeat: null,
  smallBlindSeat: null,
  bigBlindSeat: null,
  currentTurn: null,
  community: [],
  pot: 0,
  currentBet: 0,
  minRaise: 20,
  settlement: null,
};

describe('德州大厅座位展示', () => {
  it('空座位也显示专业位置名，而不是内部 A/B 座位编号', () => {
    render(
      <TexasLobbyView
        snapshot={lobby}
        ownSeat="A"
        onStart={vi.fn()}
        onRemove={vi.fn()}
        onLeave={vi.fn()}
        testMode={false}
      />,
    );

    expect(screen.getByText('按钮位 BTN')).toBeInTheDocument();
    expect(screen.getByText('小盲 SB')).toBeInTheDocument();
    expect(screen.getByText('大盲 BB')).toBeInTheDocument();
    expect(screen.queryByText('B 位')).not.toBeInTheDocument();
  });
});
