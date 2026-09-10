import { describe, expect, it } from 'vitest';
import { RoomService } from '../../server/src/room-service';

describe('四人房间到开局验收', () => {
  it('四个会话可以用邀请码进入唯一房间并收到各自私密手牌', () => {
    const room = new RoomService({ inviteCode: 'inner-414', now: () => 100, random: () => 0.2 });
    const auths = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, '414');
      return auth;
    });
    const hostState = room.getState()!;
    const result = room.dispatch(auths[0].sessionToken, {
      type: 'start-hand', requestId: 'start', handNumber: hostState.handNumber, stateVersion: hostState.version, payload: {},
    });

    expect(result.ok).toBe(true);
    const views = auths.map((auth) => room.getSnapshot(auth.sessionToken));
    expect(views.every((view) => view.public.phase === 'opening')).toBe(true);
    expect(views.map((view) => view.private.hand.length).sort((a, b) => a - b)).toEqual([13, 13, 14, 14]);
    expect(views[0].public.players[0]).not.toHaveProperty('hand');
    expect(new Set(views.flatMap((view) => view.private.hand.map((card) => card.id))).size).toBe(54);
  });
});
