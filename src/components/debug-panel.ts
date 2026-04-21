import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../tailwind-element.js";

export interface StackFrame {
  id: number;
  name: string;
  source?: { path?: string; name?: string };
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  children?: Variable[];
  expanded?: boolean;
  pinned?: boolean;
}

export interface Breakpoint {
  id: number;
  sourcePath: string;
  line: number;
  enabled: boolean;
  verified: boolean;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface DebugOutput {
  category: string;
  output: string;
  variablesReference?: number;
}

export interface WatchExpression {
  id: number;
  expression: string;
  value?: string;
  type?: string;
  variablesReference?: number;
  error?: boolean;
}

export interface DebugThread {
  id: number;
  name: string;
  state?: "running" | "stopped" | "exited" | "unknown";
  selected?: boolean;
  expanded?: boolean;
  stackFrames?: StackFrameWithArgs[];
}

type DebugTab = "variables" | "watch" | "call-stack" | "threads" | "breakpoints" | "console";

export interface StackFrameWithArgs extends StackFrame {
  arguments?: { name: string; value: string; type?: string }[];
}

@customElement("debug-panel")
export class DebugPanel extends TailwindElement() {
  @state() private activeTab: DebugTab = "variables";
  @state() private isDebugging = false;
  @state() private stackFrames: StackFrameWithArgs[] = [];
  @state() private variables: Variable[] = [];
  @state() private breakpoints: Breakpoint[] = [];
  @state() private outputs: DebugOutput[] = [];
  @state() private watches: WatchExpression[] = [];
  @state() private threads: DebugThread[] = [];
  @state() private selectedFrameId: number | null = null;
  @state() private selectedThreadId: number | null = null;
  @state() private expandedVariables = new Set<string>();
  @state() private pinnedVariables = new Set<string>();
  @state() private debugState: "stopped" | "running" | "terminated" = "stopped";
  @state() private showExternalCode = true;
  @state() private consoleFilter: string = "all";
  @state() private variableFilter: string = "";
  @state() private hoveredFrameId: number | null = null;
  @state() private exceptionBreakpointFilters: { filter_id: string; label: string; description?: string; default?: boolean }[] = [];
  @state() private activeExceptionFilters: Set<string> = new Set();

  // No custom styles needed - using Tailwind classes exclusively

  connectedCallback() {
    super.connectedCallback();
    this.setupEventListeners();
  }

  private async setupEventListeners() {
    document.addEventListener("debug-initialized", async (e: any) => {
      this.isDebugging = true;
      if (this.debugState !== "stopped") {
        this.debugState = "running";
      }
      this.requestUpdate();
    });

    document.addEventListener("debug-session-started", async (e: any) => {
      console.log("[debug-panel] debug-session-started event received");
      this.isDebugging = true;
      if (this.debugState !== "stopped") {
        this.debugState = "running";
      }
      console.log("[debug-panel] debugState after session-started:", this.debugState);
      this.requestUpdate();
      this.refreshExceptionBreakpointFilters();
      document.dispatchEvent(
        new CustomEvent("debug-panel-request-breakpoints", {
          bubbles: true,
          composed: true,
        })
      );
    });

    document.addEventListener("debug-session-ended", (e: any) => {
      console.log("[debug-panel] debug-session-ended event received!");
      this.isDebugging = false;
      this.debugState = "terminated";
      this.stackFrames = [];
      this.variables = [];
      this.watches = [];
      this.selectedFrameId = null;
      this.requestUpdate();
    });

    document.addEventListener("debug-stopped", async (e: any) => {
      console.log("[debug-panel] debug-stopped event received, setting debugState to 'stopped'");
      this.isDebugging = true;
      this.debugState = "stopped";
      this.requestUpdate();
      await this.refreshStackTrace();
      await this.refreshVariables();
      await this.refreshThreads();
      await this.syncBreakpoints();
    });

    document.addEventListener("watches-refreshed", async (e: any) => {
      const watches = e.payload;
      this.watches = watches.map(w => ({
        id: w.id,
        expression: w.expression,
        value: w.value,
        type: w.type_hint,
        variablesReference: w.variables_reference,
        error: w.error,
      }));
      this.requestUpdate();
    });

    document.addEventListener("debug-continued", (e: any) => {
      console.log("[debug-panel] debug-continued event received, setting debugState to 'running'");
      this.debugState = "running";
      this.stackFrames = [];
      this.variables = [];
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

    document.addEventListener("breakpoint-added", (e: any) => {
      const bp = e.detail;
      if (bp) {
        if (!this.breakpoints.find(b => b.id === bp.id)) {
          this.breakpoints = [...this.breakpoints, bp];
        }
        this.requestUpdate();
      }
    });

    document.addEventListener("breakpoint-removed", (e: any) => {
      const { id } = e.detail;
      this.breakpoints = this.breakpoints.filter(b => b.id !== id);
      this.requestUpdate();
    });
  }

  async refreshStackTrace() {
    // Don't refresh if not debugging
    if (!this.isDebugging || this.debugState === "terminated") return;

    this.isLoadingStack = true;
    try {
      const frames = await invoke<StackFrame[]>("get_stack_trace");

      // Check again if still debugging after async call
      if (!this.isDebugging || this.debugState === "terminated") {
        this.isLoadingStack = false;
        return;
      }

      const framesWithArgs = await Promise.all(
        frames.slice(0, 5).map(async (frame) => {
          try {
            const scopes = await invoke<any[]>("get_scopes", { frameId: frame.id });
            const args: { name: string; value: string; type?: string }[] = [];

            for (const scope of scopes.slice(0, 2)) {
              if (scope.variables_reference > 0) {
                const variables = await invoke<any[]>("get_variables", {
                  variablesReference: scope.variables_reference,
                });
                for (const v of variables.slice(0, 5)) {
                  args.push({
                    name: v.name,
                    value: v.value,
                    type: v.variable_type,
                  });
                }
              }
            }

            return { ...frame, arguments: args };
          } catch (e) {
            return { ...frame, arguments: [] };
          }
        })
      );

      this.stackFrames = [...framesWithArgs, ...frames.slice(5).map(f => ({ ...f, arguments: [] }))];

      if (this.stackFrames.length > 0 && !this.selectedFrameId) {
        this.selectedFrameId = this.stackFrames[0].id;
      }
    } catch (error) {
      console.error("Failed to get stack trace:", error);
      this.stackFrames = [];
    } finally {
      this.isLoadingStack = false;
    }
  }

  async refreshVariables() {
    this.isLoadingVariables = true;
    try {
      const stackFrames = await invoke<any[]>("get_stack_trace");
      if (!stackFrames || stackFrames.length === 0) {
        this.variables = [];
        return;
      }

      const topFrame = stackFrames[0];
      let scopes: any[] = [];
      try {
        scopes = await invoke<any[]>("get_scopes", { frameId: topFrame.id });
      } catch (e) {
        // Some adapters don't support scopes or return empty
        console.log("No scopes available for this frame");
        this.variables = [];
        return;
      }

      if (!scopes || scopes.length === 0) {
        this.variables = [];
        return;
      }

      const scope = scopes[0];
      const vars = await invoke<any[]>("get_variables", {
        variablesReference: scope.variablesReference,
      });

      this.variables = (vars || []).map((v) => ({
        name: v.name,
        value: v.value,
        type: v.variable_type,
        variablesReference: v.variables_reference || 0,
        namedVariables: v.named_variables,
        indexedVariables: v.indexed_variables,
        expanded: false,
        pinned: this.pinnedVariables.has(v.name),
      }));
    } catch (error) {
      console.error("Failed to get variables:", error);
      this.variables = [];
    } finally {
      this.isLoadingVariables = false;
    }
  }

  async refreshWatches() {
    try {
      const watches = await invoke<any[]>("get_watch_expressions");
      this.watches = watches.map(w => ({
        id: w.id,
        expression: w.expression,
        value: w.value,
        type: w.type,
        variablesReference: w.variables_reference,
        error: w.error,
      }));
    } catch (error) {
      console.log("Watch expressions not available");
    }
  }

  async refreshThreads() {
    try {
      const threads = await invoke<any[]>("get_threads");
      this.threads = threads.map(t => ({
        id: t.id,
        name: t.name,
        state: t.state || 'unknown',
        selected: this.selectedThreadId === t.id,
        expanded: false,
        stackFrames: [],
      }));
      if (this.threads.length > 0 && this.selectedThreadId === null) {
        this.selectedThreadId = this.threads[0].id;
      }
    } catch (error) {
      console.error("Failed to get threads:", error);
      this.threads = [];
    }
  }

  async refreshExceptionBreakpointFilters() {
    try {
      const filters = await invoke<any[]>("get_exception_breakpoint_filters");
      this.exceptionBreakpointFilters = filters.map(f => ({
        filter_id: f.filter_id,
        label: f.label,
        description: f.description,
        default: f.default,
      }));
      for (const f of filters) {
        if (f.default) {
          this.activeExceptionFilters.add(f.filter_id);
        }
      }
    } catch (error) {
      console.log("Exception breakpoints not supported by adapter");
      this.exceptionBreakpointFilters = [];
    }
  }

  async toggleExceptionBreakpoint(filterId: string) {
    if (this.activeExceptionFilters.has(filterId)) {
      this.activeExceptionFilters.delete(filterId);
    } else {
      this.activeExceptionFilters.add(filterId);
    }
    try {
      await invoke("set_exception_breakpoints", {
        filters: Array.from(this.activeExceptionFilters),
      });
    } catch (error) {
      console.error("Failed to set exception breakpoints:", error);
    }
  }

  async refreshThreadStackTrace(threadId: number) {
    try {
      const frames = await invoke<StackFrame[]>("get_stack_trace");
      this.threads = this.threads.map(t => {
        if (t.id === threadId) {
          return {
            ...t,
            stackFrames: frames.map(f => ({ ...f, arguments: [] })),
          };
        }
        return t;
      });
    } catch (error) {
      console.error("Failed to get thread stack trace:", error);
    }
  }

  async syncBreakpoints() {
    // Breakpoints are managed locally from editor interactions
  }

  private handleFrameSelect(frame: StackFrame) {
    this.selectedFrameId = frame.id;

    if (frame.source?.path) {
      document.dispatchEvent(
        new CustomEvent("go-to-location", {
          detail: {
            uri: `file://${frame.source.path}`,
            line: frame.line - 1,
            column: frame.column - 1,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private async expandVariable(path: string, variablesReference: number) {
    if (variablesReference === 0) return;

    try {
      const children = await invoke<any[]>("get_variables", {
        variablesReference,
      });

      this.variables = this.updateVariableChildren(
        this.variables,
        path,
        (children || []).map((c) => ({
          name: c.name,
          value: c.value,
          type: c.variable_type,
          variablesReference: c.variables_reference || 0,
          namedVariables: c.named_variables,
          indexedVariables: c.indexed_variables,
          expanded: false,
        })),
      );

      if (this.expandedVariables.has(path)) {
        this.expandedVariables.delete(path);
      } else {
        this.expandedVariables.add(path);
      }
    } catch (error) {
      console.error("Failed to expand variable:", error);
    }
  }

  private startEditingVariable(path: string, value: string) {
    this.editingVariable = { path, value, original: value };
    this.requestUpdate();
    setTimeout(() => {
      const input = this.renderRoot.querySelector('.variable-edit-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  private handleVariableEditKeydown(e: KeyboardEvent, path: string) {
    if (e.key === 'Enter') {
      this.saveVariableEdit(path);
    } else if (e.key === 'Escape') {
      this.cancelVariableEdit(path);
    }
  }

  private async saveVariableEdit(path: string) {
    if (!this.editingVariable || this.editingVariable.path !== path) return;

    const newValue = this.editingVariable.value;
    const originalValue = this.editingVariable.original;

    if (newValue !== originalValue) {
      try {
        const varName = path.split('.').pop() || path;
        await invoke("evaluate_expression", {
          expression: `${varName} = ${newValue}`,
          frameId: this.selectedFrameId,
        });
        this.showToast("Value updated");
        await this.refreshVariables();
      } catch (error) {
        console.error("Failed to update variable:", error);
        this.showToast("Failed to update value");
      }
    }

    this.editingVariable = null;
    this.requestUpdate();
  }

  private cancelVariableEdit(path: string) {
    this.editingVariable = null;
    this.requestUpdate();
  }

  private updateVariableChildren(
    variables: Variable[],
    path: string,
    children: Variable[],
  ): Variable[] {
    return variables.map((v) => {
      const varPath = v.name;
      if (varPath === path) {
        return { ...v, children, expanded: !this.expandedVariables.has(path) };
      }
      if (v.children) {
        return {
          ...v,
          children: this.updateVariableChildren(v.children, path, children),
        };
      }
      return v;
    });
  }

  private togglePinVariable(path: string) {
    if (this.pinnedVariables.has(path)) {
      this.pinnedVariables.delete(path);
    } else {
      this.pinnedVariables.add(path);
    }
    this.requestUpdate();
  }

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

  private truncateString(value: string, maxLength: number = 50): { truncated: string; expandable: boolean } {
    if (value.length <= maxLength) {
      return { truncated: value, expandable: false };
    }
    return { truncated: value.substring(0, maxLength) + '…', expandable: true };
  }

  private formatValueDisplay(value: string, type?: string): { display: string; expandable: boolean; fullValue?: string } {
    if (type === 'string' || (value.startsWith('"') && value.endsWith('"'))) {
      const { truncated, expandable } = this.truncateString(value, 50);
      return { display: truncated, expandable, fullValue: value };
    }

    if (value.startsWith('{') || value.startsWith('[')) {
      const truncated = value.length > 100 ? value.substring(0, 100) + '…' : value;
      return { display: truncated, expandable: value.length > 100, fullValue: value };
    }

    return { display: value, expandable: false };
  }

  @state() private editingVariable: { path: string; value: string; original: string } | null = null;
  @state() private expandedFullValue: string | null = null;
  @state() private consoleHistory: string[] = [];
  @state() private consoleHistoryIndex: number = -1;
  @state() private isLoadingVariables = false;
  @state() private isLoadingStack = false;

  private renderVariable(variable: Variable, path: string = "", isChild: boolean = false): ReturnType<typeof html> {
    const currentPath = path ? `${path}.${variable.name}` : variable.name;
    const hasChildren = variable.variablesReference > 0;
    const isExpanded = this.expandedVariables.has(currentPath);
    const isPinned = this.pinnedVariables.has(currentPath);
    const valueClass = this.getValueClass(variable.value, variable.type);
    const isEditing = this.editingVariable?.path === currentPath;
    const isValueExpanded = this.expandedFullValue === currentPath;

    const valueDisplay = this.formatValueDisplay(variable.value, variable.type);
    const displayValue = isValueExpanded && valueDisplay.fullValue ? valueDisplay.fullValue : valueDisplay.display;

    return html`
      <div class="flex items-start px-3 py-0.5 cursor-pointer font-mono text-xs border-b border-gray-100 ${isPinned ? 'bg-yellow-50' : ''} ${isChild ? 'pl-7' : ''}"
           @click=${() => hasChildren && this.expandVariable(currentPath, variable.variablesReference)}>
        ${hasChildren
          ? html`
              <span class="variable-expand w-4 h-5 flex items-center justify-center mr-1 text-gray-500 ${isExpanded ? 'expanded' : ''}">
                <iconify-icon icon="mdi:chevron-right" width="14"></iconify-icon>
              </span>
            `
          : html`<span class="w-4 h-5"></span>`}
        <span class="text-teal-700 mr-1 whitespace-nowrap">${variable.name}</span>
        <span class="text-gray-500 mr-1">:</span>
        ${isEditing
          ? html`
              <input
                class="variable-edit-input flex-1 px-1.5 py-0.5 text-xs font-mono border border-indigo-500 rounded bg-white outline-none"
                type="text"
                value=${this.editingVariable.value}
                @keydown=${(e: KeyboardEvent) => this.handleVariableEditKeydown(e, currentPath)}
                @blur=${() => this.saveVariableEdit(currentPath)}
                @click=${(e: Event) => e.stopPropagation()}
              />
            `
          : html`
              <span
                class="${valueClass} flex-1 min-w-0 cursor-pointer px-1 rounded transition-colors hover:bg-black/5"
                @dblclick=${(e: Event) => {
                  e.stopPropagation();
                  if (valueDisplay.expandable) {
                    this.expandedFullValue = isValueExpanded ? null : currentPath;
                  } else {
                    this.startEditingVariable(currentPath, variable.value);
                  }
                }}
                title=${valueDisplay.fullValue || variable.value}>
                ${displayValue}
              </span>
            `}
        ${variable.type
          ? html`<span class="text-gray-500 text-[10px] ml-2 whitespace-nowrap font-sans opacity-80">${variable.type}</span>`
          : ""}
        <div class="hidden items-center gap-0.5 ml-2 group-hover:flex">
          ${!isEditing ? html`
            <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-115"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this.startEditingVariable(currentPath, variable.value);
                    }}
                    title="Edit value">
              <iconify-icon icon="mdi:pencil-outline" width="12"></iconify-icon>
            </button>
          ` : ''}
          <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-115"
                  @click=${(e: Event) => { e.stopPropagation(); this.togglePinVariable(currentPath); }}
                  title="${isPinned ? 'Unpin' : 'Pin'}">
            <iconify-icon icon="${isPinned ? 'mdi:pin' : 'mdi:pin-outline'}" width="12"></iconify-icon>
          </button>
          <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-115"
                  @click=${(e: Event) => { e.stopPropagation(); this.copyToClipboard(variable.value, "Value copied"); }}
                  title="Copy value">
            <iconify-icon icon="mdi:content-copy" width="12"></iconify-icon>
          </button>
        </div>
      </div>
      ${isExpanded && variable.children
        ? html`
            <div>
              ${variable.children.map((child) => this.renderVariable(child, currentPath, true))}
            </div>
          `
        : ""}
    `;
  }

  private renderWatchPanel() {
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
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.refreshWatches()} title="Refresh">
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.clearWatches()} title="Remove All">
            <iconify-icon icon="mdi:delete-sweep" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <input type="text"
               class="flex-1 px-2 py-0.5 text-xs font-mono border border-gray-300 rounded bg-white outline-none focus:border-indigo-500"
               placeholder="Add expression..."
               @keydown=${this.handleWatchInputKeydown}
               id="watch-input"/>
        <button class="px-2.5 py-1 text-xs font-medium border-none rounded bg-indigo-500 text-white cursor-pointer transition-all hover:bg-indigo-600 hover:scale-105 active:scale-95" @click=${this.addWatchExpression}>
          <iconify-icon icon="mdi:plus" width="14"></iconify-icon>
        </button>
      </div>
      <div>
        ${this.watches.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center min-h-[60px] px-3 py-2 text-gray-500 text-xs font-sans">
                No watch expressions
              </div>
            `
          : this.watches.map((watch) => html`
              <div class="flex items-start px-3 py-1 cursor-pointer font-mono text-xs border-b border-gray-100 hover:bg-gray-100 ${watch.error ? 'text-red-600' : ''}">
                <span class="text-gray-900 mr-2 whitespace-nowrap">${watch.expression}</span>
                <span class="text-gray-500 mr-2">:</span>
                <span class="${this.getValueClass(watch.value || '', watch.type)} flex-1 min-w-0 break-all">
                  ${watch.error ? '⚠ ' : ''}${watch.value || '〈not available〉'}
                </span>
                ${watch.type ? html`<span class="text-gray-500 text-[10px] ml-2 whitespace-nowrap font-sans">${watch.type}</span>` : ''}
                <div class="hidden items-center gap-0.5 ml-2 hover:flex">
                  <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-115"
                          @click=${() => this.copyToClipboard(watch.value || '', "Value copied")}
                          title="Copy value">
                    <iconify-icon icon="mdi:content-copy" width="12"></iconify-icon>
                  </button>
                  <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-115"
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

  private handleWatchInputKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      this.addWatchExpression();
    }
  };

  private async addWatchExpression() {
    const input = this.renderRoot.querySelector('#watch-input') as HTMLInputElement;
    if (!input || !input.value.trim()) return;

    const expression = input.value.trim();
    try {
      const id = await invoke<number>("add_watch_expression", { expression });
      input.value = '';
      await this.refreshWatches();
    } catch (error) {
      console.error("Failed to add watch:", error);
    }
  }

  private async removeWatch(id: number) {
    try {
      await invoke("remove_watch_expression", { id });
      await this.refreshWatches();
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
    await this.refreshWatches();
  }

  private getFileName(path?: string): string {
    if (!path) return "unknown";
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
  }

  private isExternalFrame(frame: StackFrame): boolean {
    if (!this.showExternalCode) return false;
    const path = frame.source?.path || '';
    const externalPatterns = [
      'node_modules',
      'vendor',
      'rustlib',
      'src/rust',
      '<',
      'unknown',
    ];
    return externalPatterns.some(p => path.includes(p));
  }

  private renderVariablesPanel() {
    if (!this.isDebugging) {
      return html`
        <div class="flex flex-col items-center justify-center h-28 text-gray-500 gap-3">
          <iconify-icon class="text-4xl opacity-50" icon="mdi:bug-outline"></iconify-icon>
          <span class="text-xs font-sans">Start debugging to view variables</span>
        </div>
      `;
    }

    const filteredVars = this.variableFilter
      ? this.variables.filter(v => v.name.toLowerCase().includes(this.variableFilter.toLowerCase()))
      : this.variables;

    const pinnedVars = filteredVars.filter(v => this.pinnedVariables.has(v.name));
    const unpinnedVars = filteredVars.filter(v => !this.pinnedVariables.has(v.name));

    return html`
      <div class="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider bg-gray-50 border-b border-gray-200">
        <span>Variables</span>
        <div class="flex items-center gap-2 max-w-[200px] flex-1">
          <input type="text"
                 class="flex-1 px-2 py-0.5 text-xs border border-gray-300 rounded bg-white outline-none focus:border-indigo-500 font-sans"
                 placeholder="Filter variables..."
                 .value=${this.variableFilter}
                 @input=${(e: Event) => { this.variableFilter = (e.target as HTMLInputElement).value; this.requestUpdate(); }}/>
        </div>
        <div class="flex gap-0.5">
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.expandAllVariables()} title="Expand All">
            <iconify-icon icon="mdi:arrow-expand-all" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.collapseAllVariables()} title="Collapse All">
            <iconify-icon icon="mdi:arrow-collapse-all" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.refreshVariables()} title="Refresh">
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <div>
        ${this.isLoadingVariables ? html`
          <div class="p-2">
            <div class="h-5 bg-gray-200 rounded animate-pulse mb-1 w-2/5"></div>
            <div class="h-5 bg-gray-200 rounded animate-pulse mb-1 w-3/5"></div>
            <div class="h-5 bg-gray-200 rounded animate-pulse mb-1 w-4/5"></div>
            <div class="h-5 bg-gray-200 rounded animate-pulse w-3/5"></div>
          </div>
        ` : html`
          ${pinnedVars.length > 0 ? pinnedVars.map(v => this.renderVariable(v)) : ''}
          ${unpinnedVars.map(v => this.renderVariable(v))}
          ${filteredVars.length === 0 ? html`
            <div class="flex flex-col items-center justify-center min-h-[60px] px-3 py-2 text-gray-500 text-xs font-sans">
              ${this.variableFilter ? 'No matching variables' : 'No variables in scope'}
            </div>
          ` : ''}
        `}
      </div>
    `;
  }

  private expandAllVariables() {
    const expandRecursive = (vars: Variable[], path: string) => {
      for (const v of vars) {
        const currentPath = path ? `${path}.${v.name}` : v.name;
        if (v.variablesReference > 0) {
          this.expandedVariables.add(currentPath);
          if (v.children) {
            expandRecursive(v.children, currentPath);
          }
        }
      }
    };
    expandRecursive(this.variables, '');
    this.requestUpdate();
  }

  private collapseAllVariables() {
    this.expandedVariables.clear();
    this.requestUpdate();
  }

  private handleThreadSelect(thread: DebugThread) {
    this.selectedThreadId = thread.id;
    this.threads = this.threads.map(t => ({
      ...t,
      selected: t.id === thread.id,
    }));
    this.refreshThreadStackTrace(thread.id);
  }

  private toggleThreadExpand(thread: DebugThread) {
    this.threads = this.threads.map(t => {
      if (t.id === thread.id) {
        return { ...t, expanded: !t.expanded };
      }
      return t;
    });
  }

  private renderThreadsPanel() {
    if (!this.isDebugging) {
      return html`
        <div class="flex flex-col items-center justify-center h-28 text-gray-500 gap-3">
          <iconify-icon class="text-4xl opacity-50" icon="mdi:account-group"></iconify-icon>
          <span class="text-xs font-sans">Start debugging to view threads</span>
        </div>
      `;
    }

    return html`
      <div class="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider bg-gray-50 border-b border-gray-200">
        <span>Threads</span>
        <div class="flex gap-0.5">
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.refreshThreads()} title="Refresh">
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <div>
        ${this.threads.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center min-h-[60px] px-3 py-2 text-gray-500 text-xs font-sans">
                No threads
              </div>
            `
          : this.threads.map((thread) => {
              const stateClass = thread.state || 'unknown';
              const hasStack = thread.expanded && thread.stackFrames && thread.stackFrames.length > 0;
              const stateColor = stateClass === 'running' ? 'bg-green-500' : stateClass === 'stopped' ? 'bg-amber-500' : stateClass === 'exited' ? 'bg-gray-500' : 'bg-gray-400';
              return html`
                <div
                  class="flex flex-col px-3 py-1.5 cursor-pointer border-l-[3px] border-b border-gray-100 transition-all ${thread.selected ? 'bg-indigo-100 border-l-indigo-500' : 'border-l-transparent hover:bg-gray-100'} ${stateClass === 'running' ? 'border-l-green-500' : stateClass === 'stopped' ? 'border-l-amber-500' : ''} ${stateClass === 'exited' ? 'opacity-50' : ''}"
                  @click=${() => this.handleThreadSelect(thread)}>
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                      <div class="w-2 h-2 rounded-full flex-shrink-0 ${stateColor} ${stateClass === 'running' ? 'animate-pulse' : ''}"></div>
                      <span class="text-gray-900 font-mono text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis">${thread.name}</span>
                      <span class="text-gray-500 text-[10px] font-sans">#${thread.id}</span>
                    </div>
                    <button
                      class="thread-expand w-5 h-5 flex items-center justify-center text-gray-500 transition-transform ${thread.expanded ? 'expanded' : ''}"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this.toggleThreadExpand(thread);
                      }}
                      title="Show stack trace">
                      <iconify-icon icon="mdi:chevron-right" width="16"></iconify-icon>
                    </button>
                  </div>
                  ${hasStack ? html`
                    <div class="mt-2 p-2 bg-black/5 rounded">
                      ${thread.stackFrames!.map((frame, idx) => html`
                        <div
                          class="flex items-center px-2 py-1 font-mono text-[11px] text-gray-900 cursor-pointer rounded transition-colors hover:bg-gray-200"
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            this.handleFrameSelect(frame);
                          }}>
                          <iconify-icon icon="mdi:chevron-right" width="12" class="mr-1"></iconify-icon>
                          <span>${frame.name}</span>
                          <span class="text-gray-500 ml-1">
                            ${this.getFileName(frame.source?.path)}:${frame.line}
                          </span>
                        </div>
                      `)}
                    </div>
                  ` : ''}
                </div>
              `;
            })}
      </div>
    `;
  }

  private renderCallStackPanel() {
    if (!this.isDebugging) {
      return html`
        <div class="flex flex-col items-center justify-center h-28 text-gray-500 gap-3">
          <iconify-icon class="text-4xl opacity-50" icon="mdi:call-split"></iconify-icon>
          <span class="text-xs font-sans">Start debugging to view call stack</span>
        </div>
      `;
    }

    const filteredFrames = this.showExternalCode
      ? this.stackFrames
      : this.stackFrames.filter(f => !this.isExternalFrame(f));

    return html`
      <div class="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider bg-gray-50 border-b border-gray-200">
        <span>Call Stack</span>
        <div class="flex gap-0.5">
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110 ${this.showExternalCode ? 'text-indigo-600' : ''}"
                  @click=${() => { this.showExternalCode = !this.showExternalCode; this.requestUpdate(); }}
                  title="Show External Code">
            <iconify-icon icon="mdi:code-tags" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.refreshStackTrace()} title="Refresh">
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <div>
        ${this.isLoadingStack ? html`
          <div class="p-2">
            <div class="h-5 bg-gray-200 rounded animate-pulse mb-1 w-3/5"></div>
            <div class="h-5 bg-gray-200 rounded animate-pulse mb-1 w-full"></div>
            <div class="h-5 bg-gray-200 rounded animate-pulse w-2/5"></div>
          </div>
        ` : filteredFrames.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center min-h-[60px] px-3 py-2 text-gray-500 text-xs font-sans">
                ${this.stackFrames.length > 0 ? 'Showing external code only' : 'No stack frames'}
              </div>
            `
          : filteredFrames.map((frame, index) => {
              const isExternal = this.isExternalFrame(frame);
              const isFirst = index === 0;
              const isHovered = this.hoveredFrameId === frame.id;
              const hasArgs = frame.arguments && frame.arguments.length > 0;
              return html`
                <div
                  class="flex flex-col px-3 py-1.5 cursor-pointer border-l-[3px] border-b border-gray-100 transition-all ${this.selectedFrameId === frame.id ? 'bg-indigo-100 border-l-indigo-500' : 'border-l-transparent hover:bg-gray-100'} ${isExternal ? 'opacity-70' : ''} ${isHovered ? 'bg-indigo-50' : ''}"
                  @click=${() => this.handleFrameSelect(frame)}
                  @mouseenter=${() => { this.hoveredFrameId = frame.id; this.requestUpdate(); }}
                  @mouseleave=${() => { this.hoveredFrameId = null; this.requestUpdate(); }}>
                  <div class="flex items-center justify-between mb-0.5">
                    <div class="flex items-center gap-1.5">
                      ${isFirst ? html`<iconify-icon class="text-indigo-500" icon="mdi:arrow-right-bold" width="12"></iconify-icon>` : ''}
                      <span class="text-gray-900 font-mono text-xs font-medium">${frame.name}</span>
                    </div>
                    ${hasArgs ? html`
                      <span class="text-gray-500 text-[10px] flex items-center gap-0.5 opacity-70" title="Has arguments">
                        <iconify-icon icon="mdi:information-outline" width="12"></iconify-icon>
                      </span>
                    ` : ''}
                  </div>
                  <span class="text-gray-500 text-[11px] font-sans">
                    <b class="font-medium text-gray-700">${this.getFileName(frame.source?.path)}</b>:${frame.line}:${frame.column}
                  </span>
                  ${isHovered && hasArgs ? html`
                    <div class="mt-1.5 p-1.5 bg-black/5 rounded text-[11px]">
                      ${frame.arguments!.map(arg => html`
                        <span class="inline-flex items-center mr-2">
                          <span class="text-teal-700 font-medium">${arg.name}</span>
                          <span class="text-gray-500 mx-0.5">:</span>
                          <span class="${this.getValueClass(arg.value, arg.type)}">${arg.value}</span>
                          ${arg.type ? html`<span class="text-gray-500 text-[9px] ml-0.5 italic">${arg.type}</span>` : ''}
                        </span>
                      `)}
                    </div>
                  ` : ''}
                </div>
              `;
            })}
      </div>
    `;
  }

  private async toggleBreakpoint(bp: Breakpoint, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const updated = { ...bp, enabled: !bp.enabled };
    this.breakpoints = this.breakpoints.map(b => b.id === bp.id ? updated : b);
  }

  private async editBreakpointCondition(bp: Breakpoint) {
    document.dispatchEvent(
      new CustomEvent("edit-breakpoint-condition", {
        detail: bp,
        bubbles: true,
        composed: true,
      })
    );
  }

  private async removeBreakpoint(bp: Breakpoint) {
    document.dispatchEvent(
      new CustomEvent("breakpoint-removed", {
        detail: { id: bp.id },
        bubbles: true,
        composed: true,
      })
    );
  }

  private renderBreakpointsPanel() {
    return html`
      ${this.exceptionBreakpointFilters.length > 0 ? html`
        <div class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider bg-gray-50 border-b border-gray-200">
          <span>Exception Breakpoints</span>
        </div>
        <div>
          ${this.exceptionBreakpointFilters.map((filter) => html`
            <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
              <input type="checkbox"
                     class="w-3.5 h-3.5 mt-0.5 cursor-pointer"
                     id="exception-filter-${filter.filter_id}"
                     ?checked=${this.activeExceptionFilters.has(filter.filter_id)}
                     @change=${(e: Event) => { e.stopPropagation(); this.toggleExceptionBreakpoint(filter.filter_id); }}
                     @click=${(e: Event) => e.stopPropagation()}
                     title="${filter.description || filter.label}"/>
              <label class="flex flex-col gap-0.5 cursor-pointer flex-1" for="exception-filter-${filter.filter_id}">
                <span class="text-gray-900 text-xs font-medium font-sans">${filter.label}</span>
                ${filter.description ? html`
                  <span class="text-gray-500 text-[10px] font-sans">${filter.description}</span>
                ` : ''}
              </label>
            </div>
          `)}
        </div>
      ` : ''}
      <div class="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider bg-gray-50 border-b border-gray-200">
        <span>Breakpoints</span>
        <div class="flex gap-0.5">
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.enableAllBreakpoints(true)} title="Enable All">
            <iconify-icon icon="mdi:check-all" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.enableAllBreakpoints(false)} title="Disable All">
            <iconify-icon icon="mdi:close-octagon" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.removeAllBreakpoints()} title="Remove All">
            <iconify-icon icon="mdi:delete-sweep" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <div>
        ${!this.breakpoints || this.breakpoints.length === 0 ? html`
          <div class="flex flex-col items-center justify-center h-28 text-gray-500 gap-3">
            <iconify-icon class="text-4xl opacity-50" icon="mdi:map-marker-off-outline"></iconify-icon>
            <span class="text-xs font-sans">No breakpoints set</span>
          </div>
        ` : html`
          ${this.breakpoints.map((bp) => html`
            <div class="flex items-start gap-2 px-3 py-1.25 cursor-pointer border-b border-gray-100 hover:bg-gray-100">
              <input type="checkbox"
                     class="w-3.5 h-3.5 mt-0.5 cursor-pointer"
                     ?checked=${bp.enabled}
                     @change=${(e: Event) => this.toggleBreakpoint(bp, e)}
                     @click=${(e: Event) => e.stopPropagation()}
                     title="Enable/Disable breakpoint"/>
              <div class="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${bp.enabled ? 'bg-red-500' : 'bg-gray-400'} ${bp.condition ? 'bg-yellow-400' : ''} border ${bp.enabled ? 'border-red-700' : 'border-gray-600'} ${bp.condition ? 'border-yellow-600 relative' : ''}">
                ${bp.condition ? html`<span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-bold text-yellow-900">?</span>` : ''}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-gray-900 font-mono text-xs">
                  <b class="font-semibold">${this.getFileName(bp.sourcePath)}</b>:${bp.line}
                </div>
                <div class="text-gray-500 text-[10px] font-sans whitespace-nowrap overflow-hidden text-ellipsis">${bp.sourcePath}</div>
                ${bp.condition ? html`<div class="text-teal-700 text-[10px] font-mono italic">Condition: ${bp.condition}</div>` : ''}
              </div>
              <div class="hidden items-center gap-0.5 hover:flex">
                <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.editBreakpointCondition(bp)} title="Edit Condition">
                  <iconify-icon icon="mdi:edit" width="12"></iconify-icon>
                </button>
                <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.removeBreakpoint(bp)} title="Remove">
                  <iconify-icon icon="mdi:close" width="12"></iconify-icon>
                </button>
              </div>
            </div>
          `)}
        `}
      </div>
    `;
  }

  private enableAllBreakpoints(enabled: boolean) {
    this.breakpoints = this.breakpoints.map(bp => ({ ...bp, enabled }));
    this.requestUpdate();
  }

  private removeAllBreakpoints() {
    for (const bp of this.breakpoints) {
      document.dispatchEvent(
        new CustomEvent("breakpoint-removed", {
          detail: { id: bp.id },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  private renderConsolePanel() {
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
        <button class="px-2 py-0.5 text-[10px] border-none rounded bg-transparent text-gray-500 cursor-pointer transition-colors hover:bg-gray-200 hover:text-gray-900" @click=${() => this.clearConsole()} title="Clear Console">
          <iconify-icon icon="mdi:delete-outline" width="12"></iconify-icon>
        </button>
      </div>
      <div class="font-mono text-xs flex-1 overflow-auto">
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
      <div class="flex items-center gap-1.5 px-3 py-1.5 border-t border-gray-200 bg-gray-50">
        <span class="text-gray-900 font-bold text-xs">></span>
        <input type="text"
               class="flex-1 px-2 py-1 text-xs border border-transparent rounded bg-transparent text-gray-900 font-mono outline-none focus:border-indigo-500 focus:bg-white"
               placeholder="Evaluate expression..."
               @keydown=${this.handleConsoleInputKeydown}
               id="console-input"/>
      </div>
    `;
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

  private clearConsole() {
    this.outputs = [];
    this.requestUpdate();
  }

  render() {
    const statusText = this.debugState === "running" ? "Running" : this.debugState === "stopped" ? "Paused" : "Terminated";
    const statusClass = this.debugState === "running" ? "text-green-700" : this.debugState === "stopped" ? "text-amber-700" : "text-gray-500";

    return html`
      <style>
        .debug-action-icon {
          transition: transform 0.1s ease;
        }
        .debug-action:hover:not(:disabled) .debug-action-icon {
          transform: scale(1.05);
        }
        .debug-action:active:not(:disabled) .debug-action-icon {
          transform: scale(0.95);
        }
        .variable-expand {
          transition: transform 0.15s ease;
        }
        .variable-expand.expanded {
          transform: rotate(90deg);
        }
        .thread-expand {
          transition: transform 0.15s ease;
        }
        .thread-expand.expanded {
          transform: rotate(90deg);
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spinner {
          animation: spin 1s linear infinite;
        }
      </style>

      <!-- Debug Action Toolbar -->
      <div class="flex items-center gap-0.5 px-1.5 py-1 bg-gray-100 border-b border-gray-200">
        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/5'}"
          @click=${() => this.sendAction("continue")}
          ?disabled=${this.debugState !== "stopped"}
          title="Continue (F5)">
          <iconify-icon class="debug-action-icon text-green-600" icon="material-symbols-light:resume-outline-rounded" width="22"></iconify-icon>
        </button>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/5'}"
          @click=${() => this.sendAction("stepover")}
          ?disabled=${this.debugState !== "stopped"}
          title="Step Over (F10)">
          <iconify-icon class="debug-action-icon text-blue-600" icon="mdi:debug-step-over" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/5'}"
          @click=${() => this.sendAction("stepinto")}
          ?disabled=${this.debugState !== "stopped"}
          title="Step Into (F11)">
          <iconify-icon class="debug-action-icon text-blue-600" icon="mdi:debug-step-into" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/5'}"
          @click=${() => this.sendAction("stepout")}
          ?disabled=${this.debugState !== "stopped"}
          title="Step Out (Shift+F11)">
          <iconify-icon class="debug-action-icon text-blue-600" icon="mdi:debug-step-out" width="16"></iconify-icon>
        </button>

        <div class="w-px h-4.5 bg-gray-300 mx-1"></div>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'running' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/5'}"
          @click=${() => this.sendAction("pause")}
          ?disabled=${this.debugState !== "running"}
          title="Pause">
          <iconify-icon class="debug-action-icon text-amber-600" icon="mdi:pause" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.isDebugging ? 'hover:bg-black/5' : 'opacity-40 cursor-not-allowed'}"
          @click=${() => this.sendAction("terminate")}
          ?disabled=${!this.isDebugging}
          title="Stop Debugging (Shift+F5)">
          <iconify-icon class="debug-action-icon text-red-600" icon="mdi:stop" width="16"></iconify-icon>
        </button>

        <span class="text-[11px] font-medium font-sans ml-2 ${statusClass}">${statusText}</span>
      </div>

      <!-- Tab Bar -->
      <div class="flex bg-gray-100 border-b border-gray-200 overflow-x-auto">
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent text-gray-500 cursor-pointer transition-all hover:text-gray-900 hover:bg-black/4 ${this.activeTab === "variables" ? "active text-gray-900 border-b-indigo-500 bg-white" : ''}"
          @click=${() => (this.activeTab = "variables")}>
          <iconify-icon class="${this.activeTab === "variables" ? "text-purple-500" : ""}" icon="mdi:variable"></iconify-icon>
          Variables
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent text-gray-500 cursor-pointer transition-all hover:text-gray-900 hover:bg-black/4 ${this.activeTab === "watch" ? "active text-gray-900 border-b-indigo-500 bg-white" : ''}"
          @click=${() => (this.activeTab = "watch")}>
          <iconify-icon class="${this.activeTab === "watch" ? "text-cyan-500" : ""}" icon="mdi:eye-outline"></iconify-icon>
          Watch
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent text-gray-500 cursor-pointer transition-all hover:text-gray-900 hover:bg-black/4 ${this.activeTab === "call-stack" ? "active text-gray-900 border-b-indigo-500 bg-white" : ''}"
          @click=${() => (this.activeTab = "call-stack")}>
          <iconify-icon class="${this.activeTab === "call-stack" ? "text-amber-600" : ""}" icon="mdi:call-split"></iconify-icon>
          Call Stack
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent text-gray-500 cursor-pointer transition-all hover:text-gray-900 hover:bg-black/4 ${this.activeTab === "threads" ? "active text-gray-900 border-b-indigo-500 bg-white" : ''}"
          @click=${() => (this.activeTab = "threads")}>
          <iconify-icon class="${this.activeTab === "threads" ? "text-orange-600" : ""}" icon="mdi:account-group"></iconify-icon>
          Threads
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent text-gray-500 cursor-pointer transition-all hover:text-gray-900 hover:bg-black/4 ${this.activeTab === "breakpoints" ? "active text-gray-900 border-b-indigo-500 bg-white" : ''}"
          @click=${() => (this.activeTab = "breakpoints")}>
          <iconify-icon class="${this.activeTab === "breakpoints" ? "text-red-500" : ""}" icon="mdi:map-marker"></iconify-icon>
          Breakpoints
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent text-gray-500 cursor-pointer transition-all hover:text-gray-900 hover:bg-black/4 ${this.activeTab === "console" ? "active text-gray-900 border-b-indigo-500 bg-white" : ''}"
          @click=${() => (this.activeTab = "console")}>
          <iconify-icon class="${this.activeTab === "console" ? "text-green-700" : ""}" icon="mdi:console"></iconify-icon>
          Console
        </button>
      </div>

      <div class="flex-1 overflow-auto">
        ${this.activeTab === "variables" ? this.renderVariablesPanel() : ''}
        ${this.activeTab === "watch" ? this.renderWatchPanel() : ''}
        ${this.activeTab === "call-stack" ? this.renderCallStackPanel() : ''}
        ${this.activeTab === "threads" ? this.renderThreadsPanel() : ''}
        ${this.activeTab === "breakpoints" ? this.renderBreakpointsPanel() : ''}
        ${this.activeTab === "console" ? this.renderConsolePanel() : ''}
      </div>
    `;
  }

  private async sendAction(action: string) {
    console.log("[debug-panel] sendAction called:", action, "isDebugging:", this.isDebugging, "debugState:", this.debugState);
    if (!this.isDebugging) {
      console.warn("[debug-panel] Not debugging, skipping action:", action);
      return;
    }
    try {
      console.log("[debug-panel] Invoking debug_action:", action);
      const result = await invoke("debug_action", { action });
      console.log("[debug-panel] debug_action completed:", action, "result:", result);
    } catch (error) {
      console.error("[debug-panel] Failed to send debug action:", error);
    }
  }
}
