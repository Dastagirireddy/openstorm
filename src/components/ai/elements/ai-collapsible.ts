import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('ai-collapsible')
export class AiCollapsible extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.75em 0;
    }

    .collapsible {
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 8px;
      overflow: hidden;
    }

    .collapsible-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: var(--ai-tool-background, #f9fafb);
      cursor: pointer;
      user-select: none;
      transition: background 0.15s ease;
    }

    .collapsible-header:hover {
      background: var(--ai-panel-border, #e5e7eb);
    }

    .collapsible-icon {
      color: var(--ai-text-dim, #9ca3af);
      transition: transform 0.2s ease;
    }

    .collapsible-icon.expanded {
      transform: rotate(90deg);
    }

    .collapsible-title {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--ai-text, #111827);
    }

    .collapsible-badge {
      font-size: 11px;
      color: var(--ai-text-dim, #9ca3af);
      background: var(--ai-panel-border, #e5e7eb);
      padding: 2px 6px;
      border-radius: 10px;
    }

    .collapsible-content {
      padding: 0;
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.25s ease, padding 0.25s ease;
    }

    .collapsible-content.expanded {
      padding: 12px;
      max-height: 2000px;
    }

    .collapsible-divider {
      height: 1px;
      background: var(--ai-panel-border, #e5e7eb);
    }
  `;

  @property({ type: String })
  title = '';

  @property({ type: String })
  badge = '';

  @property({ type: Boolean, reflect: true })
  expanded = false;

  private toggle() {
    this.expanded = !this.expanded;
  }

  render() {
    return html`
      <div class="collapsible">
        <div class="collapsible-header" @click=${this.toggle}>
          <iconify-icon 
            class="collapsible-icon ${this.expanded ? 'expanded' : ''}" 
            icon="lucide:chevron-right" 
            width="16"
          ></iconify-icon>
          <span class="collapsible-title">${this.title}</span>
          ${this.badge ? html`<span class="collapsible-badge">${this.badge}</span>` : ''}
        </div>
        <div class="collapsible-divider"></div>
        <div class="collapsible-content ${this.expanded ? 'expanded' : ''}">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-collapsible': AiCollapsible;
  }
}
