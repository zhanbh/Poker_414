import { describe, expect, it } from 'vitest';
import { standardCard } from '../src/cards';
import {
  GameState,
  createGameState,
  declareBurst,
  joinPlayer,
  markActivity,
  passTurn,
  playCards,
  resetRoom,
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
  state = resolveOpening(state, { kind: 'normal' }, 0);
  return state;
}

describe('414 权威牌局状态机', () => {
  it('四人到齐后一次发完54张牌，首局随机首牌权只确定一次且锁定本手主', () => {
    const opening = startHand(createFourPlayerRoom(), () => 0.25, 100);
    const hands = Object.values(opening.players).map((player) => player?.hand.length ?? 0);

    expect(opening.phase).toBe('opening');
    expect(hands.sort((left, right) => left - right)).toEqual([13, 13, 14, 14]);
    expect(opening.candidateLeader).toBeDefined();

    const playing = resolveOpening(opening, { kind: 'normal' }, 100);
    expect(playing.phase).toBe('playing');
    expect(playing.currentTurn).toBe(opening.candidateLeader);
    expect(playing.effectiveMain).toBe(playing.levels[playing.players[playing.currentTurn!]!.team]);
  });

  it('立棍可以等待反立，最终只有立棍者和反立者保留为有效玩家', () => {
    const opening = startHand(createFourPlayerRoom(), () => 0.25, 0);
    const standWindow = resolveOpening(opening, { kind: 'stand', seat: 'A' }, 0);
    const reversed = resolveOpening(standWindow, { kind: 'reverse', seat: 'B' }, 0);

    expect(standWindow.phase).toBe('opening');
    expect(standWindow.openingMode).toBe('stand');
    expect(standWindow.players.C?.activeInHand).toBe(false);
    expect(reversed.phase).toBe('playing');
    expect(reversed.openingMode).toBe('reverse');
    expect(reversed.currentTurn).toBe('B');
    expect(reversed.players.A?.activeInHand).toBe(true);
    expect(reversed.players.B?.activeInHand).toBe(true);
    expect(reversed.players.C?.activeInHand).toBe(false);
    expect(reversed.players.D?.activeInHand).toBe(false);
    expect(reversed.effectiveMain).toBe(reversed.levels.BD);
  });

  it('爆牌后锁定整手出牌，不能拆牌；用户操作清除暂离而扫描不自动动作', () => {
    const state = openNormalHand();
    const player = state.players.A!;
    player.hand = [
      standardCard('4', 'spades', 'burst-4-a'),
      standardCard('4', 'hearts', 'burst-4-b'),
      standardCard('4', 'clubs', 'burst-4-c'),
    ];
    state.currentTurn = 'A';
    state.trick = null;

    const announced = declareBurst(state, 'A', 'ordinary-bomb', 0);
    expect(announced.players.A?.burstLocked).toBe(true);
    expect(announced.burstAnnounced).toContain('A');

    expect(() => playCards(announced, 'A', ['burst-4-a'], 'ordinary-bomb', 1)).toThrow(/报爆/);
    const afterAction = markActivity(scanPresence(announced, 30_000), 'A', 30_001);
    expect(afterAction.players.A?.away).toBe(false);
    expect(afterAction.players.A?.hand).toHaveLength(3);
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
    state = passTurn(state, 'C', 3);
    state = passTurn(state, 'D', 4);
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
    state = playCards(state, 'C', ['grab-c'], undefined, 3);

    expect(state.phase).toBe('settled');
    expect(state.settlement?.outcome).toBe('grab-two');
    expect(state.levels.AC).toBe('5');
    expect(state.nextLeaderSeat).toBe('A');
    expect(() => resetRoom({ ...state, phase: 'playing' })).toThrow(/进行中的本手/);

    const nextOpening = startHand(state, () => 0.9, 4);
    expect(nextOpening.candidateLeader).toBe('A');
    expect(resolveOpening(nextOpening, { kind: 'normal' }, 4).effectiveMain).toBe('5');
    expect(resetRoom(state).levels).toEqual({ AC: '3', BD: '3' });
  });
});
