import { Card } from './cards';
import { HandKind } from './hand-types';
import { Level, Seat, SettlementMode, SettlementResult, Team } from './scoring';
import type { TexasSeat } from './texas';

export const EVENTS = {
  login: 'auth:login',
  join: 'room:join',
  leave: 'room:leave',
  snapshot: 'room:snapshot',
  command: 'command',
  activity: 'room:activity',
  chat: 'room:chat',
  replaced: 'session:replaced',
} as const;

export const MINI_PROGRAM_SOCKET_PATH = '/414-ws';

export type GameId = '414' | 'texas';

export type RoomChatInteraction = 'tomato' | 'water' | 'heart' | 'kiss';

export interface RoomChatMessage {
  readonly id: string;
  readonly kind: 'text' | 'interaction';
  readonly senderNickname: string;
  readonly senderSeat?: string;
  readonly text?: string;
  readonly interaction?: RoomChatInteraction;
  readonly targetNickname?: string;
  readonly targetSeat?: string;
  readonly createdAt: number;
}

export type RoomChatPayload =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'interaction'; readonly interaction: RoomChatInteraction; readonly target: { readonly nickname: string; readonly seat?: string } };
export interface GameSelection {
  readonly id: GameId;
  readonly name: string;
  readonly description: string;
  readonly maxPlayers: number;
}

export const GAME_SELECTIONS: readonly GameSelection[] = [
  { id: '414', name: '414', description: '四人私房扑克牌', maxPlayers: 4 },
  { id: 'texas', name: '德州扑克', description: '两人以上即可开局的无限注德州扑克', maxPlayers: 8 },
];


export type RoomRole = 'player' | 'spectator';

export type CommandType =
  | 'start-hand'
  | 'opening'
  | 'play'
  | 'pass'
  | 'burst'
  | 'restart'
  | 'end-room'
  | 'ready'
  | 'activity'
  | 'remove-player';

export type CommandPayload =
  | Record<string, never>
  | { readonly kind: 'pass' | 'stand' | 'reverse'; readonly seat?: Seat }
  | { readonly cardIds: readonly string[]; readonly declaration?: HandKind | 'difference' }
  | { readonly kind: HandKind | 'skip' }
  | { readonly seat: Seat };

export interface CommandEnvelope {
  readonly type: CommandType;
  readonly requestId: string;
  readonly handNumber: number;
  readonly stateVersion: number;
  readonly payload: CommandPayload;
}

export interface PublicPlayerView {
  readonly seat: Seat;
  readonly nickname: string;
  readonly team: Team;
  readonly connected: boolean;
  readonly away: boolean;
  readonly activeInHand: boolean;
  readonly finishedRank: number | null;
  readonly handCount: number;
  readonly burstAnnounced: boolean;
  readonly ready: boolean;
  readonly remainingHand: Card[];
  readonly isHost: boolean;
}

export interface PublicSpectatorView {
  readonly nickname: string;
  readonly connected: boolean;
}

export interface PublicTrickView {
  readonly leadSeat: Seat;
  readonly lastPlaySeat: Seat;
  readonly kind: HandKind;
  readonly cards: Card[];
  readonly passCount: number;
}

export interface PublicSnapshot {
  readonly roomId: string;
  readonly phase: string;
  readonly handNumber: number;
  readonly version: number;
  readonly players: PublicPlayerView[];
  readonly spectators?: PublicSpectatorView[];
  readonly chat?: RoomChatMessage[];
  readonly hostSeat: Seat | null;
  readonly levels: { readonly AC: Level; readonly BD: Level };
  readonly completedRounds: { readonly AC: number; readonly BD: number };
  readonly candidateLeader: Seat | null;
  readonly currentTurn: Seat | null;
  readonly effectiveMain: Level | null;
  readonly openingMode: SettlementMode;
  readonly modeTeam: Team | null;
  readonly openingTurn: Seat | null;
  readonly openingSkippedSeats: Seat[];
  readonly trick: PublicTrickView | null;
  readonly publicLastPlay: { readonly seat: Seat; readonly cards: Card[]; readonly kind: HandKind; readonly isDifference: boolean } | null;
  readonly burstPendingSeat: Seat | null;
  readonly differenceAvailable: boolean;
  readonly finishOrder: Seat[];
  readonly burstAnnounced: Seat[];
  readonly settlement: SettlementResult | null;
}

export interface PrivateSnapshot {
  readonly seat: Seat | null;
  readonly hand: Card[];
  readonly burstLocked: boolean;
  readonly burstKinds?: HandKind[];
  readonly spectator?: boolean;
  readonly spectatorHands?: ReadonlyArray<{ readonly seat: Seat; readonly nickname: string; readonly hand: Card[] }>;
}

export interface RoomSnapshot {
  readonly public: PublicSnapshot;
  readonly private: PrivateSnapshot;
}


export type TexasCommandType =
  | 'start-hand'
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'all-in'
  | 'next-hand'
  | 'remove-player';

export type TexasCommandPayload =
  | Record<string, never>
  | { readonly amount: number }
  | { readonly seat: TexasSeat };

export interface TexasCommandEnvelope {
  readonly type: TexasCommandType;
  readonly requestId: string;
  readonly handNumber: number;
  readonly stateVersion: number;
  readonly payload: TexasCommandPayload;
}

export interface TexasPlayerView {
  readonly seat: TexasSeat;
  /** 面向玩家展示的德州位置，内部 seat 只用于协议和状态同步。 */
  readonly positionLabel?: string;
  readonly nickname: string;
  readonly connected: boolean;
  readonly stack: number;
  readonly totalBet: number;
  readonly roundBet: number;
  readonly folded: boolean;
  readonly allIn: boolean;
  readonly isHost: boolean;
  readonly waiting?: boolean;
}

export interface TexasSpectatorView {
  readonly nickname: string;
  readonly connected: boolean;
  readonly waiting?: boolean;
}

export interface TexasSettlement {
  readonly winners: readonly TexasSeat[];
  readonly payouts: Readonly<Record<string, number>>;
  readonly hands: Readonly<Record<string, string>>;
}

export interface TexasHandView {
  readonly category: import('./texas').TexasHandCategory;
  readonly label: string;
}

export interface TexasPublicSnapshot {
  readonly gameId: 'texas';
  readonly roomId: string;
  readonly phase: 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'settled';
  readonly handNumber: number;
  readonly version: number;
  readonly players: TexasPlayerView[];
  readonly spectators: TexasSpectatorView[];
  readonly chat?: RoomChatMessage[];
  readonly hostSeat: TexasSeat | null;
  readonly dealerSeat: TexasSeat | null;
  readonly smallBlindSeat: TexasSeat | null;
  readonly bigBlindSeat: TexasSeat | null;
  readonly currentTurn: TexasSeat | null;
  readonly community: import('./texas').TexasCard[];
  readonly pot: number;
  readonly currentBet: number;
  readonly minRaise: number;
  readonly settlement: TexasSettlement | null;
}

export interface TexasPrivateSnapshot {
  readonly seat: TexasSeat | null;
  readonly holeCards: import('./texas').TexasCard[];
  readonly bestHand?: TexasHandView;
  readonly waiting?: boolean;
  readonly spectator?: boolean;
  readonly spectatorHands?: ReadonlyArray<{ readonly seat: TexasSeat; readonly positionLabel?: string; readonly nickname: string; readonly hand: import('./texas').TexasCard[]; readonly bestHand?: TexasHandView }>;
}

export interface TexasSnapshot {
  readonly public: TexasPublicSnapshot;
  readonly private: TexasPrivateSnapshot;
}

export type GameSnapshot = RoomSnapshot | TexasSnapshot;
export type AnyCommandEnvelope = CommandEnvelope | TexasCommandEnvelope;


const ROOM_CHAT_INTERACTIONS = new Set<RoomChatInteraction>(['tomato', 'water', 'heart', 'kiss']);

export function isRoomChatPayload(value: unknown): value is RoomChatPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RoomChatPayload>;
  if (candidate.kind === 'text') return typeof candidate.text === 'string';
  if (candidate.kind !== 'interaction' || !ROOM_CHAT_INTERACTIONS.has(candidate.interaction as RoomChatInteraction)) return false;
  const target = candidate.target;
  return Boolean(target && typeof target === 'object'
    && typeof target.nickname === 'string'
    && target.nickname.trim().length > 0);
}
export function isTexasSnapshot(snapshot: GameSnapshot): snapshot is TexasSnapshot {
  return snapshot.public && 'gameId' in snapshot.public && snapshot.public.gameId === 'texas';
}

const TEXAS_COMMAND_TYPES = new Set<TexasCommandType>([
  'start-hand', 'fold', 'check', 'call', 'bet', 'raise', 'all-in', 'next-hand', 'remove-player',
]);

export function isTexasCommandEnvelope(value: unknown): value is TexasCommandEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TexasCommandEnvelope>;
  return typeof candidate.type === 'string'
    && TEXAS_COMMAND_TYPES.has(candidate.type as TexasCommandType)
    && typeof candidate.requestId === 'string'
    && candidate.requestId.length > 0
    && typeof candidate.handNumber === 'number'
    && Number.isInteger(candidate.handNumber)
    && candidate.handNumber >= 0
    && typeof candidate.stateVersion === 'number'
    && Number.isInteger(candidate.stateVersion)
    && candidate.stateVersion >= 0
    && Boolean(candidate.payload)
    && typeof candidate.payload === 'object';
}

export const ERROR_CODES = {
  invalidCommand: 'INVALID_COMMAND',
  staleVersion: 'STALE_VERSION',
  unauthorized: 'UNAUTHORIZED',
} as const;

const COMMAND_TYPES = new Set<CommandType>([
  'start-hand', 'opening', 'play', 'pass', 'burst', 'restart', 'end-room', 'ready', 'activity', 'remove-player',
]);

export function isCommandEnvelope(value: unknown): value is CommandEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CommandEnvelope>;
  const handNumber = candidate.handNumber;
  const stateVersion = candidate.stateVersion;
  return typeof candidate.type === 'string'
    && COMMAND_TYPES.has(candidate.type as CommandType)
    && typeof candidate.requestId === 'string'
    && candidate.requestId.length > 0
    && typeof handNumber === 'number'
    && Number.isInteger(handNumber)
    && handNumber >= 0
    && typeof stateVersion === 'number'
    && Number.isInteger(stateVersion)
    && stateVersion >= 0
    && Boolean(candidate.payload)
    && typeof candidate.payload === 'object';
}
