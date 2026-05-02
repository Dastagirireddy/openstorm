import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';
import type { AnyDataSource } from './data-source-types.js';
import './data-source-empty-state.js';

@customElement('data-source-list')
export class DataSourceList extends TailwindElement() {
  @property({ type: Array })
  dataSources: AnyDataSource[] = [];

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

  private handleRemove(e: CustomEvent) {
    this.dispatchEvent(
      new CustomEvent('remove', {
        detail: e.detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private getIconForDataSource(ds: AnyDataSource): string {
    switch (ds.type) {
      case 'database':
        const config = ds.config as any;
        const dbType = config.dbType || config.type;
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

  private getColorForDataSource(ds: AnyDataSource): string {
    switch (ds.type) {
      case 'database':
        const config = ds.config as any;
        const dbType = config.dbType || config.type;
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

  render() {
    return html`
      <div class="flex-1 overflow-y-auto p-2">
        ${this.isLoading
          ? html`
              <div class="flex items-center justify-center h-full">
                <iconify-icon icon="mdi:loading" class="animate-spin" width="24" height="24"></iconify-icon>
              </div>
            `
          : this.error
            ? html`
                <div class="p-3 text-xs text-red-500 bg-red-500/10 rounded">
                  ${this.error}
                  <button @click=${this.handleRetry} class="ml-2 underline">Retry</button>
                </div>
              `
            : this.dataSources.length === 0
              ? html`
                  <div class="h-full">
                    <data-source-empty-state @add-connection=${this.handleRequestAdd}></data-source-empty-state>
                  </div>
                `
              : html`
                  <div class="space-y-1">
                    ${this.dataSources.map(
                      (ds) => html`
                        <div
                          class="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--app-hover)] cursor-pointer"
                        >
                          <iconify-icon
                            icon="${this.getIconForDataSource(ds)}"
                            class="${this.getColorForDataSource(ds)}"
                            width="16"
                            height="16"
                          ></iconify-icon>
                          <div class="flex-1 min-w-0">
                            <div class="text-xs font-medium truncate" style="color: var(--app-foreground);">
                              ${ds.name}
                            </div>
                            <div class="text-[10px] truncate" style="color: var(--app-disabled-foreground);">
                              ${ds.type}
                              ${ds.type === 'database'
                                ? ` • ${(ds.config as any).host || 'local'}:${(ds.config as any).port || '-'}`
                                : ''}
                            </div>
                          </div>
                          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              @click=${(e: Event) => {
                                e.stopPropagation();
                                this.handleRemove(e);
                              }}
                              class="p-0.5 hover:bg-red-500/20 rounded text-red-500"
                              title="Remove"
                            >
                              <iconify-icon icon="mdi:trash" width="12" height="12"></iconify-icon>
                            </button>
                          </div>
                        </div>
                      `,
                    )}
                  </div>
                `}
      </div>
    `;
  }
}
