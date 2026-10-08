const { relativeSeats, tileLabel, gameScreen, isValidNickname, actionLabel, chatText } = require('../src/model');

describe('native mini-game Mahjong client model', () => {
  it('orients the current player at the bottom of the table', () => {
    expect(relativeSeats('C')).toEqual(['C', 'D', 'A', 'B']);
  });

  it('formats tiles and chooses the lobby or game screen from server state', () => {
    expect(tileLabel({ suit: 'characters', rank: 9 })).toBe('9万');
    expect(tileLabel({ suit: 'dragons', rank: 'red' })).toBe('红中');
    expect(gameScreen({ public: { phase: 'lobby' } })).toBe('lobby');
    expect(gameScreen({ public: { phase: 'playing' } })).toBe('game');
  });

  it('validates nicknames and maps server actions into readable labels', () => {
    expect(isValidNickname('玩家308')).toBe(true);
    expect(isValidNickname('')).toBe(false);
    expect(isValidNickname('nickname_is_too_long')).toBe(false);
    expect(actionLabel('exposed-kong')).toBe('明杠');
  });

  it('renders room chat text and interaction summaries', () => {
    expect(chatText({ kind: 'text', senderNickname: '小明', text: '你好' })).toBe('小明: 你好');
    expect(chatText({ kind: 'interaction', senderNickname: '小明', interaction: 'tomato', targetNickname: '小红' })).toContain('🍅');
  });
});
