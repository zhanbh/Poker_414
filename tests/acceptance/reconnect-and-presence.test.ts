import { describe, expect, it } from 'vitest';
import { RoomService } from '../../server/src/room-service';

describe('重连与暂离验收', () => {
  it('1分钟只产生暂离标识，重连保留原座位和私密视图', () => {
    const room = new RoomService({ inviteCode: 'inner-414', now: () => 0, random: () => 0.1 });
    const auth = room.login('inner-414');
    room.join(auth.sessionToken, '甲', '414');
    room.attach(auth.sessionToken, 'socket-a');
    room.scan(59_999);
    expect(room.getSnapshot(auth.sessionToken).public.players[0].away).toBe(false);
    room.scan(60_000);
    expect(room.getSnapshot(auth.sessionToken).public.players[0].away).toBe(true);

    room.attach(auth.sessionToken, 'socket-b');
    room.scan(60_001);
    const view = room.getSnapshot(auth.sessionToken);
    expect(view.private.seat).toBe('A');
    expect(view.public.players[0].away).toBe(true);
    expect(room.isConnectionOwner(auth.sessionToken, 'socket-a')).toBe(false);
    expect(room.isConnectionOwner(auth.sessionToken, 'socket-b')).toBe(true);
  });
});
