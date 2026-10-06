import { FormEvent, useEffect, useRef, useState } from 'react';
import { RoomChatInteraction, RoomChatMessage, RoomChatPayload } from '../../../shared/src/protocol';
import { ROOM_VOICE_PHRASES } from '../../../shared/src/voice-phrases';
import { InteractionMenu, RoomInteractionTarget, interactionLabel } from './InteractionMenu';

export interface RoomChatMember {
  readonly id: string;
  readonly nickname: string;
  readonly label: string;
  readonly seat?: string;
}

function interactionText(message: RoomChatMessage): string {
  return `${message.senderNickname} ${interactionLabel(message.interaction ?? 'heart')}给 ${message.targetNickname ?? '房间成员'}`;
}

export function RoomChat({ messages, members, ownSeat, onSend, enableVoice = false }: {
  readonly messages: readonly RoomChatMessage[];
  readonly members: readonly RoomChatMember[];
  readonly ownSeat?: string | null;
  readonly onSend: (payload: RoomChatPayload) => Promise<void> | void;
  readonly enableVoice?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 980px) and (orientation: landscape), (max-width: 760px) and (orientation: portrait)').matches || false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const lastSeenMessageIdRef = useRef(messages.at(-1)?.id ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const lastId = messages.at(-1)?.id ?? null;
    const previousIndex = messages.findIndex((message) => message.id === lastSeenMessageIdRef.current);
    const fresh = lastSeenMessageIdRef.current === null ? messages : previousIndex < 0 ? [] : messages.slice(previousIndex + 1);
    lastSeenMessageIdRef.current = lastId;
    const voice = [...fresh].reverse().find((message) => message.kind === 'voice' && message.voiceId);
    if (!enableVoice || voiceMuted || !voice?.voiceId) return;
    audioRef.current?.pause();
    const audio = new Audio(`/assets/voice/${voice.voiceId}.m4a`);
    audioRef.current = audio;
    void audio.play().catch(() => undefined);
  }, [messages, enableVoice, voiceMuted]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

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

  const sendInteraction = async (target: RoomInteractionTarget, interaction: RoomChatInteraction) => {
    await send({
      kind: 'interaction',
      interaction,
      target: { nickname: target.nickname, ...(target.seat ? { seat: target.seat } : {}) },
    });
  };

  const targets = members.filter((member) => !member.seat || member.seat !== ownSeat);

  return (
    <aside className={`room-chat-shell${collapsed ? ' is-collapsed' : ''}`} aria-label="房间聊天侧栏">
      <button type="button" className="room-chat-toggle" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
        {collapsed ? '💬 聊天' : '收起聊天'}
      </button>
      {collapsed && enableVoice ? <button type="button" className="room-chat-voice-launch" aria-label="打开快捷语音" onClick={() => setCollapsed(false)}>🎙 语音</button> : null}
      {!collapsed ? (
        <section className="room-chat" aria-label="房间聊天">
          <div className="room-chat-heading"><h2>房间聊天</h2><span>仅在本房间保留</span></div>
          {enableVoice ? <div className="room-chat-voice" aria-label="固定语音">
            <div className="room-chat-voice-heading"><strong>快捷语音 · 点按即发送</strong><button type="button" onClick={() => setVoiceMuted((value) => !value)} aria-label={voiceMuted ? '开启语音播放' : '静音固定语音'}>{voiceMuted ? '🔇 已静音' : '🔊 声音开'}</button></div>
            <div className="room-chat-voice-options">{ROOM_VOICE_PHRASES.map((phrase) => <button type="button" key={phrase.id} disabled={sending} onClick={() => void send({ kind: 'voice', voiceId: phrase.id }).catch(() => undefined)}>{phrase.text}</button>)}</div>
          </div> : null}
          <div ref={messagesRef} className="room-chat-messages" aria-live="polite">
            {messages.length === 0 ? <p className="room-chat-empty">还没有消息，打个招呼吧</p> : messages.map((message) => (
              <div className={`room-chat-message ${message.kind}`} key={message.id}>
                {message.kind === 'text' ? <><strong>{message.senderNickname}</strong><span>：{message.text}</span></>
                  : message.kind === 'voice' ? <><strong>{message.senderNickname}</strong><span> 🎙️ {message.text}</span></>
                    : <span>{interactionText(message)}</span>}
              </div>
            ))}
          </div>
          <div className="room-chat-targets">
            <span className="room-chat-target-label">选择玩家发送互动</span>
            <p className="room-chat-target-hint">也可以直接点击牌桌上的玩家卡片</p>
            {targets.map((member) => (
              <div className="room-chat-target" key={member.id}>
                <strong>{member.label ? `${member.label} · ` : ''}{member.nickname}</strong>
                <InteractionMenu target={member} onInteract={sendInteraction} />
              </div>
            ))}
            {targets.length === 0 ? <span className="room-chat-target-hint">暂无可互动的玩家</span> : null}
          </div>
          <form className="room-chat-form" onSubmit={(event) => void submit(event)}>
            <input value={draft} maxLength={200} placeholder="输入消息…" onChange={(event) => setDraft(event.target.value)} disabled={sending} />
            <button type="submit" disabled={sending || !draft.trim()}>发送</button>
          </form>
        </section>
      ) : null}
    </aside>
  );
}
