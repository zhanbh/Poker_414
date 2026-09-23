function chatMembers(snapshot) {
  const players = (snapshot.public.players || []).map((player) => ({
    id: player.seat,
    seat: player.seat,
    nickname: player.nickname,
    label: player.positionLabel || player.seat + ' 位',
  }));
  const spectators = (snapshot.public.spectators || []).map((viewer, index) => ({
    id: 'spectator-' + index + '-' + viewer.nickname,
    nickname: viewer.nickname,
    label: '观战',
  }));
  return players.concat(spectators);
}

module.exports = { chatMembers };