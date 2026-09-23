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

module.exports = {
  decorateCard,
  decorateCards,
  phaseLabel,
};
