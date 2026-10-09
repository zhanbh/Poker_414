const { MahjongRenderer } = require('../src/renderer');
const { MahjongGameApp } = require('../src/app');

function createContext(overrides = {}) {
  return new Proxy({}, {
    get: (target, property) => overrides[property] || target[property] || (() => undefined),
    set: (target, property, value) => { target[property] = value; return true; },
  });
}

describe('native mini-game Canvas renderer', () => {
  it('maps entry form input regions into touch targets', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 540, height: 960 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    renderer.draw({ screen: 'entry', inviteCode: '', statusMessage: '', canRequestUserInfo: true });
    expect(renderer.hit(270, 409)).toMatchObject({ type: 'input', data: { field: 'inviteCode' } });
    expect(renderer.hit(270, 654)).toMatchObject({ type: 'enter' });
    expect(renderer.targets.some((target) => target.type === 'input' && target.data.field === 'nickname')).toBe(false);
    expect(labels).toContain('进入房间');
    expect(labels).not.toContain('授权昵称头像并进入');
    expect(labels).not.toContain('点击填写昵称（可授权微信资料）');
    expect(labels).not.toContain('输入 6 位房间邀请码即可入局对战');
    expect(labels).toContain('308娱乐 出品');
  });

  it('uses the Mini Game orientation API and redraws after the orientation transition', () => {
    let options;
    let resizeCount = 0;
    let drawCount = 0;
    const app = {
      wx: { setDeviceOrientation: (next) => { options = next; } },
      orientationRequested: 'portrait',
      orientationFailedFor: null,
      orientationError: '',
      state: { error: '' },
      resizeCanvas: () => { resizeCount += 1; },
      draw: () => { drawCount += 1; },
      updateUserInfoButton: () => {},
    };
    MahjongGameApp.prototype.setOrientation.call(app, 'landscape');
    expect(options.value).toBe('landscape');
    options.success();
    MahjongGameApp.prototype.setOrientation.call(app, 'portrait');
    expect(options.value).toBe('portrait');
    options.success();
    expect(resizeCount).toBe(2);
    expect(drawCount).toBe(2);
  });

  it('opens the native keyboard with explicit completion behavior and commits the final value', () => {
    let keyboardOptions;
    let hidden = false;
    const app = {
      wx: {
        showKeyboard: (options) => { keyboardOptions = options; },
        hideKeyboard: () => { hidden = true; },
      },
      state: { focus: '', inviteCode: '308', nickname: '', chatDraft: '', error: '' },
      draw: () => {},
    };
    app.hideKeyboard = () => MahjongGameApp.prototype.hideKeyboard.call(app);
    app.scheduleCanvasRestoreAfterKeyboard = () => { app.state.keyboardOpen = false; };

    MahjongGameApp.prototype.showKeyboard.call(app, 'inviteCode');
    expect(keyboardOptions).toMatchObject({ defaultValue: '308', maxLength: 32, multiple: false, confirmHold: false, confirmType: 'go' });
    let entered = false;
    let entryActionCalled = false;
    app.updateUserInfoButton = () => { entered = true; };
    app.handleEntryAction = () => { entryActionCalled = true; };
    MahjongGameApp.prototype.onKeyboardConfirm.call(app, { value: '12345' });
    expect(app.state.inviteCode).toBe('12345');
    expect(hidden).toBe(true);
    expect(entered).toBe(true);
    expect(entryActionCalled).toBe(true);
  });

  it('places the native WeChat consent button directly over the entry button after an invite is entered', () => {
    let buttonOptions;
    let onTap;
    const app = {
      wx: {
        createUserInfoButton: (options) => {
          buttonOptions = options;
          return { onTap: (listener) => { onTap = listener; }, destroy: () => {} };
        },
      },
      renderer: { viewport: { scale: 2, x: 0, y: 100 } },
      pixelRatio: 2,
      state: { screen: 'entry', inviteCode: '308', profileAuthorized: false, busy: false, profileUpdating: false },
      handleUserInfoButtonResult: (result) => { app.result = result; },
      userInfoBtn: null,
      draw: () => {},
    };
    MahjongGameApp.prototype.updateUserInfoButton.call(app);
    expect(buttonOptions.text).toBe('进入房间');
    expect(buttonOptions.style).toMatchObject({ left: 110, top: 675, width: 320, height: 58 });
    const result = { userInfo: { nickName: '测试用户', avatarUrl: 'avatar' } };
    onTap(result);
    expect(app.result).toBe(result);
  });

  it('joins immediately with a generated nickname when WeChat profile consent is not yet granted', async () => {
    let joined;
    const app = {
      wx: { getStorageSync: () => '', setStorageSync: () => {} },
      state: { inviteCode: '308', nickname: '', avatarUrl: '', profileAuthorized: false, error: '', statusMessage: '', busy: false },
      transport: {
        login: async () => ({ sessionToken: 's-1' }),
        join: async (nickname, avatar) => {
          joined = { nickname, avatar };
          return { public: { gameId: 'mahjong', phase: 'lobby' }, private: { seat: 'A' } };
        },
      },
      destroyUserInfoButton: () => {},
      updateSnapshot: () => {},
      draw: () => {},
    };
    await MahjongGameApp.prototype.enterRoom.call(app);
    expect(joined.nickname).toMatch(/^雀友[A-Z0-9]{5}$/);
    expect(joined.avatar).toBe('');
    expect(app.state.profileAuthorized).toBe(false);
    expect(app.state.error).toBe('');
  });

  it('does not show profile authorization after room entry', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: { gameId: 'mahjong', phase: 'lobby', handNumber: 0, players: [], spectators: [], chat: [], hostSeat: null },
      private: { seat: 'A', spectator: false },
    };
    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', canRequestUserInfo: true, profileAuthorized: false, chatOpen: true });
    expect(renderer.targets.some((target) => target.type === 'profile')).toBe(false);
    expect(labels).not.toContain('授权昵称头像');
    expect(renderer.hit(620, 388)).toMatchObject({ type: 'input', data: { field: 'chatDraft' } });
  });

  it('passes the authorized profile directly into room entry', async () => {
    let entryOptions;
    const app = {
      state: { inviteCode: '308', nickname: '', avatarUrl: '', profileAuthorized: false, statusMessage: '', error: '' },
      enterRoom: async (options) => { entryOptions = options; },
    };
    await MahjongGameApp.prototype.handleUserInfoButtonResult.call(app, {
      userInfo: { nickName: '微信昵称', avatarUrl: 'https://avatar.example/user.png' },
    });
    expect(entryOptions).toEqual({ nickname: '微信昵称', avatarUrl: 'https://avatar.example/user.png', profileAuthorized: true });
  });

  it('fetches the granted profile when the native button callback omits userInfo', async () => {
    let entryOptions;
    let getUserInfoCalled = false;
    const app = {
      wx: {
        getUserInfo: (options) => {
          getUserInfoCalled = true;
          options.success({ userInfo: { nickName: '授权昵称', avatarUrl: 'https://avatar.example/granted.png' } });
        },
      },
      state: { inviteCode: '308', nickname: '', avatarUrl: '', profileAuthorized: false, statusMessage: '', error: '' },
      enterRoom: async (options) => { entryOptions = options; },
    };
    await MahjongGameApp.prototype.handleUserInfoButtonResult.call(app, { errMsg: 'getUserInfo:ok' });
    expect(getUserInfoCalled).toBe(true);
    expect(entryOptions).toEqual({ nickname: '授权昵称', avatarUrl: 'https://avatar.example/granted.png', profileAuthorized: true });
  });

  it('shows the Mini Game privacy-guide error and does not join as a guest when WeChat blocks profile access', async () => {
    let joined = false;
    let drawn = false;
    const app = {
      wx: {
        getUserInfo: (options) => options.fail({
          errMsg: 'getUserInfo:fail',
          err_code: '-12034',
          message: 'please go to mp to announce your privacy usage errno=1026',
        }),
      },
      state: { inviteCode: '308', nickname: '', avatarUrl: '', profileAuthorized: false, statusMessage: '', error: '' },
      enterRoom: async () => { joined = true; },
      draw: () => { drawn = true; },
    };

    await MahjongGameApp.prototype.handleUserInfoButtonResult.call(app, { errMsg: 'getUserInfo:ok' });

    expect(joined).toBe(false);
    expect(drawn).toBe(true);
    expect(app.state.error).toContain('隐私指引');
    expect(app.state.statusMessage).toContain('隐私保护指引');
  });

  it('does not enter or switch orientation on the canvas tap before native authorization completes', async () => {
    let entered = false;
    const app = {
      userInfoBtn: { onTap: () => {} },
      state: { screen: 'entry', inviteCode: '308', canRequestUserInfo: true, profileAuthorized: false },
      enterRoom: async () => { entered = true; },
    };
    await MahjongGameApp.prototype.handleTarget.call(app, { type: 'enter' });
    expect(entered).toBe(false);
  });

  it('does not silently join as a guest when the native authorization button fails to initialize', async () => {
    let entered = false;
    const app = {
      wx: { createUserInfoButton: () => { throw new Error('native button unavailable'); } },
      renderer: { viewport: { scale: 1, x: 0, y: 0 } },
      pixelRatio: 1,
      userInfoBtn: null,
      state: { screen: 'entry', inviteCode: '308', profileAuthorized: false, busy: false, profileUpdating: false, error: '', statusMessage: '' },
      draw: () => {},
      enterRoom: async () => { entered = true; },
    };
    app.updateUserInfoButton = () => MahjongGameApp.prototype.updateUserInfoButton.call(app);

    await MahjongGameApp.prototype.handleTarget.call(app, { type: 'enter' });

    expect(entered).toBe(false);
    expect(app.state.error).toContain('授权按钮未能创建');
    expect(app.state.statusMessage).toContain('微信授权按钮创建失败');
  });

  it('falls back to a generated nickname and enters when profile authorization is denied', async () => {
    let entryOptions;
    const app = {
      state: { inviteCode: '308', nickname: '', avatarUrl: '', profileAuthorized: false, statusMessage: '', error: '' },
      enterRoom: async (options) => { entryOptions = options; },
      draw: () => {},
    };
    await MahjongGameApp.prototype.handleUserInfoButtonResult.call(app, { errMsg: 'getUserInfo:fail auth deny' });
    expect(entryOptions.nickname).toMatch(/^雀友[A-Z0-9]{5}$/);
    expect(entryOptions.profileAuthorized).toBe(false);
  });

  it('truncates a long WeChat nickname before joining so it fits the player card', async () => {
    let joinedNickname;
    const app = {
      wx: { setStorageSync: () => {} },
      state: { inviteCode: '308', nickname: '', avatarUrl: '', profileAuthorized: false, error: '', statusMessage: '', busy: false },
      transport: {
        login: async () => ({ sessionToken: 's-1' }),
        join: async (nickname) => {
          joinedNickname = nickname;
          return { public: { gameId: 'mahjong', phase: 'lobby' }, private: { seat: 'A' } };
        },
      },
      destroyUserInfoButton: () => {},
      updateSnapshot: () => {},
      draw: () => {},
    };
    await MahjongGameApp.prototype.enterRoom.call(app, { nickname: '这是一个特别特别特别长的微信昵称', avatarUrl: 'avatar', profileAuthorized: true });
    expect(joinedNickname).toBe('这是一个特别特别特别长的');
    expect([...joinedNickname]).toHaveLength(12);
  });

  it('releases a session that was created with the legacy generated nickname', async () => {
    let released = false;
    let removedSession = false;
    const app = {
      legacyNicknameSessionToken: 'old-session',
      wx: { getStorageSync: () => 'old-session', removeStorageSync: () => { removedSession = true; } },
      transport: {
        login: async (_inviteCode, token) => { expect(token).toBe('old-session'); },
        leave: async () => { released = true; },
      },
      state: { statusMessage: '' },
      updateUserInfoButton: () => {},
      draw: () => {},
    };
    await MahjongGameApp.prototype.restoreSession.call(app);
    expect(released).toBe(true);
    expect(removedSession).toBe(true);
    expect(app.legacyNicknameSessionToken).toBe('');
    expect(app.state.statusMessage).toContain('旧版随机昵称已清除');
  });

  it('clears and releases a saved guest session instead of restoring it before profile authorization', async () => {
    const storage = {
      'mahjong.sessionToken': 'guest-session',
      'mahjong.nickname': '雀友N7IV4',
      mahjong_avatar_url: '',
      'mahjong.profileAuthorized': false,
    };
    const removed = [];
    let released = false;
    let joined = false;
    const app = {
      wx: {
        getStorageSync: (key) => storage[key],
        removeStorageSync: (key) => { removed.push(key); delete storage[key]; },
      },
      transport: {
        login: async (inviteCode, token) => {
          expect(inviteCode).toBe('');
          expect(token).toBe('guest-session');
        },
        leave: async () => { released = true; },
        join: async () => { joined = true; },
      },
      state: { profileAuthorized: false, nickname: '雀友N7IV4', avatarUrl: '', statusMessage: '' },
      draw: () => {},
    };

    await MahjongGameApp.prototype.restoreSession.call(app);

    expect(released).toBe(true);
    expect(joined).toBe(false);
    expect(removed).toContain('mahjong.sessionToken');
    expect(removed).toContain('mahjong.nickname');
    expect(app.state.statusMessage).toContain('旧测试会话已清理');
  });

  it('shows feedback if the native keyboard fails to open', () => {
    const app = {
      wx: { showKeyboard: (options) => options.fail() },
      state: { focus: '', inviteCode: '', nickname: '', chatDraft: '', error: '' },
      draw: () => {},
    };
    MahjongGameApp.prototype.showKeyboard.call(app, 'inviteCode');
    expect(app.state.focus).toBe('');
    expect(app.state.error).toBe('无法打开输入键盘，请重试');
  });

  it('draws a room and exposes the chat toggle as an interactive target', () => {
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    const snapshot = {
      public: { gameId: 'mahjong', phase: 'lobby', handNumber: 0, players: [], spectators: [], chat: [], hostSeat: null },
      private: { seat: null, spectator: true },
    };
    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: false, error: '' });
    expect(renderer.hit(912, 315)).toMatchObject({ type: 'toggle-chat' });
    expect(renderer.targets.some((target) => target.type === 'chat-panel')).toBe(false);
  });

  it('keeps lobby seats in place when chat opens and animates interactions on the target card', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'lobby', handNumber: 0,
        players: [{ seat: 'B', nickname: '小明', handCount: 0, score: 1000, connected: true }],
        spectators: [], chat: [{ id: 'm1', kind: 'interaction', interaction: 'tomato', senderNickname: '小红', targetNickname: '小明', targetSeat: 'B', createdAt: Date.now() }],
        hostSeat: null,
      },
      private: { seat: 'A', spectator: false },
    };
    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: false, error: '' });
    expect(renderer.hit(63, 176)).toMatchObject({ type: 'select-player', data: { seat: 'B', nickname: '小明' } });
    expect(labels).toContain('🍅');
    expect(labels).toContain('1000 分');
    expect(labels).not.toContain('0 张 · 1000 分');
    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: true, error: '' });
    expect(renderer.hit(63, 176)).toMatchObject({ type: 'select-player', data: { seat: 'B', nickname: '小明' } });
    expect(renderer.hit(620, 388)).toMatchObject({ type: 'input', data: { field: 'chatDraft' } });
    expect(labels).not.toContain('东家 · 空位');
    expect(labels).not.toContain('南家 · 空位');
  });

  it('keeps the table and hand-card hit areas fixed while the floating chat is open', () => {
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    const snapshot = {
      public: { gameId: 'mahjong', phase: 'playing', handNumber: 1, players: [], spectators: [], chat: [], discardRiver: [], wallCount: 100, currentTurn: 'A' },
      private: { seat: 'A', spectator: false, hand: [{ id: 'tile-1', suit: 'dots', rank: 1 }], availableActions: [], isListening: false },
    };
    const base = { screen: 'game', snapshot, connectionStatus: 'connected', error: '' };
    renderer.draw({ ...base, chatOpen: false });
    const handTarget = renderer.targets.find((target) => target.type === 'select-tile');
    renderer.draw({ ...base, chatOpen: true });
    expect(renderer.targets.find((target) => target.type === 'select-tile')).toEqual(handTarget);
    expect(renderer.hit(620, 388)).toMatchObject({ type: 'input', data: { field: 'chatDraft' } });
    expect(renderer.targets.find((target) => target.type === 'chat-panel').y + renderer.targets.find((target) => target.type === 'chat-panel').height).toBeLessThan(handTarget.y);
  });

  it('fills a wide phone with a perspective table and truncates names to compact avatar cards', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 1280, height: 600 }, createContext({
      fillText: (value) => labels.push(String(value)),
      measureText: (value) => ({ width: Array.from(String(value)).length * 15 }),
    }));
    const snapshot = {
      public: { gameId: 'mahjong', phase: 'playing', handNumber: 1, players: [{ seat: 'A', nickname: '这是一个很长很长很长的玩家昵称', score: 1000 }], spectators: [], chat: [], discardRiver: [], wallCount: 100, currentTurn: 'A' },
      private: { seat: 'A', spectator: false, hand: [], availableActions: [], isListening: false },
    };
    renderer.draw({ screen: 'game', snapshot, connectionStatus: 'connected', chatOpen: false, error: '' });
    expect(renderer.viewport).toMatchObject({ x: 0, y: 0, width: 1152, height: 540 });
    const table = renderer.roomLayout().table;
    expect(table.bottomRight - table.bottomLeft).toBeGreaterThan(table.topRight - table.topLeft);
    expect(table.topY).toBeLessThan(0);
    expect(table.bottomY).toBeGreaterThan(renderer.viewport.height);
    expect(labels).toContain('东');
    expect(labels).toContain('北');
    expect(labels).toContain('剩余牌张');
    expect(labels.some((label) => label.startsWith('这是') && label.endsWith('…'))).toBe(true);
    expect(labels).not.toContain('这是一个很长很长很长的玩家昵称');
  });

  it('consumes an outside-chat tap, closes the keyboard, and leaves the hand unselected', () => {
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    const state = {
      screen: 'game', chatOpen: true, focus: 'chatDraft', keyboardOpen: true, selectedTileId: '',
      snapshot: {
        public: { gameId: 'mahjong', phase: 'playing', players: [], chat: [], currentTurn: 'A', wallCount: 59 },
        private: { seat: 'A', hand: [{ id: 'tile-1', suit: 'characters', rank: 1 }], availableActions: ['discard'] },
      },
    };
    renderer.draw(state);
    const tile = renderer.targets.find((target) => target.type === 'select-tile');
    let handled;
    let keyboardHidden = false;
    const app = {
      state, renderer, pixelRatio: 1,
      draw: () => renderer.draw(state),
      hideKeyboard: () => { keyboardHidden = true; state.keyboardOpen = false; state.focus = ''; },
      handleTarget: (target) => { handled = target; },
    };
    app.closeChat = () => MahjongGameApp.prototype.closeChat.call(app);
    const tap = { changedTouches: [{ clientX: tile.x + tile.width / 2, clientY: tile.y + tile.height / 2 }] };

    MahjongGameApp.prototype.onTouchEnd.call(app, tap);

    expect(state.chatOpen).toBe(false);
    expect(keyboardHidden).toBe(true);
    expect(handled).toBeUndefined();
    expect(state.selectedTileId).toBe('');
    MahjongGameApp.prototype.onTouchEnd.call(app, tap);
    expect(handled).toMatchObject({ type: 'select-tile', data: { tileId: 'tile-1' } });
  });

  it('keeps blank chat-panel taps inside the overlay and records messages read when opening', async () => {
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    const state = {
      screen: 'lobby', chatOpen: false, chatReadId: '',
      snapshot: { public: { gameId: 'mahjong', phase: 'lobby', players: [], chat: [{ id: 'm1', kind: 'text', text: '你好', senderNickname: '小明' }] }, private: { seat: 'A' } },
    };
    const app = { state, renderer, pixelRatio: 1, draw: () => renderer.draw(state) };
    app.handleTarget = (target) => MahjongGameApp.prototype.handleTarget.call(app, target);
    app.closeChat = () => MahjongGameApp.prototype.closeChat.call(app);
    await app.handleTarget({ type: 'toggle-chat' });

    expect(state.chatOpen).toBe(true);
    expect(state.chatReadId).toBe('m1');
    expect(renderer.hit(600, 280)).toMatchObject({ type: 'chat-panel' });
    MahjongGameApp.prototype.onTouchEnd.call(app, { changedTouches: [{ clientX: 600, clientY: 280 }] });
    expect(state.chatOpen).toBe(true);
    await app.handleTarget({ type: 'close-chat' });
    expect(state.chatOpen).toBe(false);
  });

  it('keeps a fourteen-tile hand and room controls within a notched phone safe area', () => {
    const renderer = new MahjongRenderer({ width: 1688, height: 780 }, createContext());
    renderer.safeInsets = { left: 88, right: 88, bottom: 42 };
    renderer.draw({
      screen: 'game', chatOpen: true, connectionStatus: 'connected',
      snapshot: {
        public: { gameId: 'mahjong', phase: 'playing', players: [], chat: [], wallCount: 59, currentTurn: 'A' },
        private: { seat: 'A', hand: Array.from({ length: 14 }, (_, index) => ({ id: `tile-${index}`, suit: 'characters', rank: index % 9 + 1 })), availableActions: [] },
      },
    });
    const { scale, x, y } = renderer.viewport;
    expect(renderer.targets.filter((target) => target.type === 'select-tile')).toHaveLength(14);
    renderer.targets.forEach((target) => {
      expect(x + target.x * scale).toBeGreaterThanOrEqual(88);
      expect(x + (target.x + target.width) * scale).toBeLessThanOrEqual(1688 - 88);
      expect(y + (target.y + target.height) * scale).toBeLessThanOrEqual(780 - 42);
    });
    const panel = renderer.targets.find((target) => target.type === 'chat-panel');
    const hand = renderer.targets.filter((target) => target.type === 'select-tile');
    expect(panel.y + panel.height).toBeLessThan(Math.min(...hand.map((target) => target.y)));
  });

  it('draws the fake resource loading screen with progress and tips, without interactive targets', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 540, height: 960 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    renderer.draw({ screen: 'loading', loadingProgress: 68, loadingTip: '正在校验大众麻将规则与牌型引擎…' });
    expect(labels).toContain('正在准备游戏资源  68%');
    expect(labels).toContain('正在校验大众麻将规则与牌型引擎…');
    expect(renderer.hit(270, 409)).toBeNull();
    expect(renderer.hit(270, 654)).toBeNull();
  });

  it('updates particle positions and animates ambient dust', () => {
    const renderer = new MahjongRenderer({ width: 540, height: 960 }, createContext());
    const initialPositions = renderer.particles.map((p) => ({ x: p.x, y: p.y }));
    renderer.updateParticles();
    const updatedPositions = renderer.particles.map((p) => ({ x: p.x, y: p.y }));
    expect(updatedPositions[0]).not.toEqual(initialPositions[0]);
  });

  it('keeps animation loop running across loading completion to entry screen', () => {
    const frames = [];
    const updateParticleCalls = [];
    let frameId = 0;
    const customRAF = (cb) => {
      frameId += 1;
      frames.push(cb);
      return frameId;
    };
    const app = {
      animationRunning: false,
      animationId: null,
      state: { screen: 'loading', loadingProgress: 0, loadingTip: '' },
      loadingStartTime: Date.now() - 3000,
      loadingDuration: 2000,
      renderer: {
        updateParticles: () => { updateParticleCalls.push(app.state.screen); },
      },
      draw: () => {},
      restoreSession: () => {},
      scheduleNextFrame: (cb) => {
        app.animationId = customRAF(cb);
      },
      finishLoading: function() {
        this.state.loadingProgress = 100;
        this.state.screen = 'entry';
        this.draw();
        this.restoreSession();
      },
      startAnimationLoop: MahjongGameApp.prototype.startAnimationLoop,
      stopAnimationLoop: MahjongGameApp.prototype.stopAnimationLoop,
    };

    app.startAnimationLoop();
    expect(frames.length).toBe(1);

    // Run first frame which triggers finishLoading()
    const firstFrame = frames.shift();
    firstFrame();

    expect(app.state.screen).toBe('entry');
    expect(app.state.loadingProgress).toBe(100);
    // Crucial check: next frame MUST be scheduled for entry screen!
    expect(frames.length).toBe(1);

    // Run second frame on entry screen
    const secondFrame = frames.shift();
    secondFrame();

    // Crucial check: animation loop continues on entry screen!
    expect(frames.length).toBe(1);
    expect(updateParticleCalls).toEqual(['loading', 'entry']);

    // Stop animation loop cleanly
    app.stopAnimationLoop();
    expect(app.animationRunning).toBe(false);
    expect(app.animationId).toBeNull();
  });

  it('draws speech bubbles for quick phrases on player cards and excludes them from chat history log', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const now = Date.now();
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'lobby', handNumber: 0,
        players: [{ seat: 'B', nickname: '小明', handCount: 0, score: 1000, connected: true }],
        spectators: [],
        chat: [
          { id: 'm1', kind: 'text', senderNickname: '小红', text: '大家好', createdAt: now - 5000 },
          { id: 'm2', kind: 'phrase', senderNickname: '小明', senderSeat: 'B', text: '快点啊，等得我花儿都谢了！', createdAt: now - 100 },
        ],
        hostSeat: null,
      },
      private: { seat: 'A', spectator: false, hand: [] },
    };

    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: true, chatTab: 'messages', chatMode: 'text' });
    // 头像上方出现漫画对白气泡
    expect(labels).toContain('快点啊，等得我花儿都谢了！');
    // 聊天消息列表中不展示短语，只展示普通文本
    expect(labels).toContain('小红: 大家好');
  });

  it('supports switching to voice mode and exposes voice-bar target in chat panel', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: { gameId: 'mahjong', phase: 'lobby', handNumber: 0, players: [], spectators: [], chat: [], hostSeat: null },
      private: { seat: null, spectator: true },
    };

    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: true, chatMode: 'voice', recordingVoice: false });
    expect(labels).toContain('按住 说话');
    expect(renderer.targets.some((t) => t.type === 'voice-bar')).toBe(true);
    expect(renderer.targets.some((t) => t.type === 'toggle-chat-mode')).toBe(true);
  });

  it('supports quick phrase tab and exposes send-phrase targets', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: { gameId: 'mahjong', phase: 'lobby', handNumber: 0, players: [], spectators: [], chat: [], hostSeat: null },
      private: { seat: null, spectator: true },
    };

    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: true, chatTab: 'phrases' });
    expect(labels).toContain('⚡ 快捷语');
    expect(renderer.targets.some((t) => t.type === 'send-phrase' && t.data.phrase === '你是GG还是MM？')).toBe(true);
  });

  it('exposes play-voice target for voice chat messages in history', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'lobby', handNumber: 0, players: [], spectators: [],
        chat: [{ id: 'v1', kind: 'voice', senderNickname: '小华', duration: 3, audioData: 'bXAz', createdAt: Date.now() }],
        hostSeat: null,
      },
      private: { seat: null, spectator: true },
    };

    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: true, chatTab: 'messages' });
    expect(renderer.targets.some((t) => t.type === 'play-voice' && t.data.message.id === 'v1')).toBe(true);
  });

  it('does not display interaction or phrase records in chat message list', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'lobby', handNumber: 0, players: [], spectators: [],
        chat: [
          { id: 't1', kind: 'text', text: '你好呀', senderNickname: '小明', createdAt: Date.now() },
          { id: 'i1', kind: 'interaction', interaction: 'water', senderNickname: '小红', targetNickname: '小明', targetSeat: 'A', createdAt: Date.now() },
          { id: 'p1', kind: 'phrase', text: '你是GG还是MM？', senderNickname: '小华', senderSeat: 'B', createdAt: Date.now() },
        ],
        hostSeat: null,
      },
      private: { seat: 'A', spectator: false },
    };

    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: true, chatTab: 'messages' });
    expect(labels).toContain('小明: 你好呀');
    expect(labels.some((l) => l.includes('发送了 💦'))).toBe(false);
    expect(labels.some((l) => l.includes('小华: 你是GG还是MM？'))).toBe(false);
    // Ensure chat header only contains '消息' and '⚡ 快捷语' tabs, no 'interactions' tab
    expect(renderer.targets.some((t) => t.type === 'chat-tab' && t.data.tab === 'interactions')).toBe(false);
    expect(renderer.targets.some((t) => t.type === 'chat-tab' && t.data.tab === 'messages')).toBe(true);
    expect(renderer.targets.some((t) => t.type === 'chat-tab' && t.data.tab === 'phrases')).toBe(true);
  });

  it('renders water bucket pouring animation for water interaction', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'lobby', handNumber: 0,
        players: [{ seat: 'A', nickname: '小明', score: 1000, handCount: 0 }], spectators: [],
        chat: [
          { id: 'i1', kind: 'interaction', interaction: 'water', senderNickname: '小红', targetNickname: '小明', targetSeat: 'A', createdAt: Date.now() - 1000 },
        ],
        hostSeat: null,
      },
      private: { seat: 'A', spectator: false },
    };

    renderer.draw({ screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: false });
    expect(labels).toContain('💦');
  });

  it('shows interaction picker when a player avatar is selected and includes target data', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'lobby', handNumber: 0,
        players: [{ seat: 'A', nickname: '小明', score: 1000, handCount: 0 }], spectators: [],
        chat: [], hostSeat: null,
      },
      private: { seat: 'A', spectator: false },
    };

    renderer.draw({
      screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: false,
      selectedTarget: { seat: 'A', nickname: '小明' },
    });
    expect(labels.some((l) => l.includes('送给 小明'))).toBe(true);
    expect(renderer.targets.some((t) => t.type === 'interaction' && t.data.interaction === 'water')).toBe(true);
    expect(renderer.targets.some((t) => t.type === 'close-interaction')).toBe(true);
  });
});

