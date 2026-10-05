export const ROOM_VOICE_PHRASES = [
  { id: 'quick', text: '快一点，大家都等着呢！' },
  { id: 'thinking', text: '让我想一想。' },
  { id: 'nice', text: '这牌打得漂亮！' },
  { id: 'luck', text: '好运要来了！' },
] as const;

export type RoomVoicePhraseId = typeof ROOM_VOICE_PHRASES[number]['id'];

export function roomVoicePhrase(id: string) {
  return ROOM_VOICE_PHRASES.find((phrase) => phrase.id === id);
}
