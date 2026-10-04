import { describe, expect, it } from 'vitest';
import { MahjongAction, MahjongCommandEnvelope } from '../../shared/src/protocol';
import { createMahjongDeck, MahjongMeld, MahjongSeat, MahjongTile } from '../../shared/src/mahjong';
import { MahjongRoomService } from '../src/mahjong-room-service';

function command(type: MahjongCommandEnvelope['type'], handNumber: number, stateVersion: number, payload: MahjongCommandEnvelope['payload'] = {}): MahjongCommandEnvelope {
  return { type, requestId: type + '-' + Math.random(), handNumber, stateVersion, payload };
}

describe('MahjongRoomService', () => {
  it('昵称只允许中文、字母、数字和下划线，且不能为空或超长', () => {
    const room = new MahjongRoomService({ inviteCode: 'inner-414' });
    const first = room.login('inner-414');
    expect(() => room.join(first.sessionToken, '   ', 'mahjong')).toThrow('昵称仅支持');
    expect(() => room.join(first.sessionToken, '甲-乙', 'mahjong')).toThrow('昵称仅支持');
    expect(() => room.join(first.sessionToken, '一二三四五六七八九十一二三', 'mahjong')).toThrow('昵称仅支持');
  });

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
    expect(started.snapshot.public.wallCount).toBe(83);
    expect(started.snapshot.public.wallLayout.sides.reduce((total, side) => total + side.liveTiles + side.replacementTiles, 0)).toBe(83);
    expect(started.snapshot.public.wallLayout.sides.reduce((total, side) => total + side.replacementTiles, 0)).toBe(4);
    expect(started.snapshot.public.wallLayout.breakSide).not.toBeNull();
    expect(room.getSnapshot(players[0].sessionToken).private.hand).toHaveLength(14);
    expect(room.getSnapshot(players[1].sessionToken).private.hand).toHaveLength(13);
  });

  it('可选任意一张会形成听牌的牌打出，并在听口预览中显示胡牌', () => {
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
    const selected = tile('characters', 4, 0);
    const drawn = tile('characters', 4, 2);
    const internals = room as unknown as {
      state: {
        players: Record<MahjongSeat, { hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null } | null>;
      };
    };
    const player = internals.state.players.A!;
    player.hand = [
      tile('characters', 1), tile('characters', 2), tile('characters', 3),
      selected, tile('characters', 4, 1), tile('characters', 5), tile('characters', 5, 1),
      tile('characters', 6), tile('characters', 7), tile('characters', 8), drawn,
    ];
    player.melds = [{ kind: 'chi', tiles: [tile('bamboo', 1), tile('bamboo', 2), tile('bamboo', 3)] }];
    player.lastDrawnTileId = drawn.id;

    const before = room.getSnapshot(players[0].sessionToken);
    const listenPreview = before.private.listenOptions?.find((option) => option.discardTileId === selected.id);
    expect(listenPreview?.waits.map((wait) => wait.label)).toContain('4万');
    expect(listenPreview).not.toHaveProperty('baoTile');
    expect(before.private).not.toHaveProperty('baoTile');
    const listened = room.dispatch(players[0].sessionToken, command('listen', before.public.handNumber, before.public.version, { tileId: selected.id }));
    expect(listened.snapshot.private.isListening).toBe(true);
    expect(listened.snapshot.private.listenWaits?.map((wait) => wait.label)).toContain('4万');
    expect(listened.snapshot.private.baoTile).toBeDefined();
    expect(room.getSnapshot(players[1].sessionToken).private).not.toHaveProperty('baoTile');
  });

  it('多个缺口不能误判为听牌：打出5条后万子和筒子都无法组成完整牌型', () => {
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
    const discard = tile('bamboo', 5);
    const internals = room as unknown as {
      state: {
        players: Record<MahjongSeat, { hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null } | null>;
      };
    };
    const player = internals.state.players.A!;
    player.hand = [
      tile('characters', 2), tile('characters', 4), tile('characters', 8), tile('characters', 9), discard,
      tile('dots', 4), tile('dots', 4, 1), tile('dots', 8), tile('dots', 8, 1), tile('dots', 9), tile('dots', 9, 1),
    ];
    player.melds = [{ kind: 'chi', tiles: [tile('bamboo', 1), tile('bamboo', 2), tile('bamboo', 3)] }];
    player.lastDrawnTileId = discard.id;

    const view = room.getSnapshot(players[0].sessionToken);
    expect(view.private.availableActions).not.toContain('listen');
    expect(view.private.listenOptions).toBeUndefined();
    expect(() => room.dispatch(players[0].sessionToken, command('listen', view.public.handNumber, view.public.version, { tileId: discard.id })))
      .toThrow('打出这张牌后不满足听牌条件');
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
    const startingWallCount = dealerView.public.wallCount;
    const firstLiveWallSide = dealerView.public.wallLayout.replacementSide!;
    const firstLiveWallCount = dealerView.public.wallLayout.sides.find((side) => side.seat === firstLiveWallSide)!.liveTiles;
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
    expect(next.public.wallCount).toBe(startingWallCount - 1);
    expect(next.public.wallLayout.sides.reduce((total, side) => total + side.liveTiles + side.replacementTiles, 0)).toBe(next.public.wallCount);
    expect(next.public.wallLayout.sides.find((side) => side.seat === firstLiveWallSide)!.liveTiles).toBe(firstLiveWallCount - 1);
    expect(room.getSnapshot(players[1].sessionToken).private.hand).toHaveLength(14);
    expect(room.getSnapshot(players[1].sessionToken).private.drawnTileId).toBeTruthy();
  });

  it('公共牌河按不同玩家的实际出牌先后顺序展示', () => {
    const room = new MahjongRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, 'mahjong');
      return auth;
    });
    const lobby = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));

    const deck = createMahjongDeck();
    const tile = (suit: string, rank: number, copy = 0) => deck.find((candidate) => candidate.suit === suit && candidate.rank === rank && candidate.id.endsWith('-' + copy))!;
    const firstDiscard = tile('characters', 1);
    const secondDiscard = tile('characters', 2);
    const internals = room as unknown as {
      state: {
        currentTurn: MahjongSeat;
        awaitingDiscard: boolean;
        players: Record<MahjongSeat, { hand: MahjongTile[]; lastDrawnTileId: string | null } | null>;
      };
    };
    internals.state.players.A!.hand = [firstDiscard];
    internals.state.players.B!.hand = [secondDiscard];
    internals.state.players.C!.hand = [tile('dots', 1)];
    internals.state.players.D!.hand = [tile('bamboo', 1)];
    internals.state.players.A!.lastDrawnTileId = null;
    internals.state.players.B!.lastDrawnTileId = null;
    internals.state.currentTurn = 'A';
    internals.state.awaitingDiscard = true;

    let view = room.getSnapshot(players[0].sessionToken);
    view = room.dispatch(players[0].sessionToken, command('discard', view.public.handNumber, view.public.version, { tileId: firstDiscard.id })).snapshot;
    const nextView = room.getSnapshot(players[1].sessionToken);
    view = room.dispatch(players[1].sessionToken, command('discard', nextView.public.handNumber, nextView.public.version, { tileId: secondDiscard.id })).snapshot;

    expect(view.public.discardRiver.map((discard) => [discard.seat, discard.tile.id])).toEqual([
      ['A', firstDiscard.id],
      ['B', secondDiscard.id],
    ]);
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
        discardRiver: Array<{ seat: MahjongSeat; tile: MahjongTile }>;
      };
    };
    internals.state.players.A!.discards = [discard];
    internals.state.discardRiver = [{ seat: 'A', tile: discard }];
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
    const claimed = room.dispatch(players[1].sessionToken, command('chi', chiViewAfterPengPasses.public.handNumber, chiViewAfterPengPasses.public.version, { tileIds: chiViewAfterPengPasses.private.chiOptions![0] })).snapshot;
    expect(claimed.public.discardRiver).toEqual([]);
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
    const concealed = [tile('characters', 5, 0), tile('characters', 5, 1), tile('characters', 6, 0), tile('characters', 6, 1)];
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
    expect(result.snapshot.public.revealedHands).toHaveLength(4);
    expect(result.snapshot.public.revealedHands?.find((player) => player.seat === 'B')?.hand.map((handTile) => handTile.id)).toContain(drawn.id);
  });

  it('点炮结算公开所有手牌，并将胡牌放入赢家明牌而不是弃牌区', () => {
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
    const winningTile = tile('winds', 'east', 3);
    const internals = room as unknown as {
      state: {
        currentTurn: MahjongSeat;
        awaitingDiscard: boolean;
        players: Record<MahjongSeat, {
          hand: MahjongTile[];
          melds: MahjongMeld[];
          discards: MahjongTile[];
          isListening: boolean;
          listenWaits: MahjongTile[];
          listenBao: MahjongTile | null;
          lastDrawnTileId: string | null;
        } | null>;
      };
    };
    internals.state.players.A!.hand = [winningTile];
    internals.state.players.B!.hand = [
      tile('bamboo', 2, 0), tile('bamboo', 2, 1), tile('bamboo', 2, 2),
      tile('characters', 1), tile('characters', 2), tile('characters', 3),
      tile('dots', 4), tile('dots', 5), tile('dots', 6), tile('winds', 'east'),
    ];
    internals.state.players.B!.melds = [{ kind: 'chi', tiles: [7, 8, 9].map((rank) => tile('characters', rank)) }];
    internals.state.players.B!.isListening = true;
    internals.state.players.B!.listenWaits = [winningTile];
    internals.state.players.B!.listenBao = null;
    internals.state.players.B!.lastDrawnTileId = null;
    internals.state.players.C!.hand = [tile('bamboo', 9)];
    internals.state.players.D!.hand = [tile('dots', 9)];
    internals.state.currentTurn = 'A';
    internals.state.awaitingDiscard = true;

    const beforeDiscard = room.getSnapshot(players[0].sessionToken);
    const response = room.dispatch(players[0].sessionToken, command('discard', beforeDiscard.public.handNumber, beforeDiscard.public.version, { tileId: winningTile.id })).snapshot;
    expect(room.getSnapshot(players[1].sessionToken).private.availableActions).toEqual(['hu', 'pass']);
    const result = room.dispatch(players[1].sessionToken, command('hu', response.public.handNumber, response.public.version));

    expect(result.snapshot.public.revealedHands).toHaveLength(4);
    expect(result.snapshot.public.revealedHands?.find((player) => player.seat === 'B')?.hand.map((handTile) => handTile.id)).toContain(winningTile.id);
    expect(result.snapshot.public.discardRiver).toEqual([]);
    expect(result.snapshot.public.players.find((player) => player.seat === 'A')?.discards).toEqual([]);
  });

  it('碰出的刻子不能代替暗手中的两对或一刻来满足听牌条件', () => {
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
    const drawnEast = tile('winds', 'east');
    const internals = room as unknown as {
      state: {
        players: Record<MahjongSeat, {
          hand: MahjongTile[];
          melds: MahjongMeld[];
          lastDrawnTileId: string | null;
        } | null>;
      };
    };
    const player = internals.state.players.A!;
    player.hand = [
      tile('characters', 3), tile('characters', 5), tile('characters', 8),
      tile('bamboo', 3), tile('bamboo', 6), tile('bamboo', 7),
      tile('dots', 1), tile('dots', 2), tile('dots', 6, 0), tile('dots', 6, 1),
      drawnEast,
    ];
    player.melds = [{ kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('winds', 'north', copy)) }];
    player.lastDrawnTileId = drawnEast.id;

    const view = room.getSnapshot(players[0].sessionToken);
    expect(view.private.availableActions).not.toContain('listen');
    expect(view.private.listenOptions).toBeUndefined();
    expect(() => room.dispatch(players[0].sessionToken, command('listen', view.public.handNumber, view.public.version, { tileId: drawnEast.id })))
      .toThrow('打出这张牌后不满足听牌条件');
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
