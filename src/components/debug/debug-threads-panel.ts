/**
 * Debug Threads Panel
 * Displays threads with expandable stack traces
 */

import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";
import { dispatch } from "../../lib/types/events.js";
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

  private getFileName(path?: string): string {
    if (!path) return "unknown";
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
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
        <div class="flex flex-col items-center justify-center h-28 text-gray-500 gap-3">
          <iconify-icon class="text-4xl opacity-50" icon="mdi:account-group"></iconify-icon>
          <span class="text-xs font-sans">Start debugging to view threads</span>
        </div>
      `;
    }

    return html`
      <style>
        .thread-expand { transition: transform 0.15s ease; }
        .thread-expand.expanded { transform: rotate(90deg); }
      </style>
      <div class="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider bg-gray-50 border-b border-gray-200">
        <span>Threads</span>
        <div class="flex gap-0.5">
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent text-gray-500 cursor-pointer transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-110" @click=${() => this.refresh()} title="Refresh">
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
}
