import { Card } from './cards';
import { HandKind } from './hand-types';
import { Level, Seat, SettlementMode, SettlementResult, Team } from './scoring';

export const EVENTS = {
  login: 'auth:login',
  join: 'room:join',
  snapshot: 'room:snapshot',
  command: 'command',
  activity: 'room:activity',
  replaced: 'session:replaced',
} as const;

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
}

export interface RoomSnapshot {
  readonly public: PublicSnapshot;
  readonly private: PrivateSnapshot;
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
