/**
 * App Console Panel
 * Displays output from Run and Debug sessions
 */

import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';
import { listen } from '@tauri-apps/api/event';

export interface ConsoleOutput {
  id: number;
  source: "run" | "debug";
  output_type: "stdout" | "stderr" | "info";
  data: string;
  timestamp: number;
}

@customElement('app-console-panel')
export class AppConsolePanel extends TailwindElement() {
  @state() consoleOutputs: ConsoleOutput[] = [];
  @state() consoleFilter: "all" | "stdout" | "stderr" | "info" = "all";
  @state() consoleAutoScroll = true;
  @state() consoleHasNewOutput = false;
  @state() consoleSearchVisible = false;
  @state() consoleSearchQuery = "";

  private consoleOutputCounter = 0;

  connectedCallback(): void {
    super.connectedCallback();

    // Listen for process output (run configurations)
    listen<{ process_id: number; output_type: string; data: string; timestamp: number }>('process-output', (event) => {
      const { output_type, data } = event.payload;
      this.addConsoleOutput({
        source: 'run',
        output_type: output_type as 'stdout' | 'stderr' | 'info',
        data,
        timestamp: event.payload.timestamp || Date.now(),
      });
    });

    // Listen for process termination
    listen<{ process_id: number }>('process-terminated', (event) => {
      this.addConsoleOutput({
        source: 'run',
        output_type: 'info',
        data: '\n[Process exited]\n',
        timestamp: Date.now(),
      });
    });

    // Listen for debug output (DAP)
    listen<{ category: string; output: string }>('debug-output', (event) => {
      const category = event.payload.category || 'log';
      if (category !== 'telemetry') {
        this.addConsoleOutput({
          source: 'debug',
          output_type: category === 'stderr' ? 'stderr' : category === 'stdout' ? 'stdout' : 'info',
          data: event.payload.output,
          timestamp: Date.now(),
        });
      }
    });
  }

  private addConsoleOutput(output: Omit<ConsoleOutput, 'id'>): void {
    this.consoleOutputCounter++;
    this.consoleOutputs = [
      ...this.consoleOutputs,
      {
        ...output,
        id: this.consoleOutputCounter,
      },
    ];

    // Limit output lines to prevent memory issues
    if (this.consoleOutputs.length > 1000) {
      this.consoleOutputs = this.consoleOutputs.slice(-500);
    }

    // Mark that there's new output for notification purposes
    this.consoleHasNewOutput = true;

    // Notify status bar about new output
    document.dispatchEvent(
      new CustomEvent('app-console-output', {
        bubbles: true,
        composed: true,
      }),
    );

    // Auto-scroll if enabled
    if (this.consoleAutoScroll) {
      requestAnimationFrame(() => {
        const container = this.renderRoot.querySelector('.console-output') as HTMLElement;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }

  private clearConsole(): void {
    this.consoleOutputs = [];
    this.consoleHasNewOutput = false;
  }

  private getFilteredOutputs(): ConsoleOutput[] {
    let outputs = this.consoleOutputs;

    // Filter by type
    if (this.consoleFilter !== 'all') {
      outputs = outputs.filter(o => o.output_type === this.consoleFilter);
    }

    // Filter by search query
    if (this.consoleSearchQuery) {
      outputs = outputs.filter(o =>
        o.data.toLowerCase().includes(this.consoleSearchQuery.toLowerCase())
      );
    }

    return outputs;
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private highlightSearch(text: string): ReturnType<typeof html> {
    if (!this.consoleSearchQuery) return html`${text}`;

    const regex = new RegExp(`(${this.escapeRegex(this.consoleSearchQuery)})`, 'gi');
    const parts = text.split(regex);

    return html`${parts.map(part =>
      part.toLowerCase() === this.consoleSearchQuery.toLowerCase()
        ? html`<mark class="bg-yellow-200 text-black rounded px-0.5">${part}</mark>`
        : part
    )}`;
  }

  render() {
    const filteredOutputs = this.getFilteredOutputs();

    return html`
      <div class="flex flex-col h-full w-full" style="background-color: var(--app-bg);">
        <!-- Toolbar -->
        <div class="flex items-center gap-1 px-2 py-1 border-b" style="background-color: var(--app-bg); border-color: var(--app-border);">
          <span class="text-[10px] font-semibold uppercase tracking-wide mr-1" style="color: var(--app-disabled-foreground);">Filter:</span>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[#e5e7eb] hover:border-[#b0b0b0] ${this.consoleFilter === 'all' ? '!bg-indigo-100 !text-indigo-700 !border-indigo-300 hover:!bg-indigo-200' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleFilter = 'all'; this.requestUpdate(); }}>
            All
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[#e5e7eb] hover:border-[#b0b0b0] ${this.consoleFilter === 'stdout' ? '!bg-green-100 !text-green-700 !border-green-300 hover:!bg-green-200' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleFilter = 'stdout'; this.requestUpdate(); }}>
            Stdout
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[#e5e7eb] hover:border-[#b0b0b0] ${this.consoleFilter === 'stderr' ? '!bg-red-100 !text-red-700 !border-red-300 hover:!bg-red-200' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleFilter = 'stderr'; this.requestUpdate(); }}>
            Stderr
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[#e5e7eb] hover:border-[#b0b0b0] ${this.consoleFilter === 'info' ? '!bg-blue-100 !text-blue-700 !border-blue-300 hover:!bg-blue-200' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleFilter = 'info'; this.requestUpdate(); }}>
            Info
          </button>
          <div class="w-px h-4 mx-1" style="background-color: var(--app-border);"></div>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[#e5e7eb] ${this.consoleSearchVisible ? 'text-indigo-600 bg-indigo-50' : ''}"
            style="color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleSearchVisible = !this.consoleSearchVisible; this.requestUpdate(); }}
            title="Search (Ctrl+F)">
            <iconify-icon icon="mdi:magnify" width="14" style="display: inline-flex;"></iconify-icon>
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[#e5e7eb] ${this.consoleAutoScroll ? 'text-indigo-600 bg-indigo-50' : ''}"
            style="color: var(--app-disabled-foreground);"
            @click=${() => { this.consoleAutoScroll = !this.consoleAutoScroll; this.requestUpdate(); }}
            title="Toggle auto-scroll">
            <iconify-icon icon="${this.consoleAutoScroll ? 'mdi:arrow-down-bold' : 'mdi:arrow-down-bold-outline'}" width="14" style="display: inline-flex;"></iconify-icon>
          </button>
          <button
            class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[#e5e7eb]"
            style="color: var(--app-disabled-foreground);"
            @click=${() => this.clearConsole()}
            title="Clear console">
            <iconify-icon icon="mdi:delete-outline" width="14" style="display: inline-flex;"></iconify-icon>
          </button>
        </div>

        <!-- Search bar -->
        ${this.consoleSearchVisible ? html`
          <div class="flex items-center gap-1 px-2 py-1 border-b" style="background-color: var(--app-bg); border-color: var(--app-border);">
            <iconify-icon icon="mdi:magnify" width="14" style="color: var(--app-disabled-foreground);"></iconify-icon>
            <input
              type="text"
              class="flex-1 px-1 py-0.5 text-[11px] border-none bg-transparent outline-none"
              style="color: var(--app-foreground);"
              placeholder="Search console output..."
              .value=${this.consoleSearchQuery}
              @input=${(e: Event) => { this.consoleSearchQuery = (e.target as HTMLInputElement).value; this.requestUpdate(); }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                  this.consoleSearchVisible = false;
                  this.consoleSearchQuery = '';
                  this.requestUpdate();
                }
              }}
            />
            ${this.consoleSearchQuery ? html`
              <button
                class="p-0.5 rounded hover:bg-[#e5e7eb]"
                @click=${() => { this.consoleSearchQuery = ''; this.requestUpdate(); }}
                title="Clear search">
                <iconify-icon icon="mdi:close" width="12"></iconify-icon>
              </button>
            ` : ''}
          </div>
        ` : ''}

        <!-- Console output -->
        <div
          class="console-output font-mono text-xs flex-1 overflow-auto"
          style="height: calc(100% - 40px); background-color: var(--app-bg);">
          ${filteredOutputs.length === 0
            ? html`
                <div class="flex flex-col items-center justify-center h-full gap-2">
                  <iconify-icon class="text-3xl opacity-50" icon="mdi:console-outline" style="color: var(--app-disabled-foreground);"></iconify-icon>
                  <span class="text-xs" style="color: var(--app-disabled-foreground);">No output</span>
                </div>
              `
            : filteredOutputs.map((output) => {
                const bgClass = output.output_type === 'stderr' ? 'bg-red-50' : output.output_type === 'info' ? 'bg-blue-50' : '';
                const textClass = output.output_type === 'stderr' ? 'text-red-700' : output.output_type === 'stdout' ? 'text-green-700' : output.output_type === 'info' ? 'text-blue-700' : 'text-gray-900';
                const prefix = output.output_type === 'stdout' ? '▶' : output.output_type === 'stderr' ? '✖' : '●';

                return html`
                  <div class="px-3 py-0.5 border-b whitespace-pre-wrap break-words flex items-start gap-2 ${bgClass} ${textClass}" style="border-color: var(--app-border);">
                    <span class="font-bold flex-shrink-0 select-none" style="color: var(--app-disabled-foreground);">${prefix}</span>
                    <span class="flex-1">${this.highlightSearch(output.data)}</span>
                  </div>
                `;
              })}
        </div>
      </div>
    `;
  }

  public markOutputRead(): void {
    this.consoleHasNewOutput = false;
  }

  public hasNewOutput(): boolean {
    return this.consoleHasNewOutput;
  }
}
