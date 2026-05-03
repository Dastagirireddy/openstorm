import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import { getDatabaseVendor } from '../data-source-vendors.js';
import { getDatabaseFormDefinition } from '../database-form-registry.js';
import type { DatabaseType } from '../data-source-types.js';

export interface DatabaseConnectionFormData {
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  username: string;
  password?: string;
  database?: string;
  scope: 'global' | 'project';
  isGlobal: boolean;
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
  @state() private testSuccessMessage = '';
  @state() private testErrorMessage = '';
  @state() private showErrorDetails = false;

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);
    if (changedProperties.has('vendorId')) {
      const formDef = getDatabaseFormDefinition(this.vendorId);
      if (formDef && formDef.defaultPort > 0) {
        this.port = formDef.defaultPort;
      }
      // Set default username based on vendor
      this.username = this.getDefaultUsername(this.vendorId);
    }
  }

  private getDefaultUsername(vendorId: DatabaseType): string {
    const defaults: Record<DatabaseType, string> = {
      sqlite: '',
      postgresql: 'postgres',
      mysql: 'root',
      mariadb: 'root',
      sqlserver: 'sa',
      oracle: 'system',
      mongodb: 'admin',
      redis: '',
      cockroachdb: 'root',
      clickhouse: 'default',
      cassandra: 'cassandra',
      neo4j: 'neo4j',
      dynamodb: '',
      elasticsearch: '',
    };
    return defaults[vendorId] || '';
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
          isGlobal: this.isGlobal,
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
    this.testSuccessMessage = '';
    this.testErrorMessage = '';
    this.showErrorDetails = false;

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
      this.testSuccessMessage = `Successfully connected to ${this.getVendorDisplayName()}`;
    } catch (err) {
      this.testResult = 'error';
      this.testErrorMessage = err instanceof Error ? err.message : 'Failed to connect';
    } finally {
      this.isTesting = false;
    }
  }

  private toggleErrorDetails() {
    this.showErrorDetails = !this.showErrorDetails;
  }

  private getVendorDisplayName(): string {
    const vendor = getDatabaseVendor(this.vendorId);
    return vendor?.name || this.vendorId;
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
                  ${formDef?.defaultPort > 0
                    ? html`
                        <div class="text-[9px] px-2 py-1 rounded ${vendor.bgColor} font-medium whitespace-nowrap" style="color: var(--app-foreground);">
                          Port: ${formDef.defaultPort}
                        </div>
                      `
                    : nothing}
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
                                <li>Host: ${this.host}:${this.port}</li>
                                <li>Username: ${this.username}</li>
                                ${this.database ? html`<li>Database: ${this.database}</li>` : nothing}
                                <li>Type: ${this.getVendorDisplayName()}</li>
                              </ul>
                              <p class="mt-2"><strong class="text-red-300">Troubleshooting tips:</strong></p>
                              <ul class="ml-4 list-disc space-y-0.5">
                                <li>Verify the database server is running</li>
                                <li>Check your network connection and firewall settings</li>
                                <li>Ensure the host, port, and credentials are correct</li>
                                <li>For remote servers, verify SSL/TLS settings if required</li>
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
              placeholder="My ${vendor?.name || 'Database'} Connection"
              required
            />
          </div>

          <!-- Host & Port Row -->
          <div class="grid grid-cols-4 gap-2.5">
            <div class="col-span-3">
              <label class="block text-[11px] font-medium mb-1.5" style="color: var(--app-foreground);">Host</label>
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
              <label class="block text-[11px] font-medium mb-1.5" style="color: var(--app-foreground);">Port</label>
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
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[11px] font-medium mb-1.5" style="color: var(--app-foreground);">Username</label>
              <input
                type="text"
                value=${this.username}
                @input=${(e: Event) => (this.username = (e.target as HTMLInputElement).value)}
                class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30 focus:border-[var(--brand-primary)] transition-all"
                style="background-color: var(--app-input-background); border-color: var(--app-border); color: var(--app-foreground);"
                placeholder=${this.getDefaultUsername(this.vendorId) || 'Username'}
                required
              />
            </div>
            <div>
              <label class="block text-[11px] font-medium mb-1.5" style="color: var(--app-foreground);">Password</label>
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
            <label class="block text-[11px] font-medium mb-1.5" style="color: var(--app-foreground);">Database Name (optional)</label>
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
