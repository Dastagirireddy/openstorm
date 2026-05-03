import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import { getDatabaseVendor } from '../data-source-vendors.js';
import { getDatabaseFormDefinition } from '../database-form-registry.js';
import type { DatabaseType } from '../data-source-types.js';

export interface SQLiteConnectionFormData {
  name: string;
  type: DatabaseType;
  filePath: string;
  readOnly?: boolean;
  walMode?: boolean;
  scope: 'global' | 'project';
}

@customElement('sqlite-connection-form')
export class SQLiteConnectionForm extends TailwindElement() {
  @property({ type: String })
  vendorId: DatabaseType = 'sqlite';

  @state() private name = '';
  @state() private filePath = '';
  @state() private readOnly = false;
  @state() private walMode = true;
  @state() private isGlobal = false;
  @state() private isTesting = false;
  @state() private testResult: 'success' | 'error' | null = null;
  @state() private testSuccessMessage = '';
  @state() private testErrorMessage = '';
  @state() private showErrorDetails = false;

  firstUpdated() {
    // SQLite doesn't use default port
  }

  private async handleBrowseFile() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: 'Select SQLite Database File',
        multiple: false,
        filters: [{
          name: 'SQLite',
          extensions: ['db', 'sqlite', 'sqlite3'],
        }],
      });

      if (selected) {
        this.filePath = selected as string;
      }
    } catch (err) {
      console.error('Failed to open file picker:', err);
    }
  }

  private handleSubmit(e: Event) {
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent<SQLiteConnectionFormData>('submit', {
        detail: {
          name: this.name,
          type: this.vendorId,
          filePath: this.filePath,
          readOnly: this.readOnly,
          walMode: this.walMode,
          scope: this.isGlobal ? 'global' : 'project',
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleCancel() {
    this.dispatchEvent(
      new CustomEvent('cancel', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async handleTestConnection() {
    if (!this.filePath) {
      this.testResult = 'error';
      this.testErrorMessage = 'Please select a database file';
      return;
    }

    this.isTesting = true;
    this.testResult = null;
    this.testSuccessMessage = '';
    this.testErrorMessage = '';
    this.showErrorDetails = false;

    try {
      await invoke('db_test_connection', {
        config: {
          id: null,
          name: this.name || 'test',
          type: this.vendorId,
          host: null,
          port: 0,
          username: null,
          password: null,
          database: null,
          filePath: this.filePath,
          scope: 'project',
          options: {
            readOnly: this.readOnly.toString(),
            walMode: this.walMode.toString(),
          },
        },
        projectPath: null,
      });
      this.testResult = 'success';
      this.testSuccessMessage = 'Successfully connected to SQLite database';
    } catch (err) {
      this.testResult = 'error';
      this.testErrorMessage = err instanceof Error ? err.message : 'Failed to connect';
      this.showErrorDetails = true; // Auto-expand on error
    } finally {
      this.isTesting = false;
    }
  }

  private toggleErrorDetails() {
    this.showErrorDetails = !this.showErrorDetails;
  }

  render() {
    const vendor = getDatabaseVendor(this.vendorId);
    const formDef = getDatabaseFormDefinition(this.vendorId);

    return html`
      <div class="flex flex-col h-full">
        <!-- Scrollable Form Content -->
        <div class="flex-1 overflow-y-auto space-y-3 p-1">
          <!-- Vendor Info Banner -->
          ${vendor
            ? html`
                <div class="flex items-center gap-2.5 p-2.5 rounded-lg bg-gradient-to-r ${vendor.gradientFrom} ${vendor.gradientTo} border" style="border-color: var(--app-border);">
                  <div class="flex items-center justify-center w-10 h-10 rounded-lg ${vendor.bgColor}">
                    <iconify-icon icon="${vendor.icon}" class="${vendor.color}" width="22" height="22"></iconify-icon>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-semibold truncate" style="color: var(--app-foreground);">${vendor.name}</div>
                    <div class="text-[9px] truncate" style="color: var(--app-disabled-foreground);">${vendor.description}</div>
                  </div>
                  <div class="text-[9px] px-2 py-1 rounded-lg ${vendor.bgColor} font-medium whitespace-nowrap" style="color: var(--app-foreground);">
                    File-based
                  </div>
                </div>
              `
            : nothing}

          <!-- Test Result Alert -->
          ${this.testResult === 'success'
            ? html`
                <div class="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <iconify-icon icon="mdi:check-circle" class="text-green-500 flex-shrink-0" width="18" height="18"></iconify-icon>
                  <span class="text-xs text-green-500 flex-1">${this.testSuccessMessage}</span>
                </div>
              `
            : this.testResult === 'error'
              ? html`
                  <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div class="flex items-center gap-2">
                      <iconify-icon icon="mdi:alert-circle" class="text-red-500 flex-shrink-0" width="18" height="18"></iconify-icon>
                      <span class="text-xs text-red-500 flex-1">${this.testErrorMessage}</span>
                      <button
                        type="button"
                        @click=${() => this.toggleErrorDetails()}
                        class="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        ${this.showErrorDetails
                          ? html`<iconify-icon icon="mdi:chevron-up" width="16" height="16"></iconify-icon>`
                          : html`<iconify-icon icon="mdi:chevron-down" width="16" height="16"></iconify-icon>`
                        }
                        <span>${this.showErrorDetails ? 'Hide details' : 'More details'}</span>
                      </button>
                    </div>
                    ${this.showErrorDetails
                      ? html`
                          <div class="mt-3 pt-3 border-t border-red-500/20">
                            <div class="text-[11px] text-red-400 space-y-1">
                              <p><strong class="text-red-300">Connection Details:</strong></p>
                              <ul class="ml-4 list-disc space-y-0.5">
                                <li>File: ${this.filePath}</li>
                                <li>Read-only: ${this.readOnly ? 'Yes' : 'No'}</li>
                                <li>WAL Mode: ${this.walMode ? 'Enabled' : 'Disabled'}</li>
                              </ul>
                              <p class="mt-2"><strong class="text-red-300">Troubleshooting tips:</strong></p>
                              <ul class="ml-4 list-disc space-y-0.5">
                                <li>Verify the file exists and is accessible</li>
                                <li>Check file permissions (read/write access)</li>
                                <li>Ensure the file is not locked by another process</li>
                                <li>Verify the file is a valid SQLite database</li>
                              </ul>
                            </div>
                          </div>
                        `
                      : nothing}
                  </div>
                `
              : nothing}

          <!-- Connection Name -->
          <div>
            <label class="block text-[11px] font-medium mb-1.5" style="color: var(--app-foreground);">Connection Name</label>
            <input
              type="text"
              value=${this.name}
              @input=${(e: Event) => (this.name = (e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-all"
              style="background-color: var(--app-input-background); border-color: var(--app-border); color: var(--app-foreground);"
              placeholder="My SQLite Database"
              required
            />
          </div>

          <!-- Database File Path -->
          <div>
            <label class="block text-[11px] font-medium mb-1.5" style="color: var(--app-foreground);">Database File</label>
            <div class="flex gap-2">
              <input
                type="text"
                value=${this.filePath}
                @input=${(e: Event) => (this.filePath = (e.target as HTMLInputElement).value)}
                class="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-all"
                style="background-color: var(--app-input-background); border-color: var(--app-border); color: var(--app-foreground);"
                placeholder="/path/to/database.db"
                required
              />
              <button
                type="button"
                @click=${() => this.handleBrowseFile()}
                class="px-3 py-2 text-[11px] font-medium rounded-lg border transition-colors flex items-center justify-center flex-shrink-0"
                style="color: var(--app-foreground); border-color: var(--app-border);"
                :class="${this.isTesting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--app-hover)] hover:border-[var(--brand-primary)]/50'}"
              >
                <iconify-icon icon="mdi:folder-open" width="16" height="16"></iconify-icon>
              </button>
            </div>
            <p class="text-[9px] mt-1" style="color: var(--app-disabled-foreground);">
              Supported: .db, .sqlite, .sqlite3
            </p>
          </div>

          <!-- SQLite Options -->
          <div class="space-y-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                ?checked=${this.readOnly}
                @change=${(e: Event) => (this.readOnly = (e.target as HTMLInputElement).checked)}
                class="w-4 h-4 rounded border-[var(--app-border)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]/30"
              />
              <span class="text-xs" style="color: var(--app-foreground);">Read-only mode</span>
            </label>
            <p class="text-[10px] ml-6" style="color: var(--app-disabled-foreground);">
              Open database in read-only mode to prevent modifications
            </p>

            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                ?checked=${this.walMode}
                @change=${(e: Event) => (this.walMode = (e.target as HTMLInputElement).checked)}
                class="w-4 h-4 rounded border-[var(--app-border)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]/30"
              />
              <span class="text-xs" style="color: var(--app-foreground);">Enable WAL mode</span>
            </label>
            <p class="text-[10px] ml-6" style="color: var(--app-disabled-foreground);">
              Write-Ahead Logging improves concurrency and performance
            </p>
          </div>

          <!-- Global Scope Toggle Switch -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-medium" style="color: var(--app-foreground);">Make connection available globally</label>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  ?checked=${this.isGlobal}
                  @change=${(e: Event) => (this.isGlobal = (e.target as HTMLInputElement).checked)}
                  class="sr-only peer"
                />
                <div class="w-11 h-6 bg-[#d1d5db] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--brand-primary)]/30 rounded-full peer border border-[var(--app-border)] peer-checked:bg-[var(--brand-primary)] transition-all"></div>
                <div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
              </label>
            </div>
            <p class="text-[10px]" style="color: var(--app-disabled-foreground);">
              ${this.isGlobal
                ? html`Connection will be available in all projects`
                : html`Connection will only be available in this project`}
            </p>
          </div>
        </div>

        <!-- Fixed Footer with Actions -->
        <div class="mt-3 pt-3 border-t flex items-center justify-between gap-2.5 flex-shrink-0" style="border-color: var(--app-border);">
          <!-- Test Connection Button -->
          <button
            type="button"
            @click=${() => this.handleTestConnection()}
            ?disabled=${this.isTesting}
            class="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-lg border transition-all flex-shrink-0"
            style="color: var(--app-foreground); border-color: var(--app-border);"
            :class="${this.isTesting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--app-hover)] hover:border-[var(--brand-primary)]/50'}"
          >
            ${this.isTesting
              ? html`<iconify-icon icon="mdi:loading" class="animate-spin text-[var(--brand-primary)]" width="14" height="14"></iconify-icon>`
              : html`<iconify-icon icon="mdi:connection" width="14" height="14" style="color: var(--app-foreground);"></iconify-icon>`
            }
            <span>Test</span>
          </button>

          <!-- Right Side Actions -->
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click=${() => this.handleCancel()}
              class="px-3 py-2 text-[11px] font-medium rounded-lg transition-all"
              style="color: var(--app-foreground);"
              :class="${this.isTesting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--app-hover)]'}"
            >
              Cancel
            </button>
            <button
              type="submit"
              @click=${this.handleSubmit}
              ?disabled=${this.isTesting}
              class="px-4 py-2 text-[11px] font-semibold rounded-lg text-white shadow transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style="background-color: var(--brand-primary);"
              :class="${!this.isTesting ? 'hover:shadow-md hover:scale-[1.01] active:scale-[0.99]' : ''}"
            >
              Add Connection
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
