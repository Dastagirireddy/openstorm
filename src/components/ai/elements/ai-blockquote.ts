import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('ai-blockquote')
export class AiBlockquote extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.75em 0;
    }

    .blockquote {
      position: relative;
      padding: 12px 16px;
      padding-left: 20px;
      background: var(--ai-tool-background, #f9fafb);
      border-left: 3px solid var(--ai-primary, #3574f0);
      border-radius: 0 8px 8px 0;
      color: var(--ai-text, #111827);
      font-style: italic;
    }

    .blockquote::before {
      content: '"';
      position: absolute;
      top: 8px;
      left: 8px;
      font-size: 24px;
      color: var(--ai-primary, #3574f0);
      opacity: 0.5;
      font-style: normal;
    }

    .blockquote-content {
      padding-left: 8px;
    }

    .citation {
      margin-top: 8px;
      font-size: 12px;
      color: var(--ai-text-dim, #9ca3af);
      font-style: normal;
    }
  `;

  @property({ type: String })
  content = '';

  @property({ type: String })
  citation = '';

  render() {
    return html`
      <div class="blockquote">
        <div class="blockquote-content">${this.content}</div>
        ${this.citation ? html`<div class="citation">— ${this.citation}</div>` : ''}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-blockquote': AiBlockquote;
  }
}
