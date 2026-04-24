import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import { dispatch } from '../lib/events.js';
import './icon.js';

/**
 * Get display name for LSP server
 */
function getServerDisplayName(languageId: string): string {
  const serverNames: Record<string, string> = {
    rust: 'rust-analyzer',
    go: 'gopls',
    python: 'pyright',
    cpp: 'clangd',
    typescript: 'typescript-language-server',
    javascript: 'typescript-language-server',
  };
  return serverNames[languageId] || `${languageId}-language-server`;
}

export interface LspServerInfo {
  language_id: string;
  server_name: string;
  install_command: string;
  is_installed: boolean;
}

@customElement('status-bar')
export class StatusBar extends TailwindElement() {
  @state() private branch = 'main';
  @state() private cursorLine = 0;
  @state() private cursorCol = 0;
  @state() private encoding = 'UTF-8';
  @state() private lineEnding = 'LF';
  @state() private spaces = 4;
  @state() private hasErrors = false;
  @state() private hasWarnings = false;
  @state() private statusMessage = 'Ready';
  @state() private lspStatus: LspServerInfo[] = [];
  @state() private activeLanguage: string | null = null;
  @state() private installProgress: { languageId: string; serverName: string; percentage: number; stage: string } | null = null;
  @state() private installFailed: Map<string, string> = new Map(); // languageId -> error message
  @state() terminalVisible = true;
  @state() private fileOpen = false;
  @state() private terminalHasOutput = false;
  @state() private currentThemeName = 'OpenStorm Light';

  static properties = {
    terminalVisible: { type: Boolean },
  };

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await this.checkLspStatus();

    // Initialize theme display
    const { ThemeService } = await import('../lib/theme-service.js');
    const themeService = ThemeService.getInstance();
    this.updateThemeDisplay(themeService);

    // Subscribe to theme changes
    this._themeDispose = themeService.subscribe(() => {
      this.updateThemeDisplay(themeService);
    });

    // Listen for cursor position updates from editor
    document.addEventListener('cursor-position', (e: Event) => {
      const customEvent = e as CustomEvent<{ line: number; column: number }>;
      this.setCursorPosition(customEvent.detail.line, customEvent.detail.column);
    });
    // Listen for file open/close events to show/hide cursor position
    document.addEventListener('open-file-external', () => {
      this.fileOpen = true;
    });
    document.addEventListener('clear-editor', () => {
      this.fileOpen = false;
      this.cursorLine = 0;
      this.cursorCol = 0;
    });
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
    // Listen for terminal/app console output events
    document.addEventListener('app-console-output', () => {
      this.terminalHasOutput = true;
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._themeDispose) {
      this._themeDispose();
    }
  }

  private updateThemeDisplay(themeService: any): void {
    const theme = themeService.getCurrentWorkbenchTheme();
    this.currentThemeName = theme?.name || 'OpenStorm Light';
    this.requestUpdate();
  }

  private openThemePalette(): void {
    dispatch('open-theme-palette');
  }

  /**
   * Handle missing LSP server - prompt user to install
   */
  public async handleServerMissing(languageId: string, serverName: string): Promise<void> {
    const serverInfo = this.lspStatus.find(s => s.language_id === languageId);
    if (!serverInfo || serverInfo.is_installed) {
      return; // Already installed or not found in status
    }

    // Skip if we already tried and failed - let user click Retry button instead
    if (this.installFailed.has(languageId)) {
      console.log(`[LSP] Skipping install prompt for ${serverName} - previous install failed`);
      return;
    }

    // Show a subtle notification in status bar with clearer messaging
    const displayName = getServerDisplayName(languageId);
    this.statusMessage = `${displayName} not installed. Installing...`;
    console.log(`[LSP] ${displayName} server not available, starting auto-install`);

    // Trigger auto-install
    this.autoInstallLspServer(languageId);
  }

  public updateInstallProgress(languageId: string, serverName: string, percentage: number, stage: string): void {
    this.installProgress = { languageId, serverName, percentage, stage };
    this.requestUpdate();
  }

  public clearInstallProgress(): void {
    this.installProgress = null;
    this.requestUpdate();
  }

  public dismissInstallError(languageId: string): void {
    this.installFailed.delete(languageId);
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
    const serverInfo = this.getActiveServerInfo();
    const serverName = serverInfo?.server_name || `${languageId}-language-server`;

    try {
      // Listen for progress events from backend (Tauri window events)
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('lsp-install-progress', (event: any) => {
        const payload = event.payload as { language_id: string; stage: string; percentage: number };
        this.updateInstallProgress(payload.language_id, serverName, payload.percentage, payload.stage);
      });

      const result = await invoke('install_lsp_server', { languageId });

      await unlisten();
      this.clearInstallProgress();
      this.installFailed.delete(languageId); // Clear failed state on success

      // Re-check status to update the indicator
      await this.checkLspStatus();

      // Re-initialize LSP pool to pick up newly installed server
      console.log(`[LSP] Re-initializing LSP pool for ${languageId} after install`);
      // Dispatch event to re-open current file with new LSP connection
      this.dispatchEvent(new CustomEvent('lsp-server-ready', {
        detail: { languageId },
        bubbles: true,
        composed: true,
      }));

      if (showNotification) {
        this.statusMessage = `${serverName} ready`;
        this.dispatchEvent(new CustomEvent('lsp-install-complete', {
          detail: { languageId, success: true },
          bubbles: true,
        }));
      }
    } catch (error) {
      this.clearInstallProgress();
      // Store error message for display
      const errorMsg = error instanceof Object ? JSON.stringify(error) : String(error);
      this.installFailed.set(languageId, errorMsg);
      // Re-check status to update the indicator
      await this.checkLspStatus();
      if (showNotification) {
        this.statusMessage = `${serverName} install failed`;
        this.dispatchEvent(new CustomEvent('lsp-install-complete', {
          detail: { languageId, success: false, error: errorMsg },
          bubbles: true,
        }));
      }
      console.error('Failed to install LSP server:', error);
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

    // Skip if we already tried and failed
    if (this.installFailed.has(languageId)) {
      console.log(`[LSP] Skipping auto-install for ${serverInfo.server_name} - previous install failed`);
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

  /**
   * Get the error message for a failed install
   */
  public getInstallError(languageId: string): string | null {
    return this.installFailed.get(languageId) || null;
  }

  /**
   * Get user-friendly error message for LSP install failures
   */
  public getUserFriendlyError(errorMessage: string | null, languageId: string): string {
    if (!errorMessage) return 'Install failed';

    const error = errorMessage.toLowerCase();

    // Check for specific missing tool errors
    if (error.includes('rust-analyzer') || error.includes('not found') || error.includes('no such file')) {
      return `${getServerDisplayName(languageId)} not installed - click Retry to install`;
    }
    if (error.includes('npm') || error.includes('node')) {
      return 'Node.js required - please install Node.js first';
    }
    if (error.includes('go ') || error.includes('gopls')) {
      return 'Go not installed - please install Go from go.dev';
    }
    if (error.includes('python') || error.includes('pip')) {
      return 'Python not installed - please install Python first';
    }
    if (error.includes('clang') || error.includes('llvm')) {
      return 'LLVM/clang not installed - install Xcode or LLVM';
    }
    if (error.includes('xcode')) {
      return 'Xcode tools required - run: xcode-select --install';
    }
    if (error.includes('permission') || error.includes('access')) {
      return 'Permission denied - check file permissions';
    }
    if (error.includes('network') || error.includes('download') || error.includes('fetch')) {
      return 'Download failed - check internet connection';
    }

    return 'Install failed - click Retry to try again';
  }

  /**
   * Get the background style class for the status message
   */
  private getStatusMessageStyle(): string {
    if (this.statusMessage.includes('failed')) {
      return 'bg-red-100 text-red-800 font-medium';
    }
    if (this.statusMessage.includes('ready')) {
      return 'bg-green-100 text-green-800 font-medium';
    }
    if (this.statusMessage.includes('Downloading')) {
      return 'bg-indigo-100 text-indigo-800 font-medium';
    }
    if (this.statusMessage.includes('not installed')) {
      return 'bg-yellow-100 text-yellow-800 font-medium';
    }
    return '';
  }

  /**
   * Get the icon name for the status message
   */
  private getStatusMessageIcon(): string {
    if (this.statusMessage.includes('failed')) {
      return 'circle-dot';
    }
    if (this.statusMessage.includes('ready')) {
      return 'check';
    }
    if (this.statusMessage.includes('Downloading')) {
      return 'clock';
    }
    if (this.statusMessage.includes('not installed')) {
      return 'circle-dot';
    }
    return 'check';
  }

  /**
   * Get the icon color for the status message
   */
  private getStatusMessageColor(): string {
    if (this.statusMessage.includes('failed')) {
      return '#dc2626';
    }
    if (this.statusMessage.includes('ready')) {
      return '#16a34a';
    }
    if (this.statusMessage.includes('Downloading')) {
      return '#4f46e5';
    }
    if (this.statusMessage.includes('not installed')) {
      return '#ca8a04';
    }
    return '#22c55e';
  }

  public getActiveServerInfo(): LspServerInfo | null {
    if (!this.activeLanguage) return null;
    return this.lspStatus.find(s => s.language_id === this.activeLanguage) || null;
  }

  render() {
    return html`
      <div
        class="flex h-[28px] items-center justify-between px-3 text-[12px] shrink-0 select-none"
        style="background-color: var(--statusbar-background); color: var(--statusbar-foreground); border-top-color: var(--statusbar-border); border-top-width: 1px; border-top-style: solid;">

        <!-- Left section -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors"
               style="background-color: transparent;"
               @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
               @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
            <os-icon name="git-branch" size="12" color="var(--statusbar-foreground)"></os-icon>
            <span style="color: var(--statusbar-foreground);">${this.branch}</span>
          </div>

          ${this.hasErrors
            ? html`
              <div class="flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors"
                   @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
                   @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
                <os-icon name="x" size="12" color="var(--app-console-error)"></os-icon>
                <span style="color: var(--statusbar-foreground);">0 Errors</span>
              </div>`
            : ''}

          ${this.hasWarnings
            ? html`
              <div class="flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors"
                   @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
                   @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
                <os-icon name="circle-dot" size="12" color="var(--app-console-warning)"></os-icon>
                <span style="color: var(--statusbar-foreground);">0 Warnings</span>
              </div>`
            : ''}

          <div class="flex items-center gap-1.5 px-2 py-0.5 rounded ${this.getStatusMessageStyle()}">
            <os-icon name="${this.getStatusMessageIcon()}" size="12" color="${this.getStatusMessageColor()}"></os-icon>
            <span>${this.statusMessage}</span>
          </div>

          <!-- Terminal toggle button -->
          <button
            class="w-6 h-6 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden transition-all relative"
            style="color: var(--statusbar-foreground);"
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
            title="Toggle Terminal (Ctrl+\`)"
            @click=${() => {
              this.terminalHasOutput = false;
              this.dispatchEvent(new CustomEvent('toggle-terminal', { bubbles: true }));
            }}>
            <os-icon name="terminal" width="14"></os-icon>
            ${this.terminalHasOutput && !this.terminalVisible
              ? html`<span class="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse" style="background-color: var(--app-continue-color);"></span>`
              : ''}
          </button>

          <!-- LSP Status Indicator -->
          ${(() => {
            const serverInfo = this.getActiveServerInfo();
            if (!serverInfo) return html``;
            const isInstalling = this.installProgress !== null || (serverInfo as any).is_installing === true;

            // Downloading state - clean single line
            if (isInstalling) {
              return html`
                <div class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer transition-colors"
                     @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
                     @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
                  <os-icon name="clock" size="12" color="var(--app-button-background)" class="animate-spin"></os-icon>
                  <span style="color: var(--statusbar-foreground);">Downloading ${serverInfo.server_name}...</span>
                </div>
              `;
            }

            const hasFailed = this.installFailed.has(serverInfo.language_id);
            const errorMessage = this.getInstallError(serverInfo.language_id);

            // Failed state
            if (hasFailed) {
              const displayError = this.getUserFriendlyError(errorMessage, serverInfo.language_id);

              return html`
                <div class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer transition-colors"
                     @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
                     @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
                  <os-icon name="circle-dot" size="12" color="var(--app-console-error)"></os-icon>
                  <span style="color: var(--statusbar-foreground);">${serverInfo.server_name}: ${displayError}</span>
                  <button
                    class="ml-1 px-2 py-0.5 text-xs rounded transition-colors"
                    style="background-color: var(--app-button-background); color: var(--app-button-foreground);"
                    @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-hover)'}
                    @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-background)'}
                    @click=${(e: Event) => { e.stopPropagation(); this.installLspServer(serverInfo.language_id); }}>
                    Retry
                  </button>
                  <button
                    class="ml-1 px-1.5 py-0.5 text-xs transition-colors"
                    style="color: var(--statusbar-foreground);"
                    @mouseenter=${(e: Event) => (e.target as HTMLElement).style.color = 'var(--app-foreground)'}
                    @mouseleave=${(e: Event) => (e.target as HTMLElement).style.color = 'var(--statusbar-foreground)'}
                    @click=${(e: Event) => { e.stopPropagation(); this.dismissInstallError(serverInfo.language_id); }}>
                    <os-icon name="x" size="12"></os-icon>
                  </button>
                </div>
              `;
            }

            // Installed state
            if (serverInfo.is_installed) {
              return html`
                <div class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer transition-colors"
                     @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
                     @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
                  <os-icon name="check" size="12" color="var(--app-console-success)"></os-icon>
                  <span style="color: var(--statusbar-foreground);">${serverInfo.server_name} ready</span>
                </div>
              `;
            }

            // Not installed state
            return html`
              <div class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer transition-colors"
                     @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
                     @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
                <os-icon name="circle-dot" size="12" color="var(--app-console-warning)"></os-icon>
                <span style="color: var(--statusbar-foreground);">${serverInfo.server_name} not installed</span>
                <button
                  class="ml-1 px-2 py-0.5 text-xs rounded transition-colors"
                  style="background-color: var(--app-button-background); color: var(--app-button-foreground);"
                  @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-hover)'}
                  @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-background)'}
                  @click=${(e: Event) => { e.stopPropagation(); this.installLspServer(serverInfo.language_id); }}>
                  Install
                </button>
              </div>
            `;
          })()}
        </div>

        <!-- Right section -->
        <div class="flex items-center gap-3">
          ${this.fileOpen
            ? html`<div class="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer transition-colors font-mono"
                        @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
                        @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
                <span style="color: var(--statusbar-foreground);">Ln ${this.cursorLine}, Col ${this.cursorCol}</span>
              </div>`
            : ''}

          <div class="px-2 py-0.5 rounded cursor-pointer transition-colors"
               @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
               @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
            <span style="color: var(--statusbar-foreground);">${this.spaces} spaces</span>
          </div>
          <div class="px-2 py-0.5 rounded cursor-pointer transition-colors"
               @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
               @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
            <span style="color: var(--statusbar-foreground);">${this.encoding.toUpperCase()}</span>
          </div>
          <div class="px-2 py-0.5 rounded cursor-pointer transition-colors"
               @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--statusbar-hover-background)'}
               @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
            <span style="color: var(--statusbar-foreground);">${this.lineEnding}</span>
          </div>

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
