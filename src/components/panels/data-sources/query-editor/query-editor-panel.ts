/**
 * Query Editor Panel Wrapper
 *
 * Wrapper that opens database-query-editor in the main editor area.
 * This component listens for 'open-query-editor' events and creates
 * the editor in the main workspace.
 */

import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import './database-query-editor.js';

@customElement('query-editor-panel')
export class QueryEditorPanel extends TailwindElement() {
  @property({ type: String }) projectPath: string | null = null;
  @property({ type: String }) activeConnectionId: string | null = null;

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      background: var(--app-background);
      color: var(--app-disabled-foreground);
    }
  `;

  override render() {
    return html`
      <div class="text-center">
        <iconify-icon
          icon="mdi:database-outline"
          width="48"
          height="48"
          style="margin-bottom: 16px;"
        ></iconify-icon>
        <p class="text-[13px]">Select a database connection to open query editor</p>
      </div>
    `;
  }
}
