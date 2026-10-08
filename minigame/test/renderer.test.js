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
    renderer.draw({ screen: 'entry', inviteCode: '', nickname: '', statusMessage: '' });
    expect(renderer.hit(270, 409)).toMatchObject({ type: 'input', data: { field: 'inviteCode' } });
    expect(renderer.hit(270, 654)).toMatchObject({ type: 'enter' });
    expect(labels).toContain('输入房间邀请码即可进入房间');
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

    MahjongGameApp.prototype.showKeyboard.call(app, 'inviteCode');
    expect(keyboardOptions).toMatchObject({ defaultValue: '308', maxLength: 32, multiple: false, confirmHold: false, confirmType: 'done' });
    MahjongGameApp.prototype.onKeyboardConfirm.call(app, { value: '12345' });
    expect(app.state.inviteCode).toBe('12345');
    expect(hidden).toBe(true);
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
    expect(renderer.hit(865, 92)).toMatchObject({ type: 'toggle-chat' });
  });

  it('makes player cards selectable and animates a room interaction on the target card', () => {
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
    expect(renderer.hit(820, 258)).toMatchObject({ type: 'select-player', data: { seat: 'B', nickname: '小明' } });
    expect(labels).toContain('🍅');
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
});
