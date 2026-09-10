import { describe, expect, it } from 'vitest';
import { standardCard } from '../src/cards';
import {
  GameState,
  createGameState,
  declareBurst,
  hasDifferenceOpportunity,
  joinPlayer,
  markActivity,
  passTurn,
  playCards,
  readyForNextHand,
  resetRoom,
  resolveBurstDecision,
  resolveOpening,
  scanPresence,
  startHand,
} from '../src/game-state';

function createFourPlayerRoom(): GameState {
  let state = createGameState('room-414', 'p-a');
  state = joinPlayer(state, { id: 'p-a', nickname: '甲' }, 0);
  state = joinPlayer(state, { id: 'p-b', nickname: '乙' }, 0);
  state = joinPlayer(state, { id: 'p-c', nickname: '丙' }, 0);
  state = joinPlayer(state, { id: 'p-d', nickname: '丁' }, 0);
  return state;
}

function openNormalHand(): GameState {
  let state = startHand(createFourPlayerRoom(), () => 0.1, 0);
  for (let index = 0; index < 4; index += 1) {
    state = resolveOpening(state, { kind: 'pass', seat: state.openingTurn! }, 0);
  }
  return state;
}

describe('414 权威牌局状态机', () => {
  it('四人到齐后一次发完54张牌，首局随机首牌权只确定一次且锁定本手主', () => {
    const opening = startHand(createFourPlayerRoom(), () => 0.25, 100);
    const hands = Object.values(opening.players).map((player) => player?.hand.length ?? 0);

    expect(opening.phase).toBe('opening');
    expect(hands.sort((left, right) => left - right)).toEqual([13, 13, 14, 14]);
    expect(opening.candidateLeader).toBeDefined();

    let playing = opening;
    for (let index = 0; index < 4; index += 1) {
      playing = resolveOpening(playing, { kind: 'pass', seat: playing.openingTurn! }, 100);
    }
    expect(playing.phase).toBe('playing');
    expect(playing.currentTurn).toBe(opening.candidateLeader);
    expect(playing.effectiveMain).toBe(playing.levels[playing.players[playing.currentTurn!]!.team]);
  });

  it('立棍可以等待反立，最终只有立棍者和反立者保留为有效玩家', () => {
    const opening = startHand(createFourPlayerRoom(), () => 0.01, 0);
    const standWindow = resolveOpening(opening, { kind: 'stand', seat: 'A' }, 0);
    const teammateStand = resolveOpening(standWindow, { kind: 'stand', seat: 'C' }, 0);
    const reversed = resolveOpening(teammateStand, { kind: 'reverse', seat: 'D' }, 0);

    expect(standWindow.phase).toBe('opening');
    expect(standWindow.openingMode).toBe('stand');
    expect(standWindow.openingTurn).toBe('C');
    expect(teammateStand.candidateLeader).toBe('C');
    expect(teammateStand.openingTurn).toBe('D');
    expect(reversed.phase).toBe('playing');
    expect(reversed.openingMode).toBe('reverse');
    expect(reversed.currentTurn).toBe('D');
    expect(reversed.players.A?.activeInHand).toBe(false);
    expect(reversed.players.B?.activeInHand).toBe(false);
    expect(reversed.players.C?.activeInHand).toBe(true);
    expect(reversed.players.D?.activeInHand).toBe(true);
    expect(reversed.effectiveMain).toBe(reversed.levels.BD);
  });

  it('爆牌后跟牌可以拆出，剩最后一张自动爆；用户操作清除暂离而扫描不自动动作', () => {
    const state = openNormalHand();
    const player = state.players.A!;
    player.hand = [
      standardCard('A', 'spades', 'burst-ace-a'),
      standardCard('A', 'hearts', 'burst-ace-b'),
    ];
    state.currentTurn = 'A';
    state.burstPending = { seat: 'A', clearsTrick: false };

    const announced = declareBurst(state, 'A', 'pair', 0);
    expect(announced.players.A?.burstLocked).toBe(true);
    expect(announced.burstAnnounced).toContain('A');

    const split = playCards({
      ...announced,
      effectiveMain: '3',
      currentTurn: 'A',
      trick: {
        lead: { kind: 'single', cards: [standardCard('K', 'clubs', 'burst-lead-k')], rank: 'K', length: 1, wildCount: 0, isDifference: false },
        leadSeat: 'B', lastPlaySeat: 'B', passCount: 0,
      },
    }, 'A', ['burst-ace-a'], undefined, 1);
    expect(split.players.A?.hand.map((card) => card.id)).toEqual(['burst-ace-b']);
    expect(split.burstPending).toBeNull();
    expect(split.players.A?.burstLocked).toBe(true);

    const awayState = scanPresence(announced, 60_000);
    const afterAction = markActivity(awayState, 'A', 60_001);
    expect(afterAction.players.A?.away).toBe(false);
    expect(afterAction.players.A?.hand).toHaveLength(2);
    expect(afterAction.version).toBe(awayState.version);
  });

  it('爆牌后拆牌若重新留下可整手出的两张牌，会再次要求确认', () => {
    const state = openNormalHand();
    state.players.A!.hand = [
      standardCard('4', 'spades', 'reburst-4-a'),
      standardCard('4', 'hearts', 'reburst-4-b'),
      standardCard('4', 'clubs', 'reburst-4-c'),
    ];
    state.burstPending = { seat: 'A', clearsTrick: false };
    const announced = declareBurst(state, 'A', 'ordinary-bomb', 0);
    const split = playCards({
      ...announced,
      effectiveMain: 'K', currentTurn: 'A',
      trick: {
        lead: { kind: 'single', cards: [standardCard('3', 'clubs', 'reburst-lead-3')], rank: '3', length: 1, wildCount: 0, isDifference: false },
        leadSeat: 'B', lastPlaySeat: 'B', passCount: 0,
      },
    }, 'A', ['reburst-4-a'], undefined, 1);

    expect(split.players.A?.hand).toHaveLength(2);
    expect(split.burstPending).toEqual({ seat: 'A', clearsTrick: false });
    const skipped = resolveBurstDecision(split, 'A', 'skip', 2);
    expect(skipped.players.A?.burstLocked).toBe(false);
  });

  it('出牌后先暂停在爆牌确认窗口，选择不爆或报爆后才继续轮转', () => {
    const state = openNormalHand();
    state.players.A!.hand = [
      standardCard('A', 'spades', 'a-ace'),
      standardCard('8', 'clubs', 'a-8-1'),
      standardCard('8', 'hearts', 'a-8-2'),
    ];
    state.players.B!.hand = [standardCard('3', 'clubs', 'b-3')];
    state.players.C!.hand = [standardCard('4', 'clubs', 'c-4')];
    state.players.D!.hand = [standardCard('6', 'clubs', 'd-6')];
    state.currentTurn = 'A';
    state.trick = null;

    const pending = playCards(state, 'A', ['a-ace'], undefined, 1);
    expect(pending.burstPending).toEqual({ seat: 'A', clearsTrick: false });
    expect(pending.currentTurn).toBe('A');
    expect(() => passTurn(pending, 'B', 2)).toThrow(/报爆/);

    const skipped = resolveBurstDecision(pending, 'A', 'skip', 2);
    expect(skipped.burstPending).toBeNull();
    expect(skipped.currentTurn).toBe('B');

    const pendingAgain = playCards(state, 'A', ['a-ace'], undefined, 1);
    const announced = resolveBurstDecision(pendingAgain, 'A', 'pair', 2);
    expect(announced.burstPending).toBeNull();
    expect(announced.players.A?.burstLocked).toBe(true);
    expect(announced.currentTurn).toBe('B');
  });

  it('爆牌确认结束后，持有一对2的下家可以拆出一张管普通A', () => {
    let state = openNormalHand();
    state.players.A!.hand = [
      standardCard('A', 'spades', 'a-ace-split'),
      standardCard('8', 'clubs', 'a-8-split-1'),
      standardCard('8', 'hearts', 'a-8-split-2'),
    ];
    state.players.B!.hand = [standardCard('3', 'clubs', 'b-3-split')];
    state.players.C!.hand = [standardCard('4', 'clubs', 'c-4-split')];
    state.players.D!.hand = [standardCard('2', 'clubs', 'd-2-split-1'), standardCard('2', 'diamonds', 'd-2-split-2')];
    state.currentTurn = 'A';
    state.trick = null;

    state = playCards(state, 'A', ['a-ace-split'], undefined, 1);
    state = resolveBurstDecision(state, 'A', 'pair', 2);
    state = passTurn(state, 'B', 3);
    state = passTurn(state, 'C', 4);
    state = playCards(state, 'D', ['d-2-split-1'], undefined, 5);

    expect(state.players.D?.hand.map((card) => card.id)).toEqual(['d-2-split-2']);
    expect(state.burstPending).toBeNull();
    expect(state.players.D?.burstLocked).toBe(true);
    expect(state.burstAnnounced).toContain('D');
    expect(state.publicLastPlay?.seat).toBe('D');
    expect(state.currentTurn).toBe('A');
  });

  it('差牌可以无视正常牌权，任意仍在局玩家都可以先打出', () => {
    const state = openNormalHand();
    state.players.A!.hand = [standardCard('4', 'spades', 'lead-4')];
    state.players.B!.hand = [standardCard('6', 'clubs', 'b-6-difference')];
    state.players.C!.hand = [standardCard('7', 'clubs', 'c-7-difference')];
    state.players.D!.hand = [
      standardCard('4', 'hearts', 'd-4-difference-1'),
      standardCard('4', 'diamonds', 'd-4-difference-2'),
      standardCard('3', 'clubs', 'd-3-difference'),
      standardCard('8', 'clubs', 'd-8-difference'),
    ];
    state.currentTurn = 'B';
    state.trick = {
      lead: { kind: 'single', cards: state.players.A!.hand, rank: '4', length: 1, wildCount: 0, isDifference: false },
      leadSeat: 'A',
      lastPlaySeat: 'A',
      passCount: 0,
    };

    expect(hasDifferenceOpportunity(state)).toBe(true);
    const interrupted = playCards(state, 'D', ['d-4-difference-1', 'd-4-difference-2'], 'difference', 1);

    expect(interrupted.publicLastPlay?.isDifference).toBe(true);
    expect(interrupted.players.D?.hand).toHaveLength(2);
    expect(interrupted.trick).toBeNull();
    expect(interrupted.currentTurn).toBe('D');
  });

  it('对子中的合法单牌只能按正常牌权拆出，不能当作差牌抢出', () => {
    const state = openNormalHand();
    state.players.A!.hand = [standardCard('A', 'spades', 'split-lead-ace')];
    state.players.B!.hand = [standardCard('6', 'clubs', 'split-b-6')];
    state.players.C!.hand = [standardCard('7', 'clubs', 'split-c-7')];
    state.players.D!.hand = [
      standardCard('2', 'clubs', 'split-d-2-1'),
      standardCard('2', 'diamonds', 'split-d-2-2'),
      standardCard('3', 'clubs', 'split-d-3'),
    ];
    state.currentTurn = 'D';
    state.trick = {
      lead: { kind: 'single', cards: state.players.A!.hand, rank: 'A', length: 1, wildCount: 0, isDifference: false },
      leadSeat: 'A',
      lastPlaySeat: 'A',
      passCount: 0,
    };

    expect(hasDifferenceOpportunity(state)).toBe(false);
    const split = playCards(state, 'D', ['split-d-2-1'], undefined, 1);

    expect(split.publicLastPlay?.cards.map((card) => card.id)).toEqual(['split-d-2-1']);
    expect(split.publicLastPlay?.isDifference).toBe(false);
    expect(split.players.D?.hand.map((card) => card.id)).toEqual(['split-d-2-2', 'split-d-3']);
    expect(split.currentTurn).toBe('A');
  });

  it('一对A拆出单张回应K时不是差牌机会', () => {
    const state = openNormalHand();
    state.players.A!.hand = [standardCard('K', 'spades', 'split-ace-lead')];
    state.players.B!.hand = [standardCard('6', 'clubs', 'split-ace-b')];
    state.players.C!.hand = [standardCard('7', 'clubs', 'split-ace-c')];
    state.players.D!.hand = [
      standardCard('A', 'clubs', 'split-ace-d-1'),
      standardCard('A', 'diamonds', 'split-ace-d-2'),
      standardCard('3', 'clubs', 'split-ace-d-rest'),
    ];
    state.currentTurn = 'B';
    state.trick = {
      lead: { kind: 'single', cards: state.players.A!.hand, rank: 'K', length: 1, wildCount: 0, isDifference: false },
      leadSeat: 'A',
      lastPlaySeat: 'A',
      passCount: 0,
    };

    expect(hasDifferenceOpportunity(state)).toBe(false);
    expect(() => playCards(state, 'D', ['split-ace-d-1'], 'difference', 1)).toThrow(/合法牌型|差牌/);
    state.currentTurn = 'D';
    const split = playCards(state, 'D', ['split-ace-d-1'], undefined, 1);

    expect(split.publicLastPlay?.cards.map((card) => card.id)).toEqual(['split-ace-d-1']);
    expect(split.players.D?.hand.map((card) => card.id)).toEqual(['split-ace-d-2', 'split-ace-d-rest']);
    expect(split.publicLastPlay?.isDifference).toBe(false);
  });

  it('普通牌无人跟管时接风，差牌回应单牌时立即清桌并由队友首出', () => {
    let state = openNormalHand();
    state.players.A!.hand = [standardCard('5', 'spades', 'a-5')];
    state.players.B!.hand = [standardCard('6', 'hearts', 'b-6')];
    state.players.C!.hand = [standardCard('7', 'clubs', 'c-7')];
    state.players.D!.hand = [standardCard('8', 'diamonds', 'd-8')];
    state.currentTurn = 'A';
    state.trick = null;

    state = playCards(state, 'A', ['a-5'], undefined, 1);
    state = passTurn(state, 'B', 2);
    state = passTurn(state, 'D', 3);
    expect(state.trick).toBeNull();
    expect(state.currentTurn).toBe('C');

    state.players.A!.hand = [standardCard('5', 'spades', 'a-5-second')];
    state.players.B!.hand = [standardCard('6', 'hearts', 'b-6-second')];
    state.players.C!.hand = [standardCard('5', 'clubs', 'c-5'), standardCard('5', 'diamonds', 'c-5-2')];
    state.players.D!.hand = [standardCard('8', 'diamonds', 'd-8-second')];
    for (const seat of ['A', 'B', 'C', 'D'] as const) state.players[seat]!.activeInHand = true;
    state.finishOrder = [];
    state.currentTurn = 'A';
    state.trick = null;
    state = playCards(state, 'A', ['a-5-second'], undefined, 5);
    state = passTurn(state, 'B', 6);
    state = playCards(state, 'C', ['c-5', 'c-5-2'], 'difference', 7);

    expect(state.trick).toBeNull();
    expect(state.currentTurn).toBe('D');
    expect(state.publicLastPlay?.isDifference).toBe(true);
  });

  it('接风时能管就继续当前轮，无人能管才把牌权交给队友任意首出', () => {
    let state = openNormalHand();
    state.players.A!.hand = [standardCard('5', 'spades', 'wind-a')];
    state.players.B!.hand = [standardCard('6', 'hearts', 'wind-b'), standardCard('8', 'hearts', 'wind-b-rest')];
    state.players.C!.hand = [standardCard('8', 'clubs', 'wind-c')];
    state.players.D!.hand = [standardCard('9', 'diamonds', 'wind-d')];
    state.currentTurn = 'A';
    state.trick = null;
    state = playCards(state, 'A', ['wind-a'], undefined, 1);
    state = playCards(state, 'B', ['wind-b'], undefined, 2);
    state = passTurn(state, 'C', 3);
    state = passTurn(state, 'D', 4);
    expect(state.currentTurn).toBe('B');

    state = openNormalHand();
    state.players.A!.hand = [standardCard('5', 'spades', 'wind2-a')];
    state.players.B!.hand = [standardCard('8', 'hearts', 'wind2-b')];
    state.players.C!.hand = [standardCard('9', 'clubs', 'wind2-c')];
    state.players.D!.hand = [standardCard('6', 'diamonds', 'wind2-d'), standardCard('9', 'spades', 'wind2-d-rest')];
    state.currentTurn = 'A';
    state.trick = null;
    state = playCards(state, 'A', ['wind2-a'], undefined, 1);
    state = passTurn(state, 'B', 2);
    expect(state.currentTurn).toBe('D');
    state = playCards(state, 'D', ['wind2-d'], undefined, 3);
    state = passTurn(state, 'B', 5);
    state = passTurn(state, 'C', 6);
    expect(state.currentTurn).toBe('D');

    state = openNormalHand();
    state.players.A!.hand = [standardCard('5', 'spades', 'wind3-a')];
    state.players.B!.hand = [standardCard('8', 'hearts', 'wind3-b')];
    state.players.C!.hand = [standardCard('10', 'clubs', 'wind3-c'), standardCard('J', 'clubs', 'wind3-c-rest')];
    state.players.D!.hand = [standardCard('Q', 'diamonds', 'wind3-d')];
    state.currentTurn = 'A';
    state.trick = null;
    state = playCards(state, 'A', ['wind3-a'], undefined, 1);
    state = passTurn(state, 'B', 2);
    expect(state.currentTurn).toBe('D');
    state = passTurn(state, 'D', 3);
    expect(state.currentTurn).toBe('C');
    state = playCards(state, 'C', ['wind3-c'], undefined, 5);
    expect(state.publicLastPlay?.seat).toBe('C');
  });

  it('同队前两名立即抓两家，下一手沿用第一名首牌权；进行中禁止重开', () => {
    let state = openNormalHand();
    state.players.A!.hand = [standardCard('5', 'spades', 'grab-a')];
    state.players.B!.hand = [standardCard('7', 'hearts', 'grab-b')];
    state.players.C!.hand = [standardCard('6', 'clubs', 'grab-c')];
    state.players.D!.hand = [standardCard('8', 'diamonds', 'grab-d')];
    for (const seat of ['A', 'B', 'C', 'D'] as const) state.players[seat]!.activeInHand = true;
    state.currentTurn = 'A';
    state.trick = null;

    state = playCards(state, 'A', ['grab-a'], undefined, 1);
    state = passTurn(state, 'B', 2);
    state = passTurn(state, 'D', 3);
    state = playCards(state, 'C', ['grab-c'], undefined, 4);

    expect(state.phase).toBe('settled');
    expect(state.settlement?.outcome).toBe('grab-two');
    expect(state.levels.AC).toBe('5');
    expect(state.nextLeaderSeat).toBe('A');
    expect(() => resetRoom({ ...state, phase: 'playing' })).toThrow(/进行中的本手/);

    const nextOpening = startHand(state, () => 0.9, 4);
    expect(nextOpening.candidateLeader).toBe('A');
    let nextPlaying = nextOpening;
    for (let index = 0; index < 4; index += 1) {
      nextPlaying = resolveOpening(nextPlaying, { kind: 'pass', seat: nextPlaying.openingTurn! }, 4);
    }
    expect(nextPlaying.effectiveMain).toBe('5');

    const readyA = readyForNextHand(state, 'A', () => 0.1, 5);
    const readyB = readyForNextHand(readyA, 'B', () => 0.1, 5);
    const readyC = readyForNextHand(readyB, 'C', () => 0.1, 5);
    const nextHand = readyForNextHand(readyC, 'D', () => 0.1, 5);
    expect(readyC.readySeats).toEqual(['A', 'B', 'C']);
    expect(nextHand.phase).toBe('opening');
    expect(nextHand.handNumber).toBe(state.handNumber + 1);
    expect(nextHand.readySeats).toEqual([]);
    expect(resetRoom(state).levels).toEqual({ AC: '3', BD: '3' });
  });
});
