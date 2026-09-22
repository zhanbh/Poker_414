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
    const started = room.dispatch(first.sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));

    expect(started.snapshot.public.phase).toBe('preflop');
    expect(started.snapshot.public.pot).toBe(30);
    expect(started.snapshot.private.holeCards).toHaveLength(2);
    expect(started.snapshot.public.currentTurn).toBeTruthy();
  });

  it('开局后进入的玩家排队，并在下一局准备阶段自动入座', () => {
    const room = new TexasRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
    const first = room.login('inner-414');
    const second = room.login('inner-414');
    const waiting = room.login('inner-414');
    room.join(first.sessionToken, '甲', 'texas');
    room.join(second.sessionToken, '乙', 'texas');
    const lobby = room.getSnapshot(first.sessionToken);
    room.dispatch(first.sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));

    const queued = room.join(waiting.sessionToken, '丙', 'texas');
    expect(queued.public.players).toHaveLength(2);
    expect(queued.private.waiting).toBe(true);
    expect(queued.public.spectators[0]?.waiting).toBe(true);

    const firstView = room.getSnapshot(first.sessionToken);
    const firstAllIn = room.dispatch(first.sessionToken, command('all-in', firstView.public.handNumber, firstView.public.version));
    const secondView = room.getSnapshot(second.sessionToken);
    expect(firstAllIn.snapshot.public.currentTurn).toBe(secondView.public.currentTurn);
    room.dispatch(second.sessionToken, command('all-in', secondView.public.handNumber, secondView.public.version));

    const settled = room.getSnapshot(first.sessionToken);
    expect(settled.public.phase).toBe('settled');
    room.dispatch(first.sessionToken, command('next-hand', settled.public.handNumber, settled.public.version));
    const nextLobby = room.getSnapshot(waiting.sessionToken);
    expect(nextLobby.private.waiting).toBe(false);
    expect(nextLobby.private.seat).toBe('C');
    expect(nextLobby.public.players).toHaveLength(3);
  });
  it('满员后自动把后来者放入观战位', () => {
    const room = new TexasRoomService({ inviteCode: 'inner-414' });
    const sessions = Array.from({ length: 5 }, () => room.login('inner-414'));
    sessions.slice(0, 4).forEach((auth, index) => room.join(auth.sessionToken, '玩家' + index, 'texas'));
    const spectator = room.join(sessions[4].sessionToken, '观众', 'texas');

    expect(spectator.private.spectator).toBe(true);
    expect(spectator.public.players).toHaveLength(4);
    expect(spectator.private.spectatorHands).toHaveLength(4);
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
