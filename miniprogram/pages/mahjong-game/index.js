const chatUtils = require('../../utils/chat');
const chatMembers = chatUtils.chatMembers;
const { commandFor } = require('../../utils/commands');
const { lostRoomIdentity, clearStoredIdentity } = require('../../utils/session');

const SEATS = ['A', 'B', 'C', 'D'];

function tileClass(tile) {
  return tile.suit === 'characters' ? 'wan' : tile.suit === 'bamboo' ? 'suo' : tile.suit === 'dots' ? 'tong' : 'honor';
}

const tileDecor = (tile) => ({
  ...tile,
  tileClass: tileClass(tile),
  rankDisplay: typeof tile.rank === 'number' ? String(tile.rank) : '',
  suitDisplay: tile.suit === 'characters' ? '萬子' : tile.suit === 'bamboo' ? '索子' : tile.suit === 'dots' ? '筒子' : tile.suit === 'winds' ? '風牌' : '箭牌',
  isCharacters: tile.suit === 'characters',
  isDots: tile.suit === 'dots',
  isNumbered: typeof tile.rank === 'number',
  motifs: typeof tile.rank === 'number' ? makeMotifs(tile.rank) : [],
});

function makeMotifs(rank) {
  const layouts = {
    1: [[50, 50]], 2: [[32, 23], [68, 77]], 3: [[32, 23], [50, 50], [68, 77]],
    4: [[32, 23], [68, 23], [32, 77], [68, 77]], 5: [[32, 23], [68, 23], [50, 50], [32, 77], [68, 77]],
    6: [[32, 20], [68, 20], [32, 50], [68, 50], [32, 80], [68, 80]],
    7: [[32, 15], [68, 15], [32, 42], [68, 42], [32, 69], [68, 69], [50, 92]],
    8: [[32, 14], [68, 14], [32, 38], [68, 38], [32, 62], [68, 62], [32, 86], [68, 86]],
    9: [[32, 14], [50, 14], [68, 14], [32, 50], [50, 50], [68, 50], [32, 86], [50, 86], [68, 86]],
  };
  return (layouts[rank] || []).map(([left, top], index) => ({ left, top, id: index }));
}

Page({
  data: { snapshot: null, chat: [], chatMembers: [], players: [], hand: [], selectedTileId: '', canListenSelected: false, ownSeat: null, currentTurn: null, turnStatus: '', isMyTurn: false, isResponsePhase: false, wallCount: 0, wallSides: [], boardSize: 720, diceRoll: null, diceLabel: '掷骰', animationStage: '', autoDiscardPending: false, availableActions: [], chiOptions: [], listenTileIds: [], listenWaits: [], baoTile: null, opponentHands: [], paymentRows: [], isListening: false, canDiscard: false, canListen: false, canHu: false, canPeng: false, canChi: false, canKong: false, canAddedKong: false, canConcealedKong: false, canPass: false, canRespondNow: false, spectator: false, settlement: null, error: '' },

  onLoad() {
    this.app = getApp();
    const screenWidth = (wx.getSystemInfoSync && wx.getSystemInfoSync().windowWidth) || 375;
    this.setData({ boardSize: Math.max(280, screenWidth - 24) });
    this.transport = this.app.getTransport();
    this.unsubscribe = this.transport.subscribe((snapshot) => this.updateSnapshot(snapshot));
    this.unsubscribeReplaced = this.transport.onReplaced(() => this.setData({ error: '该会话已在其他页面接管' }));
    this.updateSnapshot(this.app.getSnapshot());
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.unsubscribeReplaced) this.unsubscribeReplaced();
    clearTimeout(this.diceTimer);
    clearTimeout(this.dealTimer);
  },

  playDealAnimation(handNumber) {
    if (this.animatedHandNumber === handNumber) return;
    this.animatedHandNumber = handNumber;
    clearTimeout(this.diceTimer);
    clearTimeout(this.dealTimer);
    this.setData({ animationStage: 'dice' });
    this.diceTimer = setTimeout(() => this.setData({ animationStage: 'deal' }), 850);
    this.dealTimer = setTimeout(() => this.setData({ animationStage: '' }), 1850);
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
    if (snapshot.public.phase === 'playing') this.playDealAnimation(snapshot.public.handNumber);
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
    const hand = (snapshot.private.hand || []).map((tile) => ({ ...tileDecor(tile), selected: tile.id === selectedTileId, listenOption: listenTileIds.includes(tile.id) }));
    const chiOptions = (snapshot.private.chiOptions || []).map((tileIds) => {
      return {
        key: tileIds.join('-'),
        tileIds,
        tiles: [snapshot.public.pendingDiscard && tileDecor(snapshot.public.pendingDiscard.tile), ...tileIds.map((id) => hand.find((tile) => tile.id === id))].filter(Boolean),
      };
    });
    const payments = snapshot.public.settlement && snapshot.public.settlement.payments ? snapshot.public.settlement.payments : {};
    const paymentRows = Object.keys(payments).map((seat) => ({
      seat,
      nickname: (bySeat.get(seat) || {}).nickname || seat,
      amount: payments[seat],
      amountLabel: (payments[seat] > 0 ? '+' : '') + payments[seat] + '分',
    }));
    const exposedHands = new Map((snapshot.private.opponentHands || []).map((opponent) => [opponent.seat, opponent.hand]));
    const players = SEATS.map((seat) => bySeat.get(seat) || { seat, seatLabel: ({ A: '東家', B: '南家', C: '西家', D: '北家' })[seat], nickname: '空位', connected: false, handCount: 0, melds: [], discards: [], isDealer: false, isHost: false }).map((player) => ({
      ...player,
      discards: (player.discards || []).map(tileDecor),
      melds: (player.melds || []).map((meld) => ({ ...meld, tiles: meld.tiles.map(tileDecor) })),
      revealedHand: (exposedHands.get(player.seat) || []).map(tileDecor),
      hiddenHand: Array.from({ length: player.seat === snapshot.private.seat ? 0 : Math.min(player.handCount, 14) }, (_, index) => ({ id: `${player.seat}-hidden-${index}` })),
    }));
    const wallCount = snapshot.public.wallCount;
    const wallSides = Array.from({ length: 4 }, (_, side) => ({
      position: ['north', 'east', 'south', 'west'][side],
      tiles: Array.from({ length: Math.floor(wallCount / 4) + (side < wallCount % 4 ? 1 : 0) }, (_, index) => ({ id: `${side}-${index}` })),
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
      wallCount,
      wallSides,
      diceRoll: snapshot.public.diceRoll,
      diceLabel: snapshot.public.diceRoll ? `${snapshot.public.diceRoll[0]} · ${snapshot.public.diceRoll[1]}` : '掷骰',
      autoDiscardPending: Boolean(snapshot.private.autoDiscardPending),
      availableActions,
      chiOptions,
      listenTileIds,
      listenWaits: snapshot.private.listenWaits || [],
      baoTile: snapshot.private.baoTile || null,
      opponentHands: [],
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
    if ((!this.data.availableActions.includes('discard') && !this.data.availableActions.includes('listen')) || this.data.isListening) return;
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
