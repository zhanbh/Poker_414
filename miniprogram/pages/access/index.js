const { getServerOrigin } = require('../../utils/config');
const { GAME_SELECTIONS, isTexasSnapshot, storageKey } = require('../../utils/games');

Page({
  data: {
    gameId: '414',
    gameOptions: GAME_SELECTIONS,
    inviteCode: '',
    nickname: '',
    busy: false,
    error: '',
    serverOrigin: '',
  },

  onLoad() {
    this.app = getApp();
    this.transport = this.app.getTransport();
    const gameId = wx.getStorageSync('414.selectedGame') === 'texas' ? 'texas' : '414';
    this.app.setGame(gameId);
    this.setData({ gameId, serverOrigin: getServerOrigin() });
    this.unsubscribe = this.transport.subscribe((snapshot) => this.onSnapshot(snapshot));
    this.restoreSession();
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
  },

  onGameChange(event) {
    const gameId = event.currentTarget.dataset.gameId === 'texas' ? 'texas' : '414';
    this.app.setGame(gameId);
    this.transport.selectGame(gameId);
    this.setData({ gameId, error: '' });
  },

  onInviteCodeInput(event) {
    this.setData({ inviteCode: event.detail.value });
  },

  onNicknameInput(event) {
    this.setData({ nickname: event.detail.value });
  },

  roomId() {
    return this.data.gameId === 'texas' ? 'texas' : '414';
  },

  async restoreSession() {
    const gameId = this.data.gameId;
    const sessionToken = wx.getStorageSync(storageKey(gameId, 'sessionToken'));
    const nickname = wx.getStorageSync(storageKey(gameId, 'nickname'));
    if (!sessionToken || !nickname) return;
    this.transport.selectGame(gameId);
    this.setData({ nickname, busy: true });
    try {
      await this.transport.login('', sessionToken);
      const snapshot = await this.transport.join(nickname, this.roomId());
      this.enterSnapshot(snapshot);
    } catch {
      wx.removeStorageSync(storageKey(gameId, 'sessionToken'));
      wx.removeStorageSync(storageKey(gameId, 'nickname'));
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
    const gameId = this.data.gameId;
    this.app.setGame(gameId);
    this.transport.selectGame(gameId);
    this.setData({ busy: true, error: '' });
    try {
      const auth = await this.transport.login(inviteCode);
      wx.setStorageSync(storageKey(gameId, 'sessionToken'), auth.sessionToken);
      wx.setStorageSync(storageKey(gameId, 'nickname'), nickname);
      const snapshot = await this.transport.join(nickname, this.roomId());
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
    const texas = isTexasSnapshot(snapshot);
    const page = texas
      ? (snapshot.public.phase === 'lobby' ? '/pages/texas-lobby/index' : '/pages/texas-game/index')
      : (snapshot.public.phase === 'lobby' ? '/pages/lobby/index' : '/pages/game/index');
    wx.reLaunch({ url: page });
  },
});
