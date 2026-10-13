const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const CARD_WIDTH = 140;
const CARD_HEIGHT = 196;
const COLS = 14;
const ROWS = 4;
const TOTAL_WIDTH = CARD_WIDTH * COLS;
const TOTAL_HEIGHT = CARD_HEIGHT * ROWS;


// HTML template with embedded vector rendering on Canvas
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: transparent; overflow: hidden; }
  canvas { display: block; }
</style>
</head>
<body>
<canvas id="c" width="${TOTAL_WIDTH}" height="${TOTAL_HEIGHT}"></canvas>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const CARD_W = ${CARD_WIDTH};
const CARD_H = ${CARD_HEIGHT};

// Helper: rounded rect
function roundRect(ctx, x, y, w, h, r) {
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
}

// Vector Suit Paths (normalized around 0,0, radius ~1)
function drawSpade(ctx, cx, cy, size, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 24;
  ctx.scale(s, s);
  ctx.fillStyle = fill;
  ctx.beginPath();
  // Spade body
  ctx.moveTo(0, -12);
  ctx.bezierCurveTo(3, -7, 10, -2, 11, 4);
  ctx.bezierCurveTo(12, 8, 8, 12, 3, 11);
  ctx.bezierCurveTo(0, 10, -1, 6, 0, 4);
  ctx.bezierCurveTo(1, 6, 0, 10, -3, 11);
  ctx.bezierCurveTo(-8, 12, -12, 8, -11, 4);
  ctx.bezierCurveTo(-10, -2, -3, -7, 0, -12);
  ctx.fill();
  // Spade stem
  ctx.beginPath();
  ctx.moveTo(-1, 5);
  ctx.lineTo(1, 5);
  ctx.quadraticCurveTo(2, 10, 5, 12);
  ctx.lineTo(-5, 12);
  ctx.quadraticCurveTo(-2, 10, -1, 5);
  ctx.fill();
  ctx.restore();
}

function drawHeart(ctx, cx, cy, size, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 24;
  ctx.scale(s, s);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, 11);
  ctx.bezierCurveTo(-4, 6, -11, 1, -11, -5);
  ctx.bezierCurveTo(-11, -10, -6, -12, -1, -9);
  ctx.lineTo(0, -7);
  ctx.lineTo(1, -9);
  ctx.bezierCurveTo(6, -12, 11, -10, 11, -5);
  ctx.bezierCurveTo(11, 1, 4, 6, 0, 11);
  ctx.fill();
  ctx.restore();
}

function drawClub(ctx, cx, cy, size, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 24;
  ctx.scale(s, s);
  ctx.fillStyle = fill;
  // Three petals
  ctx.beginPath();
  ctx.arc(0, -5, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-5.5, 3, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(5.5, 3, 5.2, 0, Math.PI * 2);
  ctx.fill();
  // Center fill
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  // Stem
  ctx.beginPath();
  ctx.moveTo(-1, 1);
  ctx.lineTo(1, 1);
  ctx.quadraticCurveTo(2, 8, 5, 12);
  ctx.lineTo(-5, 12);
  ctx.quadraticCurveTo(-2, 8, -1, 1);
  ctx.fill();
  ctx.restore();
}

function drawDiamond(ctx, cx, cy, size, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 24;
  ctx.scale(s, s);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.quadraticCurveTo(1.5, -3, 8.5, 0);
  ctx.quadraticCurveTo(1.5, 3, 0, 12);
  ctx.quadraticCurveTo(-1.5, 3, -8.5, 0);
  ctx.quadraticCurveTo(-1.5, -3, 0, -12);
  ctx.fill();
  ctx.restore();
}

function drawSuit(ctx, suit, cx, cy, size) {
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const color = isRed ? '#d31c26' : '#141416';
  if (suit === 'spades') drawSpade(ctx, cx, cy, size, color);
  else if (suit === 'hearts') drawHeart(ctx, cx, cy, size, color);
  else if (suit === 'clubs') drawClub(ctx, cx, cy, size, color);
  else if (suit === 'diamonds') drawDiamond(ctx, cx, cy, size, color);
}

// Draw base card plate (ivory white, crisp borders, subtle inner hairline)
function drawCardBase(ctx, x, y) {
  ctx.save();
  // Drop shadow
  roundRect(ctx, x + 1, y + 1, CARD_W - 2, CARD_H - 2, 7);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();

  // Subtle inner decorative hairline (Bicycle style)
  roundRect(ctx, x + 4, y + 4, CARD_W - 8, CARD_H - 8, 5);
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  ctx.restore();
}

// Draw indices (Rank + mini-suit at top-left and rotated 180 deg at bottom-right)
function drawIndices(ctx, x, y, rank, suit) {
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const color = isRed ? '#d31c26' : '#141416';

  function drawCorner(cx, cy, rotate) {
    ctx.save();
    ctx.translate(cx, cy);
    if (rotate) ctx.rotate(Math.PI);

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '700 17px "Helvetica Neue", "Arial", sans-serif';
    ctx.fillText(rank, 0, 0);

    const suitY = rank === '10' ? 18 : 17;
    drawSuit(ctx, suit, 0, suitY, 11);
    ctx.restore();
  }

  drawCorner(x + 14, y + 9, false);
  drawCorner(x + CARD_W - 14, y + CARD_H - 9, true);
}

// Pip coordinate maps for standard Bicycle 2-10 cards
// Normal coordinates relative to card center (0,0), scale: w ~ 80, h ~ 120
const PIP_POSITIONS = {
  '2': [{ x: 0, y: -44 }, { x: 0, y: 44, inv: true }],
  '3': [{ x: 0, y: -44 }, { x: 0, y: 0 }, { x: 0, y: 44, inv: true }],
  '4': [
    { x: -25, y: -44 }, { x: 25, y: -44 },
    { x: -25, y: 44, inv: true }, { x: 25, y: 44, inv: true }
  ],
  '5': [
    { x: -25, y: -44 }, { x: 25, y: -44 },
    { x: 0, y: 0 },
    { x: -25, y: 44, inv: true }, { x: 25, y: 44, inv: true }
  ],
  '6': [
    { x: -25, y: -44 }, { x: 25, y: -44 },
    { x: -25, y: 0 }, { x: 25, y: 0 },
    { x: -25, y: 44, inv: true }, { x: 25, y: 44, inv: true }
  ],
  '7': [
    { x: -25, y: -44 }, { x: 25, y: -44 },
    { x: 0, y: -22 },
    { x: -25, y: 0 }, { x: 25, y: 0 },
    { x: -25, y: 44, inv: true }, { x: 25, y: 44, inv: true }
  ],
  '8': [
    { x: -25, y: -44 }, { x: 25, y: -44 },
    { x: 0, y: -22 },
    { x: -25, y: 0 }, { x: 25, y: 0 },
    { x: 0, y: 22, inv: true },
    { x: -25, y: 44, inv: true }, { x: 25, y: 44, inv: true }
  ],
  '9': [
    { x: -25, y: -46 }, { x: 25, y: -46 },
    { x: -25, y: -16 }, { x: 25, y: -16 },
    { x: 0, y: 0 },
    { x: -25, y: 16, inv: true }, { x: 25, y: 16, inv: true },
    { x: -25, y: 46, inv: true }, { x: 25, y: 46, inv: true }
  ],
  '10': [
    { x: -25, y: -46 }, { x: 25, y: -46 },
    { x: 0, y: -30 },
    { x: -25, y: -15 }, { x: 25, y: -15 },
    { x: -25, y: 15, inv: true }, { x: 25, y: 15, inv: true },
    { x: 0, y: 30, inv: true },
    { x: -25, y: 46, inv: true }, { x: 25, y: 46, inv: true }
  ],
};

function drawPipCard(ctx, x, y, rank, suit) {
  drawCardBase(ctx, x, y);
  drawIndices(ctx, x, y, rank, suit);

  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;

  if (rank === 'A') {
    if (suit === 'spades') {
      // Iconic ornate Bicycle Ace of Spades!
      drawOrnateAceOfSpades(ctx, cx, cy);
    } else {
      // Big center pip for Ace of Hearts, Clubs, Diamonds
      drawSuit(ctx, suit, cx, cy, 54);
    }
    return;
  }

  const pips = PIP_POSITIONS[rank] || [];
  for (const pip of pips) {
    ctx.save();
    ctx.translate(cx + pip.x, cy + pip.y);
    if (pip.inv) ctx.rotate(Math.PI);
    drawSuit(ctx, suit, 0, 0, 22);
    ctx.restore();
  }
}

// Iconic Bicycle Ace of Spades with engraving flourishes and ribbon
function drawOrnateAceOfSpades(ctx, cx, cy) {
  ctx.save();
  // Ornate central spade
  drawSpade(ctx, cx, cy - 2, 68, '#141416');

  // Fine engraving flourishes inside/around
  ctx.save();
  ctx.translate(cx, cy - 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  // Inner spade hairline
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.stroke();

  // White inner star
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const r = i % 2 === 0 ? 8 : 3.5;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Banner ribbon below spade
  ctx.fillStyle = '#141416';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 9px "Times New Roman", serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('• BICYCLE •', cx, cy + 44);

  // Tiny floral filigree leaves
  ctx.strokeStyle = '#141416';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx - 28, cy + 44, 4, 0, Math.PI);
  ctx.arc(cx + 28, cy + 44, 4, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

// Royal Court Figures (J, Q, K) - Classic Two-Headed Bicycle Pattern
function drawCourtCard(ctx, x, y, rank, suit) {
  drawCardBase(ctx, x, y);
  drawIndices(ctx, x, y, rank, suit);

  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;

  // Golden portrait frame box
  const pw = 82;
  const ph = 138;
  const px = cx - pw / 2;
  const py = cy - ph / 2;

  ctx.save();
  // Outer frame
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px, py, pw, ph);

  // Inner frame hairline
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);

  // Background of portrait
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(px + 2.5, py + 2.5, pw - 5, ph - 5);

  // Clip inside portrait frame
  ctx.beginPath();
  ctx.rect(px + 2.5, py + 2.5, pw - 5, ph - 5);
  ctx.clip();

  // Draw symmetric court halves (top half and rotated bottom half)
  function drawHalf(isBottom) {
    ctx.save();
    ctx.translate(cx, cy);
    if (isBottom) ctx.rotate(Math.PI);

    // Half-court drawing zone: y goes from -68 to 0
    if (rank === 'J') drawJackHalf(ctx, suit);
    else if (rank === 'Q') drawQueenHalf(ctx, suit);
    else if (rank === 'K') drawKingHalf(ctx, suit);

    ctx.restore();
  }

  drawHalf(false);
  drawHalf(true);

  // Middle divider line across portrait
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(px, cy);
  ctx.lineTo(px + pw, cy);
  ctx.stroke();

  ctx.restore();
}

// Jack: Knight/valet with Tudor doublet, cap with feather, halberd
function drawJackHalf(ctx, suit) {
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const robeColor = isRed ? '#dc2626' : '#2563eb';
  const trimColor = '#eab308';

  ctx.save();
  // Mantle / Doublet
  ctx.fillStyle = robeColor;
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.lineTo(-26, -34);
  ctx.lineTo(-12, -42);
  ctx.lineTo(12, -42);
  ctx.lineTo(26, -34);
  ctx.lineTo(28, 0);
  ctx.closePath();
  ctx.fill();

  // Golden Collar / Trim
  ctx.fillStyle = trimColor;
  ctx.beginPath();
  ctx.moveTo(-16, -40);
  ctx.lineTo(0, -22);
  ctx.lineTo(16, -40);
  ctx.lineTo(9, -43);
  ctx.lineTo(0, -28);
  ctx.lineTo(-9, -43);
  ctx.closePath();
  ctx.fill();

  // Head / Face
  ctx.fillStyle = '#fed7aa'; // Skin tone
  ctx.beginPath();
  ctx.arc(0, -48, 10, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.arc(-8, -48, 4.5, 0, Math.PI * 2);
  ctx.arc(8, -48, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes and nose profile
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-4, -50, 2, 2.5);
  ctx.fillRect(2, -50, 2, 2.5);
  ctx.beginPath();
  ctx.arc(0, -44, 2, 0, Math.PI);
  ctx.stroke();

  // Tudor Cap
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.ellipse(0, -56, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Feather on Cap
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6, -58);
  ctx.quadraticCurveTo(16, -64, 20, -54);
  ctx.stroke();

  // Upright Halberd / Lance on right side
  ctx.strokeStyle = '#78716c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(22, -62);
  ctx.stroke();
  // Spear blade
  ctx.fillStyle = '#ca8a04';
  ctx.beginPath();
  ctx.moveTo(22, -66);
  ctx.lineTo(19, -58);
  ctx.lineTo(25, -58);
  ctx.closePath();
  ctx.fill();

  // Suit emblem on chest
  drawSuit(ctx, suit, 0, -12, 12);
  ctx.restore();
}

// Queen: Royal crown with pearls, veil, royal mantle, flower/scepter
function drawQueenHalf(ctx, suit) {
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const robeColor = isRed ? '#dc2626' : '#2563eb';

  ctx.save();
  // Royal Mantle
  ctx.fillStyle = robeColor;
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(-24, -36);
  ctx.lineTo(-10, -42);
  ctx.lineTo(10, -42);
  ctx.lineTo(24, -36);
  ctx.lineTo(30, 0);
  ctx.closePath();
  ctx.fill();

  // Royal ermine sash
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(-12, -42);
  ctx.lineTo(0, -18);
  ctx.lineTo(12, -42);
  ctx.closePath();
  ctx.fill();
  // Ermine dots
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-3, -34, 1.5, 2.5);
  ctx.fillRect(2, -34, 1.5, 2.5);
  ctx.fillRect(0, -26, 1.5, 2.5);

  // Queen Head & Neck
  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.arc(0, -48, 9.5, 0, Math.PI * 2);
  ctx.fill();

  // Long flowing hair
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.arc(-8, -46, 5, 0, Math.PI * 2);
  ctx.arc(8, -46, 5, 0, Math.PI * 2);
  ctx.fill();

  // Face features
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-3.5, -50, 1.8, 2);
  ctx.fillRect(2, -50, 1.8, 2);
  ctx.fillStyle = '#e11d48';
  ctx.fillRect(-1.5, -44, 3, 1.5);

  // Golden Queen Crown
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.moveTo(-11, -55);
  ctx.lineTo(-11, -63);
  ctx.lineTo(-5, -58);
  ctx.lineTo(0, -65);
  ctx.lineTo(5, -58);
  ctx.lineTo(11, -63);
  ctx.lineTo(11, -55);
  ctx.closePath();
  ctx.fill();

  // Golden Royal Flower / Scepter held in hand
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.arc(20, -24, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, -20);
  ctx.lineTo(20, 0);
  ctx.stroke();

  // Suit emblem on chest
  drawSuit(ctx, suit, 0, -10, 12);
  ctx.restore();
}

// King: Monarch with beard, imperial crown, royal sword / orb
function drawKingHalf(ctx, suit) {
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const robeColor = isRed ? '#dc2626' : '#2563eb';

  ctx.save();
  // Imperial Robe
  ctx.fillStyle = robeColor;
  ctx.beginPath();
  ctx.moveTo(-32, 0);
  ctx.lineTo(-28, -36);
  ctx.lineTo(-12, -42);
  ctx.lineTo(12, -42);
  ctx.lineTo(28, -36);
  ctx.lineTo(32, 0);
  ctx.closePath();
  ctx.fill();

  // Ermine Mantle Collar
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-14, -42, 28, 12);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-8, -38, 2, 3);
  ctx.fillRect(0, -38, 2, 3);
  ctx.fillRect(8, -38, 2, 3);

  // King Head
  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.arc(0, -48, 10.5, 0, Math.PI * 2);
  ctx.fill();

  // Royal Beard & Mustache
  ctx.fillStyle = '#e2e8f0'; // Silver royal beard
  ctx.beginPath();
  ctx.arc(0, -43, 6, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(-6, -46, 12, 2.5);

  // Eyes
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-4, -51, 2, 2);
  ctx.fillRect(2, -51, 2, 2);

  // Imperial Crown
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.moveTo(-13, -56);
  ctx.lineTo(-13, -64);
  ctx.lineTo(-6, -60);
  ctx.lineTo(0, -67);
  ctx.lineTo(6, -60);
  ctx.lineTo(13, -64);
  ctx.lineTo(13, -56);
  ctx.closePath();
  ctx.fill();

  // Imperial Cross atop crown
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-1, -69, 2, 4);
  ctx.fillRect(-2.5, -68, 5, 1.5);

  // King's Imperial Sword on side
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(24, -50);
  ctx.stroke();
  // Golden Pommel & Crossguard
  ctx.fillStyle = '#eab308';
  ctx.fillRect(18, -44, 12, 2.5);
  ctx.beginPath();
  ctx.arc(24, -46, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Suit emblem on chest
  drawSuit(ctx, suit, 0, -12, 13);
  ctx.restore();
}

// Big Joker (Red / Color) & Small Joker (Black / Monochrome)
function drawJokerCard(ctx, x, y, isBig) {
  drawCardBase(ctx, x, y);

  const mainColor = isBig ? '#dc2626' : '#1e293b';
  const accentColor = isBig ? '#f59e0b' : '#64748b';

  // Corner indices: "JOKER" & star
  function drawJokerCorner(cx, cy, rotate) {
    ctx.save();
    ctx.translate(cx, cy);
    if (rotate) ctx.rotate(Math.PI);
    ctx.fillStyle = mainColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '700 13px "Arial Black", sans-serif';
    ctx.fillText('J', 0, 0);

    ctx.font = '700 9px sans-serif';
    ctx.fillText('★', 0, 15);
    ctx.restore();
  }

  drawJokerCorner(x + 14, y + 10, false);
  drawJokerCorner(x + CARD_W - 14, y + CARD_H - 10, true);

  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;

  ctx.save();
  // Central Jester figure
  // 1. Jester ruffled collar
  ctx.fillStyle = accentColor;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * 8, cy + 10, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Jester face
  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.arc(cx, cy - 10, 18, 0, Math.PI * 2);
  ctx.fill();

  // Cheek blush
  ctx.fillStyle = isBig ? 'rgba(239, 68, 68, 0.4)' : 'rgba(148, 163, 184, 0.3)';
  ctx.beginPath();
  ctx.arc(cx - 9, cy - 6, 4, 0, Math.PI * 2);
  ctx.arc(cx + 9, cy - 6, 4, 0, Math.PI * 2);
  ctx.fill();

  // Playful smiling eyes and mouth
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx - 6, cy - 12, 3, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 6, cy - 12, 3, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - 8, 8, 0, Math.PI);
  ctx.stroke();

  // 3. Jester 3-horned cap with bells
  // Center horn
  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy - 22);
  ctx.quadraticCurveTo(cx - 10, cy - 48, cx, cy - 46);
  ctx.quadraticCurveTo(cx + 10, cy - 48, cx + 16, cy - 22);
  ctx.fill();
  // Left curled horn
  ctx.fillStyle = isBig ? '#2563eb' : '#334155';
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy - 22);
  ctx.quadraticCurveTo(cx - 32, cy - 38, cx - 28, cy - 28);
  ctx.quadraticCurveTo(cx - 20, cy - 22, cx - 8, cy - 20);
  ctx.fill();
  // Right curled horn
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(cx + 16, cy - 22);
  ctx.quadraticCurveTo(cx + 32, cy - 38, cx + 28, cy - 28);
  ctx.quadraticCurveTo(cx + 20, cy - 22, cx + 8, cy - 20);
  ctx.fill();

  // Golden bells on horn tips
  const bells = [
    { x: cx, y: cy - 48 },
    { x: cx - 29, y: cy - 28 },
    { x: cx + 29, y: cy - 28 },
  ];
  ctx.fillStyle = '#eab308';
  for (const b of bells) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Jester Marotte (staff with mini jester head) held on side
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 22, cy + 35);
  ctx.lineTo(cx + 34, cy - 6);
  ctx.stroke();
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.arc(cx + 34, cy - 8, 6, 0, Math.PI * 2);
  ctx.fill();

  // 5. Grand "JOKER" Banner
  roundRect(ctx, cx - 44, cy + 38, 88, 20, 6);
  ctx.fillStyle = mainColor;
  ctx.fill();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 11px "Arial Black", sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(isBig ? '★ JOKER ★' : 'JOKER', cx, cy + 48);

  ctx.restore();
}

// Ornate Bicycle / Bee Style Card Backs (Navy Blue & Burgundy Red)
function drawCardBack(ctx, x, y, isRed) {
  drawCardBase(ctx, x, y);

  const baseColor = isRed ? '#991b1b' : '#1e3a8a';
  const patternColor = isRed ? '#dc2626' : '#3b82f6';
  const goldColor = '#eab308';

  const margin = 7;
  const innerW = CARD_W - margin * 2;
  const innerH = CARD_H - margin * 2;
  const ix = x + margin;
  const iy = y + margin;

  ctx.save();
  // Fill inner ornate field
  roundRect(ctx, ix, iy, innerW, innerH, 4);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.clip();

  // Fine lattice / trellis pattern
  ctx.strokeStyle = patternColor;
  ctx.lineWidth = 0.8;
  const step = 8;
  for (let d = -innerH; d < innerW + innerH; d += step) {
    ctx.beginPath();
    ctx.moveTo(ix + d, iy);
    ctx.lineTo(ix + d + innerH, iy + innerH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ix + d, iy + innerH);
    ctx.lineTo(ix + d + innerH, iy);
    ctx.stroke();
  }

  // Inner border frames
  roundRect(ctx, ix + 4, iy + 4, innerW - 8, innerH - 8, 3);
  ctx.strokeStyle = goldColor;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Central ornate rosette medallion
  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.strokeStyle = goldColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Multi-point radial star inside medallion
  ctx.fillStyle = goldColor;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8;
    const r = i % 2 === 0 ? 18 : 10;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.restore();
}

// -------------------------------------------------------------
// RENDER ALL 56 CARDS (14 Columns x 4 Rows)
// -------------------------------------------------------------
const suits = ['spades', 'hearts', 'clubs', 'diamonds'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

suits.forEach((suit, row) => {
  ranks.forEach((rank, col) => {
    const x = col * CARD_W;
    const y = row * CARD_H;
    if (['J', 'Q', 'K'].includes(rank)) {
      drawCourtCard(ctx, x, y, rank, suit);
    } else {
      drawPipCard(ctx, x, y, rank, suit);
    }
  });

  // Column 13: Special items
  const specialX = 13 * CARD_W;
  const specialY = row * CARD_H;
  if (row === 0) {
    drawJokerCard(ctx, specialX, specialY, false); // Small Joker (Black)
  } else if (row === 1) {
    drawJokerCard(ctx, specialX, specialY, true);  // Big Joker (Red)
  } else if (row === 2) {
    drawCardBack(ctx, specialX, specialY, false);  // Navy Blue Back
  } else if (row === 3) {
    drawCardBack(ctx, specialX, specialY, true);   // Burgundy Red Back
  }
});

window.__RENDER_DONE = true;
</script>
</body>
</html>
`;

async function main() {
  const browserPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const executablePath = browserPaths.find(p => fs.existsSync(p));
  if (!executablePath) {
    throw new Error('No system Chrome or Edge browser found');
  }

  console.log('Launching browser at:', executablePath);
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: TOTAL_WIDTH, height: TOTAL_HEIGHT },
    deviceScaleFactor: 1
  });

  await page.setContent(html);
  await page.waitForFunction(() => window.__RENDER_DONE === true);

  const canvasHandle = await page.$('#c');
  const buffer = await canvasHandle.screenshot({ type: 'png', omitBackground: true });

  const targetPath = path.resolve(__dirname, '../minigame-414/assets/poker-cards.png');
  fs.writeFileSync(targetPath, buffer);
  console.log(`Successfully generated poker atlas: ${targetPath} (${buffer.length} bytes)`);

  // Also copy to miniprogram/assets and client/public/assets if helpful
  const miniprogramAssets = path.resolve(__dirname, '../miniprogram/assets/poker-cards.png');
  if (fs.existsSync(path.dirname(miniprogramAssets))) {
    fs.writeFileSync(miniprogramAssets, buffer);
  }
  const clientAssets = path.resolve(__dirname, '../client/public/assets/poker-cards.png');
  if (fs.existsSync(path.dirname(clientAssets))) {
    fs.writeFileSync(clientAssets, buffer);
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
