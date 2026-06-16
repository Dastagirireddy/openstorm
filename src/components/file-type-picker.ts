import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';
import './layout/icon.js';
import './layout/file-icon.js';

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

    const groupOrder = ['basic', 'languages', 'detected', 'config', 'docs', 'styles', 'test'];
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
          class="absolute rounded-lg shadow-xl overflow-hidden z-50 w-[260px]"
          style="left: ${this.anchorX}px; top: ${this.anchorY}px; background: var(--app-bg, #ffffff); border: 1px solid var(--app-input-border, #d0d0d0);"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <!-- Search Input -->
          <div class="px-2 py-1.5" style="border-bottom: 1px solid var(--app-border, #e0e0e0); background: var(--app-toolbar-background, #fafafa);">
            <input
              ${ref => { this.searchInput = ref as HTMLInputElement; }}
              type="text"
              class="w-full px-2 py-1 text-[12px] border rounded focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              style="border-color: var(--app-input-border, #d0d0d0);"
              placeholder="Search..."
              value="${this.searchQuery}"
              @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value; this.selectedIndex = 0; }}
              @click=${(e: Event) => e.stopPropagation()}
            />
          </div>

          <!-- Template List -->
          <div class="max-h-[320px] overflow-y-auto">
            ${this.groupedTemplates.map(groupData => {
              const { group, templates } = groupData;
              const groupLabel = this.getGroupLabel(group);

              return html`
                <div>
                  <div class="px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider sticky top-0" style="color: var(--app-secondary-foreground, #6a6a6a); background: var(--app-toolbar-hover, #f5f5f5); border-bottom: 1px solid var(--app-border, #e0e0e0);">
                    ${groupLabel}
                  </div>
                  ${templates.map(template => {
                    const index = flatTemplates.findIndex(t => t.id === template.id);
                    const isSelected = index === this.selectedIndex;

                    return html`
                      <div
                        class="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors"
                        style="${isSelected ? 'background: var(--app-selection-background, #e8e0f5); color: var(--brand-primary, #5b47c9);' : ''}"
                        @click=${() => this.handleSelect(template)}
                      >
                        ${template.icon
                          ? html`<file-icon path="${template.icon}" size="14"></file-icon>`
                          : html`<os-icon name="file" color="var(--app-secondary-foreground, #5a5a5a)" size="14"></os-icon>`
                        }
                        <span class="flex-1 text-[12px] truncate" style="color: var(--app-foreground, inherit);">${template.name}</span>
                        ${template.shortcut ? html`
                          <span class="text-[9px] font-mono px-1 rounded" style="color: var(--app-disabled-foreground, #8a8a8a); background: var(--app-toolbar-hover, #e8e8e8);">${template.shortcut}</span>
                        ` : ''}
                      </div>
                    `;
                  })}
                </div>
              `;
            })}

            ${flatTemplates.length === 0 ? html`
              <div class="px-3 py-4 text-center text-[12px]" style="color: var(--app-secondary-foreground, #6a6a6a);">
                No matches
              </div>
            ` : ''}
          </div>

          <!-- Footer hint -->
          <div class="px-2.5 py-1.5 flex items-center justify-between text-[9px]" style="border-top: 1px solid var(--app-border, #e0e0e0); background: var(--app-toolbar-background, #fafafa); color: var(--app-disabled-foreground, #8a8a8a);">
            <span>↑↓ Navigate</span>
            <span>·</span>
            <span>Enter</span>
            <span>·</span>
            <span>Esc</span>
          </div>
        </div>
      </div>
    `;
  }
}
