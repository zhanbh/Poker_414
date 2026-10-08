const { SEATS, relativeSeats, playerForSeat, tileLabel, actionLabel, chatText } = require('./model');

const INTERACTIONS = [
  { id: 'tomato', label: '🍅' }, { id: 'water', label: '💦' },
  { id: 'heart', label: '💖' }, { id: 'kiss', label: '💋' },
];
const COLORS = {
  background: '#07161f', panel: '#153847', panelLight: '#204e60', felt: '#086259',
  feltEdge: '#28a99c', text: '#f3f7f8', muted: '#9fb5be', gold: '#ffc75e',
  goldLight: '#ffe29a', goldDark: '#d49b29', green: '#40c89a', red: '#f07883',
  white: '#fffdf6', ink: '#18242a',
};

class MahjongRenderer {
  constructor(canvas, context) {
    this.canvas = canvas;
    this.ctx = context;
    this.targets = [];
    this.viewport = { scale: 1, x: 0, y: 0 };
    this.bgImage = null;
    this.bgLoaded = false;
    this.particles = [];
    this.avatarCache = new Map();
    this.initBackground();
    this.initParticles();
  }

  drawAvatar(url, x, y, size) {
    const ctx = this.ctx;
    const r = size / 2;
    if (url && typeof url === 'string') {
      let img = this.avatarCache.get(url);
      if (!img) {
        try {
          if (typeof wx !== 'undefined' && typeof wx.createImage === 'function') {
            img = wx.createImage();
          } else if (typeof Image !== 'undefined') {
            img = new Image();
          }
          if (img) {
            img.onload = () => { if (typeof this.onAssetLoaded === 'function') this.onAssetLoaded(); };
            img.src = url;
            this.avatarCache.set(url, img);
          }
        } catch { /* ignore */ }
      }
      if (img && img.width) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
        ctx.clip();
        try {
          ctx.drawImage(img, x, y, size, size);
        } catch { /* ignore */ }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        return;
      }
    }
    this.roundRect(x, y, size, size, r, '#163a4b', '#ffc75e');
    this.text('👤', x + r, y + r, Math.round(size * 0.52), COLORS.gold, 'center');
  }

  initBackground() {
    try {
      let img = null;
      if (typeof wx !== 'undefined' && typeof wx.createImage === 'function') {
        img = wx.createImage();
      } else if (typeof Image !== 'undefined') {
        img = new Image();
      }
      if (img) {
        img.onload = () => { this.bgLoaded = true; };
        img.src = 'assets/entry-bg.jpg';
        this.bgImage = img;
      }
    } catch {
      // Graceful fallback to procedural canvas gradient
    }
  }

  initParticles() {
    this.particles = Array.from({ length: 28 }, () => ({
      x: Math.random() * 540,
      y: Math.random() * 960,
      r: 1.0 + Math.random() * 2.4,
      speedY: 0.35 + Math.random() * 0.65,
      speedX: (Math.random() - 0.5) * 0.35,
      alpha: 0.2 + Math.random() * 0.6,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.03,
    }));
  }

  updateParticles() {
    for (const p of this.particles) {
      p.y -= p.speedY;
      p.x += p.speedX;
      p.pulse += p.pulseSpeed;
      if (p.y < -10) {
        p.y = 970;
        p.x = Math.random() * 540;
      }
      if (p.x < -10) p.x = 550;
      if (p.x > 550) p.x = -10;
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    if (!ctx.arc) return;
    for (const p of this.particles) {
      const alpha = Math.max(0.05, Math.min(1, p.alpha * (0.65 + 0.35 * Math.sin(p.pulse))));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 215, 120, ${alpha.toFixed(2)})`;
      ctx.fill();

      if (p.r > 2.2) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 199, 94, ${(alpha * 0.25).toFixed(2)})`;
        ctx.fill();
      }
    }
  }

  drawBackground(logicalWidth, logicalHeight) {
    const ctx = this.ctx;
    if (this.bgLoaded && this.bgImage && this.bgImage.width) {
      const imgW = this.bgImage.width;
      const imgH = this.bgImage.height;
      const imgRatio = imgW / imgH;
      const canvasRatio = logicalWidth / logicalHeight;
      let sw = imgW;
      let sh = imgH;
      let sx = 0;
      let sy = 0;
      if (imgRatio > canvasRatio) {
        sh = imgH;
        sw = sh * canvasRatio;
        sx = (imgW - sw) / 2;
      } else {
        sw = imgW;
        sh = sw / canvasRatio;
        sy = (imgH - sh) / 2;
      }
      try {
        ctx.drawImage(this.bgImage, sx, sy, sw, sh, 0, 0, logicalWidth, logicalHeight);
      } catch {
        try {
          ctx.drawImage(this.bgImage, 0, 0, logicalWidth, logicalHeight);
        } catch { /* proceed */ }
      }
      if (ctx.createLinearGradient) {
        const overlay = ctx.createLinearGradient(0, 0, 0, logicalHeight);
        if (overlay && typeof overlay.addColorStop === 'function') {
          overlay.addColorStop(0, 'rgba(6, 17, 24, 0.48)');
          overlay.addColorStop(0.35, 'rgba(6, 17, 24, 0.68)');
          overlay.addColorStop(0.75, 'rgba(6, 17, 24, 0.86)');
          overlay.addColorStop(1, 'rgba(4, 12, 18, 0.96)');
          ctx.fillStyle = overlay;
          ctx.fillRect(0, 0, logicalWidth, logicalHeight);
        }
      }
    } else {
      if (ctx.createRadialGradient) {
        const grad = ctx.createRadialGradient(
          logicalWidth / 2, logicalHeight * 0.35, 20,
          logicalWidth / 2, logicalHeight * 0.5, logicalHeight * 0.7
        );
        if (grad && typeof grad.addColorStop === 'function') {
          grad.addColorStop(0, '#133544');
          grad.addColorStop(0.45, '#0b202a');
          grad.addColorStop(1, '#051016');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, logicalWidth, logicalHeight);
        } else {
          ctx.fillStyle = COLORS.background;
          ctx.fillRect(0, 0, logicalWidth, logicalHeight);
        }
      } else {
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
      }
    }
  }

  roundRect(x, y, width, height, radius, fill, stroke) {
    const ctx = this.ctx;
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  text(value, x, y, size = 18, color = COLORS.text, align = 'left', weight = '400') {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value ?? ''), x, y);
  }

  button(label, x, y, width, height, type, data = {}, style = 'primary', disabled = false) {
    let fill = disabled ? '#52666e' : style === 'primary' ? COLORS.gold : style === 'danger' ? '#6a3944' : COLORS.panelLight;
    if (!disabled && style === 'primary' && this.ctx.createLinearGradient) {
      const grad = this.ctx.createLinearGradient(x, y, x, y + height);
      if (grad && typeof grad.addColorStop === 'function') {
        grad.addColorStop(0, '#ffd87a');
        grad.addColorStop(1, '#df9a28');
        fill = grad;
      }
    }
    const stroke = disabled ? '#64777e' : style === 'primary' ? '#fff0ba' : '#3a7887';
    this.roundRect(x, y, width, height, 10, fill, stroke);
    this.text(label, x + width / 2, y + height / 2, 17, disabled ? '#aab6b9' : style === 'primary' ? COLORS.ink : COLORS.text, 'center', '600');
    if (!disabled && type) this.targets.push({ x, y, width, height, type, data });
  }

  draw(state) {
    const ctx = this.ctx;
    const width = this.canvas.width || 960;
    const height = this.canvas.height || 540;
    const isPortrait = state.screen === 'entry' || state.screen === 'loading';
    const logicalWidth = isPortrait ? 540 : 960;
    const logicalHeight = isPortrait ? 960 : 540;
    const scale = Math.min(width / logicalWidth, height / logicalHeight);
    const x = (width - logicalWidth * scale) / 2;
    const y = (height - logicalHeight * scale) / 2;
    this.viewport = { scale, x, y, width: logicalWidth, height: logicalHeight };
    this.targets = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(scale, 0, 0, scale, x, y);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    if (state.screen === 'loading') this.drawLoading(state);
    else if (state.screen === 'entry') this.drawEntry(state);
    else if (state.screen === 'lobby') this.drawLobby(state);
    else this.drawGame(state);
    if (state.error) {
      if (isPortrait) {
        this.roundRect(50, 775, 440, 38, 10, 'rgba(104, 47, 58, 0.95)', '#c96a73');
        this.text(state.error, 270, 794, 15, '#ffe8e8', 'center');
      } else {
        this.roundRect(260, 490, 440, 34, 8, '#682f3a', '#c96a73');
        this.text(state.error, 480, 507, 15, '#ffe8e8', 'center');
      }
    }
  }

  drawBrand(title, subtitle) {
    this.text(title, 28, 30, 24, COLORS.gold, 'left', '700');
    if (subtitle) this.text(subtitle, 30, 58, 14, COLORS.muted);
  }

  drawLoading(state) {
    this.drawBackground(540, 960);
    this.drawParticles();

    // Central Brand Area & Chinese Seal
    this.roundRect(235, 210, 70, 70, 16, '#861c24', '#d49b29');
    this.roundRect(240, 215, 60, 60, 12, null, 'rgba(255, 215, 120, 0.45)');
    this.text('雀', 270, 245, 36, '#fffdf6', 'center', '700');

    this.text('414 麻将', 270, 320, 38, COLORS.gold, 'center', '700');
    this.text('四人经典 · 私房约战 · 雅致雀台', 270, 365, 15, COLORS.muted, 'center', '500');
    this.text('───  ◆  ───', 270, 400, 12, 'rgba(255, 199, 94, 0.45)', 'center');

    // Progress Section
    const progress = Math.min(100, Math.max(0, state.loadingProgress || 0));
    const barWidth = 380;
    const barHeight = 12;
    const barX = 80;
    const barY = 610;

    this.text(`正在准备游戏资源  ${Math.floor(progress)}%`, 270, 582, 16, COLORS.gold, 'center', '600');
    this.roundRect(barX, barY, barWidth, barHeight, 6, 'rgba(9, 24, 32, 0.95)', '#245362');

    const fillWidth = Math.max(8, (barWidth * progress) / 100);
    let fillStyle = COLORS.gold;
    if (this.ctx.createLinearGradient) {
      const grad = this.ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
      if (grad && typeof grad.addColorStop === 'function') {
        grad.addColorStop(0, '#ffd269');
        grad.addColorStop(1, '#f7971e');
        fillStyle = grad;
      }
    }
    this.roundRect(barX, barY, fillWidth, barHeight, 6, fillStyle);

    if (progress > 3 && progress < 99 && this.ctx.arc) {
      this.ctx.beginPath();
      this.ctx.arc(barX + fillWidth, barY + barHeight / 2, 4.5, 0, Math.PI * 2);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fill();
    }

    this.text(state.loadingTip || '正在预载游戏数据…', 270, 652, 13, COLORS.muted, 'center');
    this.text('抵制不良游戏 · 拒绝盗版游戏 · 注意自我保护', 270, 885, 11, '#537480', 'center');
    this.text('适度游戏益脑 · 沉迷游戏伤身 · 合理安排时间', 270, 905, 11, '#537480', 'center');
  }

  drawEntry(state) {
    this.drawBackground(540, 960);
    this.drawParticles();

    // Brand header
    this.roundRect(238, 80, 64, 24, 6, '#861c24', '#d49b29');
    this.text('私房雀局', 270, 92, 12, '#ffdb88', 'center', '600');
    this.text('414 麻将 · 微信小游戏', 270, 140, 30, COLORS.gold, 'center', '700');
    this.text('与网页版、小程序实时同步同一房间', 270, 180, 14, COLORS.muted, 'center');

    // Frosted glass card
    this.roundRect(30, 230, 480, 510, 22, 'rgba(14, 38, 50, 0.88)', '#296778');
    this.roundRect(36, 236, 468, 498, 18, null, 'rgba(255, 199, 94, 0.2)');

    this.text('加入麻将房间', 270, 280, 25, COLORS.text, 'center', '700');
    this.text('──  ◆  ──', 270, 308, 12, 'rgba(255, 199, 94, 0.45)', 'center');

    // Player profile status if known
    if (state.nickname) {
      this.roundRect(130, 332, 280, 44, 22, 'rgba(9, 27, 36, 0.92)', '#2c6170');
      this.drawAvatar(state.avatarUrl, 142, 338, 32);
      this.text(state.nickname, 186, 354, 15, COLORS.text, 'left', '600');
    } else {
      this.text('输入房间邀请码即可进入房间', 270, 354, 13, '#7d9fa8', 'center');
    }

    // Invite code section (hit 270, 409 falls inside 395~455)
    this.text('房间邀请码', 75, 385, 14, COLORS.muted);
    this.roundRect(70, 395, 400, 60, 10, 'rgba(7, 21, 28, 0.88)', state.focus === 'inviteCode' ? COLORS.gold : '#2c6170');
    this.text('🔑', 96, 425, 17, COLORS.gold, 'center');
    this.text(state.inviteCode || '点击输入邀请码', 122, 425, 16, state.inviteCode ? COLORS.text : '#6f8b96');
    this.targets.push({ x: 70, y: 395, width: 400, height: 60, type: 'input', data: { field: 'inviteCode' } });

    // Room info
    this.text('四人大众麻将 · 跨端实时互通', 270, 500, 13, '#6f8b96', 'center');
    this.text('───  ◆  ───', 270, 530, 12, 'rgba(255, 199, 94, 0.35)', 'center');

    // Enter Button
    const btnLabel = state.busy ? '正在连接…' : '进入麻将房间';
    this.button(btnLabel, 110, 625, 320, 58, 'enter', {}, 'primary', state.busy);

    // Compliance & status footer
    this.text(state.statusMessage || '游戏仅供测试、学习和交流', 270, 706, 13, COLORS.muted, 'center');
    this.text('虚拟积分无现实价值，不涉及充值或兑现。', 270, 726, 12, '#76949f', 'center');

    this.text('308娱乐 出品', 270, 890, 13, '#537480', 'center');
  }

  drawHeader(state, phaseLabel) {
    this.drawBrand('麻将房间', `四人大众麻将 · ${phaseLabel} · 第 ${state.snapshot.public.handNumber || 0} 局`);
    this.button('退出', 874, 16, 64, 34, 'leave', {}, 'secondary');
    const connected = state.connectionStatus === 'connected' ? '已连接' : state.connectionStatus === 'connecting' ? '连接中' : '连接中断';
    this.text(connected, 812, 62, 13, state.connectionStatus === 'connected' ? COLORS.green : COLORS.gold, 'right');
    this.button(state.chatOpen ? '收起聊天' : `聊天 ${((state.snapshot.public.chat || []).length) || ''}`, 792, 75, 146, 34, 'toggle-chat', {}, 'secondary');
  }

  drawPlayerCard(state, seat, x, y, width, height, align = 'left') {
    const player = playerForSeat(state.snapshot, seat);
    const isOwn = seat === state.snapshot.private.seat && !state.snapshot.private.spectator;
    const selected = state.selectedTarget && state.selectedTarget.seat === seat;
    const fill = player ? (selected ? '#315765' : '#163748') : '#132e3c';
    this.roundRect(x, y, width, height, 12, fill, selected ? COLORS.gold : player ? '#4c8997' : '#345d6b');

    if (player) {
      const avatarSize = 38;
      const avatarX = align === 'right' ? x + width - avatarSize - 10 : x + 10;
      const avatarY = y + (height - avatarSize) / 2;
      this.drawAvatar(player.avatarUrl, avatarX, avatarY, avatarSize);

      const label = player.nickname;
      const status = `${player.handCount} 张 · ${player.score} 分${player.isDealer ? ' · 庄' : ''}${player.isListening ? ' · 听' : ''}${player.connected ? '' : ' · 暂离'}`;
      const tx = align === 'right' ? avatarX - 10 : avatarX + avatarSize + 10;
      this.text(`${isOwn ? '你 · ' : ''}${label}`, tx, y + 23, 15, COLORS.text, align, '600');
      this.text(status, tx, y + 47, 12, player.connected ? COLORS.muted : COLORS.red, align);

      if (!isOwn) this.targets.push({ x, y, width, height, type: 'select-player', data: { seat, nickname: player.nickname } });
      if (state.snapshot.public.winAnnouncement?.winnerSeat === seat) {
        this.text('胡牌', align === 'right' ? x + 14 : x + width - 14, y + height - 15, 13, COLORS.gold, align === 'right' ? 'left' : 'right', '700');
      }
    } else {
      const label = ({ A: '东家', B: '南家', C: '西家', D: '北家' })[seat] + ' · 空位';
      this.text(label, x + width / 2, y + 25, 15, COLORS.muted, 'center', '600');
      this.text('等待玩家', x + width / 2, y + 49, 12, COLORS.muted, 'center');
    }

    const latestInteraction = [...(state.snapshot.public.chat || [])].reverse().find((message) =>
      message.kind === 'interaction' && message.targetSeat === seat && Date.now() - message.createdAt < 1700);
    if (latestInteraction) {
      const age = Date.now() - latestInteraction.createdAt;
      const lift = Math.round((age / 1700) * 20);
      this.roundRect(x + width - 36, y - 13 - lift, 30, 30, 15, '#315666', COLORS.gold);
      this.text(({ tomato: '🍅', water: '💦', heart: '💖', kiss: '💋' })[latestInteraction.interaction] || '✨', x + width - 21, y + 2 - lift, 17, COLORS.text, 'center');
    }
  }

  drawLobby(state) {
    const snapshot = state.snapshot;
    this.drawHeader(state, '等待开局');
    this.roundRect(140, 105, 680, 345, 160, '#07564f', '#218b82');
    this.roundRect(154, 119, 652, 317, 150, null, '#2b8880');
    this.text('麻将', 480, 220, 31, COLORS.gold, 'center', '700');
    this.text(`${snapshot.public.players.length} / 4 人已入座`, 480, 256, 18, COLORS.text, 'center');
    this.text('房间聊天和互动对所有玩家、观战者开放', 480, 284, 13, COLORS.muted, 'center');
    const points = state.chatOpen
      ? { A: [480, 96], B: [820, 208], C: [480, 450], D: [380, 208] }
      : { A: [480, 91], B: [820, 258], C: [480, 450], D: [140, 258] };
    for (const seat of SEATS) {
      const [px, py] = points[seat];
      this.drawPlayerCard(state, seat, px - 92, py - 34, 184, 68, seat === 'D' ? 'left' : 'left');
    }
    const isHost = snapshot.public.hostSeat === snapshot.private.seat && !snapshot.private.spectator;
    this.button(snapshot.private.spectator ? '观战中' : isHost ? '开始牌局' : '等待房主开始', 383, 318, 194, 48, 'start', {}, 'primary', !isHost || snapshot.public.players.length < 4);
    if (snapshot.private.spectator) this.text('观战者可以聊天互动，满四人后由房主开局', 480, 384, 13, COLORS.muted, 'center');
    this.drawChat(state, 28, 90, 250, 390);
  }

  drawTile(tile, x, y, width, height, selected = false) {
    this.roundRect(x, y, width, height, 6, COLORS.white, selected ? COLORS.gold : '#cad9db');
    const label = tileLabel(tile);
    const isRed = /[万条筒]|中/.test(label);
    this.text(label, x + width / 2, y + height / 2, Math.max(12, Math.min(18, height * 0.35)), isRed ? '#b94245' : '#20333a', 'center', '700');
  }

  drawGame(state) {
    const snapshot = state.snapshot;
    const phase = snapshot.public.phase === 'settled' ? '本局结算' : '对局中';
    this.drawHeader(state, phase);
    const table = state.chatOpen ? { x: 260, y: 95, w: 470, h: 325 } : { x: 100, y: 90, w: 760, h: 345 };
    this.roundRect(table.x, table.y, table.w, table.h, 160, '#07564f', '#268f86');
    this.roundRect(table.x + 15, table.y + 14, table.w - 30, table.h - 28, 145, null, '#2b8880');
    this.text(`第 ${snapshot.public.handNumber} 局`, table.x + table.w / 2, table.y + 96, 20, COLORS.gold, 'center', '700');
    this.text(`牌墙 ${snapshot.public.wallCount} 张`, table.x + table.w / 2, table.y + 123, 14, COLORS.muted, 'center');
    if (snapshot.public.currentTurn) {
      const turnPlayer = playerForSeat(snapshot, snapshot.public.currentTurn);
      this.text(turnPlayer ? `轮到 ${turnPlayer.nickname}` : '等待操作', table.x + table.w / 2, table.y + 149, 15, COLORS.text, 'center');
    }
    const discards = snapshot.public.discardRiver || [];
    const shown = discards.slice(-12);
    shown.forEach((entry, index) => {
      const column = index % 6;
      const row = Math.floor(index / 6);
      this.drawTile(entry.tile, table.x + table.w / 2 - 117 + column * 40, table.y + 177 + row * 44, 34, 40,
        Boolean(snapshot.public.pendingDiscard && entry.tile.id === snapshot.public.pendingDiscard.tile.id));
    });
    if (snapshot.public.phase === 'settled' && snapshot.public.settlement) {
      const result = snapshot.public.settlement.type === 'draw'
        ? '流局 · 本局不计分'
        : `${snapshot.public.settlement.winnerNickname || snapshot.public.settlement.winnerSeat} 胡牌 · ${snapshot.public.settlement.winPattern || '平和'}`;
      this.text(result, table.x + table.w / 2, table.y + table.h - 30, 17, COLORS.gold, 'center', '700');
    }
    const order = relativeSeats(snapshot.private.seat || 'A');
    const seatPoints = state.chatOpen
      ? { bottom: [table.x + table.w / 2 - 88, table.y + table.h - 4], left: [table.x - 68, table.y + table.h / 2 - 35], top: [table.x + table.w / 2 - 88, table.y - 24], right: [table.x + table.w - 92, table.y + table.h / 2 - 35] }
      : { bottom: [480, 370], left: [5, 250], top: [390, 80], right: [775, 250] };
    order.forEach((seat, index) => {
      const point = seatPoints[['bottom', 'left', 'top', 'right'][index]];
      this.drawPlayerCard(state, seat, point[0], point[1], 176, 62, index === 3 ? 'right' : 'left');
    });
    const ownSeat = snapshot.private.seat;
    if (!snapshot.private.spectator && ownSeat) this.drawHand(state, 32, 456, state.chatOpen ? 470 : 690);
    else this.text('观战模式 · 可查看牌桌、聊天和互动', 480, 474, 14, COLORS.muted, 'center');
    this.drawActions(state);
    this.drawChat(state, 746, 118, 194, 355);
    if (state.selectedTarget) this.drawInteractionPicker(state);
  }

  drawHand(state, x, y, width) {
    const hand = state.snapshot.private.hand || [];
    this.text(`手牌 ${hand.length} 张${state.snapshot.private.isListening ? ' · 已听牌' : ''}`, x, y - 11, 13, COLORS.muted);
    if (hand.length === 0) return;
    const gap = Math.min(5, Math.max(0, (width - hand.length * 34) / Math.max(1, hand.length - 1)));
    const tileWidth = Math.min(43, (width - (hand.length - 1) * gap) / hand.length);
    const totalWidth = hand.length * tileWidth + (hand.length - 1) * gap;
    hand.forEach((tile, index) => {
      const selected = state.selectedTileId === tile.id;
      const tx = x + (width - totalWidth) / 2 + index * (tileWidth + gap);
      this.drawTile(tile, tx, y + (selected ? -9 : 0), tileWidth, 48, selected);
      this.targets.push({ x: tx - 2, y: y - 12, width: tileWidth + 4, height: 64, type: 'select-tile', data: { tileId: tile.id } });
    });
  }

  drawActions(state) {
    const snapshot = state.snapshot;
    const actions = snapshot.private.availableActions || [];
    const waitingListen = (snapshot.private.postDiscardListenWaits || []).length > 0;
    const visibleActions = waitingListen ? ['listen', 'pass'] : actions.filter((action) => action !== 'discard');
    if (!waitingListen && actions.includes('discard') && state.selectedTileId) visibleActions.unshift('discard');
    if (snapshot.public.phase === 'settled' && snapshot.public.hostSeat === snapshot.private.seat) visibleActions.push('start-hand');
    const labels = { 'start-hand': snapshot.public.handNumber ? '下一局' : '开始牌局' };
    const x0 = state.chatOpen ? 520 : 744;
    const buttonWidth = state.chatOpen ? 96 : 92;
    visibleActions.forEach((action, index) => {
      const label = labels[action] || actionLabel(action);
      const data = action === 'chi' ? { action, chiOptions: snapshot.private.chiOptions || [] } : { action };
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = x0 + column * (buttonWidth + 6);
      const y = 418 + row * 37;
      this.button(label, x, y, buttonWidth, 32, action === 'start-hand' ? 'command' : 'action', data,
        action === 'hu' || action === 'start-hand' ? 'primary' : 'secondary', false);
    });
  }

  drawChat(state, x, y, width, height) {
    if (!state.chatOpen) return;
    this.roundRect(x, y, width, height, 14, '#102d3b', '#377988');
    this.text('房间聊天', x + 14, y + 20, 15, COLORS.gold, 'left', '700');
    const messages = state.snapshot?.public?.chat || [];
    const visible = messages.slice(-5);
    visible.forEach((message, index) => {
      const label = chatText(message);
      const maxCharacters = Math.max(8, Math.floor((width - 24) / 12));
      this.text(label.length > maxCharacters ? label.slice(0, maxCharacters - 1) + '…' : label, x + 12, y + 52 + index * 31, 12,
        message.kind === 'interaction' ? COLORS.gold : COLORS.text);
    });
    const inputY = y + height - 95;
    this.roundRect(x + 10, inputY, width - 20, 34, 7, '#173d4d', '#347384');
    this.text(state.chatDraft || '点此输入消息', x + 18, inputY + 17, 12, state.chatDraft ? COLORS.text : COLORS.muted);
    this.targets.push({ x: x + 10, y: inputY, width: width - 20, height: 34, type: 'input', data: { field: 'chatDraft' } });
    this.button('发送', x + width - 73, inputY + 43, 62, 34, 'send-chat', {}, 'secondary');
  }

  drawInteractionPicker(state) {
    const x = 315;
    const y = 377;
    this.roundRect(x, y, 330, 60, 12, '#173c4c', '#528b95');
    this.text(`送给 ${state.selectedTarget.nickname}`, x + 14, y + 16, 13, COLORS.muted);
    INTERACTIONS.forEach((item, index) => {
      const bx = x + 20 + index * 72;
      this.button(item.label, bx, y + 27, 56, 26, 'interaction', { interaction: item.id }, 'secondary');
    });
  }

  hit(x, y) {
    const logicalX = (x - this.viewport.x) / this.viewport.scale;
    const logicalY = (y - this.viewport.y) / this.viewport.scale;
    if (logicalX < 0 || logicalX > this.viewport.width || logicalY < 0 || logicalY > this.viewport.height) return null;
    return [...this.targets].reverse().find((target) => logicalX >= target.x && logicalX <= target.x + target.width
      && logicalY >= target.y && logicalY <= target.y + target.height) || null;
  }
}

module.exports = { MahjongRenderer };
