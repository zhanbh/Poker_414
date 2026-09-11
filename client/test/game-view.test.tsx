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
      { seat: 'A', nickname: '甲', team: 'AC', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 3, burstAnnounced: false, ready: false, remainingHand: [], isHost: true },
      { seat: 'B', nickname: '乙', team: 'BD', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 4, burstAnnounced: false, ready: false, remainingHand: [], isHost: false },
      { seat: 'C', nickname: '丙', team: 'AC', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 5, burstAnnounced: false, ready: false, remainingHand: [], isHost: false },
      { seat: 'D', nickname: '丁', team: 'BD', connected: true, away: false, activeInHand: true, finishedRank: null, handCount: 6, burstAnnounced: false, ready: false, remainingHand: [], isHost: false },
    ],
    levels: { AC: '5', BD: '3' }, completedRounds: { AC: 0, BD: 0 }, candidateLeader: 'A', currentTurn: 'A',
    effectiveMain: '5', openingMode: 'normal', modeTeam: null, openingTurn: null, openingSkippedSeats: [], trick: null, publicLastPlay: null,
    finishOrder: [], burstAnnounced: [], burstPendingSeat: null, differenceAvailable: false, settlement: null,
  },
  private: {
    seat: 'A', hand: [standardCard('4', 'spades', 'a4'), standardCard('5', 'hearts', 'a5'), standardCard('6', 'clubs', 'a6')], burstLocked: false,
  },
};

describe('对局视图', () => {
  it('显示有效主和四人剩余牌数，但不渲染他人手牌', () => {
    render(<GameView snapshot={playing} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);

    expect(screen.getByText('本手主：5')).toBeInTheDocument();
    expect(screen.queryByText('当前牌权：甲')).not.toBeInTheDocument();
    expect(screen.getByText('乙 · 4张')).toBeInTheDocument();
    expect(screen.getByText('丙 · 5张')).toBeInTheDocument();
    expect(screen.getByText('丁 · 6张')).toBeInTheDocument();
    expect(screen.getByText('4♠')).toBeInTheDocument();
    expect(screen.queryByText('乙的手牌')).not.toBeInTheDocument();
  });

  it('按玩家相对视角布局，自己的头像永远在桌面下方', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      private: { ...playing.private, seat: 'B' },
    };
    const { container } = render(<GameView snapshot={snapshot} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);

    expect(container.querySelector('.table-seat.seat-bottom')).toHaveTextContent('乙 · 4张');
    expect(container.querySelector('.table-seat.seat-top')).toHaveTextContent('丁 · 6张');
  });

  it('开局立棍阶段只有当前玩家可以操作立棍或跳过', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      public: {
        ...playing.public,
        phase: 'opening',
        currentTurn: null,
        effectiveMain: null,
        openingMode: 'normal',
        modeTeam: null,
        candidateLeader: 'A',
        openingTurn: 'A',
        openingSkippedSeats: [],
      },
      private: { ...playing.private, seat: 'B', hand: [] },
    };
    render(<GameView snapshot={snapshot} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);

    expect(screen.getByRole('button', { name: '立棍' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '跳过' })).toBeDisabled();
    expect(screen.getByText('等待 A 选择')).toBeInTheDocument();
  });

  it('反立阶段只向对方玩家显示反立按钮', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      public: {
        ...playing.public,
        phase: 'opening',
        currentTurn: null,
        effectiveMain: null,
        openingMode: 'reverse',
        modeTeam: 'AC',
        candidateLeader: 'C',
        openingTurn: 'D',
        openingSkippedSeats: [],
      },
      private: { ...playing.private, seat: 'A', hand: [] },
    };
    render(<GameView snapshot={snapshot} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);

    expect(screen.queryByRole('button', { name: '反立' })).not.toBeInTheDocument();
    expect(screen.getByText('等待 D 选择')).toBeInTheDocument();
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

  it('选择合法手牌后点击桌面空白处直接出牌', () => {
    const onCommand = vi.fn();
    render(<GameView snapshot={playing} onCommand={onCommand} onActivity={vi.fn()} testMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: '4♠' }));
    fireEvent.click(screen.getByRole('main'));

    expect(onCommand).toHaveBeenCalledWith('play', { cardIds: ['a4'] });
  });

  it('不是自己的牌权时不能点击出牌，避免提交必然被服务端拒绝的命令', () => {
    render(<GameView snapshot={{ ...playing, public: { ...playing.public, currentTurn: 'B' } }} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: '4♠' }));
    expect(screen.getByRole('button', { name: '出牌' })).toBeDisabled();
  });

  it('公开展示上一手实际出的牌，并顺时针高亮当前牌权头像', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      public: {
        ...playing.public,
        publicLastPlay: { seat: 'A', cards: [standardCard('A', 'hearts', 'played-ace')], kind: 'single', isDifference: false },
      },
    };
    render(<GameView snapshot={snapshot} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);

    expect(screen.getByText('A♥')).toHaveClass('played-card', 'red');
    expect(document.querySelector('.player-avatar.current-turn')).toBeInTheDocument();
  });

  it('剩余手牌可整手出完时强制先选择报爆或不爆', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      private: {
        ...playing.private,
        hand: [standardCard('8', 'clubs', 'burst-8-1'), standardCard('8', 'hearts', 'burst-8-2')],
      },
      public: { ...playing.public, burstPendingSeat: 'A' },
    };
    const onCommand = vi.fn();
    render(<GameView snapshot={snapshot} onCommand={onCommand} onActivity={vi.fn()} testMode={false} />);

    expect(screen.getByText('剩余手牌可以一次出完，请选择是否爆牌')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '不爆，继续出牌' }));
    expect(onCommand).toHaveBeenCalledWith('burst', { kind: 'skip' });
  });

  it('差牌按钮不受当前牌权限制，并且只提交差牌声明', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      private: {
        seat: 'D',
        hand: [
          standardCard('4', 'spades', 'ui-d-4-1'),
          standardCard('4', 'hearts', 'ui-d-4-2'),
          standardCard('3', 'clubs', 'ui-d-3'),
          standardCard('8', 'clubs', 'ui-d-8'),
        ],
        burstLocked: false,
      },
      public: {
        ...playing.public,
        currentTurn: 'B',
        trick: {
          leadSeat: 'A', lastPlaySeat: 'A', kind: 'single',
          cards: [standardCard('4', 'diamonds', 'ui-lead-4')], passCount: 0,
        },
      },
    };
    const onCommand = vi.fn();
    render(<GameView snapshot={snapshot} onCommand={onCommand} onActivity={vi.fn()} testMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: '4♠' }));
    fireEvent.click(screen.getByRole('button', { name: '4♥' }));
    const difference = screen.getByRole('button', { name: '差牌' });
    expect(difference).toBeEnabled();
    fireEvent.click(difference);
    expect(onCommand).toHaveBeenCalledWith('play', { cardIds: ['ui-d-4-1', 'ui-d-4-2'], declaration: 'difference' });
  });

  it('一对2拆出单张跟牌时不显示差牌选项', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      private: {
        seat: 'D',
        hand: [standardCard('2', 'spades', 'ui-split-2-1'), standardCard('2', 'hearts', 'ui-split-2-2'), standardCard('3', 'clubs', 'ui-split-3')],
        burstLocked: false,
      },
      public: {
        ...playing.public,
        currentTurn: 'D',
        trick: {
          leadSeat: 'A', lastPlaySeat: 'A', kind: 'single',
          cards: [standardCard('A', 'diamonds', 'ui-split-lead-ace')], passCount: 0,
        },
      },
    };
    const onCommand = vi.fn();
    render(<GameView snapshot={snapshot} onCommand={onCommand} onActivity={vi.fn()} testMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: '2♠' }));
    expect(screen.queryByRole('button', { name: '差牌' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '出牌' }));
    expect(onCommand).toHaveBeenCalledWith('play', { cardIds: ['ui-split-2-1'] });
  });

  it('一对A拆出单张管K时不显示差牌选项', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      private: {
        seat: 'D',
        hand: [standardCard('A', 'clubs', 'ui-split-ace-1'), standardCard('A', 'diamonds', 'ui-split-ace-2')],
        burstLocked: false,
      },
      public: {
        ...playing.public,
        currentTurn: 'B',
        trick: {
          leadSeat: 'C', lastPlaySeat: 'C', kind: 'single',
          cards: [standardCard('K', 'hearts', 'ui-split-ace-lead')], passCount: 0,
        },
      },
    };
    const onCommand = vi.fn();
    render(<GameView snapshot={snapshot} onCommand={onCommand} onActivity={vi.fn()} testMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'A♣' }));
    expect(screen.queryByRole('button', { name: '差牌' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '出牌' })).toBeDisabled();
  });

  it('有人可以出差牌时不显示正常牌权头像特效，且不提供牌型按钮', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      public: { ...playing.public, differenceAvailable: true },
    };
    render(<GameView snapshot={snapshot} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);

    expect(document.querySelector('.player-avatar.current-turn')).not.toBeInTheDocument();
    expect(screen.queryByText(/按.+出牌/)).not.toBeInTheDocument();
  });

  it('进入下一局时清除上一局残留的选中牌', () => {
    const { rerender } = render(<GameView snapshot={playing} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);
    fireEvent.click(screen.getByRole('button', { name: '4♠' }));
    expect(screen.getByRole('button', { name: '4♠' })).toHaveClass('selected');

    rerender(<GameView snapshot={{
      ...playing,
      public: { ...playing.public, handNumber: 2, phase: 'opening', currentTurn: null },
      private: { ...playing.private, hand: [standardCard('4', 'spades', 'a4')] },
    }} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);
    expect(screen.getByRole('button', { name: '4♠' })).not.toHaveClass('selected');
  });

  it('结算弹窗关闭后显示剩余手牌并自动提交准备', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      public: {
        ...playing.public,
        phase: 'settled', currentTurn: null,
        players: playing.public.players.map((player) => player.seat === 'B'
          ? { ...player, handCount: 2, remainingHand: [standardCard('8', 'clubs', 'remaining-8'), standardCard('9', 'hearts', 'remaining-9')] }
          : player),
        settlement: { levels: { AC: '7', BD: '3' }, completedRounds: { AC: 0, BD: 0 }, outcome: 'grab-two', winnerTeam: 'AC', nextLeader: 'A' },
      },
    };
    const onReady = vi.fn();
    render(<GameView snapshot={snapshot} onCommand={vi.fn()} onActivity={vi.fn()} onReady={onReady} testMode={false} />);

    expect(screen.getByRole('dialog', { name: '本局结算' })).toBeInTheDocument();
    expect(screen.queryByText(/"outcome"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭并准备下一局' }));

    expect(screen.queryByRole('dialog', { name: '本局结算' })).not.toBeInTheDocument();
    expect(screen.getByText('8♣')).toHaveClass('played-card', 'black');
    expect(document.querySelector('.table-seat.seat-left .remaining-hand')).toHaveTextContent('8♣');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('立棍或反立淘汰的队友，头像和手牌都会显示为弃牌状态', () => {
    const snapshot: RoomSnapshot = {
      ...playing,
      public: {
        ...playing.public,
        openingMode: 'stand', modeTeam: 'AC', currentTurn: 'A',
        players: playing.public.players.map((player) => player.seat === 'C'
          ? { ...player, activeInHand: false, handCount: 3 }
          : player),
      },
      private: { seat: 'C', hand: [standardCard('4', 'spades', 'discarded-4')], burstLocked: false },
    };
    render(<GameView snapshot={snapshot} onCommand={vi.fn()} onActivity={vi.fn()} testMode={false} />);

    expect(document.querySelector('.player-seat.discarded-player')).toBeInTheDocument();
    expect(screen.getByText('弃牌')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4♠' })).toBeDisabled();
    expect(document.querySelector('.card-hand.dimmed')).toBeInTheDocument();
  });
});
