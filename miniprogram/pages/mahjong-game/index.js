const chatUtils = require('../../utils/chat');
const chatMembers = chatUtils.chatMembers;
const { commandFor } = require('../../utils/commands');
const { lostRoomIdentity, clearStoredIdentity } = require('../../utils/session');

const SEATS = ['A', 'B', 'C', 'D'];

function seatPosition(viewerSeat, seat) {
  const viewerIndex = SEATS.indexOf(viewerSeat || 'A');
  const offset = (SEATS.indexOf(seat) - viewerIndex + SEATS.length) % SEATS.length;
  return ['bottom', 'left', 'top', 'right'][offset];
}

function tileClass(tile) {
  if (tile.suit === 'characters') return 'wan';
  if (tile.suit === 'bamboo') return 'suo';
  if (tile.suit === 'dots') return 'tong';
  return tile.suit === 'winds' ? 'honor wind' : `honor dragon-${tile.rank}`;
}

const tileDecor = (tile) => ({
  ...tile,
  tileClass: tileClass(tile),
  rankDisplay: typeof tile.rank === 'number' ? String(tile.rank) : '',
  rankChinese: typeof tile.rank === 'number' ? ['','一','二','三','四','五','六','七','八','九'][tile.rank] : '',
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
  return (layouts[rank] || []).map(([left, top], index) => ({ left, top, id: index, color: ['green', 'blue', 'red'][index % 3] }));
}

Page({
  data: { snapshot: null, chat: [], chatMembers: [], players: [], hand: [], discardRiver: [], selectedTileId: '', canListenSelected: false, listenOptions: [], listenPreview: null, ownSeat: null, currentTurn: null, turnStatus: '', isMyTurn: false, isResponsePhase: false, isWaitingForPriority: false, wallCount: 0, wallSides: [], boardSize: 720, diceRoll: null, diceLabel: '掷骰', animationStage: '', autoDiscardPending: false, availableActions: [], chiOptions: [], chiPickerOpen: false, listenTileIds: [], opponentHands: [], paymentRows: [], isListening: false, canDiscard: false, canListen: false, canHu: false, canPeng: false, canChi: false, canKong: false, canAddedKong: false, canConcealedKong: false, canPass: false, canRespondNow: false, spectator: false, settlement: null, settlementDescription: '', error: '' },

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
    const listenOptions = (snapshot.private.listenOptions || []).map((option) => ({
      discardTileId: option.discardTileId,
      waits: option.waits.map(tileDecor),
    }));
    const isListening = Boolean(snapshot.private.isListening);
    const isResponsePhase = Boolean(snapshot.public.pendingDiscard);
    const isWaitingForPriority = Boolean(snapshot.private.seat && !snapshot.private.spectator && isResponsePhase && snapshot.public.responseSeats.includes(snapshot.private.seat) && availableActions.length === 0);
    const currentPlayer = bySeat.get(snapshot.public.currentTurn);
    const turnStatus = isResponsePhase
      ? `响应阶段 · 上手打出 ${snapshot.public.pendingDiscard.tile.label}，当前没有普通出牌权`
      : snapshot.public.currentTurn === snapshot.private.seat
        ? '轮到你出牌'
        : currentPlayer ? `轮到${currentPlayer.nickname}出牌` : '等待牌局推进';
    const isMyTurn = !isResponsePhase && snapshot.public.currentTurn === snapshot.private.seat && snapshot.public.awaitingDiscard;
    const drawnTileId = snapshot.private.drawnTileId || '';
    const rawHand = snapshot.private.hand || [];
    const drawnTile = rawHand.find((tile) => tile.id === drawnTileId);
    const orderedHand = drawnTile ? [...rawHand.filter((tile) => tile.id !== drawnTileId), drawnTile] : rawHand;
    const hand = orderedHand.map((tile) => ({ ...tileDecor(tile), selected: tile.id === selectedTileId, listenOption: listenTileIds.includes(tile.id), drawn: tile.id === drawnTileId }));
    const listenPreview = isListening
      ? {
        waits: (snapshot.private.listenWaits || []).map(tileDecor),
        baoTile: snapshot.private.baoTile ? tileDecor(snapshot.private.baoTile) : null,
      }
      : listenOptions.find((option) => option.discardTileId === selectedTileId) || null;
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
    const exposedHands = new Map([
      ...(snapshot.private.opponentHands || []),
      ...(snapshot.public.revealedHands || []),
    ].map((opponent) => [opponent.seat, opponent.hand]));
    const players = SEATS.map((seat) => bySeat.get(seat) || { seat, seatLabel: ({ A: '東家', B: '南家', C: '西家', D: '北家' })[seat], nickname: '空位', connected: false, handCount: 0, melds: [], discards: [], isDealer: false, isHost: false }).map((player) => ({
      ...player,
      position: seatPosition(snapshot.private.seat, player.seat),
      avatarLabel: player.nickname ? player.nickname.slice(0, 1) : player.seat,
      discards: (player.discards || []).map((tile) => ({ ...tileDecor(tile), isPendingDiscard: snapshot.public.pendingDiscard && snapshot.public.pendingDiscard.tile.id === tile.id })),
      melds: (player.melds || []).map((meld) => ({ ...meld, tiles: meld.tiles.map(tileDecor) })),
      revealedHand: (exposedHands.get(player.seat) || []).map(tileDecor),
    }));
    const discardRiver = (snapshot.public.discardRiver || []).map((discard) => ({
      ...tileDecor(discard.tile),
      isPendingDiscard: snapshot.public.pendingDiscard && snapshot.public.pendingDiscard.tile.id === discard.tile.id,
    }));
    const settlementDescription = snapshot.public.settlement && snapshot.public.settlement.type === 'draw'
      ? '流局 · 原庄家不变'
      : snapshot.public.settlement
        ? `${snapshot.public.settlement.winnerNickname || snapshot.public.settlement.winnerSeat} 获胜 · ${snapshot.public.settlement.winPattern === 'big-wind' ? '大风' : snapshot.public.settlement.winPattern === 'bao' ? '胡宝' : snapshot.public.settlement.type === 'self-draw' ? '自摸' : '点炮'}`
        : '';
    const wallCount = snapshot.public.wallCount;
    const wallSides = (snapshot.public.wallLayout && snapshot.public.wallLayout.sides || []).map((side) => {
      const tiles = [
        ...Array.from({ length: side.liveTiles }, (_, index) => ({ id: `${side.seat}-live-${index}`, replacement: false })),
        ...Array.from({ length: side.replacementTiles }, (_, index) => ({ id: `${side.seat}-replacement-${index}`, replacement: true })),
      ];
      return {
        position: seatPosition(snapshot.private.seat, side.seat),
        seat: side.seat,
        isBreakSide: snapshot.public.wallLayout.breakSide === side.seat,
        stacks: Array.from({ length: Math.ceil(tiles.length / 2) }, (_, index) => ({
          id: `${side.seat}-stack-${index}`,
          tiles: tiles.slice(index * 2, index * 2 + 2),
        })),
      };
    });
    this.app.setSnapshot(snapshot);
    this.setData({
      snapshot,
      chat: snapshot.public.chat || [],
      chatMembers: chatMembers(snapshot),
      players,
      hand,
      discardRiver,
      selectedTileId,
      canListenSelected: (snapshot.private.listenTileIds || []).includes(selectedTileId),
      ownSeat: snapshot.private.seat,
      currentTurn: snapshot.public.currentTurn,
      turnStatus,
      isMyTurn,
      isResponsePhase,
      isWaitingForPriority,
      wallCount,
      wallSides,
      diceRoll: snapshot.public.diceRoll,
      diceLabel: snapshot.public.diceRoll ? `${snapshot.public.diceRoll[0]} · ${snapshot.public.diceRoll[1]}` : '掷骰',
      autoDiscardPending: Boolean(snapshot.private.autoDiscardPending),
      availableActions,
      chiOptions,
      chiPickerOpen: false,
      listenTileIds,
      listenOptions,
      listenPreview,
      opponentHands: [],
      isListening,
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
      settlementDescription,
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
      listenPreview: this.data.listenOptions.find((option) => option.discardTileId === id) || null,
      hand: this.data.hand.map((tile) => ({ ...tile, selected: tile.id === id })),
    });
  },

  onTileTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch || !this.data.isMyTurn || this.data.isListening) return;
    this.tileDrag = { id: event.currentTarget.dataset.id, x: touch.clientX, y: touch.clientY, moved: false };
  },

  onTileTouchMove(event) {
    const drag = this.tileDrag;
    const touch = event.touches && event.touches[0];
    if (drag && touch && Math.hypot(touch.clientX - drag.x, touch.clientY - drag.y) > 14) drag.moved = true;
  },

  onTileTouchEnd(event) {
    const drag = this.tileDrag;
    this.tileDrag = null;
    const touch = event.changedTouches && event.changedTouches[0];
    if (!drag || !drag.moved || !touch || !this.data.isMyTurn || this.data.isListening || !this.data.canDiscard) return;
    wx.createSelectorQuery().select('.mahjong-table').boundingClientRect((rect) => {
      if (!rect || touch.clientX < rect.left || touch.clientX > rect.right || touch.clientY < rect.top || touch.clientY > rect.bottom) return;
      this.runCommand('discard', { tileId: drag.id });
      this.setData({ selectedTileId: '', hand: this.data.hand.map((tile) => ({ ...tile, selected: false })) });
    }).exec();
  },

  onTableTap() {
    if (!this.data.isMyTurn || this.data.isListening || !this.data.canDiscard || !this.data.selectedTileId) return;
    this.runCommand('discard', { tileId: this.data.selectedTileId });
    this.setData({ selectedTileId: '', hand: this.data.hand.map((tile) => ({ ...tile, selected: false })) });
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
    if (type !== 'chi-intent') this.setData({ chiPickerOpen: false });
    if (type === 'discard') {
      if (!this.data.selectedTileId) return;
      this.runCommand('discard', { tileId: this.data.selectedTileId });
      this.setData({ selectedTileId: '' });
      return;
    }
    if (type === 'listen') {
      if (!this.data.selectedTileId || !this.data.listenTileIds.includes(this.data.selectedTileId)) return;
      this.runCommand('listen', { tileId: this.data.selectedTileId });
      this.setData({ selectedTileId: '', canListenSelected: false, listenPreview: null });
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
      this.setData({ chiPickerOpen: false });
      return;
    }
    if (type === 'chi-intent') {
      if (this.data.chiOptions.length === 1) {
        this.runCommand('chi', { tileIds: this.data.chiOptions[0].tileIds });
        return;
      }
      this.setData({ chiPickerOpen: !this.data.chiPickerOpen });
      return;
    }
    this.runCommand(type, {});
  },

  onChatSend(event) { this.transport.chat(event.detail.payload).catch((error) => this.setData({ error: error.message || '发送失败' })); },

  onLeave() {
    wx.showModal({ title: '退出房间', content: '牌局进行中不能退出，确定离开吗？', success: (result) => { if (!result.confirm) return; this.app.leaveRoom().then(() => wx.reLaunch({ url: '/pages/access/index' })).catch((error) => this.setData({ error: error.message || '退出失败' })); } });
  },
});
