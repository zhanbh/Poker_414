import { describe, expect, it } from 'vitest';
const config = require('../src/config');
const project = require('../project.config.json');
const { createCommand } = require('../src/protocol');
const { sortCards } = require('../src/cards');
const { FourOneFourRenderer, cardLabel } = require('../src/renderer');
const { FourOneFourGameApp } = require('../src/app');

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

  it('does not enter a room when there is no invite code, even if a saved session exists', async () => {
    let loginCalled = false;
    const app = {
      state: { inviteCode: '', profileAuthorized: true, error: '', statusMessage: '' },
      wx: { getStorageSync: () => 'stale-session' },
      transport: { login: async () => { loginCalled = true; } },
      draw: () => {},
    };

    await FourOneFourGameApp.prototype.enterRoom.call(app);

    expect(loginCalled).toBe(false);
    expect(app.state.error).toBe('请输入邀请码');
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
    expect(entryRenderer.targets.some((target) => target.type === 'input' && target.data.field === 'nickname')).toBe(false);

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
    expect(roomRenderer.targets.find((target) => target.type === 'toggle-chat')).toMatchObject({
      x: 894, y: 291, width: 48, height: 48,
    });
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

  it('does not allow self-interaction target on own card in 414', () => {
    const renderer = mockRenderer(960, 540);
    renderer.draw({
      screen: 'room', chatOpen: false, selectedIds: [], busy: false, selectedTarget: null,
      snapshot: {
        public: { roomId: '414', phase: 'playing', currentTurn: 'A', handNumber: 1, players: ['A', 'B', 'C', 'D'].map((seat) => ({ seat, nickname: `玩家${seat}`, isHost: seat === 'A', handCount: 13, connected: true })), chat: [] },
        private: { seat: 'A', hand: [], spectator: false },
      },
    });
    const playerTargets = renderer.targets.filter((t) => t.type === 'select-player');
    expect(playerTargets.some((t) => t.data.seat === 'A')).toBe(false);
    expect(playerTargets.some((t) => t.data.seat === 'B')).toBe(true);
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

  it('creates wx.createUserInfoButton overlay on entry when inviteCode is entered', () => {
    let buttonOptions;
    let onTap;
    const app = {
      wx: {
        createUserInfoButton: (options) => {
          buttonOptions = options;
          return { onTap: (fn) => { onTap = fn; }, destroy: () => {} };
        },
      },
      renderer: { viewport: { scale: 1, x: 0, y: 0 } },
      pixelRatio: 1,
      state: { screen: 'entry', inviteCode: '414', profileAuthorized: false, busy: false },
      handleUserInfoButtonResult: (result) => { app.result = result; },
      userInfoBtn: null,
      draw: () => {},
    };
    FourOneFourGameApp.prototype.updateUserInfoButton.call(app);
    expect(buttonOptions.text).toBe('进入房间');
    expect(buttonOptions.style).toMatchObject({ left: 100, top: 510, width: 340, height: 56 });
    const result = { userInfo: { nickName: '测试扑克用户', avatarUrl: 'https://avatar.url/414.jpg' } };
    onTap(result);
    expect(app.result).toBe(result);
  });

  it('joins immediately with a generated guest nickname when WeChat profile is not authorized', async () => {
    let joined;
    const app = {
      wx: { getStorageSync: () => '', setStorageSync: () => {} },
      state: { inviteCode: '414', nickname: '', avatarUrl: '', profileAuthorized: false, error: '', statusMessage: '', busy: false },
      transport: {
        login: async () => ({ sessionToken: 's-414' }),
        join: async (nickname, avatar) => {
          joined = { nickname, avatar };
          return { public: { roomId: '414', phase: 'lobby', players: [] }, private: { seat: 'A' } };
        },
      },
      destroyUserInfoButton: () => {},
      updateSnapshot: () => {},
      draw: () => {},
    };
    await FourOneFourGameApp.prototype.enterRoom.call(app);
    expect(joined.nickname).toMatch(/^牌友[A-Z0-9]{5}$/);
    expect(joined.avatar).toBe('');
    expect(app.state.profileAuthorized).toBe(false);
    expect(app.state.error).toBe('');
  });

  it('passes authorized profile directly into room entry', async () => {
    let entryOptions;
    const app = {
      state: { inviteCode: '414', nickname: '', avatarUrl: '', profileAuthorized: false, statusMessage: '', error: '' },
      enterRoom: async (options) => { entryOptions = options; },
    };
    await FourOneFourGameApp.prototype.handleUserInfoButtonResult.call(app, {
      userInfo: { nickName: '扑克大神', avatarUrl: 'https://avatar.example/poker.png' },
    });
    expect(entryOptions).toEqual({ nickname: '扑克大神', avatarUrl: 'https://avatar.example/poker.png', profileAuthorized: true });
  });

  it('fetches a missing avatar without replacing the nickname already returned by the authorization button', async () => {
    let entryOptions;
    const app = {
      state: { error: '', statusMessage: '' },
      wx: {
        getUserInfo: ({ success }) => success({ userInfo: { nickName: '备用昵称', avatarUrl: 'https://avatar.example/from-get-user-info.png' } }),
      },
      draw: () => {},
      enterRoom: async (options) => { entryOptions = options; },
    };

    await FourOneFourGameApp.prototype.handleUserInfoButtonResult.call(app, {
      userInfo: { nickName: '已授权昵称' },
    });

    expect(entryOptions).toEqual({
      nickname: '已授权昵称',
      avatarUrl: 'https://avatar.example/from-get-user-info.png',
      profileAuthorized: true,
    });
  });

  it('requests privacy consent and microphone permission before enabling voice chat', async () => {
    const calls = [];
    const app = {
      state: { error: '', statusMessage: '' },
      wx: {
        requirePrivacyAuthorize: ({ success }) => { calls.push('privacy'); success(); },
        authorize: ({ scope, success }) => { calls.push(scope); success(); },
      },
      draw: () => {},
    };

    await expect(FourOneFourGameApp.prototype.authorizeVoiceRecording.call(app)).resolves.toBe(true);
    expect(calls).toEqual(['privacy', 'scope.record']);
  });

  it('shows an actionable message when WeChat blocks recording for missing privacy configuration', async () => {
    const app = {
      state: { error: '', statusMessage: '' },
      wx: {
        requirePrivacyAuthorize: ({ fail }) => fail({ errMsg: 'start:fail please go to mp open official popup errno=1026' }),
        authorize: () => { throw new Error('must not request microphone before privacy is accepted'); },
      },
      draw: () => {},
    };

    await expect(FourOneFourGameApp.prototype.authorizeVoiceRecording.call(app)).resolves.toBe(false);
    expect(app.state.error).toMatch(/隐私保护指引中声明麦克风/);
  });

  it('uses a locally authorized avatar when an older server snapshot omits it', () => {
    const app = {
      state: { avatarUrl: 'https://avatar.example/me.png', selectedIds: [], error: '', statusMessage: '' },
      wx: { getStorageSync: () => '' },
      destroyUserInfoButton: () => {},
      stopAnimationLoop: () => {},
      setOrientation: () => {},
      draw: () => {},
    };
    const snapshot = {
      public: { roomId: '414', phase: 'lobby', players: [{ seat: 'A', nickname: '玩家' }] },
      private: { seat: 'A', hand: [] },
    };

    FourOneFourGameApp.prototype.updateSnapshot.call(app, snapshot);

    expect(app.state.snapshot.public.players[0].avatarUrl).toBe('https://avatar.example/me.png');
  });

  it('uses the same room-entry authorization action for the keyboard Go key', () => {
    const app = {
      state: { focus: 'inviteCode', inviteCode: '308' },
      wx: { hideKeyboard: () => {} },
      draw: () => {},
      handleEntryAction: () => { app.entryActionCount += 1; },
      entryActionCount: 0,
    };

    FourOneFourGameApp.prototype.onKeyboardConfirm.call(app, { value: '308' });

    expect(app.state.focus).toBe('');
    expect(app.entryActionCount).toBe(1);
  });

  it('enters as guest only when the user explicitly denies profile authorization', async () => {
    let entryOptions;
    const app = {
      state: { error: '', statusMessage: '' },
      wx: {},
      draw: () => {},
      enterRoom: async (options) => { entryOptions = options; },
    };

    await FourOneFourGameApp.prototype.handleUserInfoButtonResult.call(app, {
      errMsg: 'getUserInfo:fail auth deny',
    });

    expect(entryOptions).toMatchObject({ avatarUrl: '', profileAuthorized: false });
    expect(entryOptions.nickname).toMatch(/^牌友[A-Z0-9]{5}$/);
  });

  it('does not silently enter as guest when profile lookup fails without an explicit denial', async () => {
    let entered = false;
    const app = {
      state: { error: '', statusMessage: '' },
      wx: {},
      draw: () => {},
      enterRoom: async () => { entered = true; },
    };

    await FourOneFourGameApp.prototype.handleUserInfoButtonResult.call(app, {});

    expect(entered).toBe(false);
    expect(app.state.error).toMatch(/未能读取微信昵称头像/);
  });

  it('updates entry animation effects and renders dynamic particle and suit elements', () => {
    const renderer = mockRenderer(540, 960);
    expect(renderer.particles.length).toBe(32);
    expect(renderer.suits.length).toBe(6);
    const initialAnimTime = renderer.animTime;
    renderer.updateEntryEffects(33);
    expect(renderer.animTime).toBe(initialAnimTime + 33);
    expect(() => {
      renderer.draw({ screen: 'entry', inviteCode: '', nickname: '', statusMessage: '', error: '' });
    }).not.toThrow();
  });

  it('runs animation loop when on entry screen and stops when leaving entry', () => {
    const frames = [];
    const app = {
      animationRunning: false,
      animationId: null,
      lastFrameTime: 0,
      visible: true,
      state: { screen: 'entry' },
      renderer: {
        updateEntryEffects: () => {},
      },
      draw: () => {},
      scheduleNextFrame: (cb) => { frames.push(cb); },
      startAnimationLoop: FourOneFourGameApp.prototype.startAnimationLoop,
      stopAnimationLoop: FourOneFourGameApp.prototype.stopAnimationLoop,
    };
    app.startAnimationLoop();
    expect(frames.length).toBe(1);
    const frame = frames.shift();
    frame();
    expect(frames.length).toBe(1);
    app.stopAnimationLoop();
    expect(app.animationRunning).toBe(false);
  });
});
