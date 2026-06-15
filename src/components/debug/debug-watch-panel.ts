/**
 * Debug Watch Panel
 * Displays watch expressions with add/remove functionality
 */

import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";
import { getValueClass, copyToClipboard } from "../../lib/debug/debug-utils.js";

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
      await invoke<number>("add_watch_expression", { expression });
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

  render() {
    if (!this.isDebugging) {
      return html`
        <div class="flex flex-col items-center justify-center py-6 gap-2" style="color: var(--app-disabled-foreground);">
          <iconify-icon class="text-2xl opacity-30" icon="mdi:eye-outline"></iconify-icon>
          <span class="text-[11px]">Start debugging to watch expressions</span>
        </div>
      `;
    }

    return html`
      <!-- Add expression input -->
      <div class="flex items-center gap-1.5 px-3 py-1 border-b" style="background-color: var(--app-tab-inactive); border-color: var(--app-border);">
        <input type="text"
               class="flex-1 px-2 py-0.5 text-xs font-mono border rounded outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
               style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: var(--app-border);"
               placeholder="Add expression..."
               @keydown=${this.handleWatchInputKeydown}
               id="watch-input"/>
        <button class="px-2 py-0.5 text-xs font-medium border-none rounded cursor-pointer transition-all hover:scale-105 active:scale-95"
                style="background-color: var(--brand-primary); color: var(--app-button-foreground);"
                @click=${() => this.addWatchExpression()}>
          <iconify-icon icon="mdi:plus" width="14"></iconify-icon>
        </button>
      </div>
      <!-- Content -->
      <div>
        ${this.watches.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center min-h-[48px] px-3 py-2 text-xs" style="color: var(--app-disabled-foreground);">
                No watch expressions
              </div>
            `
          : this.watches.map((watch) => html`
              <div class="flex items-start px-3 py-1 cursor-pointer font-mono text-xs border-b hover:bg-[var(--app-toolbar-hover)] ${watch.error ? 'text-red-600' : ''}"
                   style="border-color: var(--app-border);">
                <span class="mr-2 whitespace-nowrap" style="color: var(--app-foreground);">${watch.expression}</span>
                <span class="mr-2" style="color: var(--app-disabled-foreground);">:</span>
                <span class="${getValueClass(watch.value || '', watch.type)} flex-1 min-w-0 break-all">
                  ${watch.error ? '⚠ ' : ''}${watch.value || '〈not available〉'}
                </span>
                ${watch.type ? html`<span class="text-[10px] ml-2 whitespace-nowrap opacity-70" style="color: var(--app-disabled-foreground);">${watch.type}</span>` : ''}
                <div class="hidden items-center gap-0.5 ml-2 hover:flex">
                  <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-115"
                          style="color: var(--app-disabled-foreground);"
                          @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                          @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                          @click=${() => copyToClipboard(watch.value || '')}
                          title="Copy value">
                    <iconify-icon icon="mdi:content-copy" width="12"></iconify-icon>
                  </button>
                  <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-115"
                          style="color: var(--app-disabled-foreground);"
                          @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                          @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
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
