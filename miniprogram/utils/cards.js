function cardLabel(card) {
  if (card.kind === 'joker') return card.joker === 'big' ? '大王' : '小王';
  return card.rank;
}

function cardClass(card) {
  if (card.kind === 'joker') return card.joker === 'big' ? 'big-joker' : 'small-joker';
  return 'rank-' + card.rank;
}

function displayCards(cards) {
  return (cards || []).map((card) => ({
    ...card,
    label: cardLabel(card),
    cssClass: cardClass(card),
  }));
}

module.exports = {
  cardLabel,
  displayCards,
};
