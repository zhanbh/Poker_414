/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/src/protocol';
import { SocketClientTransport } from '../src/transport/socket-client';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

type FakeSocket = {
  connected: boolean;
  emit: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

describe('SocketClientTransport 房间切换', () => {
  let socket: FakeSocket;

  beforeEach(() => {
    socket = {
      connected: true,
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    socket.connect.mockImplementation(() => { socket.connected = true; });
    socket.disconnect.mockImplementation(() => { socket.connected = false; });
    socket.emit.mockImplementation((event: string, ...args: unknown[]) => {
      const ack = args.at(-1);
      if (typeof ack !== 'function') return;
      if (event === EVENTS.leave) {
        socket.connected = false;
        ack({ ok: true });
      } else if (event === EVENTS.login) {
        ack(socket.connected
          ? { ok: true, sessionToken: 'new-session', playerId: 'player-b' }
          : { ok: false, error: 'socket disconnected' });
      }
    });
    vi.mocked(io).mockReturnValue(socket as never);
  });

  it('退出一个房间后可以重新连接并进入另一个玩法', async () => {
    const transport = new SocketClientTransport('http://test.local');

    await transport.leave();
    transport.selectGame('texas');

    await expect(transport.login('inner-414')).resolves.toEqual({
      sessionToken: 'new-session',
      playerId: 'player-b',
    });
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenLastCalledWith(
      EVENTS.login,
      { inviteCode: 'inner-414', gameId: 'texas' },
      expect.any(Function),
    );
  });
});
