const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUIT_ORDER = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };

function rankValue(rank, main) {
  return rank === main ? RANKS.length : RANKS.indexOf(rank);
}

function compareCards(left, right, main) {
  const leftValue = left.kind === 'joker' ? RANKS.length + (left.joker === 'small' ? 1 : 2) : rankValue(left.rank, main);
  const rightValue = right.kind === 'joker' ? RANKS.length + (right.joker === 'small' ? 1 : 2) : rankValue(right.rank, main);
  if (leftValue !== rightValue) return leftValue - rightValue;
  if (left.kind === 'joker' && right.kind === 'joker') {
    if (left.joker === right.joker) return 0;
    return left.joker === 'small' ? -1 : 1;
  }
  if (left.kind === 'standard' && right.kind === 'standard') return SUIT_ORDER[left.suit] - SUIT_ORDER[right.suit];
  return left.kind === 'standard' ? -1 : 1;
}

function sortCards(cards, main = null) {
  return [...(cards || [])].sort((left, right) => compareCards(left, right, main));
}

module.exports = { sortCards };
