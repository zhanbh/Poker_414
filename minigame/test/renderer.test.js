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
    expect(renderer.hit(270, 589)).toMatchObject({ type: 'enter' });
    expect(renderer.targets.some((target) => target.type === 'input')).toBe(false);
    expect(labels).toContain('进入房间');
    expect(labels).toContain('308娱乐 · 微信小游戏');
    expect(labels).toContain('🛡️ 体验版 · 体验成员专属通道');
    expect(labels).toContain('⚡ 已配置体验名单，无需输入邀请码直接入局');
    expect(labels).not.toContain('414 麻将');
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

  it('recovers field on keyboard confirm even if onKeyboardComplete cleared focus prematurely on entry screen', () => {
    let entryActionCalled = false;
    const app = {
      state: { focus: '', screen: 'entry', inviteCode: '' },
      lastFocusedField: 'inviteCode',
      hideKeyboard: () => {},
      updateUserInfoButton: () => {},
      handleEntryAction: () => { entryActionCalled = true; },
    };
    MahjongGameApp.prototype.onKeyboardConfirm.call(app, { value: '308' });
    expect(app.state.inviteCode).toBe('308');
    expect(entryActionCalled).toBe(true);
  });

  it('places the native WeChat consent button directly over the entry button without needing invite input', () => {
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
      state: { screen: 'entry', inviteCode: '', profileAuthorized: false, busy: false, profileUpdating: false },
      handleUserInfoButtonResult: (result) => { app.result = result; },
      userInfoBtn: null,
      draw: () => {},
    };
    MahjongGameApp.prototype.updateUserInfoButton.call(app);
    expect(buttonOptions.text).toBe('进入房间');
    expect(buttonOptions.style).toMatchObject({ left: 110, top: 610, width: 320, height: 58 });
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

  it('preserves the avatar when listening and marks the hand instead', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const state = {
      selectedTarget: null,
      snapshot: {
        public: {
          phase: 'playing',
          players: [{ seat: 'B', nickname: '听牌玩家', score: 1000, isListening: true, melds: [], discards: [] }],
          chat: [],
        },
        private: { seat: 'A' },
      },
    };

    renderer.drawPlayerCard(state, 'B', 120, 120, 94, 114);

    expect(labels).not.toContain('听');
    const cues = [];
    renderer.drawArtText = (...args) => cues.push(args);
    renderer.drawActionCallouts(state);
    expect(cues).toEqual([['听', 0, 0, 46]]);
  });

  it('shows opponents’ faces to a listening player when their hands are included in the private snapshot', () => {
    const backs = [];
    const faces = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    renderer.drawStandingBack = (...args) => backs.push(args);
    renderer.drawProjectedTile = (...args) => faces.push(args);
    const state = {
      snapshot: {
        public: { players: [{ seat: 'B', handCount: 2 }] },
        private: {
          seat: 'A',
          isListening: true,
          opponentHands: [{ seat: 'B', nickname: '对手', hand: [
            { id: 'secret-tile-1', suit: 'characters', rank: 9 },
            { id: 'secret-tile-2', suit: 'characters', rank: 8 },
          ] }],
        },
      },
    };

    renderer.drawOpponentHands(state, renderer.roomLayout().table);

    expect(backs).toHaveLength(0);
    expect(faces).toHaveLength(2);
  });

  it('keeps opponents hidden for non-listening players even if a stale snapshot has their hands', () => {
    const backs = [];
    const faces = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    renderer.drawStandingBack = (...args) => backs.push(args);
    renderer.drawProjectedTile = (...args) => faces.push(args);
    const state = {
      snapshot: {
        public: { players: [{ seat: 'B', handCount: 2 }] },
        private: {
          seat: 'A',
          isListening: false,
          opponentHands: [{ seat: 'B', nickname: '对手', hand: [{ id: 'secret-tile', suit: 'characters', rank: 9 }] }],
        },
      },
    };

    renderer.drawOpponentHands(state, renderer.roomLayout().table);

    expect(backs).toHaveLength(2);
    expect(faces).toHaveLength(0);
  });

  it.each([720, 960, 1169])('uses readable vertical face columns and clear nearby avatars at width %s', (width) => {
    const renderer = new MahjongRenderer({ width, height: 540 }, createContext());
    renderer.viewport.width = width;
    const tiles = Array.from({ length: 14 }, (_, i) => ({ id: `tile-${i}`, suit: 'dots', rank: i % 9 + 1 }));
    const faces = [];
    renderer.drawProjectedTile = (...args) => faces.push(args);
    const state = { snapshot: {
      public: { players: ['B', 'C', 'D'].map((seat) => ({ seat, handCount: 14 })) },
      private: { seat: 'A', isListening: true, opponentHands: ['B', 'C', 'D'].map((seat) => ({ seat, hand: tiles })) },
    } };
    const { table, cards } = renderer.roomLayout();
    renderer.drawOpponentHands(state, table);
    expect(faces).toHaveLength(42);
    faces.forEach(([, , u, v, du, dv, rotation], index) => {
      const corners = renderer.planeRect(table, u, v, du, dv);
      const faceLeft = Math.min(...corners.map((p) => p[0]));
      const faceRight = Math.max(...corners.map((p) => p[0]));
      const faceTop = Math.min(...corners.map((p) => p[1]));
      const faceBottom = Math.max(...corners.map((p) => p[1]));
      if (index < 14 || index >= 28) {
        expect(Math.abs(rotation)).toBe(Math.PI / 2);
        const faceWidth = renderer.project(table, u + du, v)[0] - renderer.project(table, u, v)[0];
        expect(faceWidth / (faceBottom - faceTop)).toBeCloseTo(1.5);
        expect(faceWidth).toBeGreaterThan(20);
      }
      const card = cards[index < 14 ? 1 : index < 28 ? 2 : 3];
      const overlaps = card.x < faceRight && card.x + card.width > faceLeft
        && card.y < faceBottom && card.y + card.height > faceTop;
      expect(overlaps).toBe(false);
    });
    const topHandEnd = renderer.project(table, 0.5 - 14 * 0.019 + 13 * 0.038 + 0.037, 0.133)[0];
    expect(cards[2].x).toBeGreaterThan(topHandEnd);
    expect(cards[2].x + cards[2].width).toBeLessThanOrEqual(width - renderer.roomLayout().rightInset);
  });

  it('restores permanent listening cues from the snapshot without transition events and clears them next hand', () => {
    const cues = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    renderer.drawArtText = (...args) => cues.push(args);
    const state = { snapshot: { public: { players: ['A', 'B', 'C', 'D'].map((seat) => ({ seat, handCount: 13, isListening: true })) },
      private: { seat: 'A', hand: [] } }, actionCallouts: [] };
    renderer.drawActionCallouts(state);
    expect(cues).toHaveLength(4);
    expect(cues.every((cue) => cue[0] === '听')).toBe(true);
    cues.length = 0;
    state.actionCallouts = [{ seat: 'B', kind: 'listen', text: '听', startTime: Date.now() - 10000, duration: 1500 }];
    renderer.drawActionCallouts(state);
    expect(cues).toHaveLength(4); // No expired transition, flicker or duplicate marker.
    cues.length = 0;
    state.snapshot.public.players.forEach((player) => { player.isListening = false; });
    renderer.drawActionCallouts(state);
    expect(cues).toHaveLength(0);
  });

  it('keeps the listening avatar image identical and does not draw a red flame badge', () => {
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    const avatars = [];
    const labels = [];
    renderer.drawAvatar = (...args) => avatars.push(args);
    renderer.text = (...args) => labels.push(args[0]);
    const player = { seat: 'D', nickname: '玩家四', score: 1000, avatarUrl: 'https://example.test/avatar.png', isListening: false };
    const state = { snapshot: { public: { players: [player], chat: [], phase: 'playing' }, private: { seat: 'A' } } };
    const card = renderer.roomLayout().cards[3];
    renderer.drawPlayerCard(state, 'D', card.x, card.y, card.width, card.height);
    player.isListening = true;
    renderer.drawPlayerCard(state, 'D', card.x, card.y, card.width, card.height);
    expect(avatars[1]).toEqual(avatars[0]);
    expect(labels).not.toContain('听');
  });

  it('draws bundled proportional Kaiti outlines with solid gold instead of platform-dependent text gradients', () => {
    const points = [];
    const colors = [];
    const ctx = createContext({
      fillText: () => { throw new Error('interaction glyphs must not depend on system fonts'); },
      createLinearGradient: () => { throw new Error('do not use gradient text'); },
      moveTo: (...args) => points.push(args),
      fill: () => colors.push(ctx.fillStyle),
    });
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, ctx);
    renderer.drawArtText('听', 0, 0, 46);
    const original = points.splice(0);
    renderer.drawArtText('听', 0, 0, 92);
    expect(points).toHaveLength(original.length);
    points.forEach((point, i) => {
      expect(point[0]).toBeCloseTo(original[i][0] * 2);
      expect(point[1]).toBeCloseTo(original[i][1] * 2);
    });
    ['吃', '碰', '杠', '胡', '过', '出', '平和', '自摸', '宝中宝', '大风', '对宝'].forEach((text) => renderer.drawArtText(text, 0, 0, 46));
    expect(colors.every((color) => color === '#ffda72')).toBe(true);
  });

  it('shows a detailed Mahjong settlement ledger and lets the host advance', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const state = {
      snapshot: {
        public: {
          handNumber: 3,
          hostSeat: 'A',
          players: [
            { seat: 'A', nickname: '玩家甲', score: 1030 },
            { seat: 'B', nickname: '玩家乙', score: 990 },
            { seat: 'C', nickname: '玩家丙', score: 990 },
            { seat: 'D', nickname: '玩家丁', score: 990 },
          ],
          settlement: {
            type: 'self-draw', winnerSeat: 'A', winnerNickname: '玩家甲', winPattern: 'standard', baseScore: 5,
            payments: { A: 30, B: -10, C: -10, D: -10 },
            transfers: [
              { from: 'B', to: 'A', fan: 2, amount: 10 },
              { from: 'C', to: 'A', fan: 2, amount: 10 },
              { from: 'D', to: 'A', fan: 2, amount: 10 },
            ],
          },
        },
        private: { seat: 'A', spectator: false },
      },
    };

    renderer.drawSettlement(state);

    expect(labels).toContain('第 3 局 · 本局结算');
    expect(labels).toContain('玩家甲 胡牌 · 自摸');
    expect(labels).toContain('玩家甲 · 胡牌');
    expect(labels).toContain('查看牌局');
    expect(labels).toContain('开始下一局');
    expect(labels).toContain('离开');
    expect(renderer.targets.some((target) => target.type === 'review-table')).toBe(true);
    expect(renderer.targets.some((target) => target.type === 'command' && target.data.action === 'ready')).toBe(true);
    expect(renderer.targets.some((target) => target.type === 'leave')).toBe(true);
    expect(renderer.targets.some((target) => target.type === 'toggle-settlement-help')).toBe(true);
    expect(renderer.hit(100, 10)).toMatchObject({ type: 'settlement-block' });
    expect(renderer.hit(24, 31)).toMatchObject({ type: 'leave' });

    // When settlement help is open, scoring rules modal is rendered
    labels.length = 0;
    renderer.targets = [];
    renderer.drawSettlement({ ...state, settlementHelpOpen: true });
    expect(labels).toContain('📖 5 10 20（520）计分规则说明');
    expect(labels).toContain('底分 5 分 · 阶梯翻番制');
    expect(labels).toContain('平和点炮 · 1番');
    expect(labels).toContain('自摸/夹 · 2番');
    expect(labels).toContain('摸宝/夹自摸 · 4番');
    expect(labels).toContain('对宝/宝夹 · 6/8番');
    expect(labels).toContain('宝中宝 · 16番');
    expect(labels).toContain('我知道了');
    expect(renderer.targets.some((target) => target.type === 'close-settlement-help')).toBe(true);

    // When reviewing table, settlement dialog is hidden and returns floating banner
    renderer.targets = [];
    labels.length = 0;
    renderer.drawSettlement({ ...state, reviewingTable: true });
    expect(labels).toContain('正在复盘牌局 · 查看玩家明牌');
    expect(labels).toContain('返回结算');
    expect(renderer.targets.some((target) => target.type === 'return-settlement')).toBe(true);

    // When ready, reviewing table banner reflects ready status
    labels.length = 0;
    state.snapshot.public.players[0].ready = true;
    renderer.drawSettlement({ ...state, reviewingTable: true });
    expect(labels).toContain('已准备 · 等待其他玩家就绪…');

    // And settlement modal offers '返回牌桌' instead of '已准备 (等待他人)'
    labels.length = 0;
    renderer.targets = [];
    renderer.drawSettlement(state);
    expect(labels).toContain('返回牌桌');
    expect(labels).not.toContain('已准备 (等待他人)');
    expect(renderer.targets.some((target) => target.type === 'review-table')).toBe(true);

    // On the game table, settled phase renders '已准备' badge on player card
    labels.length = 0;
    renderer.drawPlayerCard({ ...state, snapshot: { ...state.snapshot, public: { ...state.snapshot.public, phase: 'settled' } } }, 'A', 20, 200, 94, 114);
    expect(labels).toContain('已准备');
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
      state: { screen: 'entry', inviteCode: '', profileAuthorized: false, busy: false, profileUpdating: false, error: '', statusMessage: '' },
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

  it('starts an interaction animation from the sender seat even when only the sender nickname is available', () => {
    const translations = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({
      translate: (x, y) => translations.push([x, y]),
    }));
    const snapshot = {
      public: {
        players: [
          { seat: 'A', nickname: '雀友A' },
          { seat: 'D', nickname: '雀友D' },
        ],
        chat: [],
      },
      private: { seat: 'A' },
    };
    const targetCard = renderer.roomLayout().cards[3];
    renderer.drawInteractionEffect({ snapshot, nickname: '雀友A' }, {
      kind: 'interaction', interaction: 'tomato', senderNickname: '雀友A', targetSeat: 'D', createdAt: Date.now(),
    }, 'D', targetCard.x, targetCard.y, targetCard.width);

    const senderCard = renderer.roomLayout().cards[0];
    expect(translations[0]).toEqual([senderCard.x + senderCard.width / 2, senderCard.y + 32]);
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
      getTouchPoint: MahjongGameApp.prototype.getTouchPoint,
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
    const app = {
      state, renderer, pixelRatio: 1,
      getTouchPoint: MahjongGameApp.prototype.getTouchPoint,
      draw: () => renderer.draw(state),
    };
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

  it('deselects a tile on a later second tap but discards on a rapid double tap', async () => {
    const discarded = [];
    const app = {
      state: {
        selectedTileId: '',
        snapshot: { private: { availableActions: ['discard'], isListening: false } },
      },
      draw: () => {},
      lastTileTap: null,
      runCommand: async (...args) => discarded.push(args),
    };
    const target = { type: 'select-tile', data: { tileId: 'tile-1' } };

    await MahjongGameApp.prototype.handleTarget.call(app, target);
    expect(app.state.selectedTileId).toBe('tile-1');
    app.lastTileTap.at = Date.now() - 1000;
    await MahjongGameApp.prototype.handleTarget.call(app, target);
    expect(app.state.selectedTileId).toBe('');
    expect(discarded).toHaveLength(0);

    await MahjongGameApp.prototype.handleTarget.call(app, target);
    await MahjongGameApp.prototype.handleTarget.call(app, target);
    expect(app.state.selectedTileId).toBe('');
    expect(discarded).toEqual([['discard', { tileId: 'tile-1' }]]);
  });

  it('keeps the room and session token after repeated TLS failures instead of treating them as expired', async () => {
    const storage = { 'mahjong.sessionToken': 'session-1', 'mahjong.nickname': '雀友A' };
    const removed = [];
    const oldSnapshot = { public: { gameId: 'mahjong', phase: 'settled' }, private: { seat: 'A' } };
    let redraws = 0;
    const app = {
      wx: {
        getStorageSync: (key) => storage[key],
        removeStorageSync: (key) => { removed.push(key); delete storage[key]; },
      },
      transport: { login: async () => { throw new Error('open fail: _code:8,_msg:TLS handshake failed'); } },
      state: { screen: 'game', snapshot: oldSnapshot, connectionStatus: 'disconnected', nickname: '雀友A', avatarUrl: '', error: '', statusMessage: '' },
      recoveryAttempt: 3,
      recovering: false,
      leaving: false,
      sessionReplaced: false,
      visible: true,
      draw: () => { redraws += 1; },
    };

    await MahjongGameApp.prototype.recoverRoom.call(app);

    expect(app.state.screen).toBe('game');
    expect(app.state.snapshot).toBe(oldSnapshot);
    expect(storage['mahjong.sessionToken']).toBe('session-1');
    expect(removed).toEqual([]);
    expect(app.state.error).toContain('实时连接中断');
    expect(redraws).toBeGreaterThan(0);
  });

  it('clears the saved session only when the server explicitly reports an expired session', async () => {
    const removed = [];
    const app = {
      wx: {
        getStorageSync: (key) => ({ 'mahjong.sessionToken': 'expired-session', 'mahjong.nickname': '雀友A' })[key],
        removeStorageSync: (key) => removed.push(key),
      },
      transport: { login: async () => { throw new Error('会话无效或已过期'); } },
      state: { screen: 'game', snapshot: { public: { gameId: 'mahjong' } }, connectionStatus: 'disconnected', nickname: '雀友A', avatarUrl: '', error: '', statusMessage: '' },
      recoveryAttempt: 0,
      recovering: false,
      leaving: false,
      sessionReplaced: false,
      visible: true,
      draw: () => {},
      setOrientation: () => {},
      startAnimationLoop: () => {},
      updateUserInfoButton: () => {},
    };

    await MahjongGameApp.prototype.recoverRoom.call(app);

    expect(removed).toContain('mahjong.sessionToken');
    expect(app.state.screen).toBe('entry');
    expect(app.state.snapshot).toBeNull();
  });

  it('discards a hand tile when it is dragged onto the table', () => {
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    const state = {
      screen: 'game', chatOpen: false, keyboardOpen: false, busy: false,
      snapshot: {
        public: { gameId: 'mahjong', phase: 'playing', players: [], chat: [], currentTurn: 'A', wallCount: 59 },
        private: { seat: 'A', hand: [{ id: 'tile-1', suit: 'characters', rank: 1 }], availableActions: ['discard'], isListening: false },
      },
    };
    const commands = [];
    const app = {
      state, renderer, pixelRatio: 1, tileGesture: null, lastTileTap: null,
      getTouchPoint: MahjongGameApp.prototype.getTouchPoint,
      isPointOnTable: MahjongGameApp.prototype.isPointOnTable,
      draw: () => renderer.draw(state),
      runCommand: (...args) => commands.push(args),
    };
    renderer.draw(state);
    const tile = renderer.targets.find((target) => target.type === 'select-tile');
    MahjongGameApp.prototype.onTouchStart.call(app, {
      changedTouches: [{ clientX: tile.x + tile.width / 2, clientY: tile.y + tile.height / 2 }],
    });
    MahjongGameApp.prototype.onTouchMove.call(app, { touches: [{ clientX: 480, clientY: 250 }] });
    expect(state.draggedTile).toMatchObject({ tileId: 'tile-1', x: 480, y: 250 });
    MahjongGameApp.prototype.onTouchEnd.call(app, { changedTouches: [{ clientX: 480, clientY: 250 }] });

    expect(commands).toEqual([['discard', { tileId: 'tile-1' }]]);
    expect(state.draggedTile).toBeNull();
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

  it('shows interaction picker when another player is selected and includes target data', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'lobby', handNumber: 0,
        players: [
          { seat: 'A', nickname: '小明', score: 1000, handCount: 0 },
          { seat: 'B', nickname: '小华', score: 1000, handCount: 0 },
        ],
        spectators: [],
        chat: [], hostSeat: null,
      },
      private: { seat: 'A', spectator: false },
    };

    renderer.draw({
      screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: false,
      selectedTarget: { seat: 'B', nickname: '小华' },
    });
    expect(labels.some((l) => l.includes('送给 小华'))).toBe(true);
    expect(renderer.targets.some((t) => t.type === 'interaction' && t.data.interaction === 'water')).toBe(true);
    expect(renderer.targets.some((t) => t.type === 'close-interaction')).toBe(true);
  });

  it('does not allow self-interaction target on own player card or show picker for oneself', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'lobby', handNumber: 0,
        players: [
          { seat: 'A', nickname: '小明', score: 1000, handCount: 0 },
          { seat: 'B', nickname: '小华', score: 1000, handCount: 0 },
        ],
        spectators: [],
        chat: [], hostSeat: null,
      },
      private: { seat: 'A', spectator: false },
    };

    renderer.draw({
      screen: 'lobby', snapshot, connectionStatus: 'connected', chatOpen: false,
      selectedTarget: { seat: 'A', nickname: '小明' },
    });
    // Own card must not have select-player target
    const selectPlayerTargets = renderer.targets.filter((t) => t.type === 'select-player');
    expect(selectPlayerTargets.some((t) => t.data.seat === 'A')).toBe(false);
    expect(selectPlayerTargets.some((t) => t.data.seat === 'B')).toBe(true);
    // Picker must not open for self
    expect(labels.some((l) => l.includes('送给 小明'))).toBe(false);
    expect(renderer.targets.some((t) => t.type === 'interaction')).toBe(false);
  });

  it('dynamically reveals ting action button and winning wait tiles preview when selecting a tile that can enter ting', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'playing', handNumber: 1, currentTurn: 'A', awaitingDiscard: true,
        players: [{ seat: 'A', nickname: '我', score: 1000, handCount: 14, isListening: false }],
        spectators: [], chat: [],
      },
      private: {
        seat: 'A', spectator: false,
        hand: [
          { id: 't-1', suit: 'characters', rank: 1, label: '一万' },
          { id: 't-2', suit: 'characters', rank: 2, label: '二万' },
        ],
        listenTileIds: ['t-1'],
        listenOptions: [
          {
            discardTileId: 't-1',
            waits: [{ id: 'w-1', suit: 'characters', rank: 3, label: '三万' }],
          },
        ],
        availableActions: ['discard', 'listen'],
      },
    };

    renderer.draw({
      screen: 'room', snapshot, connectionStatus: 'connected', chatOpen: false,
      selectedTileId: 't-1',
    });

    expect(labels).not.toContain('打出此牌可听');
    expect(labels).toContain('可胡：');
    expect(labels).toContain('听');
    expect(renderer.targets.some((t) => t.type === 'action' && t.data.action === 'listen')).toBe(true);
  });

  it('renders listen preview with postDiscardListenWaits when waiting to declare listen after discarding', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'playing', handNumber: 1, currentTurn: 'A', awaitingDiscard: false,
        players: [{ seat: 'A', nickname: '我', score: 1000, handCount: 13, isListening: false }],
        spectators: [], chat: [],
      },
      private: {
        seat: 'A', spectator: false,
        hand: [{ id: 't-2', suit: 'characters', rank: 2, label: '二万' }],
        postDiscardListenWaits: [
          { id: 'w-1', suit: 'characters', rank: 3, label: '三万' },
          { id: 'w-2', suit: 'characters', rank: 6, label: '六万' },
        ],
        availableActions: ['listen', 'pass'],
      },
    };

    renderer.draw({
      screen: 'room', snapshot, connectionStatus: 'connected', chatOpen: false,
      selectedTileId: '',
    });

    expect(labels).toContain('已出牌 · 可选择听牌');
    expect(labels).toContain('胡：');
  });

  it('renders listen preview with waits and bao tile when player is listening', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'playing', handNumber: 1, currentTurn: 'A', awaitingDiscard: false,
        players: [{ seat: 'A', nickname: '我', score: 1000, handCount: 13, isListening: true }],
        spectators: [], chat: [],
      },
      private: {
        seat: 'A', spectator: false,
        isListening: true,
        hand: [{ id: 't-2', suit: 'characters', rank: 2, label: '二万' }],
        listenWaits: [{ id: 'w-1', suit: 'characters', rank: 3, label: '三万' }],
        baoTile: { id: 'bao-1', suit: 'bamboo', rank: 8, label: '八条' },
        availableActions: [],
      },
    };

    renderer.draw({
      screen: 'room', snapshot, connectionStatus: 'connected', chatOpen: false,
    });

    expect(labels).toContain('已听牌');
    expect(labels).toContain('胡：');
    expect(labels).toContain('宝：');
  });

  it('does not render ting button, badge, or preview when no tile or an unqualifying tile is selected, but renders them when a qualifying tile is selected', () => {
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'playing', handNumber: 1, currentTurn: 'A', awaitingDiscard: true,
        players: [{ seat: 'A', nickname: '我', score: 1000, handCount: 14, isListening: false }],
        spectators: [], chat: [],
      },
      private: {
        seat: 'A', spectator: false,
        hand: [
          { id: 't-1', suit: 'characters', rank: 1, label: '一万' },
          { id: 't-2', suit: 'characters', rank: 2, label: '二万' },
        ],
        listenTileIds: ['t-1'],
        listenOptions: [{ discardTileId: 't-1', waits: [{ id: 'w-1', suit: 'characters', rank: 3, label: '三万' }] }],
        availableActions: ['discard', 'listen'],
      },
    };

    // Case 1: No tile selected
    const labels1 = [];
    const renderer1 = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels1.push(String(value)) }));
    renderer1.draw({ screen: 'room', snapshot, connectionStatus: 'connected', chatOpen: false, selectedTileId: '' });
    expect(labels1).not.toContain('可胡：');
    expect(labels1).not.toContain('打出此牌可听');
    expect(labels1).not.toContain('听');
    expect(renderer1.targets.some((t) => t.type === 'action' && t.data.action === 'listen')).toBe(false);

    // Case 2: Unqualifying tile 't-2' selected
    const labels2 = [];
    const renderer2 = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels2.push(String(value)) }));
    renderer2.draw({ screen: 'room', snapshot, connectionStatus: 'connected', chatOpen: false, selectedTileId: 't-2' });
    expect(labels2).not.toContain('可胡：');
    expect(labels2).not.toContain('打出此牌可听');
    expect(labels2).not.toContain('听');
    expect(renderer2.targets.some((t) => t.type === 'action' && t.data.action === 'listen')).toBe(false);

    // Case 3: Qualifying tile 't-1' selected
    const labels3 = [];
    const renderer3 = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels3.push(String(value)) }));
    renderer3.draw({ screen: 'room', snapshot, connectionStatus: 'connected', chatOpen: false, selectedTileId: 't-1' });
    expect(labels3).not.toContain('打出此牌可听');
    expect(labels3).toContain('可胡：');
    expect(labels3).toContain('听');
    expect(renderer3.targets.some((t) => t.type === 'action' && t.data.action === 'listen')).toBe(true);
  });

  it('renders animated action callouts (peng, chi, gang, listen, hu) in front of players', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const drawArtText = renderer.drawArtText.bind(renderer);
    renderer.drawArtText = (...args) => { labels.push(args[0]); drawArtText(...args); };
    const now = Date.now();
    const snapshot = {
      public: {
        gameId: 'mahjong', phase: 'playing', handNumber: 1, currentTurn: 'B',
        players: [
          { seat: 'A', nickname: '我', score: 1000, handCount: 13, isListening: false, melds: [], discards: [] },
          { seat: 'B', nickname: '下家', score: 1000, handCount: 10, isListening: false, melds: [], discards: [] },
        ],
        spectators: [], chat: [],
      },
      private: { seat: 'A', spectator: false, hand: [], availableActions: [] },
    };

    renderer.draw({
      screen: 'room', snapshot, connectionStatus: 'connected', chatOpen: false,
      actionCallouts: [
        { seat: 'B', kind: 'peng', text: '碰', startTime: now - 100, duration: 1500 },
      ],
    });

    expect(labels).toContain('碰');
  });

  it('keeps an outlined artistic claim cue in front of the player hand after the pop animation, without a giant seal', () => {
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext());
    const textCalls = [];
    const roundedRects = [];
    renderer.drawArtText = (...args) => textCalls.push(args);
    renderer.roundRect = (...args) => roundedRects.push(args);
    renderer.circle = () => { throw new Error('action cue should not draw a giant circular badge'); };

    renderer.drawActionCallouts({
      snapshot: {
        private: { seat: 'A' },
        public: { players: [{ seat: 'B', nickname: '碰牌玩家' }] },
      },
      actionCallouts: [{ seat: 'B', kind: 'peng', text: '碰', startTime: Date.now() - 4000, duration: 1500, untilDiscard: true }],
    });

    expect(textCalls).toHaveLength(1);
    expect(textCalls[0]).toEqual(['碰', 0, 0, 46]);
    expect(roundedRects).toHaveLength(0);
  });

  it('MahjongGameApp diffs snapshots to create action callouts on meld and ting transitions', () => {
    const app = {
      state: { screen: 'room', actionCallouts: [], snapshot: null },
      stopAnimationLoop: () => {},
      startAnimationLoop: () => {},
      destroyUserInfoButton: () => {},
      updateUserInfoButton: () => {},
      draw: () => {},
      setOrientation: () => {},
      hasActiveRoomAnimation: MahjongGameApp.prototype.hasActiveRoomAnimation,
      updateSnapshot: MahjongGameApp.prototype.updateSnapshot,
    };
    const baseSnapshot = {
      public: {
        gameId: 'mahjong', phase: 'playing', handNumber: 1, currentTurn: 'A',
        players: [
          { seat: 'A', nickname: '玩家A', score: 1000, handCount: 13, isListening: false, melds: [], discards: [] },
          { seat: 'B', nickname: '玩家B', score: 1000, handCount: 13, isListening: false, melds: [], discards: [] },
        ],
      },
      private: { seat: 'A', spectator: false, hand: [], availableActions: [] },
    };
    app.updateSnapshot(baseSnapshot);
    expect(app.state.actionCallouts).toHaveLength(0);

    // Player B does 'peng'
    const pengSnapshot = {
      public: {
        ...baseSnapshot.public,
        players: [
          baseSnapshot.public.players[0],
          {
            ...baseSnapshot.public.players[1],
            melds: [{ kind: 'peng', tiles: [{ id: '1', suit: 'characters', rank: 1 }] }],
          },
        ],
      },
      private: baseSnapshot.private,
    };
    app.updateSnapshot(pengSnapshot);
    expect(app.state.actionCallouts).toHaveLength(1);
    expect(app.state.actionCallouts[0]).toMatchObject({ seat: 'B', kind: 'peng', text: '碰' });
    expect(app.hasActiveRoomAnimation()).toBe(true);

    // Player A declares ting
    const tingSnapshot = {
      public: {
        ...pengSnapshot.public,
        players: [
          { ...pengSnapshot.public.players[0], isListening: true },
          pengSnapshot.public.players[1],
        ],
      },
      private: { ...baseSnapshot.private, isListening: true },
    };
    app.updateSnapshot(tingSnapshot);
    expect(app.state.actionCallouts.some((c) => c.seat === 'A' && c.text === '听')).toBe(true);
    expect(app.state.actionCallouts.find((c) => c.seat === 'B')).toHaveProperty('untilDiscard', true);
    const discard = { id: 'discard-1', suit: 'dots', rank: 5 };
    app.updateSnapshot({
      public: { ...tingSnapshot.public, lastDiscard: { seat: 'B', tile: discard },
        players: [tingSnapshot.public.players[0], { ...tingSnapshot.public.players[1], discards: [discard] }] },
      private: baseSnapshot.private,
    });
    expect(app.state.actionCallouts.some((c) => c.seat === 'B' && c.untilDiscard)).toBe(false);
  });

  it('renders chi options as three real tile faces and dispatches exactly the chosen two hand tiles', async () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const tiles = [4, 6, 7].map((rank) => ({ id: `dots-${rank}`, suit: 'dots', rank }));
    const snapshot = { public: { gameId: 'mahjong', phase: 'playing', players: [], chat: [], pendingDiscard: { seat: 'D', tile: { id: 'dots-5', suit: 'dots', rank: 5 } } },
      private: { seat: 'A', hand: tiles, availableActions: ['chi', 'pass'], chiOptions: [[tiles[0].id, tiles[1].id], [tiles[1].id, tiles[2].id]] } };
    const state = { screen: 'game', snapshot };
    const commands = [];
    const app = { state, draw: () => renderer.draw(state), runCommand: (...args) => commands.push(args), wx: { showActionSheet: () => { throw new Error('text action sheet must not open'); } } };
    await MahjongGameApp.prototype.handleAction.call(app, { action: 'chi', chiOptions: snapshot.private.chiOptions });
    expect(state.chiPickerOpen).toBe(true);
    const choices = renderer.targets.filter((target) => target.type === 'chi-choice');
    expect(choices).toHaveLength(2);
    expect(renderer.targets.some((target) => target.type === 'select-tile')).toBe(false);
    expect(labels).toContain('选择吃牌组合');
    await MahjongGameApp.prototype.handleTarget.call(app, choices[1]);
    expect(commands).toEqual([['chi', { tileIds: [tiles[1].id, tiles[2].id] }]]);
    expect(state.chiPickerOpen).toBe(false);
  });

  it('draws the win method, winner and discarder before settlement and consumes table touches', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const drawArtText = renderer.drawArtText.bind(renderer);
    renderer.drawArtText = (...args) => { labels.push(args[0]); drawArtText(...args); };
    renderer.draw({ screen: 'game', winAnnouncementAt: Date.now() - 600, snapshot: {
      public: { gameId: 'mahjong', phase: 'playing', players: [{ seat: 'A', nickname: '我' }, { seat: 'B', nickname: '赢家' }], chat: [],
        winAnnouncement: { winnerSeat: 'B', winnerNickname: '赢家', type: 'discard-win', payingSeat: 'A', isCardang: true } },
      private: { seat: 'A', hand: [], availableActions: [] },
    } });
    expect(labels).toEqual(expect.arrayContaining(['夹', '赢家 胡牌', '我 点炮']));
    expect(labels).not.toContain('本局结算');
    expect(renderer.hit(480, 250)?.type).toBe('win-announcement');
    expect(MahjongGameApp.prototype.hasActiveRoomAnimation.call({ state: { snapshot: { public: { phase: 'playing', winAnnouncement: { winnerSeat: 'B' } } } } })).toBe(true);
    expect(MahjongGameApp.prototype.hasActiveRoomAnimation.call({ state: { snapshot: { public: { phase: 'playing', players: [{ isListening: true }] } } } })).toBe(false);
  });

  it('continues room animation frames on the actual game screen, then stops after settlement', () => {
    const frames = [];
    let draws = 0;
    const app = { animationRunning: false, animationId: null,
      state: { screen: 'game', snapshot: { public: { phase: 'playing', winAnnouncement: { winnerSeat: 'B' } } } },
      hasActiveRoomAnimation: MahjongGameApp.prototype.hasActiveRoomAnimation,
      scheduleNextFrame: (cb) => frames.push(cb), draw: () => { draws += 1; } };
    MahjongGameApp.prototype.startAnimationLoop.call(app);
    frames.shift()();
    frames.shift()();
    expect(draws).toBe(2);
    app.state.snapshot.public.phase = 'settled';
    app.state.snapshot.public.winAnnouncement = null;
    frames.shift()();
    expect(app.animationRunning).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it('coalesces a burst of touch events into one frame at the latest drag position', () => {
    const frames = [];
    let draws = 0;
    const app = { wx: { requestAnimationFrame: (cb) => frames.push(cb) }, state: {},
      tileGesture: { tileId: 't-1', startX: 0, startY: 0, moved: false },
      getTouchPoint: (touch) => ({ ...touch, x: touch.clientX, y: touch.clientY }), draw: () => { draws += 1; } };
    for (let x = 20; x < 40; x++) MahjongGameApp.prototype.onTouchMove.call(app, { touches: [{ clientX: x, clientY: 100 }] });
    expect(frames).toHaveLength(1);
    expect(draws).toBe(0);
    frames[0]();
    expect(draws).toBe(1);
    expect(app.state.draggedTile).toMatchObject({ tileId: 't-1', x: 39, y: 100 });
    MahjongGameApp.prototype.onTouchMove.call(app, { touches: [{ clientX: 50, clientY: 100 }] });
    app.tileGesture = null;
    app.state.draggedTile = null;
    frames[1]();
    expect(draws).toBe(1);
  });

  it('caches the static scene while dragging and rebuilds it after snapshot or asset invalidation', () => {
    const renderer = new MahjongRenderer({ width: 1688, height: 780 }, createContext());
    renderer.createCacheCanvas = () => ({ getContext: () => createContext() });
    let scenes = 0;
    let floating = 0;
    renderer.drawScene = () => { scenes += 1; };
    renderer.drawFloatingHandTile = () => { floating += 1; };
    const state = { snapshot: {}, draggedTile: { tileId: 't-1', x: 40, y: 30 } };
    for (let frame = 0; frame < 20; frame++) { state.draggedTile.x += 1; renderer.draw(state); }
    expect(scenes).toBe(1);
    expect(floating).toBe(20);
    state.snapshot = {};
    renderer.draw(state);
    expect(scenes).toBe(2);
    renderer.invalidateDragCache();
    renderer.draw(state);
    expect(scenes).toBe(3);
    state.draggedTile = null;
    renderer.draw(state);
    expect(scenes).toBe(4);
  });

  it('shows real per-method fan ranges next to waiting tiles, with conditional bao labels', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));
    const wait = { id: 'wait-1', suit: 'characters', rank: 5 };
    renderer.drawListenPreview({ selectedTileId: 'discard-1', snapshot: { private: {
      hand: [{ id: 'discard-1', suit: 'dots', rank: 9 }], listenTileIds: ['discard-1'],
      listenOptions: [{ discardTileId: 'discard-1', waits: [wait], winPreviews: [{ tileId: wait.id, methods: [
        { label: '夹点炮', minFan: 2, maxFan: 6 }, { label: '夹自摸', minFan: 4, maxFan: 6 },
        { label: '宝中宝', minFan: 12, maxFan: 12, condition: '此牌为宝且自摸' },
      ] }] }],
    } } });
    expect(labels).toEqual(expect.arrayContaining(['打出此牌自动听 · 可胡：', '夹点炮2–6番', '夹自摸4–6番', '宝中宝12番*']));
    expect(labels.some((label) => label.includes('黑炮包付另算'))).toBe(true);
  });

  it('根据玩家各自视角动态旋转罗盘并展示准确的门风角标与空位方向', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({ fillText: (value) => labels.push(String(value)) }));

    // 视角为南家 (Seat B) 时渲染大厅
    renderer.draw({
      screen: 'lobby',
      snapshot: {
        public: {
          phase: 'lobby',
          roomId: 'mahjong',
          players: [
            { seat: 'A', nickname: '东家玩家', score: 1000, connected: true, melds: [], discards: [] },
            { seat: 'B', nickname: '南家玩家', score: 1000, connected: true, melds: [], discards: [] },
          ],
          chat: [],
          dealerSeat: 'A',
          hostSeat: 'A',
        },
        private: {
          seat: 'B',
          hand: [],
          availableActions: [],
        },
      },
    });

    // 应该包含门风角标与对应空位提示
    expect(labels).toContain('东');
    expect(labels).toContain('南');
    expect(labels).toContain('西位 等待入座');
    expect(labels).toContain('北位 等待入座');
  });

  it('renders scoreboard with red highlights on highest metrics and provides ? help explanation', () => {
    const labels = [];
    const fills = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({
      fillText: (value) => labels.push(String(value)),
      fillRect: () => {},
      stroke: () => {},
      fill: () => {},
    }));

    const state = {
      scoreboardOpen: true,
      scoreboardHelpOpen: false,
      snapshot: {
        public: {
          handNumber: 4,
          players: [
            { seat: 'A', nickname: '玩家东', score: 1200, connected: true, melds: [], discards: [] },
            { seat: 'B', nickname: '玩家南', score: 900, connected: true, melds: [], discards: [] },
            { seat: 'C', nickname: '玩家西', score: 950, connected: true, melds: [], discards: [] },
            { seat: 'D', nickname: '玩家北', score: 950, connected: true, melds: [], discards: [] },
          ],
          scoreboard: {
            completedHands: 3,
            stats: {
              A: { winCount: 2, listenCount: 3, discardPaoCount: 0 },
              B: { winCount: 1, listenCount: 2, discardPaoCount: 1 },
              C: { winCount: 0, listenCount: 1, discardPaoCount: 2 },
              D: { winCount: 0, listenCount: 0, discardPaoCount: 0 },
            },
          },
        },
        private: { seat: 'A', hand: [], spectator: false },
      },
    };

    renderer.drawScoreboard(state);

    expect(labels).toContain('📊 雀局数据计分板');
    expect(labels).toContain('已完成 3 局 · 全局数据与房间同步');
    expect(labels).toContain('🀄 胡牌次数');
    expect(labels).toContain('⚡ 听牌次数');
    expect(labels).toContain('💥 点炮次数');
    expect(labels).toContain('🎯 听牌效率');
    expect(labels).toContain('🏆 胡牌率');

    // Player A winCount = 2, highest (67% winRate)
    expect(labels).toContain('2 次');
    // Player C discardPaoCount = 2, highest
    expect(labels).toContain('2 次');
    // Efficiency: A has 2/3 = 67%
    expect(labels).toContain('67%');

    // Targets include close and toggle help
    expect(renderer.targets.some((t) => t.type === 'close-scoreboard')).toBe(true);
    expect(renderer.targets.some((t) => t.type === 'toggle-scoreboard-help')).toBe(true);

    // Now open help modal
    labels.length = 0;
    renderer.drawScoreboard({ ...state, scoreboardHelpOpen: true });
    expect(labels).toContain('📖 计分板指标含义说明');
    expect(labels).toContain('胡牌次数');
    expect(labels).toContain('听牌效率');
    expect(labels).toContain('胡牌率');
    expect(renderer.targets.some((t) => t.type === 'close-scoreboard-help')).toBe(true);
  });

  it('implements dealing animation with 6-tile batches, flip, and sorting glide', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({
      fillText: (value) => labels.push(String(value)),
    }));

    const handTiles = Array.from({ length: 13 }, (_, i) => ({
      id: `tile-${i}`,
      suit: 'dots',
      rank: (i % 9) + 1,
    }));

    const state = {
      snapshot: {
        public: { phase: 'playing', currentTurn: 'A', handNumber: 1, players: [] },
        private: { seat: 'A', hand: handTiles, availableActions: ['discard'] },
      },
      dealingAnimation: {
        startTime: Date.now() - 200, // 200ms elapsed (< 500ms)
        duration: 2000,
      },
    };

    // Stage 1: 0~500ms, batch of 6 tiles dealt, face down, banner displayed
    renderer.targets = [];
    renderer.drawHand(state);
    expect(labels).toContain('🀄 发牌中 (6/13)…');
    // In dealing animation, tiles cannot be clicked/selected
    expect(renderer.targets.some((t) => t.type === 'select-tile')).toBe(false);

    // Actions and listen preview should also be suppressed during dealing
    renderer.drawActions(state);
    expect(renderer.targets.some((t) => t.type === 'command')).toBe(false);

    // Stage 2: 500~1000ms, batch of 12 tiles
    labels.length = 0;
    state.dealingAnimation.startTime = Date.now() - 700;
    renderer.drawHand(state);
    expect(labels).toContain('🀄 发牌中 (12/13)…');

    // Stage 3: 1500~1750ms, card faces revealed / flip
    labels.length = 0;
    state.dealingAnimation.startTime = Date.now() - 1600;
    renderer.drawHand(state);
    expect(labels).toContain('🀄 开牌展示…');

    // Stage 4: 1750~2000ms, cards sort glide
    labels.length = 0;
    state.dealingAnimation.startTime = Date.now() - 1850;
    renderer.drawHand(state);
    expect(labels).toContain('🀄 理牌排序中…');

    // Stage 5: Animation finished (> 2000ms), standard interactive tiles
    labels.length = 0;
    delete state.dealingAnimation;
    renderer.targets = [];
    renderer.drawHand(state);
    expect(renderer.targets.some((t) => t.type === 'select-tile')).toBe(true);
    expect(renderer.targets.filter((t) => t.type === 'select-tile').length).toBe(13);
  });

  it('renders lobby ready toggles and count', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({
      fillText: (value) => labels.push(String(value)),
    }));

    const state = {
      screen: 'lobby',
      snapshot: {
        public: {
          phase: 'lobby',
          roomId: 'room-1',
          players: [
            { seat: 'A', nickname: '玩家东', score: 1000, ready: false, connected: true, melds: [], discards: [] },
            { seat: 'B', nickname: '玩家南', score: 1000, ready: true, connected: true, melds: [], discards: [] },
            { seat: 'C', nickname: '玩家西', score: 1000, ready: false, connected: true, melds: [], discards: [] },
            { seat: 'D', nickname: '玩家北', score: 1000, ready: false, connected: true, melds: [], discards: [] },
          ],
          chat: [],
          dealerSeat: 'A',
          hostSeat: 'A',
        },
        private: {
          seat: 'A',
          hand: [],
          availableActions: [],
        },
      },
    };

    renderer.drawLobby(state);
    expect(labels).toContain('准备');
    expect(labels).toContain('已准备 1 / 4 人 · 全员准备后自动开局');
    expect(renderer.targets.some((t) => t.type === 'command' && t.data.action === 'ready' && t.data.payload.ready === true)).toBe(true);

    // If player A is ready
    labels.length = 0;
    renderer.targets = [];
    state.snapshot.public.players[0].ready = true;
    renderer.drawLobby(state);
    expect(labels).toContain('已准备 (点击取消)');
    expect(renderer.targets.some((t) => t.type === 'command' && t.data.action === 'ready' && t.data.payload.ready === false)).toBe(true);
  });

  it('renders self-draw thumb reveal ritual animation and turns hu button into 自摸 button', () => {
    const labels = [];
    const renderer = new MahjongRenderer({ width: 960, height: 540 }, createContext({
      fillText: (value) => labels.push(String(value)),
    }));

    const drawnTile = { id: 'tile-win', suit: 'characters', rank: 8 };
    const state = {
      snapshot: {
        public: {
          phase: 'playing',
          currentTurn: 'A',
          pendingDiscard: null,
          players: [],
        },
        private: {
          seat: 'A',
          hand: [drawnTile],
          drawnTileId: 'tile-win',
          availableActions: ['hu', 'pass'],
        },
      },
      selfDrawAnimation: {
        tile: drawnTile,
        tileId: 'tile-win',
        startTime: Date.now() - 500, // 500ms into the 3000ms animation
        duration: 3000,
      },
    };

    // Stage 1: Animation in progress (500ms)
    renderer.targets = [];
    renderer.drawSelfDrawAnimation(state);
    expect(labels).not.toContain('🀄 摸牌有感 · 搓摸自摸中…');
    expect(labels).toContain('💡 轻触屏幕可直接开牌');
    expect(renderer.targets.some((t) => t.type === 'skip-self-draw-anim')).toBe(true);

    // During ritual animation, actions should be suppressed so player is not distracted
    renderer.drawActions(state);
    expect(renderer.targets.some((t) => t.type === 'action')).toBe(false);

    // Stage 2: Thumb has cleared tile face (> 2400ms)
    labels.length = 0;
    state.selfDrawAnimation.startTime = Date.now() - 2600;
    renderer.drawSelfDrawAnimation(state);
    expect(labels).not.toContain('✨ 绝 妙 自 摸 ！ ✨');

    // Stage 3: Animation complete (3000ms+), actions appear and button says '自摸'
    labels.length = 0;
    delete state.selfDrawAnimation;
    renderer.targets = [];
    renderer.drawActions(state);
    expect(labels).toContain('自摸');
    expect(labels).not.toContain('胡');
    expect(renderer.targets.some((t) => t.type === 'action' && t.data.action === 'hu')).toBe(true);

    // Conversely, when it's a discard claim from another player, button says '胡' (via drawArtText)
    labels.length = 0;
    renderer.targets = [];
    const artTextCalls = [];
    renderer.drawArtText = (char) => artTextCalls.push(char);
    state.snapshot.public.currentTurn = 'B';
    state.snapshot.public.pendingDiscard = { seat: 'B', tile: { id: 'discard-1', suit: 'dots', rank: 1 } };
    renderer.drawActions(state);
    expect(artTextCalls).toContain('胡');
    expect(labels).not.toContain('自摸');
    expect(renderer.targets.some((t) => t.type === 'action' && t.data.action === 'hu')).toBe(true);
  });
});
