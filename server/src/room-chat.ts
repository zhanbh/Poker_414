import { randomUUID } from 'node:crypto';
import { isRoomChatPayload, RoomChatMessage, RoomChatPayload } from '../../shared/src/protocol';
import { Session } from './session-service';

export const MAX_ROOM_CHAT_MESSAGES = 120;
const MAX_TEXT_LENGTH = 200;
const MAX_NICKNAME_LENGTH = 32;

export function createRoomChatMessage(session: Session, payload: unknown): RoomChatMessage {
  if (!session.role || !session.nickname?.trim()) throw new Error('请先进入房间');
  if (!isRoomChatPayload(payload)) throw new Error('聊天消息格式无效');
  const senderNickname = session.nickname.trim().slice(0, MAX_NICKNAME_LENGTH);
  const senderSeat = session.seat ?? session.texasSeat ?? undefined;
  if (payload.kind === 'text') {
    const text = payload.text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) throw new Error('聊天内容不能为空');
    return {
      id: randomUUID(),
      kind: 'text',
      senderNickname,
      ...(senderSeat ? { senderSeat } : {}),
      text,
      createdAt: Date.now(),
    };
  }
  const targetNickname = payload.target.nickname.trim().slice(0, MAX_NICKNAME_LENGTH);
  const targetSeat = payload.target.seat?.trim().slice(0, 12) || undefined;
  return {
    id: randomUUID(),
    kind: 'interaction',
    senderNickname,
    ...(senderSeat ? { senderSeat } : {}),
    interaction: payload.interaction,
    targetNickname,
    ...(targetSeat ? { targetSeat } : {}),
    createdAt: Date.now(),
  };
}

export function appendRoomChatMessage(messages: readonly RoomChatMessage[], message: RoomChatMessage): RoomChatMessage[] {
  return [...messages, message].slice(-MAX_ROOM_CHAT_MESSAGES);
}

export type RoomChatInput = RoomChatPayload;