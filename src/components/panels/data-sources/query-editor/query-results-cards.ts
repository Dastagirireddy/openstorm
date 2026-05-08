/**
 * Query Results Cards Component
 *
 * Displays query results as a grid of cards.
 */

import { html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import type { QueryResult } from './query-editor-panel.js';

@customElement('query-results-cards')
export class QueryResultsCards extends TailwindElement() {
  @property({ type: Object }) result: QueryResult | null = null;
  @property({ type: Number }) page = 1;
  @property({ type: Number }) pageSize = 20;

  static override styles = css`
    :host {
      display: block;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-3);
    }

    .card {
      background: var(--app-card-background);
      border: 1px solid var(--app-border);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      transition: all 0.15s ease;
    }

    .card:hover {
      border-color: var(--brand-primary);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--app-border);
    }

    .card-icon {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--brand-primary);
      color: white;
      font-size: 12px;
      font-weight: 600;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .card-field {
      display: flex;
      gap: var(--space-2);
      font-size: 12px;
    }

    .card-label {
      color: var(--app-disabled-foreground);
      font-weight: 500;
      min-width: 80px;
    }

    .card-value {
      color: var(--app-foreground);
      font-weight: 400;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .card-value.null {
      color: var(--app-disabled-foreground);
      font-style: italic;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: var(--space-3);
      padding-top: var(--space-3);
      border-top: 1px solid var(--app-border);
    }

    .pagination-info {
      font-size: 12px;
      color: var(--app-disabled-foreground);
    }

    .pagination-buttons {
      display: flex;
      gap: var(--space-1);
    }

    .page-button {
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid var(--app-border);
      background: var(--app-background);
      color: var(--app-foreground);
    }

    .page-button:hover:not(:disabled) {
      border-color: var(--brand-primary);
      background: var(--brand-primary);
      color: white;
    }

    .page-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .page-button.active {
      background: var(--brand-primary);
      color: white;
      border-color: var(--brand-primary);
    }
  `;

  private get totalPages(): number {
    if (!this.result) return 0;
    return Math.ceil(this.result.rowCount / this.pageSize);
  }

  private get paginatedRows(): Record<string, unknown>[] {
    if (!this.result) return [];
    const start = (this.page - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.result.rows.slice(start, end);
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private isNull(value: unknown): boolean {
    return value === null || value === undefined;
  }

  private handlePageChange(page: number) {
    this.page = Math.max(1, Math.min(page, this.totalPages));
  }

  override render() {
    if (!this.result || this.result.rows.length === 0) {
      return html`
        <div class="empty-state" style="text-align: center; padding: var(--space-8); color: var(--app-disabled-foreground);">
          <p class="text-[13px]">No results returned</p>
        </div>
      `;
    }

    const rows = this.paginatedRows;
    const columns = this.result.columns.slice(0, 8); // Show first 8 fields in cards

    return html`
      <div class="cards-grid">
        ${rows.map((row, i) =>
          html`
            <div class="card">
              <div class="card-header">
                <div class="card-icon">${i + 1}</div>
                <span class="text-[12px] font-medium">Record #${(this.page - 1) * this.pageSize + i + 1}</span>
              </div>

              <div class="card-body">
                ${columns.map((col) => {
                  const value = row[col.name];
                  return html`
                    <div class="card-field">
                      <span class="card-label">${col.name}</span>
                      <span class="card-value ${this.isNull(value) ? 'null' : ''}" title=${this.formatValue(value)}>
                        ${this.isNull(value) ? 'NULL' : this.formatValue(value)}
                      </span>
                    </div>
                  `;
                })}
              </div>
            </div>
          `
        )}
      </div>

      ${this.totalPages > 1
        ? html`
            <div class="pagination">
              <span class="pagination-info">
                Showing ${(this.page - 1) * this.pageSize + 1}-${Math.min(this.page * this.pageSize, this.result!.rowCount)} of ${this.result!.rowCount}
              </span>

              <div class="pagination-buttons">
                <button
                  class="page-button"
                  ?disabled=${this.page === 1}
                  @click=${() => this.handlePageChange(this.page - 1)}
                >
                  Previous
                </button>

                ${Array.from({ length: Math.min(5, this.totalPages) }, (_, i) => {
                  const pageNum = i + 1;
                  return html`
                    <button
                      class="page-button ${pageNum === this.page ? 'active' : ''}"
                      @click=${() => this.handlePageChange(pageNum)}
                    >
                      ${pageNum}
                    </button>
                  `;
                })}

                <button
                  class="page-button"
                  ?disabled=${this.page === this.totalPages}
                  @click=${() => this.handlePageChange(this.page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          `
        : nothing}
    `;
  }
}
