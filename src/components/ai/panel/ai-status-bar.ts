import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { formatTokens, formatCost, formatLatency } from '../lib/formatters.js';

@customElement('openstorm-ai-status-bar')
export class AIStatusBar extends LitElement {
  static styles = css`
    :host { display: block; }
    .status-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 4px 16px;
      border-top: 1px solid var(--os-border);
      background: var(--os-surface);
      font-size: var(--os-text-xs);
      color: var(--os-text-subtle);
    }
    .metric {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .metric-value {
      font-family: var(--os-font-mono);
      color: var(--os-text-muted);
    }
  `;

  @property({ type: Number }) totalTokens = 0;
  @property({ type: Number }) totalCost = 0;
  @property({ type: Number }) lastLatencyMs = 0;

  render() {
    return html`
      <div class="status-bar">
        <div class="metric">
          <span>Tokens:</span>
          <span class="metric-value">${formatTokens(this.totalTokens)}</span>
        </div>
        <div class="metric">
          <span>Cost:</span>
          <span class="metric-value">${formatCost(this.totalCost)}</span>
        </div>
        <div class="metric">
          <span>Latency:</span>
          <span class="metric-value">${formatLatency(this.lastLatencyMs)}</span>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-status-bar': AIStatusBar;
  }
}
