import { randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createServer, RunningServer } from '../src/index';
import { EVENTS, MINI_PROGRAM_SOCKET_PATH, RoomSnapshot } from '../../shared/src/protocol';

interface AckPayload {
  readonly ok: boolean;
  readonly error?: string;
  readonly snapshot?: RoomSnapshot;
  readonly sessionToken?: string;
  readonly playerId?: string;
}

interface WireMessage {
  readonly event?: string;
  readonly requestId?: string;
  readonly payload?: AckPayload | RoomSnapshot | null;
}

const runningServers: RunningServer[] = [];
const openSockets: WebSocket[] = [];

async function startServer(): Promise<{ running: RunningServer; url: string }> {
  const running = createServer({
    inviteCode: 'inner-414',
    host: '127.0.0.1',
    port: 0,
    clientDist: '',
    presenceScanMs: 60_000,
  });
  runningServers.push(running);
  await new Promise<void>((resolve) => running.httpServer.listen(0, '127.0.0.1', resolve));
  const address = running.httpServer.address() as AddressInfo;
  return { running, url: 'ws://127.0.0.1:' + address.port + MINI_PROGRAM_SOCKET_PATH };
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    openSockets.push(socket);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function waitForMessage(socket: WebSocket, predicate: (message: WireMessage) => boolean): Promise<WireMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('等待小程序 WebSocket 消息超时'));
    }, 2_000);
    const onMessage = (data: Buffer) => {
      let message: WireMessage;
      try {
        message = JSON.parse(data.toString()) as WireMessage;
      } catch {
        return;
      }
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

async function request(socket: WebSocket, event: string, payload: unknown): Promise<AckPayload> {
  const requestId = randomUUID();
  const result = waitForMessage(socket, (message) => message.event === 'ack' && message.requestId === requestId);
  socket.send(JSON.stringify({ event, requestId, payload }));
  const response = (await result).payload;
  if (!response || typeof response !== 'object' || !('ok' in response)) {
    throw new Error('小程序 WebSocket ACK 格式无效');
  }
  return response;
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

afterEach(async () => {
  await Promise.all(openSockets.splice(0).map(closeSocket));
  await Promise.all(runningServers.splice(0).map((running) => running.close()));
});

describe('微信小程序原生 WebSocket 通道', () => {
  it('支持邀请码登录、入房和四人开局，并广播公共快照', async () => {
    const { url } = await startServer();
    const sockets = await Promise.all([1, 2, 3, 4].map(() => connect(url)));
    const snapshots: RoomSnapshot[] = [];

    for (const [index, socket] of sockets.entries()) {
      const auth = await request(socket, EVENTS.login, { inviteCode: 'inner-414' });
      expect(auth.ok).toBe(true);
      const joined = await request(socket, EVENTS.join, { nickname: '玩家' + (index + 1), roomId: '414' });
      expect(joined.snapshot).toBeDefined();
      snapshots.push(joined.snapshot!);
    }

    expect(snapshots[3].public.players).toHaveLength(4);
    const broadcast = waitForMessage(sockets[1], (message) => {
      const payload = message.payload;
      return message.event === EVENTS.snapshot
        && Boolean(payload && 'public' in payload && payload.public.handNumber === 1);
    });
    const start = snapshots[3];
    const command = {
      type: 'start-hand',
      requestId: randomUUID(),
      handNumber: start.public.handNumber,
      stateVersion: start.public.version,
      payload: {},
    };
    const result = await request(sockets[0], EVENTS.command, command);

    expect(result.ok).toBe(true);
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot!.public.handNumber).toBe(1);
    const broadcastPayload = (await broadcast).payload;
    expect(broadcastPayload && 'public' in broadcastPayload ? broadcastPayload.public.handNumber : null).toBe(1);
  });

  it('拒绝错误邀请码且不会创建房间', async () => {
    const { running, url } = await startServer();
    const socket = await connect(url);
    const result = await request(socket, EVENTS.login, { inviteCode: 'wrong' });

    expect(result).toEqual({ ok: false, error: '邀请码错误' });
    expect(running.roomService.hasRoom()).toBe(false);
  });

  it('游戏中连接断开后向仍在线客户端广播断开状态', async () => {
    const { url } = await startServer();
    const sockets = await Promise.all([1, 2, 3, 4].map(() => connect(url)));
    const snapshots: RoomSnapshot[] = [];

    for (const [index, socket] of sockets.entries()) {
      await request(socket, EVENTS.login, { inviteCode: 'inner-414' });
      const joined = await request(socket, EVENTS.join, { nickname: '玩家' + (index + 1), roomId: '414' });
      snapshots.push(joined.snapshot!);
    }

    const start = snapshots[3];
    const update = waitForMessage(sockets[1], (message) => {
      const payload = message.payload;
      if (message.event !== EVENTS.snapshot || !payload || !('public' in payload)) return false;
      return payload.public.players.find((player) => player.seat === 'A')?.connected === false;
    });
    await request(sockets[0], EVENTS.command, {
      type: 'start-hand', requestId: randomUUID(), handNumber: start.public.handNumber,
      stateVersion: start.public.version, payload: {},
    });
    await closeSocket(sockets[0]);

    const disconnected = await update;
    const payload = disconnected.payload;
    expect(payload && 'public' in payload ? payload.public.players.find((player) => player.seat === 'A')?.connected : null).toBe(false);
  });
});
