import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../tailwind-element.js';

@customElement('delete-dialog')
export class DeleteDialog extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property() filePath = '';
  @property() fileName = '';
  @property({ type: Boolean }) isDirectory = false;

  @state() private isDeleting = false;
  @state() private error = '';

  private handleConfirm = async (): Promise<void> => {
    this.isDeleting = true;
    this.error = '';

    try {
      await invoke('delete_file', { path: this.filePath, isDir: this.isDirectory });
      this.dispatchEvent(
        new CustomEvent('confirm', {
          detail: { path: this.filePath },
          bubbles: true,
          composed: true,
        }),
      );
      this.open = false;
    } catch (error) {
      this.error = `Failed to delete: ${error}`;
    } finally {
      this.isDeleting = false;
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
    if (e.key === 'Enter' && !this.isDeleting) {
      e.preventDefault();
      this.handleConfirm();
    } else if (e.key === 'Escape') {
      this.handleCancel();
    }
  };

  render() {
    if (!this.open) return html``;

    const title = this.isDirectory ? 'Delete Folder' : 'Delete File';

    return html`
      <div
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click=${this.handleCancel}
      >
        <div
          class="bg-white rounded-lg shadow-2xl w-[420px] border border-[#d0d0d0] overflow-hidden"
          @click=${(e: Event) => e.stopPropagation()}
          @mousedown=${(e: Event) => e.stopPropagation()}
          @keydown=${this.handleKeydown}
          tabindex="-1"
        >
          <!-- Content - centered with icon -->
          <div class="px-6 py-5">
            <div class="flex items-start gap-4">
              <!-- Warning icon in red circle -->
              <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <circle cx="12" cy="17" r="1" fill="currentColor"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-[14px] font-semibold text-[#1a1a1a] mb-1">${title}</h3>
                <p class="text-[13px] text-[#5a5a5a] leading-relaxed">
                  ${this.isDirectory
                    ? html`Are you sure you want to delete the folder <strong class="font-semibold text-[#1a1a1a]">${this.fileName}</strong> and all its contents? This action cannot be undone.`
                    : html`Are you sure you want to delete <strong class="font-semibold text-[#1a1a1a]">${this.fileName}</strong>? This action cannot be undone.`
                  }
                </p>
                ${this.error ? html`
                  <p class="mt-2 text-[12px] text-red-600">${this.error}</p>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Buttons - right aligned, no background -->
          <div class="px-6 py-4 flex justify-end gap-2">
            <button
              class="px-4 py-1.5 text-[13px] text-[#5a5a5a] bg-white border border-[#d0d0d0] rounded-md hover:bg-[#f5f5f5] transition-colors"
              @click=${this.handleCancel}
              ?disabled=${this.isDeleting}
            >
              Cancel
            </button>
            <button
              class="px-4 py-1.5 text-[13px] text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              @click=${this.handleConfirm}
              ?disabled=${this.isDeleting}
            >
              ${this.isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
