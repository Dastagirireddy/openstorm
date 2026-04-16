import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';

export interface LspServerInfo {
  language_id: string;
  server_name: string;
  install_command: string;
  is_installed: boolean;
}

@customElement('status-bar')
export class StatusBar extends TailwindElement() {
  @state() private branch = 'main';
  @state() private cursorLine = 1;
  @state() private cursorCol = 1;
  @state() private encoding = 'UTF-8';
  @state() private lineEnding = 'LF';
  @state() private spaces = 4;
  @state() private hasErrors = false;
  @state() private hasWarnings = false;
  @state() private statusMessage = 'Ready';
  @state() private lspStatus: LspServerInfo[] = [];
  @state() private activeLanguage: string | null = null;
  @state() private installProgress: { languageId: string; serverName: string; percentage: number; stage: string } | null = null;
  @state() terminalVisible = true;

  static properties = {
    terminalVisible: { type: Boolean },
  };

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await this.checkLspStatus();
    // Re-check when language changes
    document.addEventListener('active-language-changed', (e: Event) => {
      const customEvent = e as CustomEvent<{ languageId: string }>;
      this.setActiveLanguage(customEvent.detail.languageId);
      this.checkLspStatus();
    });
    // Listen for auto-install requests
    document.addEventListener('lsp-auto-install-request', (e: Event) => {
      const customEvent = e as CustomEvent<{ languageId: string }>;
      this.autoInstallLspServer(customEvent.detail.languageId);
    });
    // Listen for LSP server missing events (from completion failures)
    document.addEventListener('lsp-server-missing', (e: Event) => {
      const customEvent = e as CustomEvent<{ languageId: string; serverName: string }>;
      this.handleServerMissing(customEvent.detail.languageId, customEvent.detail.serverName);
    });
  }

  /**
   * Handle missing LSP server - prompt user to install
   */
  public async handleServerMissing(languageId: string, serverName: string): Promise<void> {
    const serverInfo = this.lspStatus.find(s => s.language_id === languageId);
    if (!serverInfo || serverInfo.is_installed) {
      return; // Already installed or not found in status
    }

    // Show a subtle notification in status bar
    this.statusMessage = `${serverName} not installed. Click to install.`;
    this.dispatchEvent(new CustomEvent('lsp-install-prompt', {
      detail: { languageId, serverName },
      bubbles: true,
    }));
  }

  public updateInstallProgress(languageId: string, serverName: string, percentage: number, stage: string): void {
    this.installProgress = { languageId, serverName, percentage, stage };
    this.requestUpdate();
  }

  public clearInstallProgress(): void {
    this.installProgress = null;
    this.requestUpdate();
  }

  private async checkLspStatus(): Promise<void> {
    try {
      this.lspStatus = await invoke('get_lsp_server_status');
    } catch (error) {
      console.error('Failed to get LSP status:', error);
    }
  }

  public setActiveLanguage(languageId: string): void {
    this.activeLanguage = languageId;
  }

  public async installLspServer(languageId: string, showNotification = true): Promise<void> {
    try {
      const serverInfo = this.getActiveServerInfo();
      const serverName = serverInfo?.server_name || `${languageId}-language-server`;

      if (serverInfo) {
        (serverInfo as any).is_installing = true;
        this.requestUpdate();
      }

      if (showNotification) {
        this.statusMessage = `Downloading ${serverName}...`;
      }

      // Listen for progress events from backend (Tauri window events)
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('lsp-install-progress', (event: any) => {
        const payload = event.payload as { language_id: string; stage: string; percentage: number };
        this.updateInstallProgress(payload.language_id, serverName, payload.percentage, payload.stage);
      });

      const result = await invoke('install_lsp_server', { languageId });

      await unlisten();
      this.clearInstallProgress();

      if (showNotification) {
        this.statusMessage = result as string || `${serverName} ready!`;
        this.dispatchEvent(new CustomEvent('lsp-install-complete', {
          detail: { languageId, success: true },
          bubbles: true,
        }));
      }

      await this.checkLspStatus();
    } catch (error) {
      this.clearInstallProgress();
      if (showNotification) {
        this.statusMessage = `Failed to install: ${error}`;
        this.dispatchEvent(new CustomEvent('lsp-install-complete', {
          detail: { languageId, success: false, error },
          bubbles: true,
        }));
      }
      console.error('Failed to install LSP server:', error);
      await this.checkLspStatus();
    }
  }

  /**
   * Auto-install LSP server when opening a file (silent, no confirmation)
   */
  public async autoInstallLspServer(languageId: string): Promise<void> {
    const serverInfo = this.getActiveServerInfo();

    // Already installed - show nothing, do nothing
    if (!serverInfo || serverInfo.is_installed) {
      return;
    }

    // Skip auto-install for very large servers (clangd is ~500MB)
    if (serverInfo.server_name === 'clangd') {
      console.log('[LSP] clangd is large (~500MB), waiting for user confirmation');
      return;
    }

    console.log(`[LSP] Auto-installing ${serverInfo.server_name}...`);
    // Pass false to keep auto-install silent
    await this.installLspServer(languageId, false);
  }

  public getActiveServerInfo(): LspServerInfo | null {
    if (!this.activeLanguage) return null;
    return this.lspStatus.find(s => s.language_id === this.activeLanguage) || null;
  }

  private renderStatusItem(icon: ReturnType<typeof html>, label: string, hasHover = true): ReturnType<typeof html> {
    return html`
      <div class="flex items-center gap-1.5 ${hasHover ? 'hover:bg-[#eaeef2] hover:text-[#24292f] px-2 py-0.5 rounded cursor-pointer transition-colors' : ''}">
        ${icon}
        <span>${label}</span>
      </div>
    `;
  }

  private renderIconButton(icon: ReturnType<typeof html>, title: string, onClick: () => void): ReturnType<typeof html> {
    return html`
      <button
        class="p-1 hover:bg-[#eaeef2] hover:text-[#0969da] rounded transition-colors"
        title="${title}"
        @click=${onClick}>
        ${icon}
      </button>
    `;
  }

  render() {
    const branchIcon = html`
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="18" r="3"/>
        <circle cx="6" cy="6" r="3"/>
        <circle cx="18" cy="6" r="3"/>
        <path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9"/>
      </svg>
    `;

    const checkIcon = html`
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    `;

    const errorIcon = html`
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    `;

    const warningIcon = html`
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    `;

    const terminalIcon = html`
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    `;

    return html`
      <div
        class="flex h-[28px] items-center justify-between px-3 bg-[#f6f8fa] border-t border-[#d0d7de] text-[#57606a] text-[12px] shrink-0 select-none">

        <!-- Left section -->
        <div class="flex items-center gap-3">
          ${this.renderStatusItem(branchIcon, this.branch)}

          ${this.hasErrors
            ? this.renderStatusItem(errorIcon, '0 Errors', true)
            : ''}

          ${this.hasWarnings
            ? this.renderStatusItem(warningIcon, '0 Warnings', true)
            : ''}

          ${this.renderStatusItem(checkIcon, this.statusMessage)}

          <!-- Terminal toggle button -->
          ${this.renderIconButton(terminalIcon, 'Toggle Terminal (Ctrl+`)', () => {
            this.dispatchEvent(new CustomEvent('toggle-terminal', { bubbles: true }));
          })}

          <!-- LSP Status Indicator -->
          ${(() => {
            const serverInfo = this.getActiveServerInfo();
            if (!serverInfo) return html``;
            const isInstalling = this.installProgress !== null || (serverInfo as any).is_installing === true;
            const statusIcon = isInstalling
              ? html`<svg class="w-3 h-3 text-indigo-600 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
                </svg>`
              : serverInfo.is_installed
                ? html`<svg class="w-3 h-3 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>
                  </svg>`
                : html`<svg class="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                  </svg>`;

            // Show progress bar when installing
            if (isInstalling && this.installProgress) {
              return html`
                <div class="flex items-center gap-2 px-2 py-0.5 rounded bg-indigo-50 border border-[#d0d7de] min-w-[200px]">
                  ${statusIcon}
                  <div class="flex-1">
                    <div class="text-xs text-indigo-700 truncate">Downloading ${this.installProgress.serverName}...</div>
                    <div class="w-full h-1.5 bg-[#eaeef2] rounded-full overflow-hidden">
                      <div class="h-full bg-indigo-600 transition-all duration-200" style="width: ${this.installProgress.percentage}%"></div>
                    </div>
                    <div class="text-[10px] text-[#57606a] mt-0.5">${this.installProgress.stage} (${Math.round(this.installProgress.percentage)}%)</div>
                  </div>
                </div>
              `;
            }

            return html`
              <div class="flex items-center gap-2 px-2 py-0.5 rounded ${serverInfo.is_installed ? 'bg-green-50' : 'bg-yellow-50'} border border-[#d0d7de]">
                ${statusIcon}
                <span>${serverInfo.is_installed ? serverInfo.server_name : 'Install ' + serverInfo.server_name}</span>
                ${!serverInfo.is_installed ? html`
                  <button
                    class="ml-1 px-2 py-0.5 text-xs bg-[#0969da] text-white rounded hover:bg-[#0860ca] transition-colors"
                    @click=${() => this.installLspServer(serverInfo.language_id)}>
                    Install
                  </button>
                ` : ''}
              </div>
            `;
          })()}
        </div>

        <!-- Right section -->
        <div class="flex items-center gap-3">
          ${this.cursorLine > 0
            ? html`<div class="flex items-center gap-1 hover:bg-[#eaeef2] hover:text-[#24292f] px-2 py-0.5 rounded cursor-pointer transition-colors font-mono">
                <span>Ln ${this.cursorLine}, Col ${this.cursorCol}</span>
              </div>`
            : ''}

          ${this.renderStatusItem(html``, `${this.spaces} spaces`, false)}
          ${this.renderStatusItem(html``, this.encoding.toUpperCase(), false)}
          ${this.renderStatusItem(html``, this.lineEnding, false)}
        </div>
      </div>
    `;
  }

  // Public API
  setCursorPosition(line: number, col: number): void {
    this.cursorLine = line;
    this.cursorCol = col;
  }

  setBranch(branch: string): void {
    this.branch = branch;
  }

  setHasErrors(hasErrors: boolean): void {
    this.hasErrors = hasErrors;
    this.hasWarnings = false;
  }

  setStatusMessage(message: string): void {
    this.statusMessage = message;
  }
}
