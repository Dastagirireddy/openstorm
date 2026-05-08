import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../../tailwind-element.js';
import type { FileTemplate } from '../file-type-picker.js';
import '../../components/layout/file-icon.js';
import '../layout/icon.js';

@customElement('file-create-dialog')
export class FileCreateDialog extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property({ type: Array }) templates: FileTemplate[] = [];
  @property() parentPath = '';

  @state() private selectedTemplate: FileTemplate | null = null;
  @state() private filename = '';
  @state() private error = '';
  @state() private existingFiles: string[] = [];

  private scrollContainer: HTMLElement | null = null;

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    // Load existing files when parentPath changes and dialog is open
    if (changedProperties.has('parentPath') && this.open) {
      this.loadExistingFiles();
    }
    if (changedProperties.has('open') && this.open) {
      this.reset();
    }
  }

  private reset(): void {
    this.selectedTemplate = this.templates.length > 0 ? this.templates[0] : null;
    this.filename = '';
    this.error = '';
    // loadExistingFiles is called by parentPath watcher
    setTimeout(() => {
      const input = this.shadowRoot?.querySelector('#filename-input') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }, 10);
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

    const ext = this.selectedTemplate?.extension;
    const fullName = ext && !name.includes('.') ? `${name}.${ext}` : name;
    if (this.existingFiles.includes(fullName)) return 'File already exists';

    return '';
  }

  private getFullName(): string {
    if (!this.filename) return '';
    const ext = this.selectedTemplate?.extension;
    return ext && !this.filename.includes('.') ? `${this.filename}.${ext}` : this.filename;
  }

  private handleTemplateSelect(template: FileTemplate): void {
    this.selectedTemplate = template;
    this.error = this.validateName(this.filename);
  }

  private handleInput = (e: Event): void => {
    const input = e.target as HTMLInputElement;
    this.filename = input.value;
    this.error = this.validateName(this.filename);
  };

  private handleConfirm = (): void => {
    if (this.filename.trim() && !this.error && this.selectedTemplate) {
      const fullName = this.getFullName();
      this.dispatchEvent(
        new CustomEvent('confirm', {
          detail: {
            name: fullName,
            template: this.selectedTemplate,
            parentPath: this.parentPath
          },
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

  private getGroupLabel(group: string): string {
    const labels: Record<string, string> = {
      basic: 'Basic',
      detected: 'Detected',
      config: 'Config',
      docs: 'Docs',
      styles: 'Styles',
      test: 'Tests',
      languages: 'Languages',
    };
    return labels[group] || group;
  }

  private get groupedTemplates(): { group: string; templates: FileTemplate[] }[] {
    const groups = new Map<string, FileTemplate[]>();

    this.templates.forEach(template => {
      const group = template.group || 'languages';
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(template);
    });

    const groupOrder = ['basic', 'detected', 'languages', 'config', 'docs', 'styles', 'test'];
    const result: { group: string; templates: FileTemplate[] }[] = [];

    groupOrder.forEach(group => {
      if (groups.has(group)) {
        result.push({ group, templates: groups.get(group)! });
        groups.delete(group);
      }
    });

    groups.forEach((templates, group) => {
      result.push({ group, templates });
    });

    return result;
  }

  private handleScroll = (e: Event): void => {
    const target = e.target as HTMLElement;
    // Store scroll position in a data attribute for persistence
    target.setAttribute('data-scroll', String(target.scrollTop));
  };

  render() {
    if (!this.open) return html``;

    const fullName = this.getFullName();
    const showError = this.error && this.filename.trim();

    return html`
      <div
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click=${this.handleCancel}
      >
        <div
          class="bg-white rounded-lg shadow-2xl w-[420px] border border-[#d0d0d0] overflow-hidden flex flex-col"
          style="max-height: 420px;"
          @click=${(e: Event) => e.stopPropagation()}
          @mousedown=${(e: Event) => e.stopPropagation()}
          @keydown=${this.handleKeydown}
          tabindex="-1"
        >
          <!-- Compact Input at Top - Fixed position -->
          <div class="px-3 py-2.5 bg-[#f5f5f5] border-b border-[#d0d0d0] flex-shrink-0" style="min-height: 62px;">
            <input
              id="filename-input"
              type="text"
              class="w-full px-2.5 py-1.5 text-[13px] bg-white border rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] focus:border-transparent"
              style="border-color: ${showError ? '#ef4444' : 'var(--app-input-border)'};"
              placeholder="File name..."
              value="${this.filename}"
              @input=${this.handleInput}
              @keydown=${this.handleKeydown}
              @mousedown=${(e: Event) => e.stopPropagation()}
            />
            ${fullName && !showError ? html`
              <p class="mt-1 text-[10px] text-[#6a6a6a] truncate h-[14px]">
                ${fullName}
              </p>
            ` : html`<div class="h-[14px]"></div>`}
            ${showError ? html`
              <p class="mt-1 text-[10px] text-red-600 h-[14px]">${this.error}</p>
            ` : html`<div class="h-[14px]"></div>`}
          </div>

          <!-- Template Grid with Groups - Scrollable -->
          <div
            class="flex-1 overflow-y-auto px-3 py-2 bg-white"
            @scroll=${this.handleScroll}
          >
            ${this.groupedTemplates.map(groupData => {
              const groupLabel = this.getGroupLabel(groupData.group);
              return html`
                <div class="mb-2">
                  <div class="text-[9px] font-semibold text-[#8a8a8a] uppercase tracking-wider mb-1.5 px-1">${groupLabel}</div>
                  <div class="grid grid-cols-4 gap-1.5">
                    ${groupData.templates.map(template => {
                      const isSelected = this.selectedTemplate?.id === template.id;
                      return html`
                        <div
                          class="flex flex-col items-center justify-center p-1.5 rounded border cursor-pointer transition-all
                            ${isSelected
                              ? 'bg-[#e8e0f5] border-[#5b47c9] ring-1 ring-[#5b47c9]'
                              : 'bg-white border-[#e0e0e0] hover:bg-[#f5f5f5] hover:border-[#d0d0d0]'}"
                          @click=${() => this.handleTemplateSelect(template)}
                          title="${template.description || template.name}"
                        >
                          ${template.icon
                            ? html`<file-icon path="${template.icon}" size="22"></file-icon>`
                            : html`<os-icon name="file" color="#5a5a5a" size="22"></os-icon>`
                          }
                          <span class="text-[9px] text-center mt-1 text-[#1a1a1a] truncate w-full">${template.name}</span>
                        </div>
                      `;
                    })}
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }
}
