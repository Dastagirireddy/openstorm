import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../tailwind-element.js';

@customElement('rename-dialog')
export class RenameDialog extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property() filePath = '';
  @property() fileName = '';

  @state() private newName = '';
  @state() private error = '';
  @state() private existingFiles: string[] = [];

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('open') && this.open) {
      // Extract just the name without extension for editing
      const nameWithoutExt = this.fileName.includes('.')
        ? this.fileName.substring(0, this.fileName.lastIndexOf('.'))
        : this.fileName;
      this.newName = nameWithoutExt;
      this.error = '';
      this.loadExistingFiles();
      setTimeout(() => {
        const input = this.shadowRoot?.querySelector('input') as HTMLInputElement;
        if (input) {
          input.focus();
          // Select all text except extension
          if (this.fileName.includes('.')) {
            input.setSelectionRange(0, nameWithoutExt.length);
          } else {
            input.select();
          }
        }
      }, 10);
    }
  }

  private async loadExistingFiles(): Promise<void> {
    const parentPath = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
    if (!parentPath) {
      this.existingFiles = [];
      return;
    }
    try {
      const result = await invoke('list_directory', { path: parentPath });
      const files = result as Array<{ name: string }>;
      this.existingFiles = files
        .map(f => f.name)
        .filter(name => name !== this.fileName);
    } catch (error) {
      console.error('Failed to load existing files:', error);
      this.existingFiles = [];
    }
  }

  private validateName(name: string): string {
    if (!name.trim()) return 'Name cannot be empty';
    if (/[<>:"/\\|?*]/.test(name)) return 'Invalid characters in name';

    // Preserve original extension
    const ext = this.fileName.includes('.') ? this.fileName.substring(this.fileName.lastIndexOf('.')) : '';
    const fullName = name + ext;
    if (this.existingFiles.includes(fullName)) return 'File already exists';

    return '';
  }

  private getFullName(): string {
    if (!this.newName) return '';
    const ext = this.fileName.includes('.') ? this.fileName.substring(this.fileName.lastIndexOf('.')) : '';
    return this.newName + ext;
  }

  private handleInput = (e: Event): void => {
    const input = e.target as HTMLInputElement;
    this.newName = input.value;
    this.error = this.validateName(this.newName);
  };

  private handleConfirm = async (): Promise<void> => {
    if (this.newName.trim() && !this.error) {
      const ext = this.fileName.includes('.') ? this.fileName.substring(this.fileName.lastIndexOf('.')) : '';
      const newName = this.newName + ext;
      const parentPath = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
      const newPath = `${parentPath}/${newName}`;

      try {
        await invoke('rename_file', { oldPath: this.filePath, newPath });
        this.dispatchEvent(
          new CustomEvent('confirm', {
            detail: { oldPath: this.filePath, newPath, newName },
            bubbles: true,
            composed: true,
          }),
        );
        this.open = false;
      } catch (error) {
        this.error = `Failed to rename: ${error}`;
        return;
      }
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
    const showError = this.error && this.newName.trim();

    return html`
      <div
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click=${this.handleCancel}
      >
        <div
          class="rounded-lg shadow-2xl w-[400px] border overflow-hidden"
          style="background-color: var(--app-bg); border-color: var(--app-border);"
          @click=${(e: Event) => e.stopPropagation()}
          @mousedown=${(e: Event) => e.stopPropagation()}
          @keydown=${this.handleKeydown}
          tabindex="-1"
        >
          <!-- Content -->
          <div class="px-6 py-5">
            <h3 class="text-[14px] font-semibold mb-4" style="color: var(--app-foreground);">Rename</h3>
            <input
              type="text"
              class="w-full px-3 py-2 border rounded-md text-[13px] focus:outline-none focus:ring-2 focus:border-transparent"
              style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: ${showError ? '#ef4444' : 'var(--app-input-border)'};"
              value="${this.newName}"
              @input=${this.handleInput}
              @keydown=${this.handleKeydown}
              @mousedown=${(e: Event) => e.stopPropagation()}
            />
            ${showError ? html`
              <p class="mt-2 text-[12px] text-red-600">${this.error}</p>
            ` : fullName ? html`
              <p class="mt-2 text-[12px]" style="color: var(--app-disabled-foreground);">
                Renaming to: <span class="font-mono" style="color: var(--app-foreground);">${fullName}</span>
              </p>
            ` : ''}
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
              class="px-4 py-1.5 text-[13px] text-white bg-[#5b47c9] hover:bg-[#4a37b5] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              @click=${this.handleConfirm}
              ?disabled=${!!this.error || !this.newName.trim()}
            >
              Rename
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
