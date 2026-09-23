function hasRoomIdentity(snapshot) {
  return Boolean(snapshot && snapshot.private && (snapshot.private.seat || snapshot.private.spectator));
}

function lostRoomIdentity(previous, next) {
  return hasRoomIdentity(previous) && !hasRoomIdentity(next);
}

function clearStoredIdentity(gameId) {
  wx.removeStorageSync(gameId + '.sessionToken');
  wx.removeStorageSync(gameId + '.nickname');
}

module.exports = { lostRoomIdentity, clearStoredIdentity };
