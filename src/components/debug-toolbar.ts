import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { dispatch } from "../lib/events.js";
import { TailwindElement } from "../tailwind-element.js";

export interface StackFrame {
  id: number;
  name: string;
  source?: { path?: string };
  line: number;
  column: number;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
}

export interface Thread {
  id: number;
  name: string;
}

export interface AdapterInfo {
  id: string;
  name: string;
  languages: string[];
  sizeMb: number;
  installCommand?: string;
  isInstalled: boolean;
}

@customElement("debug-toolbar")
export class DebugToolbar extends TailwindElement() {
  @state() private isDebugging = false;
  @state() private sessionId: number | null = null;
  @state() private stackFrames: StackFrame[] = [];
  @state() private variables: Variable[] = [];
  @state() private threads: Thread[] = [];
  @state() private selectedFrameId: number | null = null;
  @state() private adapterInfo: AdapterInfo | null = null;
  @state() private showInstallPrompt = false;
  @state() private isInstalling = false;

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: var(--app-toolbar-hover, #f9fafb);
      border-bottom: 1px solid var(--app-border, #e5e7eb);
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
      color: var(--app-secondary-foreground, #4b5563);
      cursor: pointer;
      transition: all 0.15s;
    }

    .debug-action:hover {
      background: var(--app-toolbar-hover, #e5e7eb);
      color: var(--app-foreground, #1f2937);
    }

    .debug-action:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .debug-action.continue {
      color: var(--app-continue-color, #22c55e);
    }

    .debug-action.step {
      color: var(--app-step-color, #6366f1);
    }

    .debug-action.stop {
      color: var(--app-stop-color, #ef4444);
    }

    .debug-action.pause {
      color: var(--app-pause-color, #f59e0b);
    }

    .separator {
      width: 1px;
      height: 20px;
      background: var(--app-border, #e5e7eb);
      margin: 0 4px;
    }

    .status {
      font-size: 12px;
      color: var(--app-secondary-foreground, #6b7280);
      margin-left: 8px;
    }

    .install-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .install-dialog {
      background: var(--app-bg, #ffffff);
      border: 1px solid var(--app-border, #e0e0e0);
      border-radius: 8px;
      padding: 20px;
      min-width: 320px;
      max-width: 450px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    }

    .install-dialog-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--app-foreground, #1a1a1a);
      margin-bottom: 12px;
    }

    .install-dialog-content {
      font-size: 13px;
      color: var(--app-foreground, #333333);
      margin-bottom: 16px;
      line-height: 1.5;
    }

    .install-dialog-content p {
      margin: 0 0 8px 0;
    }

    .adapter-name {
      color: var(--brand-primary, #6366f1);
      font-weight: 500;
    }

    .install-dialog-content code {
      background: var(--app-toolbar-hover, #f5f5f5);
      padding: 2px 6px;
      border-radius: 3px;
      color: var(--app-console-error, #c41e3a);
      font-family: monospace;
      font-size: 12px;
    }

    .install-command {
      background: var(--app-toolbar-hover, #e8e8e8);
      padding: 2px 6px;
      border-radius: 3px;
      color: var(--app-foreground, #333);
      font-family: monospace;
      font-size: 12px;
    }

    .install-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .install-dialog-button {
      padding: 8px 16px;
      font-size: 13px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .install-dialog-button.primary {
      background: var(--brand-primary, #6366f1);
      color: var(--app-button-foreground, #ffffff);
    }

    .install-dialog-button.primary:hover {
      background: var(--brand-primary-hover, #4f46e5);
    }

    .install-dialog-button.primary:disabled {
      background: var(--app-disabled-background, #cccccc);
      color: var(--app-disabled-foreground, #999999);
      cursor: not-allowed;
    }

    .install-dialog-button.secondary {
      background: var(--app-toolbar-hover, #f0f0f0);
      color: var(--app-foreground, #333333);
    }

    .install-dialog-button.secondary:hover {
      background: var(--app-toolbar-hover, #e0e0e0);
    }

    .install-progress {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      font-size: 12px;
      color: var(--app-secondary-foreground, #666666);
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--app-border, #e5e7eb);
      border-top-color: var(--brand-primary, #6366f1);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.setupEventListeners();
  }

  private async setupEventListeners() {
    console.log("[debug-toolbar] Setting up event listeners");
    document.addEventListener("debug-session-started", ((e: CustomEvent) => {
      console.log("[debug-toolbar] debug-session-started event received!");
      this.isDebugging = true;
      this.sessionId = e.detail?.session_id ?? null;
      this.showDebugToolbar(true);
      this.requestUpdate();
    }) as EventListener);

    document.addEventListener("debug-session-ended", (() => {
      console.log("[debug-toolbar] debug-session-ended event received!");
      console.log("[debug-toolbar] isDebugging before:", this.isDebugging);
      this.isDebugging = false;
      this.sessionId = null;
      this.stackFrames = [];
      this.variables = [];
      this.showDebugToolbar(false);
      this.requestUpdate();
      console.log("[debug-toolbar] state updated, isDebugging:", this.isDebugging);
    }) as EventListener);

    document.addEventListener("debug-stopped", async () => {
      await this.refreshStackTrace();
      await this.refreshVariables();
    });
  }

  private showDebugToolbar(show: boolean) {
    const toolbar = this.parentElement?.querySelector('debug-toolbar') as HTMLElement;
    if (toolbar) {
      toolbar.style.display = show ? 'flex' : 'none';
    }
  }

  async startDebug(config: any) {
    try {
      // Check if adapter is available for the language
      const language = config.language || "rust";
      await this.checkAdapterAvailability(language);

      // If adapter is not installed, show prompt
      if (this.adapterInfo && !this.adapterInfo.isInstalled) {
        this.showInstallPrompt = true;
        // Store config for later
        (this as any)._pendingConfig = config;
        return;
      }

      const sessionId = await invoke<number>("start_debug_session", { config });
      this.isDebugging = true;
      this.sessionId = sessionId;
      dispatch("debug-session-started", { session_id: sessionId });
    } catch (error) {
      console.error("Failed to start debug session:", error);
    }
  }

  private async checkAdapterAvailability(language: string) {
    try {
      this.adapterInfo = await invoke<AdapterInfo | null>("get_debug_adapter_info", { language });
    } catch (error) {
      console.error("Failed to get adapter info:", error);
      this.adapterInfo = null;
    }
  }

  private async installAdapter() {
    if (!this.adapterInfo) return;

    this.isInstalling = true;
    try {
      const language = this.adapterInfo.languages[0] || "rust";
      const result = await invoke<any>("install_debug_adapter", { language });

      // Refresh adapter info
      await this.checkAdapterAvailability(language);

      // Handle LLDB installation that requires user to complete Xcode dialog
      if (result && !result.binaryPath && result.message?.includes("complete the installation")) {
        // Installation dialog shown, but user needs to complete it manually
        this.showInstallPrompt = false;
        alert(result.message);
        return;
      }

      if (this.adapterInfo?.isInstalled && (this as any)._pendingConfig) {
        // Start debug session after successful installation
        const config = (this as any)._pendingConfig;
        delete (this as any)._pendingConfig;
        this.showInstallPrompt = false;
        await this.startDebug(config);
      }
    } catch (error) {
      console.error("Failed to install adapter:", error);
    } finally {
      this.isInstalling = false;
    }
  }

  private cancelInstall() {
    this.showInstallPrompt = false;
    delete (this as any)._pendingConfig;
  }

  private async sendAction(action: string) {
    console.log("[debug-toolbar] sendAction called:", action, "isDebugging:", this.isDebugging);
    if (!this.isDebugging) {
      console.warn("[debug-toolbar] Not debugging, skipping action:", action);
      return;
    }

    try {
      console.log("[debug-toolbar] Invoking debug_action:", action);
      await invoke("debug_action", { action });
      console.log("[debug-toolbar] debug_action completed:", action);
    } catch (error) {
      console.error("Failed to send debug action:", error);
    }
  }

  private async refreshStackTrace() {
    try {
      this.stackFrames = await invoke<StackFrame[]>("get_stack_trace");
    } catch (error) {
      console.error("Failed to get stack trace:", error);
    }
  }

  private async refreshVariables() {
    try {
      this.variables = await invoke<Variable[]>("get_variables", {
        variablesReference: 0,
      });
    } catch (error) {
      console.error("Failed to get variables:", error);
    }
  }

  private async refreshThreads() {
    try {
      this.threads = await invoke<Thread[]>("get_threads");
    } catch (error) {
      console.error("Failed to get threads:", error);
    }
  }

  render() {
    return html`
      <button
        class="debug-action continue"
        @click=${() => this.sendAction("continue")}
        ?disabled=${!this.isDebugging}
        title="Continue (F5)">
        <iconify-icon icon="mdi:play" width="16"></iconify-icon>
      </button>

      <button
        class="debug-action step"
        @click=${() => this.sendAction("step_over")}
        ?disabled=${!this.isDebugging}
        title="Step Over (F10)">
        <iconify-icon icon="mdi:debug-step-over" width="16"></iconify-icon>
      </button>

      <button
        class="debug-action step"
        @click=${() => this.sendAction("step_into")}
        ?disabled=${!this.isDebugging}
        title="Step Into (F11)">
        <iconify-icon icon="mdi:debug-step-into" width="16"></iconify-icon>
      </button>

      <button
        class="debug-action step"
        @click=${() => this.sendAction("step_out")}
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

      ${this.isDebugging
        ? html`<span class="status">Debugging</span>`
        : html`<span class="status">Not debugging</span>`}

      ${this.showInstallPrompt && this.adapterInfo ? html`
        <div class="install-overlay" @click=${() => this.cancelInstall()}>
          <div class="install-dialog" @click=${(e: Event) => e.stopPropagation()}>
            <div class="install-dialog-title">Install Debug Adapter</div>
            <div class="install-dialog-content">
              <p>
                Debugging ${this.adapterInfo.languages.join(", ")} requires the
                <span class="adapter-name">${this.adapterInfo.name}</span> debug adapter.
              </p>
              ${this.adapterInfo.sizeMb > 0 ? html`
                <p>Download size: ~${this.adapterInfo.sizeMb} MB</p>
              ` : ""}
              ${this.adapterInfo.id === "lldb" ? html`
                <p>Click "Install" to trigger the Xcode command line tools installation. A system dialog will appear — please click "Get" and then "Install" to complete the setup.</p>
              ` : this.adapterInfo.installCommand ? html`
                <p>Or install manually: <code class="install-command">${this.adapterInfo.installCommand}</code></p>
              ` : ""}
              ${this.isInstalling ? html`
                <div class="install-progress">
                  <div class="spinner"></div>
                  <span>Downloading and installing...</span>
                </div>
              ` : ""}
            </div>
            <div class="install-dialog-actions">
              <button
                class="install-dialog-button secondary"
                @click=${() => this.cancelInstall()}>
                Cancel
              </button>
              <button
                class="install-dialog-button primary"
                @click=${() => this.installAdapter()}
                ?disabled=${this.isInstalling}>
                ${this.isInstalling ? "Installing..." : "Install & Debug"}
              </button>
            </div>
          </div>
        </div>
      ` : ""}
    `;
  }
}
