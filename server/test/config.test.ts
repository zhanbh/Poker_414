import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('服务配置', () => {
  it('必须显式配置固定邀请码，其他监听参数使用轻量默认值', () => {
    expect(() => loadConfig({ PORT: '3001' })).toThrow(/INVITE_CODE/);
    expect(loadConfig({ INVITE_CODE: 'inner-414', PORT: '3001' })).toMatchObject({
      inviteCode: 'inner-414',
      host: '0.0.0.0',
      port: 3001,
    });
  });
});
