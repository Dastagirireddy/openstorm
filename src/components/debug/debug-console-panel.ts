/**
 * Debug Console Panel
 * Displays debug output and allows expression evaluation
 */

import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";

export interface DebugOutput {
  category: string;
  output: string;
  variablesReference?: number;
  timestamp: number;
}

@customElement("debug-console-panel")
export class DebugConsolePanel extends TailwindElement() {
  @state() outputs: DebugOutput[] = [];
  @state() consoleFilter: string = "all";
  @state() selectedFrameId: number | null = null;
  @state() isDebugging = false;
  @state() autoScroll = true;
  @state() searchVisible = false;
  @state() searchQuery = "";
  @state() wrapEnabled = false;
  private consoleHistory: string[] = [];
  private consoleHistoryIndex: number = -1;
  private outputCounter = 0;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("debug-state-changed", (e: any) => {
      this.isDebugging = e.detail.isDebugging;
      this.requestUpdate();
    });
    document.addEventListener("debug-output", (e: any) => {
      const output = e.detail;
      if (output && output.category && output.output) {
        this.addOutputInternal(output.category, output.output, output.variablesReference);
      }
    });
    document.addEventListener("keydown", this._handleGlobalKeydown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this._handleGlobalKeydown);
  }

  private _handleGlobalKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      this.searchVisible = !this.searchVisible;
      if (!this.searchVisible) {
        this.searchQuery = "";
      }
      this.requestUpdate();
    }
    if (e.key === "Escape" && this.searchVisible) {
      this.searchVisible = false;
      this.searchQuery = "";
      this.requestUpdate();
    }
  };

  private addOutputInternal(category: string, output: string, variablesReference?: number) {
    this.outputCounter++;
    this.outputs = [...this.outputs, {
      category,
      output,
      variablesReference,
      timestamp: Date.now(),
    }];

    // Limit output lines to prevent memory issues
    if (this.outputs.length > 1000) {
      this.outputs = this.outputs.slice(-500);
    }

    if (this.autoScroll) {
      requestAnimationFrame(() => {
        const consoleOutput = this.renderRoot.querySelector('.console-output');
        if (consoleOutput) {
          consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
      });
    }
  }

  addOutput(category: string, output: string) {
    this.addOutputInternal(category, output);
  }

  clear() {
    this.outputs = [];
    this.outputCounter = 0;
    this.requestUpdate();
  }

  private navigateConsoleHistory(direction: number) {
    if (this.consoleHistory.length === 0) return;

    const newIndex = this.consoleHistoryIndex + direction;
    if (newIndex < 0 || newIndex >= this.consoleHistory.length) return;

    this.consoleHistoryIndex = newIndex;
    const input = this.renderRoot.querySelector('#console-input') as HTMLInputElement;
    if (input) {
      input.value = this.consoleHistory[newIndex];
    }
  }

  private async evaluateConsoleExpression() {
    const input = this.renderRoot.querySelector('#console-input') as HTMLInputElement;
    if (!input || !input.value.trim()) return;

    const expression = input.value.trim();
    input.value = '';

    this.consoleHistory.push(expression);
    this.consoleHistoryIndex = this.consoleHistory.length;

    this.addOutputInternal('console', `> ${expression}`);

    try {
      const result = await invoke<any>("evaluate_expression", {
        expression,
        frameId: this.selectedFrameId,
      });

      this.addOutputInternal('log', result.value || String(result));
    } catch (error) {
      this.addOutputInternal('stderr', `Error: ${error}`);
    }
  }

  private handleConsoleInputKeydown = (e: KeyboardEvent) => {
    const input = this.renderRoot.querySelector('#console-input') as HTMLInputElement;
    if (!input) return;

    if (e.key === 'Enter') {
      this.evaluateConsoleExpression();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.navigateConsoleHistory(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.navigateConsoleHistory(1);
    }
  };

  private getFilteredOutputs(): DebugOutput[] {
    let outputs = this.outputs;

    // Filter by category
    if (this.consoleFilter !== "all") {
      outputs = outputs.filter(o => o.category === this.consoleFilter);
    }

    // Filter by search query
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      outputs = outputs.filter(o => o.output.toLowerCase().includes(query));
    }

    return outputs;
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private highlightSearch(text: string): ReturnType<typeof html> {
    if (!this.searchQuery) return html`${text}`;

    const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
    const parts = text.split(regex);

    return html`${parts.map(part =>
      part.toLowerCase() === this.searchQuery.toLowerCase()
        ? html`<mark class="bg-yellow-200 text-black rounded px-0.5">${part}</mark>`
        : part
    )}`;
  }

  private formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour12: false });
  }

  render() {
    const filteredOutputs = this.getFilteredOutputs();

    return html`
      <div class="flex flex-col h-full w-full" style="background-color: var(--app-bg);">
        <!-- Toolbar -->
        <div class="flex items-center gap-1 px-2 py-1 border-b" style="background-color: var(--app-bg); border-color: var(--app-border);">
          <span class="text-[10px] font-semibold uppercase tracking-wide mr-1" style="color: var(--app-disabled-foreground);">Filter:</span>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.consoleFilter === 'all' ? '!bg-[var(--brand-primary)]/10 !text-[var(--brand-primary)] !border-[var(--brand-primary)]/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleFilter = 'all'; this.requestUpdate(); }}>
            All
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.consoleFilter === 'stdout' ? '!bg-green-500/10 !text-green-600 !border-green-500/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleFilter = 'stdout'; this.requestUpdate(); }}>
            Stdout
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.consoleFilter === 'stderr' ? '!bg-red-500/10 !text-red-600 !border-red-500/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleFilter = 'stderr'; this.requestUpdate(); }}>
            Stderr
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.consoleFilter === 'log' ? '!bg-blue-500/10 !text-blue-600 !border-blue-500/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleFilter = 'log'; this.requestUpdate(); }}>
            Log
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.consoleFilter === 'console' ? '!bg-purple-500/10 !text-purple-600 !border-purple-500/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleFilter = 'console'; this.requestUpdate(); }}>
            Console
          </button>
          <div class="w-px h-4 mx-1" style="background-color: var(--app-border);"></div>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)] ${this.searchVisible ? 'text-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : ''}"
            style="color: var(--app-disabled-foreground);"
            @click=${() => { this.searchVisible = !this.searchVisible; if (!this.searchVisible) this.searchQuery = ''; this.requestUpdate(); }}
            title="Search (Ctrl+F)">
            <iconify-icon icon="mdi:magnify" width="14" style="display: inline-flex;"></iconify-icon>
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)] ${this.autoScroll ? 'text-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : ''}"
            style="color: var(--app-disabled-foreground);"
            @click=${() => { this.autoScroll = !this.autoScroll; this.requestUpdate(); }}
            title="Toggle auto-scroll">
            <iconify-icon icon="${this.autoScroll ? 'mdi:arrow-down-bold' : 'mdi:arrow-down-bold-outline'}" width="14" style="display: inline-flex;"></iconify-icon>
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)] ${this.wrapEnabled ? 'text-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : ''}"
            style="color: var(--app-disabled-foreground);"
            @click=${() => { this.wrapEnabled = !this.wrapEnabled; this.requestUpdate(); }}
            title="Toggle word wrap">
            <iconify-icon icon="mdi:wrap-text" width="14" style="display: inline-flex;"></iconify-icon>
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)]"
            style="color: var(--app-disabled-foreground);"
            @click=${() => this.clear()}
            title="Clear console (Ctrl+L)">
            <iconify-icon icon="mdi:delete-outline" width="14" style="display: inline-flex;"></iconify-icon>
          </button>
        </div>

        <!-- Search bar -->
        ${this.searchVisible ? html`
          <div class="flex items-center gap-1 px-2 py-1 border-b" style="background-color: var(--app-bg); border-color: var(--app-border);">
            <iconify-icon icon="mdi:magnify" width="14" style="color: var(--app-disabled-foreground);"></iconify-icon>
            <input
              type="text"
              class="flex-1 px-1 py-0.5 text-[11px] border-none bg-transparent outline-none focus:ring-1 focus:ring-[var(--brand-primary)] rounded"
              style="color: var(--app-foreground);"
              placeholder="Search console output..."
              .value=${this.searchQuery}
              @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value; this.requestUpdate(); }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                  this.searchVisible = false;
                  this.searchQuery = '';
                  this.requestUpdate();
                }
              }}
            />
            ${this.searchQuery ? html`
              <span class="text-[10px] px-1" style="color: var(--app-disabled-foreground);">
                ${this.getFilteredOutputs().length} matches
              </span>
              <button
                class="p-0.5 rounded hover:bg-[var(--app-toolbar-hover)]"
                @click=${() => { this.searchQuery = ''; this.requestUpdate(); }}
                title="Clear search">
                <iconify-icon icon="mdi:close" width="12"></iconify-icon>
              </button>
            ` : ''}
          </div>
        ` : ''}

        <!-- Console output -->
        <div
          class="console-output font-mono text-xs flex-1 overflow-auto ${this.wrapEnabled ? '' : 'whitespace-pre'}"
          style="background-color: var(--app-bg);">
          ${filteredOutputs.length === 0
            ? html`
                <div class="flex flex-col items-center justify-center min-h-[80px] gap-2">
                  <iconify-icon class="text-3xl opacity-30" icon="mdi:console-outline" style="color: var(--app-disabled-foreground);"></iconify-icon>
                  <span class="text-xs" style="color: var(--app-disabled-foreground);">No output${this.searchQuery ? ' matching search' : ''}</span>
                </div>
              `
            : filteredOutputs.map((output) => {
                const isError = output.category === 'stderr';
                const isSuccess = output.category === 'stdout';
                const isWarning = output.category === 'warning';
                const isConsole = output.category === 'console';

                const textClass = isError ? 'text-red-600' : isSuccess ? 'text-green-600' : isWarning ? 'text-yellow-600' : isConsole ? 'text-purple-600' : 'text-[var(--app-foreground)]';
                const bgClass = isError ? 'bg-red-50' : isWarning ? 'bg-yellow-50/50' : '';
                const prefix = isSuccess ? '▶' : isError ? '✖' : isWarning ? '⚠' : isConsole ? '>' : '●';

                return html`
                  <div class="px-3 py-0.5 whitespace-pre-wrap break-words flex items-start gap-2 ${bgClass} ${textClass}">
                    <span class="text-[10px] flex-shrink-0 select-none opacity-50 mt-px" style="color: var(--app-disabled-foreground);">${this.formatTimestamp(output.timestamp)}</span>
                    <span class="font-bold flex-shrink-0 select-none">${prefix}</span>
                    <span class="flex-1">${this.highlightSearch(output.output)}</span>
                  </div>
                `;
              })}
        </div>

        <!-- Expression input -->
        <div class="flex items-center gap-1.5 px-3 py-1.5 border-t" style="background-color: var(--app-bg); border-color: var(--app-border);">
          <span class="font-bold text-xs" style="color: var(--app-foreground);">&gt;</span>
          <input type="text"
                 class="flex-1 px-2 py-1 text-xs border border-transparent rounded font-mono outline-none focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]"
                 style="background-color: var(--app-input-background); color: var(--app-input-foreground);"
                 placeholder="Evaluate expression... (Enter to run)"
                 @keydown=${this.handleConsoleInputKeydown}
                 id="console-input"/>
          <span class="text-[10px] hidden sm:inline" style="color: var(--app-disabled-foreground);">
            ${this.consoleHistory.length > 0 ? `${this.consoleHistory.length} in history` : ''}
          </span>
        </div>
      </div>
    `;
  }
}
