const { getServerOrigin } = require('../../utils/config');

const SESSION_KEY = '414.sessionToken';
const NICKNAME_KEY = '414.nickname';

Page({
  data: {
    inviteCode: '',
    nickname: '',
    role: 'player',
    busy: false,
    error: '',
    serverOrigin: '',
  },

  onLoad() {
    this.app = getApp();
    this.transport = this.app.getTransport();
    this.setData({ serverOrigin: getServerOrigin() });
    this.unsubscribe = this.transport.subscribe((snapshot) => this.onSnapshot(snapshot));
    this.restoreSession();
  },


  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
  },

  onInviteCodeInput(event) {
    this.setData({ inviteCode: event.detail.value });
  },

  onNicknameInput(event) {
    this.setData({ nickname: event.detail.value });
  },

  onRoleChange(event) {
    this.setData({ role: event.detail.value });
  },

  async restoreSession() {
    const sessionToken = wx.getStorageSync(SESSION_KEY);
    const nickname = wx.getStorageSync(NICKNAME_KEY);
    if (!sessionToken || !nickname) return;
    this.setData({ nickname, busy: true });
    try {
      await this.transport.login('', sessionToken);
      const snapshot = await this.transport.join(nickname, '414', this.data.role);
      this.enterSnapshot(snapshot);
    } catch {
      wx.removeStorageSync(SESSION_KEY);
      wx.removeStorageSync(NICKNAME_KEY);
    } finally {
      this.setData({ busy: false });
    }
  },

  async onSubmit() {
    const inviteCode = this.data.inviteCode.trim();
    const nickname = this.data.nickname.trim();
    if (!inviteCode || !nickname) {
      this.setData({ error: '请输入邀请码和昵称' });
      return;
    }
    this.setData({ busy: true, error: '' });
    try {
      const auth = await this.transport.login(inviteCode);
      wx.setStorageSync(SESSION_KEY, auth.sessionToken);
      wx.setStorageSync(NICKNAME_KEY, nickname);
      const snapshot = await this.transport.join(nickname, '414', this.data.role);
      this.enterSnapshot(snapshot);
    } catch (error) {
      this.setData({ error: error.message || '进入房间失败' });
    } finally {
      this.setData({ busy: false });
    }
  },

  onSnapshot(snapshot) {
    if (snapshot) this.enterSnapshot(snapshot);
  },

  enterSnapshot(snapshot) {
    this.app.setSnapshot(snapshot);
    const page = snapshot.public.phase === 'lobby' ? '/pages/lobby/index' : '/pages/game/index';
    wx.reLaunch({ url: page });
  },
});
