import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('ai-divider')
export class AiDivider extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 1em 0;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--ai-text-dim, #9ca3af);
    }

    .divider-line {
      flex: 1;
      height: 1px;
      background: var(--ai-panel-border, #e5e7eb);
    }

    .divider-content {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
  `;

  @property({ type: String })
  label = '';

  render() {
    return html`
      <div class="divider">
        <div class="divider-line"></div>
        ${this.label ? html`<span class="divider-content">${this.label}</span>` : ''}
        <div class="divider-line"></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-divider': AiDivider;
  }
}
