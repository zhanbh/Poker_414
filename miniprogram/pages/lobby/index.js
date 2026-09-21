const { commandFor } = require('../../utils/commands');

const SEATS = ['A', 'B', 'C', 'D'];

Page({
  data: {
    snapshot: null,
    players: [],
    ac: [],
    bd: [],
    roomId: '414',
    playerCount: 0,
    isHost: false,
    full: false,
    spectator: false,
    spectators: [],
    error: '',
  },

  onLoad() {
    this.app = getApp();
    this.transport = this.app.getTransport();
    this.unsubscribe = this.transport.subscribe((snapshot) => this.updateSnapshot(snapshot));
    this.updateSnapshot(this.app.getSnapshot());
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
  },

  updateSnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.public.phase !== 'lobby') {
      this.app.setSnapshot(snapshot);
      wx.reLaunch({ url: '/pages/game/index' });
      return;
    }
    const bySeat = new Map(snapshot.public.players.map((player) => [player.seat, player]));
    const players = SEATS.map((seat) => bySeat.get(seat) || { seat, nickname: '', connected: false, isHost: false });
    const own = snapshot.public.players.find((player) => player.seat === snapshot.private.seat);
    this.app.setSnapshot(snapshot);
    this.setData({
      snapshot,
      players,
      ac: players.filter((player) => player.seat === 'A' || player.seat === 'C'),
      bd: players.filter((player) => player.seat === 'B' || player.seat === 'D'),
      roomId: snapshot.public.roomId,
      playerCount: snapshot.public.players.length,
      isHost: Boolean(own && own.isHost),
      full: players.every((player) => player.nickname),
      spectator: Boolean(snapshot.private.spectator),
      spectators: snapshot.public.spectators || [],
    });
  },

  runCommand(type, payload) {
    const snapshot = this.data.snapshot;
    if (!snapshot) return;
    this.setData({ error: '' });
    this.transport.command(commandFor(snapshot, type, payload))
      .then((result) => this.updateSnapshot(result.snapshot))
      .catch((error) => this.setData({ error: error.message || '操作失败' }));
  },

  onStart() {
    this.runCommand('start-hand', {});
  },

  onLeave() {
    wx.showModal({
      title: '退出房间',
      content: '退出后将释放当前身份，确定退出吗？',
      success: (result) => {
        if (!result.confirm) return;
        this.app.leaveRoom()
          .then(() => wx.reLaunch({ url: '/pages/access/index' }))
          .catch((error) => this.setData({ error: error.message || '退出失败' }));
      },
    });
  },

  onRemove(event) {
    const seat = event.currentTarget.dataset.seat;
    wx.showModal({
      title: '移除玩家',
      content: '确定移除 ' + seat + ' 位玩家吗？',
      success: (result) => {
        if (result.confirm) this.runCommand('remove-player', { seat });
      },
    });
  },
});
