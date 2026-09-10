import express from 'express';
import { createServer as createHttpServer, Server as NodeHttpServer } from 'node:http';
import { Server as SocketServer, Socket } from 'socket.io';
import { EVENTS, isCommandEnvelope } from '../../shared/src/protocol';
import { createHttpApp } from './http';
import { loadConfig, ServerConfig } from './config';
import { RoomService } from './room-service';

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
  const socketsByToken = new Map<string, Set<Socket>>();
  const socketsById = new Map<string, Socket>();

  const sendSnapshots = () => {
    for (const [sessionToken, sockets] of socketsByToken) {
      try {
        const snapshot = roomService.getSnapshot(sessionToken);
        for (const socket of sockets) socket.emit(EVENTS.snapshot, snapshot);
      } catch {
        socketsByToken.delete(sessionToken);
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

  io.on('connection', (socket) => {
    socket.on(EVENTS.login, (payload: { inviteCode?: string; sessionToken?: string }, ack: unknown) => {
      try {
        const auth = payload?.sessionToken
          ? roomService.resume(payload.sessionToken)
          : roomService.login(payload?.inviteCode ?? '');
        socket.data.sessionToken = auth.sessionToken;
        const attachment = roomService.attach(auth.sessionToken, socket.id);
        if (attachment.previousConnectionId) {
          const previousSocket = socketsById.get(attachment.previousConnectionId);
          previousSocket?.emit(EVENTS.replaced);
          previousSocket?.disconnect(true);
        }
        addSocket(auth.sessionToken, socket);
        acknowledge(ack, { ok: true, ...auth });
      } catch (error) {
        acknowledge(ack, { ok: false, error: error instanceof Error ? error.message : '登录失败' });
      }
    });

    socket.on(EVENTS.join, (payload: { sessionToken?: string; nickname?: string; roomId?: string }, ack: unknown) => {
      try {
        const sessionToken = payload?.sessionToken ?? socket.data.sessionToken;
        const snapshot = roomService.join(sessionToken, payload?.nickname ?? '', payload?.roomId ?? '');
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
