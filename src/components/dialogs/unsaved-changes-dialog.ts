import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';

@customElement('unsaved-changes-dialog')
export class UnsavedChangesDialog extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property() projectName = '';
  @property({ type: Number }) unsavedCount = 0;

  private handleSaveAndClose = (): void => {
    this.dispatchEvent(
      new CustomEvent('save-and-close', {
        bubbles: true,
        composed: true,
      }),
    );
    this.open = false;
  };

  private handleCloseWithoutSaving = (): void => {
    this.dispatchEvent(
      new CustomEvent('close-without-saving', {
        bubbles: true,
        composed: true,
      }),
    );
    this.open = false;
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
    if (e.key === 'Escape') {
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
          class="rounded-lg shadow-2xl w-[420px] border overflow-hidden"
          style="background-color: var(--app-bg); border-color: var(--app-border);"
          @click=${(e: Event) => e.stopPropagation()}
          @mousedown=${(e: Event) => e.stopPropagation()}
          @keydown=${this.handleKeydown}
          tabindex="-1"
        >
          <!-- Content -->
          <div class="px-6 py-5">
            <div class="flex items-start gap-4">
              <!-- Warning icon -->
              <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background-color: rgba(245, 158, 11, 0.1);">
                <svg class="w-5 h-5" style="color: #f59e0b;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <circle cx="12" cy="17" r="1" fill="currentColor"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-[14px] font-semibold mb-1" style="color: var(--app-foreground);">
                  Save changes to ${this.projectName || 'project'}?
                </h3>
                <p class="text-[13px] leading-relaxed" style="color: var(--app-disabled-foreground);">
                  ${this.unsavedCount === 1
                    ? html`You have <strong class="font-semibold" style="color: var(--app-foreground);">1 unsaved file</strong>. Do you want to save it before closing?`
                    : html`You have <strong class="font-semibold" style="color: var(--app-foreground);">${this.unsavedCount} unsaved files</strong>. Do you want to save them before closing?`
                  }
                </p>
              </div>
            </div>
          </div>

          <!-- Buttons -->
          <div class="px-6 py-4 flex justify-end gap-2">
            <button
              class="px-4 py-1.5 text-[13px] border rounded-md transition-colors"
              style="background-color: var(--app-bg); color: var(--app-disabled-foreground); border-color: var(--app-border);"
              @click=${this.handleCancel}
            >
              Cancel
            </button>
            <button
              class="px-4 py-1.5 text-[13px] rounded-md transition-colors"
              style="background-color: var(--app-bg); color: var(--app-foreground); border: 1px solid var(--app-border);"
              @click=${this.handleCloseWithoutSaving}
            >
              Don't Save
            </button>
            <button
              class="px-4 py-1.5 text-[13px] text-white rounded-md transition-colors"
              style="background-color: var(--brand-primary);"
              @click=${this.handleSaveAndClose}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
