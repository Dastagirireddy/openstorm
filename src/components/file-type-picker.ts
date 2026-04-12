import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';
import './icon.js';
import './file-icon.js';

export interface FileTemplate {
  id: string;
  name: string;
  extension: string;
  icon?: string;
}

@customElement('file-type-picker')
export class FileTypePicker extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property({ type: Array }) templates: FileTemplate[] = [];
  @property({ type: Number }) anchorX = 0;
  @property({ type: Number }) anchorY = 0;

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
        class="fixed inset-0 z-40"
        @click=${() => {
          this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
          this.open = false;
        }}
        @keydown=${this.handleKeydown}
        tabindex="-1"
      >
        <div
          class="absolute bg-white rounded-md shadow-lg border border-[#d0d0d0] overflow-hidden z-50 min-w-[200px]"
          style="left: ${this.anchorX}px; top: ${this.anchorY}px;"
          @click=${(e: Event) => e.stopPropagation()}
        >
          ${this.templates.map((template, index) => {
            const isSelected = index === this.selectedIndex;
            return html`
              <div
                class="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${isSelected ? 'bg-[#e8e0f5] text-[#5b47c9]' : 'hover:bg-[#f0f0f0]'}"
                @click=${() => this.handleSelect(template)}
              >
                ${template.icon
                  ? html`<file-icon path="${template.icon}" size="16"></file-icon>`
                  : html`<os-icon name="file" color="#5a5a5a" size="16"></os-icon>`
                }
                <span class="text-[13px] whitespace-nowrap">${template.name}</span>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }
}
