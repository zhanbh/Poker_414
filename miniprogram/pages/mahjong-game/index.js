const chatUtils = require('../../utils/chat');
const chatMembers = chatUtils.chatMembers;
const { commandFor } = require('../../utils/commands');
const { lostRoomIdentity, clearStoredIdentity } = require('../../utils/session');

const SEATS = ['A', 'B', 'C', 'D'];
const HONOR_SPRITE_COLUMNS = { red: 4 };

function seatPosition(viewerSeat, seat) {
  const viewerIndex = SEATS.indexOf(viewerSeat || 'A');
  const offset = (SEATS.indexOf(seat) - viewerIndex + SEATS.length) % SEATS.length;
  return ['bottom', 'left', 'top', 'right'][offset];
}

function tileClass(tile) {
  if (tile.suit === 'characters') return 'wan';
  if (tile.suit === 'bamboo') return 'suo';
  if (tile.suit === 'dots') return 'tong';
  return `honor dragon-${tile.rank}`;
}

const tileDecor = (tile) => {
  const row = tile.suit === 'dots' ? 0 : tile.suit === 'bamboo' ? 1 : tile.suit === 'characters' ? 2 : 3;
  const column = typeof tile.rank === 'number' ? tile.rank - 1 : HONOR_SPRITE_COLUMNS[tile.rank];
  return { ...tile, tileClass: tileClass(tile), spriteLeft: -column * 100, spriteTop: -row * 100 };
};

Page({
  data: { snapshot: null, chat: [], chatMembers: [], players: [], hand: [], discardRiver: [], voiceBubble: null, selectedTileId: '', canListenSelected: false, listenOptions: [], listenPreview: null, postDiscardListenWaits: [], ownSeat: null, currentTurn: null, turnStatus: '', isMyTurn: false, isResponsePhase: false, isWaitingForPriority: false, wallCount: 0, wallSides: [], boardSize: 720, diceRoll: null, diceLabel: '掷骰', animationStage: '', autoDiscardPending: false, availableActions: [], chiOptions: [], chiPickerOpen: false, listenTileIds: [], opponentHands: [], paymentRows: [], winAnnouncement: null, winType: '', discarderNickname: '', isListening: false, canDiscard: false, canListen: false, canHu: false, canPeng: false, canChi: false, canKong: false, canAddedKong: false, canConcealedKong: false, canPass: false, canRespondNow: false, spectator: false, settlement: null, settlementDescription: '', error: '' },

  onLoad() {
    this.lastSeenChatId = undefined;
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
    clearTimeout(this.voiceBubbleTimer);
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
    const chat = snapshot.public.chat || [];
    const previousIndex = chat.findIndex((message) => message.id === this.lastSeenChatId);
    const freshMessages = this.lastSeenChatId === undefined ? [] : this.lastSeenChatId === null ? chat : previousIndex < 0 ? [] : chat.slice(previousIndex + 1);
    this.lastSeenChatId = chat.length ? chat[chat.length - 1].id : null;
    const voiceMessage = freshMessages.filter((message) => message.kind === 'voice' && message.senderSeat && message.text).pop();
    const bySeat = new Map(snapshot.public.players.map((player) => [player.seat, player]));
    const winAnnouncement = snapshot.public.winAnnouncement;
    const winType = winAnnouncement && (winAnnouncement.isBaoZhongBao ? '宝中宝'
      : winAnnouncement.winPattern === 'big-wind' ? '大风'
        : winAnnouncement.winPattern === 'bao' ? winAnnouncement.isCardang ? '搂宝 · 卡当' : '搂宝'
          : winAnnouncement.isCardang ? '卡当'
            : winAnnouncement.type === 'self-draw' ? '自摸' : '平和') || '';
    const discarderNickname = winAnnouncement && winAnnouncement.payingSeat
      ? (bySeat.get(winAnnouncement.payingSeat) || {}).nickname || winAnnouncement.payingSeat : '';
    if (snapshot.public.phase === 'playing') this.playDealAnimation(snapshot.public.handNumber);
    const selectedTileId = snapshot.private.isListening ? (snapshot.private.discardableTileId || '') : this.data.selectedTileId;
    const availableActions = snapshot.private.availableActions || [];
    const listenTileIds = snapshot.private.listenTileIds || [];
    const listenOptions = (snapshot.private.listenOptions || []).map((option) => ({
      discardTileId: option.discardTileId,
      waits: option.waits.map(tileDecor),
    }));
    const isListening = Boolean(snapshot.private.isListening);
    const postDiscardListenWaits = (snapshot.private.postDiscardListenWaits || []).map(tileDecor);
    const isResponsePhase = Boolean(snapshot.public.pendingDiscard);
    const isWaitingForPriority = Boolean(snapshot.private.seat && !snapshot.private.spectator && isResponsePhase && snapshot.public.responseSeats.includes(snapshot.private.seat) && availableActions.length === 0);
    const currentPlayer = bySeat.get(snapshot.public.currentTurn);
    const turnStatus = snapshot.public.winAnnouncement
      ? `${snapshot.public.winAnnouncement.winnerNickname} 胡牌！`
      : postDiscardListenWaits.length > 0
      ? '已出牌，请选择听或暂不听'
      : isResponsePhase
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
      : postDiscardListenWaits.length > 0
        ? { waits: postDiscardListenWaits }
        : listenOptions.find((option) => option.discardTileId === selectedTileId) || null;
    const chiOptions = (snapshot.private.chiOptions || []).map((tileIds) => {
      return {
        key: tileIds.join('-'),
        tileIds,
        tiles: [snapshot.public.pendingDiscard && tileDecor(snapshot.public.pendingDiscard.tile), ...tileIds.map((id) => hand.find((tile) => tile.id === id))].filter(Boolean),
      };
    });
    const payments = snapshot.public.settlement && snapshot.public.settlement.payments ? snapshot.public.settlement.payments : {};
    const transfers = snapshot.public.settlement && snapshot.public.settlement.transfers || [];
    const transferDetail = (transfer) => transfer.fan && snapshot.public.settlement.baseScore
      ? `${transfer.fan}番×${snapshot.public.settlement.baseScore}=${transfer.amount}分`
      : `${transfer.amount}`;
    const paymentRows = snapshot.public.settlement ? snapshot.public.players.map((player) => ({
      seat: player.seat,
      nickname: player.nickname,
      mine: player.seat === snapshot.private.seat,
      before: player.score - (payments[player.seat] || 0),
      after: player.score,
      positive: (payments[player.seat] || 0) >= 0,
      amountLabel: ((payments[player.seat] || 0) > 0 ? '+' : '') + (payments[player.seat] || 0) + '分',
      flow: [
        ...transfers.filter((transfer) => transfer.to === player.seat).map((transfer) => `收 ${(bySeat.get(transfer.from) || {}).nickname || transfer.from} ${transferDetail(transfer)}`),
        ...transfers.filter((transfer) => transfer.from === player.seat).map((transfer) => `付 ${(bySeat.get(transfer.to) || {}).nickname || transfer.to} ${transferDetail(transfer)}`),
      ].join(' · ') || '无积分变化',
    })) : [];
    const exposedHands = new Map([
      ...(snapshot.private.opponentHands || []),
      ...(snapshot.public.revealedHands || []),
    ].map((opponent) => [opponent.seat, opponent.hand]));
    const players = SEATS.map((seat) => bySeat.get(seat) || { seat, seatLabel: ({ A: '東家', B: '南家', C: '西家', D: '北家' })[seat], nickname: '空位', connected: false, handCount: 0, score: 0, melds: [], discards: [], isDealer: false, isHost: false }).map((player) => ({
      ...player,
      position: seatPosition(snapshot.private.seat, player.seat),
      avatarLabel: player.nickname ? player.nickname.slice(0, 1) : player.seat,
      isWinner: Boolean(snapshot.public.winAnnouncement && snapshot.public.winAnnouncement.winnerSeat === player.seat),
      isDiscarder: Boolean(winAnnouncement && winAnnouncement.payingSeat === player.seat),
      discards: (player.discards || []).map((tile) => ({ ...tileDecor(tile), isPendingDiscard: snapshot.public.pendingDiscard && snapshot.public.pendingDiscard.tile.id === tile.id })),
      melds: (player.melds || []).map((meld) => ({
        ...meld,
        tiles: meld.tiles.map(tileDecor),
        hiddenBacks: meld.kind === 'concealed-kong' && meld.tiles.length === 0 ? [0, 1, 2, 3] : [],
      })),
      revealedHand: (exposedHands.get(player.seat) || []).map(tileDecor),
      concealedTiles: Array.from({ length: player.handCount || 0 }, (_, index) => `${player.seat}-hand-${index}`),
    }));
    const discardRiver = (snapshot.public.discardRiver || []).map((discard) => ({
      ...tileDecor(discard.tile),
      isPendingDiscard: snapshot.public.pendingDiscard && snapshot.public.pendingDiscard.tile.id === discard.tile.id,
    }));
    const settlementDescription = snapshot.public.settlement && snapshot.public.settlement.type === 'draw'
      ? '流局 · 本局不计分 · 原庄家不变'
      : snapshot.public.settlement
        ? `${snapshot.public.settlement.winnerNickname || snapshot.public.settlement.winnerSeat} 获胜 · ${snapshot.public.settlement.isBaoZhongBao ? '宝中宝' : snapshot.public.settlement.winPattern === 'big-wind' ? '大风' : snapshot.public.settlement.winPattern === 'bao' ? '搂宝' : snapshot.public.settlement.type === 'self-draw' ? '自摸' : '平和'}${snapshot.public.settlement.isCardang && !snapshot.public.settlement.isBaoZhongBao ? ' · 卡当' : ''}`
        : '';
    const wallCount = snapshot.public.wallCount;
    const wallSides = (snapshot.public.wallLayout && snapshot.public.wallLayout.sides || []).map((side) => {
      const position = seatPosition(snapshot.private.seat, side.seat);
      const stacks = side.stacks
        ? side.stacks.map((stack) => ({ id: `${side.seat}-stack-${stack.index}`, count: stack.liveTiles + stack.replacementTiles, isDouble: stack.liveTiles + stack.replacementTiles === 2, replacement: stack.replacementTiles > 0 }))
        : Array.from({ length: Math.ceil((side.liveTiles + side.replacementTiles) / 2) }, (_, index) => ({
          id: `${side.seat}-stack-${index}`,
          count: Math.min(2, side.liveTiles + side.replacementTiles - index * 2),
          isDouble: index * 2 + 1 < side.liveTiles + side.replacementTiles,
          replacement: index * 2 >= side.liveTiles,
        }));
      return {
        position,
        seat: side.seat,
        isBreakSide: snapshot.public.wallLayout.breakSide === side.seat,
        stacks: position === 'bottom' || position === 'left' ? stacks.reverse() : stacks,
      };
    });
    this.app.setSnapshot(snapshot);
    this.setData({
      snapshot,
      chat,
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
      postDiscardListenWaits,
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
      winAnnouncement: snapshot.public.winAnnouncement || null,
      winType,
      discarderNickname,
      error: '',
    });
    if (voiceMessage) {
      clearTimeout(this.voiceBubbleTimer);
      this.setData({ voiceBubble: { seat: voiceMessage.senderSeat, text: voiceMessage.text } });
      this.voiceBubbleTimer = setTimeout(() => this.setData({ voiceBubble: null }), 2000);
    }
  },

  onTileTap(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.isMyTurn || (!this.data.availableActions.includes('discard') && !this.data.availableActions.includes('listen')) || this.data.isListening) return;
    const now = Date.now();
    if (this.lastTileTap && this.lastTileTap.id === id && now - this.lastTileTap.at <= 300 && this.data.canDiscard) {
      this.lastTileTap = null;
      this.runCommand('discard', { tileId: id });
      this.setData({ selectedTileId: '', canListenSelected: false, listenPreview: null, hand: this.data.hand.map((tile) => ({ ...tile, selected: false })) });
      return;
    }
    this.lastTileTap = { id, at: now };
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
      this.lastTileTap = null;
      this.runCommand('discard', { tileId: drag.id });
      this.setData({ selectedTileId: '', hand: this.data.hand.map((tile) => ({ ...tile, selected: false })) });
    }).exec();
  },

  onTableTap() {
    if (!this.data.isMyTurn || this.data.isListening || !this.data.canDiscard || !this.data.selectedTileId) return;
    this.lastTileTap = null;
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
      if (this.data.postDiscardListenWaits.length > 0) {
        this.runCommand('listen', {});
        return;
      }
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
