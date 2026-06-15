/**
 * Debug Threads Panel
 * Displays threads with expandable stack traces
 */

import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";
import { dispatch } from "../../lib/types/events.js";
import { getFileName } from "../../lib/debug/debug-utils.js";
import type { StackFrame } from "./debug-call-stack-panel.js";

export interface DebugThread {
  id: number;
  name: string;
  state?: "running" | "stopped" | "exited" | "unknown";
  selected?: boolean;
  expanded?: boolean;
  stackFrames?: StackFrame[];
}

@customElement("debug-threads-panel")
export class DebugThreadsPanel extends TailwindElement() {
  @state() threads: DebugThread[] = [];
  @state() selectedThreadId: number | null = null;
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

  private async refreshThreadStackTrace(threadId: number) {
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

  private handleFrameSelect(frame: StackFrame) {
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
          <iconify-icon class="text-2xl opacity-30" icon="mdi:account-group"></iconify-icon>
          <span class="text-[11px]">Start debugging to view threads</span>
        </div>
      `;
    }

    return html`
      <style>
        .thread-expand { transition: transform 0.15s ease; }
        .thread-expand.expanded { transform: rotate(90deg); }
      </style>
      <div>
        ${this.threads.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center min-h-[48px] px-3 py-2 text-xs" style="color: var(--app-disabled-foreground);">
                No threads
              </div>
            `
          : this.threads.map((thread) => {
              const stateClass = thread.state || 'unknown';
              const hasStack = thread.expanded && thread.stackFrames && thread.stackFrames.length > 0;
              const stateColor = stateClass === 'running' ? 'var(--app-running-state, #22c55e)' : stateClass === 'stopped' ? 'var(--app-stopped-state, #d97706)' : 'var(--app-exited-state, #6b7280)';
              return html`
                <div
                  class="flex flex-col px-3 py-1 cursor-pointer border-l-[3px] border-b transition-all ${thread.selected ? 'bg-[var(--app-tab-active)]' : 'hover:bg-[var(--app-toolbar-hover)]'} ${stateClass === 'exited' ? 'opacity-50' : ''}"
                  style="border-color: ${thread.selected ? 'var(--brand-primary)' : stateClass === 'running' ? 'var(--app-running-state, #22c55e)' : stateClass === 'stopped' ? 'var(--app-stopped-state, #d97706)' : 'var(--app-border)'};"
                  @click=${() => this.handleThreadSelect(thread)}>
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                      <div class="w-2 h-2 rounded-full flex-shrink-0 ${stateClass === 'running' ? 'animate-pulse' : ''}"
                           style="background-color: ${stateColor};"></div>
                      <span class="font-mono text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis" style="color: var(--app-foreground);">${thread.name}</span>
                      <span class="text-[10px]" style="color: var(--app-disabled-foreground);">#${thread.id}</span>
                    </div>
                    <button
                      class="thread-expand w-5 h-5 flex items-center justify-center transition-transform ${thread.expanded ? 'expanded' : ''}"
                      style="color: var(--app-disabled-foreground);"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this.toggleThreadExpand(thread);
                      }}
                      title="Show stack trace">
                      <iconify-icon icon="mdi:chevron-right" width="16"></iconify-icon>
                    </button>
                  </div>
                  ${hasStack ? html`
                    <div class="mt-2 p-2 rounded" style="background-color: var(--app-toolbar-hover);">
                      ${thread.stackFrames!.map((frame, idx) => html`
                        <div
                          class="flex items-center px-2 py-1 font-mono text-[11px] cursor-pointer rounded transition-colors hover:bg-[var(--app-toolbar-active)]"
                          style="color: var(--app-foreground);"
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            this.handleFrameSelect(frame);
                          }}>
                          <iconify-icon icon="mdi:chevron-right" width="12" class="mr-1"></iconify-icon>
                          <span>${frame.name}</span>
                          <span class="ml-1" style="color: var(--app-disabled-foreground);">
                            ${getFileName(frame.source?.path)}:${frame.line}
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
}
