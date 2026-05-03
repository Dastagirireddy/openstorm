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
        <iconify-icon
          icon="mdi:database-outline"
          width="40"
          height="40"
          style="color: var(--app-disabled-foreground); opacity: 0.5;"
        ></iconify-icon>

        <!-- Title -->
        <h3 class="text-[11px] font-semibold mt-3" style="color: var(--app-foreground);">
          No Data Sources
        </h3>

        <!-- Description -->
        <p class="text-[10px] mt-1.5 max-w-[260px]" style="color: var(--app-disabled-foreground);">
          Add a data source to browse and query your data
        </p>

        <!-- CTA Button -->
        <button
          @click=${this.handleAddDataSource}
          class="mt-4 px-3.5 py-2 text-[11px] font-semibold rounded-lg text-white shadow flex items-center gap-1.5 transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.99]"
          style="background-color: var(--brand-primary);"
        >
          <iconify-icon icon="mdi:plus" width="13" height="13"></iconify-icon>
          Add Data Source
        </button>
      </div>
    `;
  }
}
