import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('ai-table')
export class AiTable extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.75em 0;
      overflow-x: auto;
    }

    .table-wrapper {
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 8px;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    thead {
      background: var(--ai-tool-background, #f9fafb);
    }

    th {
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      color: var(--ai-text, #111827);
      border-bottom: 1px solid var(--ai-panel-border, #e5e7eb);
      white-space: nowrap;
    }

    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--ai-panel-border, #e5e7eb);
      color: var(--ai-text, #111827);
    }

    tbody tr:last-child td {
      border-bottom: none;
    }

    tbody tr:hover {
      background: var(--ai-tool-background, #f9fafb);
    }

    .cell-number {
      font-family: monospace;
      color: var(--ai-primary, #3574f0);
    }

    .cell-boolean {
      color: var(--ai-success, #22c55e);
    }

    .cell-null {
      color: var(--ai-text-dim, #9ca3af);
      font-style: italic;
    }
  `;

  @property({ type: Array })
  headers: string[] = [];

  @property({ type: Array })
  rows: string[][] = [];

  @property({ type: Array })
  align: ('left' | 'center' | 'right')[] = [];

  private formatCell(value: string) {
    if (value === 'true' || value === 'false') {
      return html`<span class="cell-boolean">${value}</span>`;
    }
    if (value === 'null' || value === 'undefined') {
      return html`<span class="cell-null">${value}</span>`;
    }
    if (/^-?\d+\.?\d*$/.test(value)) {
      return html`<span class="cell-number">${value}</span>`;
    }
    return value;
  }

  render() {
    return html`
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              ${this.headers.map((h, i) => html`
                <th style="text-align: ${this.align[i] || 'left'}">${h}</th>
              `)}
            </tr>
          </thead>
          <tbody>
            ${this.rows.map(row => html`
              <tr>
                ${row.map((cell, i) => html`
                  <td style="text-align: ${this.align[i] || 'left'}">${this.formatCell(cell)}</td>
                `)}
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-table': AiTable;
  }
}
