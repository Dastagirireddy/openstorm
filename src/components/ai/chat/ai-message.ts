import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { AIMessage as AIMessageType } from '../core/ai-state.js';
import './ai-content.js';
import './ai-tool-call.js';
import { formatTime } from '../lib/formatters.js';

@customElement('openstorm-ai-message')
export class AIMessage extends LitElement {
  static styles = css`
    :host { display: block; }
    .user-message {
      display: flex;
      flex-direction: column;
      padding: 14px 18px;
      margin-bottom: 20px;
      background: linear-gradient(135deg, color-mix(in srgb, var(--ai-primary, #3574f0) 6%, transparent) 0%, color-mix(in srgb, var(--ai-secondary, #5a9cf8) 4%, transparent) 100%);
      border-left: 3px solid var(--ai-primary, #3574f0);
      border-radius: 0 8px 8px 0;
      user-select: text;
    }
    .user-meta {
      font-size: 11px;
      color: var(--ai-text-muted, #6b7280);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .user-content {
      font-size: 14px;
      font-weight: 500;
      color: var(--ai-text, #1f2937);
      line-height: 1.6;
    }
    .assistant-message {
      display: flex;
      flex-direction: column;
      padding: 0 0 16px 0;
    }
    .assistant-content {
      font-size: 14px;
      color: var(--ai-text, #1f2937);
      line-height: 1.6;
      user-select: text;
    }
    .error-message {
      display: flex;
      flex-direction: column;
      padding: 12px 16px;
      margin-bottom: 16px;
      background: color-mix(in srgb, var(--ai-error, #ef4444) 8%, transparent);
      border-left: 3px solid var(--ai-error, #ef4444);
      border-radius: 0 6px 6px 0;
    }
    .error-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ai-error, #ef4444);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .error-content {
      font-size: 13px;
      color: var(--ai-text, #1f2937);
      line-height: 1.5;
    }
    .tool-calls {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .actions-row {
      margin-top: 8px;
    }
  `;

  @property({ type: Object }) message: AIMessageType | null = null;
  @property({ type: Boolean }) streaming = false;

  private formatTime(ts: number): string {
    return formatTime(ts);
  }

  render() {
    if (!this.message) return html``;
    const isUser = this.message.role === 'user';
    const isError = this.message.isError === true;

    if (isUser) {
      return html`
        <div class="user-message">
          <div class="user-meta">
            <span>You</span>
            <span>·</span>
            <span>${this.formatTime(this.message.timestamp)}</span>
          </div>
          <div class="user-content">
            <openstorm-ai-content .content=${this.message.content} .streaming=${this.streaming}></openstorm-ai-content>
          </div>
        </div>
      `;
    }

    if (isError) {
      return html`
        <div class="error-message">
          <div class="error-header">
            <span>Error</span>
          </div>
          <div class="error-content">
            ${this.message.content}
          </div>
        </div>
      `;
    }

    return html`
      <div class="assistant-message">
        <div class="assistant-content">
          <openstorm-ai-content .content=${this.message.content} .streaming=${this.streaming} .filterPlan=${true}></openstorm-ai-content>
          ${this.message.toolCalls?.length ? html`
            <div class="tool-calls">
              ${this.message.toolCalls.map(tc => html`
                <openstorm-ai-tool-call .toolCall=${tc}></openstorm-ai-tool-call>
              `)}
            </div>
          ` : ''}
        </div>
        ${!this.streaming ? html`
          <div class="actions-row">
            <openstorm-ai-actions
              .messageId=${this.message.id}
              .content=${this.message.content}
            ></openstorm-ai-actions>
          </div>
        ` : ''}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-message': AIMessage;
  }
}
