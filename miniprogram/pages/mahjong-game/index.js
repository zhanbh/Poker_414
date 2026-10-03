const chatUtils = require('../../utils/chat');
const chatMembers = chatUtils.chatMembers;
const { commandFor } = require('../../utils/commands');
const { lostRoomIdentity, clearStoredIdentity } = require('../../utils/session');

const SEATS = ['A', 'B', 'C', 'D'];

function tileClass(tile) {
  return tile.suit === 'characters' ? 'wan' : tile.suit === 'bamboo' ? 'suo' : tile.suit === 'dots' ? 'tong' : 'honor';
}

Page({
  data: { snapshot: null, chat: [], chatMembers: [], players: [], hand: [], selectedTileId: '', canListenSelected: false, ownSeat: null, currentTurn: null, turnStatus: '', isMyTurn: false, isResponsePhase: false, wallCount: 0, availableActions: [], chiOptions: [], listenTileIds: [], listenWaits: [], baoTile: null, opponentHands: [], paymentRows: [], isListening: false, canDiscard: false, canListen: false, canHu: false, canPeng: false, canChi: false, canKong: false, canAddedKong: false, canConcealedKong: false, canPass: false, canRespondNow: false, spectator: false, settlement: null, error: '' },

  onLoad() {
    this.app = getApp();
    this.transport = this.app.getTransport();
    this.unsubscribe = this.transport.subscribe((snapshot) => this.updateSnapshot(snapshot));
    this.unsubscribeReplaced = this.transport.onReplaced(() => this.setData({ error: '该会话已在其他页面接管' }));
    this.updateSnapshot(this.app.getSnapshot());
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.unsubscribeReplaced) this.unsubscribeReplaced();
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
    if (snapshot.public.phase === 'lobby') {
      this.app.setSnapshot(snapshot);
      wx.reLaunch({ url: '/pages/mahjong-lobby/index' });
      return;
    }
    const bySeat = new Map(snapshot.public.players.map((player) => [player.seat, player]));
    const selectedTileId = snapshot.private.isListening ? (snapshot.private.discardableTileId || '') : this.data.selectedTileId;
    const availableActions = snapshot.private.availableActions || [];
    const listenTileIds = snapshot.private.listenTileIds || [];
    const isResponsePhase = Boolean(snapshot.public.pendingDiscard);
    const currentPlayer = bySeat.get(snapshot.public.currentTurn);
    const turnStatus = isResponsePhase
      ? `响应阶段 · 上手打出 ${snapshot.public.pendingDiscard.tile.label}，当前没有普通出牌权`
      : snapshot.public.currentTurn === snapshot.private.seat
        ? '轮到你出牌'
        : currentPlayer ? `轮到${currentPlayer.nickname}出牌` : '等待牌局推进';
    const isMyTurn = !isResponsePhase && snapshot.public.currentTurn === snapshot.private.seat && snapshot.public.awaitingDiscard;
    const hand = (snapshot.private.hand || []).map((tile) => ({ ...tile, tileClass: tileClass(tile), selected: tile.id === selectedTileId, listenOption: listenTileIds.includes(tile.id) }));
    const chiOptions = (snapshot.private.chiOptions || []).map((tileIds) => {
      const usedLabels = tileIds.slice(0, 2).map((id) => hand.find((tile) => tile.id === id)?.label || '?');
      const discardTile = tileIds.length > 2 ? hand.find((tile) => tile.id === tileIds[2]) : null;
      return {
        key: tileIds.join('-'),
        tileIds,
        label: discardTile ? `吃 ${usedLabels.join('、')}，听并打 ${discardTile.label}` : `吃 ${usedLabels.join('、')}`,
      };
    });
    const payments = snapshot.public.settlement && snapshot.public.settlement.payments ? snapshot.public.settlement.payments : {};
    const paymentRows = Object.keys(payments).map((seat) => ({
      seat,
      nickname: (bySeat.get(seat) || {}).nickname || seat,
      amount: payments[seat],
      amountLabel: (payments[seat] > 0 ? '+' : '') + payments[seat] + '分',
    }));
    const players = SEATS.map((seat) => bySeat.get(seat) || { seat, seatLabel: ({ A: '东家', B: '南家', C: '西家', D: '北家' })[seat], nickname: '空位', connected: false, handCount: 0, melds: [], discards: [], isDealer: false, isHost: false }).map((player) => ({
      ...player,
      discards: (player.discards || []).map((tile) => ({ ...tile, tileClass: tileClass(tile) })),
      melds: player.melds || [],
    }));
    this.app.setSnapshot(snapshot);
    this.setData({
      snapshot,
      chat: snapshot.public.chat || [],
      chatMembers: chatMembers(snapshot),
      players,
      hand,
      selectedTileId,
      canListenSelected: (snapshot.private.listenTileIds || []).includes(selectedTileId),
      ownSeat: snapshot.private.seat,
      currentTurn: snapshot.public.currentTurn,
      turnStatus,
      isMyTurn,
      isResponsePhase,
      wallCount: snapshot.public.wallCount,
      availableActions,
      chiOptions,
      listenTileIds,
      listenWaits: snapshot.private.listenWaits || [],
      baoTile: snapshot.private.baoTile || null,
      opponentHands: (snapshot.private.opponentHands || []).map((opponent) => ({
        ...opponent,
        hand: opponent.hand.map((tile) => ({ ...tile, tileClass: tileClass(tile) })),
      })),
      isListening: Boolean(snapshot.private.isListening),
      canDiscard: availableActions.includes('discard'),
      canListen: availableActions.includes('listen'),
      canHu: availableActions.includes('hu'),
      canPeng: availableActions.includes('peng'),
      canChi: availableActions.includes('chi'),
      canKong: availableActions.includes('exposed-kong'),
      canAddedKong: availableActions.includes('added-kong'),
      canConcealedKong: availableActions.includes('concealed-kong'),
      canPass: availableActions.includes('pass'),
      canRespondNow: availableActions.some((action) => ['hu', 'peng', 'chi', 'exposed-kong'].includes(action)),
      spectator: Boolean(snapshot.private.spectator),
      settlement: snapshot.public.settlement,
      paymentRows,
      error: '',
    });
  },

  onTileTap(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.availableActions.includes('discard') || this.data.isListening) return;
    this.setData({
      selectedTileId: id,
      canListenSelected: this.data.listenTileIds.includes(id),
      hand: this.data.hand.map((tile) => ({ ...tile, selected: tile.id === id })),
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

  onAction(event) {
    const type = event.currentTarget.dataset.action;
    if (type === 'discard') {
      if (!this.data.selectedTileId) return;
      this.runCommand('discard', { tileId: this.data.selectedTileId });
      this.setData({ selectedTileId: '' });
      return;
    }
    if (type === 'listen') {
      if (!this.data.selectedTileId || !this.data.listenTileIds.includes(this.data.selectedTileId)) return;
      this.runCommand('listen', { tileId: this.data.selectedTileId });
      this.setData({ selectedTileId: '', canListenSelected: false });
      return;
    }
    if (type === 'added-kong') {
      if (!this.data.selectedTileId) return;
      this.runCommand('added-kong', { tileId: this.data.selectedTileId });
      return;
    }
    if (type === 'chi') {
      const option = this.data.chiOptions[Number(event.currentTarget.dataset.index) || 0];
      if (option) this.runCommand('chi', { tileIds: option.tileIds });
      return;
    }
    this.runCommand(type, {});
  },

  onChatSend(event) { this.transport.chat(event.detail.payload).catch((error) => this.setData({ error: error.message || '发送失败' })); },

  onLeave() {
    wx.showModal({ title: '退出房间', content: '牌局进行中不能退出，确定离开吗？', success: (result) => { if (!result.confirm) return; this.app.leaveRoom().then(() => wx.reLaunch({ url: '/pages/access/index' })).catch((error) => this.setData({ error: error.message || '退出失败' })); } });
  },
});
