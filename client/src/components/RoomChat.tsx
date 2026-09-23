import { FormEvent, useEffect, useRef, useState } from 'react';
import { RoomChatInteraction, RoomChatMessage, RoomChatPayload } from '../../../shared/src/protocol';

export interface RoomChatMember {
  readonly id: string;
  readonly nickname: string;
  readonly label: string;
  readonly seat?: string;
}

const INTERACTIONS: readonly { readonly kind: RoomChatInteraction; readonly label: string; readonly icon: string }[] = [
  { kind: 'tomato', label: '番茄', icon: '🍅' },
  { kind: 'water', label: '泼水', icon: '💦' },
  { kind: 'heart', label: '比心', icon: '💖' },
  { kind: 'kiss', label: '亲吻', icon: '💋' },
];

function interactionText(message: RoomChatMessage): string {
  const label = INTERACTIONS.find((item) => item.kind === message.interaction)?.label ?? '互动';
  return `${message.senderNickname} ${label}给 ${message.targetNickname ?? '房间成员'}`;
}

export function RoomChat({ messages, members, ownSeat, onSend }: {
  readonly messages: readonly RoomChatMessage[];
  readonly members: readonly RoomChatMember[];
  readonly ownSeat?: string | null;
  readonly onSend: (payload: RoomChatPayload) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  const send = async (payload: RoomChatPayload) => {
    if (sending) return;
    setSending(true);
    try {
      await onSend(payload);
    } finally {
      setSending(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    await send({ kind: 'text', text });
    setDraft('');
  };

  const sendInteraction = async (member: RoomChatMember, interaction: RoomChatInteraction) => {
    await send({
      kind: 'interaction',
      interaction,
      target: { nickname: member.nickname, ...(member.seat ? { seat: member.seat } : {}) },
    });
  };

  return (
    <section className="room-chat" aria-label="房间聊天">
      <div className="room-chat-heading"><h2>房间聊天</h2><span>聊天和互动仅在本房间保留</span></div>
      <div ref={messagesRef} className="room-chat-messages" aria-live="polite">
        {messages.length === 0 ? <p className="room-chat-empty">还没有消息，打个招呼吧</p> : messages.map((message) => (
          <div className={'room-chat-message ' + message.kind} key={message.id}>
            {message.kind === 'text' ? <><strong>{message.senderNickname}</strong><span>：{message.text}</span></> : <span>{interactionText(message)}</span>}
          </div>
        ))}
      </div>
      <div className="room-chat-targets"><span className="room-chat-target-label">点击玩家互动</span>{members.filter((member) => !member.seat || member.seat !== ownSeat).map((member) => <div className="room-chat-target" key={member.id}><strong>{member.label} · {member.nickname}</strong><div>{INTERACTIONS.map((item) => <button type="button" key={item.kind} title={`${item.label}给${member.nickname}`} aria-label={`${item.label}给${member.nickname}`} disabled={sending} onClick={() => void sendInteraction(member, item.kind)}>{item.icon}</button>)}</div></div>)}</div>
      <form className="room-chat-form" onSubmit={(event) => void submit(event)}><input value={draft} maxLength={200} placeholder="输入消息…" onChange={(event) => setDraft(event.target.value)} disabled={sending} /><button type="submit" disabled={sending || !draft.trim()}>发送</button></form>
    </section>
  );
}
