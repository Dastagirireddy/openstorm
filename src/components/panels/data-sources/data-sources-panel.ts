import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import type { AnyDataSource, DataSourceType, DatabaseType } from './data-source-types.js';
import './data-source-list.js';
import './data-source-type-picker.js';
import './database-vendor-picker.js';
import './data-source-forms/database-connection-form.js';
import './data-source-forms/sqlite-connection-form.js';

/**
 * Data Sources Panel - Main container
 *
 * Architecture:
 * - Supports multiple data source types (database, file, api, cloud)
 * - Extensible - new types can be added without modifying this file
 * - Currently implements database connections, with hooks for future types
 */
@customElement('data-sources-panel')
export class DataSourcesPanel extends TailwindElement() {
  @state() private dataSources: AnyDataSource[] = [];
  @state() private isLoading = false;
  @state() private error: string | null = null;
  @state() private showAddDialog = false;
  @state() private selectedType: DataSourceType | null = null;
  @state() private selectedVendor: DatabaseType | null = null;
  @state() private projectPath: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.loadDataSources();
    this.getCurrentProjectPath();
  }

  private async getCurrentProjectPath() {
    this.projectPath = null;
  }

  private async loadDataSources() {
    this.isLoading = true;
    this.error = null;
    try {
      // For now, load only database connections
      // Future: invoke('list_data_sources', { projectPath: this.projectPath, type: this.selectedType })
      const result = await invoke<AnyDataSource[]>('db_list_connections', {
        projectPath: this.projectPath,
      });
      this.dataSources = result;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load data sources';
    } finally {
      this.isLoading = false;
    }
  }

  private async handleAddDataSource(config: any) {
    try {
      // Handle SQLite differently - it uses filePath instead of host/port
      const isSqlite = config.type === 'sqlite' || config.dbType === 'sqlite';

      await invoke('db_add_connection', {
        config: {
          id: null,
          name: config.name,
          type: config.dbType || config.type,
          host: isSqlite ? null : (config.host || 'localhost'),
          port: isSqlite ? 0 : (config.port || 0),
          username: isSqlite ? null : (config.username || null),
          password: isSqlite ? null : (config.password || null),
          database: isSqlite ? null : (config.database || null),
          filePath: isSqlite ? (config.filePath || null) : null,
          scope: config.scope,
          options: isSqlite ? {
            readOnly: (config.readOnly || false).toString(),
            walMode: (config.walMode || true).toString(),
          } : {},
        },
        projectPath: this.projectPath,
      });
      await this.loadDataSources();
      this.showAddDialog = false;
      this.selectedType = null;
      this.selectedVendor = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to add data source';
    }
  }

  private async handleRemoveDataSource(id: string) {
    if (!confirm('Are you sure you want to remove this data source?')) return;
    try {
      await invoke('db_remove_connection', {
        connectionId: id,
        projectPath: this.projectPath,
      });
      await this.loadDataSources();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to remove data source';
    }
  }

  private handleTypeSelect(type: DataSourceType) {
    this.selectedType = type;
  }

  private handleVendorSelect(vendorId: DatabaseType) {
    this.selectedVendor = vendorId;
  }

  private handleCloseDialog() {
    this.showAddDialog = false;
    this.selectedType = null;
    this.selectedVendor = null;
  }


  render() {
    return html`
      <div class="flex flex-col h-full w-full" style="background-color: var(--app-bg);">
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-2 border-b" style="border-color: var(--app-border);">
          <span class="text-xs font-medium" style="color: var(--app-foreground);">Data Sources</span>
          <button
            @click=${() => (this.showAddDialog = true)}
            class="p-1 hover:bg-[var(--app-hover)] rounded"
            title="Add Data Source"
          >
            <iconify-icon icon="mdi:plus" width="16" height="16"></iconify-icon>
          </button>
        </div>

        <!-- Content -->
        <data-source-list
          .dataSources=${this.dataSources}
          .isLoading=${this.isLoading}
          .error=${this.error}
          @retry=${() => this.loadDataSources()}
          @request-add=${() => (this.showAddDialog = true)}
          @remove=${(e: CustomEvent) => this.handleRemoveDataSource(e.detail.id)}
        ></data-source-list>

        <!-- Add Data Source Dialog -->
        ${this.showAddDialog
          ? html`
              <div
                class="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
                @click=${() => this.handleCloseDialog()}
              >
                <div
                  class="bg-[var(--app-bg)] border rounded-2xl shadow-2xl overflow-hidden flex w-[1100px] max-h-[650px]"
                  style="border-color: var(--app-border);"
                  @click=${(e: Event) => e.stopPropagation()}
                >
                  <!-- Column 1: Data Source Types -->
                  <div class="w-[280px] flex-shrink-0 border-r flex flex-col" style="border-color: var(--app-border);">
                    <!-- Header -->
                    <div class="px-4 py-3 border-b flex-shrink-0" style="border-color: var(--app-border);">
                      <h3 class="text-sm font-semibold" style="color: var(--app-foreground);">Data Source Type</h3>
                      <p class="text-[10px] mt-0.5" style="color: var(--app-disabled-foreground);">Select a type</p>
                    </div>

                    <div class="flex-1 overflow-y-auto p-2 space-y-1">
                      <data-source-type-picker
                        .selectedType=${this.selectedType}
                        @type-select=${(e: CustomEvent) => this.handleTypeSelect(e.detail.type)}
                      ></data-source-type-picker>
                    </div>
                  </div>

                  <!-- Column 2: Database Vendors (shown when Database type selected) -->
                  ${this.selectedType === 'database'
                    ? html`
                        <div class="w-[280px] flex-shrink-0 border-r flex flex-col" style="border-color: var(--app-border);">
                          <!-- Header -->
                          <div class="px-4 py-3 border-b flex-shrink-0" style="border-color: var(--app-border);">
                            <h3 class="text-sm font-semibold" style="color: var(--app-foreground);">Database Vendor</h3>
                            <p class="text-[10px] mt-0.5" style="color: var(--app-disabled-foreground);">Choose your database</p>
                          </div>

                          <div class="flex-1 overflow-y-auto p-2 space-y-1">
                            <database-vendor-picker
                              .selectedVendor=${this.selectedVendor}
                              @vendor-select=${(e: CustomEvent) => this.handleVendorSelect(e.detail.vendorId)}
                            ></database-vendor-picker>
                          </div>
                        </div>
                      `
                    : nothing}

                  <!-- Column 3: Configuration Form (shown when vendor selected) -->
                  ${this.selectedVendor
                    ? html`
                        <div class="flex-1 flex flex-col min-w-0">
                          <!-- Header -->
                          <div class="px-4 py-3 border-b flex-shrink-0" style="border-color: var(--app-border);">
                            <div class="flex items-center justify-between">
                              <div>
                                <h3 class="text-sm font-semibold" style="color: var(--app-foreground);">Connection Details</h3>
                                <p class="text-[10px] mt-0.5" style="color: var(--app-disabled-foreground);">Configure your connection</p>
                              </div>
                            </div>
                          </div>

                          <div class="flex-1 overflow-y-auto p-5">
                            ${this.selectedVendor === 'sqlite'
                              ? html`
                                  <sqlite-connection-form
                                    vendorId="${this.selectedVendor}"
                                    @submit=${(e: CustomEvent) => this.handleAddDataSource(e.detail)}
                                    @cancel=${() => this.handleCloseDialog()}
                                  ></sqlite-connection-form>
                                `
                              : html`
                                  <database-connection-form
                                    vendorId="${this.selectedVendor}"
                                    @submit=${(e: CustomEvent) => this.handleAddDataSource(e.detail)}
                                    @cancel=${() => this.handleCloseDialog()}
                                  ></database-connection-form>
                                `}
                          </div>
                        </div>
                      `
                    : this.selectedType
                      ? html`
                          <div class="flex-1 flex flex-col min-w-0">
                            <!-- Header -->
                            <div class="px-4 py-3 border-b flex-shrink-0" style="border-color: var(--app-border);">
                              <div class="flex items-center justify-between">
                                <div>
                                  <h3 class="text-sm font-semibold" style="color: var(--app-foreground);">
                                    ${this.selectedType === 'database' ? 'Database Vendor' : 'Configuration'}
                                  </h3>
                                  <p class="text-[10px] mt-0.5" style="color: var(--app-disabled-foreground);">
                                    ${this.selectedType === 'database' ? 'Select a vendor from the left' : 'Configure your connection'}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div class="flex-1 overflow-y-auto p-5">
                              ${this.renderFormForType(this.selectedType)}
                            </div>
                          </div>
                        `
                      : html`
                          <div class="flex-1 flex items-center justify-center p-8">
                            <div class="text-center space-y-3">
                              <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mx-auto">
                                <iconify-icon
                                  icon="mdi:database-outline"
                                  width="42"
                                  height="42"
                                  style="color: var(--app-disabled-foreground);"
                                ></iconify-icon>
                              </div>
                              <div>
                                <p class="text-sm font-medium" style="color: var(--app-foreground);">Select a Data Source Type</p>
                                <p class="text-xs mt-1" style="color: var(--app-disabled-foreground);">
                                  Choose from the list on the left to get started
                                </p>
                              </div>
                            </div>
                          </div>
                        `}
                </div>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private renderFormForType(type: DataSourceType) {
    switch (type) {
      case 'database':
        return html`
          <div class="flex flex-col items-center justify-center h-full text-center p-8">
            <div class="w-16 h-16 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4">
              <iconify-icon icon="mdi:database" class="text-indigo-500" width="32" height="32"></iconify-icon>
            </div>
            <p class="text-sm font-medium" style="color: var(--app-foreground);">Select a Database Vendor</p>
            <p class="text-xs mt-1" style="color: var(--app-disabled-foreground);">
              Choose from PostgreSQL, MySQL, MongoDB, and more from the left panel
            </p>
          </div>
        `;
      case 'file':
      case 'api':
      case 'cloud':
        return html`
          <div class="flex flex-col items-center justify-center h-full text-center p-8">
            <iconify-icon icon="mdi:construction" width="48" height="48" style="color: var(--app-disabled-foreground);"></iconify-icon>
            <p class="text-sm font-medium mt-4" style="color: var(--app-foreground);">Coming Soon</p>
            <p class="text-xs mt-1" style="color: var(--app-disabled-foreground);">
              ${type === 'file' && 'Local file data sources (JSON, CSV, XML) will be available soon.'}
              ${type === 'api' && 'API endpoints (REST, GraphQL) will be available soon.'}
              ${type === 'cloud' && 'Cloud services (S3, Firebase, Supabase) will be available soon.'}
            </p>
          </div>
        `;
      default:
        return nothing;
    }
  }
}
