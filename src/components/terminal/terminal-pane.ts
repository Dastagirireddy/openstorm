import { html, css, type TemplateResult } from 'lit';
import { customElement, state, query, property } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import type { TerminalTabType } from '../../lib/file-types.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalInstance {
  id: string;
  name: string;
  cwd: string | null;
  terminalId: number | null;
  xterm: Terminal | null;
  fitAddon: FitAddon | null;
  userScrolledUp: boolean;
}

const componentStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: #ffffff;
    position: relative;
  }

  #terminal-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    width: 100%;
    min-height: 0;
    background: #ffffff;
    overflow: hidden;
  }

  #terminal-wrapper {
    flex: 1;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
  }

  .terminal-instance {
    position: absolute;
    top: -16px;
    left: 10px;
    right: 10px;
    bottom: 40px;
    background: #ffffff;
  }

  .terminal-instance[hidden] {
    display: none !important;
  }

  /* Force Xterm internal DOM to fill our provided container exactly */
  .xterm {
    height: 100% !important;
    width: 100% !important;
  }

  .xterm-viewport {
    background-color: #ffffff !important;
    height: 100% !important;
    overflow-y: auto !important;
  }


  .xterm-screen {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
  }

  .xterm-rows {
    background-color: #ffffff !important;
  }

  /* Prevent measurement artifacts from pushing layout */
  .xterm-helpers {
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* Make cursor visible - override default white outline */
  .xterm-cursor {
    background-color: #24292f !important;
  }

  .xterm-cursor.xterm-cursor-outline {
    outline: 2px solid #24292f !important;
    outline-offset: -2px !important;
  }

  /* Cursor blink animation */
  .xterm-rows.xterm-focus .xterm-cursor.xterm-cursor-blink.xterm-cursor-outline {
    animation: blink_box_shadow 1s step-end infinite !important;
  }

  @keyframes blink_box_shadow {
    50% {
      outline-color: transparent !important;
    }
  }

  /* Make text selection visible */
  .xterm .xterm-rows ::selection {
    background-color: #4f46e5 !important;
    color: #ffffff !important;
  }

  .xterm-selection {
    pointer-events: none !important;
  }

  .xterm-selection div {
    background-color: #4f46e5 !important;
  }
`;

@customElement('terminal-pane')
export class TerminalPane extends TailwindElement(componentStyles) {
  @query('#terminal-wrapper') private terminalWrapper!: HTMLElement;

  @state() hasTerminal = false;
  @property({ type: String }) projectPath = '';
  @property({ type: Boolean }) terminalCreated = false;
  
  @state() private terminals: TerminalInstance[] = [];
  @state() private activeTerminalId: string | null = null;
  @state() private contextMenuVisible = false;
  @state() private contextMenuPosition = { x: 0, y: 0 };
  @state() private contextMenuTerminalId: string | null = null;
  @state() private showCloseConfirm = false;
  @state() private terminalToClose: string | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private terminalCounter = 0;
  private globalOutputUnlisten: (() => void) | null = null;
  private hasInitializedTerminal = false;

  connectedCallback(): void {
    super.connectedCallback();
    console.log('[TerminalPane] connectedCallback');

    // Listen for backend PTY output
    listen<{ id: number; data: string }>('terminal-output', (event) => {
      const instance = this.terminals.find(t => t.terminalId === event.payload.id);
      if (instance?.xterm) {
        instance.xterm.write(event.payload.data);
        // Parse OSC 7 escape sequence for working directory
        const osc7Match = event.payload.data.match(/\x1b\]7;file:\/\/[^\s]*\/([^\x1b\r\n]+)(?:\x1b\\\\|\r?\n)?/);
        if (osc7Match) {
          const cwd = osc7Match[1].trim();
          if (cwd && cwd !== instance.cwd) {
            instance.cwd = cwd;
            instance.name = cwd;
            this.requestUpdate();
          }
        }
        requestAnimationFrame(() => {
          if (!instance.userScrolledUp) instance.xterm.scrollToBottom();
        });
      }
    }).then(unlisten => { this.globalOutputUnlisten = unlisten; });

    // Listen for terminal exit events
    listen<{ id: number }>('terminal-exit', (event) => {
      console.log('[TerminalPane] Terminal exited:', event.payload.id);
      const instance = this.terminals.find(t => t.terminalId === event.payload.id);
      if (instance) {
        // Visual feedback - show exit indicator
        instance.xterm?.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n');
      }
    });

    // Listen for terminal error events
    listen<{ id: number; error: string }>('terminal-error', (event) => {
      console.error('[TerminalPane] Terminal error:', event.payload.id, event.payload.error);
      const instance = this.terminals.find(t => t.terminalId === event.payload.id);
      if (instance) {
        instance.xterm?.write(`\r\n\x1b[31m[Error: ${event.payload.error}]\x1b[0m\r\n`);
      }
    });

    // Reset viewport scroll to top after terminal is opened
    setTimeout(() => {
      const viewport = this.terminalWrapper?.querySelector('.xterm-viewport') as HTMLElement;
      if (viewport) {
        viewport.scrollTop = 0;
      }
    }, 100);

    // Handle Window/Pane Resizes
    this.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => this.fitActiveTerminal());
    });

    // Handle right-click context menu
    this.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('click', this.handleDocumentClick);
  }

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const terminal = (e.target as HTMLElement).closest('.terminal-instance') as HTMLElement;
    if (terminal) {
      const instance = this.terminals.find(t => t.id === terminal.id);
      if (instance) {
        this.contextMenuTerminalId = instance.id;
        const rect = this.getBoundingClientRect();
        this.contextMenuPosition = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        this.contextMenuVisible = true;
      }
    }
  };

  private handleDocumentClick = (): void => {
    this.contextMenuVisible = false;
  };

  willUpdate(changedProperties: Map<string, unknown>): void {
    super.willUpdate(changedProperties);
    // Auto-init terminal when the property is set by parent
    if (changedProperties.has('terminalCreated') && this.terminalCreated && !this.hasInitializedTerminal) {
      console.log('[TerminalPane] terminalCreated=true, calling addTerminal');
      this.hasInitializedTerminal = true;
      this.addTerminal();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.terminals.forEach(t => this.disposeTerminal(t));
    this.resizeObserver?.disconnect();
    if (this.globalOutputUnlisten) this.globalOutputUnlisten();
    this.removeEventListener('contextmenu', this.handleContextMenu);
    document.removeEventListener('click', this.handleDocumentClick);
  }

  private fitActiveTerminal() {
    const active = this.terminals.find(t => t.id === this.activeTerminalId);
    const xtermEl = active?.xterm?.element;
    const viewport = xtermEl?.querySelector('.xterm-viewport') as HTMLElement;
    console.log('[TerminalPane] fitActiveTerminal:', {
      hasActive: !!active,
      hasFitAddon: !!active?.fitAddon,
      hasXterm: !!active?.xterm,
      wrapperHeight: this.terminalWrapper?.offsetHeight,
      xtermRows: active?.xterm?.rows,
      xtermCols: active?.xterm?.cols,
      viewportHeight: viewport?.offsetHeight,
      viewportWidth: viewport?.offsetWidth,
      viewportScrollHeight: viewport?.scrollHeight,
      viewportScrollTop: viewport?.scrollTop
    });
    if (active?.fitAddon && active.xterm && this.terminalWrapper?.offsetHeight > 0) {
      active.fitAddon.fit();
      console.log('[TerminalPane] fitAddon.fit() called, rows:', active.xterm.rows);
      if (active.terminalId !== null) {
        invoke('terminal_resize', {
          id: active.terminalId,
          cols: active.xterm.cols,
          rows: active.xterm.rows
        });
      }
    }
  }

  private async addTerminal(): Promise<void> {
    console.log('[TerminalPane] addTerminal called, projectPath:', this.projectPath);
    // 1. Ensure the wrapper is actually in the DOM via Lit render
    if (!this.hasTerminal) {
      this.hasTerminal = true;
      await this.updateComplete;
      console.log('[TerminalPane] hasTerminal set to true, updateComplete awaited');
    }

    // 2. AGGRESSIVE INITIALIZATION GUARD
    // Poll for up to 1 second to ensure the container has non-zero height
    let attempts = 0;
    while ((!this.terminalWrapper || this.terminalWrapper.offsetHeight === 0) && attempts < 50) {
      await new Promise(r => setTimeout(r, 20));
      attempts++;
    }
    console.log('[TerminalPane] wrapper ready after', attempts, 'attempts, height:', this.terminalWrapper?.offsetHeight);

    this.terminalCounter++;
    const id = `terminal-${this.terminalCounter}`;
    // Use the last segment of the project path as the initial name
    const initialName = this.projectPath ? this.projectPath.split('/').pop() || `Terminal ${this.terminalCounter}` : `Terminal ${this.terminalCounter}`;

    // 3. Create Terminal Container
    const terminalDiv = document.createElement('div');
    terminalDiv.id = id;
    terminalDiv.className = 'terminal-instance';
    this.terminalWrapper.appendChild(terminalDiv);
    console.log('[TerminalPane] terminalDiv created and appended:', id);

    // 4. Initialize Xterm
    const xterm = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#ffffff', foreground: '#24292f' },
      convertEol: true,
      scrollback: 10000 // Limit scrollback to 10000 lines to prevent memory growth
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    // 5. Attach and Fit
    xterm.open(terminalDiv);
    console.log('[TerminalPane] xterm.open() called');
    console.log('[TerminalPane] terminalDiv dimensions before fit:', terminalDiv.offsetWidth, 'x', terminalDiv.offsetHeight);

    const instance: TerminalInstance = {
      id,
      name: initialName,
      cwd: null,
      terminalId: null,
      xterm,
      fitAddon,
      userScrolledUp: false
    };

    this.terminals = [...this.terminals, instance];
    this.activeTerminalId = id;
    console.log('[TerminalPane] instance added to state, activeTerminalId:', id);

    // Sync with backend
    xterm.onData(data => {
      if (instance.terminalId !== null) invoke('terminal_write', { id: instance.terminalId, data });
    });

    try {
      instance.terminalId = await invoke<number>('terminal_create', { cwd: this.projectPath || undefined });
      console.log('[TerminalPane] terminal_create succeeded, id:', instance.terminalId);

      // Final layout sync
      requestAnimationFrame(() => {
        this.fitActiveTerminal();
        this.resizeObserver?.observe(this.terminalWrapper);

        // Reset viewport scroll to top after fit completes
        setTimeout(() => {
          const viewport = this.terminalWrapper?.querySelector('.xterm-viewport') as HTMLElement;
          if (viewport) {
            viewport.scrollTop = 0;
            console.log('[TerminalPane] viewport scrollTop reset to 0');
          }
        }, 50);
      });
    } catch (err) {
      console.error('[TerminalPane] PTY Creation failed:', err);
    }
  }

  private switchTerminal(id: string): void {
    this.activeTerminalId = id;
    this.terminals.forEach(t => {
      const div = this.terminalWrapper?.querySelector(`#${t.id}`) as HTMLElement;
      if (div) div.hidden = t.id !== id;
    });
    requestAnimationFrame(() => this.fitActiveTerminal());
  }

  private requestCloseTerminal(id: string): void {
    // Check if terminal has recent activity (heuristic for running process)
    const instance = this.terminals.find(t => t.id === id);
    if (!instance) return;

    // Always show confirmation to prevent accidental closure
    this.terminalToClose = id;
    this.showCloseConfirm = true;
  }

  private async closeTerminal(id: string): Promise<void> {
    const instance = this.terminals.find(t => t.id === id);
    if (!instance) return;

    // Close backend PTY first
    if (instance.terminalId !== null) {
      await invoke('terminal_close', { id: instance.terminalId }).catch(console.error);
    }

    // Remove from DOM and state
    this.disposeTerminal(instance);
    this.terminals = this.terminals.filter(t => t.id !== id);

    // Switch to another terminal if the closed one was active
    if (this.activeTerminalId === id) {
      const remaining = this.terminals.filter(t => t.id !== id);
      this.activeTerminalId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      if (this.activeTerminalId) {
        this.switchTerminal(this.activeTerminalId);
      }
    }
  }

  private disposeTerminal(instance: TerminalInstance): void {
    if (instance.terminalId !== null) invoke('terminal_close', { id: instance.terminalId }).catch(() => {});
    instance.xterm?.dispose();
    this.terminalWrapper?.querySelector(`#${instance.id}`)?.remove();
  }

  private async copySelection(): Promise<void> {
    const instance = this.terminals.find(t => t.id === this.contextMenuTerminalId);
    if (instance?.xterm) {
      const selectedText = instance.xterm.getSelection();
      if (selectedText) {
        await navigator.clipboard.writeText(selectedText);
      }
    }
  }

  private async paste(): Promise<void> {
    const instance = this.terminals.find(t => t.id === this.contextMenuTerminalId);
    if (instance?.xterm && instance.terminalId !== null) {
      const text = await navigator.clipboard.readText();
      await invoke('terminal_write', { id: instance.terminalId, data: text });
    }
  }

  private clearTerminal(): void {
    const instance = this.terminals.find(t => t.id === this.contextMenuTerminalId);
    if (instance?.xterm) {
      instance.xterm.clear();
    }
  }

  private async splitHorizontal(): Promise<void> {
    // Create a new terminal instance sharing the same cwd
    const sourceInstance = this.terminals.find(t => t.id === this.contextMenuTerminalId);
    if (!sourceInstance) return;

    this.terminalCounter++;
    const id = `terminal-${this.terminalCounter}`;
    const cwd = sourceInstance.cwd || this.projectPath || undefined;

    // Create new terminal container
    const terminalDiv = document.createElement('div');
    terminalDiv.id = id;
    terminalDiv.className = 'terminal-instance';
    this.terminalWrapper.appendChild(terminalDiv);

    const xterm = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#ffffff', foreground: '#24292f' },
      convertEol: true
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(terminalDiv);

    const instance: TerminalInstance = {
      id,
      name: sourceInstance.name,
      cwd: sourceInstance.cwd,
      terminalId: null,
      xterm,
      fitAddon,
      userScrolledUp: false
    };

    this.terminals = [...this.terminals, instance];
    this.activeTerminalId = id;

    xterm.onData(data => {
      if (instance.terminalId !== null) invoke('terminal_write', { id: instance.terminalId, data });
    });

    try {
      instance.terminalId = await invoke<number>('terminal_create', { cwd });
      requestAnimationFrame(() => {
        this.fitActiveTerminal();
        this.resizeObserver?.observe(this.terminalWrapper);
      });
    } catch (err) {
      console.error('[TerminalPane] Split terminal creation failed:', err);
    }
  }

  private async splitVertical(): Promise<void> {
    // For now, same as horizontal - layout will be implemented in a follow-up
    await this.splitHorizontal();
  }

  render() {
    return html`
      <div class="flex flex-col h-full w-full bg-white border-t border-[#d0d7de]">
        <div class="flex items-center justify-between h-[36px] px-2 bg-[#f6f8fa] shrink-0">
          <div class="flex items-center gap-1 h-full">
            <span class="text-[12px] font-semibold px-2 text-[#24292f]">TERMINAL</span>
            <div class="flex items-center gap-1 ml-2 h-full">
              ${this.terminals.map(t => html`
                <div class="flex items-center gap-1 px-2 py-1.5 text-[11px] cursor-pointer transition-colors border-b-2
                  ${this.activeTerminalId === t.id
                    ? 'bg-white text-[#24292f] border-indigo-500 font-medium'
                    : 'bg-transparent text-[#57606a] border-transparent hover:bg-[#e5e7eb] hover:border-transparent'}"
                  @click=${() => this.switchTerminal(t.id)}
                >
                  <span>${t.name}</span>
                  <button @click=${(e: MouseEvent) => { e.stopPropagation(); this.requestCloseTerminal(t.id); }}
                    class="ml-1 p-0.5 rounded hover:bg-[rgba(0,0,0,0.1)] opacity-0 hover:opacity-100"
                    title="Close terminal"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              `)}
            </div>
          </div>
          <button @click=${() => this.addTerminal()} class="p-1 hover:bg-[#d0d7de] rounded">＋</button>
        </div>

        <div id="terminal-container">
          <div id="terminal-wrapper"></div>
        </div>

        <!-- Close Confirmation Dialog -->
        ${this.showCloseConfirm ? html`
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center z-50"
            @click=${() => { this.showCloseConfirm = false; this.terminalToClose = null; }}>
            <div class="bg-white rounded-md shadow-2xl w-[380px] border border-[#d0d0d0] overflow-hidden"
              @click=${(e: Event) => e.stopPropagation()}>
              <div class="px-4 py-3 bg-[#f0f0f0] border-b border-[#d0d0d0]">
                <h3 class="text-[13px] font-semibold text-[#1a1a1a]">Close Terminal?</h3>
              </div>
              <div class="px-4 py-3">
                <p class="text-[13px] text-[#24292f] mb-4">
                  This will terminate the running process. Are you sure?
                </p>
                <div class="flex justify-end gap-2">
                  <button @click=${() => { this.showCloseConfirm = false; this.terminalToClose = null; }}
                    class="px-3 py-1.5 text-[13px] bg-[#e5e7eb] text-[#57606a] rounded hover:bg-[#d0d7de]">
                    Cancel
                  </button>
                  <button @click=${async () => {
                    if (this.terminalToClose) await this.closeTerminal(this.terminalToClose);
                    this.showCloseConfirm = false;
                    this.terminalToClose = null;
                  }}
                    class="px-3 py-1.5 text-[13px] bg-[#cf222e] text-white rounded hover:bg-[#a40e22]">
                    Close Terminal
                  </button>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Context Menu -->
        ${this.contextMenuVisible ? html`
          <div class="absolute z-40 bg-white border border-[#d0d7de] rounded-md shadow-lg py-1 min-w-[160px]"
            style="left: ${this.contextMenuPosition.x}px; top: ${this.contextMenuPosition.y}px;"
            @click=${() => { this.contextMenuVisible = false; }}>
            <button @click=${() => this.copySelection()}
              class="w-full px-3 py-1.5 text-left text-[13px] text-[#24292f] hover:bg-[#f6f8fa] flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </button>
            <button @click=${() => this.paste()}
              class="w-full px-3 py-1.5 text-left text-[13px] text-[#24292f] hover:bg-[#f6f8fa] flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
              Paste
            </button>
            <div class="border-t border-[#d0d7de] my-1"></div>
            <button @click=${() => this.clearTerminal()}
              class="w-full px-3 py-1.5 text-left text-[13px] text-[#24292f] hover:bg-[#f6f8fa] flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Clear
            </button>
            <div class="border-t border-[#d0d7de] my-1"></div>
            <button @click=${() => this.splitHorizontal()}
              class="w-full px-3 py-1.5 text-left text-[13px] text-[#24292f] hover:bg-[#f6f8fa] flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <line x1="3" y1="12" x2="21" y2="12"></line>
              </svg>
              Split Down
            </button>
            <button @click=${() => this.splitVertical()}
              class="w-full px-3 py-1.5 text-left text-[13px] text-[#24292f] hover:bg-[#f6f8fa] flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <line x1="12" y1="3" x2="12" y2="21"></line>
              </svg>
              Split Right
            </button>
            <div class="border-t border-[#d0d7de] my-1"></div>
            <button @click=${() => { if (this.contextMenuTerminalId) this.requestCloseTerminal(this.contextMenuTerminalId); }}
              class="w-full px-3 py-1.5 text-left text-[13px] text-[#cf222e] hover:bg-[#ffeef0] flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Close
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }
}