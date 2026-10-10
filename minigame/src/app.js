const config = require('./config');
const { GameTransport } = require('./transport');
const { createCommand } = require('./protocol');
const { MahjongRenderer } = require('./renderer');
const { gameScreen, isValidNickname, tileLabel } = require('./model');

const INTERACTION_LABELS = { tomato: '🍅', water: '💦', heart: '💖', kiss: '💋' };
const isLegacyGeneratedNickname = (nickname) => /^雀友_\d{4}$/.test(String(nickname || ''));
function createGuestNickname() {
  const timePart = Date.now().toString(36).slice(-2);
  const randomPart = Math.floor(Math.random() * 36 ** 3).toString(36).padStart(3, '0');
  return `雀友${(timePart + randomPart).toUpperCase()}`;
}
function normalizeWechatNickname(value) {
  const allowed = Array.from(String(value || '').trim()).filter((character) =>
    /^[A-Za-z0-9_〇㐀-䶿一-鿿]$/.test(character));
  return allowed.slice(0, 12).join('');
}
function apiErrorText(error) {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return String(error || '');
  return [error.errMsg, error.message, error.errno, error.errCode, error.err_code]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .join(' ');
}
function isPrivacyGuideError(...errors) {
  return /please go to mp.*privacy|errno\s*[:=]?\s*1026|-12034/i.test(errors.join(' '));
}
function voiceAuthorizationError(error) {
  const message = apiErrorText(error);
  if (isPrivacyGuideError(message)) {
    return '微信隐私校验阻止了录音。请在小游戏后台的隐私保护指引中声明麦克风用于房间语音，并启用官方隐私授权弹窗。';
  }
  if (/auth deny|user deny|permission|authorize/i.test(message)) {
    return '未获得麦克风授权。请同意语音权限，或在小游戏右上角“…”→设置中开启麦克风。';
  }
  return message || '录音失败，请检查麦克风权限后重试';
}

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
      canRequestUserInfo: typeof this.wx.createUserInfoButton === 'function',
      busy: false, chatOpen: false, chatReadId: '', chatMode: 'text', chatTab: 'messages',
      recordingVoice: false, playingVoiceId: '', selectedTileId: '', selectedTarget: null,
      focus: '', keyboardOpen: false, snapshot: null, actionCallouts: [],
    };
    if (this.wx.getStorageSync) {
      const savedNickname = this.wx.getStorageSync(config.nicknameStorageKey) || '';
      if (isLegacyGeneratedNickname(savedNickname)) {
        this.legacyNicknameSessionToken = this.wx.getStorageSync(config.sessionStorageKey) || '';
        this.state.statusMessage = '旧版随机昵称已清除，可重新入房后授权微信资料';
        if (this.wx.removeStorageSync) {
          this.wx.removeStorageSync(config.nicknameStorageKey);
          this.wx.removeStorageSync('mahjong_avatar_url');
          this.wx.removeStorageSync(config.profileAuthorizedStorageKey);
        }
      } else {
        this.state.nickname = savedNickname;
        this.state.avatarUrl = this.wx.getStorageSync('mahjong_avatar_url') || '';
        this.state.profileAuthorized = Boolean(savedNickname && this.wx.getStorageSync(config.profileAuthorizedStorageKey));
      }
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
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onTouchCancel = this.onTouchCancel.bind(this);
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
    if (typeof this.wx.onTouchStart === 'function') this.wx.onTouchStart(this.onTouchStart);
    this.wx.onTouchEnd(this.onTouchEnd);
    if (typeof this.wx.onTouchCancel === 'function') this.wx.onTouchCancel(this.onTouchCancel);
    if (typeof this.wx.onKeyboardInput === 'function') this.wx.onKeyboardInput(this.onKeyboardInput);
    if (typeof this.wx.onKeyboardConfirm === 'function') this.wx.onKeyboardConfirm(this.onKeyboardConfirm);
    this.wx.onShow(() => {
      this.visible = true;
      this.transport.activity();
      if (this.state.screen === 'loading' || this.state.screen === 'entry') {
        this.startAnimationLoop();
      }
      this.updateUserInfoButton();
      if (this.state.snapshot && this.state.connectionStatus !== 'connected') this.scheduleRecovery(100);
    });
    this.wx.onHide(() => {
      this.visible = false;
      this.transport.stopKeepAlive();
      this.stopAnimationLoop();
      this.destroyUserInfoButton();
    });
    if (typeof this.wx.onWindowResize === 'function') this.wx.onWindowResize(() => {
      if (this.state.keyboardOpen) return;
      this.resizeCanvas();
      this.draw();
      this.updateUserInfoButton(true);
    });
    if (typeof this.wx.onKeyboardComplete === 'function') this.wx.onKeyboardComplete(() => {
      if (this.state.focus) this.lastFocusedField = this.state.focus;
      this.state.focus = '';
      this.scheduleCanvasRestoreAfterKeyboard();
    });
    if (typeof this.wx.onDeviceOrientationChange === 'function') {
      this.wx.onDeviceOrientationChange(() => { this.resizeCanvas(); this.draw(); this.updateUserInfoButton(true); });
    }
    if (this.wx.cloud && typeof this.wx.cloud.init === 'function') {
      try { this.wx.cloud.init({ env: config.cloudBaseEnvId, traceUser: true }); } catch { /* Optional CloudBase runtime. */ }
    }
    this.draw();
    this.startAnimationLoop();
  }

  draw() {
    this.renderer.safeInsets = this.safeInsets;
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
        }
        this.scheduleNextFrame(tick);
      } else if (this.state.screen === 'entry') {
        this.renderer.updateParticles();
        this.draw();
        this.scheduleNextFrame(tick);
      } else if (this.state.screen === 'room' && this.hasActiveRoomAnimation()) {
        this.draw();
        this.scheduleNextFrame(tick);
      } else {
        this.animationRunning = false;
        this.animationId = null;
      }
    };
    this.scheduleNextFrame(tick);
  }

  scheduleNextFrame(cb) {
    if (typeof requestAnimationFrame === 'function') {
      this.animationId = requestAnimationFrame(cb);
    } else if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.requestAnimationFrame === 'function') {
      this.animationId = GameGlobal.requestAnimationFrame(cb);
    } else if (this.canvas && typeof this.canvas.requestAnimationFrame === 'function') {
      this.animationId = this.canvas.requestAnimationFrame(cb);
    } else if (this.wx && typeof this.wx.requestAnimationFrame === 'function') {
      this.animationId = this.wx.requestAnimationFrame(cb);
    } else {
      this.animationId = setTimeout(cb, 16);
    }
  }

  stopAnimationLoop() {
    this.animationRunning = false;
    if (this.animationId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.animationId);
      } else if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.cancelAnimationFrame === 'function') {
        GameGlobal.cancelAnimationFrame(this.animationId);
      } else if (this.canvas && typeof this.canvas.cancelAnimationFrame === 'function') {
        this.canvas.cancelAnimationFrame(this.animationId);
      } else if (this.wx && typeof this.wx.cancelAnimationFrame === 'function') {
        this.wx.cancelAnimationFrame(this.animationId);
      } else {
        clearTimeout(this.animationId);
      }
      this.animationId = null;
    }
  }

  hasActiveRoomAnimation() {
    const pub = this.state.snapshot?.public;
    if (!pub || pub.phase !== 'playing') return false;
    const now = Date.now();
    const hasCallouts = (this.state.actionCallouts || []).some((c) => now - c.startTime < (c.duration || 1500));
    return hasCallouts || (pub.players || []).some((p) => p.isListening);
  }

  finishLoading() {
    this.state.loadingProgress = 100;
    this.state.screen = 'entry';
    this.draw();
    this.restoreSession();
  }

  updateUserInfoButton(forceRecreate = false) {
    if (typeof this.wx.createUserInfoButton !== 'function') {
      this.state.canRequestUserInfo = false;
      this.destroyUserInfoButton();
      return;
    }
    const shouldShowOnEntry = this.state.screen === 'entry' && Boolean(this.state.inviteCode.trim()) && !this.state.profileAuthorized;
    if (!shouldShowOnEntry || this.state.busy || this.state.profileUpdating) {
      this.destroyUserInfoButton();
      return;
    }
    if (forceRecreate) this.destroyUserInfoButton();
    if (this.userInfoBtn) return;
    this.authorizationButtonError = false;
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
        text: '进入房间',
        withCredentials: false,
        lang: 'zh_CN',
        style: {
          left, top, width, height,
          backgroundColor: '#e7a52d',
          borderColor: '#fff0ba',
          color: '#15252b',
          textAlign: 'center',
          fontSize: 17,
          lineHeight: height,
          borderRadius: 10,
        },
      });
      if (!this.userInfoBtn || typeof this.userInfoBtn.onTap !== 'function') {
        this.userInfoBtn = null;
        this.state.canRequestUserInfo = false;
        this.authorizationButtonError = true;
        this.state.statusMessage = '微信授权按钮不可用，请重新输入邀请码后重试';
        this.state.error = '授权控件未就绪，暂未加入房间';
        this.draw();
        return;
      }
      this.userInfoBtn.onTap((res) => {
        this.state.statusMessage = '已收到授权按钮点击，正在读取微信资料…';
        this.draw();
        void this.handleUserInfoButtonResult(res);
      });
      this.state.statusMessage = '点击“进入房间”，并在微信弹窗中确认昵称头像授权';
      this.draw();
    } catch (error) {
      this.userInfoBtn = null;
      this.state.canRequestUserInfo = false;
      this.authorizationButtonError = true;
      this.state.statusMessage = `微信授权按钮创建失败${error && error.errMsg ? `：${error.errMsg}` : ''}，请重新输入邀请码后重试`;
      this.state.error = '授权控件未就绪，暂未加入房间';
      this.draw();
    }
  }

  async handleUserInfoButtonResult(result = {}) {
    let userInfo = result && (result.userInfo || result.data && result.data.userInfo || result.detail && result.detail.userInfo);
    let nickname = normalizeWechatNickname(userInfo && userInfo.nickName);
    let avatarUrl = String(userInfo && userInfo.avatarUrl || '').trim();
    const resultError = apiErrorText(result);
    let userInfoError = '';
    const denied = /auth deny|user deny|cancel|拒绝/i.test(resultError);
    if ((!nickname || nickname === '微信用户') && !denied && typeof this.wx.getUserInfo === 'function') {
      userInfo = await new Promise((resolve) => {
        try {
          this.wx.getUserInfo({
            withCredentials: false,
            lang: 'zh_CN',
            success: (response) => resolve(response && (response.userInfo || response.data && response.data.userInfo)),
            fail: (error) => { userInfoError = apiErrorText(error); resolve(null); },
          });
        } catch (error) { userInfoError = apiErrorText(error); resolve(null); }
      });
      nickname = normalizeWechatNickname(userInfo && userInfo.nickName);
      avatarUrl = String(userInfo && userInfo.avatarUrl || '').trim();
    }
    if (!nickname || nickname === '微信用户' || !isValidNickname(nickname)) {
      if (isPrivacyGuideError(resultError, userInfoError)) {
        this.state.error = '微信未开放昵称头像接口：请配置隐私指引（昵称、头像）';
        this.state.statusMessage = '昵称头像授权暂不可用 · 请先完善小游戏隐私保护指引';
        this.draw();
        return;
      }
      const errMsg = resultError || '接口未返回昵称头像';
      this.state.error = '';
      this.state.statusMessage = denied ? '未授权，改用随机昵称进入房间…' : '未取得有效微信昵称，改用随机昵称进入房间…';
      await this.enterRoom({ nickname: createGuestNickname(), avatarUrl: '', profileAuthorized: false });
      if (!denied && !/:ok$/.test(errMsg)) this.state.statusMessage = `微信资料不可用（${errMsg}），已使用随机昵称`;
      this.draw();
      return;
    }
    this.state.profileAuthorized = true;
    await this.enterRoom({ nickname, avatarUrl, profileAuthorized: true });
  }

  destroyUserInfoButton() {
    if (this.userInfoBtn) {
      try { this.userInfoBtn.destroy(); } catch { /* ignore */ }
      this.userInfoBtn = null;
    }
  }

  resizeCanvas() {
    const info = this.wx.getWindowInfo ? this.wx.getWindowInfo() : this.wx.getSystemInfoSync ? this.wx.getSystemInfoSync() : {};
    const width = info.windowWidth || info.screenWidth || 960;
    const height = info.windowHeight || info.screenHeight || 540;
    this.pixelRatio = info.pixelRatio || 1;
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.safeInsets = {
      left: Math.max(0, info.safeArea?.left || 0) * this.pixelRatio,
      right: Math.max(0, width - (info.safeArea?.right ?? width)) * this.pixelRatio,
      bottom: Math.max(0, height - (info.safeArea?.bottom ?? height)) * this.pixelRatio,
    };
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
          this.updateUserInfoButton(true);
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
    if (failed) {
      if (this.recoveryAttempt >= 4) {
        if (this.wx.removeStorageSync) {
          this.wx.removeStorageSync(config.sessionStorageKey);
        }
        this.state.screen = 'entry';
        this.state.snapshot = null;
        this.state.error = '房间会话已失效，请重新输入邀请码进入';
        this.state.statusMessage = '房间会话已失效，请重新进入';
        this.setOrientation('portrait');
        this.startAnimationLoop();
        this.updateUserInfoButton();
        this.draw();
        return;
      }
      this.scheduleRecovery();
    }
  }

  async restoreSession() {
    const sessionToken = this.wx.getStorageSync(config.sessionStorageKey);
    const nickname = this.wx.getStorageSync(config.nicknameStorageKey);
    if (this.legacyNicknameSessionToken) {
      const legacyToken = this.legacyNicknameSessionToken;
      this.legacyNicknameSessionToken = '';
      try {
        await this.transport.login('', legacyToken);
        await this.transport.leave();
      } catch { /* The old session may already have expired. */ }
      if (this.wx.removeStorageSync) this.wx.removeStorageSync(config.sessionStorageKey);
      this.state.statusMessage = '旧版随机昵称已清除，可重新入房后授权微信资料';
      this.updateUserInfoButton();
      this.draw();
      return;
    }
    if (!this.state.profileAuthorized) {
      if (sessionToken || nickname) {
        this.state.nickname = '';
        this.state.avatarUrl = '';
        this.state.statusMessage = '正在清理未授权的旧测试会话…';
        this.draw();
        if (sessionToken) {
          try {
            await this.transport.login('', sessionToken);
            await this.transport.leave();
          } catch { /* Expired guest sessions need no further cleanup. */ }
        }
        if (this.wx.removeStorageSync) {
          this.wx.removeStorageSync(config.sessionStorageKey);
          this.wx.removeStorageSync(config.nicknameStorageKey);
          this.wx.removeStorageSync('mahjong_avatar_url');
          this.wx.removeStorageSync(config.profileAuthorizedStorageKey);
        }
        this.state.statusMessage = '旧测试会话已清理，请重新输入邀请码并点击进入';
        this.draw();
      }
      return;
    }
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
      this.startAnimationLoop();
      this.updateUserInfoButton();
      this.draw();
    }
  }

  updateSnapshot(snapshot) {
    if (!snapshot || !snapshot.public || snapshot.public.gameId !== 'mahjong') return;
    this.stopAnimationLoop();
    this.destroyUserInfoButton();
    const latestMessage = (snapshot.public.chat || []).slice(-1)[0];
    if ((latestMessage?.kind === 'interaction' || latestMessage?.kind === 'phrase') && latestMessage.id !== this.lastInteractionId) {
      this.lastInteractionId = latestMessage.id;
      if (this.interactionTimer) clearInterval(this.interactionTimer);
      if (this.interactionTimeout) clearTimeout(this.interactionTimeout);
      const duration = latestMessage.kind === 'phrase' ? 3600 : 2000;
      this.interactionTimer = setInterval(() => this.draw(), 33);
      this.interactionTimeout = setTimeout(() => {
        if (this.interactionTimer) clearInterval(this.interactionTimer);
        this.interactionTimer = null;
        this.interactionTimeout = null;
        this.draw();
      }, duration);
    }
    const enteringRoom = this.state.screen === 'entry';
    const prevSnapshot = this.state.snapshot;
    const now = Date.now();
    if (!this.state.actionCallouts) this.state.actionCallouts = [];
    this.state.actionCallouts = this.state.actionCallouts.filter((c) => now - c.startTime < (c.duration || 1500));

    if (
      !enteringRoom &&
      prevSnapshot &&
      prevSnapshot.public &&
      snapshot.public.phase === 'playing' &&
      prevSnapshot.public.phase === 'playing' &&
      prevSnapshot.public.handNumber === snapshot.public.handNumber
    ) {
      const prevPlayers = prevSnapshot.public.players || [];
      const nextPlayers = snapshot.public.players || [];

      nextPlayers.forEach((np) => {
        const pp = prevPlayers.find((p) => p.seat === np.seat);
        if (!pp) return;
        const prevMelds = pp.melds || [];
        const nextMelds = np.melds || [];

        // 1. Meld added (chi, peng, exposed-kong, concealed-kong)
        if (nextMelds.length > prevMelds.length) {
          const newMeld = nextMelds[nextMelds.length - 1];
          const kind = newMeld?.kind || 'peng';
          let text = '碰';
          if (kind === 'chi') text = '吃';
          else if (kind === 'peng') text = '碰';
          else if (kind.includes('kong')) text = '杠';
          this.state.actionCallouts.push({
            seat: np.seat,
            kind,
            text,
            startTime: now,
            duration: 1500,
          });
        } else if (nextMelds.length === prevMelds.length && nextMelds.length > 0) {
          // Check for added-kong
          const prevAdded = prevMelds.filter((m) => m.kind === 'added-kong').length;
          const nextAdded = nextMelds.filter((m) => m.kind === 'added-kong').length;
          if (nextAdded > prevAdded) {
            this.state.actionCallouts.push({
              seat: np.seat,
              kind: 'added-kong',
              text: '杠',
              startTime: now,
              duration: 1500,
            });
          }
        }

        // 2. Newly declared ting
        if (np.isListening && !pp.isListening) {
          this.state.actionCallouts.push({
            seat: np.seat,
            kind: 'listen',
            text: '听',
            startTime: now,
            duration: 1500,
          });
        }
      });

      // 3. Win announcement
      if (snapshot.public.winAnnouncement && !prevSnapshot.public.winAnnouncement) {
        const winnerSeat = snapshot.public.winAnnouncement.winnerSeat;
        if (winnerSeat) {
          this.state.actionCallouts.push({
            seat: winnerSeat,
            kind: 'hu',
            text: '胡',
            startTime: now,
            duration: 1800,
          });
        }
      }
    } else if (enteringRoom || snapshot.public.phase !== 'playing') {
      this.state.actionCallouts = [];
    }

    this.state.snapshot = snapshot;
    this.state.screen = gameScreen(snapshot);
    if (enteringRoom) { this.state.chatOpen = false; this.state.chatReadId = ''; }
    if (this.state.chatOpen) this.state.chatReadId = latestMessage?.id || '';
    this.state.busy = false;
    this.state.error = this.orientationError;
    this.state.statusMessage = snapshot.public.phase === 'lobby' ? '等待四位玩家就座' : '房间实时同步中';
    this.setOrientation('landscape');
    const ids = (snapshot.private.hand || []).map((tile) => tile.id);
    if (!ids.includes(this.state.selectedTileId)) this.state.selectedTileId = '';
    this.draw();
    if (this.state.screen === 'room' && this.hasActiveRoomAnimation() && !this.animationRunning) {
      this.startAnimationLoop();
    }
    this.updateUserInfoButton(true);
  }

  onKeyboardInput(event) {
    if (!this.state.focus) return;
    const field = this.state.focus;
    this.state[field] = String(event.value || '').slice(0, field === 'inviteCode' ? 32 : 200);
    this.draw();
    if (field === 'inviteCode') this.updateUserInfoButton();
  }

  onKeyboardConfirm(event = {}) {
    const field = this.state.focus || this.lastFocusedField || (this.state.screen === 'entry' ? 'inviteCode' : '');
    if (field && typeof event.value === 'string') {
      const length = field === 'inviteCode' ? 32 : 200;
      this.state[field] = event.value.slice(0, length);
    }
    this.state.focus = '';
    this.lastFocusedField = '';
    this.hideKeyboard();
    if (field === 'inviteCode') {
      if (typeof this.updateUserInfoButton === 'function') this.updateUserInfoButton(true);
      if (this.state.inviteCode && this.state.inviteCode.trim()) {
        const fn = this.handleEntryAction || MahjongGameApp.prototype.handleEntryAction;
        if (typeof fn === 'function') void fn.call(this);
      }
    } else if (field === 'chatDraft' && this.state.chatDraft && this.state.chatDraft.trim()) {
      void this.sendChat();
    }
  }

  async handleEntryAction() {
    if (this.state.busy) return;
    const code = this.state.inviteCode.trim();
    if (!code) {
      this.state.error = '请输入房间邀请码';
      if (typeof this.draw === 'function') this.draw();
      return;
    }
    if (this.userInfoBtn) {
      this.state.statusMessage = '请点击“进入房间”并确认昵称头像授权';
      if (typeof this.draw === 'function') this.draw();
      return;
    }
    if (!this.state.profileAuthorized && typeof this.wx.createUserInfoButton === 'function') {
      if (typeof this.updateUserInfoButton === 'function') this.updateUserInfoButton();
      if (!this.userInfoBtn) {
        this.state.error = this.authorizationButtonError
          ? '微信授权按钮未能创建，请重新输入邀请码后再试'
          : '正在准备微信授权，请稍后再点';
        if (typeof this.draw === 'function') this.draw();
      } else {
        this.state.statusMessage = '邀请码已就绪，请点击“进入房间”确认授权';
        if (typeof this.draw === 'function') this.draw();
      }
      return;
    }
    if (!this.state.profileAuthorized && typeof this.wx.createUserInfoButton !== 'function') {
      this.state.statusMessage = '当前微信环境不支持昵称头像授权，将使用临时昵称进入';
    }
    await this.enterRoom();
  }

  hideKeyboard() {
    if (typeof this.wx.hideKeyboard === 'function') this.wx.hideKeyboard({});
    this.state.focus = '';
    const wasOpen = this.state.keyboardOpen;
    if (!wasOpen) this.state.keyboardOpen = false;
    if (typeof this.draw === 'function') this.draw();
    if (wasOpen) this.scheduleCanvasRestoreAfterKeyboard();
  }

  scheduleCanvasRestoreAfterKeyboard() {
    if (this.keyboardResizeTimer) clearTimeout(this.keyboardResizeTimer);
    this.keyboardResizeTimer = setTimeout(() => {
      this.keyboardResizeTimer = null;
      this.state.keyboardOpen = false;
      this.resizeCanvas();
      if (typeof this.draw === 'function') this.draw();
      if (typeof this.updateUserInfoButton === 'function') this.updateUserInfoButton(true);
    }, 150);
  }

  showKeyboard(field) {
    this.state.focus = field;
    this.lastFocusedField = field;
    this.state.keyboardOpen = true;
    this.state.error = '';
    if (typeof this.destroyUserInfoButton === 'function') this.destroyUserInfoButton();
    const defaults = { inviteCode: this.state.inviteCode, chatDraft: this.state.chatDraft };
    const length = field === 'inviteCode' ? 32 : 200;
    if (typeof this.wx.showKeyboard !== 'function') {
      this.state.statusMessage = '当前基础库不支持键盘输入';
      this.state.focus = '';
      this.state.keyboardOpen = false;
      if (typeof this.draw === 'function') this.draw();
      return;
    }
    this.wx.showKeyboard({
      defaultValue: defaults[field], maxLength: length, multiple: false,
      confirmHold: false,
      confirmType: field === 'chatDraft' ? 'send' : 'go',
      fail: () => {
        this.state.focus = '';
        this.state.keyboardOpen = false;
        this.state.error = '无法打开输入键盘，请重试';
        if (typeof this.draw === 'function') this.draw();
      },
    });
    if (typeof this.draw === 'function') this.draw();
  }

  onTouchStart(event) {
    const touch = event.changedTouches && event.changedTouches[0] || event.touches && event.touches[0];
    if (!touch) return;
    const target = this.renderer.hit(
      (touch.clientX ?? touch.pageX ?? touch.x) * this.pixelRatio,
      (touch.clientY ?? touch.pageY ?? touch.y) * this.pixelRatio,
    );
    if (target && target.type === 'voice-bar') {
      this.startVoiceRecording();
    }
  }

  onTouchEnd(event) {
    if (this.state.recordingVoice) {
      this.stopVoiceRecording(false);
      return;
    }
    const touch = event.changedTouches && event.changedTouches[0] || event.touches && event.touches[0];
    if (!touch) return;
    const target = this.renderer.hit(
      (touch.clientX ?? touch.pageX ?? touch.x) * this.pixelRatio,
      (touch.clientY ?? touch.pageY ?? touch.y) * this.pixelRatio,
    );
    const insideChat = target && (['chat-panel', 'toggle-chat', 'close-chat', 'send-chat', 'chat-tab', 'toggle-chat-mode', 'voice-bar', 'send-phrase', 'play-voice'].includes(target.type)
      || target.type === 'input' && target.data?.field === 'chatDraft');
    if (this.state.chatOpen && !insideChat) {
      // Dismissal consumes the tap so a covered tile or game action cannot fire accidentally.
      this.closeChat();
      return;
    }
    const insideInteraction = target && (['interaction', 'close-interaction', 'select-player'].includes(target.type));
    if (this.state.selectedTarget && !insideInteraction) {
      this.state.selectedTarget = null;
      this.draw();
      if (!target) return;
    }
    if (target) void this.handleTarget(target);
  }

  onTouchCancel() {
    if (this.state.recordingVoice) {
      this.stopVoiceRecording(true);
    }
  }

  closeChat() {
    this.state.chatOpen = false;
    this.state.chatTab = 'messages';
    if (this.state.focus === 'chatDraft' || this.state.keyboardOpen) this.hideKeyboard();
    else this.draw();
  }

  async handleTarget(target) {
    if (this.state.screen === 'loading') return;
    const { type, data = {} } = target;
    if (type === 'input') { this.showKeyboard(data.field); return; }
    if (type === 'chat-panel') return;
    if (type === 'close-chat') { this.closeChat(); return; }
    if (type === 'toggle-chat') {
      if (this.state.chatOpen) this.closeChat();
      else {
        this.state.chatOpen = true;
        this.state.chatReadId = this.state.snapshot?.public.chat?.slice(-1)[0]?.id || '';
        this.state.selectedTarget = null;
        this.draw();
      }
      return;
    }
    if (type === 'chat-tab') {
      this.state.chatTab = data.tab;
      this.draw();
      return;
    }
    if (type === 'toggle-chat-mode') {
      if (this.state.chatMode === 'voice') {
        this.state.chatMode = 'text';
      } else if (await this.authorizeVoiceRecording()) {
        this.state.chatMode = 'voice';
      }
      if (this.state.keyboardOpen) this.hideKeyboard();
      this.draw();
      return;
    }
    if (type === 'send-phrase') {
      await this.transport.chat({ kind: 'phrase', text: data.phrase });
      this.state.chatTab = 'messages';
      this.draw();
      return;
    }
    if (type === 'play-voice') {
      this.playVoice(data.message);
      return;
    }
    if (type === 'voice-bar') return;
    if (type === 'select-player' || type === 'select-interaction-target') {
      const ownSeat = this.state.snapshot?.private?.seat;
      if (ownSeat && data.seat === ownSeat) return;
      this.state.selectedTarget = this.state.selectedTarget?.seat === data.seat ? null : data;
      this.draw();
      return;
    }
    if (type === 'close-interaction') {
      this.state.selectedTarget = null;
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
    if (type === 'enter') {
      if (this.state.keyboardOpen) this.hideKeyboard();
      const fn = this.handleEntryAction || MahjongGameApp.prototype.handleEntryAction;
      if (typeof fn === 'function') await fn.call(this);
      return;
    }
    if (type === 'reconnect') {
      this.state.error = '正在重新连接…';
      this.draw();
      void this.recoverRoom();
      return;
    }
    if (type === 'leave') { this.leaveRoom(); return; }
    if (type === 'start') { await this.runCommand('start-hand', {}); return; }
    if (type === 'command') { await this.runCommand(data.action, {}); return; }
    if (type === 'action') { await this.handleAction(data); return; }
    if (type === 'send-chat') { await this.sendChat(); return; }
    if (type === 'interaction') { await this.sendInteraction(data.interaction, data.target); return; }
  }

  async enterRoom(options = {}) {
    const inviteCode = this.state.inviteCode.trim();
    if (!inviteCode) { this.state.error = '请输入邀请码'; this.draw(); return; }

    const profileAuthorized = options.profileAuthorized ?? this.state.profileAuthorized;
    let nickname = String(options.nickname ?? (profileAuthorized
      ? (this.state.nickname || (this.wx.getStorageSync && this.wx.getStorageSync(config.nicknameStorageKey)) || '')
      : '')).trim();
    let avatarUrl = String(options.avatarUrl ?? (profileAuthorized
      ? (this.state.avatarUrl || (this.wx.getStorageSync && this.wx.getStorageSync('mahjong_avatar_url')) || '')
      : '')).trim();
    if (profileAuthorized) nickname = normalizeWechatNickname(nickname);
    const generatedNickname = !nickname || nickname === '微信用户' || !isValidNickname(nickname);
    if (generatedNickname) nickname = createGuestNickname();
    if (!profileAuthorized) avatarUrl = '';

    this.state.nickname = nickname;
    this.state.avatarUrl = avatarUrl;
    this.state.profileAuthorized = Boolean(profileAuthorized && !generatedNickname);
    this.state.error = '';
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
      const snapshot = await this.transport.join(nickname, avatarUrl);
      if (this.wx.setStorageSync) {
        this.wx.setStorageSync(config.sessionStorageKey, auth.sessionToken);
        this.wx.setStorageSync(config.nicknameStorageKey, nickname);
        this.wx.setStorageSync('mahjong_avatar_url', avatarUrl);
        this.wx.setStorageSync(config.profileAuthorizedStorageKey, Boolean(this.state.profileAuthorized));
      }
      this.updateSnapshot(snapshot);
    } catch (error) {
      this.state.busy = false;
      this.state.error = error.message || '无法进入房间';
      this.state.statusMessage = '请检查邀请码或网络连接';
      if (generatedNickname) this.state.nickname = '';
      this.startAnimationLoop();
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

  async sendInteraction(interaction, explicitTarget = null) {
    let target = explicitTarget || this.state.selectedTarget;
    const ownSeat = this.state.snapshot?.private?.seat;
    if (target && ownSeat && target.seat === ownSeat) {
      this.state.selectedTarget = null;
      this.draw();
      return;
    }
    if (!target) {
      const players = this.state.snapshot?.public?.players || [];
      const other = players.find((p) => p.seat !== ownSeat);
      if (other) target = { seat: other.seat, nickname: other.nickname };
    }
    if (!target || (ownSeat && target.seat === ownSeat)) return;
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

  initRecorder() {
    if (this.recorderInitialized || !this.wx || typeof this.wx.getRecorderManager !== 'function') return;
    this.recorderInitialized = true;
    try {
      this.recorder = this.wx.getRecorderManager();
      this.recorder.onStart(() => {
        this.state.recordingVoice = true;
        this.recordingStartTime = Date.now();
        this.draw();
      });
      this.recorder.onStop((res) => {
        const wasCancelled = this.recordingCancelled;
        const duration = Math.max(1, Math.round(((res && res.duration) || (Date.now() - this.recordingStartTime)) / 1000));
        this.state.recordingVoice = false;
        this.recordingCancelled = false;
        this.draw();
        if (wasCancelled) return;
        if (res && res.duration && res.duration < 600) {
          if (typeof this.wx.showToast === 'function') {
            this.wx.showToast({ title: '说话时间太短', icon: 'none' });
          }
          return;
        }
        if (res && res.tempFilePath && this.wx.getFileSystemManager) {
          try {
            const fs = this.wx.getFileSystemManager();
            const base64 = fs.readFileSync(res.tempFilePath, 'base64');
            if (base64) {
              void this.transport.chat({
                kind: 'voice',
                duration,
                audioData: base64,
              });
            }
          } catch { /* best effort */ }
        }
      });
      this.recorder.onError((err) => {
        this.state.recordingVoice = false;
        this.recordingCancelled = false;
        this.state.error = voiceAuthorizationError(err);
        this.draw();
      });
    } catch { /* ignore */ }
  }

  async authorizeVoiceRecording() {
    this.state.error = '';
    const request = (api, options) => new Promise((resolve) => {
      let finished = false;
      const finish = (allowed, error) => {
        if (finished) return;
        finished = true;
        if (!allowed) {
          this.state.error = voiceAuthorizationError(error);
          this.state.statusMessage = '授权完成后再次切换语音，再按住说话';
          this.draw();
        }
        resolve(allowed);
      };
      try {
        api({ ...options, success: () => finish(true), fail: (error) => finish(false, error) });
      } catch (error) {
        finish(false, error);
      }
    });

    if (typeof this.wx.requirePrivacyAuthorize === 'function') {
      const privacyAllowed = await request(this.wx.requirePrivacyAuthorize.bind(this.wx), {});
      if (!privacyAllowed) return false;
    }
    if (typeof this.wx.authorize === 'function') {
      return request(this.wx.authorize.bind(this.wx), { scope: 'scope.record' });
    }
    return true;
  }

  startVoiceRecording() {
    this.initRecorder();
    if (!this.recorder) {
      this.state.error = '当前微信环境不支持语音录制';
      this.draw();
      return;
    }
    this.recordingCancelled = false;
    try {
      this.recorder.start({
        duration: 15000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 32000,
        format: 'mp3',
      });
    } catch (error) {
      this.state.recordingVoice = false;
      this.state.error = voiceAuthorizationError(error);
      this.draw();
    }
  }

  stopVoiceRecording(cancel = false) {
    if (!this.recorder || !this.state.recordingVoice) return;
    this.recordingCancelled = cancel;
    try {
      this.recorder.stop();
    } catch { /* best effort */ }
  }

  playVoice(message) {
    if (!message || !message.audioData || !this.wx) return;
    try {
      if (this.innerAudioContext) {
        try { this.innerAudioContext.stop(); } catch { /* ignore */ }
      }
      if (typeof this.wx.createInnerAudioContext !== 'function') return;
      this.innerAudioContext = this.wx.createInnerAudioContext();
      this.state.playingVoiceId = message.id;
      this.draw();

      const fs = this.wx.getFileSystemManager && this.wx.getFileSystemManager();
      const basePath = this.wx.env?.USER_DATA_PATH || '';
      const filePath = basePath ? `${basePath}/temp_voice_${message.id.slice(0, 8)}.mp3` : '';
      if (fs && filePath) {
        try { fs.writeFileSync(filePath, message.audioData, 'base64'); } catch { /* ignore */ }
        this.innerAudioContext.src = filePath;
      } else {
        this.innerAudioContext.src = `data:audio/mp3;base64,${message.audioData}`;
      }
      this.innerAudioContext.onEnded(() => {
        this.state.playingVoiceId = '';
        this.draw();
      });
      this.innerAudioContext.onError(() => {
        this.state.playingVoiceId = '';
        this.draw();
      });
      this.innerAudioContext.play();
    } catch {
      this.state.playingVoiceId = '';
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
        try {
          await this.transport.leave();
        } catch {
          this.transport.close();
        }
        this.wx.removeStorageSync(config.sessionStorageKey);
        this.wx.removeStorageSync(config.nicknameStorageKey);
        this.wx.removeStorageSync('mahjong_avatar_url');
        if (this.interactionTimer) clearInterval(this.interactionTimer);
        if (this.interactionTimeout) clearTimeout(this.interactionTimeout);
        this.interactionTimer = null;
        this.interactionTimeout = null;
        this.state.snapshot = null;
        this.state.screen = 'entry';
        this.state.nickname = '';
        this.state.avatarUrl = '';
        this.state.profileAuthorized = false;
        this.state.profileUpdating = false;
        this.wx.removeStorageSync(config.profileAuthorizedStorageKey);
        this.setOrientation('portrait');
        this.state.selectedTarget = null;
        this.state.selectedTileId = '';
        this.state.actionCallouts = [];
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
