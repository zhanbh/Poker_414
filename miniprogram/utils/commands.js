const { createCommand } = require('./protocol');

function commandFor(snapshot, type, payload) {
  return createCommand(snapshot, type, payload);
}

module.exports = {
  commandFor,
};
