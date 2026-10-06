import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('小程序房间聊天快捷语音下线', () => {
  it('不再显示、发送或播放快捷语音，同时保留聊天记录显示', () => {
    let definition: Record<string, unknown> | undefined;
    runInNewContext(readFileSync('miniprogram/components/room-chat/index.js', 'utf8'), {
      Component: (value: Record<string, unknown>) => { definition = value; },
    });
    expect(definition).toBeDefined();
    expect(definition!.properties).not.toHaveProperty('enableVoice');
    expect(definition!.lifetimes).toBeUndefined();
    const methods = definition!.methods as Record<string, unknown>;
    expect(methods).not.toHaveProperty('onVoice');
    expect(methods).not.toHaveProperty('onToggleVoiceMute');

    const componentWxml = readFileSync('miniprogram/components/room-chat/index.wxml', 'utf8');
    const mahjongWxml = readFileSync('miniprogram/pages/mahjong-game/index.wxml', 'utf8');
    expect(componentWxml).not.toContain('快捷语音');
    expect(mahjongWxml).not.toContain('enable-voice');
    expect(mahjongWxml).not.toContain('voiceBubble');
    expect(componentWxml).toContain("item.kind === 'voice'");
  });

  it('只对新收到且带目标座位的互动消息生成座位特效', () => {
    const moduleObject = { exports: {} as Record<string, unknown> };
    runInNewContext(readFileSync('miniprogram/utils/chat.js', 'utf8'), { module: moduleObject, exports: moduleObject.exports });
    const newInteractionEffect = moduleObject.exports.newInteractionEffect as (snapshot: unknown, previous: unknown) => unknown;
    const previous = { public: { chat: [{ id: 'old', kind: 'text' }] } };
    const next = { public: { chat: [
      { id: 'old', kind: 'text' },
      { id: 'new', kind: 'interaction', interaction: 'heart', targetSeat: 'C' },
    ] } };
    expect(newInteractionEffect(next, previous)).toEqual({ id: 'new', targetSeat: 'C', interaction: 'heart', icon: '💖' });
    expect(newInteractionEffect(next, next)).toBeNull();
  });
});
