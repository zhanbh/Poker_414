const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUIT_ORDER = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };

function cardLabel(card) {
  if (card.kind === 'joker') return card.joker === 'big' ? '大王' : '小王';
  return card.rank;
}

function cardClass(card) {
  if (card.kind === 'joker') return card.joker === 'big' ? 'big-joker' : 'small-joker';
  return 'rank-' + card.rank;
}

function rankIndex(rank) {
  return RANKS.indexOf(rank);
}

function rankSortValue(rank, main) {
  return rank === main ? RANKS.length : rankIndex(rank);
}

function cardSortValue(card, main) {
  if (card.kind === 'joker') return RANKS.length + (card.joker === 'small' ? 1 : 2);
  return rankSortValue(card.rank, main);
}

function compareCards(left, right, main) {
  const valueDifference = cardSortValue(left, main) - cardSortValue(right, main);
  if (valueDifference !== 0) return valueDifference;
  if (left.kind === 'joker' && right.kind === 'joker') return left.joker === right.joker ? 0 : left.joker === 'small' ? -1 : 1;
  if (left.kind === 'standard' && right.kind === 'standard') return SUIT_ORDER[left.suit] - SUIT_ORDER[right.suit];
  return left.kind === 'standard' ? -1 : 1;
}

function specialFourOneFourValue(card) {
  if (card.kind === 'standard' && card.rank === '4') return 0;
  if (card.kind === 'joker') return 1;
  return 2;
}

function compareSpecialFourOneFourCards(left, right, main) {
  return specialFourOneFourValue(left) - specialFourOneFourValue(right) || compareCards(left, right, main);
}

function takeFlexibleFourOneFourGroup(cards) {
  const fours = cards.filter((card) => card.kind === 'standard' && card.rank === '4');
  const aces = cards.filter((card) => card.kind === 'standard' && card.rank === 'A');
  const jokers = cards.filter((card) => card.kind === 'joker');
  const jokersNeeded = Math.max(0, 2 - fours.length);
  if (aces.length === 0 || fours.length + jokers.length < 2) return null;

  const selectedJokers = jokers.slice(0, jokersNeeded);
  const group = [...fours, ...selectedJokers, ...aces];
  return { group, usedIds: new Set(group.map((card) => card.id)) };
}

function displayGroupPriority(rank, count, main) {
  if (count === 1) return 10;
  if (rank === main && count >= 2) return 40 + (count - 2) * 20;
  if (count === 2) return 20;
  if (count >= 3) return 30 + (count - 3) * 20;
  return 200;
}

function sortCards(cards, main = null) {
  const source = cards || [];
  const specialGroup = takeFlexibleFourOneFourGroup(source);
  const usedIds = specialGroup ? specialGroup.usedIds : new Set();
  const groups = [];
  let order = 0;

  if (specialGroup) {
    groups.push({
      cards: [...specialGroup.group].sort((left, right) => compareSpecialFourOneFourCards(left, right, main)),
      priority: 200,
      rank: null,
      order: order++,
    });
  }

  for (const rank of RANKS) {
    const rankCards = source.filter((card) => card.kind === 'standard' && card.rank === rank && !usedIds.has(card.id));
    if (rankCards.length === 0) continue;
    groups.push({
      cards: rankCards.sort((left, right) => compareCards(left, right, main)),
      priority: displayGroupPriority(rank, rankCards.length, main),
      rank,
      order: order++,
    });
  }

  const remainingJokers = source.filter((card) => card.kind === 'joker' && !usedIds.has(card.id));
  if (remainingJokers.length > 0) {
    groups.push({
      cards: remainingJokers.sort((left, right) => compareCards(left, right, main)),
      priority: 210,
      rank: null,
      order: order++,
    });
  }

  return groups
    .sort((left, right) => left.priority - right.priority
      || (left.rank && right.rank ? rankSortValue(left.rank, main) - rankSortValue(right.rank, main) : 0)
      || left.order - right.order)
    .flatMap((group) => group.cards);
}

function decorateCards(cards) {
  return (cards || []).map((card) => ({
    ...card,
    label: cardLabel(card),
    cssClass: cardClass(card),
  }));
}

function displayCards(cards) {
  return decorateCards(cards);
}

function displayHand(cards, main = null) {
  return decorateCards(sortCards(cards, main));
}

module.exports = {
  cardLabel,
  displayCards,
  displayHand,
  sortCards,
};
