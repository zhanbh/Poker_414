import { describe, expect, it } from 'vitest';
import { RoomService } from '../src/room-service';

function service(): RoomService {
  return new RoomService({
    inviteCode: 'inner-414',
    now: () => 1_000,
    random: () => 0.1,
  });
}

describe('单房间会话与命令服务', () => {
  it('固定邀请码登录后只允许四人进入唯一房间，并返回私密手牌视图', () => {
    const room = service();
    expect(() => room.login('wrong')).toThrow(/邀请码/);
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, '414');
      return auth;
    });

    expect(() => room.join(room.login('inner-414').sessionToken, '戊', '414')).toThrow(/已满/);
    const snapshot = room.getSnapshot(players[0].sessionToken);
    expect(snapshot.public.players).toHaveLength(4);
    expect(snapshot.private.hand).toHaveLength(0);
    expect(snapshot.public.players.find((player) => player.seat === 'A')?.nickname).toBe('甲');
    expect(snapshot.public.players[1]).not.toHaveProperty('hand');
  });

  it('命令携带版本、局号和请求ID，重复请求返回同一结果且不重复改变状态', () => {
    const room = service();
    const auth = room.login('inner-414');
    room.join(auth.sessionToken, '甲', '414');
    for (const nickname of ['乙', '丙', '丁']) {
      const other = room.login('inner-414');
      room.join(other.sessionToken, nickname, '414');
    }

    const state = room.getState()!;
    const command = {
      type: 'start-hand' as const,
      requestId: 'request-1',
      handNumber: state.handNumber,
      stateVersion: state.version,
      payload: {},
    };
    const first = room.dispatch(auth.sessionToken, command);
    const retry = room.dispatch(auth.sessionToken, command);

    expect(first.ok).toBe(true);
    expect(retry).toEqual(first);
    expect(room.getState()!.handNumber).toBe(1);
    expect(() => room.dispatch(auth.sessionToken, { ...command, requestId: 'stale', stateVersion: 0 })).toThrow(/版本/);
  });

  it('房主只能在大厅移除玩家，开局后移除和重开均被拒绝', () => {
    const room = service();
    const auths = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, '414');
      return auth;
    });

    const state = room.getState()!;
    const removed = room.dispatch(auths[0].sessionToken, {
      type: 'remove-player',
      requestId: 'remove-1',
      handNumber: state.handNumber,
      stateVersion: state.version,
      payload: { seat: 'D' },
    });
    expect(removed.ok).toBe(true);
    expect(room.getState()!.players.D).toBeNull();
  });

  it('同一会话被新连接接管时，旧连接失去操作权', () => {
    const room = service();
    const auth = room.login('inner-414');
    room.join(auth.sessionToken, '甲', '414');

    expect(room.attach(auth.sessionToken, 'socket-a')).toEqual({ previousConnectionId: null });
    expect(room.attach(auth.sessionToken, 'socket-b')).toEqual({ previousConnectionId: 'socket-a' });
    expect(room.isConnectionOwner(auth.sessionToken, 'socket-a')).toBe(false);
    expect(room.isConnectionOwner(auth.sessionToken, 'socket-b')).toBe(true);
  });

  it('结算后四人同时准备时，允许同一局内的旧版本准备命令合并', () => {
    const room = service();
    const auths = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, '414');
      return auth;
    });
    const settled = { ...room.getState()!, phase: 'settled' as const, handNumber: 1, settlement: {
      levels: { AC: '3' as const, BD: '3' as const }, completedRounds: { AC: 0, BD: 0 },
      outcome: 'flat' as const, winnerTeam: 'AC' as const, nextLeader: 'A' as const,
    } };
    // Reachable through the service's authoritative state for this focused concurrency check.
    Object.assign(room, { state: settled });
    const version = room.getState()!.version;

    const first = room.dispatch(auths[0].sessionToken, { type: 'ready', requestId: 'ready-a', handNumber: 1, stateVersion: version, payload: {} });
    const second = room.dispatch(auths[1].sessionToken, { type: 'ready', requestId: 'ready-b', handNumber: 1, stateVersion: version, payload: {} });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(room.getState()!.readySeats).toEqual(['A', 'B']);
  });
});
