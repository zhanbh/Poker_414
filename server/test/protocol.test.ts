import { describe, expect, it } from 'vitest';
import { EVENTS, isCommandEnvelope } from '../../shared/src/protocol';

describe('共享实时协议', () => {
  it('只接受带请求ID、局号和状态版本的命令信封', () => {
    expect(EVENTS.command).toBe('command');
    expect(isCommandEnvelope({
      type: 'pass',
      requestId: 'request-1',
      handNumber: 1,
      stateVersion: 3,
      payload: {},
    })).toBe(true);
    expect(isCommandEnvelope({ type: 'pass', requestId: '', handNumber: 1, stateVersion: 3, payload: {} })).toBe(false);
    expect(isCommandEnvelope({ type: 'pass', requestId: 'r', handNumber: -1, stateVersion: 3, payload: {} })).toBe(false);
    expect(isCommandEnvelope({ type: 'unknown', requestId: 'r', handNumber: 1, stateVersion: 3, payload: {} })).toBe(false);
  });
});
