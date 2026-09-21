import express from 'express';
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, Server as NodeHttpServer } from 'node:http';
import { Server as SocketServer, Socket } from 'socket.io';
import { WebSocket, WebSocketServer } from 'ws';
import { EVENTS, isCommandEnvelope, MINI_PROGRAM_SOCKET_PATH } from '../../shared/src/protocol';
import { createHttpApp } from './http';
import { loadConfig, ServerConfig } from './config';
import { RoomService } from './room-service';

interface MiniProgramSocketState {
  readonly id: string;
  readonly socket: WebSocket;
  sessionToken?: string;
}

interface MiniProgramMessage {
  readonly event?: unknown;
  readonly requestId?: unknown;
  readonly payload?: unknown;
}

export interface RunningServer {
  readonly app: ReturnType<typeof createHttpApp>;
  readonly httpServer: NodeHttpServer;
  readonly io: SocketServer;
  readonly roomService: RoomService;
  close(): Promise<void>;
}

function acknowledge(ack: unknown, value: unknown): void {
  if (typeof ack === 'function') (ack as (result: unknown) => void)(value);
}

export function createServer(config: ServerConfig = loadConfig()): RunningServer {
  const roomService = new RoomService({ inviteCode: config.inviteCode });
  const app = createHttpApp(roomService, config.clientDist);
  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, { cors: { origin: false } });
  const miniProgramSocketServer = new WebSocketServer({ noServer: true });
  const socketsByToken = new Map<string, Set<Socket>>();
  const socketsById = new Map<string, Socket>();
  const miniSocketsByToken = new Map<string, Set<MiniProgramSocketState>>();
  const miniSocketsById = new Map<string, MiniProgramSocketState>();

  const sendMiniMessage = (socket: WebSocket, event: string, payload: unknown, requestId?: string) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      event,
      ...(requestId ? { requestId } : {}),
      payload,
    }));
  };

  const removeMiniSocket = (state: MiniProgramSocketState) => {
    if (state.sessionToken) {
      miniSocketsByToken.get(state.sessionToken)?.delete(state);
      if (miniSocketsByToken.get(state.sessionToken)?.size === 0) miniSocketsByToken.delete(state.sessionToken);
    }
    miniSocketsById.delete(state.id);
  };

  const addMiniSocket = (state: MiniProgramSocketState, sessionToken: string) => {
    if (state.sessionToken && state.sessionToken !== sessionToken) removeMiniSocket(state);
    state.sessionToken = sessionToken;
    if (!miniSocketsByToken.has(sessionToken)) miniSocketsByToken.set(sessionToken, new Set());
    miniSocketsByToken.get(sessionToken)!.add(state);
    miniSocketsById.set(state.id, state);
  };

  const sendSnapshots = () => {
    for (const [sessionToken, sockets] of socketsByToken) {
      try {
        const snapshot = roomService.getSnapshot(sessionToken);
        for (const socket of sockets) socket.emit(EVENTS.snapshot, snapshot);
      } catch {
        socketsByToken.delete(sessionToken);
      }
    }
    for (const [sessionToken, sockets] of miniSocketsByToken) {
      try {
        const snapshot = roomService.getSnapshot(sessionToken);
        for (const state of sockets) sendMiniMessage(state.socket, EVENTS.snapshot, snapshot);
      } catch {
        for (const state of sockets) state.socket.close();
        miniSocketsByToken.delete(sessionToken);
      }
    }
  };

  const addSocket = (sessionToken: string, socket: Socket) => {
    if (!socketsByToken.has(sessionToken)) socketsByToken.set(sessionToken, new Set());
    socketsByToken.get(sessionToken)!.add(socket);
    socketsById.set(socket.id, socket);
  };

  const removeSocket = (sessionToken: string, socket: Socket) => {
    socketsByToken.get(sessionToken)?.delete(socket);
    if (socketsByToken.get(sessionToken)?.size === 0) socketsByToken.delete(sessionToken);
    socketsById.delete(socket.id);
  };

  const notifyReplaced = (connectionId: string) => {
    const previousSocket = socketsById.get(connectionId);
    if (previousSocket) {
      previousSocket.emit(EVENTS.replaced);
      previousSocket.disconnect(true);
      return;
    }
    const previousMiniSocket = miniSocketsById.get(connectionId);
    if (previousMiniSocket) {
      sendMiniMessage(previousMiniSocket.socket, EVENTS.replaced, null);
      previousMiniSocket.socket.close();
    }
  };

  const acknowledgeMini = (state: MiniProgramSocketState, requestId: string | undefined, result: unknown) => {
    sendMiniMessage(state.socket, 'ack', result, requestId);
  };

  const handleMiniMessage = (state: MiniProgramSocketState, raw: string) => {
    let message: MiniProgramMessage;
    try {
      message = JSON.parse(raw) as MiniProgramMessage;
    } catch {
      acknowledgeMini(state, undefined, { ok: false, error: '消息格式无效' });
      return;
    }

    const event = typeof message.event === 'string' ? message.event : '';
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    try {
      if (event === EVENTS.login) {
        const payload = (message.payload ?? {}) as { inviteCode?: string; sessionToken?: string };
        const auth = payload.sessionToken
          ? roomService.resume(payload.sessionToken)
          : roomService.login(payload.inviteCode ?? '');
        const attachment = roomService.attach(auth.sessionToken, state.id);
        if (attachment.previousConnectionId) notifyReplaced(attachment.previousConnectionId);
        addMiniSocket(state, auth.sessionToken);
        acknowledgeMini(state, requestId, { ok: true, ...auth });
        return;
      }

      if (event === EVENTS.join) {
        const payload = (message.payload ?? {}) as { sessionToken?: string; nickname?: string; roomId?: string; role?: 'player' | 'spectator' };
        const sessionToken = payload.sessionToken ?? state.sessionToken;
        if (!sessionToken) throw new Error('请先登录');
        const snapshot = roomService.join(sessionToken, payload.nickname ?? '', payload.roomId ?? '', payload.role ?? 'player');
        addMiniSocket(state, sessionToken);
        acknowledgeMini(state, requestId, { ok: true, snapshot });
        sendSnapshots();
        return;
      }

      if (event === EVENTS.command) {
        const sessionToken = state.sessionToken;
        if (!sessionToken || !roomService.isConnectionOwner(sessionToken, state.id)) {
          throw new Error('当前连接已失去操作权');
        }
        if (!isCommandEnvelope(message.payload)) throw new Error('命令格式无效');
        const result = roomService.dispatch(sessionToken, message.payload);
        acknowledgeMini(state, requestId, result);
        sendSnapshots();
        return;
      }

      if (event === EVENTS.activity) {
        const sessionToken = state.sessionToken;
        if (!sessionToken || !roomService.isConnectionOwner(sessionToken, state.id)) {
          throw new Error('当前连接已失去操作权');
        }
        const snapshot = roomService.recordActivity(sessionToken);
        acknowledgeMini(state, requestId, { ok: true, snapshot });
        sendSnapshots();
        return;
      }

      throw new Error('不支持的消息类型');
    } catch (error) {
      acknowledgeMini(state, requestId, { ok: false, error: error instanceof Error ? error.message : '操作失败' });
    }
  };

  io.on('connection', (socket) => {
    socket.on(EVENTS.login, (payload: { inviteCode?: string; sessionToken?: string }, ack: unknown) => {
      try {
        const auth = payload?.sessionToken
          ? roomService.resume(payload.sessionToken)
          : roomService.login(payload?.inviteCode ?? '');
        socket.data.sessionToken = auth.sessionToken;
        const attachment = roomService.attach(auth.sessionToken, socket.id);
        if (attachment.previousConnectionId) {
          notifyReplaced(attachment.previousConnectionId);
        }
        addSocket(auth.sessionToken, socket);
        acknowledge(ack, { ok: true, ...auth });
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '登录失败' });
      }
    });

    socket.on(EVENTS.join, (payload: { sessionToken?: string; nickname?: string; roomId?: string; role?: 'player' | 'spectator' }, ack: unknown) => {
      try {
        const sessionToken = payload?.sessionToken ?? socket.data.sessionToken;
        const snapshot = roomService.join(sessionToken, payload?.nickname ?? '', payload?.roomId ?? '', payload?.role ?? 'player');
        socket.data.sessionToken = sessionToken;
        addSocket(sessionToken, socket);
        acknowledge(ack, { ok: true, snapshot });
        sendSnapshots();
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '入房失败' });
      }
    });

    socket.on(EVENTS.command, (command: unknown, ack: unknown) => {
      try {
        const sessionToken = socket.data.sessionToken;
        if (typeof sessionToken !== 'string' || !roomService.isConnectionOwner(sessionToken, socket.id)) {
          throw new Error('当前连接已失去操作权');
        }
        if (!isCommandEnvelope(command)) throw new Error('命令格式无效');
        const result = roomService.dispatch(sessionToken, command);
        acknowledge(ack, result);
        sendSnapshots();
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '命令失败' });
      }
    });

    socket.on(EVENTS.activity, (ack: unknown) => {
      try {
        const sessionToken = socket.data.sessionToken;
        if (typeof sessionToken !== 'string' || !roomService.isConnectionOwner(sessionToken, socket.id)) throw new Error('当前连接已失去操作权');
        const snapshot = roomService.recordActivity(sessionToken);
        acknowledge(ack, { ok: true, snapshot });
        sendSnapshots();
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '活动上报失败' });
      }
    });

    socket.on('disconnect', () => {
      const sessionToken = socket.data.sessionToken;
      if (typeof sessionToken !== 'string') return;
      roomService.disconnect(sessionToken, socket.id);
      removeSocket(sessionToken, socket);
      sendSnapshots();
    });
  });

  miniProgramSocketServer.on('connection', (socket) => {
    const state: MiniProgramSocketState = { id: 'mini-' + randomUUID(), socket };
    miniSocketsById.set(state.id, state);
    socket.on('message', (data) => handleMiniMessage(state, data.toString()));
    socket.on('close', () => {
      if (state.sessionToken) roomService.disconnect(state.sessionToken, state.id);
      removeMiniSocket(state);
      sendSnapshots();
    });
    socket.on('error', () => undefined);
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://' + (request.headers.host ?? 'localhost'));
    if (url.pathname !== MINI_PROGRAM_SOCKET_PATH) return;
    socket.on('error', () => socket.destroy());
    miniProgramSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      miniProgramSocketServer.emit('connection', webSocket, request);
    });
  });

  const presenceTimer = setInterval(() => {
    if (roomService.scan()) sendSnapshots();
  }, config.presenceScanMs);
  presenceTimer.unref();

  return {
    app,
    httpServer,
    io,
    roomService,
    close: async () => {
      clearInterval(presenceTimer);
      await io.close();
      for (const socket of miniProgramSocketServer.clients) socket.close();
      await new Promise<void>((resolve, reject) => {
        miniProgramSocketServer.close((error) => error ? reject(error) : resolve());
      });
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

export function createApp() {
  return express();
}

if (require.main === module) {
  const config = loadConfig();
  const running = createServer(config);
  running.httpServer.listen(config.port, config.host, () => {
    console.log(`414 server listening on ${config.host}:${config.port}`);
  });
}
