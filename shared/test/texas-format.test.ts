import { describe, expect, it } from 'vitest';
import { formatTexasChips } from '../src/texas';

describe('德州筹码紧凑显示', () => {
  it('整数单位不显示多余小数，小数最多保留两位', () => {
    expect(formatTexasChips(999)).toBe('999');
    expect(formatTexasChips(1_000)).toBe('1k');
    expect(formatTexasChips(1_250)).toBe('1.25k');
    expect(formatTexasChips(98_760)).toBe('98.76k');
    expect(formatTexasChips(1_000_000)).toBe('1m');
  });
});
