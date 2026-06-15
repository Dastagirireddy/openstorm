/**
 * Debug Call Stack Panel
 * Displays stack frames with navigation to source
 */

import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";
import { dispatch } from "../../lib/types/events.js";
import { getValueClass, getFileName } from "../../lib/debug/debug-utils.js";

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

  render() {
    if (!this.isDebugging) {
      return html`
        <div class="flex flex-col items-center justify-center py-6 gap-2" style="color: var(--app-disabled-foreground);">
          <iconify-icon class="text-2xl opacity-30" icon="mdi:call-split"></iconify-icon>
          <span class="text-[11px]">Start debugging to view call stack</span>
        </div>
      `;
    }

    const filteredFrames = this.showExternalCode
      ? this.stackFrames
      : this.stackFrames.filter(f => !this.isExternalFrame(f));

    return html`
      <!-- Toolbar -->
      <div class="flex items-center justify-between px-3 py-1 border-b" style="background-color: var(--app-tab-inactive); border-color: var(--app-border);">
        <div class="flex gap-0.5">
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110 ${this.showExternalCode ? 'text-[var(--brand-primary)]' : ''}"
                  style="color: ${this.showExternalCode ? 'var(--brand-primary)' : 'var(--app-disabled-foreground)'};"
                  @mouseenter=${(e: Event) => { if (!this.showExternalCode) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${() => { this.showExternalCode = !this.showExternalCode; this.requestUpdate(); }}
                  title="Toggle External Code">
            <iconify-icon icon="mdi:code-tags" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110"
                  style="color: var(--app-disabled-foreground);"
                  @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${() => this.refresh()} title="Refresh">
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <!-- Content -->
      <div>
        ${this.isLoading ? html`
          <div class="p-2">
            <div class="h-5 rounded animate-pulse mb-1 w-3/5" style="background-color: var(--app-toolbar-hover);"></div>
            <div class="h-5 rounded animate-pulse mb-1 w-full" style="background-color: var(--app-toolbar-hover);"></div>
            <div class="h-5 rounded animate-pulse w-2/5" style="background-color: var(--app-toolbar-hover);"></div>
          </div>
        ` : filteredFrames.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center min-h-[48px] px-3 py-2 text-xs" style="color: var(--app-disabled-foreground);">
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
                  class="flex flex-col px-3 py-1 cursor-pointer border-l-[3px] border-b transition-all ${this.selectedFrameId === frame.id ? 'bg-[var(--app-tab-active)] border-l-[var(--brand-primary)]' : 'border-l-transparent hover:bg-[var(--app-toolbar-hover)]'} ${isExternal ? 'opacity-50' : ''} ${isHovered && this.selectedFrameId !== frame.id ? 'bg-[var(--app-toolbar-hover)]' : ''}"
                  style="border-color: ${this.selectedFrameId === frame.id ? 'var(--brand-primary)' : 'var(--app-border)'};"
                  @click=${() => this.handleFrameSelect(frame)}
                  @mouseenter=${() => { this.hoveredFrameId = frame.id; this.requestUpdate(); }}
                  @mouseleave=${() => { this.hoveredFrameId = null; this.requestUpdate(); }}>
                  <div class="flex items-center justify-between mb-0.5">
                    <div class="flex items-center gap-1.5">
                      ${isFirst ? html`<iconify-icon style="color: var(--brand-primary);" icon="mdi:arrow-right-bold" width="12"></iconify-icon>` : ''}
                      <span class="font-mono text-xs font-medium" style="color: var(--app-foreground);">${frame.name}</span>
                    </div>
                  </div>
                  <span class="text-[11px]">
                    <b class="font-medium" style="color: var(--app-secondary-foreground);">${getFileName(frame.source?.path)}</b>
                    <span style="color: var(--app-disabled-foreground);">:${frame.line}:${frame.column}</span>
                  </span>
                  ${isHovered && hasArgs ? html`
                    <div class="mt-1 p-1.5 rounded text-[11px]" style="background-color: var(--app-toolbar-hover);">
                      ${frame.arguments!.map(arg => html`
                        <span class="inline-flex items-center mr-2">
                          <span class="text-teal-700 font-medium">${arg.name}</span>
                          <span class="mx-0.5" style="color: var(--app-disabled-foreground);">:</span>
                          <span class="${getValueClass(arg.value, arg.type)}">${arg.value}</span>
                          ${arg.type ? html`<span class="text-[9px] ml-0.5 italic" style="color: var(--app-disabled-foreground);">${arg.type}</span>` : ''}
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
