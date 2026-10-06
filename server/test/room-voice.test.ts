import { describe, expect, it } from 'vitest';
import { MahjongRoomService } from '../src/mahjong-room-service';
import { isRoomChatPayload } from '../../shared/src/protocol';

describe('快捷语音下线', () => {
  it('不再接受快捷语音消息，但保留普通聊天和互动消息', () => {
    expect(isRoomChatPayload({ kind: 'voice', voiceId: 'quick' })).toBe(false);
    const room = new MahjongRoomService({ inviteCode: 'inner-414' });
    const auth = room.login('inner-414');
    room.join(auth.sessionToken, '甲', 'mahjong');
    expect(() => room.recordChat(auth.sessionToken, { kind: 'voice', voiceId: 'quick' } as never)).toThrow('聊天消息格式无效');
    expect(isRoomChatPayload({ kind: 'text', text: '你好' })).toBe(true);
    expect(isRoomChatPayload({ kind: 'interaction', interaction: 'heart', target: { nickname: '乙' } })).toBe(true);
  });
});
