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
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  children?: Variable[];
  expanded?: boolean;
}

export interface Breakpoint {
  id: number;
  sourcePath: string;
  line: number;
  enabled: boolean;
  verified: boolean;
}

export interface DebugOutput {
  category: string;
  output: string;
}

type DebugTab = "variables" | "call-stack" | "breakpoints" | "console";

@customElement("debug-panel")
export class DebugPanel extends TailwindElement() {
  @state() private activeTab: DebugTab = "variables";
  @state() private isDebugging = false;
  @state() private stackFrames: StackFrame[] = [];
  @state() private variables: Variable[] = [];
  @state() private breakpoints: Breakpoint[] = [];
  @state() private outputs: DebugOutput[] = [];
  @state() private selectedFrameId: number | null = null;
  @state() private expandedVariables = new Set<string>();

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #ffffff;
      border-top: 1px solid #e5e7eb;
    }

    .debug-toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }

    .debug-action {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #4b5563;
      cursor: pointer;
      transition: all 0.15s;
    }

    .debug-action:hover {
      background: #e5e7eb;
      color: #1f2937;
    }

    .debug-action:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .debug-action.continue { color: #22c55e; }
    .debug-action.step { color: #6366f1; }
    .debug-action.stop { color: #ef4444; }
    .debug-action.pause { color: #f59e0b; }

    .separator {
      width: 1px;
      height: 20px;
      background: #e5e7eb;
      margin: 0 4px;
    }

    .status {
      font-size: 12px;
      color: #6b7280;
      margin-left: 8px;
    }

    .tab-bar {
      display: flex;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      padding: 0 8px;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 500;
      color: #6b7280;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }

    .tab:hover {
      color: #1f2937;
      background: #f3f4f6;
    }

    .tab.active {
      color: #6366f1;
      border-bottom-color: #6366f1;
      background: #ffffff;
    }

    .tab-icon {
      font-size: 14px;
    }

    .tab-icon.variables { color: #8b5cf6; }
    .tab-icon.call-stack { color: #06b6d4; }
    .tab-icon.breakpoints { color: #ef4444; }
    .tab-icon.console { color: #10b981; }

    .panel-content {
      flex: 1;
      overflow: auto;
      padding: 8px;
    }

    /* Variables Panel */
    .variables-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .variable {
      display: flex;
      align-items: flex-start;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px;
    }

    .variable:hover {
      background: #f3f4f6;
    }

    .variable-expand {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 4px;
      flex-shrink: 0;
      color: #9ca3af;
      transition: transform 0.15s;
    }

    .variable-expand.expanded {
      transform: rotate(90deg);
    }

    .variable-name {
      color: #7c3aed;
      margin-right: 4px;
      white-space: nowrap;
    }

    .variable-separator {
      color: #9ca3af;
      margin-right: 4px;
    }

    .variable-value {
      color: #dc2626;
      word-break: break-all;
      flex: 1;
    }

    .variable-type {
      color: #9ca3af;
      font-size: 11px;
      margin-left: 8px;
    }

    .children {
      padding-left: 20px;
    }

    /* Call Stack Panel */
    .stack-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stack-frame {
      display: flex;
      flex-direction: column;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      border-left: 3px solid transparent;
    }

    .stack-frame:hover {
      background: #f3f4f6;
    }

    .stack-frame.selected {
      background: #eef2ff;
      border-left-color: #6366f1;
    }

    .stack-frame-name {
      color: #ca8a04;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px;
      font-weight: 500;
    }

    .stack-frame-location {
      color: #6b7280;
      font-size: 11px;
      margin-top: 2px;
    }

    /* Breakpoints Panel */
    .breakpoints-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .breakpoint {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 4px;
    }

    .breakpoint:hover {
      background: #f3f4f6;
    }

    .breakpoint-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #ef4444;
      border: 2px solid #b91c1c;
    }

    .breakpoint-dot.disabled {
      background: #d1d5db;
      border-color: #9ca3af;
    }

    .breakpoint-location {
      color: #1f2937;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px;
    }

    .breakpoint-path {
      color: #6b7280;
      font-size: 11px;
    }

    /* Console Panel */
    .console-output {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      white-space: pre-wrap;
    }

    .console-line {
      padding: 2px 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .console-line.stdout {
      color: #059669;
    }

    .console-line.stderr {
      color: #dc2626;
    }

    .console-line.log {
      color: #2563eb;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #9ca3af;
      gap: 8px;
    }

    .empty-state-icon {
      font-size: 32px;
    }

    .empty-state-text {
      font-size: 13px;
    }

    /* Section headers */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: #f9fafb;
      border-radius: 4px;
      margin-bottom: 4px;
    }

    .section-actions {
      display: flex;
      gap: 4px;
    }

    .section-action {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 3px;
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      transition: all 0.15s;
    }

    .section-action:hover {
      background: #e5e7eb;
      color: #4b5563;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.setupEventListeners();
    console.log("[DebugPanel] Connected, isDebugging =", this.isDebugging);
  }

  private async setupEventListeners() {
    document.addEventListener("debug-initialized", async (e: any) => {
      console.log("[DebugPanel] Debug initialized", e.detail);
      this.isDebugging = true;
      this.requestUpdate();
    });

    document.addEventListener("debug-session-started", async (e: any) => {
      console.log("[DebugPanel] Debug session started", e.detail);
      this.isDebugging = true;
      this.requestUpdate();
      await this.refreshVariables();
      await this.refreshBreakpoints();
    });

    document.addEventListener("debug-session-ended", (e: any) => {
      console.log("[DebugPanel] Debug session ended", e.detail);
      this.isDebugging = false;
      this.stackFrames = [];
      this.variables = [];
      this.selectedFrameId = null;
      this.requestUpdate();
    });

    document.addEventListener("debug-stopped", async (e: any) => {
      console.log("[DebugPanel] Debug stopped:", e.detail);
      this.isDebugging = true; // Ensure buttons are enabled when stopped
      this.requestUpdate();
      await this.refreshStackTrace();
      await this.refreshVariables();
    });

    document.addEventListener("debug-continued", (e: any) => {
      console.log("[DebugPanel] Debug continued", e.detail);
      // Keep isDebugging true, just clear stack/variables
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
        }];
        this.requestUpdate();
      }
    });

    document.addEventListener("breakpoint-added", (e: any) => {
      const bp = e.detail;
      if (bp) {
        this.breakpoints = [...this.breakpoints, bp];
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
    try {
      console.log("[DebugPanel] Fetching stack trace...");
      this.stackFrames = await invoke<StackFrame[]>("get_stack_trace");
      console.log("[DebugPanel] Got", this.stackFrames.length, "stack frames");
    } catch (error) {
      console.error("Failed to get stack trace:", error);
    }
  }

  async refreshVariables() {
    try {
      // First get the stack trace to find the top frame
      const stackFrames = await invoke<any[]>("get_stack_trace");
      if (stackFrames.length === 0) {
        console.log("[DebugPanel] No stack frames, skipping variables");
        this.variables = [];
        return;
      }

      // Get scopes for the top frame
      const topFrame = stackFrames[0];
      console.log("[DebugPanel] Fetching scopes for frame", topFrame.id);
      const scopes = await invoke<any[]>("get_scopes", {
        frameId: topFrame.id,
      });
      console.log("[DebugPanel] Got", scopes.length, "scopes");

      // Get variables from the first scope (usually "Local" or "Arguments")
      if (scopes.length > 0) {
        const scope = scopes[0];
        console.log("[DebugPanel] Fetching variables from scope:", scope.name, "ref:", scope.variablesReference);
        const vars = await invoke<any[]>("get_variables", {
          variablesReference: scope.variablesReference,
        });
        console.log("[DebugPanel] Got", vars.length, "variables");
        this.variables = vars.map((v) => ({
          name: v.name,
          value: v.value,
          type: v.variable_type,
          variablesReference: v.variables_reference || 0,
          expanded: false,
        }));
      } else {
        this.variables = [];
      }
    } catch (error) {
      console.error("Failed to get variables:", error);
      this.variables = [];
    }
  }

  async refreshBreakpoints() {
    // Breakpoints are managed locally, just ensure we have the list
    console.log("[DebugPanel] Breakpoints:", this.breakpoints.length);
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
        children.map((c) => ({
          name: c.name,
          value: c.value,
          type: c.variable_type,
          variablesReference: c.variables_reference || 0,
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

  private renderVariable(variable: Variable, path: string = ""): ReturnType<typeof html> {
    const currentPath = path ? `${path}.${variable.name}` : variable.name;
    const hasChildren = variable.variablesReference > 0;
    const isExpanded = this.expandedVariables.has(currentPath);

    return html`
      <div class="variable" @click=${() => hasChildren && this.expandVariable(currentPath, variable.variablesReference)}>
        ${hasChildren
          ? html`
              <span class="variable-expand ${isExpanded ? "expanded" : ""}">
                <iconify-icon icon="mdi:chevron-right" width="14"></iconify-icon>
              </span>
            `
          : html`<span class="variable-expand"></span>`}
        <span class="variable-name">${variable.name}</span>
        <span class="variable-separator">:</span>
        <span class="variable-value">${variable.value}</span>
        ${variable.type
          ? html`<span class="variable-type">${variable.type}</span>`
          : ""}
      </div>
      ${isExpanded && variable.children
        ? html`
            <div class="children">
              ${variable.children.map((child) => this.renderVariable(child, currentPath))}
            </div>
          `
        : ""}
    `;
  }

  private getFileName(path?: string): string {
    if (!path) return "unknown";
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
  }

  private renderVariablesPanel() {
    if (!this.isDebugging) {
      return html`
        <div class="empty-state">
          <iconify-icon class="empty-state-icon" icon="mdi:bug-outline"></iconify-icon>
          <span class="empty-state-text">Start debugging to view variables</span>
        </div>
      `;
    }

    if (this.variables.length === 0) {
      return html`
        <div class="empty-state">
          <iconify-icon class="empty-state-icon" icon="mdi:variable"></iconify-icon>
          <span class="empty-state-text">No variables in scope</span>
        </div>
      `;
    }

    return html`
      <div class="section-header">
        <span>Variables</span>
        <div class="section-actions">
          <button class="section-action" @click=${() => this.refreshVariables()}>
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <div class="variables-list">
        ${this.variables.map((v) => this.renderVariable(v))}
      </div>
    `;
  }

  private renderCallStackPanel() {
    if (!this.isDebugging) {
      return html`
        <div class="empty-state">
          <iconify-icon class="empty-state-icon" icon="mdi:call-split"></iconify-icon>
          <span class="empty-state-text">Start debugging to view call stack</span>
        </div>
      `;
    }

    return html`
      <div class="section-header">
        <span>Call Stack</span>
        <div class="section-actions">
          <button class="section-action" @click=${() => this.refreshStackTrace()}>
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <div class="stack-list">
        ${this.stackFrames.length === 0
          ? html`<div class="empty-state">
              <iconify-icon class="empty-state-icon" icon="mdi:call-missed"></iconify-icon>
              <span class="empty-state-text">No stack frames</span>
            </div>`
          : this.stackFrames.map(
              (frame) => html`
                <div
                  class="stack-frame ${this.selectedFrameId === frame.id ? "selected" : ""}"
                  @click=${() => this.handleFrameSelect(frame)}>
                  <span class="stack-frame-name">${frame.name}</span>
                  <span class="stack-frame-location">
                    ${this.getFileName(frame.source?.path)}:${frame.line}:${frame.column}
                  </span>
                </div>
              `,
            )}
      </div>
    `;
  }

  private renderBreakpointsPanel() {
    if (this.breakpoints.length === 0) {
      return html`
        <div class="empty-state">
          <iconify-icon class="empty-state-icon" icon="mdi:map-marker-off-outline"></iconify-icon>
          <span class="empty-state-text">No breakpoints set</span>
        </div>
      `;
    }

    return html`
      <div class="section-header">
        <span>Breakpoints</span>
      </div>
      <div class="breakpoints-list">
        ${this.breakpoints.map(
          (bp) => html`
            <div class="breakpoint">
              <div class="breakpoint-dot ${bp.enabled ? "" : "disabled"}"></div>
              <div>
                <div class="breakpoint-location">${this.getFileName(bp.sourcePath)}:${bp.line}</div>
                <div class="breakpoint-path">${bp.sourcePath}</div>
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }

  private renderConsolePanel() {
    if (this.outputs.length === 0) {
      return html`
        <div class="empty-state">
          <iconify-icon class="empty-state-icon" icon="mdi:console-outline"></iconify-icon>
          <span class="empty-state-text">No output yet</span>
        </div>
      `;
    }

    return html`
      <div class="console-output">
        ${this.outputs.map(
          (output, i) => html`
            <div class="console-line ${output.category}">${output.output}</div>
          `,
        )}
      </div>
    `;
  }

  render() {
    return html`
      <!-- Debug Action Toolbar -->
      <div class="debug-toolbar">
        <button
          class="debug-action continue"
          @click=${() => this.sendAction("continue")}
          ?disabled=${!this.isDebugging}
          title="Continue (F5)">
          <iconify-icon icon="mdi:play" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action step"
          @click=${() => this.sendAction("stepover")}
          ?disabled=${!this.isDebugging}
          title="Step Over (F10)">
          <iconify-icon icon="mdi:debug-step-over" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action step"
          @click=${() => this.sendAction("stepinto")}
          ?disabled=${!this.isDebugging}
          title="Step Into (F11)">
          <iconify-icon icon="mdi:debug-step-into" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action step"
          @click=${() => this.sendAction("stepout")}
          ?disabled=${!this.isDebugging}
          title="Step Out (Shift+F11)">
          <iconify-icon icon="mdi:debug-step-out" width="16"></iconify-icon>
        </button>

        <div class="separator"></div>

        <button
          class="debug-action pause"
          @click=${() => this.sendAction("pause")}
          ?disabled=${!this.isDebugging}
          title="Pause">
          <iconify-icon icon="mdi:pause" width="16"></iconify-icon>
        </button>

        <button
          class="debug-action stop"
          @click=${() => this.sendAction("terminate")}
          ?disabled=${!this.isDebugging}
          title="Stop Debugging">
          <iconify-icon icon="mdi:stop" width="16"></iconify-icon>
        </button>

        <span class="status">${this.isDebugging ? "Debugging" : "Not debugging"}</span>
      </div>

      <!-- Tab Bar -->
      <div class="tab-bar">
        <div
          class="tab ${this.activeTab === "variables" ? "active" : ""}"
          @click=${() => (this.activeTab = "variables")}>
          <iconify-icon class="tab-icon variables" icon="mdi:variable"></iconify-icon>
          Variables
        </div>
        <div
          class="tab ${this.activeTab === "call-stack" ? "active" : ""}"
          @click=${() => (this.activeTab = "call-stack")}>
          <iconify-icon class="tab-icon call-stack" icon="mdi:call-split"></iconify-icon>
          Call Stack
        </div>
        <div
          class="tab ${this.activeTab === "breakpoints" ? "active" : ""}"
          @click=${() => (this.activeTab = "breakpoints")}>
          <iconify-icon class="tab-icon breakpoints" icon="mdi:map-marker"></iconify-icon>
          Breakpoints
        </div>
        <div
          class="tab ${this.activeTab === "console" ? "active" : ""}"
          @click=${() => (this.activeTab = "console")}>
          <iconify-icon class="tab-icon console" icon="mdi:console"></iconify-icon>
          Console
        </div>
      </div>

      <div class="panel-content">
        ${this.activeTab === "variables" ? this.renderVariablesPanel() : ""}
        ${this.activeTab === "call-stack" ? this.renderCallStackPanel() : ""}
        ${this.activeTab === "breakpoints" ? this.renderBreakpointsPanel() : ""}
        ${this.activeTab === "console" ? this.renderConsolePanel() : ""}
      </div>
    `;
  }

  private async sendAction(action: string) {
    if (!this.isDebugging) return;
    try {
      await invoke("debug_action", { action });
    } catch (error) {
      console.error("Failed to send debug action:", error);
    }
  }
}
