import { html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';
import type { McpServerStatus, McpToolInfo } from '../../../lib/types/ai-types.js';

const hostStyles = css`
  :host {
    display: block;
  }
`;

@customElement('mcp-server-card')
export class McpServerCard extends TailwindElement(hostStyles) {
  @property({ type: Object }) server!: McpServerStatus;
  @property({ type: Boolean }) expanded = false;
  @property({ type: Array }) tools: McpToolInfo[] = [];

  private getStatusColor() {
    switch (this.server.state) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  }

  private getStatusText() {
    switch (this.server.state) {
      case 'connected': return html`<span class="text-green-500">Connected</span>`;
      case 'connecting': return html`<span class="text-yellow-500">Connecting...</span>`;
      case 'error': return html`<span class="text-red-500">${this.server.error || 'Failed'}</span>`;
      default: return html`<span>Disconnected</span>`;
    }
  }

  private dispatchToggle() {
    this.dispatchEvent(new CustomEvent('toggle', {
      detail: { name: this.server.name, enabled: !(this.server.connected || this.server.state === 'connecting') },
      bubbles: true, composed: true,
    }));
  }

  private dispatchRemove() {
    this.dispatchEvent(new CustomEvent('remove', {
      detail: { name: this.server.name },
      bubbles: true, composed: true,
    }));
  }

  private dispatchExpand() {
    this.dispatchEvent(new CustomEvent('expand', {
      detail: { name: this.server.name },
      bubbles: true, composed: true,
    }));
  }

  private dispatchRetry() {
    this.dispatchEvent(new CustomEvent('retry', {
      detail: { name: this.server.name },
      bubbles: true, composed: true,
    }));
  }

  render() {
    return html`
      <div class="rounded-md overflow-hidden" style="border: 1px solid var(--app-border);">
        <!-- Main Row -->
        <div class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--app-hover-background)] transition-colors">
          <!-- Status dot -->
          <span class="w-1.5 h-1.5 rounded-full shrink-0 ${this.getStatusColor()}"></span>

          <!-- Name + status -->
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-medium truncate">${this.server.name}</div>
            <div class="text-[10px]" style="color: var(--app-disabled-foreground);">
              ${this.getStatusText()}
              ${this.server.state === 'connected' && this.server.tool_count > 0 ? html` · ${this.server.tool_count} tools` : ''}
            </div>
          </div>

          <!-- Expand button -->
          ${this.server.tool_count > 0 ? html`
            <button
              class="p-0.5 rounded hover:bg-[var(--app-bg)] cursor-pointer transition-colors"
              style="color: var(--app-disabled-foreground);"
              @click=${() => this.dispatchExpand()}>
              <iconify-icon icon=${this.expanded ? 'codicon:chevron-up' : 'codicon:chevron-down'} width="14"></iconify-icon>
            </button>
          ` : ''}

          <!-- Retry for errors -->
          ${this.server.state === 'error' ? html`
            <button
              class="p-0.5 rounded hover:bg-blue-500/20 cursor-pointer transition-colors"
              style="color: var(--ai-accent);"
              title="Retry"
              @click=${() => this.dispatchRetry()}>
              <iconify-icon icon="codicon:refresh" width="12"></iconify-icon>
            </button>
          ` : ''}

          <!-- Toggle -->
          <label class="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              class="sr-only peer"
              .checked=${this.server.connected || this.server.state === 'connecting'}
              @change=${() => this.dispatchToggle()} />
            <div class="w-6 h-3.5 rounded-full peer peer-checked:after:translate-x-2.5 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-[var(--ai-accent)] bg-gray-600"></div>
          </label>

          <!-- Delete -->
          <button
            class="p-0.5 rounded hover:bg-red-500/20 cursor-pointer transition-colors"
            style="color: var(--app-disabled-foreground);"
            @click=${() => this.dispatchRemove()}>
            <iconify-icon icon="codicon:close" width="12"></iconify-icon>
          </button>
        </div>

        <!-- Expandable Tools -->
        ${this.expanded && this.tools.length > 0 ? html`
          <div class="px-2.5 pb-2 pt-1" style="border-top: 1px solid var(--app-border); background: var(--app-bg);">
            <div class="max-h-32 overflow-y-auto space-y-0.5">
              ${this.tools.map(tool => html`
                <div class="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] hover:bg-[var(--app-hover-background)]">
                  <iconify-icon icon="codicon:tools" style="color: var(--ai-accent);" width="9"></iconify-icon>
                  <span class="font-mono truncate">${tool.original_name}</span>
                  <span class="flex-1 truncate" style="color: var(--app-disabled-foreground);">— ${tool.description}</span>
                </div>
              `)}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
}
