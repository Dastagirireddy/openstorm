/**
 * Query Results Table Component
 *
 * Displays query results as a data grid.
 */

import { html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import type { QueryResult } from './query-editor-panel.js';

@customElement('query-results-table')
export class QueryResultsTable extends TailwindElement() {
  @property({ type: Object }) result: QueryResult | null = null;
  @property({ type: Number }) page = 1;
  @property({ type: Number }) pageSize = 100;

  static override styles = css`
    :host {
      display: block;
      overflow: auto;
    }

    .table-container {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th {
      text-align: left;
      padding: var(--space-2) var(--space-3);
      background: var(--app-toolbar-background);
      border-bottom: 1px solid var(--app-border);
      font-weight: 600;
      color: var(--app-foreground);
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }

    th:hover {
      background: var(--app-tab-inactive);
    }

    td {
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--app-border);
      color: var(--app-foreground);
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    tr:hover td {
      background: var(--app-tab-inactive);
    }

    .null-value {
      color: var(--app-disabled-foreground);
      font-style: italic;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2) 0;
      margin-top: var(--space-2);
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
    const columns = this.result.columns;

    return html`
      <div class="table-container">
        <table>
          <thead>
            <tr>
              ${columns.map(
                (col) => html`
                  <th title="${col.name} (${col.typeName || 'unknown'})">
                    ${col.name}
                  </th>
                `
              )}
            </tr>
          </thead>
          <tbody>
            ${rows.map(
              (row) => html`
                <tr>
                  ${columns.map(
                    (col) => {
                      const value = row[col.name];
                      return html`
                        <td class="${this.isNull(value) ? 'null-value' : ''}" title=${this.formatValue(value)}>
                          ${this.isNull(value) ? 'NULL' : this.formatValue(value)}
                        </td>
                      `;
                    }
                  )}
                </tr>
              `
            )}
          </tbody>
        </table>
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
