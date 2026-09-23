/* global Component */
Component({
  properties: {
    messages: { type: Array, value: [] },
    members: { type: Array, value: [] },
    ownSeat: { type: String, value: '' },
  },
  data: { draft: '', sending: false, scrollIntoView: '' },
  observers: {
    messages(messages) {
      if (!messages || !messages.length) return;
      const last = messages[messages.length - 1];
      if (last && last.id) this.setData({ scrollIntoView: 'chat-message-' + last.id });
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
  },
});
