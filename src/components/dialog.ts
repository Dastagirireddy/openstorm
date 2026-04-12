import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../tailwind-element.js';

@customElement('os-dialog')
export class OSDialog extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property() title = '';
  @property() placeholder = '';
  @property() defaultValue = '';
  @property() extension = '';
  @property() parentPath = '';

  @state() private value = '';
  @state() private error = '';
  @state() private existingFiles: string[] = [];

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('open') && this.open) {
      this.value = this.defaultValue;
      this.error = '';
      this.loadExistingFiles();
      setTimeout(() => {
        const input = this.shadowRoot?.querySelector('input');
        if (input) {
          input.focus();
          // Place cursor before extension if present
          const baseName = this.defaultValue.replace(/\.[^.]+$/, '');
          input.setSelectionRange(baseName.length, baseName.length);
        }
      }, 10);
    }
  }

  private async loadExistingFiles(): Promise<void> {
    if (!this.parentPath) {
      this.existingFiles = [];
      return;
    }
    try {
      const result = await invoke('list_directory', { path: this.parentPath });
      const files = result as Array<{ name: string; is_dir: boolean }>;
      this.existingFiles = files.map(f => f.name);
    } catch (error) {
      console.error('Failed to load existing files:', error);
      this.existingFiles = [];
    }
  }

  private validateName(name: string): string {
    if (!name.trim()) return 'Name cannot be empty';
    if (/[<>:"/\\|?*]/.test(name)) return 'Invalid characters in name';

    // Check if file already exists
    const fullName = this.extension && !name.includes('.') ? `${name}.${this.extension}` : name;
    if (this.existingFiles.includes(fullName)) return 'File already exists';

    return '';
  }

  private getFullName(): string {
    if (!this.value) return '';
    return this.extension && !this.value.includes('.') ? `${this.value}.${this.extension}` : this.value;
  }

  private handleInput = (e: Event): void => {
    const input = e.target as HTMLInputElement;
    this.value = input.value;
    this.error = this.validateName(this.value);
  };

  private handleConfirm = (): void => {
    if (this.value.trim() && !this.error) {
      const fullName = this.getFullName();
      this.dispatchEvent(
        new CustomEvent('confirm', {
          detail: { value: fullName },
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
      if (!this.error) {
        this.handleConfirm();
      }
    } else if (e.key === 'Escape') {
      this.handleCancel();
    }
  };

  render() {
    if (!this.open) return html``;

    const fullName = this.getFullName();
    const showError = this.error && this.value.trim();

    return html`
      <div
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click=${this.handleCancel}
      >
        <div
          class="bg-white rounded-md shadow-2xl w-[380px] border border-[#d0d0d0] overflow-hidden"
          @click=${(e: Event) => e.stopPropagation()}
          @mousedown=${(e: Event) => e.stopPropagation()}
        >
          <!-- Header -->
          <div class="px-4 py-2.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
            <h3 class="text-[13px] font-semibold text-[#1a1a1a] text-center">${this.title}</h3>
          </div>
          <!-- Input -->
          <div class="px-4 py-3">
            <input
              type="text"
              class="w-full px-2 py-1.5 border ${showError ? 'border-red-500' : 'border-[#c0c0c0]'} rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#5b47c9] focus:border-transparent"
              placeholder="${this.placeholder}"
              value="${this.value}"
              @input=${this.handleInput}
              @keydown=${this.handleKeydown}
              @mousedown=${(e: Event) => e.stopPropagation()}
            />
            ${showError ? html`
              <p class="mt-1.5 text-[12px] text-red-600 flex items-center gap-1">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <circle cx="12" cy="17" r="1" fill="currentColor"/>
                </svg>
                ${this.error}
              </p>
            ` : fullName ? html`
              <p class="mt-1.5 text-[11px] text-[#6a6a6a]">
                Will create: <span class="font-mono text-[#1a1a1a]">${fullName}</span>
              </p>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }
}
