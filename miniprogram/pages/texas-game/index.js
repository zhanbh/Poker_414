const chatUtils = require('../../utils/chat');
const chatMembers = chatUtils.chatMembers || ((snapshot) => (snapshot.public.players || []).map((player) => ({ id: player.seat, seat: player.seat, nickname: player.nickname, label: player.positionLabel || player.seat + ' 位' })));
const { commandFor } = require('../../utils/commands');
const { decorateCards, formatTexasChips, handCategoryLabel, phaseLabel } = require('../../utils/texas');

const SEATS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const POSITION_LABELS = {
  A: '按钮位 BTN',
  B: '小盲 SB',
  C: '大盲 BB',
  D: '枪口位 UTG',
  E: '枪口+1 UTG+1',
  F: '中位 MP',
  G: '劫持位 HJ',
  H: '关煞位 CO',
};
const CHIP_COLORS = ['red', 'blue', 'green', 'black', 'purple'];
const CHIP_ORIGINS = {
  A: { left: '50%', top: '7%' },
  B: { left: '84%', top: '17%' },
  C: { left: '96%', top: '50%' },
  D: { left: '84%', top: '83%' },
  E: { left: '50%', top: '96%' },
  F: { left: '16%', top: '83%' },
  G: { left: '4%', top: '50%' },
  H: { left: '16%', top: '17%' },
};

function chipStack(amount) {
  const count = amount > 0 ? Math.min(12, Math.max(1, Math.ceil(amount / 100000))) : 0;
  return Array.from({ length: count }, (_, index) => ({
    color: CHIP_COLORS[index % CHIP_COLORS.length],
    bottom: index * 2,
  }));
}

function phaseNotice(phase) {
  const notices = {
    preflop: '翻牌前 · 等待玩家行动',
    flop: '翻牌 · 已发出 3 张公共牌',
    turn: '转牌 · 第 4 张公共牌',
    river: '河牌 · 第 5 张公共牌',
    showdown: '摊牌 · 正在比较牌型',
    settled: '结算完成 · 可查看本局结果',
  };
  return notices[phase] || '等待开局';
}

Page({
  data: {
    snapshot: null,
    chat: [],
    chatMembers: [],
    phase: 'preflop',
    phaseLabel: '',
    phaseNotice: '',
    handNumber: 0,
    players: [],
    community: [],
    holeCards: [],
    bestHand: null,
    spectatorHands: [],
    ownSeat: null,
    ownPlayer: null,
    currentTurn: null,
    currentTurnLabel: '',
    pot: 0,
    potLabel: '0',
    currentBet: 0,
    currentBetLabel: '0',
    minRaise: 200,
    isHost: false,
    spectator: false,
    waiting: false,
    isMyTurn: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    sliderValue: 200,
    sliderLabel: '200',
    sliderMin: 200,
    sliderMax: 1000000,
    selectedAllIn: false,
    callAmountLabel: '0',
    settlement: null,
    showSettlement: false,
    settlementHandNumber: null,
    chipFlights: [],
    error: '',
  },

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
    if (this.chipFlightTimer) clearTimeout(this.chipFlightTimer);
  },

  updateSnapshot(snapshot) {
    if (!snapshot || !snapshot.public || snapshot.public.gameId !== 'texas') return;
    if (snapshot.public.phase === 'lobby') {
      this.app.setSnapshot(snapshot);
      wx.reLaunch({ url: '/pages/texas-lobby/index' });
      return;
    }
    const bySeat = new Map(snapshot.public.players.map((player) => [player.seat, player]));
    const players = SEATS.map((seat) => bySeat.get(seat) || {
      seat,
      nickname: '',
      positionLabel: POSITION_LABELS[seat],
      connected: false,
      stack: 0,
      totalBet: 0,
      roundBet: 0,
      folded: false,
      allIn: false,
      isHost: false,
    }).map((player) => ({
      ...player,
      stackLabel: formatTexasChips(player.stack),
      roundBetLabel: formatTexasChips(player.roundBet),
      chipStack: chipStack(player.stack),
    }));
    const ownPlayer = snapshot.public.players.find((player) => player.seat === snapshot.private.seat) || null;
    const spectator = Boolean(snapshot.private.spectator);
    const isMyTurn = !spectator && Boolean(ownPlayer && snapshot.public.currentTurn === ownPlayer.seat);
    const currentPlayer = snapshot.public.players.find((player) => player.seat === snapshot.public.currentTurn) || null;
    const maxAmount = ownPlayer ? ownPlayer.roundBet + ownPlayer.stack : 0;
    const requiredAmount = snapshot.public.currentBet === 0
      ? snapshot.public.minRaise
      : snapshot.public.currentBet + snapshot.public.minRaise;
    const sliderMin = maxAmount > 0 ? Math.min(requiredAmount, maxAmount) : 0;
    const sliderMax = maxAmount;
    const previousAmount = this.data.sliderValue;
    const sliderValue = sliderMax > 0
      ? Math.max(sliderMin, Math.min(previousAmount, sliderMax))
      : 0;
    const spectatorHands = (snapshot.private.spectatorHands || []).map((player) => ({
      ...player,
      hand: decorateCards(player.hand),
      bestHand: player.bestHand ? { ...player.bestHand, label: handCategoryLabel(player.bestHand.category) } : null,
    }));
    const settlement = snapshot.public.settlement
      ? {
        ...snapshot.public.settlement,
        winnerText: snapshot.public.settlement.winners.map((seat) => bySeat.get(seat)?.nickname || seat).join('、'),
        payoutRows: Object.entries(snapshot.public.settlement.payouts).map(([seat, payout]) => ({
          label: bySeat.get(seat)?.positionLabel || bySeat.get(seat)?.nickname || '玩家',
          payout,
        })),
        winnerDetails: snapshot.public.settlement.winners.map((seat) => ({
          seat,
          nickname: bySeat.get(seat)?.nickname || seat,
          category: handCategoryLabel(snapshot.public.settlement.hands[seat]),
          payout: snapshot.public.settlement.payouts[seat] || 0,
          payoutLabel: formatTexasChips(snapshot.public.settlement.payouts[seat] || 0),
        })),
      }
      : null;
    const isNewSettlement = Boolean(settlement && snapshot.public.handNumber !== this.data.settlementHandNumber);
    const showSettlement = snapshot.public.phase === 'settled'
      ? (isNewSettlement ? true : this.data.showSettlement)
      : false;
    const previousSnapshot = this.data.snapshot;
    const previousBets = previousSnapshot && previousSnapshot.public.version !== snapshot.public.version
      ? new Map(previousSnapshot.public.players.map((player) => [player.seat, player.totalBet]))
      : null;
    const newFlights = previousBets
      ? snapshot.public.players.flatMap((player) => {
        const increase = player.totalBet - (previousBets.get(player.seat) || 0);
        if (increase <= 0) return [];
        return [{
          id: `${snapshot.public.handNumber}-${snapshot.public.version}-${player.seat}`,
          seat: player.seat,
          amount: increase,
          amountLabel: formatTexasChips(increase),
          left: CHIP_ORIGINS[player.seat].left,
          top: CHIP_ORIGINS[player.seat].top,
          color: CHIP_COLORS[snapshot.public.version % CHIP_COLORS.length],
        }];
      })
      : [];
    const chipFlights = newFlights.length ? [...(this.data.chipFlights || []), ...newFlights].slice(-12) : (this.data.chipFlights || []);
    if (newFlights.length) {
      if (this.chipFlightTimer) clearTimeout(this.chipFlightTimer);
      this.chipFlightTimer = setTimeout(() => this.setData({ chipFlights: [] }), 900);
    }
    this.app.setSnapshot(snapshot);
    this.setData({
      snapshot,
      chat: snapshot.public.chat || [],
      chatMembers: chatMembers(snapshot),
      phase: snapshot.public.phase,
      phaseLabel: phaseLabel(snapshot.public.phase),
      phaseNotice: phaseNotice(snapshot.public.phase),
      handNumber: snapshot.public.handNumber,
      players,
      community: decorateCards(snapshot.public.community),
      holeCards: decorateCards(snapshot.private.holeCards),
      bestHand: snapshot.private.bestHand ? { ...snapshot.private.bestHand, label: handCategoryLabel(snapshot.private.bestHand.category) } : null,
      spectatorHands,
      ownSeat: snapshot.private.seat,
      ownPlayer,
      currentTurn: snapshot.public.currentTurn,
      currentTurnLabel: currentPlayer ? `${currentPlayer.nickname} · ${currentPlayer.positionLabel || '当前行动位'}` : '',
      pot: snapshot.public.pot,
      potLabel: formatTexasChips(snapshot.public.pot),
      currentBet: snapshot.public.currentBet,
      currentBetLabel: formatTexasChips(snapshot.public.currentBet),
      minRaise: snapshot.public.minRaise,
      isHost: Boolean(ownPlayer && ownPlayer.isHost),
      spectator,
      waiting: Boolean(snapshot.private.waiting),
      isMyTurn,
      canCheck: isMyTurn && Boolean(ownPlayer && ownPlayer.roundBet === snapshot.public.currentBet),
      canCall: isMyTurn && Boolean(ownPlayer && ownPlayer.roundBet < snapshot.public.currentBet),
      callAmount: ownPlayer ? Math.max(0, snapshot.public.currentBet - ownPlayer.roundBet) : 0,
      callAmountLabel: ownPlayer ? formatTexasChips(Math.max(0, snapshot.public.currentBet - ownPlayer.roundBet)) : '0',
      sliderValue,
      sliderLabel: formatTexasChips(sliderValue),
      sliderMin,
      sliderMax,
      selectedAllIn: sliderMax > 0 && sliderValue >= sliderMax,
      settlement,
      showSettlement,
      settlementHandNumber: settlement && snapshot.public.phase === 'settled' ? snapshot.public.handNumber : null,
      chipFlights,
      error: '',
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

  onSliderChange(event) {
    const value = Number(event.detail.value);
    this.setData({ sliderValue: value, sliderLabel: formatTexasChips(value), selectedAllIn: value >= this.data.sliderMax });
  },

  onFold() {
    this.runCommand('fold', {});
  },

  onCheck() {
    this.runCommand('check', {});
  },

  onCall() {
    this.runCommand('call', {});
  },

  onCommit() {
    if (!this.data.isMyTurn || this.data.sliderMax <= 0) return;
    if (this.data.sliderValue >= this.data.sliderMax) {
      this.runCommand('all-in', {});
      return;
    }
    this.runCommand(this.data.currentBet === 0 ? 'bet' : 'raise', { amount: this.data.sliderValue });
  },

  onNextHand() {
    this.runCommand('next-hand', {});
  },

  onCloseSettlement() {
    this.setData({ showSettlement: false });
  },

  onOpenSettlement() {
    this.setData({ showSettlement: true });
  },

  onLeave() {
    wx.showModal({
      title: '退出房间',
      content: '观战者可以随时退出；进行中的玩家需要等本局结束。确定退出吗？',
      success: (result) => {
        if (!result.confirm) return;
        this.app.leaveRoom()
          .then(() => wx.reLaunch({ url: '/pages/access/index' }))
          .catch((error) => this.setData({ error: error.message || '退出失败' }));
      },
    });
  },
});
