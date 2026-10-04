import { describe, expect, it } from 'vitest';
import { isValidNickname } from '../src/validation';

describe('nickname validation', () => {
  it('accepts only one to twelve Chinese/ASCII letters, digits, and underscores', () => {
    expect(isValidNickname('玩家_01')).toBe(true);
    expect(isValidNickname('Poker414')).toBe(true);
    expect(isValidNickname('')).toBe(false);
    expect(isValidNickname('   ')).toBe(false);
    expect(isValidNickname('有 空格')).toBe(false);
    expect(isValidNickname('玩家-1')).toBe(false);
    expect(isValidNickname('玩家玩家玩家玩家玩家玩家玩家')).toBe(false);
  });
});
