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
  shortcut?: string;
  group?: 'basic' | 'detected' | 'config' | 'docs' | 'styles' | 'test' | 'languages';
  description?: string;
}

@customElement('file-type-picker')
export class FileTypePicker extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property({ type: Array }) templates: FileTemplate[] = [];
  @property({ type: Number }) anchorX = 0;
  @property({ type: Number }) anchorY = 0;

  @state() private selectedIndex = 0;
  @state() private searchQuery = '';
  private searchInput: HTMLInputElement | null = null;

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('open') && this.open) {
      this.selectedIndex = 0;
      this.searchQuery = '';
      setTimeout(() => {
        this.searchInput?.focus();
      }, 50);
    }
  }

  private get filteredTemplates(): FileTemplate[] {
    if (!this.searchQuery) return this.templates;
    const query = this.searchQuery.toLowerCase();
    return this.templates.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.extension.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query)
    );
  }

  private get groupedTemplates(): { group: string; templates: FileTemplate[] }[] {
    const filtered = this.filteredTemplates;
    const groups = new Map<string, FileTemplate[]>();

    filtered.forEach(template => {
      const group = template.group || 'languages';
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(template);
    });

    const groupOrder = ['basic', 'detected', 'config', 'docs', 'styles', 'test', 'languages'];
    const result: { group: string; templates: FileTemplate[] }[] = [];

    groupOrder.forEach(group => {
      if (groups.has(group)) {
        result.push({ group, templates: groups.get(group)! });
        groups.delete(group);
      }
    });

    // Add any remaining groups
    groups.forEach((templates, group) => {
      result.push({ group, templates });
    });

    return result;
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
    const filtered = this.getFlatTemplates();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, filtered.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[this.selectedIndex]) {
        this.handleSelect(filtered[this.selectedIndex]);
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

  private getFlatTemplates(): FileTemplate[] {
    return this.groupedTemplates.flatMap(g => g.templates);
  }

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

  render() {
    if (!this.open) return html``;

    const flatTemplates = this.getFlatTemplates();

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
          class="absolute bg-white rounded-lg shadow-xl border border-[#d0d0d0] overflow-hidden z-50 w-[280px]"
          style="left: ${this.anchorX}px; top: ${this.anchorY}px;"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <!-- Search Input -->
          <div class="px-3 py-2 border-b border-[#e0e0e0] bg-[#fafafa]">
            <input
              ${ref => { this.searchInput = ref as HTMLInputElement; }}
              type="text"
              class="w-full px-2.5 py-1.5 text-[13px] border border-[#c0c0c0] rounded-md focus:outline-none focus:ring-2 focus:ring-[#5b47c9] focus:border-transparent"
              placeholder="Search file types..."
              value="${this.searchQuery}"
              @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value; this.selectedIndex = 0; }}
              @click=${(e: Event) => e.stopPropagation()}
            />
          </div>

          <!-- Template List -->
          <div class="max-h-[360px] overflow-y-auto py-1">
            ${this.groupedTemplates.map(groupData => {
              const { group, templates } = groupData;
              const groupLabel = this.getGroupLabel(group);

              return html`
                <div class="mt-1 first:mt-0">
                  <div class="px-3 py-1 text-[10px] font-semibold text-[#6a6a6a] uppercase tracking-wider bg-[#f5f5f5] border-t border-b border-[#e0e0e0] first:border-t-0">
                    ${groupLabel}
                  </div>
                  ${templates.map(template => {
                    const index = flatTemplates.findIndex(t => t.id === template.id);
                    const isSelected = index === this.selectedIndex;

                    return html`
                      <div
                        class="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-[#e8e0f5] text-[#5b47c9]' : 'hover:bg-[#f0f0f0]'}"
                        @click=${() => this.handleSelect(template)}
                      >
                        ${template.icon
                          ? html`<file-icon path="${template.icon}" size="16"></file-icon>`
                          : html`<os-icon name="file" color="#5a5a5a" size="16"></os-icon>`
                        }
                        <span class="flex-1 text-[13px] truncate">${template.name}</span>
                        ${template.shortcut ? html`
                          <span class="text-[10px] text-[#8a8a8a] font-mono bg-[#f0f0f0] px-1.5 py-0.5 rounded">${template.shortcut}</span>
                        ` : ''}
                      </div>
                    `;
                  })}
                </div>
              `;
            })}

            ${flatTemplates.length === 0 ? html`
              <div class="px-4 py-6 text-center text-[13px] text-[#6a6a6a]">
                No file types found
              </div>
            ` : ''}
          </div>

          <!-- Footer hint -->
          <div class="px-3 py-2 border-t border-[#e0e0e0] bg-[#fafafa] flex items-center justify-between text-[10px] text-[#8a8a8a]">
            <span>↑↓ Navigate</span>
            <span>Enter Select</span>
            <span>Esc Cancel</span>
          </div>
        </div>
      </div>
    `;
  }
}
