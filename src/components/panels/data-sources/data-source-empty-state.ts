import { html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';

@customElement('data-source-empty-state')
export class DataSourceEmptyState extends TailwindElement() {
  private handleAddDataSource() {
    this.dispatchEvent(
      new CustomEvent('add-connection', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      <div class="flex flex-col items-center justify-center h-full w-full p-6 text-center">
        <!-- Database icon -->
        <div class="mb-4">
          <iconify-icon
            icon="mdi:database-outline"
            width="64"
            height="64"
            style="color: var(--app-disabled-foreground);"
          ></iconify-icon>
        </div>

        <!-- Title -->
        <h3 class="text-sm font-semibold" style="color: var(--app-foreground);">
          No Data Sources
        </h3>

        <!-- Description -->
        <p class="text-xs mt-2 max-w-[280px]" style="color: var(--app-disabled-foreground);">
          Add a data source to browse, query, and manage your data directly from the editor
        </p>

        <!-- CTA Button -->
        <button
          @click=${this.handleAddDataSource}
          class="mt-5 px-4 py-2 text-xs font-medium rounded-md text-white shadow-sm hover:shadow-md transition-all flex items-center gap-2"
          style="background-color: var(--brand-primary);"
        >
          <iconify-icon icon="mdi:plus" width="14" height="14"></iconify-icon>
          Add Data Source
        </button>
      </div>
    `;
  }
}
