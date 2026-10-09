import { describe, expect, it } from 'vitest';
const config = require('../src/config');
const project = require('../project.config.json');
const { createCommand } = require('../src/protocol');
const { sortCards } = require('../src/cards');
const { FourOneFourRenderer, cardLabel } = require('../src/renderer');

function mockRenderer(width, height) {
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, {
    get: (target, property) => {
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return () => gradient;
      }
      if (property === 'measureText') {
        return (text) => ({ width: String(text).length * 7 });
      }
      return target[property] || (() => undefined);
    },
    set: (target, property, value) => { target[property] = value; return true; },
  });
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
    expect(roomRenderer.targets.some((target) => target.type === 'leave')).toBe(true);
    expect(roomRenderer.targets.some((target) => target.type === 'toggle-chat')).toBe(true);
    expect(roomRenderer.targets.some((target) => target.type === 'select-player' && target.data.seat === 'B')).toBe(true);
  });

  it('renders chat modal with tabs and filters phrases and interactions from regular messages', () => {
    const labels = [];
    const gradient = { addColorStop() {} };
    const context = new Proxy({}, {
      get: (target, property) => {
        if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
        if (property === 'measureText') return (text) => ({ width: String(text).length * 7 });
        if (property === 'fillText') return (value) => labels.push(String(value));
        return target[property] || (() => undefined);
      },
      set: (target, property, value) => { target[property] = value; return true; },
    });
    const renderer = new FourOneFourRenderer({ width: 960, height: 540 }, context);

    const chatItems = [
      { id: '1', kind: 'text', senderNickname: '玩家A', text: '大家好' },
      { id: '2', kind: 'phrase', senderNickname: '玩家B', text: '快点啊，等的我花儿都谢了！' },
      { id: '3', kind: 'interaction', senderNickname: '玩家C', targetNickname: '玩家D', interaction: 'water' },
    ];

    renderer.draw({
      screen: 'room', chatOpen: true, chatTab: 'messages', selectedIds: [], selectedTarget: null, busy: false,
      snapshot: {
        public: { roomId: '414', phase: 'playing', currentTurn: 'A', handNumber: 1, players: ['A', 'B', 'C', 'D'].map((seat) => ({ seat, nickname: `玩家${seat}`, isHost: seat === 'A', handCount: 13, connected: true })), chat: chatItems },
        private: { seat: 'A', hand: [], spectator: false },
      },
    });

    expect(renderer.targets.some((target) => target.type === 'chat-tab' && target.data.tab === 'phrases')).toBe(true);
    expect(labels.some((l) => l.includes('大家好'))).toBe(true);
    expect(labels.some((l) => l.includes('快点啊，等的我花儿都谢了！'))).toBe(false);
    expect(labels.some((l) => l.includes('泼水'))).toBe(false);

    // Now switch tab to phrases
    renderer.draw({
      screen: 'room', chatOpen: true, chatTab: 'phrases', selectedIds: [], selectedTarget: null, busy: false,
      snapshot: {
        public: { roomId: '414', phase: 'playing', currentTurn: 'A', handNumber: 1, players: ['A', 'B', 'C', 'D'].map((seat) => ({ seat, nickname: `玩家${seat}`, isHost: seat === 'A', handCount: 13, connected: true })), chat: chatItems },
        private: { seat: 'A', hand: [], spectator: false },
      },
    });
    const phraseTargets = renderer.targets.filter((target) => target.type === 'send-phrase');
    expect(phraseTargets.length).toBeGreaterThan(0);
    expect(phraseTargets[0].data.phrase).toBe('你是GG还是MM？');
  });

  it('renders interaction picker when a player seat is selected', () => {
    const renderer = mockRenderer(960, 540);
    renderer.draw({
      screen: 'room', chatOpen: false, selectedIds: [], busy: false,
      selectedTarget: { seat: 'B', nickname: '玩家B' },
      snapshot: {
        public: { roomId: '414', phase: 'playing', currentTurn: 'A', handNumber: 1, players: ['A', 'B', 'C', 'D'].map((seat) => ({ seat, nickname: `玩家${seat}`, isHost: seat === 'A', handCount: 13, connected: true })), chat: [] },
        private: { seat: 'A', hand: [], spectator: false },
      },
    });

    const interactions = renderer.targets.filter((t) => t.type === 'interaction').map((t) => t.data.interaction);
    expect(interactions).toEqual(['tomato', 'water', 'heart', 'kiss']);
    expect(renderer.targets.some((t) => t.type === 'close-interaction')).toBe(true);
  });

  it('renders speech bubbles and water pouring animations without errors', () => {
    const renderer = mockRenderer(960, 540);
    const now = Date.now();
    expect(() => {
      renderer.draw({
        screen: 'room', chatOpen: false, selectedIds: [], selectedTarget: null, busy: false,
        speechBubbles: {
          B: { text: '快点啊，等的我花儿都谢了！', expireAt: now + 3000 },
        },
        activeAnimations: [
          { type: 'water', fromSeat: 'A', toSeat: 'B', start: now - 300, duration: 1500 },
          { type: 'tomato', fromSeat: 'C', toSeat: 'D', start: now - 200, duration: 1200 },
          { type: 'heart', fromSeat: 'A', toSeat: 'C', start: now - 100, duration: 1000 },
          { type: 'kiss', fromSeat: 'B', toSeat: 'A', start: now - 100, duration: 1000 },
        ],
        snapshot: {
          public: { roomId: '414', phase: 'playing', currentTurn: 'A', handNumber: 1, players: ['A', 'B', 'C', 'D'].map((seat) => ({ seat, nickname: `玩家${seat}`, isHost: seat === 'A', handCount: 13, connected: true })), chat: [] },
          private: { seat: 'A', hand: [], spectator: false },
        },
      });
    }).not.toThrow();
  });
});
