import { describe, expect, it } from 'vitest';
const config = require('../src/config');
const project = require('../project.config.json');
const { createCommand } = require('../src/protocol');
const { sortCards } = require('../src/cards');
const { FourOneFourRenderer, cardLabel } = require('../src/renderer');

function mockRenderer(width, height) {
  const context = {
    setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {},
    fill() {}, stroke() {}, fillText() {}, measureText: (text) => ({ width: String(text).length * 7 }),
  };
  const canvas = { width, height };
  return new FourOneFourRenderer(canvas, context);
}

describe('414 mini-game project split', () => {
  it('is an independent game project configured for the 414 server route', () => {
    expect(project.compileType).toBe('game');
    expect(project.appid).toBe('wxbfba23f65bb024ca');
    expect(project.isGameTourist).toBe(false);
    expect(config.gameId).toBe('414');
    expect(config.roomId).toBe('414');
    expect(config.cloudRunService).toBe('express-xgjy');
  });

  it('creates commands with the current authoritative snapshot version', () => {
    const snapshot = { public: { handNumber: 4, version: 18 } };
    expect(createCommand(snapshot, 'play', { cardIds: ['c1'] })).toMatchObject({
      type: 'play', handNumber: 4, stateVersion: 18, payload: { cardIds: ['c1'] },
    });
  });

  it('sorts the visible hand and renders the correct card suit labels', () => {
    const cards = [
      { id: 'a', kind: 'standard', suit: 'spades', rank: 'A' },
      { id: 'b', kind: 'standard', suit: 'clubs', rank: '4' },
      { id: 'c', kind: 'standard', suit: 'hearts', rank: '5' },
    ];
    expect(sortCards(cards).map((card) => card.id)).toEqual(['b', 'c', 'a']);
    expect(cardLabel(cards[0])).toBe('A♠');
    expect(cardLabel({ kind: 'joker', joker: 'big' })).toBe('大王');
  });

  it('draws a portrait entry and a landscape room with touch targets', () => {
    const entryRenderer = mockRenderer(540, 960);
    entryRenderer.draw({ screen: 'entry', inviteCode: '', nickname: '', statusMessage: '', error: '' });
    expect(entryRenderer.hit(100, 350)?.data.field).toBe('inviteCode');

    const roomRenderer = mockRenderer(960, 540);
    roomRenderer.draw({
      screen: 'lobby', chatOpen: false, selectedIds: [], selectedTarget: null, busy: false,
      snapshot: {
        public: { roomId: '414', phase: 'lobby', handNumber: 0, players: ['A', 'B', 'C', 'D'].map((seat) => ({ seat, nickname: `玩家${seat}`, isHost: seat === 'A', handCount: 0, connected: true })), chat: [] },
        private: { seat: 'A', hand: [], spectator: false },
      },
    });
    expect(roomRenderer.targets.some((target) => target.type === 'start')).toBe(true);
  });
});
