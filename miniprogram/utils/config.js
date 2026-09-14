const DEFAULT_SERVER_ORIGIN = 'http://localhost:3000';
const SOCKET_PATH = '/414-ws';

function normalizeOrigin(origin) {
  return String(origin || DEFAULT_SERVER_ORIGIN).replace(/\/+$/, '');
}

function getServerOrigin() {
  return normalizeOrigin(wx.getStorageSync('414.serverOrigin') || DEFAULT_SERVER_ORIGIN);
}

function getSocketUrl() {
  const origin = getServerOrigin();
  const socketOrigin = origin.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
  return socketOrigin + SOCKET_PATH;
}

module.exports = {
  DEFAULT_SERVER_ORIGIN,
  getServerOrigin,
  getSocketUrl,
};
