import { describe, expect, it } from 'vitest';
import { TexasRoomService } from '../src/texas-room-service';
import { TexasCommandEnvelope } from '../../shared/src/protocol';
import { compareTexasHands, evaluateTexasHand, TexasCard } from '../../shared/src/texas';

function command(type: TexasCommandEnvelope['type'], handNumber: number, stateVersion: number, payload: TexasCommandEnvelope['payload'] = {}): TexasCommandEnvelope {
  return { type, requestId: type + '-' + Math.random(), handNumber, stateVersion, payload };
}

describe('TexasRoomService', () => {
  it('允许两名玩家开始牌局并发出自己的两张手牌', () => {
    const room = new TexasRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
    const first = room.login('inner-414');
    const second = room.login('inner-414');
    room.join(first.sessionToken, '甲', 'texas');
    room.join(second.sessionToken, '乙', 'texas');

    const lobby = room.getSnapshot(first.sessionToken);
    expect(lobby.public.players.map((player) => player.positionLabel)).toEqual(expect.arrayContaining(['庄位/小盲', '大盲 BB']));
    const started = room.dispatch(first.sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));

    expect(started.snapshot.public.phase).toBe('preflop');
    expect(started.snapshot.public.pot).toBe(30);
    expect(started.snapshot.private.holeCards).toHaveLength(2);
    expect(started.snapshot.public.currentTurn).toBeTruthy();
    expect(started.snapshot.public.players.map((player) => player.positionLabel)).toEqual(expect.arrayContaining(['庄位/小盲', '大盲 BB']));
  });

  it('随机从八个空闲座位中分配入座位置', () => {
    const room = new TexasRoomService({ inviteCode: 'inner-414', random: () => 0.99 });
    const sessions = Array.from({ length: 4 }, () => room.login('inner-414'));
    const seats = sessions.map((auth, index) => room.join(auth.sessionToken, '玩家' + index, 'texas').private.seat);

    expect(new Set(seats).size).toBe(4);
    expect(seats).toEqual(['H', 'G', 'F', 'E']);
  });

  it('牌局中进入的玩家占用空闲座位，但等待本局结束后自动参加下一局', () => {
    const room = new TexasRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
    const first = room.login('inner-414');
    const second = room.login('inner-414');
    const waiting = room.login('inner-414');
    room.join(first.sessionToken, '甲', 'texas');
    room.join(second.sessionToken, '乙', 'texas');
    const lobby = room.getSnapshot(first.sessionToken);
    room.dispatch(first.sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));

    const queued = room.join(waiting.sessionToken, '丙', 'texas');
    const waitingSeat = queued.private.seat;
    expect(waitingSeat).toBeTruthy();
    expect(queued.private.waiting).toBe(true);
    expect(queued.private.spectator).toBe(true);
    expect(queued.public.players).toHaveLength(3);
    expect(queued.public.players.find((player) => player.seat === waitingSeat)?.waiting).toBe(true);
    expect(queued.public.spectators).toHaveLength(0);

    const firstView = room.getSnapshot(first.sessionToken);
    const firstActor = firstView.public.currentTurn === firstView.private.seat ? first : second;
    const secondActor = firstActor === first ? second : first;
    const firstActorView = room.getSnapshot(firstActor.sessionToken);
    const firstAllIn = room.dispatch(firstActor.sessionToken, command('all-in', firstActorView.public.handNumber, firstActorView.public.version));
    const secondView = room.getSnapshot(secondActor.sessionToken);
    expect(firstAllIn.snapshot.public.currentTurn).toBe(secondView.public.currentTurn);
    room.dispatch(secondActor.sessionToken, command('all-in', secondView.public.handNumber, secondView.public.version));

    const settled = room.getSnapshot(first.sessionToken);
    expect(settled.public.phase).toBe('settled');
    room.dispatch(first.sessionToken, command('next-hand', settled.public.handNumber, settled.public.version));
    const nextLobby = room.getSnapshot(waiting.sessionToken);
    expect(nextLobby.private.waiting).toBe(false);
    expect(nextLobby.private.spectator).toBe(false);
    expect(nextLobby.private.seat).toBe(waitingSeat);
    expect(nextLobby.public.players).toHaveLength(3);
  });

  it('八个座位满员后，后来者进入纯观战位', () => {
    const room = new TexasRoomService({ inviteCode: 'inner-414' });
    const sessions = Array.from({ length: 9 }, () => room.login('inner-414'));
    sessions.slice(0, 8).forEach((auth, index) => room.join(auth.sessionToken, '玩家' + index, 'texas'));
    const spectator = room.join(sessions[8].sessionToken, '观众', 'texas');

    expect(spectator.private.seat).toBeNull();
    expect(spectator.private.spectator).toBe(true);
    expect(spectator.public.players).toHaveLength(8);
    expect(spectator.public.spectators).toHaveLength(1);
    expect(spectator.private.spectatorHands).toHaveLength(8);
  });

  it('在线同名玩家不能再次占用座位', () => {
    const room = new TexasRoomService({ inviteCode: 'inner-414' });
    const first = room.login('inner-414');
    const second = room.login('inner-414');
    room.join(first.sessionToken, '车文晶', 'texas');

    expect(() => room.join(second.sessionToken, '车文晶', 'texas')).toThrow('昵称已经被使用');
    expect(room.getSnapshot(first.sessionToken).public.players).toHaveLength(1);
  });
  it('断线后同一用户重新进入不会重复占用座位', () => {
    const room = new TexasRoomService({ inviteCode: 'inner-414' });
    const first = room.login('inner-414');
    const second = room.login('inner-414');
    room.join(first.sessionToken, '车文晶', 'texas');
    room.attach(first.sessionToken, 'connection-1');
    room.disconnect(first.sessionToken, 'connection-1');
    room.join(second.sessionToken, '车文晶', 'texas');

    const snapshot = room.getSnapshot(second.sessionToken);
    expect(snapshot.public.players).toHaveLength(1);
    expect(snapshot.public.players[0]?.nickname).toBe('车文晶');
  });
});

describe('Texas hand evaluator', () => {
  const card = (rank: TexasCard['rank'], suit: TexasCard['suit'], id = rank + suit): TexasCard => ({ id, rank, suit });

  it('能识别同花顺并比较 A 高同花顺', () => {
    const wheel = evaluateTexasHand([
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'), card('T', 'spades'), card('2', 'clubs'), card('3', 'diamonds'),
    ]);
    const lower = evaluateTexasHand([
      card('K', 'hearts'), card('Q', 'hearts'), card('J', 'hearts'), card('T', 'hearts'), card('9', 'hearts'), card('2', 'clubs'), card('3', 'diamonds'),
    ]);
    expect(wheel.category).toBe('straight-flush');
    expect(compareTexasHands(wheel, lower)).toBeGreaterThan(0);
  });
});
