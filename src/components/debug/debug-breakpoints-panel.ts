/**
 * Debug Breakpoints Panel
 * Displays and manages breakpoints including exception breakpoints
 */

import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";
import { dispatch } from "../../lib/types/events.js";
import { getFileName } from "../../lib/debug/debug-utils.js";

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

  render() {
    return html`
      <!-- Exception Breakpoints -->
      ${this.exceptionBreakpointFilters.length > 0 ? html`
        <div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider border-b"
             style="background-color: var(--app-tab-inactive); border-color: var(--app-border); color: var(--app-foreground);">
          Exception Breakpoints
        </div>
        <div>
          ${this.exceptionBreakpointFilters.map((filter) => html`
            <div class="flex items-center gap-2 px-3 py-1.5 border-b" style="border-color: var(--app-border);">
              <input type="checkbox"
                     class="w-3.5 h-3.5 mt-0.5 cursor-pointer"
                     id="exception-filter-${filter.filter_id}"
                     ?checked=${this.activeExceptionFilters.has(filter.filter_id)}
                     @change=${(e: Event) => { e.stopPropagation(); this.toggleExceptionBreakpoint(filter.filter_id); }}
                     @click=${(e: Event) => e.stopPropagation()}
                     title="${filter.description || filter.label}"/>
              <label class="flex flex-col gap-0.5 cursor-pointer flex-1" for="exception-filter-${filter.filter_id}">
                <span class="text-xs font-medium" style="color: var(--app-foreground);">${filter.label}</span>
                ${filter.description ? html`
                  <span class="text-[10px]" style="color: var(--app-disabled-foreground);">${filter.description}</span>
                ` : ''}
              </label>
            </div>
          `)}
        </div>
      ` : ''}
      <!-- Breakpoints toolbar -->
      <div class="flex items-center justify-between px-3 py-1 border-b"
           style="background-color: var(--app-tab-inactive); border-color: var(--app-border);">
        <div class="flex gap-0.5">
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110"
                  style="color: var(--app-disabled-foreground);"
                  @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${() => this.enableAllBreakpoints(true)} title="Enable All">
            <iconify-icon icon="mdi:check-all" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110"
                  style="color: var(--app-disabled-foreground);"
                  @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${() => this.enableAllBreakpoints(false)} title="Disable All">
            <iconify-icon icon="mdi:close-octagon" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110"
                  style="color: var(--app-disabled-foreground);"
                  @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${() => this.removeAllBreakpoints()} title="Remove All">
            <iconify-icon icon="mdi:delete-sweep" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <!-- Breakpoints list -->
      <div>
        ${!this.breakpoints || this.breakpoints.length === 0 ? html`
          <div class="flex flex-col items-center justify-center py-6 gap-2" style="color: var(--app-disabled-foreground);">
            <iconify-icon class="text-2xl opacity-30" icon="mdi:map-marker-off-outline"></iconify-icon>
            <span class="text-[11px]">No breakpoints set</span>
          </div>
        ` : html`
          ${this.breakpoints.map((bp) => html`
            <div class="flex items-start gap-2 px-3 py-1 cursor-pointer border-b hover:bg-[var(--app-toolbar-hover)]"
                 style="border-color: var(--app-border);">
              <input type="checkbox"
                     class="w-3.5 h-3.5 mt-0.5 cursor-pointer"
                     ?checked=${bp.enabled}
                     @change=${(e: Event) => this.toggleBreakpoint(bp, e)}
                     @click=${(e: Event) => e.stopPropagation()}
                     title="Enable/Disable breakpoint"/>
              <div class="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 border relative"
                   style="background-color: ${bp.enabled ? 'var(--app-breakpoint, #f44336)' : 'var(--app-breakpoint-disabled, #9ca3af)'}; border-color: ${bp.enabled ? 'var(--app-breakpoint, #f44336)' : 'var(--app-breakpoint-disabled, #9ca3af)'}; ${bp.condition ? `background-color: var(--app-breakpoint-conditional, #ffd700); border-color: var(--app-breakpoint-conditional, #ffd700);` : ''}">
                ${bp.condition ? html`<span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-bold" style="color: #000;">?</span>` : ''}
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-mono text-xs" style="color: var(--app-foreground);">
                  <b class="font-semibold">${getFileName(bp.sourcePath)}</b>:${bp.line}
                </div>
                <div class="text-[10px] whitespace-nowrap overflow-hidden text-ellipsis" style="color: var(--app-disabled-foreground);">${bp.sourcePath}</div>
                ${bp.condition ? html`<div class="text-teal-700 text-[10px] font-mono italic">Condition: ${bp.condition}</div>` : ''}
              </div>
              <div class="hidden items-center gap-0.5 hover:flex">
                <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110"
                        style="color: var(--app-disabled-foreground);"
                        @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                        @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                        @click=${() => this.editBreakpointCondition(bp)} title="Edit Condition">
                  <iconify-icon icon="mdi:edit" width="12"></iconify-icon>
                </button>
                <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110"
                        style="color: var(--app-disabled-foreground);"
                        @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                        @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                        @click=${() => this.removeBreakpoint(bp)} title="Remove">
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
