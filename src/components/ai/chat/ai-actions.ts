import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('openstorm-ai-actions')
export class AIActions extends LitElement {
  static styles = css`
    :host { display: flex; }
    .actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: var(--os-radius-sm);
      border: none;
      background: transparent;
      color: var(--os-text-subtle);
      cursor: pointer;
      font-size: var(--os-text-xs);
      font-family: var(--os-font-sans);
      transition: all var(--os-transition-fast);
    }
    .btn:hover { background: var(--os-surface-2); color: var(--os-text); }
    .btn.active { color: var(--os-accent); }
    .btn.feedback { font-size: 14px; }
  `;

  @property({ type: String }) messageId = '';
  @property({ type: String }) content = '';
  @state() private copied = false;

  private async copyContent() {
    try {
      await navigator.clipboard.writeText(this.content);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = this.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    this.copied = true;
    setTimeout(() => { this.copied = false; }, 2000);
  }

  private retry() {
    this.dispatchEvent(new CustomEvent('ai:retry', {
      detail: { messageId: this.messageId },
      bubbles: true,
      composed: true,
    }));
  }

  private feedback(type: 'up' | 'down') {
    this.dispatchEvent(new CustomEvent('ai:feedback', {
      detail: { messageId: this.messageId, type },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="actions">
        <button class="btn ${this.copied ? 'active' : ''}" @click=${this.copyContent} title="Copy">
          ${this.copied ? '✓' : '📋'}
        </button>
        <button class="btn" @click=${this.retry} title="Retry">🔄</button>
        <button class="btn feedback" @click=${() => this.feedback('up')} title="Helpful">👍</button>
        <button class="btn feedback" @click=${() => this.feedback('down')} title="Not helpful">👎</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-actions': AIActions;
  }
}
