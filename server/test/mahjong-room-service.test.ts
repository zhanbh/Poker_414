import { describe, expect, it } from 'vitest';
import { MahjongAction, MahjongCommandEnvelope } from '../../shared/src/protocol';
import { createMahjongDeck, MahjongMeld, MahjongSeat, MahjongTile } from '../../shared/src/mahjong';
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
    while (next.public.pendingDiscard) {
      const actor = players.find((candidate) => room.getSnapshot(candidate.sessionToken).private.availableActions.includes('pass'));
      expect(actor).toBeDefined();
      const view = room.getSnapshot(actor!.sessionToken);
      next = room.dispatch(actor!.sessionToken, command('pass', view.public.handNumber, view.public.version)).snapshot;
    }

    expect(next.public.currentTurn).toBe('B');
    expect(next.public.pendingDiscard).toBeNull();
    expect(next.public.lastDiscard?.tile.id).toBe(tile.id);
    expect(room.getSnapshot(players[1].sessionToken).private.hand).toHaveLength(14);
  });

  it('碰优先于吃，吃家必须等待碰家决定后才获得吃或过选项', () => {
    const room = new MahjongRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, 'mahjong');
      return auth;
    });
    const lobby = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));

    const tiles = createMahjongDeck();
    const discard = tiles.find((tile) => tile.suit === 'dots' && tile.rank === 5 && tile.id.endsWith('-0'))!;
    const chiTiles = [
      tiles.find((tile) => tile.suit === 'dots' && tile.rank === 4 && tile.id.endsWith('-0'))!,
      tiles.find((tile) => tile.suit === 'dots' && tile.rank === 6 && tile.id.endsWith('-0'))!,
    ];
    const pengTiles = tiles.filter((tile) => tile.suit === 'dots' && tile.rank === 5 && tile.id !== discard.id).slice(0, 2);
    const unavailable = new Set([discard.id, ...chiTiles.map((tile) => tile.id), ...pengTiles.map((tile) => tile.id)]);
    const fillers = tiles.filter((tile) => !unavailable.has(tile.id));
    const internals = room as unknown as {
      state: {
        players: Record<MahjongSeat, { hand: MahjongTile[]; discards: MahjongTile[] } | null>;
        pending: { seat: MahjongSeat; tile: MahjongTile; options: Partial<Record<MahjongSeat, MahjongAction[]>>; passed: MahjongSeat[] } | null;
      };
    };
    internals.state.players.A!.discards = [discard];
    internals.state.players.A!.hand = internals.state.players.A!.hand.filter((tile) => tile.id !== discard.id);
    internals.state.players.B!.hand = [...chiTiles, ...fillers.slice(0, 11)];
    internals.state.players.C!.hand = [...pengTiles, ...fillers.slice(11, 22)];
    internals.state.pending = { seat: 'A', tile: discard, options: { B: ['chi'], C: ['peng'] }, passed: [] };

    const chiViewBeforePengResponds = room.getSnapshot(players[1].sessionToken);
    expect(chiViewBeforePengResponds.private.availableActions).toEqual([]);
    expect(chiViewBeforePengResponds.private.chiOptions).toBeUndefined();
    expect(() => room.dispatch(players[1].sessionToken, command('pass', chiViewBeforePengResponds.public.handNumber, chiViewBeforePengResponds.public.version)))
      .toThrow('有优先级更高的玩家正在响应');

    const pengView = room.getSnapshot(players[2].sessionToken);
    expect(pengView.private.availableActions).toEqual(['peng', 'pass']);
    room.dispatch(players[2].sessionToken, command('pass', pengView.public.handNumber, pengView.public.version));

    const chiViewAfterPengPasses = room.getSnapshot(players[1].sessionToken);
    expect(chiViewAfterPengPasses.public.responseSeats).toEqual(['B']);
    expect(chiViewAfterPengPasses.private.availableActions).toEqual(['chi', 'pass']);
    expect(chiViewAfterPengPasses.private.chiOptions).toHaveLength(1);
  });

  it('听牌玩家可以自摸由三组碰完成的大风牌', () => {
    const room = new MahjongRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, 'mahjong');
      return auth;
    });
    const lobby = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));

    const deck = createMahjongDeck();
    const tile = (suit: string, rank: number | string, copy = 0) => deck.find((candidate) => candidate.suit === suit && candidate.rank === rank && candidate.id.endsWith('-' + copy))!;
    const pongs: MahjongMeld[] = [
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 2, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('bamboo', 3, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 6, copy)) },
    ];
    const concealed = [tile('characters', 5), tile('characters', 6), tile('characters', 7), tile('bamboo', 1)];
    const drawn = tile('dots', 2, 3);
    const internals = room as unknown as {
      state: {
        phase: 'playing';
        currentTurn: MahjongSeat;
        awaitingDiscard: boolean;
        pending: unknown;
        players: Record<MahjongSeat, {
          hand: MahjongTile[];
          melds: MahjongMeld[];
          isListening: boolean;
          listenWaits: MahjongTile[];
          listenBao: MahjongTile | null;
          lastDrawnTileId: string | null;
        } | null>;
      };
    };
    const player = internals.state.players.B!;
    player.hand = [...concealed, drawn];
    player.melds = pongs;
    player.isListening = true;
    player.listenWaits = [];
    player.listenBao = null;
    player.lastDrawnTileId = drawn.id;
    internals.state.currentTurn = 'B';
    internals.state.awaitingDiscard = true;
    internals.state.pending = null;

    const readyView = room.getSnapshot(players[1].sessionToken);
    expect(readyView.private.availableActions).toEqual(['hu', 'pass']);
    const result = room.dispatch(players[1].sessionToken, command('hu', readyView.public.handNumber, readyView.public.version));
    expect(result.snapshot.public.settlement?.winPattern).toBe('big-wind');
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
