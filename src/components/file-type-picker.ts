import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';
import './icon.js';
import './file-icon.js';

export interface FileTemplate {
  id: string;
  name: string;
  description: string;
  extension: string;
  icon?: string;
  category: 'generic' | 'detected' | 'language';
}

@customElement('file-type-picker')
export class FileTypePicker extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property({ type: Array }) templates: FileTemplate[] = [];

  @state() private selectedIndex = 0;

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('open') && this.open) {
      this.selectedIndex = 0;
      setTimeout(() => {
        this.focus();
      }, 10);
    }
  }

  private handleSelect = (template: FileTemplate): void => {
    this.dispatchEvent(
      new CustomEvent('template-select', {
        detail: { template },
        bubbles: true,
        composed: true,
      }),
    );
    this.open = false;
  };

  private handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.templates.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.templates[this.selectedIndex]) {
        this.handleSelect(this.templates[this.selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      this.dispatchEvent(
        new CustomEvent('cancel', {
          bubbles: true,
          composed: true,
        }),
      );
      this.open = false;
    }
  };

  render() {
    if (!this.open || this.templates.length === 0) return html``;

    return html`
      <div
        class="fixed inset-0 bg-black/40 flex items-start justify-center z-50 pt-[100px]"
        @click=${() => {
          this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
          this.open = false;
        }}
        @keydown=${this.handleKeydown}
        tabindex="-1"
      >
        <div
          class="bg-white rounded-md shadow-2xl w-[420px] border border-[#d0d0d0] overflow-hidden"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <!-- Header -->
          <div class="px-4 py-2.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
            <h3 class="text-[13px] font-semibold text-[#1a1a1a] text-center">New File Type</h3>
          </div>

          <!-- Template List -->
          <div class="max-h-[400px] overflow-y-auto py-1">
            ${this.templates.map((template, index) => {
              const isSelected = index === this.selectedIndex;
              const isCategoryHeader = index > 0 && this.templates[index - 1].category !== template.category;

              return html`
                ${isCategoryHeader && template.category !== 'generic' ? html`
                  <div class="px-3 py-1.5 text-[11px] font-semibold text-[#5a5a5a] uppercase tracking-wide bg-[#f7f7f7] border-t border-b border-[#e0e0e0] mt-2 first:mt-0">
                    ${template.category === 'detected' ? 'Detected' : 'Other Languages'}
                  </div>
                ` : ''}
                <div
                  class="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-[#e8e0f5] text-[#5b47c9]' : 'hover:bg-[#f0f0f0]'}"
                  @click=${() => this.handleSelect(template)}
                >
                  ${template.icon
                    ? html`<file-icon path="${template.icon}" size="18"></file-icon>`
                    : html`<os-icon name="file" color="#5a5a5a" size="18"></os-icon>`
                  }
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-medium truncate">${template.name}</div>
                    <div class="text-[11px] text-[#6a6a6a] truncate">${template.description}</div>
                  </div>
                  <div class="text-[11px] text-[#8a8a8a] font-mono">.${template.extension}</div>
                </div>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }
}
