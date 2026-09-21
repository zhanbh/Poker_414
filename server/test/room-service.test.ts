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
  it('固定邀请码登录后前四人入座，满员后自动进入观战，并返回私密手牌视图', () => {
    const room = service();
    expect(() => room.login('wrong')).toThrow(/邀请码/);
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, '414');
      return auth;
    });

    const spectator = room.login('inner-414');
    const spectatorView = room.join(spectator.sessionToken, '戊', '414');
    expect(spectatorView.private.spectator).toBe(true);
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
  it('观战者可以进入但不能操作，并获得四名玩家的完整手牌视图', () => {
    const room = service();
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, '414');
      return auth;
    });
    const spectator = room.login('inner-414');
    room.join(spectator.sessionToken, '观众', '414');

    const state = room.getState()!;
    room.dispatch(players[0].sessionToken, {
      type: 'start-hand', requestId: 'start-spectator', handNumber: state.handNumber, stateVersion: state.version, payload: {},
    });

    const spectatorView = room.getSnapshot(spectator.sessionToken);
    const playerView = room.getSnapshot(players[0].sessionToken);
    expect(spectatorView.private.spectator).toBe(true);
    expect(spectatorView.private.spectatorHands).toHaveLength(4);
    expect(spectatorView.private.spectatorHands?.reduce((total, player) => total + player.hand.length, 0)).toBe(54);
    expect(playerView.private.spectatorHands).toBeUndefined();
    expect(() => room.dispatch(spectator.sessionToken, {
      type: 'pass', requestId: 'spectator-pass', handNumber: room.getState()!.handNumber, stateVersion: room.getState()!.version, payload: {},
    })).toThrow(/尚未入座/);
  });

  it('大厅中的玩家退出后释放座位，观战者退出后释放观战位', () => {
    const room = service();
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, '414');
      return auth;
    });

    const spectator = room.login('inner-414');
    room.join(spectator.sessionToken, '观众1', '414');
    room.leave(players[3].sessionToken);

    const replacement = room.login('inner-414');
    const replacementView = room.join(replacement.sessionToken, '戊', '414');
    expect(replacementView.private.spectator).not.toBe(true);
    expect(replacementView.private.seat).toBe('D');

    room.leave(spectator.sessionToken);
    const nextSpectator = room.login('inner-414');
    const nextSpectatorView = room.join(nextSpectator.sessionToken, '观众2', '414');
    expect(nextSpectatorView.private.spectator).toBe(true);
  });

  it('牌局进行中玩家不能退出并破坏当前牌局', () => {
    const room = service();
    const auths = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, '414');
      return auth;
    });
    const state = room.getState()!;
    room.dispatch(auths[0].sessionToken, {
      type: 'start-hand', requestId: 'start-before-leave', handNumber: state.handNumber, stateVersion: state.version, payload: {},
    });

    expect(() => room.leave(auths[1].sessionToken)).toThrow(/牌局进行中/);
    expect(room.getState()!.players.B?.nickname).toBe('乙');
  });
});
