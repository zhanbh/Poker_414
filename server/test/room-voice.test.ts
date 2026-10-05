import { describe, expect, it } from 'vitest';
import { MahjongRoomService } from '../src/mahjong-room-service';
import { isRoomChatPayload } from '../../shared/src/protocol';

describe('固定语音', () => {
  it('只接受内置短句编号，并用服务端文案记录字幕', () => {
    expect(isRoomChatPayload({ kind: 'voice', voiceId: 'quick' })).toBe(true);
    expect(isRoomChatPayload({ kind: 'voice', voiceId: 'custom' })).toBe(false);
    const room = new MahjongRoomService({ inviteCode: 'inner-414' });
    const auth = room.login('inner-414');
    room.join(auth.sessionToken, '甲', 'mahjong');
    const message = room.recordChat(auth.sessionToken, { kind: 'voice', voiceId: 'quick' });
    expect(message).toMatchObject({ kind: 'voice', senderNickname: '甲', senderSeat: 'A', voiceId: 'quick', text: '快一点，大家都等着呢！' });
    expect(room.getSnapshot(auth.sessionToken).public.chat?.at(-1)).toEqual(message);
    expect(() => room.recordChat(auth.sessionToken, { kind: 'voice', voiceId: 'nice' })).toThrow('发送太频繁');
  });
});
