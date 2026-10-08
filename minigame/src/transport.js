const { EVENTS, requestId } = require('./protocol');
const config = require('./config');

class GameTransport {
  constructor(wxApi = wx) {
    this.wx = wxApi;
    this.socketTask = null;
    this.opened = false;
    this.authenticated = false;
    this.connecting = null;
    this.sessionToken = '';
    this.pending = new Map();
    this.snapshotListeners = new Set();
    this.statusListeners = new Set();
    this.keepAliveTimer = null;
    this.lastActivityAt = 0;
  }

  connect() {
    if (this.opened) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.setStatus('connecting', '正在连接实时服务…');
    const attach = (socketTask) => new Promise((resolve, reject) => {
      if (!socketTask) { reject(new Error('未取得 WebSocket 连接')); return; }
      let opened = false;
      this.socketTask = socketTask;
      socketTask.onOpen(() => {
        opened = true;
        this.opened = true;
        this.setStatus('connected', '实时服务已连接');
        resolve();
      });
      socketTask.onMessage((message) => this.handleMessage(message.data));
      socketTask.onError((error) => {
        const message = error && error.errMsg || 'WebSocket 连接失败';
        if (!opened) reject(new Error(message));
        else this.setStatus('disconnected', message);
      });
      socketTask.onClose(() => {
        this.opened = false;
        this.authenticated = false;
        this.stopKeepAlive();
        if (this.socketTask === socketTask) this.socketTask = null;
        if (!opened) reject(new Error('实时连接已关闭'));
        this.rejectPending(new Error('实时连接已断开'));
        this.setStatus('disconnected', '实时连接已断开');
      });
    });
    this.connecting = (async () => {
      let cloudError;
      const cloud = this.wx.cloud;
      if (cloud && typeof cloud.connectContainer === 'function') {
        try {
          const result = await cloud.connectContainer({ service: config.cloudRunService, path: config.socketPath });
          await attach(result && result.socketTask);
          return;
        } catch (error) {
          cloudError = error;
          if (this.socketTask) {
            try { this.socketTask.close({ code: 1000 }); } catch { /* best-effort cleanup */ }
            this.socketTask = null;
          }
          this.opened = false;
        }
      }
      if (typeof this.wx.connectSocket !== 'function') {
        throw new Error(cloudError && cloudError.message || '当前小游戏环境不支持 WebSocket');
      }
      await attach(this.wx.connectSocket({ url: config.socketUrl, tcpNoDelay: true }));
    })().catch((error) => {
      this.setStatus('disconnected', error && error.message || 'WebSocket 连接失败');
      throw error;
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  setStatus(status, message) {
    this.statusListeners.forEach((listener) => listener(status, message));
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
      if (message.payload && message.payload.ok) pending.resolve(message.payload);
      else pending.reject(new Error(message.payload && message.payload.error || '操作失败'));
      return;
    }
    if (message.event === EVENTS.snapshot) {
      this.snapshotListeners.forEach((listener) => listener(message.payload));
    } else if (message.event === EVENTS.replaced) {
      this.statusListeners.forEach((listener) => listener('replaced', '该会话已在其他页面接管'));
    }
  }

  rejectPending(error) {
    this.pending.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(error);
    });
    this.pending.clear();
  }

  sendRaw(event, payload) {
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
          reject(new Error(error && error.errMsg || '消息发送失败'));
        },
      });
    }));
  }

  async ensureAuthenticated() {
    if (this.authenticated) return;
    if (!this.sessionToken) throw new Error('请先登录');
    const result = await this.sendRaw(EVENTS.login, { sessionToken: this.sessionToken, gameId: config.gameId });
    if (!result.sessionToken) throw new Error('登录状态已失效，请重新进入');
    this.sessionToken = result.sessionToken;
    this.authenticated = true;
    this.startKeepAlive();
  }

  async send(event, payload) {
    await this.connect();
    if (event !== EVENTS.login) await this.ensureAuthenticated();
    return this.sendRaw(event, payload);
  }

  async login(inviteCode, sessionToken) {
    this.sessionToken = sessionToken || '';
    const result = await this.sendRaw(EVENTS.login, sessionToken
      ? { sessionToken, gameId: config.gameId }
      : { inviteCode, gameId: config.gameId });
    this.sessionToken = result.sessionToken || '';
    this.authenticated = Boolean(this.sessionToken);
    if (this.authenticated) this.startKeepAlive();
    return result;
  }

  join(nickname, avatarUrl) {
    const payload = { nickname, roomId: config.roomId, gameId: config.gameId };
    if (avatarUrl) payload.avatarUrl = avatarUrl;
    return this.send(EVENTS.join, payload)
      .then((result) => result.snapshot);
  }

  leave() {
    return this.send(EVENTS.leave, {}).then((result) => {
      this.close();
      return result;
    });
  }

  command(payload) { return this.send(EVENTS.command, payload); }
  chat(payload) { return this.send(EVENTS.chat, payload); }

  activity() {
    const now = Date.now();
    if (now - this.lastActivityAt < 2500 || !this.opened || !this.authenticated) return;
    this.lastActivityAt = now;
    void this.sendRaw(EVENTS.activity, {}).catch(() => undefined);
  }

  startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.opened && this.authenticated) void this.sendRaw(EVENTS.activity, {}).catch(() => undefined);
    }, 25_000);
  }

  stopKeepAlive() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }

  subscribe(listener) {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onStatus(listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  close() {
    this.stopKeepAlive();
    this.opened = false;
    this.authenticated = false;
    this.connecting = null;
    this.rejectPending(new Error('实时连接已关闭'));
    const task = this.socketTask;
    this.socketTask = null;
    if (task) task.close({ code: 1000 });
  }
}

module.exports = { GameTransport };
