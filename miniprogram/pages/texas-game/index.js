const { commandFor } = require('../../utils/commands');
const { decorateCards, phaseLabel } = require('../../utils/texas');

const SEATS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

Page({
  data: {
    snapshot: null,
    phase: 'preflop',
    phaseLabel: '',
    handNumber: 0,
    players: [],
    community: [],
    holeCards: [],
    spectatorHands: [],
    ownSeat: null,
    ownPlayer: null,
    currentTurn: null,
    currentTurnLabel: '',
    pot: 0,
    currentBet: 0,
    minRaise: 20,
    isHost: false,
    spectator: false,
    waiting: false,
    isMyTurn: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    sliderValue: 20,
    sliderMin: 20,
    sliderMax: 1000,
    selectedAllIn: false,
    settlement: null,
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
      positionLabel: '空位',
      connected: false,
      stack: 0,
      totalBet: 0,
      roundBet: 0,
      folded: false,
      allIn: false,
      isHost: false,
    });
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
    }));
    const settlement = snapshot.public.settlement
      ? {
        ...snapshot.public.settlement,
        winnerText: snapshot.public.settlement.winners.map((seat) => bySeat.get(seat)?.positionLabel || '玩家').join('、'),
        payoutRows: Object.entries(snapshot.public.settlement.payouts).map(([seat, payout]) => ({
          label: bySeat.get(seat)?.positionLabel || '玩家',
          payout,
        })),
      }
      : null;
    this.app.setSnapshot(snapshot);
    this.setData({
      snapshot,
      phase: snapshot.public.phase,
      phaseLabel: phaseLabel(snapshot.public.phase),
      handNumber: snapshot.public.handNumber,
      players,
      community: decorateCards(snapshot.public.community),
      holeCards: decorateCards(snapshot.private.holeCards),
      spectatorHands,
      ownSeat: snapshot.private.seat,
      ownPlayer,
      currentTurn: snapshot.public.currentTurn,
      currentTurnLabel: currentPlayer ? `${currentPlayer.nickname} · ${currentPlayer.positionLabel || '当前行动位'}` : '',
      pot: snapshot.public.pot,
      currentBet: snapshot.public.currentBet,
      minRaise: snapshot.public.minRaise,
      isHost: Boolean(ownPlayer && ownPlayer.isHost),
      spectator,
      waiting: Boolean(snapshot.private.waiting),
      isMyTurn,
      canCheck: isMyTurn && Boolean(ownPlayer && ownPlayer.roundBet === snapshot.public.currentBet),
      canCall: isMyTurn && Boolean(ownPlayer && ownPlayer.roundBet < snapshot.public.currentBet),
      callAmount: ownPlayer ? Math.max(0, snapshot.public.currentBet - ownPlayer.roundBet) : 0,
      sliderValue,
      sliderMin,
      sliderMax,
      selectedAllIn: sliderMax > 0 && sliderValue >= sliderMax,
      settlement,
      error: '',
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

  onSliderChange(event) {
    const value = Number(event.detail.value);
    this.setData({ sliderValue: value, selectedAllIn: value >= this.data.sliderMax });
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
