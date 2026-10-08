const { relativeSeats, playerForSeat, tileLabel, actionLabel, chatText } = require('./model');

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
    this.tileAtlas = null;
    this.initBackground();
    this.initTileAtlas();
    this.initParticles();
  }

  initTileAtlas() {
    try {
      const img = typeof wx !== 'undefined' && typeof wx.createImage === 'function'
        ? wx.createImage() : typeof Image !== 'undefined' ? new Image() : null;
      if (!img) return;
      img.onload = () => { this.tileAtlas = img; if (this.onAssetLoaded) this.onAssetLoaded(); };
      img.src = 'assets/mahjong-tiles.png';
    } catch { /* Tile faces also have a resolution-independent Canvas fallback. */ }
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
            img.src = url;
            this.avatarCache.set(url, img);
          }
        } catch { /* ignore */ }
      }
      if (img && img.width) {
        ctx.save();
        if (square) this.roundRect(x, y, size, size, 6, null);
        else { ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); }
        ctx.clip();
        try {
          ctx.drawImage(img, x, y, size, size);
        } catch { /* ignore */ }
        ctx.restore();
        return;
      }
    }
    this.roundRect(x, y, size, size, square ? 6 : r,
      this.linearFill(x, y, x + size, y + size, [[0, '#305953'], [1, '#112c29']], '#1b3c34'));
    ctx.beginPath();
    ctx.arc(x + r, y + size * 0.36, size * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = '#c2c9a9';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.21, y + size * 0.83);
    ctx.quadraticCurveTo(x + size * 0.22, y + size * 0.57, x + r, y + size * 0.57);
    ctx.quadraticCurveTo(x + size * 0.78, y + size * 0.57, x + size * 0.79, y + size * 0.83);
    ctx.closePath();
    ctx.fillStyle = '#96a58a';
    ctx.fill();
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

  linearFill(x1, y1, x2, y2, stops, fallback) {
    try {
      if (typeof this.ctx.createLinearGradient !== 'function') return fallback;
      const gradient = this.ctx.createLinearGradient(x1, y1, x2, y2);
      if (!gradient || typeof gradient.addColorStop !== 'function') return fallback;
      stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
      return gradient;
    } catch { return fallback; }
  }

  polygon(points, fill, stroke, lineWidth = 1) {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
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

  roomLayout() {
    const width = this.viewport.width || 960;
    const scale = this.viewport.scale || 1;
    const leftInset = Math.max(16, (this.safeInsets?.left || 0) / scale + 10);
    const rightInset = Math.max(16, (this.safeInsets?.right || 0) / scale + 10);
    const bottomInset = Math.min(48, (this.safeInsets?.bottom || 0) / scale);
    const contentBottom = 540 - bottomInset;
    return {
      width, height: 540, leftInset, rightInset, bottomInset, contentBottom,
      table: { width, topY: -48, bottomY: 606, topLeft: width * 0.235, topRight: width * 0.765,
        bottomLeft: width * 0.075, bottomRight: width * 0.925 },
      cards: [
        { x: leftInset, y: contentBottom - 211, width: 94, height: 114 },
        { x: leftInset, y: 144, width: 94, height: 114 },
        { x: width * (width < 880 ? 0.65 : 0.69) - 47, y: 58, width: 94, height: 114 },
        { x: width - rightInset - 94, y: 136, width: 94, height: 114 },
      ],
      chat: { x: width - rightInset - 404, y: 178, width: 300, height: 240 - bottomInset },
      chatIcon: { x: width - rightInset - 32, y: 315, radius: 26 },
      center: { x: width / 2, y: 231 - bottomInset * 0.8 },
    };
  }

  project(table, u, v) {
    const left = table.topLeft + (table.bottomLeft - table.topLeft) * v;
    const right = table.topRight + (table.bottomRight - table.topRight) * v;
    return [left + (right - left) * u, table.topY + (table.bottomY - table.topY) * v];
  }

  planeRect(table, u, v, width, height) {
    return [[u, v], [u + width, v], [u + width, v + height], [u, v + height]]
      .map(([pu, pv]) => this.project(table, pu, pv));
  }

  drawMahjongTable(table) {
    const ctx = this.ctx;
    const width = table.width;
    ctx.fillStyle = this.linearFill(0, 0, width, 540,
      [[0, '#71402b'], [0.32, '#bb7850'], [0.67, '#8b4c31'], [1, '#4b2c21']], '#8b5036');
    ctx.fillRect(0, 0, width, 540);
    // The side platforms and rails share the same vanishing direction as the square felt.
    for (let index = -16; index < 38; index += 1) {
      const y = index * 27;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width / 2, y + 235);
      ctx.lineTo(width, y);
      ctx.strokeStyle = 'rgba(40, 17, 10, 0.42)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y + 3); ctx.lineTo(width / 2, y + 238); ctx.lineTo(width, y + 3);
      ctx.strokeStyle = 'rgba(249, 191, 122, 0.24)'; ctx.lineWidth = 1; ctx.stroke();
    }
    for (let index = 0; index < 95; index += 1) {
      const y = (index * 47) % 540;
      const length = 22 + index % 41;
      ctx.beginPath();
      ctx.moveTo(6 + index % 67, y);
      ctx.quadraticCurveTo(28 + length, y + 4, 48 + length, y + 19);
      ctx.moveTo(width - 6 - index % 67, y);
      ctx.quadraticCurveTo(width - 28 - length, y + 4, width - 48 - length, y + 19);
      ctx.strokeStyle = 'rgba(64, 27, 17, 0.16)'; ctx.lineWidth = 0.7; ctx.stroke();
    }
    const rail = this.linearFill(0, 0, width, 540,
      [[0, '#5e2e1c'], [0.16, '#be7a49'], [0.36, '#71371e'], [0.63, '#cb9255'], [0.8, '#824320'], [1, '#422316']], '#91512d');
    ctx.save();
    ctx.shadowColor = 'rgba(0, 10, 5, 0.65)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    this.polygon(this.planeRect(table, -0.052, -0.04, 1.104, 1.08), '#341c13', '#482517', 3);
    ctx.restore();
    this.polygon(this.planeRect(table, -0.045, -0.035, 1.09, 1.07), rail, '#d69c60', 2.5);
    this.polygon(this.planeRect(table, -0.027, -0.02, 1.054, 1.04), '#693a22', '#e6b477', 1);
    this.polygon(this.planeRect(table, -0.014, -0.01, 1.028, 1.02), '#263f2b', '#40291b', 2);
    const felt = this.planeRect(table, 0, 0, 1, 1);
    this.polygon(felt, this.linearFill(0, 0, 0, 540,
      [[0, '#1b4935'], [0.3, '#4e915f'], [0.63, '#68ad78'], [1, '#246040']], '#4b8a5a'), '#8cab67', 1.2);
    ctx.save();
    this.polygon(felt, null); ctx.clip();
    if (typeof ctx.createRadialGradient === 'function') {
      const glow = ctx.createRadialGradient(width * 0.5, 245, 5, width * 0.5, 245, width * 0.44);
      if (glow && typeof glow.addColorStop === 'function') {
        glow.addColorStop(0, 'rgba(160, 220, 135, 0.36)'); glow.addColorStop(1, 'rgba(0, 28, 19, 0.35)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, width, 540);
      }
    }
    for (let index = 0; index < 650; index += 1) {
      const x = (index * 137.43) % width;
      const y = (index * 73.67) % 540;
      ctx.fillStyle = index % 2 ? 'rgba(225, 240, 170, 0.055)' : 'rgba(5, 39, 22, 0.07)';
      ctx.fillRect(x, y, 1.4, 0.7);
    }
    // Inlaid corner details are projected on the felt rather than drawn as a flat UI frame.
    for (const [u, v, su, sv] of [[0.055, 0.12, 1, 1], [0.945, 0.12, -1, 1],
      [0.055, 0.81, 1, -1], [0.945, 0.81, -1, -1]]) {
      for (let line = 0; line < 2; line += 1) {
        const offset = line * 0.014;
        const points = [[u, v + sv * 0.07], [u, v], [u + su * 0.13, v],
          [u + su * 0.13, v + sv * 0.035], [u + su * 0.085, v + sv * 0.035]];
        ctx.beginPath();
        points.forEach(([pu, pv], index) => {
          const [px, py] = this.project(table, pu + su * offset, pv + sv * offset);
          if (index) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        });
        ctx.strokeStyle = line ? 'rgba(168, 202, 130, 0.22)' : 'rgba(9, 51, 31, 0.34)';
        ctx.lineWidth = 1.4; ctx.stroke();
      }
    }
    this.text('308 娱乐 · 私房雀局', width / 2, 419, 19, 'rgba(15, 60, 35, 0.4)', 'center', '700');
    ctx.restore();
  }

  drawTableMedallion(state, lobby = false) {
    const ctx = this.ctx;
    const { center: { x, y } } = this.roomLayout();
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, 0.87);
    this.circle(0, 0, 76, null, 'rgba(10, 57, 32, 0.3)', 2);
    this.circle(0, 0, 72, null, 'rgba(181, 212, 142, 0.25)', 2);
    for (let index = 0; index < 32; index += 1) {
      const angle = index * Math.PI / 16;
      ctx.save(); ctx.rotate(angle);
      ctx.strokeStyle = 'rgba(21, 70, 38, 0.32)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -64); ctx.lineTo(0, -71); ctx.lineTo(7, -71); ctx.lineTo(7, -64); ctx.stroke();
      ctx.restore();
    }
    ctx.shadowColor = 'rgba(0, 25, 12, 0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    this.circle(0, 0, 57, '#292d27', '#b48b4c', 4);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const order = relativeSeats(state.snapshot.private.seat || 'A');
    const angles = [Math.PI / 2, Math.PI, -Math.PI / 2, 0];
    const directions = { A: '东', B: '南', C: '西', D: '北' };
    order.forEach((seat, index) => {
      const angle = angles[index];
      const active = !lobby && state.snapshot.public.currentTurn === seat;
      ctx.beginPath(); ctx.arc(0, 0, 51, angle - Math.PI / 4 + 0.03, angle + Math.PI / 4 - 0.03);
      ctx.arc(0, 0, 28, angle + Math.PI / 4 - 0.03, angle - Math.PI / 4 + 0.03, true); ctx.closePath();
      ctx.fillStyle = active ? '#477f3d' : this.linearFill(-50, -50, 50, 50, [[0, '#4c5145'], [1, '#242b25']], '#303930');
      ctx.fill(); ctx.strokeStyle = '#151e19'; ctx.lineWidth = 1; ctx.stroke();
      this.text(directions[seat], Math.cos(angle) * 41, Math.sin(angle) * 41, 16, active ? '#f9e29c' : '#d1d3b7', 'center', '700');
    });
    this.roundRect(-27, -21, 54, 42, 9, '#111f19', '#64694d');
    this.text(lobby ? '等候' : String(state.snapshot.public.wallCount ?? 0), 0, 0, lobby ? 18 : 25,
      lobby ? '#e6cb85' : '#93ecc1', 'center', '700');
    ctx.restore();
    this.roundRect(x - 45, y + 57, 90, 23, 4, 'rgba(16, 47, 30, 0.54)');
    this.text(lobby ? `${state.snapshot.public.players.length} / 4 人入座` : '剩余牌张', x, y + 69, 12, '#e5e7c5', 'center');
  }

  text(value, x, y, size = 18, color = COLORS.text, align = 'left', weight = '400') {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value ?? ''), x, y);
  }

  fitText(value, maxWidth, size = 14, weight = '400') {
    const characters = Array.from(String(value ?? ''));
    const ctx = this.ctx;
    if (typeof ctx.measureText !== 'function') {
      const limit = Math.max(1, Math.floor(maxWidth / size));
      return characters.length > limit ? `${characters.slice(0, Math.max(1, limit - 1)).join('')}…` : characters.join('');
    }
    const previousFont = ctx.font;
    ctx.font = `${weight} ${size}px sans-serif`;
    const measure = (text) => {
      const metrics = ctx.measureText(text);
      return metrics && Number.isFinite(metrics.width) ? metrics.width : Array.from(text).length * size;
    };
    let result = characters.join('');
    if (measure(result) > maxWidth) {
      while (characters.length && measure(`${characters.join('')}…`) > maxWidth) characters.pop();
      result = characters.length ? `${characters.join('')}…` : '…';
    }
    ctx.font = previousFont;
    return result;
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
    const logicalWidth = isPortrait ? 540 : Math.max(720, width / height * 540);
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
        this.roundRect(logicalWidth / 2 - 220, 68, 440, 34, 8, '#682f3a', '#c96a73');
        this.text(this.fitText(state.error, 420, 13), logicalWidth / 2, 85, 13, '#ffe8e8', 'center');
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

    const authAvailable = state.canRequestUserInfo && !state.profileAuthorized;
    this.text(authAvailable ? '输入邀请码，点击进入房间并确认昵称头像授权' : '输入邀请码即可进入房间', 270, 354, 13, '#7d9fa8', 'center');

    // Invite code section
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
    const offset = this.roomLayout().leftInset - 16;
    this.circle(offset + 32, 31, 21, 'rgba(55, 30, 21, 0.72)', 'rgba(247, 210, 145, 0.56)', 1.5);
    this.ctx.beginPath(); this.ctx.moveTo(offset + 36, 22); this.ctx.lineTo(offset + 27, 31); this.ctx.lineTo(offset + 36, 40);
    this.ctx.strokeStyle = '#f9dfa4'; this.ctx.lineWidth = 2.5; this.ctx.stroke();
    this.targets.push({ x: offset + 8, y: 7, width: 48, height: 48, type: 'leave', data: {} });
    this.text('414 麻将', offset + 65, 24, 18, '#ffe5a4', 'left', '700');
    this.text(`${phaseLabel} · 第 ${state.snapshot.public.handNumber || 0} 局`, offset + 66, 44, 10, '#e0d6b7');
    this.circle(offset + 174, 23, 3, state.connectionStatus === 'connected' ? '#8eddaa' : '#edbe59');
  }

  drawChatIcon(state) {
    const { chatIcon: { x, y, radius } } = this.roomLayout();
    this.circle(x, y + 3, radius, 'rgba(37, 22, 15, 0.35)');
    this.circle(x, y, radius,
      state.chatOpen ? '#b7894b' : 'rgba(113, 74, 46, 0.72)', 'rgba(255, 228, 168, 0.65)', 1.5);
    this.roundRect(x - 14, y - 11, 28, 20, 9, '#ffe8ad');
    this.polygon([[x - 8, y + 6], [x - 10, y + 15], [x + 1, y + 8]], '#ffe8ad');
    for (const dx of [-7, 0, 7]) this.circle(x + dx, y - 1, 1.7, '#8b6336');
    const messages = state.snapshot.public.chat || [];
    const lastReadIndex = messages.findIndex((message) => message.id === state.chatReadId);
    const unread = messages.length - lastReadIndex - 1;
    if (unread && !state.chatOpen) {
      this.circle(x + 19, y - 19, 9, '#b94f37', '#ffe0a0');
      this.text(unread > 9 ? '9+' : unread, x + 19, y - 18, 9, '#fff5da', 'center', '700');
    }
    this.targets.push({ x: x - radius - 4, y: y - radius - 4, width: (radius + 4) * 2,
      height: (radius + 4) * 2, type: 'toggle-chat', data: {} });
  }

  drawPlayerCard(state, seat, x, y, width, height) {
    const player = playerForSeat(state.snapshot, seat);
    const isOwn = seat === state.snapshot.private.seat && !state.snapshot.private.spectator;
    const selected = state.selectedTarget && state.selectedTarget.seat === seat;
    const active = state.snapshot.public.phase === 'playing' && state.snapshot.public.currentTurn === seat;
    const avatarSize = 64;
    const avatarX = x + (width - avatarSize) / 2;
    if (player) {
      const ctx = this.ctx;
      ctx.save(); ctx.shadowColor = active || selected ? '#f4c75e' : 'rgba(20, 14, 6, 0.65)';
      ctx.shadowBlur = active || selected ? 12 : 5; ctx.shadowOffsetY = 3;
      this.roundRect(avatarX - 3, y - 3, avatarSize + 6, avatarSize + 6, 9,
        this.linearFill(avatarX, y, avatarX + 64, y + 64,
          [[0, '#fff0b3'], [0.28, '#d5a04b'], [0.65, '#8b5b2c'], [1, '#edc879']], '#c29452'), '#f8dfa0');
      ctx.restore();
      this.drawAvatar(player.avatarUrl, avatarX, y, avatarSize, true);
      this.roundRect(x, y + 72, width, 19, 3, 'rgba(24, 34, 23, 0.68)');
      this.text(this.fitText(player.nickname, width - 8, 12, '600'), x + width / 2, y + 82, 12, '#fff2d4', 'center', '600');
      this.roundRect(x, y + 93, width, 20, 3, 'rgba(24, 34, 23, 0.78)');
      this.text(`${player.score} 分`, x + width / 2, y + 104, 14, '#ffdf79', 'center', '700');
      if (!isOwn) this.targets.push({ x, y, width, height, type: 'select-player', data: { seat, nickname: player.nickname } });
      if (state.snapshot.public.dealer === seat || state.snapshot.public.dealerSeat === seat) {
        this.roundRect(avatarX + 44, y + 46, 25, 24, 4, '#c38c2e', '#f3d78e');
        this.text('庄', avatarX + 56, y + 58, 17, '#fff2bc', 'center', '700');
      }
      if (state.snapshot.public.winAnnouncement?.winnerSeat === seat) this.text('胡', avatarX + 61, y - 8, 26, '#ffe08c', 'center', '700');
    } else {
      this.roundRect(avatarX, y, avatarSize, avatarSize, 9, 'rgba(15, 42, 30, 0.35)', 'rgba(238, 214, 158, 0.4)');
      this.text('+', x + width / 2, y + 29, 29, 'rgba(245, 229, 183, 0.58)', 'center');
      this.text('等待入座', x + width / 2, y + 81, 12, '#e2d8b8', 'center');
    }

    const latestInteraction = [...(state.snapshot.public.chat || [])].reverse().find((message) =>
      message.kind === 'interaction' && message.targetSeat === seat && Date.now() - message.createdAt < 1700);
    if (latestInteraction) {
      const age = Date.now() - latestInteraction.createdAt;
      const lift = Math.round((age / 1700) * 20);
      this.circle(x + width - 10, y + 20 - lift, 20, 'rgba(38, 62, 35, 0.82)', COLORS.gold);
      this.text(({ tomato: '🍅', water: '💦', heart: '💖', kiss: '💋' })[latestInteraction.interaction] || '✨', x + width - 10, y + 20 - lift, 25, COLORS.text, 'center');
    }
  }

  drawLobby(state) {
    const snapshot = state.snapshot;
    const { table, center, cards, width } = this.roomLayout();
    this.drawMahjongTable(table);
    this.drawTableMedallion(state, true);
    this.text('好友入座，好局将启', center.x, 335, 23, '#f2e5b2', 'center', '700');
    this.text('分享房间邀请码，邀请好友一起玩', center.x, 365, 12, '#c4d1ad', 'center');
    relativeSeats(snapshot.private.seat || 'A').forEach((seat, index) => {
      const card = cards[index];
      this.drawPlayerCard(state, seat, card.x, card.y, card.width, card.height);
    });
    const isHost = snapshot.public.hostSeat === snapshot.private.seat && !snapshot.private.spectator;
    this.button(snapshot.private.spectator ? '观战中' : isHost ? '开始牌局' : '等待房主开始', width / 2 - 90, 389, 180, 44, 'start', {}, 'primary', !isHost || snapshot.public.players.length < 4);
    this.drawHeader(state, '等待开局');
    this.drawChatIcon(state);
    if (state.selectedTarget) this.drawInteractionPicker(state);
    this.drawChat(state);
  }

  drawTile(tile, x, y, width, height, selected = false, rotation = 0) {
    const ctx = this.ctx;
    const radius = Math.min(5, width * 0.12);
    ctx.save(); ctx.shadowColor = 'rgba(5, 24, 12, 0.5)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 3;
    this.roundRect(x, y + 4, width, height, radius, '#2a6f33', '#19492a');
    ctx.restore();
    this.roundRect(x, y, width, height, radius,
      this.linearFill(x, y, x + width, y + height, [[0, '#ffffff'], [0.24, '#fdfdf7'], [0.86, '#eeeede'], [1, '#cfd7c8']], '#fafbf2'),
      selected ? '#ffe083' : '#9cae97');
    this.roundRect(x + 1.5, y + 2, width - 3, height - 4, Math.max(1, radius - 1), null, '#ffffff');
    if (selected) this.roundRect(x - 1, y - 1, width + 2, height + 2, radius, null, '#ffd965');
    ctx.save(); ctx.translate(x + width / 2, y + height / 2); ctx.rotate(rotation);
    const sideways = Math.abs(Math.sin(rotation)) > 0.5;
    this.drawTileArt(tile, sideways ? height : width, sideways ? width : height);
    ctx.restore();
  }

  drawTileArt(tile, width, height) {
    const ctx = this.ctx;
    const rank = Number(tile.rank);
    const glyph = (value, y, size, color) => {
      ctx.fillStyle = color; ctx.font = `700 ${size}px "Kaiti SC", STKaiti, KaiTi, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, 0, y);
    };
    if (tile.suit === 'characters' && rank >= 1 && rank <= 9) {
      glyph(['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][rank], -height * 0.19, width * 0.67, '#18251c');
      glyph('萬', height * 0.22, width * 0.67, '#a62222');
      return;
    }
    if (tile.suit === 'dragons') {
      glyph(({ red: '中', green: '發', east: '東', south: '南', west: '西', north: '北', white: '□' })[tile.rank] || tileLabel(tile), 0,
        width * 0.8, tile.rank === 'red' ? '#af2822' : '#1f6d35');
      return;
    }
    if (tile.suit === 'bamboo' && rank === 1) {
      if (this.tileAtlas) {
        const cellWidth = this.tileAtlas.width / 9;
        const cellHeight = this.tileAtlas.height / 4;
        ctx.drawImage(this.tileAtlas, 2, cellHeight + 2, cellWidth - 4, cellHeight - 4,
          -width * 0.4, -height * 0.36, width * 0.8, height * 0.72);
      } else {
        glyph('幺', -height * 0.18, width * 0.6, '#277739');
        glyph('雞', height * 0.22, width * 0.6, '#277739');
      }
      return;
    }
    if (tile.suit === 'dots' || tile.suit === 'bamboo') {
      const patterns = {
        1: [[0, 0]], 2: [[0, -1], [0, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
        4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
        6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
        7: [[-1, -1.2], [0, -1.2], [1, -1.2], [-1, 0], [1, 0], [-1, 1.2], [1, 1.2]],
        8: [[-1, -1.3], [1, -1.3], [-1, -0.43], [1, -0.43], [-1, 0.43], [1, 0.43], [-1, 1.3], [1, 1.3]],
        9: [[-1, -1.2], [0, -1.2], [1, -1.2], [-1, 0], [0, 0], [1, 0], [-1, 1.2], [0, 1.2], [1, 1.2]],
      };
      const points = patterns[rank] || patterns[1];
      points.forEach(([px, py], index) => {
        const x = px * width * 0.25;
        const y = py * height * 0.23;
        const color = rank === 1 || rank === 5 && index === 2 || rank === 7 && index < 3 ? '#a53128'
          : tile.suit === 'bamboo' ? '#277739' : index % 3 ? '#226b3c' : '#213a60';
        if (tile.suit === 'bamboo') {
          const stickWidth = width * (rank >= 7 ? 0.105 : 0.14);
          const stickHeight = height * (rank >= 7 ? 0.16 : 0.23);
          this.roundRect(x - stickWidth / 2, y - stickHeight / 2, stickWidth, stickHeight, stickWidth / 2, color);
          this.roundRect(x - stickWidth * 0.15, y - stickHeight * 0.38, stickWidth * 0.25, stickHeight * 0.76, 1, '#dfead1');
        } else {
          const radius = width * (rank === 1 ? 0.28 : rank >= 7 ? 0.105 : 0.135);
          this.circle(x, y, radius, color);
          this.circle(x, y, radius * 0.68, '#f5f5e9');
          this.circle(x, y, radius * 0.45, color);
          this.circle(x, y, radius * 0.18, '#f5f5e9');
        }
      });
      return;
    }
    glyph(tileLabel(tile), 0, width * 0.5, '#20372b');
  }

  drawProjectedTile(table, tile, u, v, du, dv, rotation = 0, selected = false) {
    const [topLeft, topRight, , bottomLeft] = this.planeRect(table, u, v, du, dv);
    const ctx = this.ctx;
    const sideways = Math.abs(Math.sin(rotation)) > 0.5;
    const width = sideways ? 40 : 28;
    const height = sideways ? 28 : 40;
    ctx.save();
    ctx.transform((topRight[0] - topLeft[0]) / width, (topRight[1] - topLeft[1]) / width,
      (bottomLeft[0] - topLeft[0]) / height, (bottomLeft[1] - topLeft[1]) / height, topLeft[0], topLeft[1]);
    this.drawTile(tile, 0, 0, width, height, selected, rotation);
    ctx.restore();
  }

  drawStandingBack(table, u, v, du, dv, depth) {
    const points = this.planeRect(table, u, v, du, dv);
    const top = points.map(([x, y]) => [x, y - depth]);
    this.polygon(points.map(([x, y]) => [x + 2, y + 3]), 'rgba(6, 28, 13, 0.3)');
    this.polygon([top[3], top[2], points[2], points[3]],
      this.linearFill(0, top[3][1], 0, points[3][1], [[0, '#54ab29'], [1, '#1d6f25']], '#328f29'), '#185b25');
    this.polygon([top[1], top[2], points[2], points[1]], '#1e6728', '#195627');
    this.polygon(top, this.linearFill(0, top[0][1], 0, top[2][1], [[0, '#f9fff0'], [0.45, '#d7f0ce'], [1, '#87c96c']], '#d3edc4'), '#4d9b40');
  }

  drawGame(state) {
    const snapshot = state.snapshot;
    const phase = snapshot.public.phase === 'settled' ? '本局结算' : '对局中';
    const { table, width, cards } = this.roomLayout();
    this.drawMahjongTable(table);
    this.drawOpponentHands(state, table);
    this.drawDiscards(state, table);
    this.drawMelds(state, table);
    this.drawTableMedallion(state);
    if (snapshot.public.phase === 'settled' && snapshot.public.settlement) {
      const result = snapshot.public.settlement.type === 'draw'
        ? '流局 · 本局不计分'
        : `${snapshot.public.settlement.winnerNickname || snapshot.public.settlement.winnerSeat} 胡牌 · ${snapshot.public.settlement.winPattern || '平和'}`;
      this.roundRect(width / 2 - 160, 320, 320, 46, 6, 'rgba(39, 60, 31, 0.9)', '#b7a15c');
      this.text(this.fitText(result, 300, 16, '700'), width / 2, 343, 16, '#f9df98', 'center', '700');
    }
    const order = relativeSeats(snapshot.private.seat || 'A');
    order.forEach((seat, index) => {
      const card = cards[index];
      this.drawPlayerCard(state, seat, card.x, card.y, card.width, card.height);
    });
    const ownSeat = snapshot.private.seat;
    if (!snapshot.private.spectator && ownSeat) this.drawHand(state);
    else this.text('观战中 · 点击玩家头像可发送互动', width / 2, 492, 14, '#e2ddb9', 'center');
    this.drawActions(state);
    this.drawHeader(state, phase);
    this.drawChatIcon(state);
    if (state.selectedTarget) this.drawInteractionPicker(state);
    this.drawChat(state);
  }

  drawOpponentHands(state, table) {
    const snapshot = state.snapshot;
    relativeSeats(snapshot.private.seat || 'A').forEach((seat, position) => {
      if (position === 0 && !snapshot.private.spectator) return;
      const player = playerForSeat(snapshot, seat);
      const count = Math.max(0, Math.min(14, Number(player?.handCount) || 0));
      const lastV = (this.roomLayout().contentBottom - 116 - table.topY) / (table.bottomY - table.topY);
      const sideStep = Math.min(0.037, (lastV - 0.255) / Math.max(1, count - 1));
      for (let index = 0; index < count; index += 1) {
        if (position === 2) this.drawStandingBack(table, 0.5 - count * 0.019 + index * 0.038, 0.133, 0.037, 0.024, 24);
        else if (position === 1) this.drawStandingBack(table, 0.09, 0.22 + index * sideStep, 0.03, 0.035, 10);
        else if (position === 3) this.drawStandingBack(table, 0.88, 0.22 + index * sideStep, 0.03, 0.035, 10);
        else this.drawStandingBack(table, 0.5 - count * 0.019 + index * 0.038, 0.8, 0.037, 0.024, 24);
      }
    });
  }

  drawDiscards(state, table) {
    const snapshot = state.snapshot;
    const river = snapshot.public.discardRiver || [];
    const bottomOffset = this.roomLayout().bottomInset / (table.bottomY - table.topY);
    relativeSeats(snapshot.private.seat || 'A').forEach((seat, position) => {
      river.filter((entry) => entry.seat === seat).slice(-18).forEach((entry, index) => {
        const column = index % 6;
        const row = Math.floor(index / 6);
        const selected = entry.tile.id === snapshot.public.pendingDiscard?.tile.id;
        if (position === 0) this.drawProjectedTile(table, entry.tile, 0.345 + column * 0.052, 0.55 + row * 0.043 - bottomOffset, 0.048, 0.039, 0, selected);
        else if (position === 2) this.drawProjectedTile(table, entry.tile, (table.width < 880 ? 0.56 : 0.607) - column * 0.052, 0.282 - row * 0.047, 0.048, 0.043, Math.PI, selected);
        else if (position === 1) this.drawProjectedTile(table, entry.tile, 0.2 + row * 0.048, 0.32 + column * 0.042, 0.044, 0.037, Math.PI / 2, selected);
        else this.drawProjectedTile(table, entry.tile, 0.756 - row * 0.048, 0.53 - column * 0.042, 0.044, 0.037, -Math.PI / 2, selected);
      });
    });
  }

  drawMelds(state, table) {
    const snapshot = state.snapshot;
    relativeSeats(snapshot.private.seat || 'A').forEach((seat, position) => {
      const melds = playerForSeat(snapshot, seat)?.melds || [];
      let offset = 0;
      melds.forEach((meld) => {
        const tiles = meld.tiles.length ? meld.tiles : [null, null, null, null];
        tiles.forEach((tile) => {
          const index = offset++;
          const u = position === 0 || position === 2 ? 0.24 + index * 0.031 : position === 1 ? 0.14 : 0.82;
          const v = position === 0 ? (this.roomLayout().contentBottom - 140 - table.topY) / (table.bottomY - table.topY) : position === 2 ? 0.18 : 0.24 + index * 0.034;
          if (tile) this.drawProjectedTile(table, tile, u, v, position % 2 ? 0.035 : 0.029, position === 0 ? 0.025 : 0.031, [0, Math.PI / 2, Math.PI, -Math.PI / 2][position]);
          else this.drawStandingBack(table, u, v, 0.029, 0.031, 3);
        });
        offset += 0.35;
      });
    });
  }

  drawHand(state) {
    const originalHand = state.snapshot.private.hand || [];
    const drawnTile = originalHand.find((tile) => tile.id === state.snapshot.private.drawnTileId);
    const hand = drawnTile ? [...originalHand.filter((tile) => tile.id !== drawnTile.id), drawnTile] : originalHand;
    if (hand.length === 0) return;
    const { width: roomWidth, leftInset, rightInset, contentBottom } = this.roomLayout();
    const x = Math.max(leftInset + 102, roomWidth * 0.13);
    const width = roomWidth - x - rightInset - 66;
    const drawnGap = drawnTile && hand.length > 1 ? 10 : 0;
    const tileWidth = Math.min(64, (width - drawnGap) / hand.length);
    const tileHeight = Math.min(104, tileWidth * 1.58);
    const y = contentBottom - 6 - tileHeight;
    const totalWidth = hand.length * tileWidth + drawnGap;
    if (state.snapshot.private.isListening) this.text('已听牌', x + width, y - 16, 12, '#fbe5a3', 'right', '700');
    hand.forEach((tile, index) => {
      const selected = state.selectedTileId === tile.id;
      const tx = x + (width - totalWidth) / 2 + index * tileWidth + (tile === drawnTile ? drawnGap : 0);
      const ty = y + (selected ? -12 : 0);
      this.drawTile(tile, tx, ty, tileWidth - 0.5, tileHeight, selected);
      this.targets.push({ x: tx, y: ty, width: tileWidth, height: tileHeight + 4, type: 'select-tile', data: { tileId: tile.id } });
    });
  }

  drawActions(state) {
    const snapshot = state.snapshot;
    const actions = snapshot.private.availableActions || [];
    const waitingListen = (snapshot.private.postDiscardListenWaits || []).length > 0;
    const visibleActions = waitingListen ? ['listen', 'pass'] : actions.filter((action) => action !== 'discard');
    if (!waitingListen && actions.includes('discard') && state.selectedTileId) visibleActions.unshift('discard');
    if (snapshot.public.phase === 'settled' && snapshot.public.hostSeat === snapshot.private.seat) visibleActions.push('start-hand');
    const labels = { 'start-hand': '下一局', discard: '出', listen: '听', 'exposed-kong': '杠', 'added-kong': '杠', 'concealed-kong': '杠', pass: '过' };
    const { width: roomWidth, rightInset, contentBottom } = this.roomLayout();
    const x0 = roomWidth - rightInset - 108 - Math.max(0, visibleActions.length - 1) * 62;
    visibleActions.forEach((action, index) => {
      const label = labels[action] || actionLabel(action);
      const data = action === 'chi' ? { action, chiOptions: snapshot.private.chiOptions || [] } : { action };
      const x = x0 + index * 62;
      const y = contentBottom - 160;
      this.circle(x, y + 3, 27, 'rgba(20, 39, 15, 0.3)');
      this.circle(x, y, 27,
        this.linearFill(x - 18, y - 22, x + 19, y + 26,
          action === 'pass' ? [[0, '#6a785d'], [1, '#354a37']] : [[0, '#fff1a0'], [0.3, '#e5b742'], [1, '#ae701b']], '#dca936'),
        action === 'pass' ? '#9da98b' : '#ffe9a1', 2);
      this.circle(x, y, 23, null, 'rgba(255, 247, 203, 0.45)');
      this.text(label, x, y, label.length > 1 ? 14 : 27, action === 'pass' ? '#e4e6d6' : '#fff6ce', 'center', '700');
      this.targets.push({ x: x - 28, y: y - 28, width: 56, height: 56, type: action === 'start-hand' ? 'command' : 'action', data });
    });
  }

  wrapText(value, maxWidth, size, maxLines = 2) {
    const characters = Array.from(String(value || ''));
    const lines = [];
    let line = '';
    for (let index = 0; index < characters.length; index += 1) {
      const candidate = line + characters[index];
      if (this.fitText(candidate, maxWidth, size) !== candidate) {
        lines.push(line);
        line = characters[index];
        if (lines.length === maxLines - 1) {
          lines.push(this.fitText(characters.slice(index).join(''), maxWidth, size));
          return lines;
        }
      } else line = candidate;
    }
    if (line) lines.push(line);
    return lines;
  }

  drawChat(state) {
    if (!state.chatOpen) return;
    const { x, y, width, height } = this.roomLayout().chat;
    const ctx = this.ctx;
    ctx.save(); ctx.shadowColor = 'rgba(7, 22, 10, 0.5)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    this.roundRect(x, y, width, height, 12, 'rgba(24, 43, 30, 0.95)', '#be9c5d');
    ctx.restore();
    this.roundRect(x + 4, y + 4, width - 8, height - 8, 9, null, 'rgba(234, 207, 149, 0.19)');
    this.targets.push({ x, y, width, height, type: 'chat-panel', data: {} });
    this.text('房间聊天', x + 16, y + 23, 16, '#f7df9c', 'left', '700');
    ctx.beginPath(); ctx.moveTo(x + width - 28, y + 17); ctx.lineTo(x + width - 18, y + 27);
    ctx.moveTo(x + width - 18, y + 17); ctx.lineTo(x + width - 28, y + 27);
    ctx.strokeStyle = '#d9cdb0'; ctx.lineWidth = 1.5; ctx.stroke();
    this.targets.push({ x: x + width - 40, y: y + 7, width: 32, height: 32, type: 'close-chat', data: {} });
    const messages = state.snapshot?.public?.chat || [];
    const inputY = y + height - 47;
    const bodyHeight = height - 105;
    const visible = [];
    let usedHeight = 0;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const lines = this.wrapText(chatText(message), width - 32, 12);
      const rowHeight = lines.length * 17 + 12;
      if (usedHeight + rowHeight > bodyHeight) break;
      visible.unshift({ message, lines, rowHeight });
      usedHeight += rowHeight;
    }
    let messageY = y + 56;
    visible.forEach(({ message, lines, rowHeight }) => {
      lines.forEach((line, index) => this.text(line, x + 16, messageY + index * 17, 12,
        message.kind === 'interaction' ? '#eacb85' : '#edf0db'));
      messageY += rowHeight;
    });
    if (!messages.length) {
      this.text('还没有消息，打个招呼吧', x + width / 2, y + 112, 12, '#aebda2', 'center');
      this.text('点击玩家头像，还可以发送互动', x + width / 2, y + 137, 11, '#8da184', 'center');
    }
    this.roundRect(x + 12, inputY, width - 90, 34, 6, 'rgba(7, 26, 18, 0.72)', '#6d805a');
    const draft = state.chatDraft || '点此输入消息…';
    this.text(this.fitText(draft, width - 110, 12), x + 22, inputY + 18, 12, state.chatDraft ? '#edf0db' : '#a3b69a');
    this.targets.push({ x: x + 12, y: inputY, width: width - 90, height: 34, type: 'input', data: { field: 'chatDraft' } });
    this.button('发送', x + width - 70, inputY, 58, 34, 'send-chat', {}, 'primary');
  }

  drawInteractionPicker(state) {
    const x = this.roomLayout().width / 2 - 150;
    const y = 328;
    this.roundRect(x, y, 300, 73, 12, 'rgba(24, 43, 30, 0.96)', '#be9c5d');
    this.text(this.fitText(`送给 ${state.selectedTarget.nickname}`, 270, 13), x + 14, y + 18, 13, '#f3dfb0');
    INTERACTIONS.forEach((item, index) => {
      const bx = x + 16 + index * 70;
      this.button(item.label, bx, y + 33, 56, 28, 'interaction', { interaction: item.id }, 'secondary');
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
