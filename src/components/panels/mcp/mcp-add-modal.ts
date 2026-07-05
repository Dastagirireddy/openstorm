import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import type { McpTemplate, McpServerStatus, McpServerConfig } from '../../../lib/types/ai-types.js';

@customElement('mcp-add-modal')
export class McpAddModal extends TailwindElement() {
  @property({ type: Array }) templates: McpTemplate[] = [];
  @property({ type: Array }) servers: McpServerStatus[] = [];
  @state() private activeTab: 'templates' | 'custom' = 'templates';
  @state() private selectedCategory = 'all';
  @state() private installingId: string | null = null;
  @state() private customName = '';
  @state() private customCommand = 'npx';
  @state() private customArgs = '-y @playwright/mcp@latest';
  @state() private customError = '';

  private getFilteredTemplates() {
    if (this.selectedCategory === 'all') return this.templates;
    return this.templates.filter(t => t.category === this.selectedCategory);
  }

  private isInstalled(template: McpTemplate) {
    return this.servers.some(s => s.name === template.config.name);
  }

  private async installTemplate(templateId: string) {
    if (this.installingId) return;
    this.installingId = templateId;
    try {
      await invoke('ai_mcp_install_template', { templateId });
      this.dispatchEvent(new CustomEvent('install', { detail: { templateId } }));
    } catch (e) {
      console.error('[MCP Add Modal] Install failed:', e);
    } finally {
      this.installingId = null;
    }
  }

  private async addCustom() {
    if (!this.customName || !this.customCommand) return;
    this.customError = '';
    const config: McpServerConfig = {
      name: this.customName,
      command: this.customCommand,
      args: this.customArgs.split(' ').filter(Boolean),
      env: {},
      enabled: true,
    };
    try {
      await invoke('ai_mcp_add_server', { config });
      this.dispatchEvent(new CustomEvent('install', { detail: { templateId: config.name } }));
    } catch (e) {
      this.customError = String(e);
    }
  }

  private close() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  render() {
    const categories = [
      { id: 'all', label: 'All', icon: 'codicon:layout' },
      { id: 'browser', label: 'Browser', icon: 'codicon:globe' },
      { id: 'development', label: 'Dev', icon: 'codicon:code' },
      { id: 'productivity', label: 'Productivity', icon: 'codicon:rocket' },
      { id: 'data', label: 'Data', icon: 'codicon:database' },
    ];

    return html`
      <div
        class="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
        @click=${() => this.close()}>
        <div
          class="bg-[var(--app-bg)] border rounded-xl shadow-2xl overflow-hidden flex flex-col w-[520px] max-h-[480px]"
          style="border-color: var(--app-border);"
          @click=${(e: Event) => e.stopPropagation()}>

          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: var(--app-border);">
            <div class="flex items-center gap-2">
              <iconify-icon icon="codicon:mcp" width="18"></iconify-icon>
              <span class="text-sm font-semibold">Add MCP Server</span>
            </div>
            <button
              @click=${() => this.close()}
              class="p-1 rounded hover:bg-[var(--app-hover-background)] cursor-pointer"
              style="color: var(--app-disabled-foreground);">
              <iconify-icon icon="codicon:close" width="16"></iconify-icon>
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex border-b" style="border-color: var(--app-border);">
            <button
              class="flex-1 px-3 py-2 text-xs font-medium transition-colors ${this.activeTab === 'templates' ? 'border-b-2' : ''}"
              style="${this.activeTab === 'templates' ? 'border-color: var(--ai-accent); color: var(--ai-accent);' : 'color: var(--app-disabled-foreground);'}"
              @click=${() => { this.activeTab = 'templates'; }}>
              Templates
            </button>
            <button
              class="flex-1 px-3 py-2 text-xs font-medium transition-colors ${this.activeTab === 'custom' ? 'border-b-2' : ''}"
              style="${this.activeTab === 'custom' ? 'border-color: var(--ai-accent); color: var(--ai-accent);' : 'color: var(--app-disabled-foreground);'}"
              @click=${() => { this.activeTab = 'custom'; }}>
              Custom
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-4">
            ${this.activeTab === 'templates' ? this.renderTemplates(categories) : this.renderCustom()}
          </div>
        </div>
      </div>
    `;
  }

  private renderTemplates(categories: { id: string; label: string; icon: string }[]) {
    return html`
      <!-- Category Filter -->
      <div class="flex gap-1 mb-3">
        ${categories.map(cat => html`
          <button
            class="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${this.selectedCategory === cat.id ? '' : 'hover:bg-[var(--app-hover-background)]'}"
            style="${this.selectedCategory === cat.id ? 'background: var(--ai-accent); color: white;' : 'color: var(--app-disabled-foreground);'}"
            @click=${() => { this.selectedCategory = cat.id; }}>
            <iconify-icon icon="${cat.icon}" width="10"></iconify-icon>
            ${cat.label}
          </button>
        `)}
      </div>

      <!-- Template Grid -->
      <div class="grid grid-cols-2 gap-2">
        ${this.getFilteredTemplates().map(template => {
          const installed = this.isInstalled(template);
          const installing = this.installingId === template.id;
          return html`
            <button
              class="flex items-start gap-2 p-2.5 rounded-lg text-left transition-all ${installed ? 'opacity-50' : 'hover:bg-[var(--app-hover-background)]'}"
              style="border: 1px solid var(--app-border);"
              ?disabled=${installed || installing}
              @click=${() => this.installTemplate(template.id)}>
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-medium flex items-center gap-1">
                  ${template.name}
                  ${installed ? html`<iconify-icon icon="codicon:check" class="text-green-500" width="10"></iconify-icon>` : ''}
                  ${installing ? html`<iconify-icon icon="codicon:loading" class="text-yellow-500 animate-spin" width="10"></iconify-icon>` : ''}
                </div>
                <div class="text-[10px] mt-0.5 line-clamp-2" style="color: var(--app-disabled-foreground);">
                  ${template.description}
                </div>
              </div>
            </button>
          `;
        })}
      </div>
    `;
  }

  private renderCustom() {
    return html`
      <div class="space-y-3">
        <div>
          <label class="text-[10px] mb-1 block font-medium" style="color: var(--app-disabled-foreground);">Server Name</label>
          <input
            type="text"
            class="w-full px-2.5 py-1.5 text-xs rounded outline-none"
            style="background: var(--app-bg); border: 1px solid var(--app-border); color: var(--app-foreground);"
            placeholder="my-mcp-server"
            .value=${this.customName}
            @input=${(e: Event) => { this.customName = (e.target as HTMLInputElement).value; }} />
        </div>
        <div>
          <label class="text-[10px] mb-1 block font-medium" style="color: var(--app-disabled-foreground);">Command</label>
          <input
            type="text"
            class="w-full px-2.5 py-1.5 text-xs rounded outline-none font-mono"
            style="background: var(--app-bg); border: 1px solid var(--app-border); color: var(--app-foreground);"
            placeholder="npx"
            .value=${this.customCommand}
            @input=${(e: Event) => { this.customCommand = (e.target as HTMLInputElement).value; }} />
        </div>
        <div>
          <label class="text-[10px] mb-1 block font-medium" style="color: var(--app-disabled-foreground);">Arguments (space-separated)</label>
          <input
            type="text"
            class="w-full px-2.5 py-1.5 text-xs rounded outline-none font-mono"
            style="background: var(--app-bg); border: 1px solid var(--app-border); color: var(--app-foreground);"
            placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
            .value=${this.customArgs}
            @input=${(e: Event) => { this.customArgs = (e.target as HTMLInputElement).value; }} />
        </div>

        ${this.customError ? html`
          <div class="text-[10px] p-2 rounded" style="background: rgba(239,68,68,0.1); color: #ef4444;">
            ${this.customError}
          </div>
        ` : ''}

        <button
          class="w-full px-3 py-2 text-xs font-medium rounded-md cursor-pointer transition-colors"
          style="background: var(--ai-accent); color: white; ${!this.customName || !this.customCommand ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
          ?disabled=${!this.customName || !this.customCommand}
          @click=${() => this.addCustom()}>
          Add Server
        </button>
      </div>
    `;
  }
}
