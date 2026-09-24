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
export const AWAY_TIMEOUT_MS = 30_000;

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
  kind: 'pass' | 'stand' | 'reverse';
  seat?: Seat;
}

export interface BurstPending {
  readonly seat: Seat;
  readonly clearsTrick: boolean;
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
  openingTurn: Seat | null;
  openingSkippedSeats: Seat[];
  trick: TrickState | null;
  publicLastPlay: PublicPlay | null;
  burstPending: BurstPending | null;
  readySeats: Seat[];
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
    openingTurn: null,
    openingSkippedSeats: [],
    trick: null,
    publicLastPlay: null,
    burstPending: null,
    readySeats: [],
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
    openingTurn: candidateLeader,
    openingSkippedSeats: [],
    trick: null,
    publicLastPlay: null,
    burstPending: null,
    readySeats: [],
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
    openingTurn: null,
    openingSkippedSeats: [],
    trick: null,
  };
}

function nextSeat(seat: Seat): Seat {
  return SEATS[(SEATS.indexOf(seat) + 1) % SEATS.length];
}

function nextOpponentSeat(seat: Seat, team: Team): Seat {
  let candidate = nextSeat(seat);
  while (teamOf(candidate) === team) candidate = nextSeat(candidate);
  return candidate;
}

function standPlayers(state: GameState, standSeat: Seat): Record<Seat, PlayerState | null> {
  const standTeam = teamOf(standSeat);
  return Object.fromEntries(SEATS.map((seat) => {
    const player = state.players[seat];
    return [seat, player ? {
      ...player,
      activeInHand: seat === standSeat || teamOf(seat) !== standTeam,
    } : null];
  })) as Record<Seat, PlayerState | null>;
}

export function resolveOpening(state: GameState, choice: OpeningChoice, now: number): GameState {
  if (state.phase !== 'opening' || !state.candidateLeader) {
    throw new GameStateError('OPENING_CLOSED', '当前不在首牌权选择阶段');
  }
  if (!state.openingTurn) throw new GameStateError('OPENING_CLOSED', '当前没有可操作的首牌权窗口');
  const candidateLeader = state.candidateLeader;
  const openingTurn = state.openingTurn;
  const actor = choice.seat ?? openingTurn;
  if (actor !== openingTurn) throw new GameStateError('NOT_OPENING_TURN', '还没有轮到该玩家选择');
  if (!state.players[actor]) throw new GameStateError('INVALID_OPENING_PLAYER', '玩家不在房间内');
  state = markActivity(state, actor, now);

  if (state.openingMode === 'normal' && choice.kind === 'pass') {
    const skipped = [...state.openingSkippedSeats, actor];
    if (skipped.length === SEATS.length) return finalizeOpening(state, candidateLeader, 'normal', null);
    return { ...state, version: state.version + 1, openingTurn: nextSeat(actor), openingSkippedSeats: skipped };
  }

  if (state.openingMode === 'normal' && choice.kind === 'stand') {
    const standTeam = teamOf(actor);
    return {
      ...state,
      version: state.version + 1,
      candidateLeader: actor,
      openingMode: 'stand',
      modeTeam: standTeam,
      openingTurn: teammateOf(actor),
      openingSkippedSeats: [],
    };
  }

  if (state.openingMode === 'stand') {
    const standTeam = state.modeTeam;
    if (!standTeam || actor !== teammateOf(candidateLeader) || teamOf(actor) !== standTeam) {
      throw new GameStateError('INVALID_STAND_TURN', '只有立棍方队友可以继续抢立');
    }
    if (choice.kind === 'stand') {
      return {
        ...state,
        version: state.version + 1,
        candidateLeader: actor,
        openingMode: 'reverse',
        openingTurn: nextOpponentSeat(actor, standTeam),
        openingSkippedSeats: [],
      };
    }
    if (choice.kind === 'pass') {
      return {
        ...state,
        version: state.version + 1,
        openingMode: 'reverse',
        openingTurn: nextOpponentSeat(candidateLeader, standTeam),
        openingSkippedSeats: [],
      };
    }
  }

  if (state.openingMode === 'reverse') {
    const standTeam = state.modeTeam;
    if (!standTeam || teamOf(actor) === standTeam) {
      throw new GameStateError('INVALID_REVERSE', '反立必须由另一队选择');
    }
    if (choice.kind === 'reverse') {
      const players = { ...state.players };
      for (const seat of SEATS) {
        const player = players[seat];
        if (player) players[seat] = { ...player, activeInHand: seat === candidateLeader || seat === actor };
      }
      const reversed: GameState = {
        ...state,
        version: state.version + 1,
        players,
        candidateLeader: actor,
        openingMode: 'reverse',
        modeTeam: teamOf(actor),
      };
      return finalizeOpening(reversed, actor, 'reverse', teamOf(actor));
    }
    if (choice.kind === 'pass') {
      const nextOpponent = nextOpponentSeat(actor, standTeam);
      if (state.openingSkippedSeats.includes(nextOpponent)) {
        const finalStand = { ...state, players: standPlayers(state, candidateLeader) };
        return finalizeOpening(finalStand, candidateLeader, 'stand', standTeam);
      }
      return {
        ...state,
        version: state.version + 1,
        openingTurn: nextOpponent,
        openingSkippedSeats: [...state.openingSkippedSeats, actor],
      };
    }
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
    burstPending: null,
    readySeats: [],
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

function responseSeats(state: GameState, trick: TrickState): Seat[] {
  const active = activeSeats(state);
  const lastPlayer = state.players[trick.lastPlaySeat];
  const teammate = lastPlayer && lastPlayer.finishedRank !== null ? teammateOf(trick.lastPlaySeat) : null;
  return active.filter((candidate) => candidate !== trick.lastPlaySeat && candidate !== teammate);
}

function nextResponseSeat(state: GameState, from: Seat, trick: TrickState): Seat | null {
  const eligible = new Set(responseSeats(state, trick));
  for (let offset = 1; offset <= SEATS.length; offset += 1) {
    const seat = SEATS[(SEATS.indexOf(from) + offset) % SEATS.length];
    if (eligible.has(seat)) return seat;
  }
  return null;
}

function canPromptBurst(state: GameState, seat: Seat): boolean {
  const player = state.players[seat];
  return state.phase === 'playing'
    && state.effectiveMain !== null
    && Boolean(player?.activeInHand && player.hand.length > 1)
    && canBurst(player!.hand, state.effectiveMain!);
}

function autoBurstLastCard(state: GameState, seat: Seat): GameState {
  const player = state.players[seat];
  if (!player || !player.activeInHand || player.hand.length !== 1 || state.effectiveMain === null || !canBurst(player.hand, state.effectiveMain)) {
    return state;
  }
  if (player.burstLocked && state.burstAnnounced.includes(seat)) return state;
  const updated = withPlayer(state, seat, { burstLocked: true, burstKind: 'single' });
  return {
    ...updated,
    burstAnnounced: updated.burstAnnounced.includes(seat) ? updated.burstAnnounced : [...updated.burstAnnounced, seat],
  };
}

/** Public, hand-safe signal used to suppress the normal turn ring when any player can interrupt with a difference. */
export function hasDifferenceOpportunity(state: GameState): boolean {
  if (state.phase !== 'playing' || state.burstPending || state.effectiveMain === null || !state.trick || state.trick.lead.kind !== 'single') {
    return false;
  }
  const lead = state.trick.lead;
  const main = state.effectiveMain;
  return SEATS.some((seat) => {
    const player = state.players[seat];
    if (!player?.activeInHand) return false;
    for (let left = 0; left < player.hand.length; left += 1) {
      for (let right = left + 1; right < player.hand.length; right += 1) {
        if (validatePlay([player.hand[left], player.hand[right]], lead, main, 'difference').legal) return true;
      }
    }
    return false;
  });
}

export function markActivity(state: GameState, seat: Seat, now: number): GameState {
  const player = state.players[seat];
  if (!player) throw new GameStateError('PLAYER_NOT_FOUND', '玩家不在房间内');
  // Activity is an auxiliary presence update. Keep the command version stable
  // so a click that clears "away" cannot make the immediately-following play stale.
  if (player.away) return { ...state, players: { ...state.players, [seat]: { ...player, lastActivityAt: now, away: false } } };
  return { ...state, players: { ...state.players, [seat]: { ...player, lastActivityAt: now } } };
}

export function scanPresence(state: GameState, now: number): GameState {
  const players = { ...state.players };
  let changed = false;
  for (const seat of SEATS) {
    const player = players[seat];
    if (!player) continue;
    const away = now - player.lastActivityAt >= AWAY_TIMEOUT_MS;
    if (away !== player.away) {
      players[seat] = { ...player, away };
      changed = true;
    }
  }
  return changed ? { ...state, version: state.version + 1, players } : state;
}

export type BurstDecision = HandKind | 'skip';

export function resolveBurstDecision(state: GameState, seat: Seat, decision: BurstDecision, now: number): GameState {
  if (state.phase !== 'playing') throw new GameStateError('NOT_PLAYING', '当前不能报爆');
  if (!state.burstPending || state.burstPending.seat !== seat) throw new GameStateError('BURST_NOT_PENDING', '当前没有轮到该玩家确认爆牌');
  const player = state.players[seat];
  if (!player || !player.activeInHand) throw new GameStateError('PLAYER_INACTIVE', '该玩家当前不能操作');
  if (decision !== 'skip') {
    if (!canBurst(player.hand, state.effectiveMain!)) throw new GameStateError('BURST_UNAVAILABLE', '剩余手牌不能一次出完');
    if (!chooseBurstCandidate(player.hand, state.effectiveMain!, decision)) {
      throw new GameStateError('BURST_KIND_INVALID', '报爆牌型与剩余手牌不匹配');
    }
  }
  const pending = state.burstPending;
  const activity = markActivity(state, seat, now);
  const updated = withPlayer(activity, seat, decision === 'skip'
    ? { burstLocked: false, burstKind: null }
    : { burstLocked: true, burstKind: decision });
  const resolved = {
    ...updated,
    burstPending: null,
    burstAnnounced: decision === 'skip' || updated.burstAnnounced.includes(seat)
      ? updated.burstAnnounced
      : [...updated.burstAnnounced, seat],
  };
  if (pending.clearsTrick) {
    return { ...resolved, trick: null, currentTurn: leadAfterClear(resolved, seat) };
  }
  return { ...resolved, currentTurn: nextActiveSeat(resolved, seat) };
}

export function declareBurst(state: GameState, seat: Seat, kind: HandKind, now: number): GameState {
  return resolveBurstDecision(state, seat, kind, now);
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
  if (state.burstPending) throw new GameStateError('BURST_PENDING', '请先选择是否报爆');
  const player = state.players[seat];
  if (!player || !player.activeInHand) throw new GameStateError('PLAYER_INACTIVE', '该玩家当前不能出牌');
  if (cardIds.length === 0) throw new GameStateError('EMPTY_PLAY', '至少选择一张牌');
  const cards = selectedCards(player, cardIds);
  const mayPlayDifference = declaration === 'difference' && state.trick?.lead.kind === 'single';
  if (!mayPlayDifference && state.currentTurn !== seat) throw new GameStateError('NOT_YOUR_TURN', '还没有轮到该玩家');
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
  next = autoBurstLastCard(next, seat);

  const currentTrick: TrickState = next.trick
    ? { ...next.trick, lead: validation.hand, leadSeat: next.trick.leadSeat, lastPlaySeat: seat, passCount: 0 }
    : { lead: validation.hand, leadSeat: seat, lastPlaySeat: seat, passCount: 0 };
  if (canPromptBurst(next, seat)) {
    return {
      ...next,
      trick: validation.clearsTrick ? null : currentTrick,
      currentTurn: seat,
      burstPending: { seat, clearsTrick: validation.clearsTrick },
    };
  }
  if (validation.clearsTrick) {
    const lead = leadAfterClear(next, seat);
    return { ...next, trick: null, currentTurn: lead };
  }
  const currentTurn = nextActiveSeat(next, seat);
  return { ...next, trick: currentTrick, currentTurn };
}

export function passTurn(state: GameState, seat: Seat, now: number): GameState {
  if (state.phase !== 'playing') throw new GameStateError('NOT_PLAYING', '当前不在出牌阶段');
  if (state.burstPending) throw new GameStateError('BURST_PENDING', '请先选择是否报爆');
  if (state.currentTurn !== seat) throw new GameStateError('NOT_YOUR_TURN', '还没有轮到该玩家');
  if (!state.trick) throw new GameStateError('NO_TRICK', '首出阶段不能过牌');
  const updated = markActivity(state, seat, now);
  const trick = updated.trick;
  if (!trick) throw new GameStateError('NO_TRICK', '首出阶段不能过牌');
  const passCount = trick.passCount + 1;
  const responders = responseSeats(updated, trick);
  if (passCount >= responders.length) {
    const nextLeader = leadAfterClear(updated, trick.lastPlaySeat);
    return { ...updated, version: updated.version + 1, trick: null, currentTurn: nextLeader };
  }

  return {
    ...updated,
    version: updated.version + 1,
    trick: { ...trick, passCount },
    currentTurn: nextResponseSeat(updated, seat, trick),
  };
}

export function readyForNextHand(state: GameState, seat: Seat, random: RandomSource, now: number): GameState {
  if (state.phase !== 'settled') throw new GameStateError('NOT_SETTLED', '当前还不能准备下一局');
  if (state.readySeats.includes(seat)) return state;

  const readySeats = [...state.readySeats, seat];
  const updated = { ...state, version: state.version + 1, readySeats };
  return readySeats.length === SEATS.length ? startHand(updated, random, now) : updated;
}

export function setPlayerConnection(state: GameState, seat: Seat, connected: boolean, now?: number): GameState {
  return withPlayer(state, seat, {
    connected,
    ...(connected && now !== undefined ? { lastActivityAt: now, away: false } : {}),
  });
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

export function abortHand(state: GameState): GameState {
  if (state.phase !== 'opening' && state.phase !== 'playing') {
    throw new GameStateError('HAND_NOT_IN_PROGRESS', '当前没有进行中的牌局');
  }

  const players = Object.fromEntries(SEATS.map((seat) => {
    const player = state.players[seat];
    return [seat, player ? {
      ...player,
      hand: [],
      activeInHand: true,
      finishedRank: null,
      burstLocked: false,
      burstKind: null,
    } : null];
  })) as Record<Seat, PlayerState | null>;

  return {
    ...state,
    version: state.version + 1,
    phase: 'lobby',
    players,
    candidateLeader: null,
    nextLeaderSeat: null,
    currentTurn: null,
    effectiveMain: null,
    openingMode: 'normal',
    modeTeam: null,
    openingTurn: null,
    openingSkippedSeats: [],
    trick: null,
    publicLastPlay: null,
    burstPending: null,
    readySeats: [],
    finishOrder: [],
    burstAnnounced: [],
    settlement: null,
  };
}

export function endRoom(state: GameState): GameState {
  if (state.phase === 'ended') return state;
  return { ...state, version: state.version + 1, phase: 'ended', currentTurn: null, trick: null, burstPending: null, readySeats: [] };
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
    openingTurn: null,
    openingSkippedSeats: [],
    trick: null,
    publicLastPlay: null,
    burstPending: null,
    readySeats: [],
    finishOrder: [],
    burstAnnounced: [],
    settlement: null,
  };
}

export { LEVELS };
