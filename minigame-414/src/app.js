const config = require('./config');
const { GameTransport } = require('./transport');
const { createCommand } = require('./protocol');
const { FourOneFourRenderer } = require('./renderer');

const VALID_NICKNAME = /^[A-Za-z0-9_〇㐀-䶿一-鿿]{1,12}$/;

class FourOneFourGameApp {
  constructor(wxApi) {
    this.wx = wxApi;
    this.canvas = wxApi.createCanvas();
    this.context = this.canvas.getContext('2d');
    this.transport = new GameTransport(wxApi);
    this.renderer = new FourOneFourRenderer(this.canvas, this.context);
    this.state = {
      screen: 'entry', inviteCode: '', nickname: '', chatDraft: '', error: '',
      statusMessage: '请输入邀请码和昵称', busy: false, snapshot: null,
      selectedIds: [], selectedTarget: null, chatOpen: false, focus: '',
    };
    this.visible = true;
    this.leaving = false;
    this.recovering = false;
    this.lastInteractionId = '';
    this.interactionTimer = null;
    this.orientation = null;
    this.pixelRatio = 1;
    this.resizeCanvas();
    this.draw = this.draw.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onKeyboardInput = this.onKeyboardInput.bind(this);
    this.onKeyboardConfirm = this.onKeyboardConfirm.bind(this);
    this.transport.subscribe((snapshot) => this.updateSnapshot(snapshot));
    this.transport.onStatus((status) => {
      if (status === 'replaced') {
        this.state.error = '该会话已在其他页面接管';
        this.draw();
      } else if (status === 'disconnected' && this.state.snapshot && !this.leaving) {
        this.state.error = '连接中断，正在尝试恢复…';
        this.draw();
        this.scheduleRecovery();
      }
    });
    if (typeof wxApi.onTouchEnd === 'function') wxApi.onTouchEnd(this.onTouchEnd);
    if (typeof wxApi.onKeyboardInput === 'function') wxApi.onKeyboardInput(this.onKeyboardInput);
    if (typeof wxApi.onKeyboardConfirm === 'function') wxApi.onKeyboardConfirm(this.onKeyboardConfirm);
    if (typeof wxApi.onWindowResize === 'function') wxApi.onWindowResize(() => { this.resizeCanvas(); this.draw(); });
    if (typeof wxApi.onDeviceOrientationChange === 'function') wxApi.onDeviceOrientationChange(() => { this.resizeCanvas(); this.draw(); });
    if (typeof wxApi.onShow === 'function') wxApi.onShow(() => {
      this.visible = true;
      if (this.transport.authenticated) this.transport.startKeepAlive();
      this.transport.activity();
      if (this.state.snapshot && !this.transport.opened) this.scheduleRecovery(100);
    });
    if (typeof wxApi.onHide === 'function') wxApi.onHide(() => {
      this.visible = false;
      this.transport.stopKeepAlive();
      if (this.interactionTimer) clearInterval(this.interactionTimer);
      this.interactionTimer = null;
    });
    if (wxApi.cloud && typeof wxApi.cloud.init === 'function') {
      try { wxApi.cloud.init({ env: config.cloudBaseEnvId, traceUser: true }); } catch { /* CloudBase is optional in the simulator. */ }
    }
    this.state.nickname = wxApi.getStorageSync?.(config.nicknameStorageKey) || '';
    this.draw();
    void this.restoreSession();
  }

  resizeCanvas() {
    const info = this.wx.getWindowInfo ? this.wx.getWindowInfo() : this.wx.getSystemInfoSync ? this.wx.getSystemInfoSync() : {};
    const width = info.windowWidth || info.screenWidth || 960;
    const height = info.windowHeight || info.screenHeight || 540;
    this.pixelRatio = info.pixelRatio || 1;
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
  }

  draw() { this.renderer.draw(this.state); }

  setOrientation(value) {
    if (this.orientation === value) return;
    this.orientation = value;
    if (typeof this.wx.setDeviceOrientation !== 'function') return;
    try {
      this.wx.setDeviceOrientation({
        value,
        success: () => { this.resizeCanvas(); this.draw(); },
        fail: () => { if (value === 'landscape') this.state.error = '请旋转手机横屏体验牌桌'; this.resizeCanvas(); this.draw(); },
      });
    } catch { /* Older developer tools can lack this API; resizing remains supported. */ }
  }

  onTouchEnd(event) {
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    if (!touch) return;
    const target = this.renderer.hit((touch.clientX ?? touch.pageX ?? touch.x) * this.pixelRatio,
      (touch.clientY ?? touch.pageY ?? touch.y) * this.pixelRatio);
    if (!target) {
      if (this.state.selectedTarget) { this.state.selectedTarget = null; this.draw(); }
      return;
    }
    void this.handleTarget(target);
  }

  onKeyboardInput(event = {}) {
    const field = this.state.focus;
    if (!field) return;
    this.state[field] = String(event.value || '').slice(0, field === 'chatDraft' ? 200 : field === 'nickname' ? 12 : 32);
    this.draw();
  }

  onKeyboardConfirm(event = {}) {
    if (this.state.focus && typeof event.value === 'string') this.state[this.state.focus] = event.value;
    const field = this.state.focus;
    this.state.focus = '';
    if (typeof this.wx.hideKeyboard === 'function') this.wx.hideKeyboard({});
    this.draw();
    if (field === 'chatDraft') void this.sendChat();
  }

  showKeyboard(field) {
    this.state.focus = field;
    this.state.error = '';
    if (typeof this.wx.showKeyboard !== 'function') {
      this.state.focus = '';
      this.state.error = '当前小游戏基础库不支持键盘输入';
      this.draw();
      return;
    }
    this.wx.showKeyboard({
      defaultValue: this.state[field] || '',
      maxLength: field === 'chatDraft' ? 200 : field === 'nickname' ? 12 : 32,
      multiple: false,
      confirmType: field === 'chatDraft' ? 'send' : 'done',
      fail: () => { this.state.focus = ''; this.state.error = '无法打开输入键盘，请重试'; this.draw(); },
    });
  }

  async handleTarget(target) {
    const { type, data = {} } = target;
    if (type === 'input') { this.showKeyboard(data.field); return; }
    if (type === 'enter') { await this.enterRoom(); return; }
    if (type === 'leave') { await this.leaveRoom(); return; }
    if (type === 'toggle-chat' || type === 'close-chat') {
      this.state.chatOpen = type === 'toggle-chat';
      this.state.selectedTarget = null;
      this.draw();
      return;
    }
    if (type === 'select-player') {
      this.state.selectedTarget = this.state.selectedTarget?.seat === data.seat ? null : data;
      this.draw();
      return;
    }
    if (type === 'select-card') {
      const selected = new Set(this.state.selectedIds);
      if (selected.has(data.cardId)) selected.delete(data.cardId); else selected.add(data.cardId);
      this.state.selectedIds = [...selected];
      this.transport.activity();
      this.draw();
      return;
    }
    if (type === 'send-chat') { await this.sendChat(); return; }
    if (type === 'interaction') {
      try {
        await this.transport.chat({ kind: 'interaction', interaction: data.interaction, target: data.target });
        this.state.selectedTarget = null;
      } catch (error) { this.state.error = error.message || '互动发送失败'; }
      this.draw();
      return;
    }
    if (type === 'remove-player') {
      this.confirm('移除玩家', `确定移除 ${this.state.selectedTarget?.nickname || ''} 吗？`, () => this.runCommand('remove-player', { seat: data.seat }));
      return;
    }
    if (type === 'start') { await this.runCommand('start-hand', {}); return; }
    if (type === 'opening') { await this.runCommand('opening', data); return; }
    if (type === 'burst') { await this.runCommand('burst', data); return; }
    if (type === 'play') { await this.runCommand('play', { cardIds: this.state.selectedIds }); return; }
    if (type === 'difference') { await this.runCommand('play', { cardIds: this.state.selectedIds, declaration: 'difference' }); return; }
    if (type === 'pass') { await this.runCommand('pass', {}); return; }
    if (type === 'ready') { await this.runCommand('ready', {}); }
  }

  confirm(title, content, onConfirm) {
    if (typeof this.wx.showModal !== 'function') { onConfirm(); return; }
    this.wx.showModal({ title, content, success: (result) => { if (result.confirm) onConfirm(); } });
  }

  async enterRoom() {
    const inviteCode = this.state.inviteCode.trim();
    const nickname = this.state.nickname.trim();
    if (!inviteCode) { this.state.error = '请输入邀请码'; this.draw(); return; }
    if (!VALID_NICKNAME.test(nickname)) { this.state.error = '昵称限 1–12 位中文、字母、数字或下划线'; this.draw(); return; }
    this.state.busy = true;
    this.state.error = '';
    this.state.statusMessage = '正在连接并加入 414 房间…';
    this.draw();
    try {
      const auth = await this.transport.login(inviteCode);
      const snapshot = await this.transport.join(nickname);
      this.wx.setStorageSync?.(config.sessionStorageKey, auth.sessionToken);
      this.wx.setStorageSync?.(config.nicknameStorageKey, nickname);
      this.updateSnapshot(snapshot);
    } catch (error) {
      this.state.busy = false;
      this.state.statusMessage = '请检查邀请码、网络或小游戏合法域名配置';
      this.state.error = error.message || '无法进入房间';
      this.draw();
    }
  }

  updateSnapshot(snapshot) {
    if (!snapshot?.public || snapshot.public.roomId !== '414' || !Array.isArray(snapshot.public.players)) return;
    const latestMessage = (snapshot.public.chat || []).slice(-1)[0];
    if (latestMessage?.kind === 'interaction' && latestMessage.id !== this.lastInteractionId) {
      this.lastInteractionId = latestMessage.id;
      if (this.interactionTimer) clearInterval(this.interactionTimer);
      const remaining = Math.max(0, 2000 - (Date.now() - latestMessage.createdAt));
      if (remaining > 0) {
        this.interactionTimer = setInterval(() => {
          if (Date.now() - latestMessage.createdAt >= 2000) {
            clearInterval(this.interactionTimer);
            this.interactionTimer = null;
          }
          this.draw();
        }, 40);
      }
    }
    this.state.snapshot = snapshot;
    this.state.screen = snapshot.public.phase === 'lobby' ? 'lobby' : 'table';
    this.state.busy = false;
    this.state.error = '';
    this.state.statusMessage = snapshot.public.phase === 'lobby' ? '等待玩家进入房间' : '房间实时同步中';
    const handIds = new Set((snapshot.private.hand || []).map((card) => card.id));
    this.state.selectedIds = this.state.selectedIds.filter((id) => handIds.has(id));
    this.setOrientation('landscape');
    this.draw();
  }

  async runCommand(type, payload) {
    const snapshot = this.state.snapshot;
    if (!snapshot || this.state.busy) return;
    this.state.busy = true;
    this.state.error = '';
    this.draw();
    try {
      const result = await this.transport.command(createCommand(snapshot, type, payload));
      if (type === 'play') this.state.selectedIds = [];
      this.updateSnapshot(result.snapshot);
    } catch (error) {
      this.state.busy = false;
      this.state.error = error.message || '操作失败，请刷新状态后重试';
      this.draw();
    }
  }

  async sendChat() {
    const text = this.state.chatDraft.trim();
    if (!text) { this.state.chatOpen = true; this.draw(); return; }
    try {
      await this.transport.chat({ kind: 'text', text });
      this.state.chatDraft = '';
    } catch (error) { this.state.error = error.message || '消息发送失败'; }
    this.state.chatOpen = true;
    this.draw();
  }

  async restoreSession() {
    const token = this.wx.getStorageSync?.(config.sessionStorageKey);
    const nickname = this.wx.getStorageSync?.(config.nicknameStorageKey);
    if (!token || !nickname) return;
    this.state.nickname = nickname;
    this.state.busy = true;
    this.state.statusMessage = '正在恢复房间会话…';
    this.draw();
    try {
      await this.transport.login('', token);
      const snapshot = await this.transport.join(nickname);
      this.updateSnapshot(snapshot);
    } catch {
      this.state.busy = false;
      this.state.statusMessage = '无法恢复上次会话，请输入邀请码重新进入';
      this.draw();
    }
  }

  scheduleRecovery(delay = 1500) {
    if (this.recoveryTimer || this.recovering || this.leaving || !this.visible) return;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      void this.recoverRoom();
    }, delay);
  }

  async recoverRoom() {
    if (this.recovering || this.leaving || !this.visible || !this.state.snapshot) return;
    const token = this.wx.getStorageSync?.(config.sessionStorageKey);
    const nickname = this.wx.getStorageSync?.(config.nicknameStorageKey) || this.state.nickname;
    if (!token || !nickname) return;
    this.recovering = true;
    try {
      await this.transport.login('', token);
      this.updateSnapshot(await this.transport.join(nickname));
    } catch { this.scheduleRecovery(3000); }
    finally { this.recovering = false; }
  }

  async leaveRoom() {
    const leave = async () => {
      this.leaving = true;
      try {
        await this.transport.leave();
        this.wx.removeStorageSync?.(config.sessionStorageKey);
        this.wx.removeStorageSync?.(config.nicknameStorageKey);
        this.state.snapshot = null;
        this.state.screen = 'entry';
        this.state.nickname = '';
        this.state.inviteCode = '';
        this.state.selectedIds = [];
        this.state.selectedTarget = null;
        this.state.chatOpen = false;
        this.state.error = '';
        this.state.statusMessage = '已退出房间，可重新进入';
        this.setOrientation('portrait');
        this.draw();
      } catch (error) {
        this.state.error = error.message || '退出失败';
        this.draw();
      } finally { this.leaving = false; }
    };
    this.confirm('退出房间', '确定离开当前 414 房间吗？', () => { void leave(); });
  }
}

function start() {
  const wxApi = typeof wx !== 'undefined' ? wx : null;
  if (!wxApi || typeof wxApi.createCanvas !== 'function') throw new Error('需要在微信小游戏环境中运行');
  return new FourOneFourGameApp(wxApi);
}

module.exports = { FourOneFourGameApp, start };
