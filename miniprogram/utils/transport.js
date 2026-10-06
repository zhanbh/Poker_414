const { CLOUDRUN_SERVICE, SOCKET_PATH } = require('./config');
const { EVENTS, requestId } = require('./protocol');

class MiniProgramTransport {
  constructor(options = {}) {
    this.service = options.service || CLOUDRUN_SERVICE;
    this.path = options.path || SOCKET_PATH;
    this.gameId = '414';
    this.socketTask = null;
    this.opened = false;
    this.connecting = null;
    this.cancelConnect = null;
    this.connectionGeneration = 0;
    this.keepAliveTimer = null;
    this.pending = new Map();
    this.snapshotListeners = new Set();
    this.replacedListeners = new Set();
    this.lastActivityAt = 0;
  }

  selectGame(gameId) {
    this.gameId = gameId === 'mahjong' ? gameId : '414';
  }

  connect() {
    if (this.opened) return Promise.resolve();
    if (this.connecting) return this.connecting;
    if (!wx.cloud || typeof wx.cloud.connectContainer !== 'function') {
      return Promise.reject(new Error('当前微信基础库不支持 CloudBase WebSocket，请升级后重试'));
    }

    const generation = this.connectionGeneration;
    let connectionPromise;
    let cancel;
    connectionPromise = new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message) => {
        if (settled) return;
        settled = true;
        if (this.connecting === connectionPromise) this.connecting = null;
        if (this.cancelConnect === cancel) this.cancelConnect = null;
        reject(new Error(message || '实时连接失败'));
      };

      cancel = () => fail('实时连接已关闭');
      this.cancelConnect = cancel;

      Promise.resolve().then(() => wx.cloud.connectContainer({
        service: this.service,
        path: this.path,
      })).then(({ socketTask } = {}) => {
        if (!socketTask) {
          fail('CloudBase 未返回 WebSocket 连接，请检查云托管服务配置');
          return;
        }
        if (generation !== this.connectionGeneration) {
          socketTask.close();
          fail('实时连接已关闭');
          return;
        }

        this.socketTask = socketTask;
        socketTask.onOpen(() => {
          this.opened = true;
          if (this.connecting === connectionPromise) this.connecting = null;
          if (this.cancelConnect === cancel) this.cancelConnect = null;
          settled = true;
          resolve();
        });
        socketTask.onMessage((message) => this.handleMessage(message.data));
        socketTask.onError((error) => {
          if (!settled) fail(error?.errMsg || '实时连接失败');
        });
        socketTask.onClose(() => {
          this.opened = false;
          this.stopKeepAlive();
          if (this.socketTask === socketTask) this.socketTask = null;
          if (!settled) fail('实时连接已断开');
          else if (this.connecting === connectionPromise) this.connecting = null;
          this.rejectPending(new Error('实时连接已断开'));
        });
      }).catch((error) => {
        fail(error?.errMsg || error?.message || 'CloudBase WebSocket 连接失败');
      });
    });
    this.connecting = connectionPromise;
    return connectionPromise;
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
    return this.send(EVENTS.login, payload).then((result) => {
      this.startKeepAlive();
      return result;
    });
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

  startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.opened) void this.send(EVENTS.activity, {}).catch(() => undefined);
    }, 25_000);
  }

  stopKeepAlive() {
    if (!this.keepAliveTimer) return;
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
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
    this.connectionGeneration += 1;
    this.cancelConnect?.();
    this.stopKeepAlive();
    this.rejectPending(new Error('实时连接已关闭'));
    this.opened = false;
    this.connecting = null;
    const socketTask = this.socketTask;
    this.socketTask = null;
    socketTask?.close();
  }
}

module.exports = {
  MiniProgramTransport,
};
