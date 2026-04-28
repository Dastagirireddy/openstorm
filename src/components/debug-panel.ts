import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../tailwind-element.js";
import { dispatch } from "../lib/types/events.js";
import "./debug/debug-variables-panel.js";
import "./debug/debug-watch-panel.js";
import "./debug/debug-call-stack-panel.js";
import "./debug/debug-threads-panel.js";
import "./debug/debug-breakpoints-panel.js";
import "./debug/debug-console-panel.js";

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
  @state() private debugState: "stopped" | "running" | "terminated" = "stopped";
  @state() private variableFilter: string = "";

  // References to panel components for calling methods
  private variablesPanelRef: any = null;
  private watchPanelRef: any = null;
  private callStackPanelRef: any = null;
  private threadsPanelRef: any = null;
  private breakpointsPanelRef: any = null;
  private consolePanelRef: any = null;

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
      this.isDebugging = true;
      if (this.debugState !== "stopped") {
        this.debugState = "running";
      }
      this.requestUpdate();
      // Notify all panels to refresh
      this.notifyPanelsOfDebugState();
    });

    document.addEventListener("debug-session-ended", (e: any) => {
      this.isDebugging = false;
      this.debugState = "terminated";
      this.requestUpdate();
      this.notifyPanelsOfDebugState();
    });

    document.addEventListener("debug-stopped", async (e: any) => {
      this.isDebugging = true;
      this.debugState = "stopped";
      this.requestUpdate();
      this.notifyPanelsOfDebugState();
    });

    document.addEventListener("debug-continued", (e: any) => {
      this.debugState = "running";
      this.requestUpdate();
      this.notifyPanelsOfDebugState();
    });
  }

  private notifyPanelsOfDebugState() {
    dispatch("debug-state-changed", { isDebugging: this.isDebugging, debugState: this.debugState });
  }

  private handleVariableFilterChange(event: CustomEvent) {
    this.variableFilter = event.detail.filter || "";
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
      <div class="flex items-center gap-0.5 px-1.5 py-1" style="background-color: var(--app-toolbar-hover); border-bottom: 1px solid var(--app-border);">
        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : ''}"
          @mouseenter=${(e: Event) => { if (!(e.target as HTMLElement).closest('button')?.hasAttribute('disabled')) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          @click=${() => this.sendAction("continue")}
          ?disabled=${this.debugState !== "stopped"}
          title="Continue (F5)">
          <iconify-icon class="debug-action-icon text-green-600" icon="material-symbols-light:resume-outline-rounded" width="22"></iconify-icon>
        </button>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : ''}"
          @mouseenter=${(e: Event) => { if (!(e.target as HTMLElement).closest('button')?.hasAttribute('disabled')) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          @click=${() => this.sendAction("stepover")}
          ?disabled=${this.debugState !== "stopped"}
          title="Step Over (F10)">
          <iconify-icon class="debug-action-icon text-blue-600" icon="mdi:debug-step-over" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : ''}"
          @mouseenter=${(e: Event) => { if (!(e.target as HTMLElement).closest('button')?.hasAttribute('disabled')) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          @click=${() => this.sendAction("stepinto")}
          ?disabled=${this.debugState !== "stopped"}
          title="Step Into (F11)">
          <iconify-icon class="debug-action-icon text-blue-600" icon="mdi:debug-step-into" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : ''}"
          @mouseenter=${(e: Event) => { if (!(e.target as HTMLElement).closest('button')?.hasAttribute('disabled')) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          @click=${() => this.sendAction("stepout")}
          ?disabled=${this.debugState !== "stopped"}
          title="Step Out (Shift+F11)">
          <iconify-icon class="debug-action-icon text-blue-600" icon="mdi:debug-step-out" width="16"></iconify-icon>
        </button>

        <div class="w-px h-4.5 mx-1" style="background-color: var(--app-border);"></div>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${this.debugState !== 'running' ? 'opacity-40 cursor-not-allowed' : ''}"
          @mouseenter=${(e: Event) => { if (!(e.target as HTMLElement).closest('button')?.hasAttribute('disabled')) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          @click=${() => this.sendAction("pause")}
          ?disabled=${this.debugState !== "running"}
          title="Pause">
          <iconify-icon class="debug-action-icon text-amber-600" icon="mdi:pause" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden ${!this.isDebugging ? 'opacity-40 cursor-not-allowed' : ''}"
          @mouseenter=${(e: Event) => { if (!(e.target as HTMLElement).closest('button')?.hasAttribute('disabled')) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          @click=${() => this.sendAction("terminate")}
          ?disabled=${!this.isDebugging}
          title="Stop Debugging (Shift+F5)">
          <iconify-icon class="debug-action-icon text-red-600" icon="mdi:stop" width="16"></iconify-icon>
        </button>

        <span class="text-[11px] font-medium font-sans ml-2 ${statusClass}">${statusText}</span>
      </div>

      <!-- Tab Bar -->
      <div class="flex overflow-x-auto" style="background-color: var(--app-toolbar-hover); border-bottom: 1px solid var(--app-border);">
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent cursor-pointer transition-all"
          style="background-color: ${this.activeTab === "variables" ? 'var(--app-tab-active)' : 'transparent'}; color: ${this.activeTab === "variables" ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'}; border-bottom-color: ${this.activeTab === "variables" ? '#6366f1' : 'transparent'};"
          @click=${() => (this.activeTab = "variables")}
          @mouseenter=${(e: Event) => { if (this.activeTab !== "variables") (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => { if (this.activeTab !== "variables") (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}>
          <iconify-icon class="${this.activeTab === "variables" ? "text-purple-500" : ""}" icon="mdi:variable"></iconify-icon>
          Variables
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent cursor-pointer transition-all"
          style="background-color: ${this.activeTab === "watch" ? 'var(--app-tab-active)' : 'transparent'}; color: ${this.activeTab === "watch" ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'}; border-bottom-color: ${this.activeTab === "watch" ? '#6366f1' : 'transparent'};"
          @click=${() => (this.activeTab = "watch")}
          @mouseenter=${(e: Event) => { if (this.activeTab !== "watch") (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => { if (this.activeTab !== "watch") (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}>
          <iconify-icon class="${this.activeTab === "watch" ? "text-cyan-500" : ""}" icon="mdi:eye-outline"></iconify-icon>
          Watch
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent cursor-pointer transition-all"
          style="background-color: ${this.activeTab === "call-stack" ? 'var(--app-tab-active)' : 'transparent'}; color: ${this.activeTab === "call-stack" ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'}; border-bottom-color: ${this.activeTab === "call-stack" ? '#6366f1' : 'transparent'};"
          @click=${() => (this.activeTab = "call-stack")}
          @mouseenter=${(e: Event) => { if (this.activeTab !== "call-stack") (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => { if (this.activeTab !== "call-stack") (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}>
          <iconify-icon class="${this.activeTab === "call-stack" ? "text-amber-600" : ""}" icon="mdi:call-split"></iconify-icon>
          Call Stack
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent cursor-pointer transition-all"
          style="background-color: ${this.activeTab === "threads" ? 'var(--app-tab-active)' : 'transparent'}; color: ${this.activeTab === "threads" ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'}; border-bottom-color: ${this.activeTab === "threads" ? '#6366f1' : 'transparent'};"
          @click=${() => (this.activeTab = "threads")}
          @mouseenter=${(e: Event) => { if (this.activeTab !== "threads") (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => { if (this.activeTab !== "threads") (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}>
          <iconify-icon class="${this.activeTab === "threads" ? "text-orange-600" : ""}" icon="mdi:account-group"></iconify-icon>
          Threads
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent cursor-pointer transition-all"
          style="background-color: ${this.activeTab === "breakpoints" ? 'var(--app-tab-active)' : 'transparent'}; color: ${this.activeTab === "breakpoints" ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'}; border-bottom-color: ${this.activeTab === "breakpoints" ? '#6366f1' : 'transparent'};"
          @click=${() => (this.activeTab = "breakpoints")}
          @mouseenter=${(e: Event) => { if (this.activeTab !== "breakpoints") (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => { if (this.activeTab !== "breakpoints") (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}>
          <iconify-icon class="${this.activeTab === "breakpoints" ? "text-red-500" : ""}" icon="mdi:map-marker"></iconify-icon>
          Breakpoints
        </button>
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-none border-b-2 border-transparent cursor-pointer transition-all"
          style="background-color: ${this.activeTab === "console" ? 'var(--app-tab-active)' : 'transparent'}; color: ${this.activeTab === "console" ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'}; border-bottom-color: ${this.activeTab === "console" ? '#6366f1' : 'transparent'};"
          @click=${() => (this.activeTab = "console")}
          @mouseenter=${(e: Event) => { if (this.activeTab !== "console") (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
          @mouseleave=${(e: Event) => { if (this.activeTab !== "console") (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}>
          <iconify-icon class="${this.activeTab === "console" ? "text-green-700" : ""}" icon="mdi:console"></iconify-icon>
          Console
        </button>
      </div>

      <div class="flex-1 overflow-auto">
        ${this.activeTab === "variables" ? html`
          <debug-variables-panel .variableFilter=${this.variableFilter}></debug-variables-panel>
        ` : ''}
        ${this.activeTab === "watch" ? html`
          <debug-watch-panel></debug-watch-panel>
        ` : ''}
        ${this.activeTab === "call-stack" ? html`
          <debug-call-stack-panel></debug-call-stack-panel>
        ` : ''}
        ${this.activeTab === "threads" ? html`
          <debug-threads-panel></debug-threads-panel>
        ` : ''}
        ${this.activeTab === "breakpoints" ? html`
          <debug-breakpoints-panel></debug-breakpoints-panel>
        ` : ''}
        ${this.activeTab === "console" ? html`
          <debug-console-panel></debug-console-panel>
        ` : ''}
      </div>
    `;
  }

  private async sendAction(action: string) {
    if (!this.isDebugging) {
      return;
    }
    try {
      await invoke("debug_action", { action });
    } catch (error) {
      console.error("[debug-panel] Failed to send debug action:", error);
    }
  }
}
