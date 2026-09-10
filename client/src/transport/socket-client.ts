import { io, Socket } from 'socket.io-client';
import { EVENTS, CommandEnvelope, RoomSnapshot } from '../../../shared/src/protocol';

export interface AuthResult {
  readonly sessionToken: string;
  readonly playerId: string;
}

export interface ClientTransport {
  login(inviteCode: string, sessionToken?: string): Promise<AuthResult>;
  join(nickname: string, roomId: string): Promise<RoomSnapshot>;
  command(command: CommandEnvelope): Promise<{ readonly ok: true; readonly snapshot: RoomSnapshot }>;
  activity(): void;
  subscribe(listener: (snapshot: RoomSnapshot) => void): () => void;
  onReplaced(listener: () => void): () => void;
}

type AcknowledgeResult = { ok: boolean; snapshot?: RoomSnapshot; error?: string; sessionToken?: string; playerId?: string };

export class SocketClientTransport implements ClientTransport {
  private readonly socket: Socket;

  constructor(url = window.location.origin) {
    this.socket = io(url, { autoConnect: true });
  }

  login(inviteCode: string, sessionToken?: string): Promise<AuthResult> {
    return new Promise((resolve, reject) => {
      const payload = sessionToken ? { sessionToken } : { inviteCode };
      this.socket.emit(EVENTS.login, payload, (result: AcknowledgeResult) => {
        if (result?.ok && result.sessionToken && result.playerId) {
          resolve({ sessionToken: result.sessionToken, playerId: result.playerId });
        } else {
          reject(new Error(result?.error ?? '登录失败'));
        }
      });
    });
  }

  join(nickname: string, roomId: string): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit(EVENTS.join, { nickname, roomId }, (result: AcknowledgeResult) => {
        if (result?.ok && result.snapshot) resolve(result.snapshot);
        else reject(new Error(result?.error ?? '入房失败'));
      });
    });
  }

  command(command: CommandEnvelope): Promise<{ readonly ok: true; readonly snapshot: RoomSnapshot }> {
    return new Promise((resolve, reject) => {
      this.socket.emit(EVENTS.command, command, (result: { ok: boolean; snapshot?: RoomSnapshot; error?: string }) => {
        if (result?.ok && result.snapshot) resolve({ ok: true, snapshot: result.snapshot });
        else reject(new Error(result?.error ?? '命令失败'));
      });
    });
  }

  activity(): void {
    this.socket.emit(EVENTS.activity);
  }

  subscribe(listener: (snapshot: RoomSnapshot) => void): () => void {
    this.socket.on(EVENTS.snapshot, listener);
    return () => this.socket.off(EVENTS.snapshot, listener);
  }

  onReplaced(listener: () => void): () => void {
    this.socket.on(EVENTS.replaced, listener);
    return () => this.socket.off(EVENTS.replaced, listener);
  }
}

export function createSocketClient(url?: string): ClientTransport {
  return new SocketClientTransport(url);
}
