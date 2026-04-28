/**
 * Debug Call Stack Panel
 * Displays stack frames with navigation to source
 */

import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";
import { dispatch } from "../../lib/types/events.js";

export interface StackFrame {
  id: number;
  name: string;
  source?: { path?: string; name?: string };
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  arguments?: { name: string; value: string; type?: string }[];
}

@customElement("debug-call-stack-panel")
export class DebugCallStackPanel extends TailwindElement() {
  @state() stackFrames: StackFrame[] = [];
  @state() selectedFrameId: number | null = null;
  @state() isLoading = false;
  @state() showExternalCode = true;
  @state() hoveredFrameId: number | null = null;
  @state() isDebugging = false;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("debug-state-changed", (e: any) => {
      this.isDebugging = e.detail.isDebugging;
      if (this.isDebugging && e.detail.debugState === "stopped") {
        this.refresh();
      }
      this.requestUpdate();
    });
  }

  async refresh() {
    if (!this.isDebugging) return;

    this.isLoading = true;
    try {
      const frames = await invoke<StackFrame[]>("get_stack_trace");

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
          } catch {
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
      this.isLoading = false;
    }
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

  private handleFrameSelect(frame: StackFrame) {
    this.selectedFrameId = frame.id;

    if (frame.source?.path) {
      dispatch("go-to-location", {
        uri: `file://${frame.source.path}`,
        line: frame.line - 1,
        column: frame.column - 1,
      });
    }
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
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.refresh()} title="Refresh">
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <div>
        ${this.isLoading ? html`
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
}
