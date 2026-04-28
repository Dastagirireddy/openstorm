import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { open } from '@tauri-apps/plugin-dialog';
import { TailwindElement } from "../../tailwind-element.js";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  language: string;
  icon: string;
  icon_color: string;
  version: string;
  variables?: Array<{
    name: string;
    type: string;
    required?: boolean;
    default?: any;
    placeholder?: string;
  }>;
}

export interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
  count: number;
}

// Category display names and icons
const CATEGORIES: Record<string, { name: string; icon: string }> = {
  'web-backend': { name: 'Web Backend', icon: 'server' },
  'frontend': { name: 'Frontend', icon: 'globe' },
  'typescript': { name: 'TypeScript', icon: 'file-code' },
  'cli': { name: 'Command Line', icon: 'terminal' },
  'library': { name: 'Library', icon: 'package' },
  'desktop': { name: 'Desktop', icon: 'box' },
  'devops': { name: 'DevOps', icon: 'server' },
};

@customElement("template-picker")
export class TemplatePicker extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @state() private selectedTemplate: Template | null = null;
  @state() private projectName = "";
  @state() private projectPath = "";
  @state() private selectedCategory: string = 'web-backend';
  @state() private showLocationInput = false;
  @state() private categories: TemplateCategory[] = [];
  @state() private templates: Template[] = [];
  @state() private loading = false;
  @state() private error = "";

  connectedCallback(): void {
    super.connectedCallback();
    if (this.open) {
      this.loadTemplates();
    }
  }

  private async loadTemplates() {
    if (!this.open) return;

    this.loading = true;
    try {
      const [categories, templates] = await Promise.all([
        invoke<TemplateCategory[]>('list_categories'),
        invoke<Template[]>('list_templates'),
      ]);
      this.categories = categories;
      this.templates = templates;

      // Set first available category if current one has no templates
      if (this.templates.filter(t => t.category === this.selectedCategory).length === 0) {
        this.selectedCategory = this.categories[0]?.id || 'web-backend';
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
      this.error = 'Failed to load templates';
    } finally {
      this.loading = false;
    }
  }

  private getFilteredTemplates = () => {
    return this.templates.filter(t => t.category === this.selectedCategory);
  };

  private handleTemplateSelect = (template: Template) => {
    this.selectedTemplate = template;
    this.error = "";
  };

  private handleBack = () => {
    this.selectedTemplate = null;
    this.error = "";
  };

  private handleCreate = async () => {
    console.log('handleCreate called', {
      projectName: this.projectName,
      selectedTemplate: this.selectedTemplate?.id,
      loading: this.loading,
    });

    if (!this.projectName.trim()) {
      this.error = "Project name is required";
      console.log('Validation failed: no project name');
      return;
    }

    if (!this.selectedTemplate) {
      this.error = "Please select a template";
      console.log('Validation failed: no template selected');
      return;
    }

    this.loading = true;
    this.error = "";

    try {
      const projectPath = await invoke<string>('create_project', {
        request: {
          template_id: this.selectedTemplate.id,
          project_name: this.projectName,
          project_path: this.projectPath || '',
          variables: null,
        },
      });

      console.log('Project created:', projectPath);

      this.dispatchEvent(new CustomEvent("template-confirmed", {
        detail: {
          name: this.projectName,
          path: projectPath,
          template: this.selectedTemplate,
        },
        bubbles: true,
        composed: true,
      }));

      this.reset();
    } catch (err: any) {
      this.error = err.message || "Failed to create project";
    } finally {
      this.loading = false;
    }
  };

  private reset = () => {
    this.selectedTemplate = null;
    this.projectName = "";
    this.projectPath = "";
    this.error = "";
    this.showLocationInput = false;
  };

  private openFolderDialog = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select project location',
      });

      if (selected) {
        this.projectPath = selected.toString();
      }
    } catch (err) {
      console.error('Failed to open folder dialog:', err);
      this.error = 'Failed to open folder dialog';
    }
  };

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('open') && this.open) {
      this.loadTemplates();
    }
  }

  private handleClose = () => {
    this.reset();
    this.open = false;
    this.dispatchEvent(new CustomEvent('template-picker-close', {
      bubbles: true,
      composed: true,
    }));
  };

  private renderLanguageIcon(language: string): ReturnType<typeof html> {
    const colors: Record<string, string> = {
      'rust': '#ea580c',
      'node': '#16a34a',
      'typescript': '#1d4ed8',
      'go': '#0891b2',
      'python': '#2563eb',
      'java': '#15803d',
      'react': '#0e7490',
      'vue': '#059669',
      'docker': '#0284c7',
    };
    return html`
      <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${colors[language] || '#6b7280'}"></span>
    `;
  }

  private renderSidebar() {
    return html`
      <div class="flex flex-col h-full" style="background-color: var(--app-tab-inactive);">
        <div class="flex items-center justify-between px-3 py-2.5 border-b" style="border-color: var(--app-border);">
          <h2 class="text-[11px] font-medium uppercase tracking-wide" style="color: var(--app-disabled-foreground);">Categories</h2>
          <button
            @click=${this.handleClose}
            class="p-1 rounded transition-colors"
            style="color: var(--app-disabled-foreground);"
            @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
            @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            <os-icon name="x" size="14"></os-icon>
          </button>
        </div>

        ${this.loading
          ? html`<div class="flex-1 flex items-center justify-center"><div class="text-xs" style="color: var(--app-disabled-foreground);">Loading...</div></div>`
          : html`
              <div class="flex-1 overflow-y-auto p-1.5">
                <div class="flex flex-col gap-0.5">
                  ${this.categories.map((cat) => {
                    const isSelected = this.selectedCategory === cat.id;
                    return html`
                      <div
                        class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-[#e0e7ff] text-[#4f46e5]' : 'hover:bg-[#f3f4f6]'}"
                        @click=${() => { this.selectedCategory = cat.id; this.selectedTemplate = null; }}
                      >
                        <div class="flex items-center gap-2">
                          <os-icon name="${cat.icon}" size="14" color="${isSelected ? '#4f46e5' : 'var(--app-disabled-foreground)'}"></os-icon>
                          <span class="text-[12px] font-medium" style="color: ${isSelected ? '#4f46e5' : 'var(--app-foreground)'};">${cat.name}</span>
                        </div>
                        <span class="text-[10px] px-1.5 py-0.5 rounded-md" style="background-color: var(--app-toolbar-hover); color: var(--app-disabled-foreground);">${cat.count}</span>
                      </div>
                    `;
                  })}
                </div>
              </div>
            `
        }
      </div>
    `;
  }

  private renderTemplateGrid() {
    const templates = this.getFilteredTemplates();

    if (this.loading) {
      return html`
        <div class="flex flex-col items-center justify-center h-32">
          <os-icon name="loading" size="20" color="#9ca3af" class="animate-spin"></os-icon>
          <div class="mt-2 text-[#9ca3af] text-xs">Loading...</div>
        </div>
      `;
    }

    if (templates.length === 0) {
      return html`
        <div class="flex flex-col items-center justify-center h-32">
          <os-icon name="folder" size="28" color="#d1d5db"></os-icon>
          <p class="mt-2 text-[#6b7280] text-xs">No templates in this category</p>
        </div>
      `;
    }

    const categoryInfo = CATEGORIES[this.selectedCategory];

    return html`
      <div class="flex flex-col h-full">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-[11px] font-medium uppercase tracking-wide" style="color: var(--app-disabled-foreground);">${categoryInfo?.name || 'Templates'}</h2>
          <span class="text-[10px]" style="color: var(--app-disabled-foreground);">${templates.length} templates</span>
        </div>

        <div class="flex-1 overflow-y-auto -mr-2 pr-2">
          <div class="grid grid-cols-2 gap-2">
            ${templates.map((template) => {
              const isSelected = this.selectedTemplate?.id === template.id;
              return html`
                <div
                  class="group p-2.5 border rounded-md cursor-pointer transition-all ${isSelected ? 'border-[#4f46e5] bg-[#e0e7ff]' : 'hover:border-[#4f46e5]'}"
                  style="background-color: var(--app-bg); border-color: var(--app-border);"
                  @click=${() => this.handleTemplateSelect(template)}
                >
                  <div class="flex items-start gap-2">
                    <div class="w-8 h-8 rounded border flex items-center justify-center flex-shrink-0" style="background-color: var(--app-tab-inactive); border-color: var(--app-border);">
                      <os-icon name="${template.icon}" size="16" color="${template.icon_color}"></os-icon>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[12px] font-medium truncate" style="color: var(--app-foreground);">
                        ${template.name}
                      </div>
                      <div class="flex items-center gap-1.5 mt-0.5">
                        ${this.renderLanguageIcon(template.language)}
                        <span class="text-[9px] capitalize" style="color: var(--app-disabled-foreground);">${template.language}</span>
                      </div>
                    </div>
                  </div>
                  <div class="text-[10px] mt-1 line-clamp-2" style="color: var(--app-disabled-foreground);">
                    ${template.description}
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }

  private renderTemplateDetails() {
    if (!this.selectedTemplate) return html``;

    return html`
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="flex items-center gap-3 px-4 py-3 border-b" style="background-color: var(--app-tab-inactive); border-color: var(--app-border);">
          <div class="w-10 h-10 rounded-md border shadow-sm flex items-center justify-center flex-shrink-0" style="background-color: var(--app-bg); border-color: var(--app-border);">
            <os-icon name="${this.selectedTemplate.icon}" size="20" color="${this.selectedTemplate.icon_color}"></os-icon>
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-[14px] font-semibold truncate" style="color: var(--app-foreground);">${this.selectedTemplate.name}</h2>
            <p class="text-[12px] truncate" style="color: var(--app-disabled-foreground);">${this.selectedTemplate.description}</p>
          </div>
          <button
            @click=${this.handleBack}
            class="p-2 rounded-md transition-colors"
            style="color: var(--app-disabled-foreground);"
            @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
            @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            <os-icon name="chevron-right" size="18" style="transform: rotate(180deg);"></os-icon>
          </button>
        </div>

        <!-- Form fields -->
        <div class="space-y-4 px-4 py-4 flex-1 overflow-y-auto" style="background-color: var(--app-bg);">
          <div>
            <label class="block text-[12px] font-medium mb-1.5" style="color: var(--app-foreground);">
              Project name
              <span class="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="project-name-input"
              type="text"
              class="w-full px-3 py-2 border rounded-md text-[13px] focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5]"
              style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: var(--app-input-border);"
              placeholder="my-project"
              .value=${this.projectName}
              @input=${(e: Event) => this.projectName = (e.target as HTMLInputElement).value}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') this.handleCreate();
              }}
            />
          </div>

          <div>
            <label class="block text-[12px] font-medium mb-1.5" style="color: var(--app-foreground);">
              Location
              <span class="font-normal" style="color: var(--app-disabled-foreground);">(optional)</span>
            </label>
            <!-- Single unified field with integrated browse button -->
            <div class="flex items-center border rounded-md overflow-hidden focus-within:border-[#4f46e5] focus-within:ring-1 focus-within:ring-[#4f46e5]" style="border-color: var(--app-input-border);">
              <input
                type="text"
                class="flex-1 px-3 py-2 text-[13px] focus:outline-none min-w-0"
                style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: var(--app-input-border);"
                placeholder="~/projects"
                .value=${this.projectPath}
                @input=${(e: Event) => this.projectPath = (e.target as HTMLInputElement).value}
              />
              <button
                type="button"
                @click=${this.openFolderDialog}
                class="px-3 py-2 border-l transition-colors flex items-center gap-2"
                style="background-color: var(--app-tab-inactive); border-color: var(--app-border);"
                title="Browse folders"
                @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-tab-inactive)'; }}
              >
                <os-icon name="folder" size="15" style="color: var(--app-disabled-foreground);"></os-icon>
              </button>
            </div>
          </div>

          <!-- Template variables -->
          ${this.selectedTemplate.variables?.filter(v => v.name !== 'project-name').map((variable) => {
            const formatLabel = (name: string) => {
              return name.replace(/-/g, ' ')
                .replace(/\b(port|url|http|ssl|api|db|sql)\b/gi, (match) => match.toUpperCase())
                .replace(/\b\w/g, l => l.toUpperCase());
            };
            const label = formatLabel(variable.name);
            return html`
              <div>
                <label class="block text-[12px] font-medium text-[#374151] mb-1.5">
                  ${label}
                </label>
                <input
                  type="${variable.type === 'number' ? 'number' : 'text'}"
                  class="w-full px-3 py-2 bg-white border border-[#d1d5db] rounded-md text-[13px] text-[#111827] focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] placeholder-[#9ca3af]"
                  placeholder=${variable.placeholder || ''}
                  .value=${variable.default ?? ''}
                />
              </div>
            `;
          }) || ''}

          ${this.error
            ? html`<p class="text-[12px] text-red-500 mt-1">${this.error}</p>`
            : html``
          }
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t" style="background-color: var(--app-tab-inactive); border-color: var(--app-border);">
          <button
            @click=${this.handleClose}
            class="px-4 py-2 border text-[13px] font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style="background-color: var(--app-bg); color: var(--app-foreground); border-color: var(--app-border);"
            @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
            @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-bg)'; }}
            ?disabled=${this.loading}
          >
            Cancel
          </button>
          <button
            @click=${this.handleCreate}
            class="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[13px] font-medium rounded-md hover:shadow-md hover:shadow-indigo-100/50 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            ?disabled=${this.loading}
          >
            ${this.loading ? html`<span class="flex items-center gap-2"><os-icon name="loading" size="14" color="white" class="animate-spin"></os-icon>Creating...</span>` : 'Create Project'}
          </button>
        </div>
      </div>
    `;
  }

  render() {
    if (!this.open) return html``;

    return html`
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          @click=${this.handleClose}
        ></div>

        <div
          class="relative rounded-lg shadow-xl w-full max-w-[700px] mx-4 overflow-hidden flex flex-col"
          style="background-color: var(--app-bg); border-color: var(--app-border); animation: scaleIn 0.12s ease-out;"
        >
          ${this.selectedTemplate
            ? this.renderTemplateDetails()
            : html`
                <div class="flex h-full max-h-[480px]">
                  <!-- Left Sidebar: Categories -->
                  <div class="w-52 border-r border-[#e5e7eb] bg-[#f9fafb]">
                    ${this.renderSidebar()}
                  </div>
                  <!-- Right: Template Grid -->
                  <div class="flex-1 p-4 overflow-hidden bg-white">
                    ${this.renderTemplateGrid()}
                  </div>
                </div>
              `
          }
        </div>
      </div>

      <style>
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      </style>
    `;
  }
}
