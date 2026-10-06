const GAME_SELECTIONS = [
  { id: '414', name: '414', description: '四人私房扑克牌', maxPlayers: 4 },
  { id: 'mahjong', name: '麻将', description: '四人大众麻将基础玩法', maxPlayers: 4 },
];

function storageKey(gameId, kind) {
  return gameId + '.' + kind;
}

function isTexasSnapshot(snapshot) {
  return Boolean(snapshot && snapshot.public && snapshot.public.gameId === 'texas');
}

function isMahjongSnapshot(snapshot) {
  return Boolean(snapshot && snapshot.public && snapshot.public.gameId === 'mahjong');
}

module.exports = {
  GAME_SELECTIONS,
  storageKey,
  isTexasSnapshot,
  isMahjongSnapshot,
};
