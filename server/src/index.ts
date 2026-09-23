import express from 'express';
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, Server as NodeHttpServer } from 'node:http';
import { Server as SocketServer, Socket } from 'socket.io';
import { WebSocket, WebSocketServer } from 'ws';
import {
  AnyCommandEnvelope,
  CommandEnvelope,
  EVENTS,
  GameId,
  GameSnapshot,
  isCommandEnvelope,
  isTexasCommandEnvelope,
  MINI_PROGRAM_SOCKET_PATH,
  TexasCommandEnvelope,
  RoomChatPayload,
} from '../../shared/src/protocol';
import { createHttpApp } from './http';
import { loadConfig, ServerConfig } from './config';
import { RoomService } from './room-service';
import { TexasRoomService } from './texas-room-service';

interface MiniProgramSocketState {
  readonly id: string;
  readonly socket: WebSocket;
  sessionToken?: string;
  gameId?: GameId;
}

interface MiniProgramMessage {
  readonly event?: unknown;
  readonly requestId?: unknown;
  readonly payload?: unknown;
}

type GameService = RoomService | TexasRoomService;

export interface RunningServer {
  readonly app: ReturnType<typeof createHttpApp>;
  readonly httpServer: NodeHttpServer;
  readonly io: SocketServer;
  readonly roomService: RoomService;
  readonly texasRoomService: TexasRoomService;
  close(): Promise<void>;
}

function acknowledge(ack: unknown, value: unknown): void {
  if (typeof ack === 'function') (ack as (result: unknown) => void)(value);
}

function commandFor(gameId: GameId, value: unknown): AnyCommandEnvelope {
  if (gameId === 'texas') {
    if (!isTexasCommandEnvelope(value)) throw new Error('德州扑克命令格式无效');
    return value;
  }
  if (!isCommandEnvelope(value)) throw new Error('命令格式无效');
  return value;
}

export function createServer(config: ServerConfig = loadConfig()): RunningServer {
  const roomService = new RoomService({ inviteCode: config.inviteCode });
  const texasRoomService = new TexasRoomService({ inviteCode: config.inviteCode });
  const app = createHttpApp(roomService, config.clientDist);
  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, { cors: { origin: false } });
  const miniProgramSocketServer = new WebSocketServer({ noServer: true });
  const socketsByToken = new Map<string, Set<Socket>>();
  const socketsById = new Map<string, Socket>();
  const miniSocketsByToken = new Map<string, Set<MiniProgramSocketState>>();
  const miniSocketsById = new Map<string, MiniProgramSocketState>();
  const gameByToken = new Map<string, GameId>();

  const serviceFor = (gameId: GameId): GameService => gameId === 'texas' ? texasRoomService : roomService;
  const gameIdForToken = (sessionToken: string): GameId => gameByToken.get(sessionToken) ?? '414';

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

  const addMiniSocket = (state: MiniProgramSocketState, sessionToken: string, gameId: GameId) => {
    if (state.sessionToken && state.sessionToken !== sessionToken) removeMiniSocket(state);
    state.sessionToken = sessionToken;
    state.gameId = gameId;
    gameByToken.set(sessionToken, gameId);
    if (!miniSocketsByToken.has(sessionToken)) miniSocketsByToken.set(sessionToken, new Set());
    miniSocketsByToken.get(sessionToken)!.add(state);
    miniSocketsById.set(state.id, state);
  };

  const sendSnapshots = () => {
    for (const [sessionToken, sockets] of socketsByToken) {
      try {
        const snapshot = serviceFor(gameIdForToken(sessionToken)).getSnapshot(sessionToken) as GameSnapshot;
        for (const socket of sockets) socket.emit(EVENTS.snapshot, snapshot);
      } catch {
        socketsByToken.delete(sessionToken);
      }
    }
    for (const [sessionToken, sockets] of miniSocketsByToken) {
      try {
        const snapshot = serviceFor(gameIdForToken(sessionToken)).getSnapshot(sessionToken) as GameSnapshot;
        for (const state of sockets) sendMiniMessage(state.socket, EVENTS.snapshot, snapshot);
      } catch {
        for (const state of sockets) state.socket.close();
        miniSocketsByToken.delete(sessionToken);
      }
    }
  };

  const addSocket = (sessionToken: string, socket: Socket, gameId: GameId) => {
    gameByToken.set(sessionToken, gameId);
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
        const payload = (message.payload ?? {}) as { inviteCode?: string; sessionToken?: string; gameId?: GameId };
        const gameId = payload.gameId === 'texas' ? 'texas' : '414';
        const service = serviceFor(gameId);
        const auth = payload.sessionToken ? service.resume(payload.sessionToken) : service.login(payload.inviteCode ?? '');
        const attachment = service.attach(auth.sessionToken, state.id);
        if (attachment.previousConnectionId) notifyReplaced(attachment.previousConnectionId);
        addMiniSocket(state, auth.sessionToken, gameId);
        acknowledgeMini(state, requestId, { ok: true, ...auth });
        return;
      }

      if (event === EVENTS.join) {
        const payload = (message.payload ?? {}) as { sessionToken?: string; nickname?: string; roomId?: string; gameId?: GameId };
        const sessionToken = payload.sessionToken ?? state.sessionToken;
        if (!sessionToken) throw new Error('请先登录');
        const gameId = payload.gameId === 'texas' || state.gameId === 'texas' ? 'texas' : gameIdForToken(sessionToken);
        const service = serviceFor(gameId);
        const snapshot = service.join(sessionToken, payload.nickname ?? '', payload.roomId ?? (gameId === 'texas' ? 'texas' : '414'));
        addMiniSocket(state, sessionToken, gameId);
        acknowledgeMini(state, requestId, { ok: true, snapshot });
        sendSnapshots();
        return;
      }

      const sessionToken = state.sessionToken;
      if (!sessionToken) throw new Error('请先登录');
      const gameId = state.gameId ?? gameIdForToken(sessionToken);
      const service = serviceFor(gameId);
      if (!service.isConnectionOwner(sessionToken, state.id)) throw new Error('当前连接已失去操作权');

      if (event === EVENTS.leave) {
        service.leave(sessionToken);
        acknowledgeMini(state, requestId, { ok: true });
        sendSnapshots();
        state.socket.close();
        return;
      }

      if (event === EVENTS.command) {
        const command = commandFor(gameId, message.payload);
        const result = gameId === 'texas'
          ? texasRoomService.dispatch(sessionToken, command as TexasCommandEnvelope)
          : roomService.dispatch(sessionToken, command as CommandEnvelope);
        acknowledgeMini(state, requestId, result);
        sendSnapshots();
        return;
      }

      if (event === EVENTS.chat) {
        const chatMessage = service.recordChat(sessionToken, message.payload as RoomChatPayload);
        acknowledgeMini(state, requestId, { ok: true, message: chatMessage });
        sendSnapshots();
        return;
      }
      if (event === EVENTS.activity) {
        const snapshot = service.recordActivity(sessionToken);
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
    socket.on(EVENTS.login, (payload: { inviteCode?: string; sessionToken?: string; gameId?: GameId }, ack: unknown) => {
      try {
        const gameId = payload?.gameId === 'texas' ? 'texas' : '414';
        const service = serviceFor(gameId);
        const auth = payload?.sessionToken ? service.resume(payload.sessionToken) : service.login(payload?.inviteCode ?? '');
        socket.data.sessionToken = auth.sessionToken;
        socket.data.gameId = gameId;
        const attachment = service.attach(auth.sessionToken, socket.id);
        if (attachment.previousConnectionId) notifyReplaced(attachment.previousConnectionId);
        addSocket(auth.sessionToken, socket, gameId);
        acknowledge(ack, { ok: true, ...auth });
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '登录失败' });
      }
    });

    socket.on(EVENTS.join, (payload: { sessionToken?: string; nickname?: string; roomId?: string; gameId?: GameId }, ack: unknown) => {
      try {
        const sessionToken = payload?.sessionToken ?? socket.data.sessionToken;
        if (typeof sessionToken !== 'string') throw new Error('请先登录');
        const gameId = payload?.gameId === 'texas' || socket.data.gameId === 'texas' ? 'texas' : '414';
        const service = serviceFor(gameId);
        const snapshot = service.join(sessionToken, payload?.nickname ?? '', payload?.roomId ?? (gameId === 'texas' ? 'texas' : '414'));
        socket.data.sessionToken = sessionToken;
        socket.data.gameId = gameId;
        addSocket(sessionToken, socket, gameId);
        acknowledge(ack, { ok: true, snapshot });
        sendSnapshots();
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '入房失败' });
      }
    });

    socket.on(EVENTS.leave, (ack: unknown) => {
      try {
        const sessionToken = socket.data.sessionToken;
        if (typeof sessionToken !== 'string') throw new Error('请先登录');
        const gameId = socket.data.gameId === 'texas' ? 'texas' : gameIdForToken(sessionToken);
        const service = serviceFor(gameId);
        if (!service.isConnectionOwner(sessionToken, socket.id)) throw new Error('当前连接已失去操作权');
        service.leave(sessionToken);
        acknowledge(ack, { ok: true });
        sendSnapshots();
        socket.disconnect(true);
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '退出失败' });
      }
    });

    socket.on(EVENTS.command, (command: unknown, ack: unknown) => {
      try {
        const sessionToken = socket.data.sessionToken;
        if (typeof sessionToken !== 'string') throw new Error('请先登录');
        const gameId = socket.data.gameId === 'texas' ? 'texas' : gameIdForToken(sessionToken);
        const service = serviceFor(gameId);
        if (!service.isConnectionOwner(sessionToken, socket.id)) throw new Error('当前连接已失去操作权');
        const validCommand = commandFor(gameId, command);
        const result = gameId === 'texas'
          ? texasRoomService.dispatch(sessionToken, validCommand as TexasCommandEnvelope)
          : roomService.dispatch(sessionToken, validCommand as CommandEnvelope);
        acknowledge(ack, result);
        sendSnapshots();
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '命令失败' });
      }
    });

    socket.on(EVENTS.chat, (payload: RoomChatPayload, ack: unknown) => {
      try {
        const sessionToken = socket.data.sessionToken;
        if (typeof sessionToken !== 'string') throw new Error('请先登录');
        const gameId = socket.data.gameId === 'texas' ? 'texas' : gameIdForToken(sessionToken);
        const service = serviceFor(gameId);
        if (!service.isConnectionOwner(sessionToken, socket.id)) throw new Error('当前连接已失去操作权');
        const message = service.recordChat(sessionToken, payload);
        acknowledge(ack, { ok: true, message });
        sendSnapshots();
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '发送失败' });
      }
    });
    socket.on(EVENTS.activity, (ack: unknown) => {
      try {
        const sessionToken = socket.data.sessionToken;
        if (typeof sessionToken !== 'string') throw new Error('请先登录');
        const gameId = socket.data.gameId === 'texas' ? 'texas' : gameIdForToken(sessionToken);
        const service = serviceFor(gameId);
        if (!service.isConnectionOwner(sessionToken, socket.id)) throw new Error('当前连接已失去操作权');
        const snapshot = service.recordActivity(sessionToken);
        acknowledge(ack, { ok: true, snapshot });
        sendSnapshots();
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '活动上报失败' });
      }
    });

    socket.on('disconnect', () => {
      const sessionToken = socket.data.sessionToken;
      if (typeof sessionToken !== 'string') return;
      const gameId = socket.data.gameId === 'texas' ? 'texas' : gameIdForToken(sessionToken);
      serviceFor(gameId).disconnect(sessionToken, socket.id);
      removeSocket(sessionToken, socket);
      sendSnapshots();
    });
  });

  miniProgramSocketServer.on('connection', (socket) => {
    const state: MiniProgramSocketState = { id: 'mini-' + randomUUID(), socket };
    miniSocketsById.set(state.id, state);
    socket.on('message', (data) => handleMiniMessage(state, data.toString()));
    socket.on('close', () => {
      if (state.sessionToken) serviceFor(state.gameId ?? gameIdForToken(state.sessionToken)).disconnect(state.sessionToken, state.id);
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
    const changed = roomService.scan() || texasRoomService.scan();
    if (changed) sendSnapshots();
  }, config.presenceScanMs);
  presenceTimer.unref();

  return {
    app,
    httpServer,
    io,
    roomService,
    texasRoomService,
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
    console.log('414 server listening on ' + config.host + ':' + config.port);
  });
}
