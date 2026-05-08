import { html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';
import type { DataSourceType } from './data-source-types.js';

interface DataSourceTypeOption {
  id: DataSourceType;
  name: string;
  icon: string;
  description: string;
  color: string;
  bgColor: string;
  comingSoon?: boolean;
}

const DATA_SOURCE_TYPES: DataSourceTypeOption[] = [
  {
    id: 'database',
    name: 'Database',
    icon: 'mdi:database',
    description: 'PostgreSQL, MySQL, MongoDB, Redis',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
  },
  {
    id: 'file',
    name: 'Local File',
    icon: 'mdi:file-table',
    description: 'JSON, CSV, XML, Parquet',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    comingSoon: true,
  },
  {
    id: 'api',
    name: 'API Endpoint',
    icon: 'mdi:web',
    description: 'REST, GraphQL, gRPC',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    comingSoon: true,
  },
  {
    id: 'cloud',
    name: 'Cloud Service',
    icon: 'mdi:cloud',
    description: 'S3, Firebase, Supabase',
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
    comingSoon: true,
  },
];

@customElement('data-source-type-picker')
export class DataSourceTypePicker extends TailwindElement() {
  @property({ type: String })
  selectedType: DataSourceType | null = null;

  private handleSelect(type: DataSourceType) {
    this.dispatchEvent(
      new CustomEvent('type-select', {
        detail: { type },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        ${DATA_SOURCE_TYPES.map(
          (type) => html`
            <button
              @click=${() => this.handleSelect(type.id)}
              ?disabled=${type.comingSoon}
              class=${`w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left border
                ${this.selectedType === type.id
                  ? `${type.bgColor} ${type.borderColor || type.color.replace('text-', 'border-')}`
                  : `bg-transparent hover:bg-[var(--app-hover)] border-transparent`
                }
                ${type.comingSoon ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <div class="flex items-center justify-center w-9 h-9 rounded-lg ${type.bgColor} flex-shrink-0">
                <iconify-icon
                  icon="${type.icon}"
                  class="${type.color}"
                  width="20"
                  height="20"
                ></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium truncate" style="color: var(--app-foreground);">
                  ${type.name}
                </div>
                <div class="text-[9px] truncate" style="color: var(--app-disabled-foreground);">
                  ${type.description}
                </div>
              </div>
              ${type.comingSoon
                ? html`
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-[var(--app-hover)]" style="color: var(--app-disabled-foreground);">
                      Soon
                    </span>
                  `
                : nothing}
              ${this.selectedType === type.id && !type.comingSoon
                ? html`
                    <iconify-icon
                      icon="mdi:check-circle"
                      class="${type.color}"
                      width="18"
                      height="18"
                    ></iconify-icon>
                  `
                : nothing}
            </button>
          `,
        )}
      </div>
    `;
  }
}
