/**
 * Debug Watch Panel
 * Displays watch expressions with add/remove functionality
 */

import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";

export interface WatchExpression {
  id: number;
  expression: string;
  value?: string;
  type?: string;
  variablesReference?: number;
  error?: boolean;
}

@customElement("debug-watch-panel")
export class DebugWatchPanel extends TailwindElement() {
  @state() watches: WatchExpression[] = [];
  @state() isDebugging = false;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("debug-state-changed", (e: any) => {
      this.isDebugging = e.detail.isDebugging;
      if (this.isDebugging) {
        this.refresh();
      }
      this.requestUpdate();
    });
  }

  async refresh() {
    if (!this.isDebugging) return;
    try {
      const watches = await invoke<any[]>("get_watch_expressions");
      this.watches = watches.map(w => ({
        id: w.id,
        expression: w.expression,
        value: w.value,
        type: w.type_hint,
        variablesReference: w.variables_reference,
        error: w.error,
      }));
    } catch (error) {
      console.log("Watch expressions not available");
    }
  }

  private async addWatchExpression() {
    const input = this.renderRoot.querySelector('#watch-input') as HTMLInputElement;
    if (!input || !input.value.trim()) return;

    const expression = input.value.trim();
    try {
      const id = await invoke<number>("add_watch_expression", { expression });
      input.value = '';
      await this.refresh();
    } catch (error) {
      console.error("Failed to add watch:", error);
    }
  }

  private async removeWatch(id: number) {
    try {
      await invoke("remove_watch_expression", { id });
      await this.refresh();
    } catch (error) {
      console.error("Failed to remove watch:", error);
    }
  }

  private async clearWatches() {
    for (const watch of this.watches) {
      try {
        await invoke("remove_watch_expression", { id: watch.id });
      } catch (error) {}
    }
    await this.refresh();
  }

  private handleWatchInputKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      this.addWatchExpression();
    }
  };

  private async copyToClipboard(text: string, message: string = "Copied!") {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(message);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }

  private showToast(message: string) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  private getValueClass(value: string, type?: string): string {
    if (value === 'null' || value === 'undefined') return 'text-gray-500 italic';
    if (type === 'string' || (value.startsWith('"') && value.endsWith('"'))) return 'text-green-700';
    if (type === 'number' || (!isNaN(Number(value)) && value.trim() !== '')) return 'text-blue-600';
    if (type === 'boolean' || value === 'true' || value === 'false') return 'text-indigo-700';
    return 'text-amber-800';
  }

  render() {
    if (!this.isDebugging) {
      return html`
        <div class="flex flex-col items-center justify-center h-28 text-gray-500 gap-3">
          <iconify-icon class="text-4xl opacity-50" icon="mdi:eye-outline"></iconify-icon>
          <span class="text-xs font-sans">Start debugging to watch expressions</span>
        </div>
      `;
    }

    return html`
      <div class="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider bg-gray-50 border-b border-gray-200">
        <span>Watch</span>
        <div class="flex gap-0.5">
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.refresh()} title="Refresh">
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.clearWatches()} title="Remove All">
            <iconify-icon icon="mdi:delete-sweep" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <div class="flex items-center gap-1.5 px-3 py-1.5 border-b" style="background-color: var(--app-tab-inactive); border-color: var(--app-border);">
        <input type="text"
               class="flex-1 px-2 py-0.5 text-xs font-mono border rounded outline-none focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]"
               style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: var(--app-border);"
               placeholder="Add expression..."
               @keydown=${this.handleWatchInputKeydown}
               id="watch-input"/>
        <button class="px-2.5 py-1 text-xs font-medium border-none rounded bg-[var(--brand-primary)] text-white cursor-pointer transition-all hover:bg-[var(--brand-primary-hover)] hover:scale-105 active:scale-95" @click=${() => this.addWatchExpression()}>
          <iconify-icon icon="mdi:plus" width="14"></iconify-icon>
        </button>
      </div>
      <div>
        ${this.watches.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center min-h-[60px] px-3 py-2 text-xs font-sans" style="color: var(--app-disabled-foreground);">
                No watch expressions
              </div>
            `
          : this.watches.map((watch) => html`
              <div class="flex items-start px-3 py-1 cursor-pointer font-mono text-xs border-b hover:bg-gray-100 ${watch.error ? 'text-red-600' : ''}" style="border-color: var(--app-border);">
                <span class="mr-2 whitespace-nowrap" style="color: var(--app-foreground);">${watch.expression}</span>
                <span class="mr-2" style="color: var(--app-disabled-foreground);">:</span>
                <span class="${this.getValueClass(watch.value || '', watch.type)} flex-1 min-w-0 break-all">
                  ${watch.error ? '⚠ ' : ''}${watch.value || '〈not available〉'}
                </span>
                ${watch.type ? html`<span class="text-[10px] ml-2 whitespace-nowrap font-sans" style="color: var(--app-disabled-foreground);">${watch.type}</span>` : ''}
                <div class="hidden items-center gap-0.5 ml-2 hover:flex">
                  <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-115" style="color: var(--app-disabled-foreground);" @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }} @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                          @click=${() => this.copyToClipboard(watch.value || '', "Value copied")}
                          title="Copy value">
                    <iconify-icon icon="mdi:content-copy" width="12"></iconify-icon>
                  </button>
                  <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-115" style="color: var(--app-disabled-foreground);" @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }} @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                          @click=${() => this.removeWatch(watch.id)}
                          title="Remove">
                    <iconify-icon icon="mdi:close" width="12"></iconify-icon>
                  </button>
                </div>
              </div>
            `)}
      </div>
    `;
  }
}
