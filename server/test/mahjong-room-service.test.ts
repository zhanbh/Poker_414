import { describe, expect, it } from 'vitest';
import { MahjongCommandEnvelope } from '../../shared/src/protocol';
import { MahjongRoomService } from '../src/mahjong-room-service';

function command(type: MahjongCommandEnvelope['type'], handNumber: number, stateVersion: number, payload: MahjongCommandEnvelope['payload'] = {}): MahjongCommandEnvelope {
  return { type, requestId: type + '-' + Math.random(), handNumber, stateVersion, payload };
}

describe('MahjongRoomService', () => {
  it('四名玩家入座后可以开始，庄家拿到第十四张牌', () => {
    const room = new MahjongRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, 'mahjong');
      return auth;
    });

    const lobby = room.getSnapshot(players[0].sessionToken);
    expect(lobby.public.players).toHaveLength(4);
    const started = room.dispatch(players[0].sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));

    expect(started.snapshot.public.phase).toBe('playing');
    expect(started.snapshot.public.dealerSeat).toBe('A');
    expect(started.snapshot.public.currentTurn).toBe('A');
    expect(room.getSnapshot(players[0].sessionToken).private.hand).toHaveLength(14);
    expect(room.getSnapshot(players[1].sessionToken).private.hand).toHaveLength(13);
  });

  it('出牌后没有响应时按顺序摸牌并把牌权交给下一位', () => {
    const room = new MahjongRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, 'mahjong');
      return auth;
    });
    const lobby = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));
    const dealerView = room.getSnapshot(players[0].sessionToken);
    const tile = dealerView.private.hand[0]!;
    let next = room.dispatch(players[0].sessionToken, command('discard', dealerView.public.handNumber, dealerView.public.version, { tileId: tile.id })).snapshot;
    for (const seat of next.public.responseSeats) {
      const actor = players.find((candidate) => room.getSnapshot(candidate.sessionToken).private.seat === seat)!;
      const view = room.getSnapshot(actor.sessionToken);
      next = room.dispatch(actor.sessionToken, command('pass', view.public.handNumber, view.public.version)).snapshot;
    }

    expect(next.public.currentTurn).toBe('B');
    expect(next.public.pendingDiscard).toBeNull();
    expect(next.public.lastDiscard?.tile.id).toBe(tile.id);
    expect(room.getSnapshot(players[1].sessionToken).private.hand).toHaveLength(14);
  });

  it('断线五分钟后释放大厅座位', () => {
    let now = 1_000;
    const room = new MahjongRoomService({ inviteCode: 'inner-414', now: () => now });
    const first = room.login('inner-414');
    const replacement = room.login('inner-414');
    room.join(first.sessionToken, '甲', 'mahjong');
    room.attach(first.sessionToken, 'socket-1');
    room.disconnect(first.sessionToken, 'socket-1');
    expect(() => room.join(replacement.sessionToken, '甲', 'mahjong')).toThrow('昵称已经被使用');

    now += 5 * 60 * 1_000;
    expect(room.scan(now)).toBe(true);
    const snapshot = room.join(replacement.sessionToken, '甲', 'mahjong');
    expect(snapshot.private.seat).toBe('A');
  });
});
