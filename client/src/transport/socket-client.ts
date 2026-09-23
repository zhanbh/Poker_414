import { io, Socket } from 'socket.io-client';
import {
  AnyCommandEnvelope,
  EVENTS,
  GameId,
  GameSnapshot,
  RoomChatMessage,
  RoomChatPayload,
} from '../../../shared/src/protocol';

export interface AuthResult {
  readonly sessionToken: string;
  readonly playerId: string;
}

export interface ClientTransport {
  login(inviteCode: string, sessionToken?: string): Promise<AuthResult>;
  join(nickname: string, roomId: string): Promise<GameSnapshot>;
  leave(): Promise<void>;
  command(command: AnyCommandEnvelope): Promise<{ readonly ok: true; readonly snapshot: GameSnapshot }>;
  activity(): void;
  chat?(payload: RoomChatPayload): Promise<{ readonly ok: true; readonly message: RoomChatMessage }>;
  subscribe(listener: (snapshot: GameSnapshot) => void): () => void;
  onReplaced(listener: () => void): () => void;
  selectGame?(gameId: GameId): void;
}

type AcknowledgeResult = { ok: boolean; snapshot?: GameSnapshot; error?: string; sessionToken?: string; playerId?: string };

export class SocketClientTransport implements ClientTransport {
  private readonly socket: Socket;
  private gameId: GameId = '414';

  constructor(url = window.location.origin) {
    this.socket = io(url, { autoConnect: true });
  }

  selectGame(gameId: GameId): void {
    this.gameId = gameId;
  }

  login(inviteCode: string, sessionToken?: string): Promise<AuthResult> {
    return new Promise((resolve, reject) => {
      if (!this.socket.connected) this.socket.connect();
      const payload = sessionToken ? { sessionToken, gameId: this.gameId } : { inviteCode, gameId: this.gameId };
      this.socket.emit(EVENTS.login, payload, (result: AcknowledgeResult) => {
        if (result?.ok && result.sessionToken && result.playerId) {
          resolve({ sessionToken: result.sessionToken, playerId: result.playerId });
        } else {
          reject(new Error(result?.error ?? '登录失败'));
        }
      });
    });
  }

  join(nickname: string, roomId: string): Promise<GameSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit(EVENTS.join, { nickname, roomId, gameId: this.gameId }, (result: AcknowledgeResult) => {
        if (result?.ok && result.snapshot) resolve(result.snapshot);
        else reject(new Error(result?.error ?? '入房失败'));
      });
    });
  }

  leave(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.emit(EVENTS.leave, (result: { ok: boolean; error?: string }) => {
        if (result?.ok) {
          this.socket.disconnect();
          resolve();
        } else {
          reject(new Error(result?.error ?? '退出失败'));
        }
      });
    });
  }

  command(command: AnyCommandEnvelope): Promise<{ readonly ok: true; readonly snapshot: GameSnapshot }> {
    return new Promise((resolve, reject) => {
      this.socket.emit(EVENTS.command, command, (result: { ok: boolean; snapshot?: GameSnapshot; error?: string }) => {
        if (result?.ok && result.snapshot) resolve({ ok: true, snapshot: result.snapshot });
        else reject(new Error(result?.error ?? '命令失败'));
      });
    });
  }

  chat(payload: RoomChatPayload): Promise<{ readonly ok: true; readonly message: RoomChatMessage }> {
    return new Promise((resolve, reject) => {
      this.socket.emit(EVENTS.chat, payload, (result: { ok: boolean; message?: RoomChatMessage; error?: string }) => {
        if (result?.ok && result.message) resolve({ ok: true, message: result.message });
        else reject(new Error(result?.error ?? '发送失败'));
      });
    });
  }
  activity(): void {
    this.socket.emit(EVENTS.activity);
  }

  subscribe(listener: (snapshot: GameSnapshot) => void): () => void {
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
