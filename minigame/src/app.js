const config = require('./config');
const { GameTransport } = require('./transport');
const { createCommand } = require('./protocol');
const { MahjongRenderer } = require('./renderer');
const { gameScreen, isValidNickname, tileLabel } = require('./model');

const INTERACTION_LABELS = { tomato: '🍅', water: '💦', heart: '💖', kiss: '💋' };

class MahjongGameApp {
  constructor(wxApi) {
    this.wx = wxApi;
    this.canvas = wxApi.createCanvas();
    this.context = this.canvas.getContext('2d');
    this.pixelRatio = 1;
    this.resizeCanvas();
    this.renderer = new MahjongRenderer(this.canvas, this.context);
    this.transport = new GameTransport(wxApi);
    this.state = {
      screen: 'loading', loadingProgress: 0, loadingTip: '正在载入牌桌高清纹理与音效…',
      inviteCode: '', nickname: '', avatarUrl: '', chatDraft: '', error: '',
      statusMessage: '邀请码进入 · 仅供测试、学习和交流', connectionStatus: 'disconnected',
      busy: false, chatOpen: false, selectedTileId: '', selectedTarget: null, focus: '', snapshot: null,
    };
    if (this.wx.getStorageSync) {
      this.state.nickname = this.wx.getStorageSync(config.nicknameStorageKey) || '';
      this.state.avatarUrl = this.wx.getStorageSync('mahjong_avatar_url') || '';
    }
    this.userInfoBtn = null;
    this.renderer.onAssetLoaded = () => this.draw();
    this.loadingDuration = 2000 + Math.random() * 1000;
    this.loadingStartTime = Date.now();
    this.animationRunning = false;
    this.animationId = null;
    this.recoveryAttempt = 0;
    this.recovering = false;
    this.visible = true;
    this.leaving = false;
    this.sessionReplaced = false;
    this.lastInteractionId = '';
    this.interactionTimer = null;
    this.orientationRequested = 'portrait';
    this.orientationFailedFor = null;
    this.orientationError = '';
    this.draw = this.draw.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onKeyboardInput = this.onKeyboardInput.bind(this);
    this.onKeyboardConfirm = this.onKeyboardConfirm.bind(this);
    this.unsubscribe = this.transport.subscribe((snapshot) => this.updateSnapshot(snapshot));
    this.unsubscribeStatus = this.transport.onStatus((status, message) => {
      this.state.connectionStatus = status;
      if (status === 'connected' && this.recoveryTimer) {
        clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
      }
      if (status === 'replaced') {
        this.sessionReplaced = true;
        this.state.error = message || '该会话已在其他页面接管';
      }
      if (status === 'disconnected' && this.state.screen !== 'entry' && this.state.screen !== 'loading' && !this.sessionReplaced) this.state.error = message || '连接中断';
      if (status === 'disconnected' && this.visible && this.state.snapshot) this.scheduleRecovery();
      this.draw();
    });
    this.wx.onTouchEnd(this.onTouchEnd);
    if (typeof this.wx.onKeyboardInput === 'function') this.wx.onKeyboardInput(this.onKeyboardInput);
    if (typeof this.wx.onKeyboardConfirm === 'function') this.wx.onKeyboardConfirm(this.onKeyboardConfirm);
    this.wx.onShow(() => {
      this.visible = true;
      this.transport.activity();
      if (this.state.screen === 'loading' || this.state.screen === 'entry') {
        this.startAnimationLoop();
        this.updateUserInfoButton();
      }
      if (this.state.snapshot && this.state.connectionStatus !== 'connected') this.scheduleRecovery(100);
    });
    this.wx.onHide(() => {
      this.visible = false;
      this.transport.stopKeepAlive();
      this.stopAnimationLoop();
      this.destroyUserInfoButton();
    });
    if (typeof this.wx.onWindowResize === 'function') this.wx.onWindowResize(() => {
      this.resizeCanvas();
      this.draw();
      this.updateUserInfoButton(true);
    });
    if (typeof this.wx.onDeviceOrientationChange === 'function') {
      this.wx.onDeviceOrientationChange(() => { this.resizeCanvas(); this.draw(); });
    }
    if (this.wx.cloud && typeof this.wx.cloud.init === 'function') {
      try { this.wx.cloud.init({ env: config.cloudBaseEnvId, traceUser: true }); } catch { /* Optional CloudBase runtime. */ }
    }
    this.syncWeChatProfile();
    this.draw();
    this.startAnimationLoop();
  }

  draw() {
    this.renderer.draw(this.state);
  }

  startAnimationLoop() {
    if (this.animationRunning) return;
    this.animationRunning = true;
    const tick = () => {
      if (!this.animationRunning) return;
      const now = Date.now();
      if (this.state.screen === 'loading') {
        const elapsed = now - this.loadingStartTime;
        const raw = Math.min(1, elapsed / this.loadingDuration);
        const eased = 1 - Math.pow(1 - raw, 2);
        this.state.loadingProgress = Math.min(100, Math.floor(eased * 100));

        if (this.state.loadingProgress < 25) {
          this.state.loadingTip = '正在载入牌桌高清纹理与音效…';
        } else if (this.state.loadingProgress < 55) {
          this.state.loadingTip = '正在校验大众麻将规则与牌型引擎…';
        } else if (this.state.loadingProgress < 85) {
          this.state.loadingTip = '正在同步云托管实时通信网络…';
        } else if (this.state.loadingProgress < 100) {
          this.state.loadingTip = '牌馆准备就绪，欢迎入座…';
        } else {
          this.state.loadingTip = '资源加载完毕！';
        }

        this.renderer.updateParticles();
        this.draw();

        if (raw >= 1) {
          this.finishLoading();
        } else {
          this.scheduleNextFrame(tick);
        }
      } else if (this.state.screen === 'entry') {
        this.renderer.updateParticles();
        this.draw();
        this.scheduleNextFrame(tick);
      } else {
        this.animationRunning = false;
      }
    };
    this.scheduleNextFrame(tick);
  }

  scheduleNextFrame(cb) {
    if (typeof requestAnimationFrame === 'function') {
      this.animationId = requestAnimationFrame(cb);
    } else if (this.wx && typeof this.wx.requestAnimationFrame === 'function') {
      this.animationId = this.wx.requestAnimationFrame(cb);
    } else {
      this.animationId = setTimeout(cb, 30);
    }
  }

  stopAnimationLoop() {
    this.animationRunning = false;
    if (this.animationId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.animationId);
      } else if (this.wx && typeof this.wx.cancelAnimationFrame === 'function') {
        this.wx.cancelAnimationFrame(this.animationId);
      } else {
        clearTimeout(this.animationId);
      }
      this.animationId = null;
    }
  }

  finishLoading() {
    this.state.loadingProgress = 100;
    this.state.screen = 'entry';
    this.draw();
    this.updateUserInfoButton();
    this.restoreSession();
  }

  syncWeChatProfile() {
    if (typeof this.wx.getUserInfo !== 'function') return;
    try {
      this.wx.getUserInfo({
        success: (res) => {
          if (res && res.userInfo) {
            const nick = res.userInfo.nickName;
            const avatar = res.userInfo.avatarUrl;
            if (nick && nick !== '微信用户') {
              this.state.nickname = nick;
              if (this.wx.setStorageSync) this.wx.setStorageSync(config.nicknameStorageKey, nick);
            }
            if (avatar) {
              this.state.avatarUrl = avatar;
              if (this.wx.setStorageSync) this.wx.setStorageSync('mahjong_avatar_url', avatar);
            }
            this.draw();
          }
        },
      });
    } catch { /* ignore */ }
  }

  updateUserInfoButton(forceRecreate = false) {
    if (typeof this.wx.createUserInfoButton !== 'function') return;
    if (this.state.screen !== 'entry' || this.state.busy) {
      this.destroyUserInfoButton();
      return;
    }
    if (forceRecreate) this.destroyUserInfoButton();
    if (this.userInfoBtn) return;
    try {
      const scale = this.renderer.viewport.scale || 1;
      const vx = this.renderer.viewport.x || 0;
      const vy = this.renderer.viewport.y || 0;
      const pr = this.pixelRatio || 1;
      const left = Math.round((vx + 110 * scale) / pr);
      const top = Math.round((vy + 625 * scale) / pr);
      const width = Math.round((320 * scale) / pr);
      const height = Math.round((58 * scale) / pr);

      this.userInfoBtn = this.wx.createUserInfoButton({
        type: 'text',
        text: '',
        style: {
          left, top, width, height,
          backgroundColor: '#00000000',
          borderColor: '#00000000',
        },
      });
      this.userInfoBtn.onTap((res) => {
        if (res && res.userInfo) {
          const nick = res.userInfo.nickName;
          const avatar = res.userInfo.avatarUrl;
          if (nick && nick !== '微信用户') {
            this.state.nickname = nick;
            if (this.wx.setStorageSync) this.wx.setStorageSync(config.nicknameStorageKey, nick);
          }
          if (avatar) {
            this.state.avatarUrl = avatar;
            if (this.wx.setStorageSync) this.wx.setStorageSync('mahjong_avatar_url', avatar);
          }
        }
        void this.enterRoom();
      });
    } catch { /* ignore */ }
  }

  destroyUserInfoButton() {
    if (this.userInfoBtn) {
      try { this.userInfoBtn.destroy(); } catch { /* ignore */ }
      this.userInfoBtn = null;
    }
  }

  resizeCanvas() {
    const info = this.wx.getSystemInfoSync ? this.wx.getSystemInfoSync() : {};
    const width = info.windowWidth || info.screenWidth || 960;
    const height = info.windowHeight || info.screenHeight || 540;
    this.pixelRatio = info.pixelRatio || 1;
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
  }

  setOrientation(value) {
    if (this.orientationRequested === value || this.orientationFailedFor === value) return;
    this.orientationRequested = value;
    if (typeof this.wx.setDeviceOrientation !== 'function') {
      this.orientationRequested = null;
      this.orientationFailedFor = value;
      this.orientationError = value === 'landscape' ? '当前微信基础库不支持自动横屏，请手动旋转手机' : '';
      this.state.error = this.orientationError;
      this.draw();
      return;
    }
    try {
      this.wx.setDeviceOrientation({
        value,
        success: () => {
          if (this.orientationRequested !== value) return;
          this.orientationFailedFor = null;
          this.orientationError = '';
          if (this.state.error.startsWith('切换横屏失败') || this.state.error.startsWith('当前微信基础库')) this.state.error = '';
          this.resizeCanvas();
          this.draw();
        },
        fail: (error) => {
          if (this.orientationRequested !== value) return;
          this.orientationRequested = null;
          this.orientationFailedFor = value;
          this.orientationError = value === 'landscape'
            ? `切换横屏失败，请手动旋转手机${error && error.errMsg ? `（${error.errMsg}）` : ''}`
            : '';
          this.state.error = this.orientationError;
          this.draw();
        },
      });
    } catch (error) {
      this.orientationRequested = null;
      this.orientationFailedFor = value;
      this.orientationError = value === 'landscape'
        ? `切换横屏失败，请手动旋转手机${error && error.message ? `（${error.message}）` : ''}`
        : '';
      this.state.error = this.orientationError;
      this.draw();
    }
  }

  scheduleRecovery(delay) {
    if (this.recoveryTimer || this.recovering || this.leaving || this.sessionReplaced || !this.visible || !this.state.snapshot) return;
    const wait = delay ?? Math.min(1000 * (this.recoveryAttempt + 1), 10_000);
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      void this.recoverRoom();
    }, wait);
  }

  async recoverRoom() {
    if (this.recovering || this.leaving || this.sessionReplaced || !this.visible || !this.state.snapshot
      || this.state.connectionStatus === 'connected') return;
    const token = this.wx.getStorageSync(config.sessionStorageKey);
    const nickname = this.wx.getStorageSync(config.nicknameStorageKey) || this.state.nickname;
    const avatarUrl = this.wx.getStorageSync('mahjong_avatar_url') || this.state.avatarUrl;
    if (!token || !nickname) return;
    this.recovering = true;
    this.recoveryAttempt += 1;
    this.state.statusMessage = '连接中断，正在尝试恢复房间…';
    this.draw();
    let failed = false;
    try {
      await this.transport.login('', token);
      const snapshot = await this.transport.join(nickname, avatarUrl);
      this.recoveryAttempt = 0;
      this.updateSnapshot(snapshot);
    } catch {
      failed = true;
    } finally {
      this.recovering = false;
    }
    if (failed) this.scheduleRecovery();
  }

  async restoreSession() {
    const sessionToken = this.wx.getStorageSync(config.sessionStorageKey);
    const nickname = this.wx.getStorageSync(config.nicknameStorageKey);
    const avatarUrl = this.wx.getStorageSync('mahjong_avatar_url') || this.state.avatarUrl;
    if (!sessionToken || !nickname) return;
    this.state.nickname = nickname;
    this.state.avatarUrl = avatarUrl;
    this.state.busy = true;
    this.state.statusMessage = '正在恢复上次的房间会话…';
    this.draw();
    try {
      await this.transport.login('', sessionToken);
      const snapshot = await this.transport.join(nickname, avatarUrl);
      this.updateSnapshot(snapshot);
    } catch {
      this.state.busy = false;
      this.state.screen = 'entry';
      this.state.statusMessage = '无法恢复会话；确认网络后可重新登录';
      this.state.error = '房间连接失败，请重新输入邀请码';
      this.updateUserInfoButton();
      this.draw();
    }
  }

  updateSnapshot(snapshot) {
    if (!snapshot || !snapshot.public || snapshot.public.gameId !== 'mahjong') return;
    this.stopAnimationLoop();
    this.destroyUserInfoButton();
    const latestMessage = (snapshot.public.chat || []).slice(-1)[0];
    if (latestMessage?.kind === 'interaction' && latestMessage.id !== this.lastInteractionId) {
      this.lastInteractionId = latestMessage.id;
      if (this.interactionTimer) clearInterval(this.interactionTimer);
      if (this.interactionTimeout) clearTimeout(this.interactionTimeout);
      this.interactionTimer = setInterval(() => this.draw(), 70);
      this.interactionTimeout = setTimeout(() => {
        if (this.interactionTimer) clearInterval(this.interactionTimer);
        this.interactionTimer = null;
        this.interactionTimeout = null;
        this.draw();
      }, 1750);
    }
    this.state.snapshot = snapshot;
    this.state.screen = gameScreen(snapshot);
    this.state.busy = false;
    this.state.error = this.orientationError;
    this.state.statusMessage = snapshot.public.phase === 'lobby' ? '等待四位玩家就座' : '房间实时同步中';
    this.setOrientation('landscape');
    const ids = (snapshot.private.hand || []).map((tile) => tile.id);
    if (!ids.includes(this.state.selectedTileId)) this.state.selectedTileId = '';
    this.draw();
  }

  onKeyboardInput(event) {
    if (!this.state.focus) return;
    const field = this.state.focus;
    this.state[field] = String(event.value || '').slice(0, field === 'nickname' ? 12 : field === 'inviteCode' ? 32 : 200);
    this.draw();
  }

  onKeyboardConfirm(event = {}) {
    const field = this.state.focus;
    if (field && typeof event.value === 'string') {
      const length = field === 'nickname' ? 12 : field === 'inviteCode' ? 32 : 200;
      this.state[field] = event.value.slice(0, length);
    }
    this.hideKeyboard();
  }

  hideKeyboard() {
    if (typeof this.wx.hideKeyboard === 'function') this.wx.hideKeyboard({});
    this.state.focus = '';
    this.draw();
  }

  showKeyboard(field) {
    this.state.focus = field;
    this.state.error = '';
    const defaults = { inviteCode: this.state.inviteCode, nickname: this.state.nickname, chatDraft: this.state.chatDraft };
    const length = field === 'nickname' ? 12 : field === 'inviteCode' ? 32 : 200;
    if (typeof this.wx.showKeyboard !== 'function') {
      this.state.statusMessage = '当前基础库不支持键盘输入';
      this.draw();
      return;
    }
    this.wx.showKeyboard({
      defaultValue: defaults[field], maxLength: length, multiple: false,
      confirmHold: false,
      confirmType: field === 'chatDraft' ? 'send' : 'done',
      fail: () => {
        this.state.focus = '';
        this.state.error = '无法打开输入键盘，请重试';
        this.draw();
      },
    });
    this.draw();
  }

  onTouchEnd(event) {
    const touch = event.changedTouches && event.changedTouches[0] || event.touches && event.touches[0];
    if (!touch) return;
    const target = this.renderer.hit(
      (touch.clientX ?? touch.pageX ?? touch.x) * this.pixelRatio,
      (touch.clientY ?? touch.pageY ?? touch.y) * this.pixelRatio,
    );
    if (target) void this.handleTarget(target);
  }

  async handleTarget(target) {
    if (this.state.screen === 'loading') return;
    const { type, data = {} } = target;
    if (type === 'input') { this.showKeyboard(data.field); return; }
    if (type === 'toggle-chat') { this.state.chatOpen = !this.state.chatOpen; this.draw(); return; }
    if (type === 'select-player') {
      this.state.selectedTarget = this.state.selectedTarget?.seat === data.seat ? null : data;
      this.draw();
      return;
    }
    if (type === 'select-tile') {
      const sameTile = this.state.selectedTileId === data.tileId;
      this.state.selectedTileId = data.tileId;
      this.draw();
      if (sameTile && this.state.snapshot?.private.availableActions.includes('discard') && !this.state.snapshot.private.isListening) {
        await this.runCommand('discard', { tileId: data.tileId });
      }
      return;
    }
    if (type === 'enter') { await this.enterRoom(); return; }
    if (type === 'leave') { this.leaveRoom(); return; }
    if (type === 'start') { await this.runCommand('start-hand', {}); return; }
    if (type === 'command') { await this.runCommand(data.action, {}); return; }
    if (type === 'action') { await this.handleAction(data); return; }
    if (type === 'send-chat') { await this.sendChat(); return; }
    if (type === 'interaction') { await this.sendInteraction(data.interaction); }
  }

  async enterRoom() {
    const inviteCode = this.state.inviteCode.trim();
    if (!inviteCode) { this.state.error = '请输入邀请码'; this.draw(); return; }

    let nickname = (this.state.nickname || (this.wx.getStorageSync && this.wx.getStorageSync(config.nicknameStorageKey)) || '').trim();
    let avatarUrl = (this.state.avatarUrl || (this.wx.getStorageSync && this.wx.getStorageSync('mahjong_avatar_url')) || '').trim();

    if (!nickname || nickname === '微信用户' || !isValidNickname(nickname)) {
      nickname = `雀友_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    this.state.nickname = nickname;
    this.state.avatarUrl = avatarUrl;
    this.state.busy = true;
    this.leaving = false;
    this.sessionReplaced = false;
    this.state.error = '';
    this.state.statusMessage = '正在登录并加入麻将房间…';
    this.destroyUserInfoButton();
    this.draw();

    try {
      const auth = await this.transport.login(inviteCode);
      if (!auth.sessionToken) throw new Error('服务端未返回会话凭证');
      if (this.wx.setStorageSync) {
        this.wx.setStorageSync(config.sessionStorageKey, auth.sessionToken);
        this.wx.setStorageSync(config.nicknameStorageKey, nickname);
        if (avatarUrl) this.wx.setStorageSync('mahjong_avatar_url', avatarUrl);
      }
      const snapshot = await this.transport.join(nickname, avatarUrl);
      this.updateSnapshot(snapshot);
    } catch (error) {
      this.state.busy = false;
      this.state.error = error.message || '无法进入房间';
      this.state.statusMessage = '请检查邀请码或网络连接';
      this.updateUserInfoButton();
      this.draw();
    }
  }

  async runCommand(type, payload) {
    const snapshot = this.state.snapshot;
    if (!snapshot || this.state.busy) return;
    this.state.busy = true;
    this.state.error = '';
    this.draw();
    try {
      const result = await this.transport.command(createCommand(snapshot, type, payload));
      this.updateSnapshot(result.snapshot);
    } catch (error) {
      this.state.busy = false;
      this.state.error = error.message || '操作失败';
      this.draw();
    }
  }

  async handleAction(data) {
    const { action } = data;
    if (action === 'chi') {
      const options = data.chiOptions || [];
      if (!options.length) return;
      if (options.length === 1 || typeof this.wx.showActionSheet !== 'function') {
        await this.runCommand('chi', { tileIds: options[0] });
        return;
      }
      const hand = this.state.snapshot.private.hand;
      this.wx.showActionSheet({
        itemList: options.map((ids) => ids.map((id) => tileLabel(hand.find((tile) => tile.id === id))).join(' + ')),
        success: (result) => void this.runCommand('chi', { tileIds: options[result.tapIndex] }),
      });
      return;
    }
    if (action === 'discard') {
      if (this.state.selectedTileId) await this.runCommand('discard', { tileId: this.state.selectedTileId });
      else this.state.error = '请先点选一张手牌';
      this.draw();
      return;
    }
    if (action === 'listen') {
      const pendingWaits = this.state.snapshot.private.postDiscardListenWaits || [];
      const tileId = pendingWaits.length ? undefined : this.state.selectedTileId;
      await this.runCommand('listen', tileId ? { tileId } : {});
      return;
    }
    if (action === 'added-kong') {
      if (!this.state.selectedTileId) { this.state.error = '请选择补杠的牌'; this.draw(); return; }
      await this.runCommand('added-kong', { tileId: this.state.selectedTileId });
      return;
    }
    await this.runCommand(action, {});
  }

  async sendChat() {
    const text = this.state.chatDraft.trim();
    if (!text) { this.showKeyboard('chatDraft'); return; }
    try {
      await this.transport.chat({ kind: 'text', text });
      this.state.chatDraft = '';
      this.state.error = '';
      this.draw();
    } catch (error) {
      this.state.error = error.message || '发送失败';
      this.draw();
    }
  }

  async sendInteraction(interaction) {
    const target = this.state.selectedTarget;
    if (!target) return;
    try {
      await this.transport.chat({ kind: 'interaction', interaction, target: { nickname: target.nickname, seat: target.seat } });
      this.state.statusMessage = `已向 ${target.nickname} 发送 ${INTERACTION_LABELS[interaction] || '互动'}`;
      this.state.selectedTarget = null;
      this.draw();
    } catch (error) {
      this.state.error = error.message || '互动发送失败';
      this.draw();
    }
  }

  leaveRoom() {
    const modal = this.wx.showModal;
    const leave = async () => {
      this.leaving = true;
      try {
        clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        await this.transport.leave();
        this.wx.removeStorageSync(config.sessionStorageKey);
        this.wx.removeStorageSync(config.nicknameStorageKey);
        if (this.interactionTimer) clearInterval(this.interactionTimer);
        if (this.interactionTimeout) clearTimeout(this.interactionTimeout);
        this.interactionTimer = null;
        this.interactionTimeout = null;
        this.state.snapshot = null;
        this.state.screen = 'entry';
        this.setOrientation('portrait');
        this.state.selectedTarget = null;
        this.state.selectedTileId = '';
        this.state.statusMessage = '已退出房间，可重新进入';
        this.startAnimationLoop();
        this.updateUserInfoButton();
        this.draw();
      } catch (error) {
        this.leaving = false;
        this.state.error = error.message || '退出失败';
        this.draw();
      }
    };
    if (!modal) { void leave(); return; }
    modal({ title: '退出麻将房间', content: '确定退出并释放当前座位吗？', success: (result) => { if (result.confirm) void leave(); } });
  }
}

function start() {
  if (typeof wx === 'undefined' || typeof wx.createCanvas !== 'function') return;
  new MahjongGameApp(wx);
}

module.exports = { MahjongGameApp, start };
