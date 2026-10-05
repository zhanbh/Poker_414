import { describe, expect, it } from 'vitest';
import { MahjongAction, MahjongCommandEnvelope, MahjongSettlement } from '../../shared/src/protocol';
import { createMahjongDeck, MAHJONG_SEATS, MahjongMeld, MahjongSeat, MahjongTile } from '../../shared/src/mahjong';
import { MahjongRoomService } from '../src/mahjong-room-service';

function command(type: MahjongCommandEnvelope['type'], handNumber: number, stateVersion: number, payload: MahjongCommandEnvelope['payload'] = {}): MahjongCommandEnvelope {
  return { type, requestId: type + '-' + Math.random(), handNumber, stateVersion, payload };
}

function finishWin(room: MahjongRoomService, sessionToken: string) {
  expect(room.tick(Number.POSITIVE_INFINITY)).toBe(true);
  expect(room.getSnapshot(sessionToken).public.winAnnouncement).not.toBeNull();
  expect(room.tick(Number.POSITIVE_INFINITY)).toBe(true);
  return room.getSnapshot(sessionToken);
}

function readyBaoScenario(baoKind: 'red' | 'structural') {
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
  const bao = baoKind === 'red' ? tile('dragons', 'red') : tile('bamboo', 2, 3);
  const internals = room as unknown as {
    state: {
      players: Record<MahjongSeat, {
        hand: MahjongTile[];
        melds: MahjongMeld[];
        isListening: boolean;
        listenWaits: MahjongTile[];
        listenBao: MahjongTile | null;
        lastDrawnTileId: string | null;
      } | null>;
      wall: MahjongTile[];
      replacementWall: MahjongTile[];
      currentTurn: MahjongSeat;
      awaitingDiscard: boolean;
      pending: unknown;
    };
  };
  const listener = internals.state.players.B!;
  listener.hand = [
    tile('characters', 5), tile('characters', 6), tile('characters', 7),
    tile('dots', 5), tile('dots', 6), tile('dots', 7),
    tile('bamboo', 2), tile('bamboo', 2, 1), tile('bamboo', 5), tile('bamboo', 5, 1),
  ];
  listener.melds = [{ kind: 'chi', tiles: [1, 2, 3].map((rank) => tile('characters', rank)) }];
  listener.isListening = true;
  listener.listenWaits = [tile('bamboo', 2)];
  listener.listenBao = bao;
  listener.lastDrawnTileId = null;
  internals.state.players.C!.hand = [];
  internals.state.players.D!.hand = [];
  internals.state.wall[0] = tile('dots', 8);
  internals.state.replacementWall = [tile('dots', 8, 2), tile('characters', 9, 2), tile('bamboo', 8), bao];
  internals.state.currentTurn = 'A';
  internals.state.awaitingDiscard = true;
  internals.state.pending = null;
  return { room, players, tile, internals };
}

describe('MahjongRoomService', () => {
  it('按截图逐家计算番数、5分底分、黑炮包付和特殊胡法', () => {
    const scenarios: Array<{ settlement: MahjongSettlement; closed: MahjongSeat[]; expected: Partial<Record<MahjongSeat, number>>; fans: number[] }> = [
      { settlement: { winnerSeat: 'B', type: 'discard-win', payingSeat: 'A', discarderWasListening: true }, closed: ['D'], expected: { A: -5, B: 25, C: -5, D: -15 }, fans: [1, 1, 3] },
      { settlement: { winnerSeat: 'B', type: 'discard-win', payingSeat: 'A', discarderWasListening: false }, closed: ['D'], expected: { A: -35, B: 35 }, fans: [7] },
      { settlement: { winnerSeat: 'B', type: 'discard-win', payingSeat: 'A', discarderWasListening: false, isCardang: true }, closed: ['D'], expected: { A: -70, B: 70 }, fans: [14] },
      { settlement: { winnerSeat: 'B', type: 'self-draw' }, closed: ['C'], expected: { A: -10, B: 35, C: -15, D: -10 }, fans: [2, 3, 2] },
      { settlement: { winnerSeat: 'B', type: 'self-draw', isCardang: true }, closed: ['C'], expected: { A: -20, B: 70, C: -30, D: -20 }, fans: [4, 6, 4] },
      { settlement: { winnerSeat: 'B', type: 'self-draw', winPattern: 'bao' }, closed: ['A', 'C', 'D'], expected: { A: -15, B: 45, C: -15, D: -15 }, fans: [3, 3, 3] },
      { settlement: { winnerSeat: 'B', type: 'self-draw', winPattern: 'big-wind' }, closed: ['A', 'C', 'D'], expected: { A: -15, B: 45, C: -15, D: -15 }, fans: [3, 3, 3] },
      { settlement: { winnerSeat: 'B', type: 'self-draw', winPattern: 'bao', isCardang: true, isBaoZhongBao: true }, closed: [], expected: { A: -60, B: 180, C: -60, D: -60 }, fans: [12, 12, 12] },
    ];
    for (const scenario of scenarios) {
      const room = new MahjongRoomService({ inviteCode: 'inner-414' });
      const players = MAHJONG_SEATS.map((seat) => {
        const auth = room.login('inner-414');
        room.join(auth.sessionToken, seat, 'mahjong');
        return auth;
      });
      const internal = room as unknown as {
        state: { players: Record<MahjongSeat, { melds: MahjongMeld[] } | null> };
        settle: (result: MahjongSettlement) => void;
      };
      const tile = createMahjongDeck().find((candidate) => candidate.label === '1万')!;
      for (const seat of MAHJONG_SEATS) {
        internal.state.players[seat]!.melds = scenario.closed.includes(seat) ? [] : [{ kind: 'chi', tiles: [tile] }];
      }
      internal.settle(scenario.settlement);
      const result = room.getSnapshot(players[0]!.sessionToken).public.settlement!;
      expect(result.baseScore).toBe(5);
      expect(result.payments).toEqual(scenario.expected);
      expect(result.transfers?.map((transfer) => transfer.fan)).toEqual(scenario.fans);
      expect(result.transfers?.reduce((sum, transfer) => sum + transfer.amount, 0)).toBe(result.payments?.B);
    }
  });
  it('别人打出的宝不能点炮，包括宝也在结构听口且打出后换宝的情况', () => {
    for (const baoKind of ['red', 'structural'] as const) {
      const { room, players, tile, internals } = readyBaoScenario(baoKind);
      const discard = baoKind === 'red' ? tile('dragons', 'red', 1) : tile('bamboo', 2, 2);
      internals.state.players.A!.hand = [discard];
      const before = room.getSnapshot(players[0].sessionToken);
      room.dispatch(players[0].sessionToken, command('discard', before.public.handNumber, before.public.version, { tileId: discard.id }));

      const listener = room.getSnapshot(players[1].sessionToken);
      expect(listener.public.pendingDiscard).toBeNull();
      expect(listener.private.availableActions).not.toContain('hu');
      expect(() => room.dispatch(players[1].sessionToken, command('hu', listener.public.handNumber, listener.public.version)))
        .toThrow('当前不能胡牌');
      if (baoKind === 'structural') expect(listener.private.baoTile?.label).toBe('8条');
    }
  });

  it('非宝的结构听口仍可点炮，自己摸到宝仍可胡宝', () => {
    const point = readyBaoScenario('red');
    const winningTile = point.tile('bamboo', 2, 2);
    point.internals.state.players.A!.hand = [winningTile];
    const before = point.room.getSnapshot(point.players[0].sessionToken);
    point.room.dispatch(point.players[0].sessionToken, command('discard', before.public.handNumber, before.public.version, { tileId: winningTile.id }));
    const response = point.room.getSnapshot(point.players[1].sessionToken);
    expect(response.private.availableActions).toEqual(['hu', 'pass']);
    point.room.dispatch(point.players[1].sessionToken, command('hu', response.public.handNumber, response.public.version));
    expect(point.room.tick(Number.POSITIVE_INFINITY)).toBe(true);
    expect(point.room.getSnapshot(point.players[0].sessionToken).public.winAnnouncement).toMatchObject({
      winnerSeat: 'B', payingSeat: 'A', type: 'discard-win', winPattern: 'standard',
    });
    expect(point.room.tick(Number.POSITIVE_INFINITY)).toBe(true);
    const pointWin = point.room.getSnapshot(point.players[1].sessionToken);
    expect(pointWin.public.settlement?.type).toBe('discard-win');
    expect(pointWin.public.settlement?.winPattern).toBe('standard');
    expect(pointWin.public.settlement?.transfers).toEqual([{ from: 'A', to: 'B', fan: 9, amount: 45 }]);
    expect(pointWin.public.players.map((player) => player.score)).toEqual([955, 1045, 1000, 1000]);

    const selfDraw = readyBaoScenario('red');
    const drawnBao = selfDraw.tile('dragons', 'red', 1);
    selfDraw.internals.state.players.B!.hand.push(drawnBao);
    selfDraw.internals.state.players.B!.lastDrawnTileId = drawnBao.id;
    selfDraw.internals.state.currentTurn = 'B';
    const ready = selfDraw.room.getSnapshot(selfDraw.players[1].sessionToken);
    expect(ready.private.availableActions).toEqual(['hu', 'pass']);
    selfDraw.room.dispatch(selfDraw.players[1].sessionToken, command('hu', ready.public.handNumber, ready.public.version));
    const baoWin = finishWin(selfDraw.room, selfDraw.players[1].sessionToken);
    expect(baoWin.public.settlement?.type).toBe('self-draw');
    expect(baoWin.public.settlement?.winPattern).toBe('bao');
    expect(baoWin.public.settlement?.transfers).toEqual([
      { from: 'A', to: 'B', fan: 3, amount: 15 },
      { from: 'C', to: 'B', fan: 3, amount: 15 },
      { from: 'D', to: 'B', fan: 3, amount: 15 },
    ]);
    expect(baoWin.public.players.map((player) => player.score)).toEqual([985, 1045, 985, 985]);
    const settledHost = selfDraw.room.getSnapshot(selfDraw.players[0].sessionToken);
    const nextLobby = selfDraw.room.dispatch(selfDraw.players[0].sessionToken,
      command('next-hand', settledHost.public.handNumber, settledHost.public.version)).snapshot;
    expect(nextLobby.public.players.map((player) => player.score)).toEqual([985, 1045, 985, 985]);
    const nextHand = selfDraw.room.dispatch(selfDraw.players[0].sessionToken,
      command('start-hand', nextLobby.public.handNumber, nextLobby.public.version)).snapshot;
    expect(nextHand.public.players.map((player) => player.score)).toEqual([985, 1045, 985, 985]);
  });

  it('实际胡牌时识别卡当与宝中宝，并按截图番数结算', () => {
    for (const baoZhongBao of [false, true]) {
      const { room, players, tile, internals } = readyBaoScenario('red');
      const listener = internals.state.players.B!;
      listener.hand = [tile('dots', 2), tile('dots', 2, 1), tile('characters', 4), tile('characters', 6)];
      listener.melds = [
        { kind: 'chi', tiles: [1, 2, 3].map((rank) => tile('characters', rank)) },
        { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 5, copy)) },
        { kind: 'chi', tiles: [1, 2, 3].map((rank) => tile('bamboo', rank)) },
      ];
      listener.listenWaits = [tile('characters', 5)];
      listener.listenBao = baoZhongBao ? tile('characters', 5, 3) : tile('dragons', 'red');
      const winningTile = tile('characters', 5, 1);
      if (baoZhongBao) {
        listener.hand.push(winningTile);
        listener.lastDrawnTileId = winningTile.id;
        internals.state.currentTurn = 'B';
      } else {
        internals.state.players.A!.hand = [winningTile];
      }
      const before = room.getSnapshot(players[baoZhongBao ? 1 : 0]!.sessionToken);
      room.dispatch(players[baoZhongBao ? 1 : 0]!.sessionToken, command(baoZhongBao ? 'hu' : 'discard', before.public.handNumber, before.public.version, baoZhongBao ? {} : { tileId: winningTile.id }));
      if (!baoZhongBao) {
        const response = room.getSnapshot(players[1]!.sessionToken);
        room.dispatch(players[1]!.sessionToken, command('hu', response.public.handNumber, response.public.version));
      }
      expect(room.tick(Number.POSITIVE_INFINITY)).toBe(true);
      expect(room.getSnapshot(players[1]!.sessionToken).public.winAnnouncement).toMatchObject({
        isCardang: true, isBaoZhongBao: baoZhongBao,
      });
      expect(room.tick(Number.POSITIVE_INFINITY)).toBe(true);
      const result = room.getSnapshot(players[1]!.sessionToken).public.settlement!;
      expect(result.isCardang).toBe(true);
      expect(result.isBaoZhongBao).toBe(baoZhongBao);
      expect(result.payments?.B).toBe(baoZhongBao ? 180 : 90);
    }
  });

  it('胡牌后先暂停一秒，再向所有人广播赢家特效，最后才结算积分', () => {
    const { room, players, tile, internals } = readyBaoScenario('red');
    const drawnBao = tile('dragons', 'red', 1);
    internals.state.players.B!.hand.push(drawnBao);
    internals.state.players.B!.lastDrawnTileId = drawnBao.id;
    internals.state.currentTurn = 'B';
    const before = room.getSnapshot(players[1].sessionToken);
    const immediate = room.dispatch(players[1].sessionToken, command('hu', before.public.handNumber, before.public.version)).snapshot;
    expect(immediate.public.phase).toBe('playing');
    expect(immediate.public.settlement).toBeNull();
    expect(immediate.public.winAnnouncement).toBeNull();
    expect(immediate.private.availableActions).toEqual([]);
    expect(immediate.public.players.every((player) => player.score === 1000)).toBe(true);
    const hostView = room.getSnapshot(players[0].sessionToken);
    expect(() => room.dispatch(players[0].sessionToken, command('next-hand', hostView.public.handNumber, hostView.public.version)))
      .toThrow('胡牌展示中');

    const pendingWin = (room as unknown as { state: { pendingWin: { announceAt: number; settleAt: number } } }).state.pendingWin;
    expect(room.tick(pendingWin.announceAt - 1)).toBe(false);
    expect(room.tick(pendingWin.announceAt)).toBe(true);
    const announced = room.getSnapshot(players[2].sessionToken);
    expect(announced.public.winAnnouncement).toMatchObject({ winnerSeat: 'B', winnerNickname: '乙', winPattern: 'bao' });
    expect(announced.public.settlement).toBeNull();
    expect(room.tick(pendingWin.settleAt - 1)).toBe(false);
    expect(room.tick(pendingWin.settleAt)).toBe(true);
    const settled = room.getSnapshot(players[2].sessionToken);
    expect(settled.public.winAnnouncement).toBeNull();
    expect(settled.public.phase).toBe('settled');
    expect(settled.public.players.map((player) => player.score)).toEqual([985, 1045, 985, 985]);
    expect(settled.public.settlement?.payments).toEqual({ A: -15, B: 45, C: -15, D: -15 });
  });

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
    expect(started.snapshot.public.wallCount).toBe(59);
    const layout = started.snapshot.public.wallLayout;
    const breakStacks = started.snapshot.public.diceRoll![0] + started.snapshot.public.diceRoll![1];
    expect(layout.breakSide).toBe('C');
    expect(layout.replacementSide).toBe('C');
    expect(layout.breakStack).toBe(breakStacks);
    expect(layout.sides.every((side) => side.stacks?.length === 14)).toBe(true);
    expect(layout.sides.reduce((total, side) => total + side.liveTiles + side.replacementTiles, 0)).toBe(59);
    expect(layout.sides.reduce((total, side) => total + side.replacementTiles, 0)).toBe(breakStacks * 2);
    expect(layout.sides.find((side) => side.seat === 'C')?.stacks?.slice(0, breakStacks).every((stack) => stack.replacementTiles === 2)).toBe(true);
    expect(layout.sides.filter((side) => side.seat !== 'C').every((side) => side.replacementTiles === 0)).toBe(true);
    expect(room.getSnapshot(players[0].sessionToken).private.hand).toHaveLength(14);
    expect(room.getSnapshot(players[1].sessionToken).private.hand).toHaveLength(13);
  });

  it('庄家对面的骰子切口随点数变化，杠补牌从切口前取且不动普通牌墙', () => {
    for (const diceValue of [0, 0.42, 0.99]) {
      const room = new MahjongRoomService({ inviteCode: 'inner-414', random: () => diceValue });
      const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
        const auth = room.login('inner-414');
        room.join(auth.sessionToken, nickname, 'mahjong');
        return auth;
      });
      const lobby = room.getSnapshot(players[0].sessionToken);
      room.dispatch(players[0].sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));
      const internals = room as unknown as {
        state: {
          players: Record<MahjongSeat, { hand: MahjongTile[]; isListening: boolean; listenBao: MahjongTile | null } | null>;
          wall: MahjongTile[];
          replacementWall: MahjongTile[];
          wallPositions: Array<{ seat: MahjongSeat; stack: number; layer: number }>;
          replacementPositions: Array<{ seat: MahjongSeat; stack: number; layer: number }>;
        };
      };
      const before = room.getSnapshot(players[0].sessionToken);
      const breakStacks = before.public.diceRoll![0] + before.public.diceRoll![1];
      expect(before.public.wallLayout.breakSide).toBe('C');
      expect(before.public.wallLayout.breakStack).toBe(breakStacks);
      expect(internals.state.replacementPositions).toHaveLength(breakStacks * 2);
      expect(internals.state.replacementPositions.at(-1)).toMatchObject({ seat: 'C', stack: breakStacks - 1 });
      expect(internals.state.wallPositions.length).toBe(internals.state.wall.length);
      const dealtAfterOpposite = 53 - (28 - breakStacks * 2);
      expect(internals.state.wallPositions[0]).toMatchObject(dealtAfterOpposite < 28
        ? { seat: 'D', stack: Math.floor(dealtAfterOpposite / 2), layer: dealtAfterOpposite % 2 }
        : { seat: 'A', stack: Math.floor((dealtAfterOpposite - 28) / 2), layer: (dealtAfterOpposite - 28) % 2 });

      const kongTiles = createMahjongDeck().filter((tile) => tile.suit === 'dots' && tile.rank === 6);
      internals.state.players.A!.hand = kongTiles;
      internals.state.players.B!.hand = [];
      internals.state.players.B!.isListening = true;
      const expectedReplacement = internals.state.replacementWall.at(-1)!;
      const liveBefore = internals.state.wallPositions.map((position) => ({ ...position }));
      const beforeKong = room.getSnapshot(players[0].sessionToken);
      const kong = room.dispatch(players[0].sessionToken, command('concealed-kong', beforeKong.public.handNumber, beforeKong.public.version)).snapshot;
      expect(kong.private.drawnTileId).toBe(expectedReplacement.id);
      expect(internals.state.wallPositions).toEqual(liveBefore);
      expect(internals.state.replacementPositions).toHaveLength(breakStacks * 2 - 1);
      expect(kong.public.wallLayout.sides.find((side) => side.seat === 'C')!.stacks![breakStacks - 1]!.replacementTiles).toBe(1);
      expect(kong.public.wallCount).toBe(before.public.wallCount - 1);
      expect(room.getSnapshot(players[1].sessionToken).private.baoTile?.id).toBe(internals.state.replacementWall.at(-1)?.id);
    }
  });

  it('庄家胡牌连庄，闲家胡牌庄位顺延，流局保留原庄', () => {
    const cases: Array<{ settlement: MahjongSettlement; expectedDealer: MahjongSeat; directStart: boolean }> = [
      { settlement: { winnerSeat: 'A', type: 'self-draw' }, expectedDealer: 'A', directStart: false },
      { settlement: { winnerSeat: 'A', type: 'discard-win', payingSeat: 'B' }, expectedDealer: 'A', directStart: true },
      { settlement: { winnerSeat: 'B', type: 'self-draw' }, expectedDealer: 'B', directStart: false },
      { settlement: { winnerSeat: 'C', type: 'discard-win', payingSeat: 'A' }, expectedDealer: 'B', directStart: true },
      { settlement: { winnerSeat: null, type: 'draw' }, expectedDealer: 'A', directStart: true },
    ];
    for (const { settlement, expectedDealer, directStart } of cases) {
      const room = new MahjongRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
      const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
        const auth = room.login('inner-414');
        room.join(auth.sessionToken, nickname, 'mahjong');
        return auth;
      });
      const lobby = room.getSnapshot(players[0].sessionToken);
      room.dispatch(players[0].sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));
      const internal = room as unknown as { settle: (result: MahjongSettlement) => void };
      internal.settle(settlement);
      let view = room.getSnapshot(players[0].sessionToken);
      expect(view.public.dealerSeat).toBe('A');
      if (!directStart) {
        room.dispatch(players[0].sessionToken, command('next-hand', view.public.handNumber, view.public.version));
        view = room.getSnapshot(players[0].sessionToken);
        expect(view.public.dealerSeat).toBe(expectedDealer);
      }
      const next = room.dispatch(players[0].sessionToken, command('start-hand', view.public.handNumber, view.public.version)).snapshot;
      expect(next.public.dealerSeat).toBe(expectedDealer);
      expect(next.public.currentTurn).toBe(expectedDealer);
      expect(next.public.wallLayout.breakSide).toBe(expectedDealer === 'A' ? 'C' : 'D');
      expect(next.public.players.find((player) => player.isDealer)?.seat).toBe(expectedDealer);
      expect(room.getSnapshot(players[MAHJONG_SEATS.indexOf(expectedDealer)]!.sessionToken).private.hand).toHaveLength(14);
    }
  });

  it('暗杠牌面只发送给杠牌玩家，其他玩家和观战者只能看到四张牌背', () => {
    const room = new MahjongRoomService({ inviteCode: 'inner-414', random: () => 0.42 });
    const players = ['甲', '乙', '丙', '丁'].map((nickname) => {
      const auth = room.login('inner-414');
      room.join(auth.sessionToken, nickname, 'mahjong');
      return auth;
    });
    const lobby = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('start-hand', lobby.public.handNumber, lobby.public.version));
    const kongTiles = createMahjongDeck().filter((tile) => tile.suit === 'dots' && tile.rank === 6);
    const internals = room as unknown as { state: { players: Record<MahjongSeat, { hand: MahjongTile[]; isListening: boolean } | null>; phase: 'playing' | 'settled' } };
    internals.state.players.A!.hand = kongTiles;
    const before = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('concealed-kong', before.public.handNumber, before.public.version));

    const own = room.getSnapshot(players[0].sessionToken);
    expect(own.public.players.find((player) => player.seat === 'A')?.melds[0]?.tiles.map((tile) => tile.id))
      .toEqual(kongTiles.map((tile) => tile.id));
    const other = room.getSnapshot(players[1].sessionToken);
    expect(other.public.players.find((player) => player.seat === 'A')?.melds).toEqual([{ kind: 'concealed-kong', tiles: [] }]);
    const spectator = room.login('inner-414');
    room.join(spectator.sessionToken, '戊', 'mahjong');
    expect(room.getSnapshot(spectator.sessionToken).public.players.find((player) => player.seat === 'A')?.melds[0]?.tiles).toEqual([]);

    internals.state.players.C!.isListening = true;
    const listener = room.getSnapshot(players[2].sessionToken);
    expect(listener.public.players.find((player) => player.seat === 'A')?.melds[0]?.tiles).toEqual([]);
    expect(listener.private.opponentHands?.find((player) => player.seat === 'A')?.hand)
      .not.toEqual(expect.arrayContaining(kongTiles));

    internals.state.phase = 'settled';
    expect(room.getSnapshot(players[1].sessionToken).public.players.find((player) => player.seat === 'A')?.melds[0]?.tiles).toEqual([]);
  });

  it('暗杠算刻子但不算开门；另有吃牌开门后可听并胡牌', () => {
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
    const kongTiles = deck.filter((candidate) => candidate.suit === 'characters' && candidate.rank === 4);
    const east = tile('dragons', 'red');
    const internals = room as unknown as {
      state: {
        players: Record<MahjongSeat, { hand: MahjongTile[]; melds: MahjongMeld[] } | null>;
        replacementWall: MahjongTile[];
      };
    };
    internals.state.players.A!.hand = [
      ...kongTiles,
      tile('bamboo', 1), tile('bamboo', 1, 1),
      tile('bamboo', 7), tile('bamboo', 8), tile('bamboo', 9),
      tile('dots', 3), tile('dots', 4), tile('dots', 5), tile('dots', 7), tile('dots', 8),
    ];
    internals.state.players.B!.hand = [];
    internals.state.players.C!.hand = [];
    internals.state.players.D!.hand = [];
    internals.state.replacementWall[internals.state.replacementWall.length - 1] = east;

    const before = room.getSnapshot(players[0].sessionToken);
    const kong = room.dispatch(players[0].sessionToken, command('concealed-kong', before.public.handNumber, before.public.version)).snapshot;
    expect(kong.private.drawnTileId).toBe(east.id);
    expect(kong.private.availableActions).not.toContain('listen');
    expect(kong.private.listenOptions).toBeUndefined();
    expect(() => room.dispatch(players[0].sessionToken, command('listen', kong.public.handNumber, kong.public.version, { tileId: east.id })))
      .toThrow('听牌前必须开门');

    const chiTiles = [tile('dots', 3), tile('dots', 4), tile('dots', 5)];
    internals.state.players.A!.hand = internals.state.players.A!.hand.filter((handTile) => !chiTiles.some((candidate) => candidate.id === handTile.id));
    internals.state.players.A!.melds.push({ kind: 'chi', tiles: chiTiles });
    const opened = room.getSnapshot(players[0].sessionToken);
    expect(opened.private.availableActions).toContain('listen');
    expect(opened.private.listenOptions?.find((option) => option.discardTileId === east.id)?.waits.map((wait) => wait.label))
      .toContain('9筒');

    const listened = room.dispatch(players[0].sessionToken, command('listen', opened.public.handNumber, opened.public.version, { tileId: east.id })).snapshot;
    expect(listened.private.isListening).toBe(true);
    expect(listened.private.listenWaits?.map((wait) => wait.label)).toContain('9筒');

    internals.state.players.B!.hand = [tile('dots', 9)];
    const beforeDiscard = room.getSnapshot(players[1].sessionToken);
    room.dispatch(players[1].sessionToken, command('discard', beforeDiscard.public.handNumber, beforeDiscard.public.version, { tileId: tile('dots', 9).id }));
    const response = room.getSnapshot(players[0].sessionToken);
    expect(response.private.availableActions).toEqual(['hu', 'pass']);
    room.dispatch(players[0].sessionToken, command('hu', response.public.handNumber, response.public.version));
    const won = finishWin(room, players[0].sessionToken);
    expect(won.public.settlement?.winnerSeat).toBe('A');
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

  it('普通出牌后可确认听牌或暂不听；确认前冻结其他响应，暂不听后下回合仍可再听', () => {
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
    const discard = tile('characters', 4);
    const internals = room as unknown as {
      state: {
        players: Record<MahjongSeat, { hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null; isListening: boolean } | null>;
        currentTurn: MahjongSeat;
        awaitingDiscard: boolean;
      };
    };
    internals.state.players.A!.hand = [
      tile('characters', 1), tile('characters', 2), tile('characters', 3),
      discard, tile('characters', 4, 1), tile('characters', 5), tile('characters', 5, 1),
      tile('characters', 6), tile('characters', 7), tile('characters', 8), tile('characters', 4, 2),
    ];
    internals.state.players.A!.melds = [{ kind: 'chi', tiles: [tile('bamboo', 1), tile('bamboo', 2), tile('bamboo', 3)] }];
    internals.state.players.B!.hand = [tile('characters', 3, 1), tile('characters', 5, 2)];
    internals.state.players.C!.hand = [];
    internals.state.players.D!.hand = [];

    const before = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('discard', before.public.handNumber, before.public.version, { tileId: discard.id }));
    const decision = room.getSnapshot(players[0].sessionToken);
    expect(decision.private.availableActions).toEqual(['listen', 'pass']);
    expect(decision.private.postDiscardListenWaits?.map((wait) => wait.label)).toContain('4万');
    expect(decision.private.baoTile).toBeUndefined();
    expect(decision.public.pendingDiscard?.tile.id).toBe(discard.id);
    expect(decision.public.responseSeats).toEqual([]);
    const responder = room.getSnapshot(players[1].sessionToken);
    expect(responder.private.availableActions).toEqual([]);
    expect(responder.private.postDiscardListenWaits).toBeUndefined();
    expect(() => room.dispatch(players[1].sessionToken, command('chi', responder.public.handNumber, responder.public.version, { tileIds: internals.state.players.B!.hand.map((tile) => tile.id) })))
      .toThrow('等待出牌玩家确认是否听牌');

    room.dispatch(players[0].sessionToken, command('pass', decision.public.handNumber, decision.public.version));
    const skipped = room.getSnapshot(players[0].sessionToken);
    expect(skipped.private.isListening).toBe(false);
    expect(skipped.private.postDiscardListenWaits).toBeUndefined();
    expect(room.getSnapshot(players[1].sessionToken).private.availableActions).toContain('chi');
    const response = room.getSnapshot(players[1].sessionToken);
    room.dispatch(players[1].sessionToken, command('pass', response.public.handNumber, response.public.version));

    const nextDraw = tile('dots', 8);
    internals.state.currentTurn = 'A';
    internals.state.awaitingDiscard = true;
    internals.state.players.A!.hand.push(nextDraw);
    internals.state.players.A!.lastDrawnTileId = nextDraw.id;
    const nextTurn = room.getSnapshot(players[0].sessionToken);
    expect(nextTurn.private.availableActions).toContain('listen');
    expect(nextTurn.private.listenOptions?.find((option) => option.discardTileId === nextDraw.id)?.waits.map((wait) => wait.label))
      .toContain('4万');
    room.dispatch(players[0].sessionToken, command('discard', nextTurn.public.handNumber, nextTurn.public.version, { tileId: nextDraw.id }));
    const again = room.getSnapshot(players[0].sessionToken);
    expect(again.private.availableActions).toEqual(['listen', 'pass']);
    room.dispatch(players[0].sessionToken, command('listen', again.public.handNumber, again.public.version));
    const confirmed = room.getSnapshot(players[0].sessionToken);
    expect(confirmed.private.isListening).toBe(true);
    expect(confirmed.private.baoTile).toBeDefined();
  });

  it('已吃出的幺牌满足听牌条件，暗手有两对时摸牌后可选择听牌', () => {
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
    const drawnEast = tile('dots', 8);
    const internals = room as unknown as {
      state: { players: Record<MahjongSeat, { hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null } | null> };
    };
    const player = internals.state.players.A!;
    player.hand = [
      tile('characters', 5), tile('characters', 6), tile('characters', 7),
      tile('bamboo', 2), tile('bamboo', 2, 1), tile('bamboo', 5), tile('bamboo', 5, 1),
      drawnEast,
    ];
    player.melds = [
      { kind: 'chi', tiles: [tile('dots', 1), tile('dots', 2), tile('dots', 3)] },
      { kind: 'chi', tiles: [tile('characters', 1), tile('characters', 2), tile('characters', 3)] },
    ];
    player.lastDrawnTileId = drawnEast.id;

    const view = room.getSnapshot(players[0].sessionToken);
    expect(view.private.availableActions).toContain('listen');
    expect(view.private.listenOptions?.find((option) => option.discardTileId === drawnEast.id)?.waits.map((wait) => wait.label))
      .toEqual(expect.arrayContaining(['2条', '5条']));
    const listened = room.dispatch(players[0].sessionToken, command('listen', view.public.handNumber, view.public.version, { tileId: drawnEast.id }));
    expect(listened.snapshot.private.isListening).toBe(true);
  });

  it('没有完整副子时不提示听牌，也不能绕过提示自摸胡牌', () => {
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
    const drawnEast = tile('dots', 8);
    const internals = room as unknown as {
      state: { players: Record<MahjongSeat, {
        hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null;
        isListening: boolean; listenWaits: MahjongTile[]; listenBao: MahjongTile | null;
      } | null> };
    };
    const player = internals.state.players.A!;
    player.hand = [
      ...[0, 1, 2].map((copy) => tile('characters', 1, copy)),
      ...[0, 1, 2].map((copy) => tile('dots', 2, copy)),
      ...[0, 1, 2].map((copy) => tile('bamboo', 3, copy)),
      tile('characters', 5), drawnEast,
    ];
    player.melds = [{ kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('bamboo', 9, copy)) }];
    player.lastDrawnTileId = drawnEast.id;

    const before = room.getSnapshot(players[0].sessionToken);
    expect(before.private.availableActions).not.toContain('listen');
    expect(before.private.listenOptions).toBeUndefined();
    expect(() => room.dispatch(players[0].sessionToken, command('listen', before.public.handNumber, before.public.version, { tileId: drawnEast.id })))
      .toThrow('打出这张牌后不满足听牌条件');

    player.hand = player.hand.filter((candidate) => candidate.id !== drawnEast.id);
    const winningTile = tile('characters', 5, 1);
    player.hand.push(winningTile);
    player.lastDrawnTileId = winningTile.id;
    player.isListening = true;
    player.listenWaits = [winningTile];
    player.listenBao = null;
    const fakeListener = room.getSnapshot(players[0].sessionToken);
    expect(fakeListener.private.availableActions).not.toContain('hu');
    expect(() => room.dispatch(players[0].sessionToken, command('hu', fakeListener.public.handNumber, fakeListener.public.version)))
      .toThrow('当前不能胡牌');
  });

  it('三组副露后仍可保留四张手牌听牌，四组副露后的单调不允许听胡', () => {
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
    const internals = room as unknown as {
      state: { players: Record<MahjongSeat, {
        hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null;
        isListening: boolean; listenWaits: MahjongTile[]; listenBao: MahjongTile | null;
      } | null> };
    };
    const player = internals.state.players.A!;
    const east = tile('dots', 8);
    player.hand = [tile('characters', 1), tile('characters', 2), tile('characters', 3), tile('characters', 5), east];
    player.melds = [
      { kind: 'chi', tiles: [1, 2, 3].map((rank) => tile('bamboo', rank)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 2, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 6, copy)) },
    ];
    player.lastDrawnTileId = east.id;
    const threeMelds = room.getSnapshot(players[0].sessionToken);
    expect(threeMelds.private.listenOptions?.find((option) => option.discardTileId === east.id)?.waits.map((wait) => wait.label))
      .toContain('5万');

    const otherEast = tile('dots', 8, 1);
    player.hand = [east, otherEast];
    player.melds.push({ kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('bamboo', 8, copy)) });
    player.lastDrawnTileId = otherEast.id;
    const singleWait = room.getSnapshot(players[0].sessionToken);
    expect(singleWait.private.availableActions).not.toContain('listen');
    expect(singleWait.private.listenOptions).toBeUndefined();
    expect(() => room.dispatch(players[0].sessionToken, command('listen', singleWait.public.handNumber, singleWait.public.version, { tileId: otherEast.id })))
      .toThrow('打出这张牌后不满足听牌条件');

    player.isListening = true;
    player.listenWaits = [otherEast];
    player.listenBao = null;
    const forcedListener = room.getSnapshot(players[0].sessionToken);
    expect(forcedListener.private.availableActions).not.toContain('hu');
    expect(() => room.dispatch(players[0].sessionToken, command('hu', forcedListener.public.handNumber, forcedListener.public.version)))
      .toThrow('当前不能胡牌');
  });

  it('仅允许四组副露后单调红中，并能在听牌后胡另一张红中', () => {
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
    const internals = room as unknown as {
      state: { players: Record<MahjongSeat, {
        hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null;
        isListening: boolean; listenWaits: MahjongTile[]; listenBao: MahjongTile | null;
      } | null>; currentTurn: MahjongSeat; awaitingDiscard: boolean; pending: unknown };
    };
    const player = internals.state.players.A!;
    const red = tile('dragons', 'red');
    const discard = tile('characters', 5);
    player.hand = [red, discard];
    player.melds = [
      { kind: 'chi', tiles: [1, 2, 3].map((rank) => tile('bamboo', rank)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 2, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 6, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('bamboo', 8, copy)) },
    ];
    player.lastDrawnTileId = discard.id;
    internals.state.players.B!.hand = [tile('dragons', 'red', 1)];
    internals.state.players.C!.hand = [];
    internals.state.players.D!.hand = [];
    internals.state.currentTurn = 'A';
    internals.state.awaitingDiscard = true;
    internals.state.pending = null;
    const before = room.getSnapshot(players[0].sessionToken);
    expect(before.private.listenOptions?.find((option) => option.discardTileId === discard.id)?.waits.map((wait) => wait.label)).toEqual(['中']);
    room.dispatch(players[0].sessionToken, command('listen', before.public.handNumber, before.public.version, { tileId: discard.id }));
    player.listenBao = tile('characters', 9);
    const bTurn = room.getSnapshot(players[1].sessionToken);
    room.dispatch(players[1].sessionToken, command('discard', bTurn.public.handNumber, bTurn.public.version, { tileId: tile('dragons', 'red', 1).id }));
    const response = room.getSnapshot(players[0].sessionToken);
    expect(response.private.availableActions).toContain('hu');
    room.dispatch(players[0].sessionToken, command('hu', response.public.handNumber, response.public.version));
    expect(finishWin(room, players[0].sessionToken).public.settlement?.winnerSeat).toBe('A');
  });

  it('三组副露时仅允许能形成单调红中的第四次碰牌', () => {
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
    const internals = room as unknown as {
      state: { players: Record<MahjongSeat, { hand: MahjongTile[]; melds: MahjongMeld[] } | null>;
        currentTurn: MahjongSeat; awaitingDiscard: boolean; pending: {
          seat: MahjongSeat; tile: MahjongTile; options: Partial<Record<MahjongSeat, MahjongAction[]>>; passed: MahjongSeat[];
        } | null };
    };
    const player = internals.state.players.A!;
    player.melds = [
      { kind: 'chi', tiles: [1, 2, 3].map((rank) => tile('bamboo', rank)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 2, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 6, copy)) },
    ];
    player.hand = [tile('dragons', 'red'), tile('characters', 5), tile('characters', 5, 1), tile('dots', 8)];
    const claimed = tile('characters', 5, 2);
    internals.state.currentTurn = 'B';
    internals.state.awaitingDiscard = false;
    internals.state.pending = { seat: 'B', tile: claimed, options: { A: ['peng'] }, passed: [] };
    const response = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('peng', response.public.handNumber, response.public.version));
    const afterPeng = room.getSnapshot(players[0].sessionToken);
    expect(afterPeng.private.listenOptions?.find((option) => option.discardTileId === tile('dots', 8).id)?.waits.map((wait) => wait.label)).toEqual(['中']);
  });

  it('四组副露单调红中可以自摸，但不能把其他宝牌当成万能替牌', () => {
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
    const internals = room as unknown as {
      state: { players: Record<MahjongSeat, {
        hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null;
        isListening: boolean; listenWaits: MahjongTile[]; listenBao: MahjongTile | null;
      } | null>; currentTurn: MahjongSeat; awaitingDiscard: boolean; pending: unknown };
    };
    const player = internals.state.players.A!;
    player.melds = [
      { kind: 'chi', tiles: [1, 2, 3].map((rank) => tile('bamboo', rank)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 2, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 6, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('bamboo', 8, copy)) },
    ];
    player.hand = [tile('dragons', 'red'), tile('characters', 9)];
    player.lastDrawnTileId = tile('characters', 9).id;
    player.isListening = true;
    player.listenWaits = [tile('dragons', 'red', 1)];
    player.listenBao = tile('characters', 9);
    internals.state.currentTurn = 'A';
    internals.state.awaitingDiscard = true;
    internals.state.pending = null;
    expect(room.getSnapshot(players[0].sessionToken).private.availableActions).not.toContain('hu');

    const drawnRed = tile('dragons', 'red', 1);
    player.hand = [tile('dragons', 'red'), drawnRed];
    player.lastDrawnTileId = drawnRed.id;
    const ready = room.getSnapshot(players[0].sessionToken);
    expect(ready.private.availableActions).toContain('hu');
    room.dispatch(players[0].sessionToken, command('hu', ready.public.handNumber, ready.public.version));
    expect(finishWin(room, players[0].sessionToken).public.settlement).toMatchObject({ winnerSeat: 'A', type: 'self-draw' });
  });

  it('已有三组副露时不再提供第四次吃碰杠，伪造操作也会被拒绝', () => {
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
    const internals = room as unknown as {
      state: {
        players: Record<MahjongSeat, { hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null } | null>;
        currentTurn: MahjongSeat; awaitingDiscard: boolean;
        pending: { seat: MahjongSeat; tile: MahjongTile; options: Partial<Record<MahjongSeat, MahjongAction[]>>; passed: MahjongSeat[] } | null;
      };
    };
    const player = internals.state.players.A!;
    player.melds = [
      { kind: 'chi', tiles: [1, 2, 3].map((rank) => tile('bamboo', rank)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 2, copy)) },
      { kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('dots', 6, copy)) },
    ];
    player.hand = [0, 1, 2, 3].map((copy) => tile('characters', 4, copy)).concat(tile('dots', 8));
    player.lastDrawnTileId = tile('dots', 8).id;
    const beforeKong = room.getSnapshot(players[0].sessionToken);
    expect(beforeKong.private.availableActions).not.toContain('concealed-kong');
    expect(() => room.dispatch(players[0].sessionToken, command('concealed-kong', beforeKong.public.handNumber, beforeKong.public.version)))
      .toThrow('不能暗杠到只剩一张手牌');

    for (const action of ['chi', 'peng', 'exposed-kong'] as const) {
      internals.state.currentTurn = 'B';
      internals.state.awaitingDiscard = false;
      const discard = action === 'chi' ? tile('characters', 3) : tile('characters', 4, 3);
      internals.state.pending = { seat: 'B', tile: discard, options: { A: [action] }, passed: [] };
      const response = room.getSnapshot(players[0].sessionToken);
      expect(() => room.dispatch(players[0].sessionToken, command(action, response.public.handNumber, response.public.version, { tileIds: [tile('characters', 1).id, tile('characters', 2).id] })))
        .toThrow('不能吃碰杠到只剩一张手牌');
    }

    for (const [hand, discard] of [
      [[tile('characters', 1), tile('characters', 2), tile('characters', 5), tile('characters', 5, 1)], tile('characters', 3)],
      [[tile('characters', 5), tile('characters', 5, 1), tile('characters', 1), tile('characters', 2)], tile('characters', 5, 2)],
      [[tile('characters', 5), tile('characters', 5, 1), tile('characters', 5, 2), tile('characters', 1)], tile('characters', 5, 3)],
    ] as const) {
      internals.state.pending = null;
      internals.state.currentTurn = 'B';
      internals.state.awaitingDiscard = true;
      internals.state.players.A!.hand = [...hand];
      internals.state.players.B!.hand = [discard];
      internals.state.players.C!.hand = [];
      internals.state.players.D!.hand = [];
      const beforeDiscard = room.getSnapshot(players[1].sessionToken);
      room.dispatch(players[1].sessionToken, command('discard', beforeDiscard.public.handNumber, beforeDiscard.public.version, { tileId: discard.id }));
      const afterDiscard = room.getSnapshot(players[0].sessionToken);
      expect(afterDiscard.public.responseSeats).not.toContain('A');
      for (const action of ['chi', 'peng', 'exposed-kong']) expect(afterDiscard.private.availableActions).not.toContain(action);
    }
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

  it('普通碰牌不能让散牌凭大风听口听牌', () => {
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
    const east = tile('dots', 8);
    const internals = room as unknown as {
      state: { players: Record<MahjongSeat, { hand: MahjongTile[]; melds: MahjongMeld[]; lastDrawnTileId: string | null } | null> };
    };
    const player = internals.state.players.A!;
    player.hand = [
      tile('characters', 3), tile('characters', 3, 1), tile('characters', 5),
      tile('bamboo', 1), tile('bamboo', 2), tile('bamboo', 3),
      tile('bamboo', 5), tile('bamboo', 5, 1), tile('bamboo', 6), tile('dots', 3), east,
    ];
    player.melds = [{ kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('bamboo', 9, copy)) }];
    player.lastDrawnTileId = east.id;

    const view = room.getSnapshot(players[0].sessionToken);
    expect(view.private.listenOptions).toBeUndefined();
    expect(view.private.availableActions).not.toContain('listen');
    expect(() => room.dispatch(players[0].sessionToken, command('listen', view.public.handNumber, view.public.version, { tileId: east.id })))
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
    const internals = room as unknown as { state: { wallPositions: Array<{ seat: MahjongSeat; stack: number; layer: number }> } };
    const nextPosition = { ...internals.state.wallPositions[0]! };
    const firstLiveWallSide = nextPosition.seat;
    const firstLiveWallCount = dealerView.public.wallLayout.sides.find((side) => side.seat === firstLiveWallSide)!.liveTiles;
    const firstStackCount = dealerView.public.wallLayout.sides.find((side) => side.seat === firstLiveWallSide)!.stacks![nextPosition.stack]!.liveTiles;
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
    expect(next.public.wallLayout.sides.find((side) => side.seat === firstLiveWallSide)!.stacks![nextPosition.stack]!.liveTiles).toBe(firstStackCount - 1);
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

  it('上家放弃普通吃后，不能把同一张牌交给不具备听牌条件的隔位玩家吃', () => {
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
    const discarded = tile('characters', 3);
    const internals = room as unknown as { state: { players: Record<MahjongSeat, { hand: MahjongTile[] } | null> } };
    internals.state.players.A!.hand = [discarded];
    internals.state.players.B!.hand = [tile('characters', 1, 1), tile('characters', 2, 1)];
    internals.state.players.C!.hand = [tile('characters', 1, 2), tile('characters', 2, 2), tile('dots', 8)];
    internals.state.players.D!.hand = [];

    const before = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('discard', before.public.handNumber, before.public.version, { tileId: discarded.id }));
    const next = room.getSnapshot(players[1].sessionToken);
    expect(next.private.availableActions).toEqual(['chi', 'pass']);
    expect(room.getSnapshot(players[2].sessionToken).private.availableActions).toEqual([]);
    room.dispatch(players[1].sessionToken, command('pass', next.public.handNumber, next.public.version));
    expect(room.getSnapshot(players[2].sessionToken).private.availableActions).toEqual([]);
    expect(room.getSnapshot(players[1].sessionToken).public.currentTurn).toBe('B');
  });

  it('隔位吃后可听时先于普通吃响应，且吃后必须听牌', () => {
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
    const discarded = tile('characters', 3);
    const east = tile('dots', 8);
    const internals = room as unknown as { state: { players: Record<MahjongSeat, { hand: MahjongTile[] } | null> } };
    internals.state.players.A!.hand = [discarded];
    internals.state.players.B!.hand = [tile('characters', 1, 1), tile('characters', 2, 1)];
    internals.state.players.C!.hand = [
      tile('characters', 1, 2), tile('characters', 2, 2),
      tile('characters', 5), tile('characters', 6), tile('characters', 7),
      tile('dots', 5), tile('dots', 6), tile('dots', 7),
      tile('bamboo', 2), tile('bamboo', 2, 1), tile('bamboo', 5), tile('bamboo', 5, 1), east,
    ];
    internals.state.players.D!.hand = [];

    const before = room.getSnapshot(players[0].sessionToken);
    room.dispatch(players[0].sessionToken, command('discard', before.public.handNumber, before.public.version, { tileId: discarded.id }));
    const jump = room.getSnapshot(players[2].sessionToken);
    expect(jump.private.availableActions).toEqual(['chi', 'pass']);
    expect(jump.private.chiOptions).toHaveLength(1);
    expect(room.getSnapshot(players[1].sessionToken).private.availableActions).toEqual([]);
    expect(() => room.dispatch(players[1].sessionToken, command('pass', jump.public.handNumber, jump.public.version)))
      .toThrow('有优先级更高的玩家正在响应');

    const claimed = room.dispatch(players[2].sessionToken, command('chi', jump.public.handNumber, jump.public.version, { tileIds: jump.private.chiOptions![0] })).snapshot;
    expect(claimed.public.currentTurn).toBe('C');
    expect(claimed.private.availableActions).toEqual(['listen']);
    expect(claimed.private.listenTileIds).toContain(east.id);
    expect(() => room.dispatch(players[2].sessionToken, command('discard', claimed.public.handNumber, claimed.public.version, { tileId: east.id })))
      .toThrow('这次隔位吃牌后必须听牌');
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
    const concealed = [tile('characters', 1), tile('characters', 2), tile('characters', 3), tile('characters', 5)];
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
    room.dispatch(players[1].sessionToken, command('hu', readyView.public.handNumber, readyView.public.version));
    const result = finishWin(room, players[1].sessionToken);
    expect(result.public.settlement?.winPattern).toBe('big-wind');
    expect(result.public.revealedHands).toHaveLength(4);
    expect(result.public.revealedHands?.find((player) => player.seat === 'B')?.hand.map((handTile) => handTile.id)).toContain(drawn.id);
  });

  it('手里暗藏三张后摸到第四张只能按普通自摸胡，不能算大风', () => {
    const { room, players, tile, internals } = readyBaoScenario('red');
    const drawn = tile('dots', 2, 3);
    const listener = internals.state.players.B!;
    listener.hand = [
      ...[0, 1, 2].map((copy) => tile('dots', 2, copy)),
      tile('dots', 1), tile('dots', 3),
      tile('characters', 1), tile('characters', 2), tile('characters', 3),
      tile('bamboo', 5), tile('bamboo', 5, 1), drawn,
    ];
    listener.melds = [{ kind: 'chi', tiles: [7, 8, 9].map((rank) => tile('bamboo', rank)) }];
    listener.listenWaits = [tile('dots', 2)];
    listener.listenBao = tile('dragons', 'red');
    listener.lastDrawnTileId = drawn.id;
    internals.state.players.A!.melds = [{ kind: 'chi', tiles: [7, 8, 9].map((rank) => tile('characters', rank)) }];
    internals.state.currentTurn = 'B';

    const ready = room.getSnapshot(players[1].sessionToken);
    expect(ready.private.availableActions).toContain('hu');
    room.dispatch(players[1].sessionToken, command('hu', ready.public.handNumber, ready.public.version));
    const result = finishWin(room, players[1].sessionToken).public.settlement!;
    expect(result.winPattern).toBe('standard');
    expect(result.payments).toEqual({ A: -10, B: 40, C: -15, D: -15 });
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
    const winningTile = tile('dots', 8, 3);
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
      tile('dots', 4), tile('dots', 5), tile('dots', 6), tile('dots', 8),
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
    room.dispatch(players[1].sessionToken, command('hu', response.public.handNumber, response.public.version));
    const result = finishWin(room, players[1].sessionToken);

    expect(result.public.revealedHands).toHaveLength(4);
    expect(result.public.revealedHands?.find((player) => player.seat === 'B')?.hand.map((handTile) => handTile.id)).toContain(winningTile.id);
    expect(result.public.discardRiver).toEqual([]);
    expect(result.public.players.find((player) => player.seat === 'A')?.discards).toEqual([]);
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
    const drawnEast = tile('dots', 8);
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
    player.melds = [{ kind: 'peng', tiles: [0, 1, 2].map((copy) => tile('bamboo', 9, copy)) }];
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
