const { MahjongGameApp } = require('../src/app');

describe('Mahjong voice authorization', () => {
  it('requests privacy consent before the microphone permission', async () => {
    const calls = [];
    const app = {
      state: { error: '', statusMessage: '' },
      wx: {
        requirePrivacyAuthorize: ({ success }) => { calls.push('privacy'); success(); },
        authorize: ({ scope, success }) => { calls.push(scope); success(); },
      },
      draw: () => {},
    };

    await expect(MahjongGameApp.prototype.authorizeVoiceRecording.call(app)).resolves.toBe(true);
    expect(calls).toEqual(['privacy', 'scope.record']);
  });

  it('does not request microphone permission when the official privacy popup is unavailable', async () => {
    const app = {
      state: { error: '', statusMessage: '' },
      wx: {
        requirePrivacyAuthorize: ({ fail }) => fail({
          errMsg: 'start:fail please go to mp open official popup or use wx.onNeedPrivacyAuthorization errno=1026',
        }),
        authorize: () => { throw new Error('must not request microphone before privacy is accepted'); },
      },
      draw: () => {},
    };

    await expect(MahjongGameApp.prototype.authorizeVoiceRecording.call(app)).resolves.toBe(false);
    expect(app.state.error).toMatch(/隐私保护指引中声明麦克风/);
    expect(app.state.statusMessage).toContain('再次切换语音');
  });
});
