/**
 * Query Results JSON Component
 *
 * Displays query results as formatted JSON.
 */

import { html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import type { QueryResult } from './query-editor-panel.js';

@customElement('query-results-json')
export class QueryResultsJson extends TailwindElement() {
  @property({ type: Object }) result: QueryResult | null = null;

  static override styles = css`
    :host {
      display: block;
    }

    .json-container {
      background: var(--app-background);
      border: 1px solid var(--app-border);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      overflow: auto;
      max-height: calc(100% - 40px);
    }

    pre {
      margin: 0;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: var(--app-foreground);
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .json-info {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
      padding: var(--space-2);
      background: var(--app-toolbar-background);
      border-radius: var(--radius-sm);
      font-size: 12px;
      color: var(--app-disabled-foreground);
    }

    .copy-button {
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid var(--app-border);
      background: var(--app-background);
      color: var(--app-foreground);
    }

    .copy-button:hover {
      border-color: var(--brand-primary);
      color: var(--brand-primary);
    }
  `;

  private get jsonOutput(): string {
    if (!this.result) return '[]';
    return JSON.stringify(this.result.rows, null, 2);
  }

  private async copyToClipboard() {
    try {
      await navigator.clipboard.writeText(this.jsonOutput);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }

  override render() {
    if (!this.result) {
      return html`
        <div class="empty-state" style="text-align: center; padding: var(--space-8); color: var(--app-disabled-foreground);">
          <p class="text-[13px]">No results to display</p>
        </div>
      `;
    }

    return html`
      <div class="json-info">
        <span>${this.result.rowCount} rows</span>
        <span>•</span>
        <span>${this.result.executionTimeMs}ms</span>
        <span>•</span>
        <span>${new Blob([this.jsonOutput]).size} bytes</span>

        <button class="copy-button" style="margin-left: auto;" @click=${() => this.copyToClipboard()}>
          <iconify-icon icon="mdi:content-copy" width="14" height="14" style="margin-right: 4px;"></iconify-icon>
          Copy JSON
        </button>
      </div>

      <div class="json-container">
        <pre>${this.jsonOutput}</pre>
      </div>
    `;
  }
}
