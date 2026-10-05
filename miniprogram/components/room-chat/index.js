/* global Component */
const { phrases } = require('../../utils/voice-phrases');
Component({
  properties: {
    messages: { type: Array, value: [] },
    members: { type: Array, value: [] },
    ownSeat: { type: String, value: '' },
    enableVoice: { type: Boolean, value: false },
  },
  data: { draft: '', sending: false, scrollIntoView: '', voiceMuted: false, voicePhrases: phrases },
  lifetimes: {
    attached() {
      this.lastSeenMessageId = this.data.messages.length ? this.data.messages[this.data.messages.length - 1].id : null;
      this.voiceAudio = wx.createInnerAudioContext();
    },
    detached() {
      if (this.voiceAudio) this.voiceAudio.destroy();
    },
  },
  observers: {
    messages(messages) {
      if (!messages || !messages.length) return;
      const last = messages[messages.length - 1];
      if (last && last.id) this.setData({ scrollIntoView: 'chat-message-' + last.id });
      if (this.lastSeenMessageId === undefined) {
        this.lastSeenMessageId = last.id;
        return;
      }
      const previousIndex = messages.findIndex((message) => message.id === this.lastSeenMessageId);
      const fresh = previousIndex < 0 ? this.lastSeenMessageId === null ? messages : [] : messages.slice(previousIndex + 1);
      this.lastSeenMessageId = last.id;
      const voice = fresh.filter((message) => message.kind === 'voice' && phrases.some((phrase) => phrase.id === message.voiceId)).pop();
      if (!voice || !this.data.enableVoice || this.data.voiceMuted || !this.voiceAudio) return;
      this.voiceAudio.stop();
      this.voiceAudio.src = '/assets/voice/' + voice.voiceId + '.m4a';
      this.voiceAudio.play();
    },
  },
  methods: {
    onInput(event) {
      this.setData({ draft: event.detail.value });
    },
    onSend() {
      const text = String(this.data.draft || '').trim();
      if (!text || this.data.sending) return;
      this.setData({ sending: true });
      this.triggerEvent('send', { payload: { kind: 'text', text } }, {
        bubbles: false,
        composed: true,
      });
      this.setData({ draft: '', sending: false });
    },
    onInteraction(event) {
      if (this.data.sending) return;
      const { kind, seat, nickname } = event.currentTarget.dataset;
      if (!kind || !nickname) return;
      this.setData({ sending: true });
      this.triggerEvent('send', {
        payload: { kind: 'interaction', interaction: kind, target: { nickname, ...(seat ? { seat } : {}) } },
      }, { bubbles: false, composed: true });
      this.setData({ sending: false });
    },
    onVoice(event) {
      const voiceId = event.currentTarget.dataset.id;
      if (this.data.sending || !phrases.some((phrase) => phrase.id === voiceId)) return;
      this.triggerEvent('send', { payload: { kind: 'voice', voiceId } }, { bubbles: false, composed: true });
    },
    onToggleVoiceMute() {
      const muted = !this.data.voiceMuted;
      if (muted && this.voiceAudio) this.voiceAudio.stop();
      this.setData({ voiceMuted: muted });
    },
  },
});
