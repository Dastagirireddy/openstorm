import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface ListItem {
  content: string;
  nested?: ListItem[];
}

@customElement('ai-list')
export class AiList extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.5em 0;
    }

    ul, ol {
      margin: 0;
      padding-left: 20px;
      color: var(--ai-text, #111827);
    }

    li {
      padding: 3px 0;
      line-height: 1.5;
    }

    li::marker {
      color: var(--ai-primary, #3574f0);
    }

    ul li::marker {
      content: '•';
    }

    .nested {
      margin-top: 4px;
      margin-bottom: 4px;
    }
  `;

  @property({ type: Array })
  items: string[] = [];

  @property({ type: Boolean })
  ordered = false;

  private renderItem(item: string) {
    // Handle inline code
    const parts = item.split(/(`[^`]+`)/g);
    return parts.map(part => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return html`<code class="ai-inline-code">${part.slice(1, -1)}</code>`;
      }
      return part;
    });
  }

  render() {
    const listTag = this.ordered ? 'ol' : 'ul';
    
    return html`
      <${listTag}>
        ${this.items.map(item => html`
          <li>${this.renderItem(item)}</li>
        `)}
      </${listTag}>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-list': AiList;
  }
}
