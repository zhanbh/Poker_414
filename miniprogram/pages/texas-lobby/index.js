const chatUtils = require('../../utils/chat');
const chatMembers = chatUtils.chatMembers || ((snapshot) => (snapshot.public.players || []).map((player) => ({ id: player.seat, seat: player.seat, nickname: player.nickname, label: player.positionLabel || player.seat + ' 位' })));
const { commandFor } = require('../../utils/commands');

const SEATS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

Page({
  data: {
    snapshot: null,
    chat: [],
    chatMembers: [],
    players: [],
    spectators: [],
    ownSeat: null,
    isHost: false,
    spectator: false,
    playerCount: 0,
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
    if (!snapshot || !snapshot.public || snapshot.public.gameId !== 'texas') return;
    if (snapshot.public.phase !== 'lobby') {
      this.app.setSnapshot(snapshot);
      wx.reLaunch({ url: '/pages/texas-game/index' });
      return;
    }
    const bySeat = new Map(snapshot.public.players.map((player) => [player.seat, player]));
    const own = snapshot.public.players.find((player) => player.seat === snapshot.private.seat);
    const players = SEATS.map((seat) => bySeat.get(seat) || {
      seat,
      positionLabel: '空位',
      nickname: '',
      connected: false,
      stack: 1000,
      totalBet: 0,
      roundBet: 0,
      folded: false,
      allIn: false,
      isHost: false,
    }).map((player) => ({
      ...player,
      canKick: Boolean(player.nickname && own && player.seat !== own.seat && (own.isHost || !player.connected)),
    }));
    this.app.setSnapshot(snapshot);
    this.setData({
      snapshot,
      chat: snapshot.public.chat || [],
      chatMembers: chatMembers(snapshot),
      players,
      spectators: snapshot.public.spectators || [],
      ownSeat: snapshot.private.seat,
      isHost: Boolean(own && own.isHost),
      spectator: Boolean(snapshot.private.spectator),
      playerCount: snapshot.public.players.length,
    });
  },

  onChatSend(event) {
    this.transport.chat(event.detail.payload)
      .catch((error) => this.setData({ error: error.message || '发送失败' }));
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

  onRemove(event) {
    const seat = event.currentTarget.dataset.seat;
    wx.showModal({
      title: '移除玩家',
      content: '确定移除这名玩家吗？',
      success: (result) => { if (result.confirm) this.runCommand('remove-player', { seat }); },
    });
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
});
