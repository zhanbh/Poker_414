const SUIT_LABELS = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const RED_SUITS = { diamonds: true, hearts: true };
const PHASE_LABELS = {
  lobby: '等待开局',
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
  settled: '本局已结算',
};
const HAND_CATEGORY_LABELS = {
  'high-card': '高牌',
  pair: '一对',
  'two-pair': '两对',
  'three-of-a-kind': '三条',
  straight: '顺子',
  flush: '同花',
  'full-house': '葫芦',
  'four-of-a-kind': '四条',
  'straight-flush': '同花顺',
};

function decorateCard(card) {
  const rank = card.rank === 'T' ? '10' : card.rank;
  return { ...card, label: String(rank) + (SUIT_LABELS[card.suit] || ''), red: Boolean(RED_SUITS[card.suit]) };
}

function decorateCards(cards) {
  return (cards || []).map(decorateCard);
}

function phaseLabel(phase) {
  return PHASE_LABELS[phase] || '牌局进行中';
}

function handCategoryLabel(category) {
  return HAND_CATEGORY_LABELS[category] || category || '未知牌型';
}

module.exports = {
  decorateCard,
  decorateCards,
  phaseLabel,
  handCategoryLabel,
};
