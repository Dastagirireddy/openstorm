import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('os-button')
export class OSButton extends LitElement {
  static styles = css`
    :host { display: inline-flex; }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: var(--os-font-sans);
      font-size: var(--os-text-sm);
      font-weight: 500;
      border-radius: var(--os-radius-md);
      border: 1px solid transparent;
      cursor: pointer;
      transition: all var(--os-transition-fast);
      white-space: nowrap;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button:focus-visible { outline: 2px solid var(--os-accent); outline-offset: 1px; }
    .sm { padding: 4px 10px; font-size: var(--os-text-xs); }
    .md { padding: 6px 14px; }
    .lg { padding: 8px 18px; font-size: var(--os-text-base); }
    .primary {
      background: var(--os-accent);
      color: #fff;
      border-color: var(--os-accent);
    }
    .primary:hover:not(:disabled) { background: var(--os-accent-hover); }
    .danger {
      background: transparent;
      color: var(--os-danger);
      border-color: var(--os-danger);
    }
    .danger:hover:not(:disabled) { background: rgba(248, 81, 73, 0.1); }
    .ghost {
      background: transparent;
      color: var(--os-text-muted);
      border-color: transparent;
    }
    .ghost:hover:not(:disabled) { background: var(--os-surface-2); color: var(--os-text); }
    .outline {
      background: transparent;
      color: var(--os-text);
      border-color: var(--os-border);
    }
    .outline:hover:not(:disabled) { background: var(--os-surface-2); }
  `;

  @property({ type: String }) variant: 'primary' | 'danger' | 'ghost' | 'outline' = 'ghost';
  @property({ type: String }) size: 'sm' | 'md' | 'lg' = 'md';
  @property({ type: Boolean }) disabled = false;

  render() {
    return html`
      <button
        class="${this.variant} ${this.size}"
        ?disabled=${this.disabled}
        @click=${(e: Event) => this.dispatchEvent(new CustomEvent('button-click', { detail: { originalEvent: e }, bubbles: true, composed: true }))}
      >
        <slot></slot>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'os-button': OSButton;
  }
}
