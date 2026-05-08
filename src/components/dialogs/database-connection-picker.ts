/**
 * Database Connection Picker
 *
 * Zed-style centered command palette for selecting database connections.
 */

import { html, nothing, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import { dispatch } from '../../lib/types/events.js';

export interface DatabaseConnection {
  id: string;
  name: string;
  dbType: string;
  host?: string;
  database?: string;
}

@customElement('database-connection-picker')
export class DatabaseConnectionPicker extends TailwindElement(css`
  :host {
    display: none;
  }

  :host([visible]) {
    display: block;
  }
`) {
  @property({ type: Boolean, reflect: true }) visible = false;
  @state() private connections: DatabaseConnection[] = [];
  @state() private filteredConnections: DatabaseConnection[] = [];
  @state() private isLoading = false;
  @state() private projectPath: string | null = null;
  @state() private searchQuery = '';

  async show(projectPath: string | null): Promise<void> {
    this.projectPath = projectPath;
    this.visible = true;
    this.searchQuery = '';
    this.isLoading = true;

    try {
      const result = await invoke<DatabaseConnection[]>('db_list_connections', {
        projectPath,
      });
      this.connections = result;
      this.filteredConnections = result;
    } catch (err) {
      console.error('[ConnectionPicker] Failed to load connections:', err);
      this.connections = [];
      this.filteredConnections = [];
    } finally {
      this.isLoading = false;
      this.requestUpdate();
      // Focus input after render
      requestAnimationFrame(() => {
        const input = this.renderRoot.querySelector('#search-input') as HTMLInputElement;
        input?.focus();
      });
    }
  }

  hide(): void {
    this.visible = false;
    this.connections = [];
    this.filteredConnections = [];
    this.searchQuery = '';
    this.requestUpdate();
  }

  private handleSearch(e: InputEvent): void {
    const query = (e.target as HTMLInputElement).value.toLowerCase();
    this.searchQuery = query;
    this.filteredConnections = this.connections.filter(conn =>
      conn.name.toLowerCase().includes(query) ||
      conn.dbType.toLowerCase().includes(query) ||
      (conn.database || '').toLowerCase().includes(query) ||
      (conn.host || '').toLowerCase().includes(query)
    );
    this.requestUpdate();
  }

  private handleSelect(connection: DatabaseConnection): void {
    this.hide();
    dispatch('open-query-editor', {
      connectionId: connection.id,
      connectionName: connection.name,
      dialect: connection.dbType as 'postgresql' | 'mysql',
      tableName: '',
    });
  }

  private handleCreateNew(): void {
    this.hide();
    dispatch('set-active-activity', { activity: 'database' });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
    }
  }

  override render() {
    if (!this.visible) return nothing;

    return html`
      <div
        class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
        style="background: rgba(0, 0, 0, 0.4);"
        @click=${() => this.hide()}
        @keydown=${this.handleKeyDown}
      >
        <div
          class="w-[520px] rounded-xl shadow-2xl border overflow-hidden"
          style="
            background: var(--app-bg);
            border-color: var(--app-border);
            box-shadow:
              0 0 0 1px rgba(0, 0, 0, 0.05),
              0 20px 60px rgba(0, 0, 0, 0.4);
          "
          @click=${(e: Event) => e.stopPropagation()}
        >
          <!-- Search Input -->
          <div
            class="flex items-center gap-2 px-4 py-3 border-b"
            style="border-color: var(--app-border);"
          >
            <iconify-icon
              icon="mdi:magnify"
              width="18"
              style="color: var(--app-disabled-foreground);"
            ></iconify-icon>
            <input
              id="search-input"
              type="text"
              class="flex-1 bg-transparent border-none outline-none text-sm"
              style="color: var(--app-foreground);"
              placeholder="Select a database connection..."
              @input=${this.handleSearch}
              @keydown=${this.handleKeyDown}
            />
            <kbd
              class="px-1.5 py-0.5 text-[10px] rounded border"
              style="
                background: var(--app-tab-inactive);
                border-color: var(--app-border);
                color: var(--app-disabled-foreground);
              "
            >
              ESC
            </kbd>
          </div>

          <!-- Content -->
          <div class="max-h-[340px] overflow-y-auto">
            ${this.isLoading
              ? html`
                  <div class="flex items-center justify-center py-12">
                    <iconify-icon icon="line-md:loading-loop" width="20" style="color: var(--brand-primary);"></iconify-icon>
                  </div>
                `
              : this.filteredConnections.length === 0 && this.connections.length === 0
                ? html`
                    <div class="text-center py-10">
                      <div
                        class="w-12 h-12 rounded-lg mx-auto mb-3 flex items-center justify-center"
                        style="background: var(--brand-primary)/10;"
                      >
                        <iconify-icon
                          icon="mdi:database-off-outline"
                          width="24"
                          height="24"
                          style="color: var(--brand-primary);"
                        ></iconify-icon>
                      </div>
                      <p class="text-sm font-medium" style="color: var(--app-foreground);">No database connections</p>
                      <button
                        class="mt-3 px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
                        style="background: var(--brand-primary); color: white;"
                        @click=${() => this.handleCreateNew()}
                      >
                        Create Connection
                      </button>
                    </div>
                  `
                : this.filteredConnections.length === 0
                  ? html`
                      <div class="text-center py-8">
                        <p class="text-sm" style="color: var(--app-disabled-foreground);">
                          No connections matching "${this.searchQuery}"
                        </p>
                      </div>
                    `
                  : html`
                      <div class="p-1.5">
                        ${this.filteredConnections.map(conn => html`
                          <button
                            class="w-full px-3 py-2 rounded-lg text-left transition-colors group flex items-center gap-3"
                            @click=${() => this.handleSelect(conn)}
                            @mouseenter=${(e: Event) => {
                              (e.target as HTMLElement).closest('button')!.style.background = 'var(--app-tab-inactive)';
                            }}
                            @mouseleave=${(e: Event) => {
                              (e.target as HTMLElement).closest('button')!.style.background = 'transparent';
                            }}
                          >
                            <div
                              class="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                              style="background: var(--brand-primary)/10;"
                            >
                              <iconify-icon
                                icon="mdi:database"
                                width="16"
                                height="16"
                                style="color: var(--brand-primary);"
                              ></iconify-icon>
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="text-sm font-medium truncate" style="color: var(--app-foreground);">
                                ${conn.name}
                              </div>
                              <div class="text-xs mt-0.5" style="color: var(--app-disabled-foreground);">
                                ${conn.dbType}
                                ${conn.database ? html` • ${conn.database}` : nothing}
                                ${conn.host ? html` • ${conn.host}` : nothing}
                              </div>
                            </div>
                            <iconify-icon
                              icon="mdi:chevron-right"
                              width="16"
                              class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              style="color: var(--app-disabled-foreground);"
                            ></iconify-icon>
                          </button>
                        `)}
                      </div>
                    `}
          </div>

          <!-- Footer -->
          ${this.filteredConnections.length > 0
            ? html`
                <div
                  class="px-4 py-2 border-t text-[11px]"
                  style="
                    border-color: var(--app-border);
                    background: var(--app-toolbar-background);
                    color: var(--app-disabled-foreground);
                  "
                >
                  <span class="flex items-center gap-2">
                    <kbd
                      class="px-1 py-0.5 rounded border"
                      style="background: var(--app-bg); border-color: var(--app-border);"
                    >
                      ↑↓
                    </kbd>
                    <span>to navigate</span>
                    <kbd
                      class="px-1 py-0.5 rounded border"
                      style="background: var(--app-bg); border-color: var(--app-border);"
                    >
                      ↵
                    </kbd>
                    <span>to select</span>
                  </span>
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }
}
