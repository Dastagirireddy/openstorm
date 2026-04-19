import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TailwindElement } from "../tailwind-element.js";

export interface RunConfiguration {
  id: string;
  name: string;
  language: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  pre_launch_tasks?: string[];
  debug_adapter?: {
    adapter_type: string;
    executable?: string;
    args: string[];
    env: Record<string, string>;
  };
}

export interface ProcessInfo {
  id: number;
  config_name: string;
  command: string;
  started_at: number;
  working_directory?: string;
}

export interface AdapterInfo {
  id: string;
  name: string;
  languages: string[];
  sizeMb: number;
  installCommand?: string;
  isInstalled: boolean;
}

@customElement("run-toolbar")
export class RunToolbar extends TailwindElement() {
  @state() private configurations: RunConfiguration[] = [];
  @state() private selectedConfigId = "";
  @state() private isRunning = false;
  @state() private runningProcessId: number | null = null;
  @state() private projectPath = "";
  @state() private projectOpened = false;
  @state() private adapterInfo: AdapterInfo | null = null;
  @state() private showInstallPrompt = false;
  @state() private isInstalling = false;
  @state() private pendingConfig: RunConfiguration | null = null;
  @state() private isDebugging = false;

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
    }

    .action-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
      transition: all 0.15s;
      padding: 0;
      z-index: 10;
    }

    .action-button iconify-icon {
      pointer-events: none;
    }

    .run-button {
      color: #4caf50;
    }

    .run-button:hover {
      background: rgba(76, 175, 80, 0.1);
    }

    .run-button:disabled {
      color: #999;
      cursor: not-allowed;
    }

    .debug-button {
      color: #2196f3;
    }

    .debug-button:hover {
      background: rgba(33, 150, 243, 0.1);
    }

    .debug-button:disabled {
      color: #999;
      cursor: not-allowed;
    }

    .stop-button {
      color: #f44336;
    }

    .stop-button:hover {
      background: rgba(244, 67, 54, 0.1);
    }

    .config-select {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      font-size: 13px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      min-width: 180px;
      max-width: 280px;
    }

    .config-option {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .config-select:hover {
      border-color: #bbb;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #666;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ccc;
    }

    .status-dot.running {
      background: #4caf50;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
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
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      min-width: 320px;
      max-width: 450px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    }

    .install-dialog-title {
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 12px;
    }

    .install-dialog-content {
      font-size: 13px;
      color: #333333;
      margin-bottom: 16px;
      line-height: 1.5;
    }

    .install-dialog-content p {
      margin: 0 0 8px 0;
    }

    .adapter-name {
      color: #6366f1;
      font-weight: 500;
    }

    .install-dialog-content code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      color: #c41e3a;
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
      background: #6366f1;
      color: #ffffff;
    }

    .install-dialog-button.primary:hover {
      background: #4f46e5;
    }

    .install-dialog-button.primary:disabled {
      background: #cccccc;
      color: #999999;
      cursor: not-allowed;
    }

    .install-dialog-button.secondary {
      background: #f0f0f0;
      color: #333333;
    }

    .install-dialog-button.secondary:hover {
      background: #e0e0e0;
    }

    .install-progress {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      font-size: 12px;
      color: #666666;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid #e5e7eb;
      border-top-color: #6366f1;
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
    // Listen for process events
    listen("process-started", (e: any) => {
      this.runningProcessId = e.payload.process_id;
      this.isRunning = true;
    });

    listen("process-terminated", (e: any) => {
      this.isRunning = false;
      this.runningProcessId = null;
    });

    // Listen for debug events
    listen("debug-initialized", () => {
      this.isDebugging = true;
    });

    listen("debug-terminated", () => {
      this.isDebugging = false;
    });

    // Listen for project-opened event
    document.addEventListener("project-opened", ((e: CustomEvent) => {
      const path = e.detail?.path;
      console.log("[run-toolbar] project-opened event received, path:", path);
      if (path && !this.projectOpened) {
        this.projectOpened = true;
        console.log("[run-toolbar] Detecting configs for:", path);
        this.detectConfigurations(path);
      }
    }) as EventListener);
  }

  async detectConfigurations(workspaceRoot: string) {
    try {
      this.projectPath = workspaceRoot;
      const configs = await invoke<RunConfiguration[]>("detect_run_configurations", {
        workspaceRoot,
      });
      this.configurations = configs;
      if (configs.length > 0 && !this.selectedConfigId) {
        this.selectedConfigId = configs[0].id;
      }
    } catch (error) {
      console.error("Failed to detect run configurations:", error);
    }
  }

  private handleRun = async () => {
    const config = this.configurations.find((c) => c.id === this.selectedConfigId);
    if (!config || !this.projectPath) return;

    try {
      this.isRunning = true;
      const processId = await invoke<number>("run_configuration", {
        workspaceRoot: this.projectPath,
        config,
      });
      this.runningProcessId = processId;
    } catch (error) {
      console.error("Failed to run configuration:", error);
      this.isRunning = false;
    }
  };

  private handleDebug = async () => {
    const config = this.configurations.find((c) => c.id === this.selectedConfigId);
    if (!config || !this.projectPath) {
      console.error("[DEBUG] No config or project path");
      return;
    }

    console.log("[DEBUG] Starting debug for:", config.name, "language:", config.language);

    try {
      // Check if adapter is available for the language
      const language = config.language || "rust";
      console.log("[DEBUG] Checking adapter availability for:", language);
      await this.checkAdapterAvailability(language);

      console.log("[DEBUG] Adapter info:", this.adapterInfo);

      // If adapter is not installed, show prompt
      if (this.adapterInfo && !this.adapterInfo.isInstalled) {
        console.log("[DEBUG] Adapter not installed, showing prompt");
        this.pendingConfig = config;
        this.showInstallPrompt = true;
        return;
      }

      console.log("[DEBUG] Starting debug session...");
      const sessionId = await invoke<number>("start_debug_session", { config });
      console.log("[DEBUG] Debug session started with ID:", sessionId);
      document.dispatchEvent(
        new CustomEvent("debug-session-started", {
          detail: { session_id: sessionId },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      console.error("[DEBUG] Failed to start debug session:", error);
    }
  };

  private async checkAdapterAvailability(language: string) {
    try {
      this.adapterInfo = await invoke<AdapterInfo | null>("get_debug_adapter_info", { language });
    } catch (error) {
      console.error("Failed to get adapter info:", error);
      this.adapterInfo = null;
    }
  }

  private async installAdapter() {
    if (!this.adapterInfo) {
      console.error("No adapter info available");
      return;
    }

    console.log("Installing adapter for language:", this.adapterInfo.languages[0]);
    this.isInstalling = true;
    try {
      const language = this.adapterInfo.languages[0] || "rust";
      console.log("Calling install_debug_adapter with language:", language);
      const result = await invoke("install_debug_adapter", { language });
      console.log("Install result:", result);

      // Refresh adapter info to get updated isInstalled status
      const updatedAdapterInfo = await invoke<AdapterInfo | null>("get_debug_adapter_info", { language });
      console.log("Updated adapter info:", updatedAdapterInfo);

      if (updatedAdapterInfo?.isInstalled && this.pendingConfig) {
        // Start debug session after successful installation
        const config = this.pendingConfig;
        this.pendingConfig = null;
        this.showInstallPrompt = false;
        this.adapterInfo = updatedAdapterInfo;

        console.log("Starting debug session...");
        try {
          const sessionId = await invoke<number>("start_debug_session", { config });
          console.log("Debug session started with ID:", sessionId);

          // Switch to debug activity to show debug sidebar
          document.dispatchEvent(
            new CustomEvent("activity-change", {
              detail: { item: "run-debug" },
              bubbles: true,
              composed: true,
            }),
          );

          document.dispatchEvent(
            new CustomEvent("debug-session-started", {
              detail: { session_id: sessionId },
              bubbles: true,
              composed: true,
            }),
          );
        } catch (debugError) {
          console.error("Failed to start debug session:", debugError);
          alert("Failed to start debug session: " + debugError);
        }
      } else if (updatedAdapterInfo) {
        this.adapterInfo = updatedAdapterInfo;
      }
    } catch (error) {
      console.error("Failed to install adapter:", error);
    } finally {
      this.isInstalling = false;
    }
  }

  private cancelInstall() {
    this.showInstallPrompt = false;
    this.pendingConfig = null;
  }

  private handleStop = async () => {
    if (this.runningProcessId === null) return;

    try {
      await invoke("terminate_process", { processId: this.runningProcessId });
    } catch (error) {
      console.error("Failed to terminate process:", error);
    }
  };

  private getLanguageIcon(language: string): string {
    const icons: Record<string, string> = {
      rust: "devicon:rust",
      javascript: "devicon:javascript",
      typescript: "devicon:typescript",
      python: "devicon:python",
      go: "devicon:go",
      cpp: "devicon:cplusplus",
    };
    return icons[language.toLowerCase()] || "mdi:code-tags";
  }

  override render() {
    const selectedConfig = this.configurations.find((c) => c.id === this.selectedConfigId);
    const showRunDebug = !this.isDebugging;

    return html`
      ${showRunDebug ? html`
        <button
          class="action-button run-button"
          @click=${this.handleRun}
          ?disabled=${!selectedConfig || this.isRunning}
          title="Run (Ctrl+F5)">
          <iconify-icon icon="mdi:play" width="16" color="#4caf50"></iconify-icon>
        </button>

        ${this.isRunning
          ? html`
              <button
                class="action-button stop-button"
                @click=${this.handleStop}
                title="Stop (Shift+F5)">
                <iconify-icon icon="mdi:stop" width="16" color="#f44336"></iconify-icon>
              </button>
            `
          : html`
              <button
                class="action-button debug-button"
                @click=${this.handleDebug}
                ?disabled=${!selectedConfig}
                title="Debug (F5)">
                <iconify-icon icon="mdi:bug" width="16" color="#2196f3"></iconify-icon>
              </button>
            `}
      ` : ''}

      <div class="config-select" style="display: flex; align-items: center; gap: 6px;">
        ${selectedConfig
          ? html`
              <iconify-icon
                icon="${this.getLanguageIcon(selectedConfig.language)}"
                width="16"
                height="16">
              </iconify-icon>
              <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${selectedConfig.name}
              </span>
            `
          : html`<span style="color: #999;">No configuration</span>`}
      </div>

      ${this.isRunning
        ? html`
            <div class="status-indicator">
              <span class="status-dot running"></span>
              <span>Running</span>
            </div>
          `
        : ""}

      ${this.isDebugging
        ? html`
            <div class="status-indicator">
              <span class="status-dot running" style="background: #2196f3;"></span>
              <span>Debugging</span>
            </div>
          `
        : ""}

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
              ${this.adapterInfo.installCommand ? html`
                <p>Or install manually: <code style="background: #3c3c3c; padding: 2px 6px; border-radius: 3px;">${this.adapterInfo.installCommand}</code></p>
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
