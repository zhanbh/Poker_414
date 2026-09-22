import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io, Socket } from 'socket.io-client';
import { createServer, RunningServer } from '../src/index';
import { EVENTS } from '../../shared/src/protocol';

const servers: RunningServer[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.disconnect());
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function connect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
    socket.connect();
  });
}

describe('多玩法 Socket 路由', () => {
  it('使用 gameId=texas 时进入德州扑克房间服务', async () => {
    const server = createServer({
      inviteCode: 'inner-414',
      host: '127.0.0.1',
      port: 0,
      clientDist: '',
      presenceScanMs: 60_000,
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
    const address = server.httpServer.address() as AddressInfo;
    const socket = io('http://127.0.0.1:' + address.port, { autoConnect: false, transports: ['websocket'] });
    sockets.push(socket);
    await connect(socket);

    const auth = await new Promise<{ ok: boolean; sessionToken?: string }>((resolve) => {
      socket.emit(EVENTS.login, { inviteCode: 'inner-414', gameId: 'texas' }, resolve);
    });
    expect(auth.ok).toBe(true);

    const joined = await new Promise<{ ok: boolean; snapshot?: { public: { gameId?: string } } }>((resolve) => {
      socket.emit(EVENTS.join, { nickname: '甲', roomId: 'texas', gameId: 'texas' }, resolve);
    });
    expect(joined.ok).toBe(true);
    expect(joined.snapshot?.public.gameId).toBe('texas');
    expect(server.texasRoomService.sessions.listSpectators()).toHaveLength(0);
  });
});
