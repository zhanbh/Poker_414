/* @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { RoomSnapshot } from '../../shared/src/protocol';

function snapshot(phase: string): RoomSnapshot {
  return {
    public: {
      roomId: '414', phase, handNumber: 0, version: 1, hostSeat: 'A', players: [],
      levels: { AC: '3', BD: '3' }, completedRounds: { AC: 0, BD: 0 }, candidateLeader: null,
      currentTurn: null, effectiveMain: null, openingMode: 'normal', modeTeam: null, openingTurn: null, openingSkippedSeats: [], trick: null,
      publicLastPlay: null, finishOrder: [], burstAnnounced: [], burstPendingSeat: null, differenceAvailable: false, settlement: null,
    },
    private: { seat: null, hand: [], burstLocked: false },
  };
}

describe('登录路径', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('邀请码和昵称正确时进入大厅，错误邀请码留在当前页面', async () => {
    const transport = {
      login: async (inviteCode: string) => {
        if (inviteCode !== 'inner-414') throw new Error('邀请码错误');
        return { sessionToken: 'session-a', playerId: 'player-a' };
      },
      join: async () => snapshot('lobby'),
      subscribe: () => () => undefined,
      onReplaced: () => () => undefined,
      activity: () => undefined,
      command: async () => ({ ok: true as const, snapshot: snapshot('lobby') }),
      leave: async () => undefined,
    };
    render(<App transport={transport} />);

    fireEvent.change(screen.getByLabelText('邀请码'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '甲' } });
    fireEvent.click(screen.getByRole('button', { name: '进入房间' }));
    expect(await screen.findByText('邀请码错误')).toBeInTheDocument();
    expect(screen.getByText('414 内测')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('邀请码'), { target: { value: 'inner-414' } });
    fireEvent.click(screen.getByRole('button', { name: '进入房间' }));
    await waitFor(() => expect(screen.getByText('等待开局')).toBeInTheDocument());
    expect(localStorage.getItem('414.sessionToken')).toBe('session-a');
  });

  it('测试模式为每个标签页使用独立会话，并显示测试提示', async () => {
    window.history.replaceState({}, '', '/?test=1');
    let restoredToken: string | undefined;
    const transport = {
      login: async (_inviteCode: string, sessionToken?: string) => {
        restoredToken = sessionToken;
        return { sessionToken: 'session-test-a', playerId: 'player-test-a' };
      },
      join: async () => snapshot('lobby'),
      subscribe: () => () => undefined,
      onReplaced: () => () => undefined,
      activity: () => undefined,
      command: async () => ({ ok: true as const, snapshot: snapshot('lobby') }),
      leave: async () => undefined,
    };
    render(<App transport={transport} />);

    expect(screen.getByRole('status')).toHaveTextContent('独立玩家会话');
    fireEvent.change(screen.getByLabelText('邀请码'), { target: { value: 'inner-414' } });
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '测试 A' } });
    fireEvent.click(screen.getByRole('button', { name: '进入房间' }));
    await waitFor(() => expect(screen.getByText('等待开局')).toBeInTheDocument());

    expect(restoredToken).toBeUndefined();
    expect(sessionStorage.getItem('414.sessionToken')).toBe('session-test-a');
    expect(localStorage.getItem('414.sessionToken')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('每个标签页都是独立玩家');
  });
});
