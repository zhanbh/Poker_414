const { MiniProgramTransport } = require('./utils/transport');

App({
  globalData: {
    snapshot: null,
    transport: null,
  },

  onLaunch() {
    this.globalData.transport = new MiniProgramTransport();
  },

  getTransport() {
    if (!this.globalData.transport) this.globalData.transport = new MiniProgramTransport();
    return this.globalData.transport;
  },

  setSnapshot(snapshot) {
    this.globalData.snapshot = snapshot;
  },

  getSnapshot() {
    return this.globalData.snapshot;
  },
});
