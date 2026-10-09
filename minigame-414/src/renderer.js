const COLORS = {
  background: '#0d2430', panel: '#173b4b', panelLight: '#204e60', table: '#135655',
  line: '#377d8d', text: '#f0f4f7', muted: '#a9c0cb', gold: '#ffc34d', red: '#e35b61',
};
const { sortCards } = require('./cards');
const SUITS = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const HAND_NAMES = {
  single: '单牌', pair: '对子', sequence: '顺子', 'consecutive-pairs': '连对',
  'ordinary-bomb': '普通炸', 'main-bomb': '主牌炸', '414': '414',
};
const SEATS = ['A', 'B', 'C', 'D'];

function cardLabel(card) {
  if (!card) return '';
  return card.kind === 'joker' ? (card.joker === 'big' ? '大王' : '小王') : `${card.rank}${SUITS[card.suit] || ''}`;
}

class FourOneFourRenderer {
  constructor(canvas, context) {
    this.canvas = canvas;
    this.ctx = context;
    this.targets = [];
    this.viewport = { scale: 1, x: 0, y: 0 };
  }

  roundRect(x, y, w, h, radius, fill, stroke) {
    const ctx = this.ctx;
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  text(value, x, y, size = 16, color = COLORS.text, align = 'left', weight = '400') {
    this.ctx.fillStyle = color;
    this.ctx.font = `${weight} ${size}px sans-serif`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(String(value ?? ''), x, y);
  }

  button(label, x, y, w, h, type, data = {}, disabled = false, secondary = false) {
    this.roundRect(x, y, w, h, 10, disabled ? '#3a505a' : (secondary ? COLORS.panel : COLORS.gold), disabled ? '#4b626c' : (secondary ? COLORS.line : '#ffe39b'));
    this.text(label, x + w / 2, y + h / 2, 16, disabled ? '#9baab0' : (secondary ? COLORS.text : '#182b30'), 'center', '600');
    if (!disabled) this.targets.push({ x, y, w, h, type, data });
  }

  input(label, value, x, y, width, field) {
    this.text(label, x, y - 14, 15, COLORS.muted);
    this.roundRect(x, y, width, 54, 8, '#102e3c', COLORS.line);
    this.text(value || `点击输入${label}`, x + 16, y + 27, 16, value ? COLORS.text : '#77929e');
    this.targets.push({ x, y, w: width, h: 54, type: 'input', data: { field } });
  }

  draw(state) {
    const width = this.canvas.width || 540;
    const height = this.canvas.height || 960;
    const portrait = state.screen === 'entry';
    const logicalWidth = portrait ? 540 : Math.max(900, (width / Math.max(height, 1)) * 540);
    const logicalHeight = portrait ? 960 : 540;
    const scale = Math.min(width / logicalWidth, height / logicalHeight);
    const x = (width - logicalWidth * scale) / 2;
    const y = (height - logicalHeight * scale) / 2;
    this.viewport = { scale, x, y, width: logicalWidth, height: logicalHeight };
    this.targets = [];
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(scale, 0, 0, scale, x, y);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    if (portrait) this.drawEntry(state);
    else this.drawRoom(state, logicalWidth, logicalHeight);
    if (state.error) {
      const errorY = portrait ? 850 : 520;
      this.roundRect(24, errorY - 18, logicalWidth - 48, 34, 7, '#622f3c', '#b75e6c');
      this.text(this.fit(state.error, logicalWidth - 70, 13), logicalWidth / 2, errorY, 13, '#ffe7e9', 'center');
    }
  }

  fit(value, width, size) {
    const ctx = this.ctx;
    ctx.font = `13px sans-serif`;
    let text = String(value ?? '');
    while (text.length > 1 && ctx.measureText(text).width > width) text = `${text.slice(0, -2)}…`;
    return text;
  }

  drawEntry(state) {
    this.roundRect(30, 220, 480, 520, 22, COLORS.panel, COLORS.line);
    this.text('414 私房扑克', 270, 125, 36, COLORS.gold, 'center', '700');
    this.text('四人牌局 · 邀请制 · 仅供测试交流', 270, 170, 16, COLORS.muted, 'center');
    this.input('邀请码', state.inviteCode, 70, 340, 400, 'inviteCode');
    this.input('昵称', state.nickname, 70, 445, 400, 'nickname');
    this.text(state.statusMessage || '请输入房间邀请码和昵称', 270, 560, 14, COLORS.muted, 'center');
    this.button(state.busy ? '正在进入…' : '进入房间', 125, 625, 290, 58, 'enter', {}, state.busy);
    this.text('虚拟筹码不具有现金或财产价值', 270, 790, 13, '#7995a0', 'center');
  }

  drawRoom(state, width, height) {
    const snapshot = state.snapshot;
    if (!snapshot) return;
    const pub = snapshot.public;
    this.text('414 私房扑克', 22, 24, 22, COLORS.gold, 'left', '700');
    this.text(`第 ${pub.handNumber || 0} 局 · ${this.phaseLabel(pub.phase)}`, 210, 24, 14, COLORS.muted);
    this.button('退出', width - 194, 8, 72, 34, 'leave', {}, false, true);
    this.button(state.chatOpen ? '收起聊天' : `聊天${(pub.chat || []).length ? ` ${(pub.chat || []).length}` : ''}`, width - 112, 8, 102, 34, state.chatOpen ? 'close-chat' : 'toggle-chat', {}, false, true);
    this.drawTable(state, width);
    if (pub.phase === 'lobby') this.drawLobbyControls(state, width);
    else this.drawGameControls(state, width);
    if (state.chatOpen) this.drawChat(state, width);
    if (state.selectedTarget && !state.chatOpen) this.drawTargetActions(state, width);
  }

  phaseLabel(phase) {
    return ({ lobby: '等待玩家', opening: '选择首牌权', playing: '牌局进行中', settled: '本局结算', ended: '房间已结束' })[phase] || phase;
  }

  drawTable(state, width) {
    const pub = state.snapshot.public;
    const me = state.snapshot.private.seat;
    const ownIndex = Math.max(0, SEATS.indexOf(me || 'A'));
    const relative = me
      ? [SEATS[(ownIndex + 2) % 4], SEATS[(ownIndex + 1) % 4], me, SEATS[(ownIndex + 3) % 4]]
      : SEATS;
    const positions = [
      { x: width / 2 - 86, y: 58 },
      { x: 24, y: 168 },
      { x: width / 2 - 86, y: 300 },
      { x: width - 198, y: 168 },
    ];
    this.roundRect(width / 2 - Math.min(340, width * 0.36), 125, Math.min(680, width * 0.72), 235, 110, '#104b4b', '#347e83');
    relative.forEach((seat, index) => {
      const player = pub.players.find((item) => item.seat === seat);
      const position = positions[index];
      const w = 174;
      const isMe = seat && seat === me;
      this.roundRect(position.x, position.y, w, 66, 12, player ? (isMe ? '#225263' : COLORS.panel) : '#123343', player ? (isMe ? COLORS.gold : COLORS.line) : '#285464');
      this.text(`${seat || '观'}位${player?.isHost ? ' · 房主' : ''}`, position.x + 10, position.y + 16, 12, COLORS.gold, 'left', '600');
      this.text(player ? this.fit(player.nickname, 140, 15) : (isMe ? '你已离座' : '空位'), position.x + 10, position.y + 39, 15, player ? COLORS.text : COLORS.muted, 'left', '500');
      this.text(player ? `${player.handCount} 张${player.finishedRank ? ` · 第${player.finishedRank}` : ''}${player.connected ? '' : ' · 断线'}` : '', position.x + 10, position.y + 56, 11, COLORS.muted);
      if (player && !isMe && !state.snapshot.private.spectator) {
        this.targets.push({ x: position.x, y: position.y, w, h: 66, type: 'select-player', data: { seat: player.seat, nickname: player.nickname } });
      }
      const interaction = (pub.chat || []).slice(-1)[0];
      if (player && interaction?.kind === 'interaction' && interaction.targetSeat === player.seat) {
        const elapsed = Date.now() - interaction.createdAt;
        if (elapsed >= 0 && elapsed < 2000) {
          const icons = { tomato: '🍅', water: '💦', heart: '💖', kiss: '💋' };
          this.ctx.globalAlpha = 1 - elapsed / 2400;
          this.text(icons[interaction.interaction] || '✨', position.x + w / 2, position.y - 8 - elapsed / 65, 30, COLORS.text, 'center');
          this.ctx.globalAlpha = 1;
        }
      }
    });

    if (pub.phase === 'lobby') {
      this.text(`${pub.players.length}/4 人已入座`, width / 2, 225, 22, COLORS.gold, 'center', '700');
      this.text('坐满四位玩家后，房主可以开始牌局', width / 2, 258, 15, COLORS.muted, 'center');
    } else {
      const lastPlay = pub.publicLastPlay;
      const trick = pub.trick;
      const cards = lastPlay?.cards || trick?.cards || [];
      this.text(pub.currentTurn ? `${pub.currentTurn} 位行动` : this.phaseLabel(pub.phase), width / 2, 218, 17, COLORS.gold, 'center', '600');
      if (cards.length) {
        const cardWidth = Math.min(52, 420 / cards.length);
        const startX = width / 2 - cards.length * cardWidth / 2;
        cards.slice(0, 12).forEach((card, index) => this.drawCard(card, startX + index * cardWidth, 246, cardWidth - 4, 66, false));
        this.text(`${lastPlay?.seat || trick?.lastPlaySeat || ''} 出牌 · ${HAND_NAMES[lastPlay?.kind || trick?.kind] || ''}`, width / 2, 325, 13, COLORS.muted, 'center');
      } else {
        this.text('等待首家出牌', width / 2, 272, 16, COLORS.muted, 'center');
      }
      if (pub.settlement) this.text(`本局结束 · ${pub.settlement.winnerTeam === 'AC' ? '1队' : '2队'}获胜`, width / 2, 350, 15, COLORS.gold, 'center');
    }
  }

  drawCard(card, x, y, width, height, selected) {
    this.roundRect(x, y - (selected ? 11 : 0), width, height, 6, '#f6f7f9', selected ? COLORS.gold : '#d0dde1');
    const label = cardLabel(card);
    const red = card?.suit === 'hearts' || card?.suit === 'diamonds';
    this.text(label, x + width / 2, y + height / 2 - (selected ? 5 : 0), Math.min(17, width * 0.39), red ? '#cf3543' : '#172d38', 'center', '700');
  }

  drawLobbyControls(state, width) {
    const pub = state.snapshot.public;
    const me = state.snapshot.private.seat;
    const host = pub.players.find((player) => player.seat === me)?.isHost;
    const isSpectator = Boolean(state.snapshot.private.spectator || !me);
    const label = host ? '开始牌局' : (isSpectator ? '当前观战' : '等待房主开始');
    this.button(label, width / 2 - 105, 385, 210, 48, 'start', {}, !host || pub.players.length !== 4 || state.busy);
  }

  drawGameControls(state, width) {
    const snapshot = state.snapshot;
    const pub = snapshot.public;
    const seat = snapshot.private.seat;
    const isSpectator = Boolean(snapshot.private.spectator || !seat);
    const player = pub.players.find((item) => item.seat === seat);
    let buttons = [];
    if (!isSpectator && pub.phase === 'opening' && pub.openingTurn === seat) {
      buttons = pub.openingMode === 'reverse'
        ? [{ label: '反立', type: 'opening', data: { kind: 'reverse', seat } }, { label: '过', type: 'opening', data: { kind: 'pass' }, secondary: true }]
        : [{ label: '立棍', type: 'opening', data: { kind: 'stand', seat } }, { label: '过', type: 'opening', data: { kind: 'pass' }, secondary: true }];
    } else if (!isSpectator && pub.burstPendingSeat === seat) {
      buttons = (snapshot.private.burstKinds || []).map((kind) => ({ label: HAND_NAMES[kind] || kind, type: 'burst', data: { kind } }));
      buttons.push({ label: '不炸', type: 'burst', data: { kind: 'skip' }, secondary: true });
    } else if (!isSpectator && pub.phase === 'playing' && pub.currentTurn === seat && player?.activeInHand) {
      const canDifference = pub.trick?.kind === 'single' && pub.differenceAvailable && state.selectedIds.length >= 2;
      buttons = [
        { label: '出牌', type: 'play', disabled: state.selectedIds.length === 0 },
        ...(canDifference ? [{ label: '差牌', type: 'difference', secondary: true }] : []),
        ...(pub.trick ? [{ label: '不要', type: 'pass', secondary: true }] : []),
      ];
    } else if (!isSpectator && pub.phase === 'settled') {
      buttons = [{ label: player?.ready ? '已准备' : '准备下一局', type: 'ready', disabled: Boolean(player?.ready) }];
    } else if (pub.phase === 'ended') {
      buttons = [{ label: '返回入口', type: 'leave', secondary: true }];
    }
    const totalWidth = buttons.length * 104 + Math.max(0, buttons.length - 1) * 8;
    let x = width / 2 - totalWidth / 2;
    buttons.forEach((button) => {
      this.button(button.label, x, 370, 104, 42, button.type, button.data, state.busy || button.disabled, button.secondary);
      x += 112;
    });
    if (pub.phase === 'opening' && pub.openingTurn !== seat) this.text(`等待 ${pub.openingTurn || ''} 位选择首牌权`, width / 2, 388, 14, COLORS.muted, 'center');
    if (pub.phase === 'playing' && (isSpectator || pub.currentTurn !== seat)) this.text(isSpectator ? '观战中' : `等待 ${pub.currentTurn || ''} 位出牌`, width / 2, 388, 14, COLORS.muted, 'center');

    if (isSpectator) {
      this.text('观战手牌 · 所有人明牌', 18, 424, 13, COLORS.muted);
      (snapshot.private.spectatorHands || []).forEach((player, index) => {
        const cards = sortCards(player.hand || [], pub.effectiveMain).map(cardLabel).join('  ');
        this.text(this.fit(`${player.seat}位 ${player.nickname}：${cards}`, width - 36, 11), 18, 444 + index * 18, 11, COLORS.text);
      });
      return;
    }
    const hand = sortCards(snapshot.private.hand || [], pub.effectiveMain);
    const main = pub.effectiveMain;
    this.text(snapshot.private.spectator ? '观战手牌' : '我的手牌', 18, 424, 13, COLORS.muted);
    const cardWidth = Math.min(58, (width - 40) / Math.max(14, hand.length));
    const gap = Math.min(cardWidth - 4, Math.max(30, (width - 40 - cardWidth) / Math.max(1, hand.length - 1)));
    const rowWidth = hand.length ? cardWidth + gap * (hand.length - 1) : 0;
    const startX = Math.max(18, (width - rowWidth) / 2);
    hand.forEach((card, index) => {
      const x = startX + index * gap;
      const selected = state.selectedIds.includes(card.id);
      this.drawCard(card, x, 441, cardWidth, 76, selected);
      this.targets.push({ x, y: 430, w: cardWidth, h: 100, type: 'select-card', data: { cardId: card.id } });
    });
    if (main) this.text(`本局主：${main}`, width - 18, 424, 13, COLORS.gold, 'right');
  }

  drawChat(state, width) {
    const messages = state.snapshot.public.chat || [];
    const x = width - 296;
    this.roundRect(x, 52, 282, 420, 14, '#112e3c', COLORS.line);
    this.text('房间聊天', x + 14, 72, 16, COLORS.gold, 'left', '600');
    messages.slice(-9).forEach((message, index) => {
      const y = 104 + index * 30;
      const content = message.kind === 'interaction'
        ? `${message.senderNickname} ${({ tomato: '🍅', water: '💦', heart: '💖', kiss: '💋' })[message.interaction] || '✨'} ${message.targetNickname || ''}`
        : `${message.senderNickname}: ${message.text || '[消息]'}`;
      this.text(this.fit(content, 250, 13), x + 14, y, 12, COLORS.text);
    });
    this.roundRect(x + 12, 385, 182, 46, 7, '#0c2936', COLORS.line);
    this.text(state.chatDraft || '点此输入消息', x + 22, 408, 13, state.chatDraft ? COLORS.text : COLORS.muted);
    this.targets.push({ x: x + 12, y: 385, w: 182, h: 46, type: 'input', data: { field: 'chatDraft' } });
    this.button('发送', x + 202, 385, 65, 46, 'send-chat');
  }

  drawTargetActions(state, width) {
    const y = 374;
    const items = [['🍅', 'tomato'], ['💦', 'water'], ['💖', 'heart'], ['💋', 'kiss']];
    const start = width / 2 - 126;
    items.forEach(([label, interaction], index) => this.button(label, start + index * 62, y, 54, 42, 'interaction', { interaction, target: state.selectedTarget }));
    const me = state.snapshot.private.seat;
    const host = state.snapshot.public.players.find((player) => player.seat === me)?.isHost;
    if (host && state.selectedTarget.seat !== me) this.button('踢出', start + 258, y, 62, 42, 'remove-player', { seat: state.selectedTarget.seat }, false, true);
  }

  hit(x, y) {
    const pointX = (x - this.viewport.x) / this.viewport.scale;
    const pointY = (y - this.viewport.y) / this.viewport.scale;
    for (let index = this.targets.length - 1; index >= 0; index -= 1) {
      const target = this.targets[index];
      if (pointX >= target.x && pointX <= target.x + target.w && pointY >= target.y && pointY <= target.y + target.h) return target;
    }
    return null;
  }
}

module.exports = { FourOneFourRenderer, cardLabel };
