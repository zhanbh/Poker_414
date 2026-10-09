const config = require('./config');
const { GameTransport } = require('./transport');
const { createCommand } = require('./protocol');
const { FourOneFourRenderer } = require('./renderer');

const VALID_NICKNAME = /^[A-Za-z0-9_〇㐀-䶿一-鿿]{1,12}$/;
const INTERACTION_LABELS = { tomato: '🍅 番茄', water: '💦 泼水', heart: '💖 比心', kiss: '💋 亲吻' };

function createGuestNickname() {
  const timePart = Date.now().toString(36).slice(-2);
  const randomPart = Math.floor(Math.random() * 36 ** 3).toString(36).padStart(3, '0');
  return `牌友${(timePart + randomPart).toUpperCase()}`;
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
  return /please go to mp to announce your privacy usage|errno\s*[:=]?\s*1026|-12034/i.test(errors.join(' '));
}

class FourOneFourGameApp {
  constructor(wxApi) {
    this.wx = wxApi;
    this.canvas = wxApi.createCanvas();
    this.context = this.canvas.getContext('2d');
    this.transport = new GameTransport(wxApi);
    this.renderer = new FourOneFourRenderer(this.canvas, this.context);
    this.state = {
      screen: 'entry',
      inviteCode: '',
      nickname: '',
      avatarUrl: '',
      profileAuthorized: false,
      canRequestUserInfo: typeof this.wx.createUserInfoButton === 'function',
      chatDraft: '',
      error: '',
      statusMessage: '请输入房间邀请码',
      busy: false,
      snapshot: null,
      selectedIds: [],
      selectedTarget: null,
      chatOpen: false,
      chatTab: 'messages',
      chatMode: 'text',
      chatReadId: '',
      playingVoiceId: '',
      recordingVoice: false,
      voiceStartTime: 0,
      focus: '',
    };
    this.userInfoBtn = null;
    this.authorizationButtonError = false;
    this.visible = true;
    this.leaving = false;
    this.recovering = false;
    this.lastInteractionId = '';
    this.interactionTimer = null;
    this.interactionTimeout = null;
    this.orientation = null;
    this.pixelRatio = 1;
    this.recorder = null;
    this.recorderInitialized = false;

    this.resizeCanvas();
    this.draw = this.draw.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onTouchCancel = this.onTouchCancel.bind(this);
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

    if (typeof wxApi.onTouchStart === 'function') wxApi.onTouchStart(this.onTouchStart);
    if (typeof wxApi.onTouchEnd === 'function') wxApi.onTouchEnd(this.onTouchEnd);
    if (typeof wxApi.onTouchCancel === 'function') wxApi.onTouchCancel(this.onTouchCancel);
    if (typeof wxApi.onKeyboardInput === 'function') wxApi.onKeyboardInput(this.onKeyboardInput);
    if (typeof wxApi.onKeyboardConfirm === 'function') wxApi.onKeyboardConfirm(this.onKeyboardConfirm);
    if (typeof wxApi.onWindowResize === 'function') wxApi.onWindowResize(() => { this.resizeCanvas(); this.draw(); });
    if (typeof wxApi.onDeviceOrientationChange === 'function') wxApi.onDeviceOrientationChange(() => { this.resizeCanvas(); this.draw(); });

    if (typeof wxApi.onShow === 'function') {
      wxApi.onShow(() => {
        this.visible = true;
        if (this.transport.authenticated) this.transport.startKeepAlive();
        this.transport.activity();
        if (this.state.snapshot && !this.transport.opened) this.scheduleRecovery(100);
      });
    }

    if (typeof wxApi.onHide === 'function') {
      wxApi.onHide(() => {
        this.visible = false;
        this.transport.stopKeepAlive();
        if (this.interactionTimer) clearInterval(this.interactionTimer);
        if (this.interactionTimeout) clearTimeout(this.interactionTimeout);
        this.interactionTimer = null;
        this.interactionTimeout = null;
      });
    }

    if (wxApi.cloud && typeof wxApi.cloud.init === 'function') {
      try {
        wxApi.cloud.init({ env: config.cloudBaseEnvId, traceUser: true });
      } catch {
        /* CloudBase is optional in the simulator. */
      }
    }

    if (wxApi.getStorageSync) {
      const savedNickname = wxApi.getStorageSync(config.nicknameStorageKey) || '';
      const savedAvatar = wxApi.getStorageSync(config.avatarUrlStorageKey) || '';
      const savedAuth = wxApi.getStorageSync(config.profileAuthorizedStorageKey);
      if (savedNickname && !/^牌友[0-9A-Za-z]{5}$/.test(savedNickname)) {
        this.state.nickname = savedNickname;
        this.state.avatarUrl = savedAvatar;
        this.state.profileAuthorized = Boolean(savedAuth);
      }
    }
    this.renderer.onAssetLoaded = () => this.draw();
    this.draw();
    void this.restoreSession();
  }

  updateUserInfoButton(forceRecreate = false) {
    if (typeof this.wx.createUserInfoButton !== 'function') {
      this.state.canRequestUserInfo = false;
      this.destroyUserInfoButton();
      return;
    }
    const shouldShowOnEntry = this.state.screen === 'entry' && Boolean(this.state.inviteCode.trim()) && !this.state.profileAuthorized;
    if (!shouldShowOnEntry || this.state.busy) {
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
      const left = Math.round((vx + 100 * scale) / pr);
      const top = Math.round((vy + 510 * scale) / pr);
      const width = Math.round((340 * scale) / pr);
      const height = Math.round((56 * scale) / pr);

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
    let userInfo = result && (result.userInfo || result.data?.userInfo || result.detail?.userInfo);
    let nickname = normalizeWechatNickname(userInfo?.nickName);
    let avatarUrl = String(userInfo?.avatarUrl || '').trim();
    const resultError = apiErrorText(result);
    let userInfoError = '';
    const denied = /auth deny|user deny|cancel|拒绝/i.test(resultError);
    if ((!nickname || nickname === '微信用户') && !denied && typeof this.wx.getUserInfo === 'function') {
      userInfo = await new Promise((resolve) => {
        try {
          this.wx.getUserInfo({
            withCredentials: false,
            lang: 'zh_CN',
            success: (response) => resolve(response?.userInfo || response?.data?.userInfo),
            fail: (error) => { userInfoError = apiErrorText(error); resolve(null); },
          });
        } catch (error) { userInfoError = apiErrorText(error); resolve(null); }
      });
      nickname = normalizeWechatNickname(userInfo?.nickName);
      avatarUrl = String(userInfo?.avatarUrl || '').trim();
    }
    if (!nickname || nickname === '微信用户' || !VALID_NICKNAME.test(nickname)) {
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

  async handleEntryAction() {
    if (this.state.busy) return;
    const code = this.state.inviteCode.trim();
    if (!code) {
      this.state.error = '请输入房间邀请码';
      this.draw();
      return;
    }
    if (this.userInfoBtn) return;
    if (!this.state.profileAuthorized && typeof this.wx.createUserInfoButton === 'function') {
      this.updateUserInfoButton();
      if (!this.userInfoBtn) {
        this.state.error = this.authorizationButtonError
          ? '微信授权按钮未能创建，请重新输入邀请码后再试'
          : '正在准备微信授权，请稍后再点';
        this.draw();
      } else {
        this.state.statusMessage = '邀请码已就绪，请点击“进入房间”确认授权';
        this.draw();
      }
      return;
    }
    if (!this.state.profileAuthorized && typeof this.wx.createUserInfoButton !== 'function') {
      this.state.statusMessage = '当前微信环境不支持昵称头像授权，将使用临时昵称进入';
    }
    await this.enterRoom();
  }

  resizeCanvas() {
    const info = this.wx.getWindowInfo ? this.wx.getWindowInfo() : this.wx.getSystemInfoSync ? this.wx.getSystemInfoSync() : {};
    const width = info.windowWidth || info.screenWidth || 960;
    const height = info.windowHeight || info.screenHeight || 540;
    this.pixelRatio = info.pixelRatio || 1;
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    if (this.state.screen === 'entry') this.updateUserInfoButton(true);
  }

  draw() {
    this.renderer.draw(this.state);
  }

  setOrientation(value) {
    if (this.orientation === value) return;
    this.orientation = value;
    this.destroyUserInfoButton();
    if (typeof this.wx.setDeviceOrientation !== 'function') return;
    try {
      this.wx.setDeviceOrientation({
        value,
        success: () => { this.resizeCanvas(); this.draw(); },
        fail: () => {
          if (value === 'landscape') this.state.error = '请旋转手机横屏体验牌桌';
          this.resizeCanvas();
          this.draw();
        },
      });
    } catch {
      /* Older developer tools can lack this API; resizing remains supported. */
    }
  }

  onTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;
    const target = this.renderer.hit(
      (touch.clientX ?? touch.pageX ?? touch.x) * this.pixelRatio,
      (touch.clientY ?? touch.pageY ?? touch.y) * this.pixelRatio,
    );
    if (target?.type === 'voice-bar') {
      this.startVoiceRecording();
    }
  }

  onTouchEnd(event) {
    if (this.state.recordingVoice) {
      this.stopVoiceRecording(false);
      return;
    }
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    if (!touch) return;
    const target = this.renderer.hit(
      (touch.clientX ?? touch.pageX ?? touch.x) * this.pixelRatio,
      (touch.clientY ?? touch.pageY ?? touch.y) * this.pixelRatio,
    );

    const insideChat = target && (
      [
        'chat-panel', 'toggle-chat', 'close-chat', 'send-chat', 'chat-tab',
        'toggle-chat-mode', 'voice-bar', 'send-phrase', 'play-voice',
      ].includes(target.type) ||
      (target.type === 'input' && target.data?.field === 'chatDraft')
    );
    if (this.state.chatOpen && !insideChat) {
      this.closeChat();
      return;
    }

    const insideInteraction = target && ['interaction', 'close-interaction', 'select-player', 'remove-player'].includes(target.type);
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
    if (this.state.focus === 'chatDraft') {
      this.state.focus = '';
      if (typeof this.wx.hideKeyboard === 'function') this.wx.hideKeyboard({});
    }
    this.draw();
  }

  onKeyboardInput(event = {}) {
    const field = this.state.focus;
    if (!field) return;
    this.state[field] = String(event.value || '').slice(0, field === 'chatDraft' ? 200 : 32);
    if (field === 'inviteCode') this.updateUserInfoButton();
    this.draw();
  }

  onKeyboardConfirm(event = {}) {
    if (this.state.focus && typeof event.value === 'string') this.state[this.state.focus] = event.value;
    const field = this.state.focus;
    this.state.focus = '';
    if (typeof this.wx.hideKeyboard === 'function') this.wx.hideKeyboard({});
    this.draw();
    if (field === 'chatDraft') {
      void this.sendChat();
    } else if (field === 'inviteCode') {
      this.updateUserInfoButton(true);
      if (this.state.inviteCode.trim()) {
        void this.handleEntryAction();
      }
    }
  }

  showKeyboard(field) {
    this.state.focus = field;
    this.state.error = '';
    this.destroyUserInfoButton();
    if (typeof this.wx.showKeyboard !== 'function') {
      this.state.focus = '';
      this.state.error = '当前小游戏基础库不支持键盘输入';
      this.draw();
      return;
    }
    this.wx.showKeyboard({
      defaultValue: this.state[field] || '',
      maxLength: field === 'chatDraft' ? 200 : 32,
      multiple: false,
      confirmType: field === 'chatDraft' ? 'send' : 'go',
      fail: () => {
        this.state.focus = '';
        this.state.error = '无法打开输入键盘，请重试';
        this.draw();
      },
    });
  }

  async handleTarget(target) {
    const { type, data = {} } = target;
    if (type === 'input') { this.showKeyboard(data.field); return; }
    if (type === 'enter') { await this.handleEntryAction(); return; }
    if (type === 'leave') { await this.leaveRoom(); return; }
    if (type === 'chat-panel') return;
    if (type === 'voice-bar') return;

    if (type === 'toggle-chat') {
      this.state.chatOpen = !this.state.chatOpen;
      this.state.selectedTarget = null;
      if (this.state.chatOpen) {
        this.state.chatReadId = this.state.snapshot?.public?.chat?.slice(-1)[0]?.id || '';
      }
      this.draw();
      return;
    }
    if (type === 'close-chat') {
      this.closeChat();
      return;
    }
    if (type === 'chat-tab') {
      this.state.chatTab = data.tab;
      this.draw();
      return;
    }
    if (type === 'toggle-chat-mode') {
      this.state.chatMode = this.state.chatMode === 'voice' ? 'text' : 'voice';
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
    if (type === 'select-player') {
      this.state.selectedTarget = this.state.selectedTarget?.seat === data.seat ? null : data;
      this.draw();
      return;
    }
    if (type === 'close-interaction') {
      this.state.selectedTarget = null;
      this.draw();
      return;
    }
    if (type === 'select-card') {
      const selected = new Set(this.state.selectedIds);
      if (selected.has(data.cardId)) selected.delete(data.cardId);
      else selected.add(data.cardId);
      this.state.selectedIds = [...selected];
      this.transport.activity();
      this.draw();
      return;
    }
    if (type === 'send-chat') {
      await this.sendChat();
      return;
    }
    if (type === 'interaction') {
      await this.sendInteraction(data.interaction, data.target);
      return;
    }
    if (type === 'remove-player') {
      this.confirm('移除玩家', `确定移除 ${this.state.selectedTarget?.nickname || ''} 吗？`, () =>
        this.runCommand('remove-player', { seat: data.seat }));
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

  async sendInteraction(interaction, explicitTarget = null) {
    let target = explicitTarget || this.state.selectedTarget;
    if (!target) {
      const players = this.state.snapshot?.public?.players || [];
      const me = this.state.snapshot?.private?.seat;
      const other = players.find((p) => p.seat !== me) || players[0];
      if (other) target = { seat: other.seat, nickname: other.nickname };
    }
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

  initRecorder() {
    if (this.recorderInitialized || !this.wx || typeof this.wx.getRecorderManager !== 'function') return;
    this.recorderInitialized = true;
    try {
      this.recorder = this.wx.getRecorderManager();
      this.recorder.onStop((res) => {
        if (!this.state.recordingVoice) return;
        this.state.recordingVoice = false;
        const durationSec = Math.max(1, Math.min(60, Math.round((Date.now() - this.state.voiceStartTime) / 1000)));
        if (durationSec < 1) {
          this.state.error = '说话时间太短';
          this.draw();
          return;
        }
        if (res && res.tempFilePath && typeof this.wx.getFileSystemManager === 'function') {
          try {
            const fs = this.wx.getFileSystemManager();
            const base64 = fs.readFileSync(res.tempFilePath, 'base64');
            void this.transport.chat({
              kind: 'voice',
              duration: durationSec,
              audioData: base64,
            });
          } catch (readErr) {
            this.state.error = readErr.message || '语音读取失败';
            this.draw();
          }
        }
        this.draw();
      });
      this.recorder.onError((err) => {
        this.state.recordingVoice = false;
        this.state.error = err.errMsg || '录音失败';
        this.draw();
      });
    } catch {
      this.recorder = null;
    }
  }

  startVoiceRecording() {
    this.initRecorder();
    if (!this.recorder) return;
    this.state.recordingVoice = true;
    this.state.voiceStartTime = Date.now();
    this.draw();
    try {
      this.recorder.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3',
      });
    } catch {
      this.state.recordingVoice = false;
      this.draw();
    }
  }

  stopVoiceRecording(cancelled = false) {
    if (!this.state.recordingVoice || !this.recorder) return;
    if (cancelled) {
      this.state.recordingVoice = false;
      try { this.recorder.stop(); } catch { /* ignore */ }
      this.draw();
      return;
    }
    try { this.recorder.stop(); } catch { /* ignore */ }
  }

  playVoice(message) {
    if (!message || !message.audioData || !this.wx || typeof this.wx.createInnerAudioContext !== 'function') return;
    if (this.state.playingVoiceId === message.id) return;
    try {
      const fs = typeof this.wx.getFileSystemManager === 'function' ? this.wx.getFileSystemManager() : null;
      let filePath = '';
      if (fs && typeof this.wx.env?.USER_DATA_PATH === 'string') {
        filePath = `${this.wx.env.USER_DATA_PATH}/voice_${message.id || Date.now()}.mp3`;
        fs.writeFileSync(filePath, message.audioData, 'base64');
      }
      const audioCtx = this.wx.createInnerAudioContext();
      if (filePath) audioCtx.src = filePath;
      this.state.playingVoiceId = message.id;
      this.draw();
      audioCtx.onEnded(() => {
        this.state.playingVoiceId = '';
        audioCtx.destroy();
        this.draw();
      });
      audioCtx.onError(() => {
        this.state.playingVoiceId = '';
        audioCtx.destroy();
        this.draw();
      });
      audioCtx.play();
    } catch {
      this.state.playingVoiceId = '';
      this.draw();
    }
  }

  confirm(title, content, onConfirm) {
    if (typeof this.wx.showModal !== 'function') { onConfirm(); return; }
    this.wx.showModal({ title, content, success: (result) => { if (result.confirm) onConfirm(); } });
  }

  async enterRoom(options = {}) {
    const inviteCode = this.state.inviteCode.trim();
    if (!inviteCode) { this.state.error = '请输入邀请码'; this.draw(); return; }

    const profileAuthorized = options.profileAuthorized ?? this.state.profileAuthorized;
    let nickname = String(options.nickname ?? (profileAuthorized
      ? (this.state.nickname || (this.wx.getStorageSync && this.wx.getStorageSync(config.nicknameStorageKey)) || '')
      : '')).trim();
    let avatarUrl = String(options.avatarUrl ?? (profileAuthorized
      ? (this.state.avatarUrl || (this.wx.getStorageSync && this.wx.getStorageSync(config.avatarUrlStorageKey)) || '')
      : '')).trim();
    if (profileAuthorized) nickname = normalizeWechatNickname(nickname);
    const generatedNickname = !nickname || nickname === '微信用户' || !VALID_NICKNAME.test(nickname);
    if (generatedNickname) nickname = createGuestNickname();
    if (!profileAuthorized) avatarUrl = '';

    this.state.nickname = nickname;
    this.state.avatarUrl = avatarUrl;
    this.state.profileAuthorized = Boolean(profileAuthorized && !generatedNickname);
    this.state.busy = true;
    this.state.error = '';
    this.state.statusMessage = '正在连接并加入 414 房间…';
    this.destroyUserInfoButton();
    this.draw();

    try {
      const auth = await this.transport.login(inviteCode);
      const snapshot = await this.transport.join(nickname, avatarUrl);
      if (this.wx.setStorageSync) {
        this.wx.setStorageSync(config.sessionStorageKey, auth.sessionToken);
        this.wx.setStorageSync(config.nicknameStorageKey, nickname);
        this.wx.setStorageSync(config.avatarUrlStorageKey, avatarUrl);
        this.wx.setStorageSync(config.profileAuthorizedStorageKey, Boolean(this.state.profileAuthorized));
      }
      this.updateSnapshot(snapshot);
    } catch (error) {
      this.state.busy = false;
      this.state.statusMessage = '请检查邀请码、网络或小游戏合法域名配置';
      this.state.error = error.message || '无法进入房间';
      if (generatedNickname) this.state.nickname = '';
      this.updateUserInfoButton();
      this.draw();
    }
  }

  updateSnapshot(snapshot) {
    if (!snapshot?.public || snapshot.public.roomId !== '414' || !Array.isArray(snapshot.public.players)) return;
    this.destroyUserInfoButton();
    const latestMessage = (snapshot.public.chat || []).slice(-1)[0];
    if ((latestMessage?.kind === 'interaction' || latestMessage?.kind === 'phrase') && latestMessage.id !== this.lastInteractionId) {
      this.lastInteractionId = latestMessage.id;
      if (this.interactionTimer) clearInterval(this.interactionTimer);
      if (this.interactionTimeout) clearTimeout(this.interactionTimeout);
      this.interactionTimer = setInterval(() => this.draw(), 33);
      this.interactionTimeout = setTimeout(() => {
        if (this.interactionTimer) clearInterval(this.interactionTimer);
        this.interactionTimer = null;
        this.interactionTimeout = null;
      }, 3600);
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
    const avatarUrl = this.wx.getStorageSync?.(config.avatarUrlStorageKey) || '';
    if (!token || !nickname) return;
    this.state.nickname = nickname;
    this.state.avatarUrl = avatarUrl;
    this.state.busy = true;
    this.state.statusMessage = '正在恢复房间会话…';
    this.draw();
    try {
      await this.transport.login('', token);
      const snapshot = await this.transport.join(nickname, avatarUrl);
      this.updateSnapshot(snapshot);
    } catch {
      this.state.busy = false;
      this.state.statusMessage = '无法恢复上次会话，请输入邀请码重新进入';
      this.updateUserInfoButton();
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
    const avatarUrl = this.wx.getStorageSync?.(config.avatarUrlStorageKey) || this.state.avatarUrl || '';
    if (!token || !nickname) return;
    this.recovering = true;
    try {
      await this.transport.login('', token);
      this.updateSnapshot(await this.transport.join(nickname, avatarUrl));
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
        this.state.inviteCode = '';
        this.state.selectedIds = [];
        this.state.selectedTarget = null;
        this.state.chatOpen = false;
        this.state.error = '';
        this.state.statusMessage = '已退出房间，可重新进入';
        this.setOrientation('portrait');
        this.updateUserInfoButton();
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
