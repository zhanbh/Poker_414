const { MiniProgramTransport } = require('./utils/transport');
const { storageKey } = require('./utils/games');

App({
  globalData: {
    snapshot: null,
    transport: null,
    gameId: '414',
  },

  onLaunch() {
    this.globalData.transport = new MiniProgramTransport();
  },

  getTransport() {
    if (!this.globalData.transport) this.globalData.transport = new MiniProgramTransport();
    return this.globalData.transport;
  },

  setGame(gameId) {
    this.globalData.gameId = gameId === 'texas' ? 'texas' : '414';
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
