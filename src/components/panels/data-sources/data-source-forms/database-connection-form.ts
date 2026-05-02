import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import { getDatabaseVendor } from '../data-source-vendors.js';
import type { DatabaseType } from '../../data-source-types.js';

export interface DatabaseConnectionFormData {
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  username: string;
  password?: string;
  database?: string;
  scope: 'global' | 'project';
}

@customElement('database-connection-form')
export class DatabaseConnectionForm extends TailwindElement() {
  @property({ type: String })
  vendorId: DatabaseType = 'postgresql';

  @state() private name = '';
  @state() private host = 'localhost';
  @state() private port = 0;
  @state() private username = '';
  @state() private password = '';
  @state() private database = '';
  @state() private isGlobal = false;
  @state() private isTesting = false;
  @state() private testResult: 'success' | 'error' | null = null;
  @state() private testErrorMessage = '';

  firstUpdated() {
    const vendor = getDatabaseVendor(this.vendorId);
    if (vendor) {
      this.port = vendor.defaultPort;
    }
  }

  private handleSubmit(e: Event) {
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent<DatabaseConnectionFormData>('submit', {
        detail: {
          name: this.name,
          type: this.vendorId,
          host: this.host,
          port: this.port,
          username: this.username,
          password: this.password,
          database: this.database || undefined,
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
    this.isTesting = true;
    this.testResult = null;
    this.testErrorMessage = '';

    try {
      await invoke('db_test_connection', {
        config: {
          id: null,
          name: this.name || 'test',
          type: this.vendorId,
          host: this.host,
          port: this.port,
          username: this.username,
          password: this.password || null,
          database: this.database || null,
          scope: 'project',
          options: {},
        },
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
                ${vendor.defaultPort > 0
                  ? html`
                      <div class="text-[10px] px-2.5 py-1.5 rounded-md ${vendor.bgColor} font-medium" style="color: var(--app-foreground);">
                        Port: ${vendor.defaultPort}
                      </div>
                    `
                  : nothing}
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
            placeholder="My Database Connection"
            required
          />
        </div>

        <!-- Host & Port Row -->
        <div class="grid grid-cols-4 gap-3">
          <div class="col-span-3">
            <label class="block text-xs font-medium mb-1.5" style="color: var(--app-foreground);">Host</label>
            <input
              type="text"
              value=${this.host}
              @input=${(e: Event) => (this.host = (e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-all"
              style="background-color: var(--app-input-background); border-color: var(--app-border); color: var(--app-foreground);"
              placeholder="localhost"
              required
            />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1.5" style="color: var(--app-foreground);">Port</label>
            <input
              type="number"
              value=${this.port}
              @input=${(e: Event) => (this.port = parseInt((e.target as HTMLInputElement).value) || 0)}
              class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-all"
              style="background-color: var(--app-input-background); border-color: var(--app-border); color: var(--app-foreground);"
              min="0"
              max="65535"
            />
          </div>
        </div>

        <!-- Username & Password Row -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1.5" style="color: var(--app-foreground);">Username</label>
            <input
              type="text"
              value=${this.username}
              @input=${(e: Event) => (this.username = (e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-all"
              style="background-color: var(--app-input-background); border-color: var(--app-border); color: var(--app-foreground);"
              placeholder="postgres"
              required
            />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1.5" style="color: var(--app-foreground);">Password</label>
            <input
              type="password"
              value=${this.password}
              @input=${(e: Event) => (this.password = (e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-all"
              style="background-color: var(--app-input-background); border-color: var(--app-border); color: var(--app-foreground);"
              placeholder="Enter password"
            />
          </div>
        </div>

        <!-- Database (optional) -->
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--app-foreground);">Database Name (optional)</label>
          <input
            type="text"
            value=${this.database}
            @input=${(e: Event) => (this.database = (e.target as HTMLInputElement).value)}
            class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-all"
            style="background-color: var(--app-input-background); border-color: var(--app-border); color: var(--app-foreground);"
            placeholder="mydb"
          />
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
