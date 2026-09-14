const { commandFor } = require('../../utils/commands');
const { displayCards, displayHand } = require('../../utils/cards');

const SEATS = ['A', 'B', 'C', 'D'];

function phaseLabel(phase) {
  return ({ opening: '首牌权选择', playing: '进行中', settled: '已结算', ended: '已结束' })[phase] || '等待中';
}

Page({
  data: {
    snapshot: null,
    phase: 'playing',
    phaseLabel: '',
    handNumber: 0,
    levels: { AC: '3', BD: '3' },
    effectiveMain: null,
    players: [],
    hand: [],
    selectedIds: [],
    playedCards: [],
    publicLastPlay: null,
    currentTurn: null,
    ownSeat: null,
    isMyTurn: false,
    canPlay: false,
    canDifference: false,
    canPass: false,
    canClickBlank: false,
    openingMode: 'normal',
    openingTitle: '',
    canOpeningAct: false,
    burstKinds: [],
    burstPendingForMe: false,
    burstPendingWaiting: false,
    burstPendingSeat: null,
    settlementText: '',
    connectionNotice: '',
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
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
  },

  updateSnapshot(snapshot) {
    if (!snapshot) return;
    const previous = this.data.snapshot;
    if (previous && previous.public.phase !== 'lobby' && snapshot.public.phase !== 'lobby') {
      const disconnectedNames = snapshot.public.players
        .filter((player) => {
          const oldPlayer = previous.public.players.find((candidate) => candidate.seat === player.seat);
          return oldPlayer?.connected && !player.connected;
        })
        .map((player) => player.nickname);
      if (disconnectedNames.length > 0) {
        if (this.noticeTimer) clearTimeout(this.noticeTimer);
        this.setData({ connectionNotice: disconnectedNames.join('、') + ' 已退出房间' });
        this.noticeTimer = setTimeout(() => this.setData({ connectionNotice: '' }), 6_000);
      }
    }
    if (snapshot.public.phase === 'lobby') {
      this.app.setSnapshot(snapshot);
      wx.reLaunch({ url: '/pages/lobby/index' });
      return;
    }
    const selected = new Set(this.data.selectedIds);
    const hand = displayHand(snapshot.private.hand, snapshot.public.effectiveMain).map((card) => ({ ...card, selected: selected.has(card.id) }));
    const ownSeat = snapshot.private.seat;
    const ownPlayer = snapshot.public.players.find((player) => player.seat === ownSeat);
    const isMyTurn = snapshot.public.phase === 'playing'
      && snapshot.public.currentTurn === ownSeat
      && !snapshot.public.burstPendingSeat
      && Boolean(ownPlayer && ownPlayer.activeInHand);
    const canDifference = Boolean(snapshot.public.trick && snapshot.public.trick.kind === 'single'
      && snapshot.public.differenceAvailable
      && this.data.selectedIds.length >= 2);
    const canPass = Boolean(isMyTurn && snapshot.public.trick);
    const burstPendingForMe = snapshot.public.burstPendingSeat === ownSeat;
    const players = SEATS.map((seat) => snapshot.public.players.find((player) => player.seat === seat) || {
      seat,
      nickname: '空位',
      handCount: 0,
      connected: false,
      away: false,
      activeInHand: false,
      finishedRank: null,
      burstAnnounced: false,
    });
    this.app.setSnapshot(snapshot);
    this.setData({
      snapshot,
      phase: snapshot.public.phase,
      phaseLabel: phaseLabel(snapshot.public.phase),
      handNumber: snapshot.public.handNumber,
      levels: snapshot.public.levels,
      effectiveMain: snapshot.public.effectiveMain,
      players,
      hand,
      publicLastPlay: snapshot.public.publicLastPlay,
      playedCards: displayCards(snapshot.public.publicLastPlay ? snapshot.public.publicLastPlay.cards : []),
      currentTurn: snapshot.public.currentTurn,
      ownSeat,
      isMyTurn,
      canPlay: isMyTurn,
      canDifference,
      canPass,
      canClickBlank: Boolean(isMyTurn && this.data.selectedIds.length > 0),
      openingMode: snapshot.public.openingMode,
      openingTitle: this.openingTitle(snapshot),
      canOpeningAct: snapshot.public.phase === 'opening' && snapshot.public.openingTurn === ownSeat,
      burstKinds: snapshot.private.burstKinds || [],
      burstPendingForMe,
      burstPendingWaiting: Boolean(snapshot.public.burstPendingSeat && !burstPendingForMe),
      burstPendingSeat: snapshot.public.burstPendingSeat,
      settlementText: snapshot.public.settlement ? '结果：' + snapshot.public.settlement.outcome : '',
    });
  },

  openingTitle(snapshot) {
    if (snapshot.public.openingMode === 'reverse') return snapshot.public.openingTurn === snapshot.private.seat ? '请选择是否反立' : '等待对方选择反立';
    if (snapshot.public.openingMode === 'stand') return snapshot.public.openingTurn === snapshot.private.seat ? '请选择是否立棍' : '等待队友选择立棍';
    return snapshot.public.openingTurn === snapshot.private.seat ? '请选择是否立棍' : '等待首牌权选择';
  },

  runCommand(type, payload) {
    const snapshot = this.data.snapshot;
    if (!snapshot) return;
    this.setData({ error: '' });
    this.transport.command(commandFor(snapshot, type, payload))
      .then((result) => this.updateSnapshot(result.snapshot))
      .catch((error) => this.setData({ error: error.message || '操作失败' }));
  },

  onCardTap(event) {
    const id = event.currentTarget.dataset.id;
    const selectedIds = this.data.selectedIds.includes(id)
      ? this.data.selectedIds.filter((candidate) => candidate !== id)
      : this.data.selectedIds.concat(id);
    this.transport.activity();
    this.setData({ selectedIds });
    this.updateSnapshot(this.data.snapshot);
  },

  onTableTap(event) {
    if (!this.data.canClickBlank || event.target !== event.currentTarget) return;
    this.onPlay();
  },

  onPlay() {
    if (!this.data.selectedIds.length) return;
    this.runCommand('play', { cardIds: this.data.selectedIds });
  },

  onDifference() {
    if (!this.data.selectedIds.length) return;
    this.runCommand('play', { cardIds: this.data.selectedIds, declaration: 'difference' });
  },

  onPass() {
    this.runCommand('pass', {});
  },

  onOpening(event) {
    const kind = event.currentTarget.dataset.kind;
    const payload = kind === 'pass' ? { kind } : { kind, seat: this.data.ownSeat };
    this.runCommand('opening', payload);
  },

  onBurst(event) {
    this.runCommand('burst', { kind: event.currentTarget.dataset.kind });
  },

  onReady() {
    this.runCommand('ready', {});
  },
});
