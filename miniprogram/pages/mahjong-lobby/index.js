const chatUtils = require('../../utils/chat');
const chatMembers = chatUtils.chatMembers;
const newInteractionEffect = chatUtils.newInteractionEffect;
const { commandFor } = require('../../utils/commands');
const { lostRoomIdentity, clearStoredIdentity } = require('../../utils/session');

const SEATS = ['A', 'B', 'C', 'D'];
const LABELS = { A: '东家', B: '南家', C: '西家', D: '北家' };

Page({
  data: { snapshot: null, chat: [], chatMembers: [], players: [], spectators: [], ownSeat: null, isHost: false, spectator: false, playerCount: 0, boardSize: 720, interactionEffect: null, error: '' },

  onLoad() {
    this.app = getApp();
    const screenWidth = (wx.getSystemInfoSync && wx.getSystemInfoSync().windowWidth) || 375;
    this.setData({ boardSize: Math.max(280, screenWidth - 32) });
    this.transport = this.app.getTransport();
    this.unsubscribe = this.transport.subscribe((snapshot) => this.updateSnapshot(snapshot));
    this.updateSnapshot(this.app.getSnapshot());
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
    clearTimeout(this.interactionTimer);
  },

  updateSnapshot(snapshot) {
    if (!snapshot || !snapshot.public || snapshot.public.gameId !== 'mahjong') return;
    const previous = this.data.snapshot || this.app.getSnapshot();
    if (lostRoomIdentity(previous, snapshot)) {
      clearStoredIdentity(this.app.getGame());
      this.app.setSnapshot(null);
      wx.reLaunch({ url: '/pages/access/index' });
      return;
    }
    if (snapshot.public.phase !== 'lobby') {
      this.app.setSnapshot(snapshot);
      wx.reLaunch({ url: '/pages/mahjong-game/index' });
      return;
    }
    const bySeat = new Map(snapshot.public.players.map((player) => [player.seat, player]));
    const players = SEATS.map((seat) => bySeat.get(seat) || { seat, seatLabel: LABELS[seat], nickname: '', connected: false, isHost: false });
    const own = snapshot.public.players.find((player) => player.seat === snapshot.private.seat);
    const newEffect = newInteractionEffect(snapshot, previous);
    if (newEffect) {
      clearTimeout(this.interactionTimer);
      this.interactionTimer = setTimeout(() => this.setData({ interactionEffect: null }), 1200);
    }
    this.app.setSnapshot(snapshot);
    this.setData({
      snapshot,
      chat: snapshot.public.chat || [],
      interactionEffect: newEffect || this.data.interactionEffect,
      chatMembers: chatMembers(snapshot),
      players,
      spectators: snapshot.public.spectators || [],
      ownSeat: snapshot.private.seat,
      isHost: Boolean(own && own.isHost),
      spectator: Boolean(snapshot.private.spectator),
      playerCount: snapshot.public.players.length,
    });
  },

  runCommand(type, payload) {
    const snapshot = this.data.snapshot;
    if (!snapshot) return;
    this.setData({ error: '' });
    this.transport.command(commandFor(snapshot, type, payload || {}))
      .then((result) => this.updateSnapshot(result.snapshot))
      .catch((error) => this.setData({ error: error.message || '操作失败' }));
  },

  onStart() { this.runCommand('start-hand', {}); },

  onRemove(event) {
    const seat = event.currentTarget.dataset.seat;
    wx.showModal({ title: '移除玩家', content: '确定移除这名玩家吗？', success: (result) => { if (result.confirm) this.runCommand('remove-player', { seat }); } });
  },

  onChatSend(event) { this.transport.chat(event.detail.payload).catch((error) => this.setData({ error: error.message || '发送失败' })); },

  onLeave() {
    wx.showModal({
      title: '退出房间',
      content: '退出后将释放当前身份，确定退出吗？',
      success: (result) => {
        if (!result.confirm) return;
        this.app.leaveRoom().then(() => wx.reLaunch({ url: '/pages/access/index' })).catch((error) => this.setData({ error: error.message || '退出失败' }));
      },
    });
  },
});
