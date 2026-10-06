const { MiniProgramTransport } = require('./utils/transport');
const { CLOUDBASE_ENV_ID } = require('./utils/config');
const { storageKey } = require('./utils/games');

App({
  globalData: {
    snapshot: null,
    transport: null,
    gameId: '414',
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: CLOUDBASE_ENV_ID,
        traceUser: true,
      });
    } else {
      console.error('当前微信基础库不支持 CloudBase，请升级后重试');
    }
    this.globalData.transport = new MiniProgramTransport();
  },

  getTransport() {
    if (!this.globalData.transport) this.globalData.transport = new MiniProgramTransport();
    return this.globalData.transport;
  },

  setGame(gameId) {
    this.globalData.gameId = gameId === 'mahjong' ? gameId : '414';
    this.getTransport().selectGame(this.globalData.gameId);
    wx.setStorageSync('414.selectedGame', this.globalData.gameId);
  },

  getGame() {
    return this.globalData.gameId || wx.getStorageSync('414.selectedGame') || '414';
  },

  setSnapshot(snapshot) {
    this.globalData.snapshot = snapshot;
  },

  getSnapshot() {
    return this.globalData.snapshot;
  },

  leaveRoom() {
    const gameId = this.getGame();
    return this.getTransport().leave().then(() => {
      wx.removeStorageSync(storageKey(gameId, 'sessionToken'));
      wx.removeStorageSync(storageKey(gameId, 'nickname'));
      this.globalData.snapshot = null;
      this.setGame('414');
    });
  },
});
