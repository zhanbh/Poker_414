import { Card, createDeck } from './cards';
import { canBurst, chooseBurstCandidate } from './rule-engine';
import { HandAnalysis, HandKind } from './hand-types';
import { PlayDeclaration, validatePlay } from './rules';
import {
  CompletedRounds,
  Level,
  Seat,
  SettlementMode,
  SettlementResult,
  Team,
  TeamLevels,
  LEVELS,
  settleHand,
  teamOf,
} from './scoring';

export const SEATS = ['A', 'B', 'C', 'D'] as const;
export type GamePhase = 'lobby' | 'opening' | 'playing' | 'settled' | 'ended';

export interface PlayerState {
  id: string;
  nickname: string;
  seat: Seat;
  team: Team;
  hand: Card[];
  connected: boolean;
  lastActivityAt: number;
  away: boolean;
  activeInHand: boolean;
  finishedRank: number | null;
  burstLocked: boolean;
  burstKind: HandKind | null;
}

export interface PublicPlay {
  seat: Seat;
  cards: Card[];
  kind: HandKind;
  isDifference: boolean;
}

export interface TrickState {
  lead: HandAnalysis;
  leadSeat: Seat;
  lastPlaySeat: Seat;
  passCount: number;
}

export interface OpeningChoice {
  kind: 'normal' | 'stand' | 'reverse';
  seat?: Seat;
}

export interface GameState {
  roomId: string;
  hostId: string;
  phase: GamePhase;
  handNumber: number;
  version: number;
  players: Record<Seat, PlayerState | null>;
  levels: TeamLevels;
  completedRounds: CompletedRounds;
  candidateLeader: Seat | null;
  nextLeaderSeat: Seat | null;
  currentTurn: Seat | null;
  effectiveMain: Level | null;
  openingMode: SettlementMode;
  modeTeam: Team | null;
  trick: TrickState | null;
  publicLastPlay: PublicPlay | null;
  finishOrder: Seat[];
  burstAnnounced: Seat[];
  settlement: SettlementResult | null;
}

export class GameStateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GameStateError';
    this.code = code;
  }
}

export type RandomSource = () => number;

const emptyPlayers = (): Record<Seat, PlayerState | null> => ({ A: null, B: null, C: null, D: null });

export function createGameState(roomId: string, hostId: string): GameState {
  return {
    roomId,
    hostId,
    phase: 'lobby',
    handNumber: 0,
    version: 0,
    players: emptyPlayers(),
    levels: { AC: '3', BD: '3' },
    completedRounds: { AC: 0, BD: 0 },
    candidateLeader: null,
    nextLeaderSeat: null,
    currentTurn: null,
    effectiveMain: null,
    openingMode: 'normal',
    modeTeam: null,
    trick: null,
    publicLastPlay: null,
    finishOrder: [],
    burstAnnounced: [],
    settlement: null,
  };
}

export function joinPlayer(
  state: GameState,
  player: { readonly id: string; readonly nickname: string },
  now: number,
): GameState {
  if (state.phase !== 'lobby') throw new GameStateError('ROOM_STARTED', '牌局已经开始，不能加入');
  if (Object.values(state.players).some((candidate) => candidate?.id === player.id)) {
    throw new GameStateError('PLAYER_EXISTS', '玩家已经在房间内');
  }
  if (Object.values(state.players).some((candidate) => candidate?.nickname === player.nickname)) {
    throw new GameStateError('NICKNAME_EXISTS', '昵称已经被使用');
  }
  const seat = SEATS.find((candidate) => state.players[candidate] === null);
  if (!seat) throw new GameStateError('ROOM_FULL', '房间已满');

  const seatedPlayer: PlayerState = {
    id: player.id,
    nickname: player.nickname,
    seat,
    team: teamOf(seat),
    hand: [],
    connected: true,
    lastActivityAt: now,
    away: false,
    activeInHand: true,
    finishedRank: null,
    burstLocked: false,
    burstKind: null,
  };

  return { ...state, version: state.version + 1, players: { ...state.players, [seat]: seatedPlayer } };
}

function shuffle(deck: readonly Card[], random: RandomSource): Card[] {
  const shuffled = [...deck];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const value = Math.max(0, Math.min(0.999999, random()));
    const swapIndex = Math.floor(value * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function validateDeck(deck: readonly Card[]): void {
  if (deck.length !== 54 || new Set(deck.map((card) => card.id)).size !== 54) {
    throw new GameStateError('INVALID_DECK', '牌堆必须包含不重复的54张牌');
  }
}

function randomSeat(random: RandomSource): Seat {
  const value = Math.max(0, Math.min(0.999999, random()));
  return SEATS[Math.floor(value * SEATS.length)];
}

export function startHand(
  state: GameState,
  random: RandomSource,
  now: number,
  suppliedDeck: readonly Card[] = createDeck(),
): GameState {
  if (state.phase !== 'lobby' && state.phase !== 'settled') {
    throw new GameStateError('HAND_IN_PROGRESS', '当前牌局尚未结束');
  }
  if (SEATS.some((seat) => state.players[seat] === null)) {
    throw new GameStateError('NOT_ENOUGH_PLAYERS', '需要四名玩家才能开始');
  }
  validateDeck(suppliedDeck);

  const deck = shuffle(suppliedDeck, random);
  const hands: Record<Seat, Card[]> = { A: [], B: [], C: [], D: [] };
  deck.forEach((card, index) => hands[SEATS[index % SEATS.length]].push(card));
  const candidateLeader = state.phase === 'settled' && state.nextLeaderSeat ? state.nextLeaderSeat : randomSeat(random);
  const players = { ...state.players };

  for (const seat of SEATS) {
    const player = players[seat];
    if (!player) throw new GameStateError('NOT_ENOUGH_PLAYERS', '需要四名玩家才能开始');
    players[seat] = {
      ...player,
      hand: hands[seat],
      lastActivityAt: now,
      away: false,
      activeInHand: true,
      finishedRank: null,
      burstLocked: false,
      burstKind: null,
    };
  }

  return {
    ...state,
    version: state.version + 1,
    phase: 'opening',
    handNumber: state.handNumber + 1,
    players,
    candidateLeader,
    nextLeaderSeat: null,
    currentTurn: null,
    effectiveMain: null,
    openingMode: 'normal',
    modeTeam: null,
    trick: null,
    publicLastPlay: null,
    finishOrder: [],
    burstAnnounced: [],
    settlement: null,
  };
}

function teammateOf(seat: Seat): Seat {
  return seat === 'A' ? 'C' : seat === 'C' ? 'A' : seat === 'B' ? 'D' : 'B';
}

function withPlayer(state: GameState, seat: Seat, patch: Partial<PlayerState>): GameState {
  const player = state.players[seat];
  if (!player) throw new GameStateError('PLAYER_NOT_FOUND', '玩家不在房间内');
  return {
    ...state,
    version: state.version + 1,
    players: { ...state.players, [seat]: { ...player, ...patch } },
  };
}

function finalizeOpening(state: GameState, candidateLeader: Seat, mode: SettlementMode, modeTeam: Team | null): GameState {
  const player = state.players[candidateLeader];
  if (!player || !player.activeInHand) throw new GameStateError('INVALID_LEADER', '首牌权人无效');
  const effectiveMain = state.levels[teamOf(candidateLeader)];
  return {
    ...state,
    version: state.version + 1,
    phase: 'playing',
    candidateLeader,
    currentTurn: candidateLeader,
    effectiveMain,
    openingMode: mode,
    modeTeam,
    trick: null,
  };
}

export function resolveOpening(state: GameState, choice: OpeningChoice, now: number): GameState {
  if (state.phase !== 'opening' || !state.candidateLeader) {
    throw new GameStateError('OPENING_CLOSED', '当前不在首牌权选择阶段');
  }

  if (choice.kind === 'normal') {
    return finalizeOpening(state, state.candidateLeader, state.openingMode, state.modeTeam);
  }

  if (!choice.seat || !state.players[choice.seat]) {
    throw new GameStateError('INVALID_OPENING_PLAYER', '立棍或反立玩家无效');
  }

  if (state.openingMode === 'normal' && choice.kind === 'stand') {
    const standTeam = teamOf(choice.seat);
    const teammate = teammateOf(choice.seat);
    const updated = withPlayer(state, teammate, { activeInHand: false, lastActivityAt: now });
    return {
      ...updated,
      version: updated.version + 1,
      candidateLeader: choice.seat,
      currentTurn: null,
      openingMode: 'stand',
      modeTeam: standTeam,
    };
  }

  if (state.openingMode === 'stand' && choice.kind === 'reverse') {
    const standTeam = state.modeTeam;
    if (!standTeam || teamOf(choice.seat) === standTeam) {
      throw new GameStateError('INVALID_REVERSE', '反立必须由另一队选择');
    }
    const standSeat = state.candidateLeader;
    const players = { ...state.players };
    for (const seat of SEATS) {
      const player = players[seat];
      if (player) players[seat] = { ...player, activeInHand: seat === standSeat || seat === choice.seat };
    }
    const reversed: GameState = {
      ...state,
      version: state.version + 1,
      players,
      candidateLeader: choice.seat,
      openingMode: 'reverse',
      modeTeam: teamOf(choice.seat),
    };
    return finalizeOpening(reversed, choice.seat, 'reverse', teamOf(choice.seat));
  }

  if (state.openingMode === 'stand' && choice.kind === 'stand') {
    throw new GameStateError('STAND_ALREADY_CHOSEN', '本手只能立棍一次');
  }
  throw new GameStateError('INVALID_OPENING_CHOICE', '当前首牌权窗口不接受该选择');
}

function activeSeats(state: GameState): Seat[] {
  return SEATS.filter((seat) => {
    const player = state.players[seat];
    return Boolean(player?.activeInHand && player.hand.length > 0);
  });
}

function nextActiveSeat(state: GameState, from: Seat): Seat | null {
  for (let offset = 1; offset <= SEATS.length; offset += 1) {
    const seat = SEATS[(SEATS.indexOf(from) + offset) % SEATS.length];
    const player = state.players[seat];
    if (player?.activeInHand && player.hand.length > 0) return seat;
  }
  return null;
}

function finishPlayer(state: GameState, seat: Seat): GameState {
  const player = state.players[seat];
  if (!player || player.finishedRank !== null) return state;
  const finishedRank = state.finishOrder.length + 1;
  const updated = withPlayer(state, seat, { activeInHand: false, finishedRank });
  return { ...updated, finishOrder: [...updated.finishOrder, seat] };
}

function settleCurrentHand(state: GameState): GameState {
  const result = settleHand({
    levels: state.levels,
    completedRounds: state.completedRounds,
    finishOrder: state.finishOrder,
    mode: state.openingMode,
    modeTeam: state.modeTeam ?? undefined,
  });
  return {
    ...state,
    version: state.version + 1,
    phase: 'settled',
    levels: result.levels,
    completedRounds: result.completedRounds,
    nextLeaderSeat: result.nextLeader,
    currentTurn: null,
    trick: null,
    settlement: result,
  };
}

function maybeSettle(state: GameState): GameState {
  if (state.finishOrder.length === 0) return state;
  if (state.openingMode !== 'normal') return settleCurrentHand(state);
  if (state.finishOrder.length >= 2 && teamOf(state.finishOrder[0]) === teamOf(state.finishOrder[1])) {
    return settleCurrentHand(state);
  }

  const remaining = activeSeats(state);
  if (remaining.length <= 1) {
    const withTail = remaining.length === 1 ? finishPlayer(state, remaining[0]) : state;
    return settleCurrentHand(withTail);
  }
  return state;
}

function leadAfterClear(state: GameState, lastPlaySeat: Seat): Seat | null {
  const lastPlayer = state.players[lastPlaySeat];
  if (lastPlayer?.activeInHand && lastPlayer.hand.length > 0) return lastPlaySeat;
  const teammate = teammateOf(lastPlaySeat);
  const teammatePlayer = state.players[teammate];
  if (teammatePlayer?.activeInHand && teammatePlayer.hand.length > 0) return teammate;
  return nextActiveSeat(state, lastPlaySeat);
}

export function markActivity(state: GameState, seat: Seat, now: number): GameState {
  const player = state.players[seat];
  if (!player) throw new GameStateError('PLAYER_NOT_FOUND', '玩家不在房间内');
  if (player.away) return withPlayer(state, seat, { lastActivityAt: now, away: false });
  return { ...state, players: { ...state.players, [seat]: { ...player, lastActivityAt: now } } };
}

export function scanPresence(state: GameState, now: number): GameState {
  const players = { ...state.players };
  let changed = false;
  for (const seat of SEATS) {
    const player = players[seat];
    if (!player) continue;
    const away = now - player.lastActivityAt >= 30_000;
    if (away !== player.away) {
      players[seat] = { ...player, away };
      changed = true;
    }
  }
  return changed ? { ...state, version: state.version + 1, players } : state;
}

export function declareBurst(state: GameState, seat: Seat, kind: HandKind, now: number): GameState {
  if (state.phase !== 'playing') throw new GameStateError('NOT_PLAYING', '当前不能报爆');
  const player = state.players[seat];
  if (!player || !player.activeInHand) throw new GameStateError('PLAYER_INACTIVE', '该玩家当前不能操作');
  if (player.burstLocked) throw new GameStateError('BURST_ALREADY_LOCKED', '该玩家已经报爆');
  if (!canBurst(player.hand, state.effectiveMain!)) throw new GameStateError('BURST_UNAVAILABLE', '剩余手牌不能一次出完');
  if (!chooseBurstCandidate(player.hand, state.effectiveMain!, kind)) {
    throw new GameStateError('BURST_KIND_INVALID', '报爆牌型与剩余手牌不匹配');
  }
  const activity = markActivity(state, seat, now);
  const updated = withPlayer(activity, seat, { burstLocked: true, burstKind: kind });
  return {
    ...updated,
    burstAnnounced: updated.burstAnnounced.includes(seat) ? updated.burstAnnounced : [...updated.burstAnnounced, seat],
  };
}

function selectedCards(player: PlayerState, cardIds: readonly string[]): Card[] {
  if (new Set(cardIds).size !== cardIds.length) throw new GameStateError('DUPLICATE_CARD', '不能重复选择同一张牌');
  const cards = cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (cards.some((card) => !card)) throw new GameStateError('CARD_NOT_OWNED', '选中的牌不在玩家手牌中');
  return cards as Card[];
}

export function playCards(
  state: GameState,
  seat: Seat,
  cardIds: readonly string[],
  declaration: PlayDeclaration | undefined,
  now: number,
): GameState {
  if (state.phase !== 'playing') throw new GameStateError('NOT_PLAYING', '当前不在出牌阶段');
  if (state.currentTurn !== seat) throw new GameStateError('NOT_YOUR_TURN', '还没有轮到该玩家');
  const player = state.players[seat];
  if (!player || !player.activeInHand) throw new GameStateError('PLAYER_INACTIVE', '该玩家当前不能出牌');
  if (cardIds.length === 0) throw new GameStateError('EMPTY_PLAY', '至少选择一张牌');
  if (player.burstLocked && cardIds.length !== player.hand.length) {
    throw new GameStateError('BURST_LOCKED', '报爆后必须一次出完全部剩余手牌');
  }

  const cards = selectedCards(player, cardIds);
  const validation = validatePlay(cards, state.trick?.lead ?? null, state.effectiveMain!, declaration);
  if (!validation.legal || !validation.hand) {
    throw new GameStateError('ILLEGAL_PLAY', validation.reason ?? '出牌不合法');
  }

  const remaining = player.hand.filter((card) => !cardIds.includes(card.id));
  let next: GameState = withPlayer(markActivity(state, seat, now), seat, { hand: remaining });
  next = {
    ...next,
    publicLastPlay: {
      seat,
      cards,
      kind: validation.hand.kind,
      isDifference: validation.hand.isDifference,
    },
  };

  const finished = remaining.length === 0;
  if (finished) next = finishPlayer(next, seat);
  next = maybeSettle(next);
  if (next.phase === 'settled') return next;

  if (validation.clearsTrick) {
    const lead = leadAfterClear(next, seat);
    return { ...next, trick: null, currentTurn: lead };
  }

  const currentTrick: TrickState = next.trick
    ? { ...next.trick, lead: validation.hand, leadSeat: next.trick.leadSeat, lastPlaySeat: seat, passCount: 0 }
    : { lead: validation.hand, leadSeat: seat, lastPlaySeat: seat, passCount: 0 };
  const currentTurn = nextActiveSeat(next, seat);
  return { ...next, trick: currentTrick, currentTurn };
}

export function passTurn(state: GameState, seat: Seat, now: number): GameState {
  if (state.phase !== 'playing') throw new GameStateError('NOT_PLAYING', '当前不在出牌阶段');
  if (state.currentTurn !== seat) throw new GameStateError('NOT_YOUR_TURN', '还没有轮到该玩家');
  if (!state.trick) throw new GameStateError('NO_TRICK', '首出阶段不能过牌');
  const updated = markActivity(state, seat, now);
  const trick = updated.trick;
  if (!trick) throw new GameStateError('NO_TRICK', '首出阶段不能过牌');
  const active = activeSeats(updated);
  const passCount = trick.passCount + 1;
  const otherPlayers = active.filter((candidate) => candidate !== trick.lastPlaySeat).length;
  if (passCount >= otherPlayers) {
    const nextLeader = leadAfterClear(updated, trick.lastPlaySeat);
    return { ...updated, trick: null, currentTurn: nextLeader };
  }

  return {
    ...updated,
    trick: { ...trick, passCount },
    currentTurn: nextActiveSeat(updated, seat),
  };
}

export function setPlayerConnection(state: GameState, seat: Seat, connected: boolean): GameState {
  return withPlayer(state, seat, { connected });
}

export function removePlayer(state: GameState, seat: Seat): GameState {
  if (state.phase !== 'lobby') throw new GameStateError('ROOM_STARTED', '开始后不能移除玩家');
  if (!state.players[seat]) throw new GameStateError('PLAYER_NOT_FOUND', '玩家不在房间内');
  return {
    ...state,
    version: state.version + 1,
    players: { ...state.players, [seat]: null },
  };
}

export function endRoom(state: GameState): GameState {
  if (state.phase === 'ended') return state;
  return { ...state, version: state.version + 1, phase: 'ended', currentTurn: null, trick: null };
}

export function resetRoom(state: GameState): GameState {
  if (state.phase === 'playing' || state.phase === 'opening') {
    throw new GameStateError('HAND_IN_PROGRESS', '进行中的本手不能重新开始');
  }
  if (state.phase === 'ended') throw new GameStateError('ROOM_ENDED', '房间已经结束');
  return {
    ...state,
    version: state.version + 1,
    phase: 'lobby',
    handNumber: 0,
    levels: { AC: '3', BD: '3' },
    completedRounds: { AC: 0, BD: 0 },
    candidateLeader: null,
    nextLeaderSeat: null,
    currentTurn: null,
    effectiveMain: null,
    openingMode: 'normal',
    modeTeam: null,
    trick: null,
    publicLastPlay: null,
    finishOrder: [],
    burstAnnounced: [],
    settlement: null,
  };
}

export { LEVELS };
