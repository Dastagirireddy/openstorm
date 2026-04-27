import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';
import { dispatch } from '../lib/events.js';
import { LspService, LspServerInfo, LspInstallProgress } from '../lib/lsp-service.js';
import './icon.js';

@customElement('status-bar')
export class StatusBar extends TailwindElement() {
  // --- Input Props (set by parent) ---
  @property() branch = 'main';
  @property() activePanel: string | null = 'terminal';
  @property() gitPanelVisible = false;
  @property() showTerminalNotification = false;
  @property() showConsoleNotification = false;

  // --- Internal State ---
  @state() private cursorLine = 0;
  @state() private cursorCol = 0;
  @state() private fileOpen = false;
  @state() private lspStatus: LspServerInfo[] = [];
  @state() private activeLanguage: string | null = null;
  @state() private installProgress: LspInstallProgress | null = null;
  @state() private installError: string | null = null;
  @state() private statusMessage: string | null = null;
  @state() private statusMessageType: 'success' | 'error' | 'info' = 'info';

  private readonly _lspService = LspService.getInstance();
  private _eventCleanups: Array<() => void> = [];

  // --- Lifecycle ---

  async connectedCallback() {
    super.connectedCallback();
    this._setupListeners();
    await this._refreshLspStatus();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._eventCleanups.forEach(cleanup => cleanup());
  }

  private _setupListeners() {
    const on = (name: string, cb: (e: any) => void) => {
      document.addEventListener(name, cb);
      this._eventCleanups.push(() => document.removeEventListener(name, cb));
    };

    on('cursor-position', (e) => {
      this.cursorLine = e.detail.line;
      this.cursorCol = e.detail.column;
    });

    on('open-file-external', () => (this.fileOpen = true));
    on('clear-editor', () => {
      this.fileOpen = false;
      this.cursorLine = 0;
      this.cursorCol = 0;
    });

    on('active-language-changed', (e) => {
      this.activeLanguage = e.detail.languageId;
      this._refreshLspStatus();
    });

    on('status-message', (e) => {
      this.statusMessage = e.detail.message;
      this.statusMessageType = e.detail.type || 'info';
      // Auto-clear after 5 seconds
      setTimeout(() => {
        this.statusMessage = null;
        this.requestUpdate();
      }, 5000);
      this.requestUpdate();
    });
  }

  // --- Actions ---

  private async _refreshLspStatus() {
    this.lspStatus = await this._lspService.getStatus();
  }

  private async _installLspServer() {
    if (!this.activeLanguage) return;

    this.installError = null;
    const languageId = this.activeLanguage;

    await this._lspService.installServer(languageId, (progress) => {
      this.installProgress = progress;
    });

    this.installProgress = null;
    await this._refreshLspStatus();

    const server = this.lspStatus.find(s => s.language_id === languageId);
    if (!server?.is_installed) {
      this.installError = 'Installation failed';
    }
  }

  private _onTabClick(tabName: string) {
    dispatch('statusbar-tab-click', { tab: tabName });
  }

  // --- Render Helpers ---

  private _renderTab(icon: string, label: string, isActive: boolean, tabName: string, showNotification?: boolean) {
    return html`
      <div
        @click=${() => this._onTabClick(tabName)}
        class="flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors relative ${
          isActive ? 'bg-[var(--statusbar-hover-background)]' : 'hover:bg-[var(--statusbar-hover-background)]'
        }">
        <os-icon name=${icon} size="12"></os-icon>
        <span>${label}</span>
        ${showNotification && !isActive
          ? html`<span class="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse" style="background-color: var(--app-continue-color);"></span>`
          : nothing}
      </div>
    `;
  }

  private _renderLspIndicator() {
    const server = this.lspStatus.find(s => s.language_id === this.activeLanguage);
    if (!server || !this.activeLanguage) return nothing;

    const isInstalling = this.installProgress !== null;
    const hasError = this.installError !== null;

    if (isInstalling) {
      return html`
        <div class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer transition-colors hover:bg-[var(--statusbar-hover-background)]">
          <os-icon name="clock" size="12" class="animate-spin" color="var(--app-button-background)"></os-icon>
          <span>Downloading ${server.server_name}...</span>
        </div>
      `;
    }

    if (hasError) {
      return html`
        <div class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer transition-colors hover:bg-[var(--statusbar-hover-background)]">
          <os-icon name="circle-dot" size="12" color="var(--app-console-error)"></os-icon>
          <span>${server.server_name}: ${this.installError}</span>
          <button
            class="ml-1 px-2 py-0.5 text-xs rounded transition-colors hover:bg-[var(--app-button-hover)]"
            style="background-color: var(--app-button-background); color: var(--app-button-foreground);"
            @click=${(e: Event) => { e.stopPropagation(); this._installLspServer(); }}>
            Retry
          </button>
          <button
            class="ml-1 px-1.5 py-0.5 text-xs transition-colors hover:text-[var(--app-foreground)]"
            style="color: var(--statusbar-foreground);"
            @click=${(e: Event) => { e.stopPropagation(); (this.installError = null); }}>
            <os-icon name="x" size="12"></os-icon>
          </button>
        </div>
      `;
    }

    return html`
      <div class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer transition-colors hover:bg-[var(--statusbar-hover-background)]">
        <os-icon
          name=${server.is_installed ? 'check' : 'circle-dot'}
          size="12"
          color=${server.is_installed ? 'var(--app-console-success)' : 'var(--app-console-warning)'}>
        </os-icon>
        <span>${server.server_name} ${server.is_installed ? 'ready' : 'not installed'}</span>
        ${!server.is_installed
          ? html`<button
              class="ml-1 px-2 py-0.5 text-xs rounded transition-colors hover:bg-[var(--app-button-hover)]"
              style="background-color: var(--app-button-background); color: var(--app-button-foreground);"
              @click=${(e: Event) => { e.stopPropagation(); this._installLspServer(); }}>
              Install
            </button>`
          : nothing}
      </div>
    `;
  }

  // --- Render ---

  render() {
    const spaces = 4;
    const encoding = 'UTF-8';
    const lineEnding = 'LF';

    return html`
      <footer class="flex h-[28px] items-center justify-between px-3 text-[12px] bg-[var(--statusbar-background)] text-[var(--statusbar-foreground)] border-t border-[var(--statusbar-border)] select-none">

        <!-- Left: Git, Console, Terminal -->
        <div class="flex items-center gap-1">
          ${this._renderTab('git-commit-vertical', 'Git', this.gitPanelVisible, 'git')}
          ${this._renderTab('play-circle', 'Console', this.activePanel === 'app-console', 'app-console', this.showConsoleNotification)}
          ${this._renderTab('terminal', 'Terminal', this.activePanel === 'terminal', 'terminal', this.showTerminalNotification)}
        </div>

        <!-- Right: Status Messages, LSP, Branch, Cursor, Encoding -->
        <div class="flex items-center gap-4">
          ${this.statusMessage
            ? html`
                <div class="flex items-center gap-1.5 px-2 py-0.5 rounded ${
                    this.statusMessageType === 'success' ? 'bg-[var(--git-added)]/20' :
                    this.statusMessageType === 'error' ? 'bg-[var(--git-deleted)]/20' :
                    'bg-[var(--brand-primary)]/20'
                  }">
                  <os-icon name="${
                    this.statusMessageType === 'success' ? 'check' :
                    this.statusMessageType === 'error' ? 'circle-alert' :
                    'info'
                  }" size="12" color="${
                    this.statusMessageType === 'success' ? 'var(--git-added)' :
                    this.statusMessageType === 'error' ? 'var(--git-deleted)' :
                    'var(--brand-primary)'
                  }"></os-icon>
                  <span>${this.statusMessage}</span>
                  <button @click=${() => { this.statusMessage = null; this.requestUpdate(); }}>
                    <os-icon name="x" size="10"></os-icon>
                  </button>
                </div>
              `
            : nothing}
          ${this._renderLspIndicator()}

          <div class="flex items-center gap-1 cursor-pointer hover:bg-[var(--statusbar-hover-background)] px-2 py-0.5 rounded">
            <os-icon name="git-branch" size="12"></os-icon>
            <span>${this.branch}</span>
          </div>

          ${this.fileOpen
            ? html`<div class="font-mono opacity-80 px-2 hover:bg-[var(--statusbar-hover-background)] rounded cursor-pointer">
                Ln ${this.cursorLine}, Col ${this.cursorCol}
              </div>`
            : nothing}

          <div class="flex gap-3 opacity-80">
            <span>${spaces} spaces</span>
            <span>${encoding.toUpperCase()}</span>
            <span>${lineEnding}</span>
          </div>
        </div>
      </footer>
    `;
  }

  // --- Public API (for parent) ---

  setBranch(branch: string) {
    this.branch = branch;
    this.requestUpdate();
  }
}
