import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';
import type { AnyDataSource } from './data-source-types.js';
import './data-source-empty-state.js';

@customElement('data-source-list')
export class DataSourceList extends TailwindElement() {
  @property({ type: Array })
  dataSources: any[] = [];

  @property({ type: Boolean })
  isLoading = false;

  @property({ type: String })
  error: string | null = null;

  private handleRetry() {
    this.dispatchEvent(
      new CustomEvent('retry', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleRequestAdd() {
    this.dispatchEvent(
      new CustomEvent('request-add', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleConnectionSelect(id: string) {
    this.dispatchEvent(
      new CustomEvent('connection-select', {
        detail: { id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleRemove(e: MouseEvent, id: string) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('remove', {
        detail: { id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private getIconForDataSource(ds: any): string {
    const dsType = ds.type || ds.dataSourceType;
    switch (dsType) {
      case 'database':
        const config = ds.config;
        const dbType = config?.dbType || config?.db_type;
        const icons: Record<string, string> = {
          postgresql: 'simple-icons:postgresql',
          mysql: 'simple-icons:mysql',
          sqlite: 'simple-icons:sqlite',
          mongodb: 'simple-icons:mongodb',
          redis: 'simple-icons:redis',
          mariadb: 'simple-icons:mariadb',
          sqlserver: 'simple-icons:microsoftsqlserver',
          oracle: 'simple-icons:oracle',
          cassandra: 'simple-icons:apache',
          dynamodb: 'simple-icons:amazondynamodb',
          cockroachdb: 'simple-icons:cockroachlabs',
          clickhouse: 'simple-icons:clickhouse',
          neo4j: 'simple-icons:neo4j',
          elasticsearch: 'simple-icons:elasticsearch',
        };
        return icons[dbType] || 'mdi:database';
      case 'file':
        return 'mdi:file-table';
      case 'api':
        return 'mdi:web';
      case 'cloud':
        return 'mdi:cloud';
      default:
        return 'mdi:database';
    }
  }

  private getColorForDataSource(ds: any): string {
    const dsType = ds.type || ds.dataSourceType;
    switch (dsType) {
      case 'database':
        const config = ds.config;
        const dbType = config?.dbType || config?.db_type;
        const colors: Record<string, string> = {
          postgresql: 'text-[#336791]',
          mysql: 'text-[#F29111]',
          sqlite: 'text-[#003B57]',
          mongodb: 'text-[#47A248]',
          redis: 'text-[#DC382D]',
          mariadb: 'text-[#003545]',
          sqlserver: 'text-[#CC2927]',
          oracle: 'text-[#F80000]',
          cassandra: 'text-[#1287B1]',
          dynamodb: 'text-[#4053D5]',
          cockroachdb: 'text-[#6935FF]',
          clickhouse: 'text-[#FF6600]',
          neo4j: 'text-[#018BFF]',
          elasticsearch: 'text-[#005571]',
        };
        return colors[dbType] || 'text-gray-400';
      case 'file':
        return 'text-emerald-500';
      case 'api':
        return 'text-amber-500';
      case 'cloud':
        return 'text-sky-500';
      default:
        return 'text-gray-400';
    }
  }

  private getConnectionStatusIcon(ds: any): string {
    // Could be enhanced to show actual connection status
    return 'mdi:check-circle';
  }

  private getDbGradient(dbType: string): string {
    const gradients: Record<string, string> = {
      postgresql: 'from-cyan-500/8 to-blue-500/8',
      mysql: 'from-orange-500/8 to-amber-500/8',
      sqlite: 'from-teal-500/8 to-emerald-500/8',
      mongodb: 'from-green-500/8 to-emerald-500/8',
      redis: 'from-red-500/8 to-rose-500/8',
      mariadb: 'from-sky-500/8 to-blue-500/8',
      sqlserver: 'from-red-500/8 to-rose-500/8',
      oracle: 'from-red-500/8 to-orange-500/8',
      cockroachdb: 'from-violet-500/8 to-purple-500/8',
      clickhouse: 'from-orange-500/8 to-amber-500/8',
      neo4j: 'from-blue-500/8 to-indigo-500/8',
      elasticsearch: 'from-sky-500/8 to-cyan-500/8',
    };
    return gradients[dbType] || 'from-indigo-500/8 to-purple-500/8';
  }

  render() {
    return html`
      <div class="flex flex-col h-full overflow-y-auto p-1">
        ${this.isLoading
          ? html`
              <div class="flex items-center justify-center h-full">
                <iconify-icon icon="mdi:loading" class="animate-spin" width="16" height="16" style="color: var(--brand-primary);"></iconify-icon>
              </div>
            `
          : this.error
            ? html`
                <div class="m-1 p-2 text-[10px] text-red-500 bg-red-500/10 border border-red-500/20 rounded">
                  ${this.error}
                  <button @click=${this.handleRetry} class="ml-2 underline">Retry</button>
                </div>
              `
            : this.dataSources.length === 0
              ? html`
                  <div class="flex-1 flex items-center justify-center">
                    <data-source-empty-state @add-connection=${this.handleRequestAdd}></data-source-empty-state>
                  </div>
                `
              : html`
                  <div class="space-y-0.5">
                    ${this.dataSources.map(
                      (ds) => {
                        const dbType = ds.config?.dbType || 'database';
                        const gradient = this.getDbGradient(dbType);
                        const iconColor = this.getColorForDataSource(ds);
                        const dbIcon = this.getIconForDataSource(ds);

                        return html`
                          <div
                            class="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gradient-to-r ${gradient} cursor-pointer transition-colors"
                            @click=${() => this.handleConnectionSelect(ds.id)}
                          >
                            <!-- Expand indicator -->
                            <span class="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                              <iconify-icon
                                icon="mdi:chevron-right"
                                width="10"
                                height="10"
                                style="color: var(--app-disabled-foreground);"
                              ></iconify-icon>
                            </span>

                            <!-- Database Icon -->
                            <iconify-icon
                              icon="${dbIcon}"
                              class="${iconColor}"
                              width="14"
                              height="14"
                            ></iconify-icon>

                            <!-- Connection Name -->
                            <div class="flex-1 min-w-0">
                              <div class="text-[11px] font-medium truncate" style="color: var(--app-foreground);">
                                ${ds.name}
                              </div>
                            </div>

                            <!-- Connection Status -->
                            <iconify-icon
                              icon="${this.getConnectionStatusIcon(ds)}"
                              width="11"
                              height="11"
                              class="opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
                              style="color: #10B981;"
                            ></iconify-icon>

                            <!-- Remove Button -->
                            <button
                              @click=${(e: MouseEvent) => this.handleRemove(e, ds.id)}
                              class="p-0.5 hover:bg-red-500/15 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                              title="Remove"
                            >
                              <iconify-icon icon="mdi:trash" width="10" height="10" style="color: var(--app-disabled-foreground);"></iconify-icon>
                            </button>
                          </div>
                        `;
                      }
                    )}
                  </div>
                `}
      </div>
    `;
  }
}
