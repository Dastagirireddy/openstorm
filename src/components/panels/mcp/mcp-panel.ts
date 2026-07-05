import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import type { McpServerStatus, McpToolInfo, McpTemplate, McpConnectionState } from '../../../lib/types/ai-types.js';
import './mcp-server-card.js';
import './mcp-add-modal.js';

@customElement('mcp-panel')
export class McpPanel extends TailwindElement() {
  @state() private servers: McpServerStatus[] = [];
  @state() private tools: McpToolInfo[] = [];
  @state() private templates: McpTemplate[] = [];
  @state() private isLoading = false;
  @state() private showAddModal = false;
  @state() private expandedServers: Set<string> = new Set();

  connectedCallback(): void {
    super.connectedCallback();
    this.loadAll();
    this._mcpStatusHandler = this._onMcpStatusChange.bind(this);
    window.addEventListener('mcp-status-change', this._mcpStatusHandler as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._mcpStatusHandler) {
      window.removeEventListener('mcp-status-change', this._mcpStatusHandler as EventListener);
    }
  }

  private _mcpStatusHandler: ((e: Event) => void) | null = null;

  private async _onMcpStatusChange(e: Event) {
    const event = e as CustomEvent;
    const { name, state, tool_count, error } = event.detail;
    this.servers = this.servers.map(s => {
      if (s.name === name) {
        return { ...s, state: state as McpConnectionState, connected: state === 'connected', tool_count, error };
      }
      return s;
    });
  }

  private async loadAll() {
    this.isLoading = true;
    try {
      const [servers, tools, templates] = await Promise.all([
        invoke<McpServerStatus[]>('ai_mcp_list_servers'),
        invoke<McpToolInfo[]>('ai_mcp_list_tools'),
        invoke<McpTemplate[]>('ai_mcp_list_templates'),
      ]);
      this.servers = servers;
      this.tools = tools;
      this.templates = templates;
    } catch (e) {
      console.error('[MCP Panel] Failed to load:', e);
    } finally {
      this.isLoading = false;
    }
  }

  private async toggleServer(name: string, enabled: boolean) {
    try {
      await invoke('ai_mcp_toggle_server', { name, enabled });
      await this.loadAll();
    } catch (e) {
      console.error('[MCP Panel] Toggle failed:', e);
    }
  }

  private async removeServer(name: string) {
    try {
      await invoke('ai_mcp_remove_server', { name });
      await this.loadAll();
    } catch (e) {
      console.error('[MCP Panel] Remove failed:', e);
    }
  }

  private async installTemplate(templateId: string) {
    try {
      await invoke('ai_mcp_install_template', { templateId });
      await this.loadAll();
    } catch (e) {
      console.error('[MCP Panel] Install failed:', e);
    }
  }

  private toggleExpanded(name: string) {
    if (this.expandedServers.has(name)) {
      this.expandedServers.delete(name);
    } else {
      this.expandedServers.add(name);
    }
    this.requestUpdate();
  }

  private getServerTools(serverName: string): McpToolInfo[] {
    return this.tools.filter(t => t.server_name === serverName);
  }

  render() {
    return html`
      <div class="flex flex-col h-full w-full" style="background-color: var(--activitybar-background);">
        <!-- Header -->
        <div class="flex items-center justify-between h-[35px] px-3 border-b shrink-0"
             style="background: linear-gradient(to bottom, var(--app-tab-inactive), var(--app-toolbar-hover)); border-bottom-color: var(--app-border);">
          <div class="flex items-center gap-1.5">
            <iconify-icon icon="codicon:mcp" width="14"></iconify-icon>
            <span class="text-[10px] font-bold uppercase tracking-wide" style="color: var(--app-disabled-foreground);">MCP</span>
          </div>
          <div class="flex items-center gap-0">
            <button
              @click=${() => this.loadAll()}
              class="p-1 cursor-pointer"
              style="color: var(--app-disabled-foreground);"
              @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
              @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
              title="Refresh"
            >
              <iconify-icon icon="codicon:refresh" width="14" height="14"></iconify-icon>
            </button>
            <button
              @click=${() => (this.showAddModal = true)}
              class="p-1 cursor-pointer"
              style="color: var(--app-disabled-foreground);"
              @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
              @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
              title="Add Server"
            >
              <iconify-icon icon="codicon:add" width="14" height="14"></iconify-icon>
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto">
          ${this.isLoading ? html`
            <div class="flex items-center justify-center h-32">
              <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" style="color: var(--app-disabled-foreground);"></div>
            </div>
          ` : this.servers.length === 0 ? this.renderEmptyState() : this.renderServerList()}
        </div>

        <!-- Add Modal -->
        ${this.showAddModal ? html`
          <mcp-add-modal
            .templates=${this.templates}
            .servers=${this.servers}
            @close=${() => { this.showAddModal = false; this.loadAll(); }}
            @install=${(e: CustomEvent) => this.installTemplate(e.detail.templateId)}
          ></mcp-add-modal>
        ` : ''}
      </div>
    `;
  }

  private renderEmptyState() {
    return html`
      <div class="flex flex-col items-center justify-center h-full px-4 text-center">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style="background: var(--ai-accent); opacity: 0.15;">
          <iconify-icon icon="codicon:mcp" width="24"></iconify-icon>
        </div>
        <p class="text-xs font-medium" style="color: var(--app-foreground);">No MCP Servers</p>
        <p class="text-[10px] mt-1 mb-3" style="color: var(--app-disabled-foreground);">
          Connect external tools to enhance AI capabilities
        </p>
        <button
          @click=${() => (this.showAddModal = true)}
          class="px-3 py-1.5 text-[11px] font-medium rounded-md cursor-pointer"
          style="background: var(--ai-accent); color: white;">
          Add Server
        </button>
      </div>
    `;
  }

  private renderServerList() {
    return html`
      <div class="p-2 space-y-1.5">
        ${this.servers.map(server => {
          const expanded = this.expandedServers.has(server.name);
          const serverTools = this.getServerTools(server.name);
          return html`
            <mcp-server-card
              .server=${server}
              .expanded=${expanded}
              .tools=${serverTools}
              @toggle=${(e: CustomEvent) => this.toggleServer(e.detail.name, e.detail.enabled)}
              @remove=${(e: CustomEvent) => this.removeServer(e.detail.name)}
              @expand=${(e: CustomEvent) => this.toggleExpanded(e.detail.name)}
              @retry=${(e: CustomEvent) => this.installTemplate(e.detail.name)}
            ></mcp-server-card>
          `;
        })}
      </div>
    `;
  }
}
