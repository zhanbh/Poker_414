function chatMembers(snapshot) {
  const players = (snapshot.public.players || []).map((player) => ({
    id: player.seat,
    seat: player.seat,
    nickname: player.nickname,
    label: snapshot.public.gameId === 'mahjong' ? '' : player.positionLabel || player.seatLabel || player.seat + ' 位',
  }));
  const spectators = (snapshot.public.spectators || []).map((viewer, index) => ({
    id: 'spectator-' + index + '-' + viewer.nickname,
    nickname: viewer.nickname,
    label: '观战',
  }));
  return players.concat(spectators);
}

const INTERACTION_ICONS = { tomato: '🍅', water: '💦', heart: '💖', kiss: '💋' };

function newInteractionEffect(snapshot, previousSnapshot) {
  const messages = snapshot.public.chat || [];
  const previousMessages = previousSnapshot && previousSnapshot.public ? previousSnapshot.public.chat || [] : [];
  const previousId = previousMessages.length ? previousMessages[previousMessages.length - 1].id : null;
  const previousIndex = previousId ? messages.findIndex((message) => message.id === previousId) : -1;
  const freshMessages = previousId ? previousIndex < 0 ? [] : messages.slice(previousIndex + 1) : messages;
  const message = freshMessages.filter((item) => item.kind === 'interaction' && item.targetSeat && INTERACTION_ICONS[item.interaction]).pop();
  if (!message) return null;
  return { id: message.id, targetSeat: message.targetSeat, interaction: message.interaction, icon: INTERACTION_ICONS[message.interaction] };
}

module.exports = { chatMembers, newInteractionEffect };
