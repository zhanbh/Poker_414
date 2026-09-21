const EVENTS = {
  login: 'auth:login',
  join: 'room:join',
  leave: 'room:leave',
  snapshot: 'room:snapshot',
  command: 'command',
  activity: 'room:activity',
  replaced: 'session:replaced',
};

function requestId() {
  return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

function createCommand(snapshot, type, payload) {
  return {
    type,
    requestId: requestId(),
    handNumber: snapshot.public.handNumber,
    stateVersion: snapshot.public.version,
    payload,
  };
}

module.exports = {
  EVENTS,
  createCommand,
  requestId,
};
