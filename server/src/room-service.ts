import {
  CommandEnvelope,
  CommandPayload,
  RoomSnapshot,
  PublicSnapshot,
  isCommandEnvelope,
} from '../../shared/src/protocol';
import {
  GameState,
  GameStateError,
  createGameState,
  endRoom,
  joinPlayer,
  markActivity,
  passTurn,
  playCards,
  removePlayer,
  resetRoom,
  resolveOpening,
  scanPresence,
  setPlayerConnection,
  startHand,
  declareBurst,
} from '../../shared/src/game-state';
import { HandKind } from '../../shared/src/hand-types';
import { Session, SessionService } from './session-service';

export interface RoomServiceOptions {
  readonly inviteCode: string;
  readonly now?: () => number;
  readonly random?: () => number;
}

export interface AuthResult {
  readonly sessionToken: string;
  readonly playerId: string;
}

export class RoomServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RoomServiceError';
    this.code = code;
  }
}

export interface CommandSuccess {
  readonly ok: true;
  readonly snapshot: RoomSnapshot;
}

export type CommandResult = CommandSuccess;

export class RoomService {
  readonly sessions = new SessionService();
  private readonly inviteCode: string;
  private readonly now: () => number;
  private readonly random: () => number;
  private state: GameState | null = null;
  private readonly requestResults = new Map<string, Map<string, CommandResult>>();

  constructor(options: RoomServiceOptions) {
    this.inviteCode = options.inviteCode;
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
  }

  login(inviteCode: string): AuthResult {
    if (inviteCode !== this.inviteCode) throw new RoomServiceError('INVALID_INVITE', '邀请码错误');
    const session = this.sessions.create();
    return { sessionToken: session.sessionToken, playerId: session.playerId };
  }

  resume(sessionToken: string): AuthResult {
    const session = this.sessions.get(sessionToken);
    return { sessionToken: session.sessionToken, playerId: session.playerId };
  }

  join(sessionToken: string, nickname: string, roomId: string): RoomSnapshot {
    const session = this.sessions.get(sessionToken);
    if (roomId !== '414') throw new RoomServiceError('ROOM_NOT_FOUND', '房间号不存在');
    if (!nickname.trim()) throw new RoomServiceError('INVALID_NICKNAME', '昵称不能为空');

    if (this.state && session.seat) return this.getSnapshot(sessionToken);
    if (!this.state) this.state = createGameState(roomId, session.playerId);
    try {
      this.state = joinPlayer(this.state, { id: session.playerId, nickname: nickname.trim() }, this.now());
    } catch (error) {
      throw this.wrapGameError(error);
    }
    const seated = Object.values(this.state.players).find((player) => player?.id === session.playerId);
    if (!seated) throw new RoomServiceError('JOIN_FAILED', '入房失败');
    this.sessions.setSeat(sessionToken, seated.seat);
    return this.getSnapshot(sessionToken);
  }

  getState(): GameState | null {
    return this.state;
  }

  hasRoom(): boolean {
    return this.state !== null;
  }

  getSnapshot(sessionToken: string): RoomSnapshot {
    const session = this.sessions.get(sessionToken);
    if (!this.state) return { public: this.emptyPublicSnapshot(), private: { seat: session.seat, hand: [], burstLocked: false } };
    const state = this.state;
    const players = Object.values(state.players)
      .filter((player): player is NonNullable<typeof player> => player !== null)
      .map((player) => ({
        seat: player.seat,
        nickname: player.nickname,
        team: player.team,
        connected: player.connected,
        away: player.away,
        activeInHand: player.activeInHand,
        finishedRank: player.finishedRank,
        handCount: player.hand.length,
        burstAnnounced: state.burstAnnounced.includes(player.seat),
        isHost: player.id === state.hostId,
      }));
    const publicState: PublicSnapshot = {
      roomId: state.roomId,
      phase: state.phase,
      handNumber: state.handNumber,
      version: state.version,
      players,
      hostSeat: Object.values(state.players).find((player) => player?.id === state.hostId)?.seat ?? null,
      levels: state.levels,
      completedRounds: state.completedRounds,
      candidateLeader: state.candidateLeader,
      currentTurn: state.currentTurn,
      effectiveMain: state.effectiveMain,
      openingMode: state.openingMode,
      modeTeam: state.modeTeam,
      trick: state.trick ? {
        leadSeat: state.trick.leadSeat,
        lastPlaySeat: state.trick.lastPlaySeat,
        kind: state.trick.lead.kind,
        cards: [...state.trick.lead.cards],
        passCount: state.trick.passCount,
      } : null,
      publicLastPlay: state.publicLastPlay ? { ...state.publicLastPlay, cards: [...state.publicLastPlay.cards] } : null,
      finishOrder: [...state.finishOrder],
      burstAnnounced: [...state.burstAnnounced],
      settlement: state.settlement,
    };
    const ownPlayer = session.seat ? state.players[session.seat] : null;
    return {
      public: publicState,
      private: {
        seat: session.seat,
        hand: ownPlayer ? [...ownPlayer.hand] : [],
        burstLocked: ownPlayer?.burstLocked ?? false,
      },
    };
  }

  attach(sessionToken: string, connectionId: string): { previousConnectionId: string | null } {
    return this.sessions.attach(sessionToken, connectionId);
  }

  isConnectionOwner(sessionToken: string, connectionId: string): boolean {
    return this.sessions.get(sessionToken).connectionId === connectionId;
  }

  disconnect(sessionToken: string, connectionId: string): void {
    if (!this.sessions.detach(sessionToken, connectionId)) return;
    const seat = this.sessions.get(sessionToken).seat;
    if (this.state && seat) this.state = setPlayerConnection(this.state, seat, false);
  }

  scan(now = this.now()): boolean {
    if (!this.state) return false;
    const next = scanPresence(this.state, now);
    const changed = next !== this.state;
    this.state = next;
    return changed;
  }

  recordActivity(sessionToken: string): RoomSnapshot {
    const session = this.sessions.get(sessionToken);
    if (!this.state || !session.seat) return this.getSnapshot(sessionToken);
    this.state = markActivity(this.state, session.seat, this.now());
    return this.getSnapshot(sessionToken);
  }

  dispatch(sessionToken: string, command: CommandEnvelope): CommandResult {
    const session = this.sessions.get(sessionToken);
    if (!isCommandEnvelope(command)) throw new RoomServiceError('INVALID_COMMAND', '命令格式无效');
    const previous = this.requestResults.get(sessionToken)?.get(command.requestId);
    if (previous) return previous;
    if (!this.state) throw new RoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    if (command.stateVersion !== this.state.version) throw new RoomServiceError('STALE_VERSION', '状态版本已过期，请刷新视图');
    if (command.handNumber !== this.state.handNumber) throw new RoomServiceError('STALE_HAND', '牌局编号已过期，请刷新视图');

    try {
      this.state = this.applyCommand(session, command.type, command.payload);
    } catch (error) {
      throw this.wrapGameError(error);
    }

    const result: CommandResult = { ok: true, snapshot: this.getSnapshot(sessionToken) };
    if (!this.requestResults.has(sessionToken)) this.requestResults.set(sessionToken, new Map());
    this.requestResults.get(sessionToken)!.set(command.requestId, result);
    return result;
  }

  private applyCommand(session: Session, type: CommandEnvelope['type'], payload: CommandPayload): GameState {
    if (!this.state) throw new RoomServiceError('ROOM_NOT_FOUND', '房间尚未创建');
    const state = this.state;
    const seat = session.seat;
    if (!seat) throw new RoomServiceError('NOT_SEATED', '玩家尚未入座');
    const now = this.now();
    switch (type) {
      case 'start-hand':
        if (session.playerId !== state.hostId) throw new RoomServiceError('NOT_HOST', '只有房主可以开始');
        return startHand(state, this.random, now);
      case 'opening':
        {
          const opening = payload as Extract<CommandPayload, { readonly kind: 'normal' | 'stand' | 'reverse' }>;
          if (opening.kind !== 'normal' && opening.seat !== seat) throw new RoomServiceError('UNAUTHORIZED', '不能替其他玩家选择立棍');
          return resolveOpening(state, opening, now);
        }
      case 'play': {
        const play = payload as Extract<CommandPayload, { readonly cardIds: readonly string[] }>;
        return playCards(state, seat, play.cardIds, play.declaration, now);
      }
      case 'pass':
        return passTurn(state, seat, now);
      case 'burst': {
        const burst = payload as { readonly kind: HandKind };
        return declareBurst(state, seat, burst.kind, now);
      }
      case 'restart':
        if (session.playerId !== state.hostId) throw new RoomServiceError('NOT_HOST', '只有房主可以重新开始');
        return resetRoom(state);
      case 'end-room':
        if (session.playerId !== state.hostId) throw new RoomServiceError('NOT_HOST', '只有房主可以结束房间');
        return endRoom(state);
      case 'activity':
        return markActivity(state, seat, now);
      case 'remove-player': {
        if (session.playerId !== state.hostId) throw new RoomServiceError('NOT_HOST', '只有房主可以移除玩家');
        const target = payload as Extract<CommandPayload, { readonly seat: import('../../shared/src/scoring').Seat }>;
        const targetPlayer = state.players[target.seat];
        const next = removePlayer(state, target.seat);
        if (targetPlayer) this.sessions.clearSeatForPlayer(targetPlayer.id);
        return next;
      }
      default:
        throw new RoomServiceError('INVALID_COMMAND', '命令类型不支持');
    }
  }

  private emptyPublicSnapshot(): PublicSnapshot {
    return {
      roomId: '414',
      phase: 'lobby',
      handNumber: 0,
      version: 0,
      players: [],
      hostSeat: null,
      levels: { AC: '3', BD: '3' },
      completedRounds: { AC: 0, BD: 0 },
      candidateLeader: null,
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

  private wrapGameError(error: unknown): Error {
    if (error instanceof GameStateError) return new RoomServiceError(error.code, error.message);
    if (error instanceof Error) return error;
    return new RoomServiceError('COMMAND_FAILED', '命令执行失败');
  }
}
