const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUIT_ORDER = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };

function rankValue(rank, main) {
  return rank === main ? RANKS.length : RANKS.indexOf(rank);
}

function compareCards(left, right, main) {
  const leftValue = left.kind === 'joker' ? RANKS.length + (left.joker === 'small' ? 1 : 2) : rankValue(left.rank, main);
  const rightValue = right.kind === 'joker' ? RANKS.length + (right.joker === 'small' ? 1 : 2) : rankValue(right.rank, main);
  if (leftValue !== rightValue) return leftValue - rightValue;
  if (left.kind === 'joker' && right.kind === 'joker') return left.joker === 'small' ? -1 : 1;
  if (left.kind === 'standard' && right.kind === 'standard') return SUIT_ORDER[left.suit] - SUIT_ORDER[right.suit];
  return left.kind === 'standard' ? -1 : 1;
}

function displayPriority(rank, count, main) {
  if (count === 1) return 10;
  if (rank === main && count >= 2) return 40 + (count - 2) * 20;
  if (count === 2) return 20;
  if (count >= 3) return 30 + (count - 3) * 20;
  return 200;
}

function sortCards(cards, main = null) {
  const groups = [];
  const remaining = [...(cards || [])];
  const aces = remaining.filter((card) => card.kind === 'standard' && card.rank === 'A');
  const fours = remaining.filter((card) => card.kind === 'standard' && card.rank === '4');
  const jokers = remaining.filter((card) => card.kind === 'joker');
  const jokerNeed = Math.max(0, 2 - fours.length);
  if (aces.length && fours.length + jokers.length >= 2) {
    const special = [...fours, ...jokers.slice(0, jokerNeed), ...aces];
    const specialIds = new Set(special.map((card) => card.id));
    groups.push({ cards: special.sort((a, b) => {
      const value = (card) => card.kind === 'standard' && card.rank === '4' ? 0 : card.kind === 'joker' ? 1 : 2;
      return value(a) - value(b) || compareCards(a, b, main);
    }), priority: 200, rank: null });
    for (let i = remaining.length - 1; i >= 0; i -= 1) if (specialIds.has(remaining[i].id)) remaining.splice(i, 1);
  }
  for (const rank of RANKS) {
    const set = remaining.filter((card) => card.kind === 'standard' && card.rank === rank);
    if (!set.length) continue;
    groups.push({ cards: set.sort((a, b) => compareCards(a, b, main)), priority: displayPriority(rank, set.length, main), rank });
  }
  const leftoverJokers = remaining.filter((card) => card.kind === 'joker');
  if (leftoverJokers.length) groups.push({ cards: leftoverJokers.sort((a, b) => compareCards(a, b, main)), priority: 210, rank: null });
  return groups.sort((a, b) => a.priority - b.priority
    || (a.rank && b.rank ? rankValue(a.rank, main) - rankValue(b.rank, main) : 0)).flatMap((group) => group.cards);
}

module.exports = { sortCards };
