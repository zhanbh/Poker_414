const COLORS = {
  background: '#07161e',
  panel: '#0e2634',
  panelLight: '#183c50',
  line: '#3a7282',
  text: '#f1f5f9',
  muted: '#94a9b8',
  gold: '#ffc34d',
  goldLight: '#ffe596',
  goldDark: '#d99726',
  red: '#ef4444',
  ink: '#111827',
};

const { sortCards } = require('./cards');

const SUITS = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const HAND_NAMES = {
  single: '单牌', pair: '对子', sequence: '顺子', 'consecutive-pairs': '连对',
  'ordinary-bomb': '普通炸', 'main-bomb': '主牌炸', '414': '414',
};
const SEATS = ['A', 'B', 'C', 'D'];

const CLASSIC_CHAT_PHRASES = [
  '你是GG还是MM？',
  '快点啊，等的我花儿都谢了！',
  '大清都亡了，该你出牌了',
  '与人斗，其乐无穷！',
  '别吵了，专心打牌',
  '怎么又断线了？网络好卡',
  '给大佬递茶 🍵 合作愉快',
  '不要走，决战到天亮！',
];

const INTERACTIONS = [
  { id: 'tomato', label: '🍅 番茄' },
  { id: 'water', label: '💦 泼水' },
  { id: 'heart', label: '💖 比心' },
  { id: 'kiss', label: '💋 亲吻' },
];

function cardLabel(card) {
  if (!card) return '';
  return card.kind === 'joker' ? (card.joker === 'big' ? '大王' : '小王') : `${card.rank}${SUITS[card.suit] || ''}`;
}

function chatText(message) {
  if (!message) return '';
  if (message.kind === 'phrase') return `${message.senderNickname || '玩家'}: ${message.text || ''}`;
  if (message.kind === 'interaction') {
    const icon = ({ tomato: '🍅', water: '💦', heart: '💖', kiss: '💋' })[message.interaction] || '✨';
    return `${message.senderNickname || '玩家'} 向 ${message.targetNickname || '目标'} 发送了 ${icon}`;
  }
  return `${message.senderNickname || '玩家'}: ${message.text || ''}`;
}

class FourOneFourRenderer {
  constructor(canvas, context) {
    this.canvas = canvas;
    this.ctx = context;
    this.targets = [];
    this.viewport = { scale: 1, x: 0, y: 0, width: 540, height: 960 };
  }

  roundRect(x, y, w, h, radius, fill, stroke, lineWidth = 1.5) {
    const ctx = this.ctx;
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  circle(x, y, radius, fill, stroke, lineWidth = 1) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  drawOval(cx, cy, rx, ry, fill, stroke, lineWidth = 1) {
    if (rx <= 0 || ry <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
    ctx.restore();
  }

  polygon(points, fill, stroke, lineWidth = 1) {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  linearFill(x1, y1, x2, y2, stops, fallback) {
    try {
      if (typeof this.ctx.createLinearGradient !== 'function') return fallback;
      const gradient = this.ctx.createLinearGradient(x1, y1, x2, y2);
      if (!gradient || typeof gradient.addColorStop !== 'function') return fallback;
      stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
      return gradient;
    } catch {
      return fallback;
    }
  }

  text(value, x, y, size = 16, color = COLORS.text, align = 'left', weight = '400') {
    this.ctx.fillStyle = color;
    this.ctx.font = `${weight} ${size}px sans-serif`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(String(value ?? ''), x, y);
  }

  fit(value, width, size = 13) {
    const ctx = this.ctx;
    ctx.font = `${size}px sans-serif`;
    let text = String(value ?? '');
    while (text.length > 1 && ctx.measureText(text).width > width) text = `${text.slice(0, -2)}…`;
    return text;
  }

  button(label, x, y, w, h, type, data = {}, disabled = false, secondary = false) {
    let fill = disabled ? '#374953' : (secondary ? COLORS.panel : COLORS.gold);
    if (!disabled && !secondary && this.ctx.createLinearGradient) {
      const grad = this.ctx.createLinearGradient(x, y, x, y + h);
      if (grad && typeof grad.addColorStop === 'function') {
        grad.addColorStop(0, '#ffd87a');
        grad.addColorStop(1, '#df9a28');
        fill = grad;
      }
    }
    const stroke = disabled ? '#475d69' : (secondary ? COLORS.line : '#fff0ba');
    this.roundRect(x, y, w, h, 10, fill, stroke);
    this.text(label, x + w / 2, y + h / 2, 16, disabled ? '#8b9da6' : (secondary ? COLORS.text : '#132227'), 'center', '600');
    if (!disabled) this.targets.push({ x, y, w, h, width: w, height: h, type, data });
  }

  input(label, value, x, y, width, field) {
    this.text(label, x, y - 14, 14, COLORS.muted, 'left', '500');
    const isFocused = this.currentFocus === field;
    this.roundRect(x, y, width, 52, 10, 'rgba(8, 24, 34, 0.75)', isFocused ? COLORS.gold : 'rgba(58, 114, 130, 0.6)', isFocused ? 2 : 1.5);
    this.text(value || `点击输入${label}`, x + 16, y + 26, 15, value ? '#ffdf79' : '#698795', 'left', value ? '600' : 'normal');
    this.targets.push({ x, y, w: width, h: 52, width, height: 52, type: 'input', data: { field } });
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
    this.currentFocus = state.focus || '';
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
    else this.drawRoom(state, logicalWidth);

    if (state.error) {
      const errorY = portrait ? 850 : 518;
      this.roundRect(24, errorY - 18, logicalWidth - 48, 34, 7, '#622f3c', '#b75e6c');
      this.text(this.fit(state.error, logicalWidth - 70, 13), logicalWidth / 2, errorY, 13, '#ffe7e9', 'center');
    }
  }

  drawEntry(state) {
    const ctx = this.ctx;
    // Luxury dark velvet background gradient
    const bgGrad = this.linearFill(0, 0, 540, 960, [
      [0, '#0a1d27'],
      [0.35, '#0d2836'],
      [0.75, '#07161f'],
      [1, '#040d13'],
    ], '#07161e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 540, 960);

    // Decorative ambient poker suit watermarks in background
    ctx.save();
    ctx.globalAlpha = 0.05;
    this.text('♠', 90, 180, 180, COLORS.gold, 'center');
    this.text('♥', 450, 220, 160, '#ef4444', 'center');
    this.text('♣', 80, 820, 150, COLORS.gold, 'center');
    this.text('♦', 460, 800, 170, '#ef4444', 'center');
    ctx.restore();

    // Brand Header
    this.roundRect(228, 86, 84, 26, 6, '#861c24', '#d49b29');
    this.text('私房牌局', 270, 99, 13, '#ffdb88', 'center', '600');

    this.text('414 私房扑克 · 微信小游戏', 270, 152, 29, COLORS.gold, 'center', '700');
    this.text('经典四人二打二 · 跨端实时互通', 270, 192, 14, COLORS.muted, 'center');

    // Frosted Glass Card
    const cardX = 75;
    const cardY = 250;
    const cardW = 390;
    const cardH = 430;
    this.roundRect(cardX, cardY, cardW, cardH, 20, 'rgba(10, 28, 38, 0.68)', 'rgba(218, 170, 75, 0.45)');
    this.roundRect(cardX + 6, cardY + 6, cardW - 12, cardH - 12, 16, null, 'rgba(255, 225, 140, 0.12)');

    this.text('✦ 加入房间 ✦', 270, cardY + 32, 18, COLORS.gold, 'center', '700');

    // Inputs
    this.input('邀请码', state.inviteCode, cardX + 25, cardY + 72, cardW - 50, 'inviteCode');
    this.input('昵称', state.nickname, cardX + 25, cardY + 155, cardW - 50, 'nickname');

    // Tip Banner
    this.roundRect(cardX + 25, cardY + 225, cardW - 50, 28, 6, 'rgba(212, 155, 41, 0.15)', 'rgba(212, 155, 41, 0.35)');
    this.text('💡 输入邀请码后点击键盘【前往】即可直接进入', 270, cardY + 239, 11, '#ffd275', 'center', '600');

    // Enter Button
    this.button(state.busy ? '正在进入…' : '进入房间', cardX + 25, cardY + 275, cardW - 50, 56, 'enter', {}, state.busy);

    // Status Message
    this.text(state.statusMessage || '请输入房间邀请码和昵称', 270, cardY + 365, 13, COLORS.muted, 'center');

    // Footer
    this.text('虚拟筹码不具有现金或财产价值，仅供测试、学习和交流', 270, 875, 11, '#537280', 'center');
    this.text('308娱乐 出品', 270, 902, 13, '#537280', 'center');
  }

  drawRoom(state, width) {
    const snapshot = state.snapshot;
    if (!snapshot) return;
    const pub = snapshot.public;

    // Background
    const ctx = this.ctx;
    ctx.fillStyle = this.linearFill(0, 0, width, 540, [
      [0, '#06161d'],
      [0.5, '#0a232f'],
      [1, '#051218'],
    ], '#07161e');
    ctx.fillRect(0, 0, width, 540);

    // Top Header
    this.circle(38, 28, 20, 'rgba(20, 48, 60, 0.85)', 'rgba(218, 170, 75, 0.65)', 1.5);
    ctx.beginPath();
    ctx.moveTo(42, 20); ctx.lineTo(33, 28); ctx.lineTo(42, 36);
    ctx.strokeStyle = '#f9dfa4'; ctx.lineWidth = 2.5; ctx.stroke();
    this.targets.push({ x: 18, y: 8, w: 40, h: 40, width: 40, height: 40, type: 'leave', data: {} });

    this.text('414 扑克', 72, 22, 18, '#ffe5a4', 'left', '700');
    this.text(`第 ${pub.handNumber || 0} 局 · ${this.phaseLabel(pub.phase)}`, 74, 38, 11, '#b0c4cf');
    this.circle(184, 22, 3, '#8eddaa');

    // Floating Chat Icon (Right side)
    const chatX = width - 42;
    const chatY = 28;
    this.circle(chatX, chatY, 22, state.chatOpen ? '#b7894b' : 'rgba(22, 54, 68, 0.85)', 'rgba(255, 228, 168, 0.7)', 1.5);
    this.roundRect(chatX - 11, chatY - 8, 22, 16, 7, '#ffe8ad');
    this.polygon([[chatX - 6, chatY + 5], [chatX - 8, chatY + 12], [chatX + 1, chatY + 6]], '#ffe8ad');
    for (const dx of [-5, 0, 5]) this.circle(chatX + dx, chatY, 1.4, '#8b6336');

    // Unread count badge (filter out phrase and interaction!)
    const messages = (pub.chat || []).filter((m) => m.kind !== 'phrase' && m.kind !== 'interaction');
    const lastReadIndex = messages.findIndex((m) => m.id === state.chatReadId);
    const unread = messages.length - lastReadIndex - 1;
    if (unread > 0 && !state.chatOpen) {
      this.circle(chatX + 14, chatY - 14, 8, '#b94f37', '#ffe0a0');
      this.text(unread > 9 ? '9+' : unread, chatX + 14, chatY - 13, 8.5, '#fff5da', 'center', '700');
    }
    this.targets.push({ x: chatX - 24, y: chatY - 24, w: 48, h: 48, width: 48, height: 48, type: 'toggle-chat', data: {} });

    // Table Felt & Players
    this.drawTable(state, width);

    // Controls
    if (pub.phase === 'lobby') this.drawLobbyControls(state, width);
    else this.drawGameControls(state, width);

    // Interaction Picker Popover
    if (state.selectedTarget) this.drawInteractionPicker(state, width);

    // Floating Chat Modal
    if (state.chatOpen) this.drawChatModal(state, width);
  }

  phaseLabel(phase) {
    return ({
      lobby: '等待入座',
      opening: '争夺首牌权',
      playing: '牌局对决中',
      settled: '本局结算',
      ended: '房间已结束',
    })[phase] || phase;
  }

  drawTable(state, width) {
    const pub = state.snapshot.public;
    const me = state.snapshot.private.seat;
    const ctx = this.ctx;

    // Deluxe Oval Poker Felt Table
    const tableW = Math.min(740, width * 0.74);
    const tableH = 265;
    const tableX = width / 2 - tableW / 2;
    const tableY = 82;

    // Outer Wooden Rail Rim
    this.roundRect(tableX - 12, tableY - 10, tableW + 24, tableH + 20, 96,
      this.linearFill(tableX, tableY, tableX, tableY + tableH, [
        [0, '#532810'],
        [0.5, '#7c401e'],
        [1, '#3a1a09'],
      ], '#5d2e14'), '#d49b42', 2.5);

    // Middle Gold Inlay Line
    this.roundRect(tableX - 3, tableY - 2, tableW + 6, tableH + 4, 88, null, 'rgba(255, 215, 120, 0.4)', 1.2);

    // Inner Velvet Felt
    this.roundRect(tableX, tableY, tableW, tableH, 85,
      this.linearFill(tableX, tableY, tableX, tableY + tableH, [
        [0, '#093628'],
        [0.4, '#125441'],
        [0.85, '#0c3e30'],
        [1, '#072b21'],
      ], '#0d4234'), '#1b634e', 1.5);

    // Felt Center Watermark Emblem
    ctx.save();
    ctx.globalAlpha = 0.12;
    this.text('♠ 414 扑克', width / 2, tableY + tableH / 2, 42, COLORS.gold, 'center', '700');
    ctx.restore();

    // Seating Calculation
    const ownIndex = Math.max(0, SEATS.indexOf(me || 'A'));
    const relative = me
      ? [SEATS[(ownIndex + 2) % 4], SEATS[(ownIndex + 1) % 4], me, SEATS[(ownIndex + 3) % 4]]
      : SEATS;

    // Card positions around table
    const cardPositions = [
      { x: width / 2 - 92, y: tableY - 28, pos: 'top' },
      { x: tableX - 45, y: tableY + 85, pos: 'left' },
      { x: width / 2 - 92, y: tableY + tableH - 36, pos: 'bottom' },
      { x: tableX + tableW - 139, y: tableY + 85, pos: 'right' },
    ];

    relative.forEach((seat, index) => {
      const position = cardPositions[index];
      this.drawPlayerCard(state, seat, position.x, position.y, 184, 68);
    });

    // Center Trick & Table Status
    if (pub.phase === 'lobby') {
      this.text(`${pub.players.length} / 4 人已入座`, width / 2, tableY + 110, 20, COLORS.gold, 'center', '700');
      this.text('分享邀请码，坐满四位玩家后房主可开局', width / 2, tableY + 138, 12, '#9dc1b6', 'center');
    } else {
      const lastPlay = pub.publicLastPlay;
      const trick = pub.trick;
      const cards = lastPlay?.cards || trick?.cards || [];
      const leader = lastPlay?.seat || trick?.lastPlaySeat || '';
      const handKind = HAND_NAMES[lastPlay?.kind || trick?.kind] || '';

      if (cards.length) {
        const cardW = Math.min(48, 380 / cards.length);
        const startX = width / 2 - (cards.length * cardW) / 2;
        cards.slice(0, 16).forEach((card, idx) => {
          this.drawCard(card, startX + idx * cardW, tableY + 80, cardW - 3, 62, false);
        });
        this.roundRect(width / 2 - 90, tableY + 152, 180, 24, 6, 'rgba(8, 28, 22, 0.85)', '#3b7a67');
        this.text(`${leader} 位出牌 · ${handKind}`, width / 2, tableY + 164, 12, '#ffd782', 'center', '600');
      } else {
        this.text(pub.currentTurn ? `轮到 ${pub.currentTurn} 位行动` : '等待首家出牌', width / 2, tableY + 120, 16, COLORS.gold, 'center', '600');
      }

      if (pub.settlement) {
        const winTeam = pub.settlement.winnerTeam === 'AC' ? '1队' : '2队';
        this.roundRect(width / 2 - 120, tableY + 185, 240, 30, 8, 'rgba(18, 48, 32, 0.94)', COLORS.gold);
        this.text(`🏆 本局结束 · ${winTeam} 获胜！`, width / 2, tableY + 200, 13, COLORS.goldLight, 'center', '700');
      }
    }
  }

  drawPlayerCard(state, seat, x, y, width, height) {
    const pub = state.snapshot.public;
    const me = state.snapshot.private.seat;
    const player = pub.players.find((p) => p.seat === seat);
    const isMe = seat && seat === me;
    const selected = state.selectedTarget && state.selectedTarget.seat === seat;
    const isTurn = pub.phase === 'playing' && pub.currentTurn === seat;
    const team = seat === 'A' || seat === 'C' ? '1队' : '2队';

    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = isTurn || selected ? '#f4c75e' : 'rgba(5, 20, 16, 0.6)';
    ctx.shadowBlur = isTurn || selected ? 10 : 4;
    ctx.shadowOffsetY = 2;

    this.roundRect(x, y, width, height, 10,
      player ? (isMe ? '#163f35' : 'rgba(14, 38, 48, 0.92)') : 'rgba(8, 24, 32, 0.55)',
      isTurn || selected ? COLORS.gold : (player ? (isMe ? '#2e7c67' : '#275263') : '#1e3c49'), 1.5);
    ctx.restore();

    if (selected) {
      this.roundRect(x - 2, y - 2, width + 4, height + 4, 12, null, '#ffd700', 2);
    }

    if (player) {
      // Avatar circle
      const avX = x + 24;
      const avY = y + height / 2;
      this.circle(avX, avY, 18, isMe ? '#226050' : '#1e4859', isMe ? COLORS.gold : '#508398', 1.5);
      this.text(player.nickname ? player.nickname.slice(0, 1) : seat, avX, avY, 14, '#ffffff', 'center', '700');

      // Nickname & Seat label
      this.text(this.fit(player.nickname, 86, 13), x + 48, y + 17, 13, '#f2f8fa', 'left', '600');

      // Team badge
      const teamBg = team === '1队' ? '#0284c7' : '#e11d48';
      this.roundRect(x + 48, y + 32, 34, 16, 4, teamBg);
      this.text(team, x + 65, y + 40, 10, '#ffffff', 'center', '700');

      // Hand count badge
      const countLabel = player.finishedRank ? `第${player.finishedRank}名` : `${player.handCount || 0} 张`;
      this.text(countLabel, x + 88, y + 40, 11, player.finishedRank ? COLORS.gold : '#9eb6c2', 'left');

      // Host badge
      if (player.isHost) {
        this.roundRect(x + width - 36, y + 6, 28, 16, 4, '#b45309');
        this.text('庄', x + width - 22, y + 14, 10, '#ffedd5', 'center', '700');
      }

      // Gift badge
      this.circle(x + width - 18, y + height - 18, 10, selected ? '#eab308' : 'rgba(18, 48, 58, 0.9)', selected ? '#ffffff' : 'rgba(255, 215, 120, 0.7)');
      this.text('🎁', x + width - 18, y + height - 17, 9.5, selected ? '#1f2937' : '#ffd875', 'center');

      // Touch target for avatar interaction (allows self-interaction for testing!)
      this.targets.push({ x, y, w: width, h: height, width, height, type: 'select-player', data: { seat: player.seat, nickname: player.nickname } });
    } else {
      this.circle(x + 24, y + height / 2, 16, 'rgba(16, 40, 52, 0.6)', 'rgba(56, 106, 128, 0.5)');
      this.text('+', x + 24, y + height / 2, 18, '#8ba4b0', 'center');
      this.text(`${seat} 号空位`, x + 50, y + height / 2 - 6, 13, '#74929f');
      this.text('等待入座…', x + 50, y + height / 2 + 10, 11, '#4e6d7a');
    }

    // Floating Interaction Animation
    const latestInteraction = [...(pub.chat || [])].reverse().find(
      (m) => m.kind === 'interaction' && (m.targetSeat === seat || (player && m.targetNickname === player.nickname)) && Date.now() - m.createdAt < 2000,
    );
    if (latestInteraction) {
      this.drawInteractionEffect(state, latestInteraction, seat, x, y, width, height);
    }

    // Quick Phrase Speech Bubble
    const latestPhrase = [...(pub.chat || [])].reverse().find(
      (m) => m.kind === 'phrase' && m.senderSeat === seat && Date.now() - m.createdAt < 3600,
    );
    if (latestPhrase && latestPhrase.text) {
      this.drawSpeechBubble(latestPhrase.text, x, y, width, height);
    }
  }

  drawSpeechBubble(text, cardX, cardY, cardWidth, cardHeight) {
    const ctx = this.ctx;
    const paddingX = 14;
    const textWidth = Math.min(220, text.length * 13 + paddingX * 2);
    const bubbleWidth = Math.max(100, textWidth);
    const bubbleHeight = 32;

    let bx;
    let by;
    let tailPoints;

    if (cardX < 200) {
      bx = cardX + cardWidth + 10;
      by = cardY + 12;
      tailPoints = [[bx, by + 10], [cardX + cardWidth + 2, by + 16], [bx, by + 22]];
    } else if (cardX > 600) {
      bx = cardX - bubbleWidth - 10;
      by = cardY + 12;
      tailPoints = [[bx + bubbleWidth, by + 10], [cardX - 2, by + 16], [bx + bubbleWidth, by + 22]];
    } else if (cardY < 120) {
      bx = cardX + cardWidth / 2 - bubbleWidth / 2;
      by = cardY + cardHeight + 10;
      tailPoints = [[bx + bubbleWidth / 2 - 8, by], [cardX + cardWidth / 2, cardY + cardHeight + 2], [bx + bubbleWidth / 2 + 8, by]];
    } else {
      bx = cardX + cardWidth / 2 - bubbleWidth / 2;
      by = cardY - bubbleHeight - 10;
      tailPoints = [[bx + bubbleWidth / 2 - 8, by + bubbleHeight], [cardX + cardWidth / 2, cardY - 2], [bx + bubbleWidth / 2 + 8, by + bubbleHeight]];
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    this.roundRect(bx, by, bubbleWidth, bubbleHeight, 8, '#ffffff', '#38bdf8', 1.5);
    this.polygon(tailPoints, '#ffffff');
    ctx.restore();

    const displayText = this.fit(text, bubbleWidth - 20, 12);
    this.text(displayText, bx + bubbleWidth / 2, by + bubbleHeight / 2, 12, '#0f172a', 'center', '700');
  }

  drawInteractionEffect(state, message, targetSeat, cardX, cardY, cardWidth) {
    const age = Math.max(0, Date.now() - message.createdAt);
    const duration = 2000;
    if (age >= duration) return;
    const progress = Math.min(1, age / duration);
    const flyRatio = 0.35;
    const ctx = this.ctx;

    const targetX = cardX + cardWidth / 2;
    const targetY = cardY + 34;

    let startX = targetX;
    let startY = targetY;
    if (message.senderSeat) {
      const pub = state.snapshot?.public;
      const senderCard = pub?.players?.find((p) => p.seat === message.senderSeat);
      if (senderCard) {
        startX = targetX > 480 ? targetX - 160 : targetX + 160;
        startY = targetY + 30;
      }
    }
    if (Math.abs(startX - targetX) < 10 && Math.abs(startY - targetY) < 10) {
      startX = targetX > 480 ? targetX - 120 : targetX + 120;
      startY = targetY + 60;
    }

    const type = message.interaction || 'tomato';

    if (progress < flyRatio) {
      const p = progress / flyRatio;
      const easeP = p * (2 - p);
      const arc = -75 * Math.sin(p * Math.PI);
      const curX = startX + (targetX - startX) * easeP;
      const curY = startY + (targetY - (type === 'water' ? 60 : 0) - startY) * easeP + arc;

      ctx.save();
      if (type === 'tomato') {
        ctx.translate(curX, curY);
        ctx.rotate(p * Math.PI * 4);
        for (let i = 1; i <= 3; i += 1) this.circle(-i * 10, Math.sin(i) * 5, Math.max(1, 4 - i), `rgba(239, 68, 68, ${0.6 - i * 0.16})`);
        this.text('🍅', 0, 9, 28, COLORS.text, 'center');
      } else if (type === 'water') {
        const flyTilt = (targetX >= startX ? 0.2 : -0.2) + Math.sin(p * Math.PI * 3) * 0.15;
        const tipAtEnd = p > 0.65 ? ((p - 0.65) / 0.35) * Math.PI * 0.55 : 0;
        for (let i = 1; i <= 4; i += 1) {
          const tp = Math.max(0, p - i * 0.08);
          const tx = startX + (targetX - startX) * tp;
          const ty = startY + (targetY - 60 - startY) * tp - 75 * Math.sin(tp * Math.PI);
          this.circle(tx, ty, Math.max(1.5, 4 - i * 0.7), 'rgba(186, 230, 253, 0.75)');
        }
        this.drawWaterBucket(curX, curY, flyTilt + tipAtEnd, 1.2, p > 0.75);
      } else if (type === 'heart') {
        const pulse = 1 + 0.2 * Math.sin(p * Math.PI * 5);
        ctx.translate(curX, curY);
        ctx.scale(pulse, pulse);
        this.circle(0, 0, 16, 'rgba(244, 114, 182, 0.35)');
        this.text('💖', 0, 9, 28, COLORS.text, 'center');
      } else if (type === 'kiss') {
        const wave = Math.sin(p * Math.PI * 4) * 8;
        ctx.translate(curX, curY + wave);
        this.text('💋', 0, 9, 28, COLORS.text, 'center');
      }
      ctx.restore();
    } else {
      const p = (progress - flyRatio) / (1 - flyRatio);
      const alpha = p > 0.65 ? Math.max(0, 1 - (p - 0.65) / 0.35) : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (type === 'tomato') {
        const dripY = targetY + p * 10;
        this.circle(targetX, dripY, 20 + Math.min(6, p * 8), '#d32f2f');
        for (let i = 0; i < 8; i += 1) {
          const ang = i * (Math.PI / 4) + 0.25;
          const dist = 30 * Math.sin(p * Math.PI * 0.5);
          const px = targetX + Math.cos(ang) * dist;
          const py = targetY + Math.sin(ang) * dist + p * p * 30;
          this.circle(px, py, Math.max(1.5, 4 * (1 - p * 0.7)), i % 2 === 0 ? '#ff5252' : '#d50000');
        }
        this.text('🍅', targetX, dripY, 28, COLORS.text, 'center');
      } else if (type === 'water') {
        const bucketX = targetX - 16;
        const bucketY = targetY - 60;
        const isPouring = p < 0.75;
        const shake = isPouring ? Math.sin(p * 45) * Math.max(0, 1 - p * 1.3) * 3 : 0;
        const bucketTilt = Math.PI * 0.62 + (isPouring ? Math.sin(p * 28) * 0.08 : 0);

        ctx.save();
        this.drawWaterBucket(bucketX + shake, bucketY, bucketTilt, 1.25, true);
        ctx.restore();

        if (p < 0.85) {
          const pourAlpha = p < 0.1 ? p / 0.1 : p > 0.65 ? Math.max(0, 1 - (p - 0.65) / 0.2) : 1;
          ctx.save();
          ctx.globalAlpha = alpha * pourAlpha;

          const topW = 30;
          const botW = 66;
          const topX = bucketX + 16;
          const topY = bucketY + 12;
          const botY = targetY + 38;

          // Main waterfall body
          ctx.beginPath();
          ctx.moveTo(topX - topW / 2, topY);
          ctx.quadraticCurveTo(targetX - botW / 2 - 8, (topY + botY) / 2, targetX - botW / 2, botY);
          ctx.lineTo(targetX + botW / 2, botY);
          ctx.quadraticCurveTo(targetX + botW / 2 + 8, (topY + botY) / 2, topX + topW / 2, topY);
          ctx.closePath();
          ctx.fillStyle = this.linearFill(targetX - botW / 2, topY, targetX + botW / 2, botY, [
            [0, 'rgba(186, 230, 253, 0.85)'],
            [0.25, 'rgba(56, 189, 248, 0.95)'],
            [0.7, 'rgba(14, 165, 233, 0.92)'],
            [1, 'rgba(2, 132, 199, 0.88)'],
          ], 'rgba(56, 189, 248, 0.9)');
          ctx.fill();

          // Downward water streamlines
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          for (let i = -2; i <= 2; i += 1) {
            const flowOffset = (age * 0.5 + i * 17) % 35;
            ctx.beginPath();
            ctx.moveTo(topX + i * 5, topY + flowOffset);
            ctx.lineTo(targetX + i * 12, botY - 6);
            ctx.stroke();
          }

          // Foaming splash cloud
          for (let i = 0; i < 6; i += 1) {
            const fx = targetX - 25 + i * 10;
            const fy = targetY - 4 + Math.sin(i * 1.8) * 6;
            this.circle(fx, fy, 9 + (i % 3) * 3, 'rgba(255, 255, 255, 0.9)');
          }

          // Fan of explosive droplets
          for (let i = 0; i < 18; i += 1) {
            const side = i % 2 === 0 ? 1 : -1;
            const ang = side * (0.35 + (i % 5) * 0.22);
            const dist = 32 * Math.sin(Math.min(1, p * 1.8) * Math.PI * 0.5);
            const px = targetX + Math.sin(ang) * dist * 1.5;
            const py = targetY + 6 - Math.cos(ang) * dist + p * p * 55;
            this.circle(px, py, Math.max(1.5, 4 * (1 - p * 0.5)), i % 2 === 0 ? '#ffffff' : '#38bdf8');
          }

          // Splash emojis on both sides
          const splashScale = 1 + 0.3 * Math.sin(p * Math.PI * 3);
          ctx.save();
          ctx.translate(targetX - 35, targetY + 8);
          ctx.scale(splashScale, splashScale);
          this.text('💦', 0, 0, 24, COLORS.text, 'center');
          ctx.restore();

          ctx.save();
          ctx.translate(targetX + 35, targetY + 8);
          ctx.scale(-splashScale, splashScale);
          this.text('💦', 0, 0, 24, COLORS.text, 'center');
          ctx.restore();

          this.circle(targetX, targetY + 38, 20 + p * 20, 'rgba(56, 189, 248, 0.3)', 'rgba(224, 242, 254, 0.75)', 2);
          ctx.restore();
        }
      } else if (type === 'heart') {
        const auraR = 15 + p * 45;
        this.circle(targetX, targetY, auraR, `rgba(244, 114, 182, ${0.35 * (1 - p)})`, `rgba(253, 224, 71, ${0.5 * (1 - p)})`, 2);
        this.text('💖', targetX, targetY, 34, COLORS.text, 'center');
      } else if (type === 'kiss') {
        this.text('💋', targetX, targetY, 34, COLORS.text, 'center');
      }
      ctx.restore();
    }
  }

  drawWaterBucket(x, y, tiltAngle = 0, scale = 1, isPouring = false) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tiltAngle);
    ctx.scale(scale, scale);

    ctx.beginPath();
    ctx.moveTo(-20, -14);
    ctx.lineTo(20, -14);
    ctx.lineTo(14, 16);
    ctx.lineTo(-14, 16);
    ctx.closePath();
    ctx.fillStyle = this.linearFill(-20, -14, 20, 16, [
      [0, '#bf7b38'],
      [0.35, '#8f4f1d'],
      [0.75, '#6c3610'],
      [1, '#4e2308'],
    ], '#8f4f1d');
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.fillRect(-18, -4, 36, 4);
    ctx.fillRect(-15.5, 7, 31, 4);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-18, -4, 36, 1.2);
    ctx.fillRect(-15.5, 7, 31, 1.2);

    this.drawOval(0, 16, 14, 4.5, '#4e2308', 'rgba(40, 15, 5, 0.6)', 1);
    this.drawOval(0, -14, 20, 6.5, isPouring ? '#1e293b' : '#0284c7', '#94a3b8', 2);

    if (!isPouring) {
      this.drawOval(0, -14, 17.5, 5.2, '#38bdf8', null);
      this.drawOval(-4, -15, 7, 2.2, 'rgba(255, 255, 255, 0.7)', null);
    }

    ctx.beginPath();
    ctx.arc(0, -14, 22, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.restore();
  }

  drawInteractionPicker(state, width) {
    if (!state.selectedTarget) return;
    const barW = 320;
    const barH = 82;
    const x = width / 2 - barW / 2;
    const y = 300;

    this.roundRect(x, y, barW, barH, 12, 'rgba(14, 38, 48, 0.96)', '#be9c5d');
    this.text(this.fit(`🎁 送给 ${state.selectedTarget.nickname}`, 240, 13), x + 16, y + 20, 13, '#f3dfb0', 'left', '600');

    // Close button
    this.text('✕', x + barW - 18, y + 20, 13, '#d0c4a8', 'center');
    this.targets.push({ x: x + barW - 34, y: y + 6, w: 28, h: 28, width: 28, height: 28, type: 'close-interaction', data: {} });

    INTERACTIONS.forEach((item, index) => {
      const bx = x + 12 + index * 74;
      this.button(item.label, bx, y + 36, 68, 34, 'interaction', { interaction: item.id, target: state.selectedTarget }, false, true);
    });
  }

  drawChatModal(state, width) {
    const currentTab = state.chatTab || 'messages';
    const modalW = 310;
    const modalH = 430;
    const x = width - modalW - 16;
    const y = 56;

    // Frosted glass background
    this.roundRect(x, y, modalW, modalH, 14, 'rgba(12, 34, 46, 0.96)', '#be9c5d');
    this.roundRect(x + 4, y + 4, modalW - 8, modalH - 8, 10, null, 'rgba(255, 215, 120, 0.15)');
    this.targets.push({ x, y, w: modalW, h: modalH, width: modalW, height: modalH, type: 'chat-panel', data: {} });

    // Header Title
    this.text('聊天', x + 14, y + 23, 14, '#f7df9c', 'left', '700');

    // Tab 1: 消息
    const tab1Active = currentTab === 'messages';
    this.roundRect(x + 50, y + 9, 52, 26, 4, tab1Active ? '#a0743b' : 'rgba(8, 24, 34, 0.7)', tab1Active ? '#f3d78e' : '#375a6c');
    this.text('消息', x + 76, y + 22, 12, tab1Active ? '#fff5d6' : '#94b2c2', 'center', '600');
    this.targets.push({ x: x + 50, y: y + 9, w: 52, h: 26, width: 52, height: 26, type: 'chat-tab', data: { tab: 'messages' } });

    // Tab 2: ⚡ 快捷语
    const tab2Active = currentTab === 'phrases';
    this.roundRect(x + 108, y + 9, 78, 26, 4, tab2Active ? '#a0743b' : 'rgba(8, 24, 34, 0.7)', tab2Active ? '#f3d78e' : '#375a6c');
    this.text('⚡ 快捷语', x + 147, y + 22, 12, tab2Active ? '#fff5d6' : '#94b2c2', 'center', '600');
    this.targets.push({ x: x + 108, y: y + 9, w: 78, h: 26, width: 78, height: 26, type: 'chat-tab', data: { tab: 'phrases' } });

    // Close button
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + modalW - 28, y + 17); ctx.lineTo(x + modalW - 18, y + 27);
    ctx.moveTo(x + modalW - 18, y + 17); ctx.lineTo(x + modalW - 28, y + 27);
    ctx.strokeStyle = '#d9cdb0'; ctx.lineWidth = 1.5; ctx.stroke();
    this.targets.push({ x: x + modalW - 38, y: y + 8, w: 30, h: 30, width: 30, height: 30, type: 'close-chat', data: {} });

    if (currentTab === 'phrases') {
      // 2x4 Quick Phrase Grid
      this.text('点击短语将直接在头像上浮现对白气泡', x + 16, y + 50, 11, '#94b6c8');
      const phrases = CLASSIC_CHAT_PHRASES;
      const colW = (modalW - 32) / 2;
      const itemH = 34;
      const startY = y + 62;
      phrases.forEach((phrase, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const px = x + 12 + col * (colW + 8);
        const py = startY + row * (itemH + 6);
        this.roundRect(px, py, colW, itemH, 6, 'rgba(18, 48, 64, 0.88)', '#376274');
        const short = this.fit(phrase, colW - 14, 11);
        this.text(short, px + colW / 2, py + 18, 11, '#eef3e2', 'center', '500');
        this.targets.push({ x: px, y: py, w: colW, h: itemH, width: colW, height: itemH, type: 'send-phrase', data: { phrase } });
      });
      return;
    }

    // Message list tab (filters out phrase and interaction so logs stay clean!)
    const allMessages = state.snapshot?.public?.chat || [];
    const messages = allMessages.filter((m) => m.kind !== 'phrase' && m.kind !== 'interaction');
    const inputY = y + modalH - 46;

    let messageY = y + 54;
    messages.slice(-8).forEach((message) => {
      if (message.kind === 'voice') {
        const isPlaying = state.playingVoiceId === message.id;
        this.roundRect(x + 14, messageY - 4, modalW - 28, 28, 5, isPlaying ? 'rgba(35, 78, 92, 0.95)' : 'rgba(16, 42, 56, 0.75)', isPlaying ? COLORS.gold : '#326074');
        const voiceLabel = `${message.senderNickname}: 🎙️ ${message.duration || 1}" ${isPlaying ? '🔊 播放中…' : '▶ 点击播放'}`;
        this.text(voiceLabel, x + 24, messageY + 9, 12, isPlaying ? '#ffea9f' : '#aee4f5', 'left', '600');
        this.targets.push({ x: x + 14, y: messageY - 4, w: modalW - 28, h: 28, width: modalW - 28, height: 28, type: 'play-voice', data: { message } });
      } else {
        const text = chatText(message);
        this.text(this.fit(text, modalW - 32, 12), x + 16, messageY + 8, 12, '#e2ecf0');
      }
      messageY += 32;
    });

    if (!messages.length) {
      this.text('还没有消息，打个招呼吧', x + modalW / 2, y + 120, 12, '#8ca8b5', 'center');
      this.text('点击牌桌头像送互动，或使用快捷语', x + modalW / 2, y + 144, 11, '#698a99', 'center');
    }

    // Bottom Input Bar
    const isVoiceMode = state.chatMode === 'voice';
    this.roundRect(x + 12, inputY, 34, 34, 6, isVoiceMode ? '#8a6230' : 'rgba(16, 44, 58, 0.85)', '#5a8698');
    this.text(isVoiceMode ? '⌨️' : '🎙️', x + 29, inputY + 17, 16, '#f3e1b0', 'center');
    this.targets.push({ x: x + 12, y: inputY, w: 34, h: 34, width: 34, height: 34, type: 'toggle-chat-mode', data: {} });

    if (isVoiceMode) {
      const voiceBarW = modalW - 60;
      const isRecording = Boolean(state.recordingVoice);
      this.roundRect(x + 52, inputY, voiceBarW, 34, 6, isRecording ? '#ba751f' : 'rgba(22, 54, 70, 0.9)', isRecording ? '#ffe08a' : '#4d788c');
      const voiceBtnLabel = isRecording ? '松手 发送 · 正在录音…' : '按住 说话';
      this.text(voiceBtnLabel, x + 52 + voiceBarW / 2, inputY + 17, 13, isRecording ? '#ffffff' : '#e2ecf0', 'center', '600');
      this.targets.push({ x: x + 52, y: inputY, w: voiceBarW, h: 34, width: voiceBarW, height: 34, type: 'voice-bar', data: {} });
    } else {
      const inputW = modalW - 128;
      this.roundRect(x + 52, inputY, inputW, 34, 6, 'rgba(8, 26, 36, 0.8)', '#4d788c');
      const draft = state.chatDraft || '点此输入消息…';
      this.text(this.fit(draft, inputW - 14, 12), x + 60, inputY + 18, 12, state.chatDraft ? '#edf0db' : '#7e9fad');
      this.targets.push({ x: x + 52, y: inputY, w: inputW, h: 34, width: inputW, height: 34, type: 'input', data: { field: 'chatDraft' } });
      this.button('发送', x + modalW - 70, inputY, 58, 34, 'send-chat', {}, false, false);
    }
  }

  drawCard(card, x, y, width, height, selected) {
    const ctx = this.ctx;
    const cardY = y - (selected ? 14 : 0);

    ctx.save();
    ctx.shadowColor = selected ? 'rgba(245, 158, 11, 0.7)' : 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = selected ? 10 : 3;
    ctx.shadowOffsetY = selected ? 2 : 1;

    this.roundRect(x, cardY, width, height, 6, '#ffffff', selected ? COLORS.gold : '#cbd5e1', selected ? 2 : 1);
    ctx.restore();

    const isJoker = card?.kind === 'joker';
    const isBig = isJoker && card.joker === 'big';
    const isRed = isJoker ? isBig : (card?.suit === 'hearts' || card?.suit === 'diamonds');
    const color = isRed ? '#dc2626' : '#1e293b';

    if (isJoker) {
      this.text(isBig ? '大' : '小', x + 7, cardY + 10, 11, color, 'left', '700');
      this.text('王', x + 7, cardY + 22, 11, color, 'left', '700');
      this.text('JOKER', x + width / 2, cardY + height / 2 + 6, 9.5, color, 'center', '700');
    } else {
      const rank = String(card?.rank || '');
      const suit = SUITS[card?.suit] || '';
      this.text(rank, x + 6, cardY + 10, 12, color, 'left', '700');
      this.text(suit, x + 6, cardY + 22, 10, color, 'left');

      // Center suit emblem
      ctx.save();
      ctx.globalAlpha = 0.85;
      this.text(suit, x + width / 2, cardY + height / 2 + 2, Math.min(22, width * 0.42), color, 'center');
      ctx.restore();
    }
  }

  drawLobbyControls(state, width) {
    const pub = state.snapshot.public;
    const me = state.snapshot.private.seat;
    const host = pub.players.find((player) => player.seat === me)?.isHost;
    const isSpectator = Boolean(state.snapshot.private.spectator || !me);
    const label = host ? '开始牌局' : (isSpectator ? '当前观战' : '等待房主开始');
    this.button(label, width / 2 - 110, 375, 220, 48, 'start', {}, !host || pub.players.length !== 4 || state.busy);
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
    let bx = width / 2 - totalWidth / 2;
    buttons.forEach((button) => {
      this.button(button.label, bx, 370, 104, 42, button.type, button.data, state.busy || button.disabled, button.secondary);
      bx += 112;
    });

    if (pub.phase === 'opening' && pub.openingTurn !== seat) this.text(`等待 ${pub.openingTurn || ''} 位选择首牌权`, width / 2, 388, 14, COLORS.muted, 'center');
    if (pub.phase === 'playing' && (isSpectator || pub.currentTurn !== seat)) this.text(isSpectator ? '观战中' : `等待 ${pub.currentTurn || ''} 位出牌`, width / 2, 388, 14, COLORS.muted, 'center');

    // Spectator mode
    if (isSpectator) {
      this.text('观战手牌 · 所有人明牌', 24, 424, 13, COLORS.muted);
      (snapshot.private.spectatorHands || []).forEach((p, index) => {
        const cards = sortCards(p.hand || [], pub.effectiveMain).map(cardLabel).join('  ');
        this.text(this.fit(`${p.seat}位 ${p.nickname}：${cards}`, width - 48, 11), 24, 444 + index * 18, 11, COLORS.text);
      });
      return;
    }

    // Player Hand Cards
    const hand = sortCards(snapshot.private.hand || [], pub.effectiveMain);
    const main = pub.effectiveMain;
    this.text('我的手牌', 24, 424, 13, COLORS.muted);
    const cardWidth = Math.min(56, (width - 60) / Math.max(14, hand.length));
    const gap = Math.min(cardWidth - 4, Math.max(28, (width - 60 - cardWidth) / Math.max(1, hand.length - 1)));
    const rowWidth = hand.length ? cardWidth + gap * (hand.length - 1) : 0;
    const startX = Math.max(24, (width - rowWidth) / 2);

    hand.forEach((card, index) => {
      const cx = startX + index * gap;
      const selected = state.selectedIds.includes(card.id);
      this.drawCard(card, cx, 441, cardWidth, 76, selected);
      this.targets.push({ x: cx, y: 425, w: cardWidth, h: 95, width: cardWidth, height: 95, type: 'select-card', data: { cardId: card.id } });
    });

    if (main) {
      const mainSuitLabel = SUITS[main] ? `${main}${SUITS[main]}` : main;
      this.text(`本局主牌：${mainSuitLabel}`, width - 24, 424, 13, COLORS.gold, 'right', '600');
    }
  }

  hit(x, y) {
    const pointX = (x - this.viewport.x) / this.viewport.scale;
    const pointY = (y - this.viewport.y) / this.viewport.scale;
    for (let index = this.targets.length - 1; index >= 0; index -= 1) {
      const target = this.targets[index];
      const targetW = target.width || target.w;
      const targetH = target.height || target.h;
      if (pointX >= target.x && pointX <= target.x + targetW && pointY >= target.y && pointY <= target.y + targetH) return target;
    }
    return null;
  }
}

module.exports = { FourOneFourRenderer, cardLabel };
