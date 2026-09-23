const { getSocketUrl } = require('./config');
const { EVENTS, requestId } = require('./protocol');

class MiniProgramTransport {
  constructor(options = {}) {
    this.url = options.url || getSocketUrl();
    this.gameId = '414';
    this.socketTask = null;
    this.opened = false;
    this.connecting = null;
    this.pending = new Map();
    this.snapshotListeners = new Set();
    this.replacedListeners = new Set();
    this.lastActivityAt = 0;
  }

  selectGame(gameId) {
    this.gameId = gameId === 'texas' ? 'texas' : '414';
  }

  connect() {
    if (this.opened) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message) => {
        if (settled) return;
        settled = true;
        this.connecting = null;
        reject(new Error(message || '实时连接失败'));
      };

      this.socketTask = wx.connectSocket({
        url: this.url,
        success: () => undefined,
        fail: (error) => fail(error?.errMsg || '实时连接失败'),
      });

      this.socketTask.onOpen(() => {
        this.opened = true;
        this.connecting = null;
        settled = true;
        resolve();
      });
      this.socketTask.onMessage((message) => this.handleMessage(message.data));
      this.socketTask.onError((error) => {
        if (!settled) fail(error?.errMsg || '实时连接失败');
      });
      this.socketTask.onClose(() => {
        this.opened = false;
        this.connecting = null;
        this.rejectPending(new Error('实时连接已断开'));
      });
    });
    return this.connecting;
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.event === 'ack' && message.requestId) {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      clearTimeout(pending.timer);
      if (message.payload?.ok) pending.resolve(message.payload);
      else pending.reject(new Error(message.payload?.error || '操作失败'));
      return;
    }
    if (message.event === EVENTS.snapshot) {
      this.snapshotListeners.forEach((listener) => listener(message.payload));
      return;
    }
    if (message.event === EVENTS.replaced) {
      this.replacedListeners.forEach((listener) => listener());
    }
  }

  rejectPending(error) {
    this.pending.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(error);
    });
    this.pending.clear();
  }

  send(event, payload) {
    return this.connect().then(() => new Promise((resolve, reject) => {
      const id = requestId();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('请求超时，请检查网络连接'));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socketTask.send({
        data: JSON.stringify({ event, requestId: id, payload }),
        fail: (error) => {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(error?.errMsg || '消息发送失败'));
        },
      });
    }));
  }

  login(inviteCode, sessionToken) {
    const payload = sessionToken ? { sessionToken, gameId: this.gameId } : { inviteCode, gameId: this.gameId };
    return this.send(EVENTS.login, payload);
  }

  join(nickname, roomId) {
    return this.send(EVENTS.join, { nickname, roomId, gameId: this.gameId }).then((result) => result.snapshot);
  }

  leave() {
    return this.send(EVENTS.leave, {}).then(() => this.close());
  }

  command(command) {
    return this.send(EVENTS.command, command);
  }

  chat(payload) {
    return this.send(EVENTS.chat, payload);
  }
  activity() {
    const now = Date.now();
    if (now - this.lastActivityAt < 2500) return;
    this.lastActivityAt = now;
    void this.send(EVENTS.activity, {}).catch(() => undefined);
  }

  subscribe(listener) {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onReplaced(listener) {
    this.replacedListeners.add(listener);
    return () => this.replacedListeners.delete(listener);
  }

  close() {
    this.rejectPending(new Error('实时连接已关闭'));
    this.opened = false;
    this.connecting = null;
    this.socketTask?.close();
    this.socketTask = null;
  }
}

module.exports = {
  MiniProgramTransport,
};
