/**
 * Debug Breakpoints Panel
 * Displays and manages breakpoints including exception breakpoints
 */

import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";
import { dispatch } from "../../lib/types/events.js";

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

@customElement("debug-breakpoints-panel")
export class DebugBreakpointsPanel extends TailwindElement() {
  @state() breakpoints: Breakpoint[] = [];
  @state() exceptionBreakpointFilters: { filter_id: string; label: string; description?: string; default?: boolean }[] = [];
  @state() activeExceptionFilters = new Set<string>();
  @state() isDebugging = false;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("debug-state-changed", (e: any) => {
      this.isDebugging = e.detail.isDebugging;
      if (this.isDebugging) {
        this.refreshExceptionBreakpointFilters();
      }
      this.requestUpdate();
    });
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

  private async toggleBreakpoint(bp: Breakpoint, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const updated = { ...bp, enabled: !bp.enabled };
    this.breakpoints = this.breakpoints.map(b => b.id === bp.id ? updated : b);
  }

  private editBreakpointCondition(bp: Breakpoint) {
    dispatch("edit-breakpoint-condition", bp);
  }

  private removeBreakpoint(bp: Breakpoint) {
    dispatch("breakpoint-removed", { id: bp.id });
  }

  private enableAllBreakpoints(enabled: boolean) {
    this.breakpoints = this.breakpoints.map(bp => ({ ...bp, enabled }));
    this.requestUpdate();
  }

  private removeAllBreakpoints() {
    for (const bp of this.breakpoints) {
      dispatch("breakpoint-removed", { id: bp.id });
    }
  }

  private getFileName(path?: string): string {
    if (!path) return "unknown";
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
  }

  render() {
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
}
