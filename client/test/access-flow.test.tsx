/* @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { RoomSnapshot } from '../../shared/src/protocol';

function snapshot(phase: string): RoomSnapshot {
  return {
    public: {
      roomId: '414', phase, handNumber: 0, version: 1, hostSeat: 'A', players: [],
      levels: { AC: '3', BD: '3' }, completedRounds: { AC: 0, BD: 0 }, candidateLeader: null,
      currentTurn: null, effectiveMain: null, openingMode: 'normal', modeTeam: null, trick: null,
      publicLastPlay: null, finishOrder: [], burstAnnounced: [], settlement: null,
    },
    private: { seat: null, hand: [], burstLocked: false },
  };
}

describe('登录路径', () => {
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
  });
});
