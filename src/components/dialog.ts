import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';

@customElement('os-dialog')
export class OSDialog extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property() title = '';
  @property() placeholder = '';
  @property() defaultValue = '';

  @state() private value = '';

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('open') && this.open) {
      this.value = this.defaultValue;
      setTimeout(() => {
        const input = this.shadowRoot?.querySelector('input');
        if (input) {
          input.focus();
          input.select();
        }
      }, 10);
    }
  }

  private handleConfirm = (): void => {
    if (this.value.trim()) {
      this.dispatchEvent(
        new CustomEvent('confirm', {
          detail: { value: this.value.trim() },
          bubbles: true,
          composed: true,
        }),
      );
      this.open = false;
    }
  };

  private handleCancel = (): void => {
    this.dispatchEvent(
      new CustomEvent('cancel', {
        bubbles: true,
        composed: true,
      }),
    );
    this.open = false;
  };

  private handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.handleConfirm();
    } else if (e.key === 'Escape') {
      this.handleCancel();
    }
  };

  render() {
    if (!this.open) return html``;

    return html`
      <div
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click=${this.handleCancel}
      >
        <div
          class="bg-white rounded-md shadow-2xl w-[400px] border border-[#d0d0d0] overflow-hidden"
          @click=${(e: Event) => e.stopPropagation()}
          @mousedown=${(e: Event) => e.stopPropagation()}
        >
          <div class="p-4">
            <h3 class="text-[13px] font-semibold text-[#1a1a1a] mb-3">${this.title}</h3>
            <input
              type="text"
              class="w-full px-2.5 py-2 border border-[#c0c0c0] rounded text-[13px] focus:outline-none focus:ring-2 focus:ring-[#5b47c9] focus:border-transparent"
              placeholder="${this.placeholder}"
              value="${this.value}"
              @input=${(e: Event) => { this.value = (e.target as HTMLInputElement).value; }}
              @keydown=${this.handleKeydown}
              @mousedown=${(e: Event) => e.stopPropagation()}
            />
          </div>
        </div>
      </div>
    `;
  }
}
