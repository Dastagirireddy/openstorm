import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ProviderInfo } from '../../lib/types/ai-types.js';

/**
 * Minimal provider row for the Models panel sidebar.
 * Shows: status dot, name, status text, toggle.
 * Click row → opens config modal.
 */
@customElement('provider-card')
export class ProviderCard extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .provider-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      cursor: pointer;
      transition: background-color 0.15s;
      border-radius: 6px;
    }

    .provider-row:hover {
      background-color: var(--app-hover-background, rgba(255, 255, 255, 0.05));
      border-radius: 0;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .provider-name {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--app-foreground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toggle-switch {
      position: relative;
      display: inline-flex;
      width: 36px;
      height: 20px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      transition: background-color 0.2s;
      flex-shrink: 0;
      padding: 0;
    }

    .toggle-circle {
      pointer-events: none;
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: transform 0.2s;
      transform: translateX(var(--toggle-x, 2px));
      margin-top: 1px;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .pulse {
      animation: pulse 1.5s infinite;
    }
  `;

  @property({ type: Object }) provider?: ProviderInfo;
  @property({ type: Boolean }) enabled = false;
  @property({ type: String }) status: 'connected' | 'connecting' | 'error' | 'idle' = 'idle';
  @property({ type: String }) categoryColor = '#6b7280';

  private get statusColor(): string {
    switch (this.status) {
      case 'connected': return 'var(--status-success, #22c55e)';
      case 'connecting': return 'var(--status-warning, #eab308)';
      case 'error': return 'var(--status-error, #ef4444)';
      default: return this.categoryColor;
    }
  }

  private openConfig(e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('open-config-modal', {
      detail: { provider: this.provider },
      bubbles: true,
      composed: true,
    }));
  }

  private toggleEnabled(e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('toggle-provider', {
      detail: { providerId: this.provider?.id, enabled: !this.enabled },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this.provider) return nothing;

    return html`
      <div class="provider-row" @click=${this.openConfig}>
        <span
          class="status-dot ${this.status === 'connecting' ? 'pulse' : ''}"
          style="background-color: ${this.statusColor}">
        </span>
        <span class="provider-name">${this.provider.name}</span>
        <button
          class="toggle-switch"
          style="background-color: ${this.enabled ? 'var(--app-button-background, #6366f1)' : 'var(--app-border, #374151)'}; --toggle-x: ${this.enabled ? '16px' : '2px'};"
          @click=${this.toggleEnabled}>
          <span class="toggle-circle"></span>
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'provider-card': ProviderCard;
  }
}
