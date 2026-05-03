import { html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';
import { DATABASE_VENDORS } from './data-source-vendors.js';
import type { DatabaseType } from './data-source-types.js';

@customElement('database-vendor-picker')
export class DatabaseVendorPicker extends TailwindElement() {
  @property({ type: String })
  selectedVendor: DatabaseType | null = null;

  private handleSelect(vendorId: DatabaseType) {
    this.dispatchEvent(
      new CustomEvent('vendor-select', {
        detail: { vendorId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
        ${DATABASE_VENDORS.map(
          (vendor) => html`
            <button
              @click=${() => this.handleSelect(vendor.id)}
              class=${`w-full flex items-center gap-2 p-1.5 rounded-lg transition-all duration-150 text-left group
                ${this.selectedVendor === vendor.id
                  ? `${vendor.bgColor} ${vendor.borderColor} border`
                  : `bg-transparent hover:bg-[var(--app-hover)] border border-transparent`
                }`}
            >
              <div class="flex items-center justify-center w-8 h-8 rounded-lg ${vendor.bgColor} flex-shrink-0">
                <iconify-icon
                  icon="${vendor.icon}"
                  class="${vendor.color}"
                  width="18"
                  height="18"
                ></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-medium truncate" style="color: var(--app-foreground);">
                  ${vendor.name}
                </div>
                <div class="text-[9px] truncate" style="color: var(--app-disabled-foreground);">
                  ${vendor.defaultPort > 0 ? html`Port ${vendor.defaultPort}` : html`File-based`}
                </div>
              </div>
              ${this.selectedVendor === vendor.id
                ? html`
                    <iconify-icon
                      icon="mdi:check-circle"
                      class="${vendor.color}"
                      width="16"
                      height="16"
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
