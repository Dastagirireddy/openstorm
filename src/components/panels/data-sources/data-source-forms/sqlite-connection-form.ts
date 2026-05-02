import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import { getDatabaseVendor } from '../data-source-vendors.js';
import type { DatabaseType } from '../../data-source-types.js';

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
  @state() private testErrorMessage = '';

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
    this.testErrorMessage = '';

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
    } catch (err) {
      this.testResult = 'error';
      this.testErrorMessage = err instanceof Error ? err.message : 'Failed to connect';
    } finally {
      this.isTesting = false;
    }
  }

  render() {
    const vendor = getDatabaseVendor(this.vendorId);

    return html`
      <form @submit=${this.handleSubmit} class="space-y-4">
        <!-- Vendor Header Banner -->
        ${vendor
          ? html`
              <div class="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${vendor.gradientFrom} ${vendor.gradientTo} border" style="border-color: var(--app-border);">
                <div class="flex items-center justify-center w-11 h-11 rounded-lg ${vendor.bgColor}">
                  <iconify-icon icon="${vendor.icon}" class="${vendor.color}" width="24" height="24"></iconify-icon>
                </div>
                <div class="flex-1">
                  <div class="text-sm font-semibold" style="color: var(--app-foreground);">${vendor.name}</div>
                  <div class="text-[10px]" style="color: var(--app-disabled-foreground);">${vendor.description}</div>
                </div>
                <div class="text-[10px] px-2.5 py-1.5 rounded-md ${vendor.bgColor} font-medium" style="color: var(--app-foreground);">
                  File-based
                </div>
              </div>
            `
          : nothing}

        <!-- Connection Name -->
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--app-foreground);">Connection Name</label>
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
          <label class="block text-xs font-medium mb-1.5" style="color: var(--app-foreground);">Database File</label>
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
              class="px-4 py-2 text-xs font-medium rounded-lg border transition-colors hover:bg-[var(--app-hover)]"
              style="color: var(--app-foreground); border-color: var(--app-border);"
            >
              <iconify-icon icon="mdi:folder-open" width="16" height="16"></iconify-icon>
            </button>
          </div>
          <p class="text-[10px] mt-1" style="color: var(--app-disabled-foreground);">
            Supported formats: .db, .sqlite, .sqlite3
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

        <!-- Actions -->
        <div class="flex justify-between items-center gap-2 pt-4 border-t" style="border-color: var(--app-border);">
          <button
            type="button"
            @click=${() => this.handleTestConnection()}
            ?disabled=${this.isTesting}
            class="px-4 py-2 text-xs font-medium rounded-lg transition-colors border flex items-center gap-1.5"
            style="color: var(--app-foreground); border-color: var(--app-border);"
            :class="${this.isTesting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--app-hover)]'}"
          >
            ${this.isTesting
              ? html`<iconify-icon icon="mdi:loading" class="animate-spin" width="14" height="14"></iconify-icon>`
              : this.testResult === 'success'
                ? html`<iconify-icon icon="mdi:check-circle" class="text-green-500" width="14" height="14"></iconify-icon>`
                : this.testResult === 'error'
                  ? html`<iconify-icon icon="mdi:alert-circle" class="text-red-500" width="14" height="14"></iconify-icon>`
                  : html`<iconify-icon icon="mdi:connection" width="14" height="14"></iconify-icon>`
            }
            ${this.isTesting ? 'Testing...' : this.testResult === 'success' ? 'Connected' : this.testResult === 'error' ? 'Failed' : 'Test Connection'}
          </button>
          <div class="flex items-center gap-2">
            ${this.testResult === 'error'
              ? html`<span class="text-xs text-red-500">${this.testErrorMessage}</span>`
              : nothing}
            <button
              type="button"
              @click=${() => this.handleCancel()}
              class="px-4 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-[var(--app-hover)]"
              style="color: var(--app-foreground);"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-6 py-2 text-xs font-semibold rounded-lg text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
              style="background-color: var(--brand-primary);"
            >
              Add Connection
            </button>
          </div>
        </div>
      </form>
    `;
  }
}
