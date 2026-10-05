import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('小程序固定语音', () => {
  it('发送内置编号，收到新消息播放音频，静音时不播放', () => {
    const play = vi.fn();
    const stop = vi.fn();
    const destroy = vi.fn();
    const audio = { src: '', play, stop, destroy };
    let definition: Record<string, unknown> | undefined;
    runInNewContext(readFileSync('miniprogram/components/room-chat/index.js', 'utf8'), {
      Component: (value: Record<string, unknown>) => { definition = value; },
      require: () => ({ phrases: [{ id: 'quick', text: '快一点，大家都等着呢！' }] }),
      wx: { createInnerAudioContext: () => audio },
    });
    expect(definition).toBeDefined();
    const component = {
      data: { messages: [], enableVoice: true, voiceMuted: false, scrollIntoView: '' },
      setData(patch: Record<string, unknown>) { Object.assign(this.data, patch); },
      triggerEvent: vi.fn(),
      voiceAudio: undefined as typeof audio | undefined,
      lastSeenMessageId: null as string | null,
    };
    const methods = definition!.methods as Record<string, (this: typeof component, event?: unknown) => void>;
    const lifetimes = definition!.lifetimes as Record<string, (this: typeof component) => void>;
    const observers = definition!.observers as Record<string, (this: typeof component, messages: unknown[]) => void>;
    lifetimes.attached.call(component);
    methods.onVoice.call(component, { currentTarget: { dataset: { id: 'quick' } } });
    expect(component.triggerEvent).toHaveBeenCalledWith('send', { payload: { kind: 'voice', voiceId: 'quick' } }, expect.anything());
    observers.messages.call(component, [{ id: 'v1', kind: 'voice', voiceId: 'quick' }]);
    expect(audio.src).toBe('/assets/voice/quick.m4a');
    expect(play).toHaveBeenCalledTimes(1);
    methods.onToggleVoiceMute.call(component);
    observers.messages.call(component, [{ id: 'v1' }, { id: 'v2', kind: 'voice', voiceId: 'quick' }]);
    expect(play).toHaveBeenCalledTimes(1);
    lifetimes.detached.call(component);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
