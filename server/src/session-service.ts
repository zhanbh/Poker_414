import { randomBytes } from 'node:crypto';
import { Seat } from '../../shared/src/scoring';

export interface Session {
  readonly sessionToken: string;
  readonly playerId: string;
  role: 'player' | 'spectator' | null;
  nickname: string | null;
  seat: Seat | null;
  connectionId: string | null;
}

export class SessionService {
  private readonly sessions = new Map<string, Session>();

  create(): Session {
    const session: Session = {
      sessionToken: randomBytes(24).toString('hex'),
      playerId: randomBytes(12).toString('hex'),
      role: null,
      nickname: null,
      seat: null,
      connectionId: null,
    };
    this.sessions.set(session.sessionToken, session);
    return session;
  }

  get(sessionToken: string): Session {
    const session = this.sessions.get(sessionToken);
    if (!session) throw new Error('会话无效或已过期');
    return session;
  }

  setSeat(sessionToken: string, seat: Seat | null): void {
    this.get(sessionToken).seat = seat;
  }

  setIdentity(sessionToken: string, role: 'player' | 'spectator', nickname: string): void {
    const session = this.get(sessionToken);
    session.role = role;
    session.nickname = nickname;
  }

  clearIdentity(sessionToken: string): void {
    const session = this.get(sessionToken);
    session.role = null;
    session.nickname = null;
    session.seat = null;
  }

  attach(sessionToken: string, connectionId: string): { previousConnectionId: string | null } {
    const session = this.get(sessionToken);
    const previousConnectionId = session.connectionId;
    session.connectionId = connectionId;
    return { previousConnectionId };
  }

  detach(sessionToken: string, connectionId: string): boolean {
    const session = this.get(sessionToken);
    if (session.connectionId !== connectionId) return false;
    session.connectionId = null;
    return true;
  }

  findByPlayerId(playerId: string): Session | undefined {
    return [...this.sessions.values()].find((session) => session.playerId === playerId);
  }

  clearSeatForPlayer(playerId: string): void {
    const session = this.findByPlayerId(playerId);
    if (session) {
      session.seat = null;
      session.role = null;
      session.nickname = null;
    }
  }

  listSpectators(): Session[] {
    return [...this.sessions.values()].filter((session) => session.role === 'spectator');
  }
}
