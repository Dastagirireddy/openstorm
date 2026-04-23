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
}

@customElement("debug-console-panel")
export class DebugConsolePanel extends TailwindElement() {
  @state() outputs: DebugOutput[] = [];
  @state() consoleFilter: string = "all";
  @state() selectedFrameId: number | null = null;
  @state() isDebugging = false;
  private consoleHistory: string[] = [];
  private consoleHistoryIndex: number = -1;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("debug-state-changed", (e: any) => {
      this.isDebugging = e.detail.isDebugging;
      this.requestUpdate();
    });
    document.addEventListener("debug-output", (e: any) => {
      const output = e.detail;
      if (output && output.category && output.output) {
        this.outputs = [...this.outputs, {
          category: output.category,
          output: output.output,
          variablesReference: output.variablesReference,
        }];
        this.requestUpdate();
      }
    });
  }

  addOutput(category: string, output: string) {
    this.outputs = [...this.outputs, { category, output }];
    this.requestUpdate();
    setTimeout(() => {
      const consoleOutput = this.renderRoot.querySelector('.console-output');
      if (consoleOutput) {
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
      }
    }, 0);
  }

  clear() {
    this.outputs = [];
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

    this.outputs = [...this.outputs, {
      category: 'console',
      output: `> ${expression}`,
    }];

    try {
      const result = await invoke<any>("evaluate_expression", {
        expression,
        frameId: this.selectedFrameId,
      });

      this.outputs = [...this.outputs, {
        category: 'log',
        output: result.value || String(result),
      }];
      this.requestUpdate();
    } catch (error) {
      this.outputs = [...this.outputs, {
        category: 'stderr',
        output: `Error: ${error}`,
      }];
      this.requestUpdate();
    }

    setTimeout(() => {
      const consoleOutput = this.renderRoot.querySelector('.console-output');
      if (consoleOutput) {
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
      }
    }, 0);
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

  render() {
    const filteredOutputs = this.consoleFilter === "all"
      ? this.outputs
      : this.outputs.filter(o => o.category === this.consoleFilter);

    return html`
      <div class="flex items-center gap-1 px-3 py-1 bg-gray-50 border-b border-gray-200">
        <button class="px-2 py-0.5 text-[10px] border border-gray-200 rounded bg-transparent text-gray-500 cursor-pointer transition-colors hover:bg-gray-200 hover:text-gray-900 ${this.consoleFilter === 'all' ? 'bg-indigo-500 text-white border-indigo-500' : ''}"
                @click=${() => { this.consoleFilter = 'all'; this.requestUpdate(); }}>
          All
        </button>
        <button class="px-2 py-0.5 text-[10px] border border-gray-200 rounded bg-transparent text-gray-500 cursor-pointer transition-colors hover:bg-gray-200 hover:text-gray-900 ${this.consoleFilter === 'stdout' ? 'bg-indigo-500 text-white border-indigo-500' : ''}"
                @click=${() => { this.consoleFilter = 'stdout'; this.requestUpdate(); }}>
          Stdout
        </button>
        <button class="px-2 py-0.5 text-[10px] border border-gray-200 rounded bg-transparent text-gray-500 cursor-pointer transition-colors hover:bg-gray-200 hover:text-gray-900 ${this.consoleFilter === 'stderr' ? 'bg-indigo-500 text-white border-indigo-500' : ''}"
                @click=${() => { this.consoleFilter = 'stderr'; this.requestUpdate(); }}>
          Stderr
        </button>
        <button class="px-2 py-0.5 text-[10px] border border-gray-200 rounded bg-transparent text-gray-500 cursor-pointer transition-colors hover:bg-gray-200 hover:text-gray-900 ${this.consoleFilter === 'log' ? 'bg-indigo-500 text-white border-indigo-500' : ''}"
                @click=${() => { this.consoleFilter = 'log'; this.requestUpdate(); }}>
          Log
        </button>
        <button class="px-2 py-0.5 text-[10px] border border-gray-200 rounded bg-transparent text-gray-500 cursor-pointer transition-colors hover:bg-gray-200 hover:text-gray-900 ${this.consoleFilter === 'console' ? 'bg-indigo-500 text-white border-indigo-500' : ''}"
                @click=${() => { this.consoleFilter = 'console'; this.requestUpdate(); }}>
          Console
        </button>
        <div class="flex-1"></div>
        <button class="px-2 py-0.5 text-[10px] border-none rounded bg-transparent text-gray-500 cursor-pointer transition-colors hover:bg-gray-200 hover:text-gray-900" @click=${() => this.clear()} title="Clear Console">
          <iconify-icon icon="mdi:delete-outline" width="12"></iconify-icon>
        </button>
      </div>
      <div class="font-mono text-xs flex-1 overflow-auto console-output">
        ${filteredOutputs.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center min-h-[60px] px-3 py-2 text-gray-500 text-xs font-sans">
                No output
              </div>
            `
          : filteredOutputs.map((output) => html`
              <div class="px-3 py-0.5 border-b border-gray-100 whitespace-pre-wrap break-words flex items-start gap-2 ${output.category === 'stderr' ? 'text-red-600 bg-red-50' : output.category === 'stdout' ? 'text-green-700' : output.category === 'warning' ? 'text-yellow-600' : 'text-gray-900'}">
                <span class="text-gray-400 font-bold flex-shrink-0">${output.category === 'stdout' ? '▶' : output.category === 'stderr' ? '✖' : '●'}</span>
                <span>${output.output}</span>
              </div>
            `)}
      </div>
      <div class="flex items-center gap-1.5 px-3 py-1.5 border-t" style="background-color: var(--app-tab-inactive); border-color: var(--app-border);">
        <span class="font-bold text-xs" style="color: var(--app-foreground);">&gt;</span>
        <input type="text"
               class="flex-1 px-2 py-1 text-xs border border-transparent rounded font-mono outline-none focus:border-indigo-500"
               style="background-color: var(--app-input-background); color: var(--app-input-foreground);"
               placeholder="Evaluate expression..."
               @keydown=${this.handleConsoleInputKeydown}
               id="console-input"/>
      </div>
    `;
  }
}
