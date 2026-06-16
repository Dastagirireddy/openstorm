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

export interface StackFrameWithArgs extends StackFrame {
  arguments?: { name: string; value: string; type?: string }[];
}

type SectionId = 'callStack' | 'variables' | 'watch' | 'threads' | 'breakpoints' | 'console';

interface SectionDef {
  id: SectionId;
  label: string;
  icon: string;
  color: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'variables',  label: 'Variables',  icon: 'mdi:variable',          color: 'var(--app-tab-variables, #8b5cf6)' },
  { id: 'callStack',  label: 'Call Stack',  icon: 'mdi:call-split',        color: 'var(--app-tab-callstack, #d97706)' },
  { id: 'watch',      label: 'Watch',       icon: 'mdi:eye-outline',       color: 'var(--app-tab-watch, #06b6d4)' },
  { id: 'threads',    label: 'Threads',     icon: 'mdi:account-group',     color: 'var(--app-tab-threads, #ea580c)' },
  { id: 'breakpoints',label: 'Breakpoints', icon: 'mdi:map-marker',        color: 'var(--app-tab-breakpoints, #f44336)' },
  { id: 'console',    label: 'Console',     icon: 'mdi:console',           color: 'var(--app-tab-console, #16825d)' },
];

@customElement("debug-panel")
export class DebugPanel extends TailwindElement() {
  @state() private isDebugging = false;
  @state() private debugState: "stopped" | "running" | "terminated" = "terminated";
  @state() private variableFilter: string = "";
  @state() private activeSection: SectionId = 'variables';

  connectedCallback() {
    super.connectedCallback();
    this.setupEventListeners();
    setTimeout(() => dispatch("debug-panel-ready"), 0);
  }

  private async setupEventListeners() {
    document.addEventListener("debug-initialized", async () => {
      this.isDebugging = true;
      if (this.debugState !== "stopped") this.debugState = "running";
      this.requestUpdate();
    });

    document.addEventListener("debug-session-started", async () => {
      this.isDebugging = true;
      if (this.debugState !== "stopped") this.debugState = "running";
      this.requestUpdate();
      this.notifyPanelsOfDebugState();
    });

    document.addEventListener("debug-session-ended", () => {
      this.isDebugging = false;
      this.debugState = "terminated";
      this.requestUpdate();
      this.notifyPanelsOfDebugState();
    });

    document.addEventListener("debug-stopped", async () => {
      this.isDebugging = true;
      this.debugState = "stopped";
      this.requestUpdate();
      this.notifyPanelsOfDebugState();
    });

    document.addEventListener("debug-continued", () => {
      this.debugState = "running";
      this.requestUpdate();
      this.notifyPanelsOfDebugState();
    });
  }

  private notifyPanelsOfDebugState() {
    dispatch("debug-state-changed", { isDebugging: this.isDebugging, debugState: this.debugState });
  }

  private selectSection(id: SectionId) {
    this.activeSection = id;
  }

  private renderNavButton(section: SectionDef) {
    const isActive = this.activeSection === section.id;
    return html`
      <button class="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] border-none rounded cursor-pointer transition-all text-left"
        style="background-color: ${isActive ? 'color-mix(in srgb, ' + section.color + ' 15%, transparent)' : 'transparent'};
               color: ${isActive ? section.color : 'var(--app-disabled-foreground)'};"
        @click=${() => this.selectSection(section.id)}>
        <iconify-icon icon="${section.icon}" width="14" style="color: inherit;"></iconify-icon>
        <span class="flex-1 truncate">${section.label}</span>
        ${isActive ? html`<div class="w-1 h-1 rounded-full" style="background-color: ${section.color};"></div>` : ''}
      </button>
    `;
  }

  private renderContent() {
    switch (this.activeSection) {
      case 'variables':
        return html`<debug-variables-panel .variableFilter=${this.variableFilter}></debug-variables-panel>`;
      case 'callStack':
        return html`<debug-call-stack-panel></debug-call-stack-panel>`;
      case 'watch':
        return html`<debug-watch-panel></debug-watch-panel>`;
      case 'threads':
        return html`<debug-threads-panel></debug-threads-panel>`;
      case 'breakpoints':
        return html`<debug-breakpoints-panel></debug-breakpoints-panel>`;
      case 'console':
        return html`<debug-console-panel></debug-console-panel>`;
      default:
        return html``;
    }
  }

  render() {
    const statusText = this.debugState === "running" ? "Running" : this.debugState === "stopped" ? "Paused" : "Terminated";
    const statusColor = this.debugState === "running" ? 'var(--app-running-state, #22c55e)' : this.debugState === "stopped" ? 'var(--app-stopped-state, #d97706)' : 'var(--app-disabled-foreground)';

    return html`
      <style>
        .debug-action-icon { transition: transform 0.1s ease; }
        .debug-action:hover:not(:disabled) .debug-action-icon { transform: scale(1.05); }
        .debug-action:active:not(:disabled) .debug-action-icon { transform: scale(0.95); }
      </style>

      <!-- Compact Toolbar -->
      <div class="flex items-center gap-0.5 px-2 py-1" style="background-color: var(--app-toolbar-hover); border-bottom: 1px solid var(--app-border);">
        <button class="debug-action w-6 h-6 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-colors duration-150 hover:bg-[var(--app-toolbar-active)] ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : ''}"
          @click=${() => this.sendAction("continue")} ?disabled=${this.debugState !== "stopped"} title="Continue (F5)">
          <iconify-icon class="debug-action-icon" style="color: var(--app-continue-color, #22c55e);" icon="material-symbols-light:resume-outline-rounded" width="18"></iconify-icon>
        </button>
        <button class="debug-action w-6 h-6 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-colors duration-150 hover:bg-[var(--app-toolbar-active)] ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : ''}"
          @click=${() => this.sendAction("stepover")} ?disabled=${this.debugState !== "stopped"} title="Step Over (F10)">
          <iconify-icon class="debug-action-icon" style="color: var(--app-step-color, #0078d4);" icon="mdi:debug-step-over" width="16"></iconify-icon>
        </button>
        <button class="debug-action w-6 h-6 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-colors duration-150 hover:bg-[var(--app-toolbar-active)] ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : ''}"
          @click=${() => this.sendAction("stepinto")} ?disabled=${this.debugState !== "stopped"} title="Step Into (F11)">
          <iconify-icon class="debug-action-icon" style="color: var(--app-step-color, #0078d4);" icon="mdi:debug-step-into" width="16"></iconify-icon>
        </button>
        <button class="debug-action w-6 h-6 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-colors duration-150 hover:bg-[var(--app-toolbar-active)] ${this.debugState !== 'stopped' ? 'opacity-40 cursor-not-allowed' : ''}"
          @click=${() => this.sendAction("stepout")} ?disabled=${this.debugState !== "stopped"} title="Step Out (Shift+F11)">
          <iconify-icon class="debug-action-icon" style="color: var(--app-step-color, #0078d4);" icon="mdi:debug-step-out" width="16"></iconify-icon>
        </button>

        <div class="w-px h-4 mx-1" style="background-color: var(--app-border);"></div>

        <button class="debug-action w-6 h-6 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-colors duration-150 hover:bg-[var(--app-toolbar-active)] ${this.debugState !== 'running' ? 'opacity-40 cursor-not-allowed' : ''}"
          @click=${() => this.sendAction("pause")} ?disabled=${this.debugState !== "running"} title="Pause">
          <iconify-icon class="debug-action-icon" style="color: var(--app-pause-color, #d97706);" icon="mdi:pause" width="16"></iconify-icon>
        </button>
        <button class="debug-action w-6 h-6 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-colors duration-150 hover:bg-[var(--app-toolbar-active)] ${!this.isDebugging ? 'opacity-40 cursor-not-allowed' : ''}"
          @click=${() => this.sendAction("terminate")} ?disabled=${!this.isDebugging} title="Stop (Shift+F5)">
          <iconify-icon class="debug-action-icon" style="color: var(--app-stop-color, #f44336);" icon="mdi:stop" width="16"></iconify-icon>
        </button>

        <!-- Status pill -->
        <div class="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded text-[11px] font-medium"
             style="background-color: color-mix(in srgb, ${statusColor} 15%, transparent); color: ${statusColor};">
          <div class="w-1.5 h-1.5 rounded-full" style="background-color: ${statusColor}; ${this.debugState === 'running' ? 'animation: pulse 1.5s infinite;' : ''}"></div>
          ${statusText}
        </div>
      </div>

      <!-- Master-Detail Layout -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left: Navigation sidebar -->
        <div class="flex flex-col py-1 overflow-y-auto h-full" style="width: 44px; min-width: 44px; border-right: 1px solid var(--app-border); background-color: var(--app-tab-inactive);">
          ${SECTIONS.map(s => this.renderNavButton(s))}
        </div>

        <!-- Right: Content area -->
        <div class="flex-1 overflow-auto" style="min-width: 0;">
          ${this.renderContent()}
        </div>
      </div>
    `;
  }

  private async sendAction(action: string) {
    if (!this.isDebugging) return;
    try {
      await invoke("debug_action", { action });
    } catch (error) {
      console.error("[debug-panel] Failed to send debug action:", error);
    }
  }
}
