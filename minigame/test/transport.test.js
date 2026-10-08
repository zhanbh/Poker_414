const { GameTransport } = require('../src/transport');

function createSocket() {
  const callbacks = {};
  const socket = {
    sent: [],
    onOpen(callback) { callbacks.open = callback; },
    onMessage(callback) { callbacks.message = callback; },
    onError(callback) { callbacks.error = callback; },
    onClose(callback) { callbacks.close = callback; },
    send({ data }) { this.sent.push(JSON.parse(data)); },
    close() { callbacks.close?.(); },
    open() { callbacks.open?.(); },
    reply(message) { callbacks.message?.({ data: JSON.stringify(message) }); },
  };
  return socket;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('native mini-game WebSocket transport', () => {
  it('falls back from CloudBase and completes the existing login/join protocol', async () => {
    const socket = createSocket();
    let directConnectionCount = 0;
    const wxApi = {
      cloud: { connectContainer: () => Promise.reject(new Error('unsupported in game runtime')) },
      connectSocket: () => { directConnectionCount += 1; return socket; },
    };
    const transport = new GameTransport(wxApi);

    const loginPromise = transport.login('308');
    await flush();
    socket.open();
    await flush();
    const loginRequest = socket.sent.shift();
    expect(loginRequest.event).toBe('auth:login');
    expect(loginRequest.payload).toMatchObject({ inviteCode: '308', gameId: 'mahjong' });
    socket.reply({ event: 'ack', requestId: loginRequest.requestId, payload: { ok: true, sessionToken: 'session-1' } });
    await expect(loginPromise).resolves.toMatchObject({ sessionToken: 'session-1' });

    const snapshot = { public: { gameId: 'mahjong', phase: 'lobby' }, private: { seat: 'A' } };
    const joinPromise = transport.join('玩家一');
    await flush();
    const joinRequest = socket.sent.shift();
    expect(joinRequest.event).toBe('room:join');
    expect(joinRequest.payload).toMatchObject({ nickname: '玩家一', roomId: 'mahjong', gameId: 'mahjong' });
    socket.reply({ event: 'ack', requestId: joinRequest.requestId, payload: { ok: true, snapshot } });
    await expect(joinPromise).resolves.toEqual(snapshot);
    expect(directConnectionCount).toBe(1);
    transport.close();
  });

  it('passes avatarUrl in join payload when available', async () => {
    const socket = createSocket();
    const wxApi = {
      connectSocket: () => socket,
    };
    const transport = new GameTransport(wxApi);
    const loginPromise = transport.login('308');
    await flush();
    socket.open();
    await flush();
    const loginReq = socket.sent.shift();
    socket.reply({ event: 'ack', requestId: loginReq.requestId, payload: { ok: true, sessionToken: 's-1' } });
    await loginPromise;

    const snapshot = { public: { gameId: 'mahjong', phase: 'lobby' }, private: { seat: 'A' } };
    const joinPromise = transport.join('雀友1234', 'https://avatar.url/pic.png');
    await flush();
    const joinReq = socket.sent.shift();
    expect(joinReq.payload).toMatchObject({
      nickname: '雀友1234',
      avatarUrl: 'https://avatar.url/pic.png',
      roomId: 'mahjong',
      gameId: 'mahjong',
    });
    socket.reply({ event: 'ack', requestId: joinReq.requestId, payload: { ok: true, snapshot } });
    await expect(joinPromise).resolves.toEqual(snapshot);
    transport.close();
  });
});
