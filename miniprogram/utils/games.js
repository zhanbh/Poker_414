const GAME_SELECTIONS = [
  { id: '414', name: '414', description: '四人私房扑克牌', maxPlayers: 4 },
  { id: 'texas', name: '德州扑克', description: '两人以上即可开局的无限注德州扑克', maxPlayers: 8 },
];

function storageKey(gameId, kind) {
  return gameId + '.' + kind;
}

function isTexasSnapshot(snapshot) {
  return Boolean(snapshot && snapshot.public && snapshot.public.gameId === 'texas');
}

module.exports = {
  GAME_SELECTIONS,
  storageKey,
  isTexasSnapshot,
};
