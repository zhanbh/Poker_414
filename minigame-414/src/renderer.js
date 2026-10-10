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
    this.avatarCache = new Map();
    this.animTime = 0;
    this.bgImage = null;
    this.bgLoaded = false;
    this.particles = [];
    this.suits = [];
    this.initBackground();
    this.initParticles();
    this.initSuits();
  }

  initBackground() {
    try {
      const image = typeof wx !== 'undefined' && typeof wx.createImage === 'function'
        ? wx.createImage()
        : typeof Image !== 'undefined' ? new Image() : null;
      if (!image) return;
      image.onload = () => {
        this.bgLoaded = true;
        if (typeof this.onAssetLoaded === 'function') this.onAssetLoaded();
      };
      image.onerror = () => { this.bgLoaded = false; };
      image.src = 'assets/poker-entry-bg.jpg';
      this.bgImage = image;
    } catch { /* Keep the procedural gradient fallback. */ }
  }

  save() {
    if (this.ctx && typeof this.ctx.save === 'function') this.ctx.save();
  }

  restore() {
    if (this.ctx && typeof this.ctx.restore === 'function') this.ctx.restore();
  }

  drawAvatar(url, x, y, size, square = false) {
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
            img.onerror = () => {
              img.__avatarLoadFailed = true;
              const host = String(url).match(/^https:\/\/([^/]+)/i)?.[1] || 'unknown host';
              console.warn(`[414] avatar image failed to load from ${host}; check the mini-game downloadFile domain allowlist`);
              if (typeof this.onAssetLoaded === 'function') this.onAssetLoaded();
            };
            img.src = url;
            this.avatarCache.set(url, img);
          }
        } catch { /* ignore */ }
      }
      if (img?.__avatarLoadFailed) return false;
      if (img && img.width) {
        this.save();
        if (square) this.roundRect(x, y, size, size, 6, null);
        else { ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); }
        if (typeof ctx.clip === 'function') ctx.clip();
        try {
          if (typeof ctx.drawImage === 'function') ctx.drawImage(img, x, y, size, size);
          this.restore();
          return true;
        } catch {
          this.restore();
        }
      }
    }
    return false;
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

  drawMicIcon(cx, cy, size = 18, color = '#f3e1b0') {
    const ctx = this.ctx;
    if (!ctx) return;
    if (typeof ctx.save === 'function') ctx.save();

    // 1. WeChat capsule mic body (话筒圆角主体)
    const bodyW = size * 0.40;
    const bodyH = size * 0.58;
    const bodyY = cy - size * 0.12;
    this.roundRect(cx - bodyW / 2, bodyY - bodyH / 2, bodyW, bodyH, bodyW / 2, color);

    // 2. WeChat U-cradle bracket (U型承托环)
    if (typeof ctx.beginPath === 'function' && typeof ctx.arc === 'function') {
      const cradleR = size * 0.34;
      ctx.beginPath();
      ctx.arc(cx, bodyY, cradleR, 0, Math.PI, false);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, size * 0.10);
      ctx.lineCap = 'round';
      if (typeof ctx.stroke === 'function') ctx.stroke();

      // 3. Stem (中心支撑竖线)
      const stemTop = bodyY + cradleR;
      const stemBottom = cy + size * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx, stemTop);
      ctx.lineTo(cx, stemBottom);
      if (typeof ctx.stroke === 'function') ctx.stroke();

      // 4. Base foot bar (底部水平底座)
      const baseW = size * 0.44;
      ctx.beginPath();
      ctx.moveTo(cx - baseW / 2, stemBottom);
      ctx.lineTo(cx + baseW / 2, stemBottom);
      if (typeof ctx.stroke === 'function') ctx.stroke();
    }

    if (typeof ctx.restore === 'function') ctx.restore();
  }

  drawKeyboardIcon(cx, cy, size = 18, color = '#f3e1b0') {
    const ctx = this.ctx;
    if (!ctx) return;
    if (typeof ctx.save === 'function') ctx.save();

    const kbW = size * 0.82;
    const kbH = size * 0.56;
    const kbX = cx - kbW / 2;
    const kbY = cy - kbH / 2;
    this.roundRect(kbX, kbY, kbW, kbH, 3.5, null, color, Math.max(1.3, size * 0.08));

    // Keyboard key dots
    const dotR = Math.max(1, size * 0.05);
    const colSpacing = kbW / 4;
    for (let r = 0; r < 2; r += 1) {
      const rowY = kbY + kbH * (0.28 + r * 0.26);
      for (let c = 1; c <= 3; c += 1) {
        this.circle(kbX + c * colSpacing, rowY, dotR, color);
      }
    }
    // Spacebar
    if (typeof ctx.beginPath === 'function' && typeof ctx.moveTo === 'function') {
      ctx.beginPath();
      ctx.moveTo(cx - kbW * 0.28, kbY + kbH * 0.80);
      ctx.lineTo(cx + kbW * 0.28, kbY + kbH * 0.80);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, size * 0.08);
      ctx.lineCap = 'round';
      if (typeof ctx.stroke === 'function') ctx.stroke();
    }

    if (typeof ctx.restore === 'function') ctx.restore();
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
    if (type === 'enter') {
      const radius = 14;
      if (!disabled) {
        // 3D bottom bevel for tactile cartoon feel
        this.roundRect(x, y + 4, w, h, radius, '#b45309', null);
      }
      let fill = disabled ? '#94a3b8' : '#f59e0b';
      if (!disabled && this.ctx.createLinearGradient) {
        const grad = this.ctx.createLinearGradient(x, y, x, y + h);
        if (grad && typeof grad.addColorStop === 'function') {
          grad.addColorStop(0, '#fde047');
          grad.addColorStop(1, '#f59e0b');
          fill = grad;
        }
      }
      const stroke = disabled ? '#cbd5e1' : '#fef08a';
      this.roundRect(x, y, w, h, radius, fill, stroke, 1.5);
      this.text(label, x + w / 2, y + h / 2, 18, disabled ? '#f1f5f9' : '#ffffff', 'center', '800');
      if (!disabled) this.targets.push({ x, y, w, h, width: w, height: h, type, data });
      return;
    }

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
    this.text(label, x + 2, y - 13, 13, '#047857', 'left', '700');
    const isFocused = this.currentFocus === field;
    this.roundRect(x, y + 2, width, 52, 12, 'rgba(16, 185, 129, 0.12)', null);
    this.roundRect(
      x, y, width, 52, 12,
      isFocused ? '#ffffff' : '#f0fdf4',
      isFocused ? '#059669' : '#a7f3d0',
      isFocused ? 2 : 1.5,
    );
    this.text(
      value || `点击输入${label}`,
      x + 16, y + 26,
      value ? 17 : 14,
      value ? '#064e3b' : '#94a3b8',
      'left',
      value ? '700' : '500',
    );
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

  initParticles() {
    this.particles = Array.from({ length: 32 }, () => ({
      x: Math.random() * 540,
      y: Math.random() * 960,
      r: 1.0 + Math.random() * 2.2,
      speedY: 0.35 + Math.random() * 0.65,
      speedX: (Math.random() - 0.5) * 0.35,
      alpha: 0.2 + Math.random() * 0.6,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.035,
    }));
  }

  initSuits() {
    this.suits = [
      { char: '♠', x: 80, baseY: 175, size: 70, color: '#ffffff', baseAlpha: 0.16, phase: 0 },
      { char: '♥', x: 460, baseY: 205, size: 68, color: '#f87171', baseAlpha: 0.20, phase: 1.5 },
      { char: '♣', x: 75, baseY: 810, size: 66, color: '#6ee7b7', baseAlpha: 0.18, phase: 3.1 },
      { char: '♦', x: 465, baseY: 790, size: 72, color: '#fde047', baseAlpha: 0.20, phase: 4.7 },
      { char: '♠', x: 475, baseY: 460, size: 55, color: '#ffffff', baseAlpha: 0.14, phase: 2.1 },
      { char: '♦', x: 65, baseY: 470, size: 52, color: '#fb923c', baseAlpha: 0.18, phase: 5.3 },
    ];
  }

  updateEntryEffects(deltaMs = 16) {
    this.animTime += deltaMs;
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
    if (!ctx || typeof ctx.arc !== 'function') return;
    for (const p of this.particles) {
      const alpha = Math.max(0.08, Math.min(0.9, p.alpha * (0.65 + 0.35 * Math.sin(p.pulse))));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
      ctx.fill();

      if (p.r > 1.8) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167, 243, 208, ${(alpha * 0.35).toFixed(2)})`;
        ctx.fill();
      }
    }
  }

  drawSuits() {
    const ctx = this.ctx;
    const t = this.animTime * 0.0015;
    for (const s of this.suits) {
      const floatY = s.baseY + Math.sin(t + s.phase) * 9;
      const alpha = Math.max(0.04, Math.min(0.25, s.baseAlpha + Math.sin(t * 0.8 + s.phase) * 0.04));
      ctx.save();
      ctx.globalAlpha = alpha;
      // Miniature rounded cartoon card backing behind suits for playful flair
      this.roundRect(s.x - s.size * 0.32, floatY - s.size * 0.42, s.size * 0.64, s.size * 0.84, 8, 'rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.3)', 1);
      this.text(s.char, s.x, floatY, s.size * 0.45, s.color, 'center');
      ctx.restore();
    }
  }

  drawButtonShimmer(bx, by, bw, bh) {
    const ctx = this.ctx;
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.clip !== 'function') return;
    const period = 3200;
    const progress = (this.animTime % period) / period;
    if (progress > 0.45) return;
    const p = progress / 0.45;
    const shimmerX = bx - 60 + p * (bw + 120);

    ctx.save();
    this.roundRect(bx, by, bw, bh, 14, null, null);
    try {
      ctx.clip();
      const grad = this.linearFill(shimmerX - 35, by, shimmerX + 35, by + bh, [
        [0, 'rgba(255, 255, 255, 0)'],
        [0.5, 'rgba(255, 255, 255, 0.35)'],
        [1, 'rgba(255, 255, 255, 0)'],
      ], null);
      if (grad) {
        ctx.fillStyle = grad;
        ctx.fillRect(shimmerX - 35, by, 70, bh);
      }
    } catch {
      /* Safe fallback */
    }
    ctx.restore();
  }

  drawEntry(state) {
    const ctx = this.ctx;
    let hasSceneBackground = false;
    if (this.bgLoaded && this.bgImage?.width && typeof ctx.drawImage === 'function') {
      try {
        ctx.drawImage(this.bgImage, 0, 0, 540, 960);
        hasSceneBackground = true;
      } catch { /* Use the gradient fallback if the image cannot be drawn. */ }
    }
    if (hasSceneBackground) {
      // Light airy vignette to preserve the vibrant emerald table and white card highlights
      const overlay = this.linearFill(0, 0, 0, 960, [
        [0, 'rgba(4, 78, 59, 0.12)'],
        [0.3, 'rgba(4, 47, 46, 0.08)'],
        [0.7, 'rgba(4, 78, 59, 0.22)'],
        [1, 'rgba(4, 47, 46, 0.50)'],
      ], 'rgba(4, 78, 59, 0.18)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, 540, 960);
    } else {
      // Vibrant fresh cartoon green felt fallback
      const bgGrad = this.linearFill(0, 0, 540, 960, [
        [0, '#10b981'],
        [0.3, '#059669'],
        [0.7, '#047857'],
        [1, '#064e3b'],
      ], '#059669');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 540, 960);

      // Playful cartoon table rim
      this.drawOval(270, 480, 245, 450, null, 'rgba(255, 255, 255, 0.22)', 3);
      this.drawOval(270, 480, 235, 440, null, 'rgba(52, 211, 153, 0.35)', 1.5);
    }

    // Floating cartoon mini-cards & suits
    this.drawSuits();

    // Sparkling starlight particles
    this.drawParticles();

    // Brand Header - Modern Cartoon Capsule
    const badgeW = 144;
    const badgeH = 28;
    const badgeX = (540 - badgeW) / 2;
    const badgeY = 82;
    this.roundRect(badgeX, badgeY + 2, badgeW, badgeH, 14, 'rgba(4, 47, 46, 0.35)', null);
    this.roundRect(badgeX, badgeY, badgeW, badgeH, 14, '#ffffff', '#34d399', 2);
    this.text('♣ 414 欢乐扑克 ♠', 270, badgeY + 14, 13, '#059669', 'center', '700');

    // Vibrant 3D Cartoon Title: 414 扑克对决
    this.text('414 扑克对决', 270, 150, 36, '#064e3b', 'center', '900');
    this.text('414 扑克对决', 270, 146, 36, '#ffffff', 'center', '900');

    // Modern Subtitle Pill
    this.roundRect(165, 182, 210, 26, 13, 'rgba(255, 255, 255, 0.22)', 'rgba(255, 255, 255, 0.45)', 1);
    this.text('经典四人二打二 · 欢乐开局', 270, 195, 13, '#ffffff', 'center', '600');

    // Pure White Cartoon Card with 3D bottom bevel
    const cardX = 75;
    const cardY = 270;
    const cardW = 390;
    const cardH = 370;
    // 3D shadow for card
    this.roundRect(cardX, cardY + 5, cardW, cardH, 22, 'rgba(4, 78, 59, 0.35)', null);
    // Main card face: pure crisp white with mint border
    this.roundRect(cardX, cardY, cardW, cardH, 22, '#ffffff', '#a7f3d0', 2.5);
    // Inner gentle rim
    this.roundRect(cardX + 6, cardY + 6, cardW - 12, cardH - 12, 17, null, 'rgba(16, 185, 129, 0.15)', 1.2);

    this.text('✦ 快速加入房间 ✦', 270, cardY + 36, 18, '#059669', 'center', '800');

    // Invite Code Input
    this.input('邀请码', state.inviteCode, cardX + 25, cardY + 70, cardW - 50, 'inviteCode');

    // Mode Tag
    this.text('四人二打二 · 跨端实时互通', 270, cardY + 144, 12.5, '#059669', 'center', '600');

    // Tip Banner (Sunny lemon yellow pill)
    this.roundRect(cardX + 25, cardY + 166, cardW - 50, 26, 8, '#fef9c3', '#fde047', 1);
    this.text('💡 输入邀请码后点【进入房间】即可入局', 270, cardY + 179, 11, '#854d0e', 'center', '600');

    // Authorization Notice
    const authAvailable = state.canRequestUserInfo && !state.profileAuthorized;
    this.text(authAvailable ? '首次进入将同步微信昵称与头像' : '输入 6 位房间邀请码即可入局对战', 270, cardY + 214, 12, '#64748b', 'center', '500');

    // Enter Button (Cartoon 3D Amber Button)
    this.button(state.busy ? '正在进入…' : '进入房间', cardX + 25, cardY + 240, cardW - 50, 56, 'enter', {}, state.busy);
    if (!state.busy) {
      this.drawButtonShimmer(cardX + 25, cardY + 240, cardW - 50, 56);
    }

    // Status Message
    const cardMsg = state.statusMessage || (state.error ? state.error : '请输入 6 位房间邀请码');
    this.text(this.fit(cardMsg, cardW - 30, 12), 270, cardY + 326, 12, state.error ? '#ef4444' : '#64748b', 'center', '500');

    // Footer
    this.text('虚拟筹码不具有现金或财产价值，仅供测试、学习和交流', 270, 875, 11, 'rgba(255, 255, 255, 0.85)', 'center');
    this.text('308娱乐 出品', 270, 902, 13, '#ffffff', 'center', '700');
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

    // Keep the chat launcher aligned with Mahjong's mid-right position,
    // clear of the WeChat mini-program capsule in the top-right corner.
    const chatX = width - 42;
    const chatY = 315;
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
      const avatarD = 36;
      const hasImage = this.drawAvatar(player.avatarUrl, avX - avatarD / 2, avY - avatarD / 2, avatarD, false);
      if (!hasImage) {
        this.circle(avX, avY, 18, isMe ? '#226050' : '#1e4859', isMe ? COLORS.gold : '#508398', 1.5);
        this.text(player.nickname ? player.nickname.slice(0, 1) : seat, avX, avY, 14, '#ffffff', 'center', '700');
      } else {
        this.circle(avX, avY, 18, null, isMe ? COLORS.gold : '#508398', 1.5);
      }

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
    const duration = 2200;
    if (age >= duration) return;
    const progress = Math.min(1, age / duration);
    const type = message.interaction || 'tomato';
    const flyRatio = type === 'heart' ? 0.48 : 0.35;
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

    const icon = ({ tomato: '🍅', water: '💦', heart: '❤️', kiss: '💋' })[type] || '✨';

    if (progress < flyRatio) {
      const p = progress / flyRatio;
      const easeP = p * (2 - p);
      const arc = -85 * Math.sin(p * Math.PI);
      const curX = startX + (targetX - startX) * easeP;
      const curY = startY + (targetY - (type === 'water' ? 60 : 0) - startY) * easeP + arc;

      ctx.save();
      if (type === 'tomato') {
        ctx.translate(curX, curY);
        ctx.rotate(p * Math.PI * 6);
        for (let i = 1; i <= 4; i += 1) {
          this.circle(-i * 9, Math.sin(i * 1.5) * 4, Math.max(1.5, 5 - i), `rgba(239, 68, 68, ${0.7 - i * 0.15})`);
        }
        this.text('🍅', 0, 11, 36, COLORS.text, 'center');
      } else if (type === 'water') {
        const flyTilt = (targetX >= startX ? 0.2 : -0.2) + Math.sin(p * Math.PI * 3) * 0.15;
        const tipAtEnd = p > 0.65 ? ((p - 0.65) / 0.35) * Math.PI * 0.55 : 0;
        for (let i = 1; i <= 4; i += 1) {
          const tp = Math.max(0, p - i * 0.08);
          const tx = startX + (targetX - startX) * tp;
          const ty = startY + (targetY - 60 - startY) * tp - 85 * Math.sin(tp * Math.PI);
          this.circle(tx, ty, Math.max(1.5, 4 - i * 0.7), 'rgba(186, 230, 253, 0.75)');
        }
        this.drawWaterBucket(curX, curY, flyTilt + tipAtEnd, 1.25, p > 0.75);
      } else if (type === 'heart') {
        // 红心慢慢飞向目标，越飞越大，飞到目标头像时最大！
        // 1. 越飞越大：从 0.55 (约 20px) 持续放大至 1.9 (约 68px)！
        const baseScale = 0.55 + 1.35 * p;
        const pulse = 1 + 0.08 * Math.sin(p * Math.PI * 10);
        const heartScale = baseScale * pulse;

        // 2. 飞行尾迹：身后拖拽闪烁的星芒碎钻流光 (Stardust bling-trail)
        for (let i = 1; i <= 5; i += 1) {
          const tp = Math.max(0, p - i * 0.06);
          const tEase = tp * (2 - tp);
          const tx = startX + (targetX - startX) * tEase;
          const ty = startY + (targetY - startY) * tEase - 85 * Math.sin(tp * Math.PI);
          const trailAlpha = Math.max(0, (1 - i * 0.18) * (1 - p * 0.25));
          const trailGems = ['✨', '⭐', '🌟', '💫', '✨'];
          ctx.save();
          ctx.globalAlpha = trailAlpha;
          this.text(trailGems[i - 1], tx, ty + 4, Math.max(9, 14 - i * 2), '#fde047', 'center');
          ctx.restore();
        }

        // 3. 鲜艳红心本体绘制：粉金双色光晕 + 红心 ❤️
        ctx.save();
        ctx.translate(curX, curY);
        ctx.scale(heartScale, heartScale);
        this.circle(0, 0, 18, `rgba(239, 68, 68, ${0.3 + p * 0.25})`, `rgba(253, 224, 71, ${0.45 * p})`, 1.5);
        this.text('❤️', 0, 9, 36, COLORS.text, 'center');
        ctx.restore();
      } else if (type === 'kiss') {
        const wave = Math.sin(p * Math.PI * 5) * 10;
        ctx.translate(curX, curY + wave);
        ctx.rotate(-0.15 + Math.sin(p * Math.PI * 5) * 0.2);
        for (let i = 1; i <= 4; i += 1) {
          const tp = Math.max(0, p - i * 0.07);
          const tx = startX + (targetX - startX) * tp;
          const ty = startY + (targetY - startY) * tp - 85 * Math.sin(tp * Math.PI);
          this.text(i % 2 === 0 ? '❤️' : '💋', tx, ty + 3, 12 - i * 2, '#f43f5e', 'center');
        }
        this.text('💋', 0, 10, 36, COLORS.text, 'center');
      } else {
        this.text(icon, curX, curY + 8, 30, COLORS.text, 'center');
      }
      ctx.restore();
    } else {
      const p = (progress - flyRatio) / (1 - flyRatio);
      const alpha = p > 0.75 ? Math.max(0, 1 - (p - 0.75) / 0.25) : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (type === 'tomato') {
        // 番茄爆浆：把头像完全打满，然后番茄汁慢慢向下流淌！
        const dripY = targetY + p * 16;

        // 1. 命中瞬间震波爆开 (p < 0.25)
        if (p < 0.25) {
          const shockR = 15 + p * 120;
          this.circle(targetX, targetY, shockR, null, `rgba(239, 68, 68, ${1 - p * 3.8})`, 4);
          for (let i = 0; i < 8; i += 1) {
            const ang = i * (Math.PI / 4) + 0.2;
            const dist = 28 + p * 80;
            this.text('✦', targetX + Math.cos(ang) * dist, targetY + Math.sin(ang) * dist + 5, 14, '#fde047', 'center');
          }
        }

        // 2. 超大番茄果肉与浓浆底，完整铺满/打满整个头像 (半径 36~44，远远超出 26px 的头像)
        this.circle(targetX, dripY, 36 + Math.min(8, p * 8), '#991b1b');
        const mainLobes = [
          [-24, -16, 17], [22, -18, 18], [-22, 18, 19], [24, 16, 17],
          [-4, -28, 16], [6, 26, 18], [-30, 2, 15], [30, -2, 16],
          [-14, -26, 14], [16, -24, 15], [-16, 26, 16], [18, 24, 15],
        ];
        mainLobes.forEach(([ox, oy, rad]) => {
          this.circle(targetX + ox, dripY + oy, rad, '#b91c1c');
        });
        // 鲜亮红心肉块与果浆高光
        this.circle(targetX, dripY, 26, '#dc2626');
        this.circle(targetX - 10, dripY - 10, 8, 'rgba(254, 202, 202, 0.85)');
        this.circle(targetX + 8, dripY + 6, 5, 'rgba(255, 255, 255, 0.8)');

        // 黄色番茄小籽粒
        for (let i = 0; i < 5; i += 1) {
          const seedX = targetX + Math.sin(i * 1.3) * 16;
          const seedY = dripY + Math.cos(i * 1.5) * 14;
          this.drawOval(seedX, seedY, 3, 1.8, '#fef08a', '#ca8a04', 0.8);
        }

        // 3. 慢慢往下流下的多条浓稠番茄汁挂流 (Drips running down!)
        const dripStreams = [
          { ox: -16, maxLen: 48, w: 6.5, speed: 1.1 },
          { ox: 10, maxLen: 62, w: 7.5, speed: 1.3 },
          { ox: -28, maxLen: 32, w: 5.0, speed: 0.9 },
          { ox: 26, maxLen: 36, w: 5.5, speed: 0.95 },
          { ox: -3, maxLen: 54, w: 6.0, speed: 1.2 },
        ];
        dripStreams.forEach(({ ox, maxLen, w, speed }) => {
          const curLen = Math.min(maxLen, p * speed * maxLen);
          const startStreamY = dripY + 18;
          const endStreamY = startStreamY + curLen;
          this.roundRect(targetX + ox - w / 2, startStreamY, w, curLen, w / 2, '#991b1b');
          this.roundRect(targetX + ox - w / 2 + 1, startStreamY, w - 2, curLen, (w - 2) / 2, '#dc2626');
          this.circle(targetX + ox, endStreamY, w * 0.75, '#b91c1c');
          this.circle(targetX + ox - 1, endStreamY - 1, w * 0.35, 'rgba(254, 202, 202, 0.85)');

          if (p * speed > 0.6) {
            const dropProgress = (p * speed - 0.6) / 0.4;
            const dropFallY = endStreamY + dropProgress * 28;
            this.circle(targetX + ox, dropFallY, w * 0.55, '#dc2626');
          }
        });

        // 底部汇聚的小番茄酱池
        if (p > 0.3) {
          const puddleW = Math.min(48, (p - 0.3) * 70);
          this.drawOval(targetX - 2, targetY + 68, puddleW, 6, '#991b1b');
          this.drawOval(targetX - 2, targetY + 68, puddleW * 0.8, 4, '#dc2626');
        }

        // 4. 初炸四溅的果肉液滴向外抛物线炸开
        for (let i = 0; i < 14; i += 1) {
          const angle = i * (Math.PI * 2 / 14) + 0.15;
          const speed = 36 + (i % 4) * 14;
          const dist = speed * Math.sin(Math.min(1, p * 1.8) * Math.PI * 0.5);
          const grav = p * p * 42;
          const px = targetX + Math.cos(angle) * dist;
          const py = targetY + Math.sin(angle) * dist + grav;
          const pr = Math.max(1.5, (5 - (i % 3)) * (1 - p * 0.65));
          this.circle(px, py, pr, i % 2 === 0 ? '#ef4444' : '#b91c1c');
        }

        // 扁平番茄皮与压扁的菜蒂
        ctx.save();
        ctx.translate(targetX, dripY);
        ctx.scale(1.5, Math.max(0.4, 0.75 - p * 1.1));
        this.text('🍅', 0, 8, 32, COLORS.text, 'center');
        ctx.restore();
      } else if (type === 'water') {
        const bucketX = targetX - 16;
        const bucketY = targetY - 60;
        const isPouring = p < 0.75;
        const shake = isPouring ? Math.sin(p * 45) * Math.max(0, 1 - p * 1.3) * 3 : 0;
        const bucketTilt = Math.PI * 0.62 + (isPouring ? Math.sin(p * 28) * 0.08 : 0);
        const bucketAlpha = p > 0.65 ? Math.max(0, 1 - (p - 0.65) / 0.35) : 1;

        ctx.save();
        ctx.globalAlpha = alpha * bucketAlpha;
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

          ctx.lineWidth = 2.2;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          for (let i = -2; i <= 2; i += 1) {
            const flowOffset = (age * 0.5 + i * 17) % 35;
            ctx.beginPath();
            ctx.moveTo(topX + i * 5, topY + flowOffset);
            ctx.lineTo(targetX + i * 12, botY - 6);
            ctx.stroke();
          }

          for (let i = 0; i < 6; i += 1) {
            const fx = targetX - 25 + i * 10;
            const fy = targetY - 4 + Math.sin(i * 1.8) * 6;
            this.circle(fx, fy, 9 + (i % 3) * 3, 'rgba(255, 255, 255, 0.9)');
          }

          for (let i = 0; i < 18; i += 1) {
            const side = i % 2 === 0 ? 1 : -1;
            const ang = side * (0.35 + (i % 5) * 0.22);
            const dist = 32 * Math.sin(Math.min(1, p * 1.8) * Math.PI * 0.5);
            const px = targetX + Math.sin(ang) * dist * 1.5;
            const py = targetY + 6 - Math.cos(ang) * dist + p * p * 55;
            this.circle(px, py, Math.max(1.5, 4 * (1 - p * 0.5)), i % 2 === 0 ? '#ffffff' : '#38bdf8');
          }

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
        // 飞到目标头像时最大，然后瞬间炸开，blingbling的璀璨钻石星芒雨！
        // 1. 瞬时炸开金色与粉金双层超大冲击光波 (扩散至 115px)
        const outerAuraR = 22 + p * 95;
        const innerAuraR = 15 + p * 65;
        this.circle(targetX, targetY, outerAuraR, null, `rgba(253, 224, 71, ${0.85 * (1 - p)})`, 3.5);
        this.circle(targetX, targetY, innerAuraR, `rgba(244, 63, 94, ${0.45 * (1 - p)})`, `rgba(244, 114, 182, ${0.9 * (1 - p)})`, 2.5);

        // 2. 爆开瞬间闪烁十字星芒 (Bling Flash)
        if (p < 0.28) {
          const flashP = p / 0.28;
          const flashSize = (1 - flashP) * 52;
          ctx.save();
          ctx.translate(targetX, targetY);
          ctx.rotate(p * 2.5);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * (1 - flashP)})`;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(-flashSize, 0); ctx.lineTo(flashSize, 0);
          ctx.moveTo(0, -flashSize); ctx.lineTo(0, flashSize);
          ctx.stroke();
          ctx.restore();
        }

        // 3. 20 颗璀璨闪烁的 blingbling 钻石星芒、彩钻与耀眼金星向外漫天炸开
        const blingSymbols = [
          '✨', '⭐', '🌟', '💫', '💖', '✨', '💎', '🌟', '✨', '💛',
          '⭐', '✨', '💖', '🌟', '✨', '💫', '⭐', '✨', '🌟', '💎',
        ];
        for (let i = 0; i < blingSymbols.length; i += 1) {
          const ang = i * (Math.PI * 2 / blingSymbols.length) + p * 1.6;
          const dist = (28 + (i % 5) * 16) * Math.sin(Math.min(1, p * 1.5) * Math.PI * 0.5);
          const lift = p * 62;
          const sway = Math.sin(p * 6 + i * 1.2) * 12;
          const bx = targetX + Math.cos(ang) * dist + sway;
          const by = targetY + Math.sin(ang) * dist - lift;

          // Blingbling 关键：极高频闪耀闪烁效果 (Twinkling shine)
          const twinkleAlpha = Math.max(0.18, (0.55 + 0.45 * Math.sin(p * 26 + i * 2.1)) * (1 - p * 0.75));
          const twinkleScale = 0.8 + 0.35 * Math.sin(p * 20 + i * 1.7);
          const bSize = Math.round((18 - (i % 3) * 3) * twinkleScale);

          ctx.save();
          ctx.globalAlpha = twinkleAlpha;
          ctx.translate(bx, by);
          ctx.rotate(p * 3.5 + i);
          this.text(blingSymbols[i], 0, 4, bSize, COLORS.text, 'center');
          ctx.restore();
        }

        // 4. 红心在命中点最大状态下爆碎向外膨胀消散 (前半段超大红心炸裂)
        if (p < 0.42) {
          const burstP = p / 0.42;
          const burstScale = 1.9 + burstP * 0.65;
          const burstAlpha = Math.max(0, 1 - burstP);
          ctx.save();
          ctx.globalAlpha = burstAlpha;
          ctx.translate(targetX, targetY);
          ctx.scale(burstScale, burstScale);
          this.text('❤️', 0, 9, 36, COLORS.text, 'center');
          ctx.restore();
        }
      } else if (type === 'kiss') {
        // 亲吻暴击：巨型红唇盖章 + 头像全脸打满 4 重吻痕 + 满天飞吻红心！
        // 1. 盖章落地红色冲击光环 (扩散至 95px)
        const stampWaveR = 16 + p * 95;
        this.circle(targetX, targetY, stampWaveR, null, `rgba(244, 63, 94, ${0.9 * (1 - p)})`, 3.5);

        // 2. 头像两侧泛起娇羞大红晕
        this.circle(targetX - 25, targetY + 6, 16, `rgba(251, 113, 133, ${0.45 * (1 - p)})`);
        this.circle(targetX + 25, targetY + 6, 16, `rgba(251, 113, 133, ${0.45 * (1 - p)})`);

        // 3. 头像各部位打满 4 处深情烈焰大红唇印 (全脸狂亲印记)
        // 印迹 1：左上脸颊吻痕 (34px, 顺时针旋转)
        ctx.save();
        ctx.translate(targetX - 22, targetY - 18);
        ctx.rotate(0.28);
        this.text('💋', 0, 0, 34, COLORS.text, 'center');
        ctx.restore();

        // 印迹 2：右下脸颊吻痕 (36px, 逆时针旋转)
        ctx.save();
        ctx.translate(targetX + 24, targetY + 16);
        ctx.rotate(-0.32);
        this.text('💋', 0, 0, 36, COLORS.text, 'center');
        ctx.restore();

        // 印迹 3：下巴小巧吻痕 (28px)
        ctx.save();
        ctx.translate(targetX - 8, targetY + 24);
        ctx.rotate(0.12);
        this.text('💋', 0, 0, 28, COLORS.text, 'center');
        ctx.restore();

        // 印迹 4：中央重磅超级大红唇 (54px，落地盖章缩放)
        const mainScale = p < 0.16 ? 1.8 - (p / 0.16) * 0.7 : 1.1 + 0.1 * Math.sin(p * Math.PI * 4);
        ctx.save();
        ctx.translate(targetX, targetY);
        ctx.rotate(-0.15);
        ctx.scale(mainScale, mainScale);
        this.text('💋', 0, 8, 54, COLORS.text, 'center');
        ctx.restore();

        // 4. 满天飞舞的 14 颗红唇爱心与烈焰礼花粒子
        const kissBursts = ['💋', '❤️', '🔥', '😘', '💕', '✨', '😍', '💋', '❤️', '💕', '🔥', '😘', '✨', '❤️'];
        for (let i = 0; i < kissBursts.length; i += 1) {
          const ang = i * (Math.PI * 2 / kissBursts.length) + p * 1.8;
          const spread = (22 + (i % 4) * 15) * Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5);
          const lift = p * 58;
          const sway = Math.sin(p * 5.5 + i) * 12;
          const kx = targetX + Math.cos(ang) * spread + sway;
          const ky = targetY + Math.sin(ang) * spread - lift;
          this.text(kissBursts[i], kx, ky + 4, 16 - (i % 2) * 3, COLORS.text, 'center');
        }
      } else {
        this.text(icon, targetX, targetY + 8, 30, COLORS.text, 'center');
      }

      ctx.restore();
      ctx.globalAlpha = 1;
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
    // Mode toggle button on the left (WeChat style mic / keyboard vector icon)
    this.roundRect(x + 12, inputY, 34, 34, 8, isVoiceMode ? '#8a6230' : 'rgba(16, 44, 58, 0.9)', isVoiceMode ? '#ffd87a' : '#5a8698', 1.2);
    if (isVoiceMode) {
      this.drawKeyboardIcon(x + 29, inputY + 17, 18, '#fff3d1');
    } else {
      this.drawMicIcon(x + 29, inputY + 17, 18, '#f3e1b0');
    }
    this.targets.push({ x: x + 12, y: inputY, w: 34, h: 34, width: 34, height: 34, type: 'toggle-chat-mode', data: {} });

    if (isVoiceMode) {
      // Wide "Hold to speak" button (WeChat style)
      const voiceBarW = modalW - 60;
      const isRecording = Boolean(state.recordingVoice);
      this.roundRect(
        x + 52, inputY, voiceBarW, 34, 8,
        isRecording ? '#ba751f' : 'rgba(20, 54, 72, 0.94)',
        isRecording ? '#ffe08a' : '#4d788c',
        isRecording ? 2 : 1.2,
      );
      // WeChat style mic mini icon on the voice bar
      this.drawMicIcon(x + 52 + voiceBarW / 2 - 46, inputY + 17, 16, isRecording ? '#ffffff' : '#b2d5e3');
      const voiceBtnLabel = isRecording ? '松手 发送 · 正在录音…' : '按住 说话';
      this.text(voiceBtnLabel, x + 52 + voiceBarW / 2 + 10, inputY + 17, 13, isRecording ? '#ffffff' : '#e2ecf0', 'center', '600');
      this.targets.push({ x: x + 52, y: inputY, w: voiceBarW, h: 34, width: voiceBarW, height: 34, type: 'voice-bar', data: {} });

      if (isRecording) {
        // Floating WeChat-style voice recording HUD for 414
        const hudW = 140;
        const hudH = 140;
        const hudX = x + modalW / 2 - hudW / 2;
        const hudY = y + 80;
        this.roundRect(hudX, hudY, hudW, hudH, 16, 'rgba(0, 0, 0, 0.82)', 'rgba(255, 255, 255, 0.2)', 1.5);
        this.drawMicIcon(hudX + 50, hudY + 54, 38, '#ffffff');
        const t = Date.now() * 0.008;
        const bars = [0.45, 0.75, 0.95, 0.60];
        bars.forEach((base, idx) => {
          const barH = 10 + Math.sin(t + idx * 1.2) * 10 * base + 10 * base;
          const bx = hudX + 85 + idx * 7;
          const by = hudY + 54 - barH / 2;
          this.roundRect(bx, by, 3.5, barH, 1.7, '#6ee7b7');
        });
        this.text('正在录音…', hudX + hudW / 2, hudY + 104, 12, '#ffffff', 'center', '600');
        this.text('松开 发送', hudX + hudW / 2, hudY + 121, 10, '#cbd5e1', 'center');
      }
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
