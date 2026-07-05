import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { AIMessage as AIMessageType } from '../core/ai-state.js';
import './ai-message.js';

@customElement('openstorm-ai-message-list')
export class AIMessageList extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; }
    .message-list {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
  `;

  @property({ type: Array }) messages: AIMessageType[] = [];
  @property({ type: Object }) streamingMessage: AIMessageType | null = null;

  render() {
    const allMessages = this.streamingMessage
      ? [...this.messages, this.streamingMessage]
      : this.messages;

    return html`
      <div class="message-list">
        ${allMessages.map(msg => html`
          <openstorm-ai-message .message=${msg} .streaming=${msg === this.streamingMessage}></openstorm-ai-message>
        `)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-message-list': AIMessageList;
  }
}
