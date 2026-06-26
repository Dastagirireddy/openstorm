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

    ::slotted(table) {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    ::slotted(thead) {
      background: linear-gradient(135deg, color-mix(in srgb, var(--ai-primary, #3574f0) 8%, transparent) 0%, color-mix(in srgb, var(--ai-secondary, #5a9cf8) 5%, transparent) 100%);
    }

    ::slotted(th) {
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--ai-primary, #3574f0);
      border-bottom: 2px solid var(--ai-panel-border, #e5e7eb);
      white-space: nowrap;
    }

    ::slotted(td) {
      padding: 12px 16px;
      border-bottom: 1px solid color-mix(in srgb, var(--ai-panel-border, #e5e7eb) 60%, transparent);
      color: var(--ai-text, #374151);
      transition: background-color 0.15s ease;
    }

    ::slotted(tbody tr:last-child td) {
      border-bottom: none;
    }

    ::slotted(tbody tr:hover) {
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 4%, transparent);
    }

    ::slotted(tbody tr:nth-child(even)) {
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 2%, transparent);
    }

    ::slotted(tbody tr:nth-child(even):hover) {
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 5%, transparent);
    }

    .table-wrapper {
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
    }

    thead {
      background: linear-gradient(135deg, color-mix(in srgb, var(--ai-primary, #3574f0) 8%, transparent) 0%, color-mix(in srgb, var(--ai-secondary, #5a9cf8) 5%, transparent) 100%);
    }

    th {
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--ai-primary, #3574f0);
      border-bottom: 2px solid var(--ai-panel-border, #e5e7eb);
      white-space: nowrap;
    }

    td {
      padding: 12px 16px;
      border-bottom: 1px solid color-mix(in srgb, var(--ai-panel-border, #e5e7eb) 60%, transparent);
      color: var(--ai-text, #374151);
      transition: background-color 0.15s ease;
    }

    tbody tr:last-child td {
      border-bottom: none;
    }

    tbody tr:hover {
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 4%, transparent);
    }

    tbody tr:nth-child(even) {
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 2%, transparent);
    }

    tbody tr:nth-child(even):hover {
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 5%, transparent);
    }

    .cell-number {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      color: var(--ai-primary, #3574f0);
      font-weight: 500;
    }

    .cell-boolean {
      color: var(--ai-success, #22c55e);
      font-weight: 500;
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
    if (this.headers.length > 0 || this.rows.length > 0) {
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
    return html`<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-table': AiTable;
  }
}
