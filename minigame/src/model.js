const SEATS = ['A', 'B', 'C', 'D'];
const SUIT_NAMES = { characters: '万', bamboo: '条', dots: '饼' };
const HONOR_NAMES = { east: '东风', south: '南风', west: '西风', north: '北风', red: '红中', green: '发财', white: '白板' };

function relativeSeats(viewerSeat) {
  const start = Math.max(0, SEATS.indexOf(viewerSeat || 'A'));
  return SEATS.map((_, offset) => SEATS[(start + offset) % SEATS.length]);
}

function playerForSeat(snapshot, seat) {
  return (snapshot && snapshot.public && snapshot.public.players || []).find((player) => player.seat === seat) || null;
}

function tileLabel(tile) {
  if (!tile) return '';
  if (tile.label) return tile.label;
  if (tile.suit === 'dragons') return HONOR_NAMES[tile.rank] || String(tile.rank || '');
  return String(tile.rank || '') + (SUIT_NAMES[tile.suit] || '');
}

function gameScreen(snapshot) {
  if (!snapshot || !snapshot.public) return 'entry';
  return snapshot.public.phase === 'lobby' ? 'lobby' : 'game';
}

function isValidNickname(value) {
  return /^[A-Za-z0-9_〇㐀-䶿一-鿿]{1,12}$/.test(String(value || ''));
}

function actionLabel(action) {
  return ({
    discard: '出牌', listen: '听牌', chi: '吃', peng: '碰',
    'exposed-kong': '明杠', 'added-kong': '补杠', 'concealed-kong': '暗杠',
    hu: '胡牌', pass: '过',
  })[action] || action;
}

function chatText(message) {
  if (message.kind === 'text') return `${message.senderNickname}: ${message.text}`;
  if (message.kind === 'interaction') {
    const icon = ({ tomato: '🍅', water: '💦', heart: '💖', kiss: '💋' })[message.interaction] || '✨';
    return `${message.senderNickname} ${icon} ${message.targetNickname}`;
  }
  return `${message.senderNickname}: [消息]`;
}

module.exports = { SEATS, relativeSeats, playerForSeat, tileLabel, gameScreen, isValidNickname, actionLabel, chatText };
