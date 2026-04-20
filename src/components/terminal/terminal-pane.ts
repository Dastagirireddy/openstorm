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

interface ConsoleOutput {
  id: number;
  source: "run" | "debug";
  output_type: "stdout" | "stderr" | "info";
  data: string;
  timestamp: number;
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

  // App Console state
  @state() private activeBottomTab: "terminal" | "app-console" = "terminal";
  @state() private consoleOutputs: ConsoleOutput[] = [];
  @state() private consoleFilter: "all" | "stdout" | "stderr" | "info" = "all";
  @state() private consoleAutoScroll = true;
  @state() private consoleHasNewOutput = false;
  @state() private shouldScrollToBottom = false;
  @state() private consoleSearchQuery = "";
  @state() private consoleSearchVisible = false;

  private consoleOutputCounter = 0;

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

    // Listen for process output (run configurations) - App Console only
    listen<{ process_id: number; output_type: string; data: string; timestamp: number }>('process-output', (event) => {
      const { output_type, data } = event.payload;
      // Only add to App Console (not terminal - keep them separate like IntelliJ)
      this.addConsoleOutput({
        source: 'run',
        output_type: output_type as 'stdout' | 'stderr' | 'info',
        data,
        timestamp: event.payload.timestamp || Date.now(),
      });
    });

    // Listen for process termination
    listen<{ process_id: number }>('process-terminated', (event) => {
      const activeTerminal = this.terminals.find(t => t.terminalId !== null);
      if (activeTerminal?.xterm) {
        activeTerminal.xterm.write('\r\n\x1b[32m[Process exited]\x1b[0m\r\n');
        requestAnimationFrame(() => {
          if (!activeTerminal.userScrolledUp) activeTerminal.xterm.scrollToBottom();
        });
      }
      // Also add to App Console
      this.addConsoleOutput({
        source: 'run',
        output_type: 'info',
        data: '\n[Process exited]\n',
        timestamp: Date.now(),
      });
    });

    // Listen for debug output (DAP) - also add to App Console
    listen<{ category: string; output: string }>('debug-output', (event) => {
      const category = event.payload.category || 'log';
      if (category !== 'telemetry') {
        this.addConsoleOutput({
          source: 'debug',
          output_type: category === 'stderr' ? 'stderr' : category === 'stdout' ? 'stdout' : 'info',
          data: event.payload.output,
          timestamp: Date.now(),
        });
      }
    });

    // Reset viewport scroll to top after terminal is opened
    setTimeout(() => {
      const viewport = this.terminalWrapper?.querySelector('.xterm-viewport') as HTMLElement;
      if (viewport) {
        viewport.scrollTop = 0;
      }
    }, 100);

    // Handle Window/Pane Resizes - debounce to avoid infinite loop
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    this.resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.fitActiveTerminal();
      }, 50);
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
    // Scroll after render if flagged
    if (this.shouldScrollToBottom && this.activeBottomTab === 'app-console') {
      this.shouldScrollToBottom = false;
      requestAnimationFrame(() => {
        const container = this.renderRoot.querySelector('.console-output');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
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

  private switchToTerminalTab(): void {
    this.activeBottomTab = 'terminal';
    this.consoleHasNewOutput = false;
    // Fit terminal when switching to terminal tab (after DOM becomes visible)
    setTimeout(() => {
      this.fitActiveTerminal();
    }, 50);
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

  private addConsoleOutput(output: Omit<ConsoleOutput, 'id'>): void {
    this.consoleOutputCounter++;
    this.consoleOutputs = [
      ...this.consoleOutputs,
      {
        ...output,
        id: this.consoleOutputCounter,
      },
    ];

    // Limit output lines to prevent memory issues
    if (this.consoleOutputs.length > 1000) {
      this.consoleOutputs = this.consoleOutputs.slice(-500);
    }

    // Mark that there's new output for notification purposes
    this.consoleHasNewOutput = true;

    // Notify status bar about new output
    document.dispatchEvent(
      new CustomEvent('app-console-output', {
        bubbles: true,
        composed: true,
      }),
    );

    // Auto-scroll if enabled - flag it for willUpdate to handle after render
    if (this.consoleAutoScroll) {
      this.shouldScrollToBottom = true;
    }
  }

  private clearConsole(): void {
    this.consoleOutputs = [];
    this.consoleHasNewOutput = false;
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

  private getFilteredOutputs(): ConsoleOutput[] {
    let outputs = this.consoleOutputs;

    // Filter by type
    if (this.consoleFilter !== 'all') {
      outputs = outputs.filter(o => o.output_type === this.consoleFilter);
    }

    // Filter by search query
    if (this.consoleSearchQuery) {
      outputs = outputs.filter(o =>
        o.data.toLowerCase().includes(this.consoleSearchQuery.toLowerCase())
      );
    }

    return outputs;
  }

  private highlightSearch(text: string): ReturnType<typeof html> {
    if (!this.consoleSearchQuery) return html`${text}`;

    const regex = new RegExp(`(${this.escapeRegex(this.consoleSearchQuery)})`, 'gi');
    const parts = text.split(regex);

    return html`${parts.map(part =>
      part.toLowerCase() === this.consoleSearchQuery.toLowerCase()
        ? html`<mark class="bg-yellow-200 text-black rounded px-0.5">${part}</mark>`
        : part
    )}`;
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  render() {
    const filteredOutputs = this.getFilteredOutputs();

    return html`
      <div class="flex flex-col h-full w-full bg-white border-t border-[#d0d7de]">
        <!-- Unified tab bar: Terminal instances + App Console -->
        <div class="flex items-center justify-between h-[36px] px-2 bg-[#f6f8fa] shrink-0 border-b border-[#d0d7de]">
          <div class="flex items-center gap-0.5 h-full">
            <!-- Terminal instance tabs -->
            ${this.terminals.map(t => html`
              <div class="flex items-center gap-1 px-2 py-1.5 text-[11px] cursor-pointer transition-colors border-b-2
                ${this.activeTerminalId === t.id && this.activeBottomTab === 'terminal'
                  ? 'bg-white text-[#24292f] border-indigo-500 font-medium'
                  : 'bg-transparent text-[#57606a] border-transparent hover:bg-[#e5e7eb] hover:border-transparent'}"
                @click=${() => { this.switchToTerminalTab(); this.switchTerminal(t.id); }}>
                <span>${t.name}</span>
                <button @click=${(e: MouseEvent) => { e.stopPropagation(); this.requestCloseTerminal(t.id); }}
                  class="ml-1 p-0.5 rounded hover:bg-[rgba(0,0,0,0.1)] opacity-0 hover:opacity-100"
                  title="Close terminal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            `)}
            <!-- App Console tab -->
            <button
              class="px-2 py-1.5 text-[11px] cursor-pointer transition-colors border-b-2 relative ${this.activeBottomTab === 'app-console' ? 'bg-white text-[#24292f] border-indigo-500 font-medium' : 'bg-transparent text-[#57606a] border-transparent hover:bg-[#e5e7eb]'}"
              @click=${() => { this.activeBottomTab = 'app-console'; this.consoleHasNewOutput = false; }}>
              App Console
              ${this.consoleHasNewOutput && this.activeBottomTab !== 'app-console'
                ? html`<span class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>`
                : ''}
            </button>
          </div>
          ${this.activeBottomTab === 'terminal'
            ? html`<button @click=${() => this.addTerminal()} class="p-1 hover:bg-[#d0d7de] rounded" title="New terminal">＋</button>`
            : ''}
        </div>

        <!-- Content area (both panels stay in DOM, just toggle visibility) -->
        <div class="flex-1 min-h-0 relative w-full h-full overflow-hidden">
          <!-- Terminal panel -->
          <div id="terminal-container" class="absolute inset-0 w-full h-full ${this.activeBottomTab !== 'terminal' ? 'hidden' : ''}">
            <div id="terminal-wrapper" class="absolute inset-0 w-full h-full"></div>
          </div>

          <!-- App Console panel -->
          <div class="absolute inset-0 w-full h-full flex flex-col ${this.activeBottomTab === 'terminal' ? 'hidden' : ''}">
            <!-- Console toolbar -->
            <div class="flex items-center gap-1 px-2 py-1 bg-[#fafbfc] border-b border-[#d0d7de]">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-[#57606a] mr-1">Filter:</span>
              <button
                class="px-2 py-0.5 text-[11px] border border-[#d0d7de] rounded bg-transparent text-[#57606a] cursor-pointer transition-all hover:bg-[#e5e7eb] hover:border-[#b0b0b0] ${this.consoleFilter === 'all' ? 'bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200' : ''}"
                @click=${() => { this.consoleFilter = 'all'; this.requestUpdate(); }}>
                All
              </button>
              <button
                class="px-2 py-0.5 text-[11px] border border-[#d0d7de] rounded bg-transparent text-[#57606a] cursor-pointer transition-all hover:bg-[#e5e7eb] hover:border-[#b0b0b0] ${this.consoleFilter === 'stdout' ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' : ''}"
                @click=${() => { this.consoleFilter = 'stdout'; this.requestUpdate(); }}>
                Stdout
              </button>
              <button
                class="px-2 py-0.5 text-[11px] border border-[#d0d7de] rounded bg-transparent text-[#57606a] cursor-pointer transition-all hover:bg-[#e5e7eb] hover:border-[#b0b0b0] ${this.consoleFilter === 'stderr' ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200' : ''}"
                @click=${() => { this.consoleFilter = 'stderr'; this.requestUpdate(); }}>
                Stderr
              </button>
              <button
                class="px-2 py-0.5 text-[11px] border border-[#d0d7de] rounded bg-transparent text-[#57606a] cursor-pointer transition-all hover:bg-[#e5e7eb] hover:border-[#b0b0b0] ${this.consoleFilter === 'info' ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' : ''}"
                @click=${() => { this.consoleFilter = 'info'; this.requestUpdate(); }}>
                Info
              </button>
              <div class="w-px h-4 bg-[#d0d7de] mx-1"></div>
              <button
                class="px-2 py-0.5 text-[11px] border-none rounded bg-transparent text-[#57606a] cursor-pointer transition-colors hover:bg-[#e5e7eb] hover:text-indigo-600 ${this.consoleSearchVisible ? 'text-indigo-600 bg-indigo-50' : ''}"
                @click=${() => { this.consoleSearchVisible = !this.consoleSearchVisible; this.requestUpdate(); }}
                title="Search (Ctrl+F)">
                <iconify-icon icon="mdi:magnify" width="14"></iconify-icon>
              </button>
              <button
                class="px-2 py-0.5 text-[11px] border-none rounded bg-transparent text-[#57606a] cursor-pointer transition-colors hover:bg-[#e5e7eb] hover:text-indigo-600 ${this.consoleAutoScroll ? 'text-indigo-600 bg-indigo-50' : ''}"
                @click=${() => { this.consoleAutoScroll = !this.consoleAutoScroll; this.requestUpdate(); }}
                title="Toggle auto-scroll">
                <iconify-icon icon="${this.consoleAutoScroll ? 'mdi:arrow-down-bold' : 'mdi:arrow-down-bold-outline'}" width="14"></iconify-icon>
              </button>
              <button
                class="px-2 py-0.5 text-[11px] border-none rounded bg-transparent text-[#57606a] cursor-pointer transition-colors hover:bg-red-50 hover:text-red-600"
                @click=${() => this.clearConsole()}
                title="Clear console">
                <iconify-icon icon="mdi:delete-outline" width="14"></iconify-icon>
              </button>
            </div>

            <!-- Search bar -->
            ${this.consoleSearchVisible ? html`
              <div class="flex items-center gap-1 px-2 py-1 bg-white border-b border-[#d0d7de]">
                <iconify-icon icon="mdi:magnify" width="14" class="text-[#57606a]"></iconify-icon>
                <input
                  type="text"
                  class="flex-1 px-1 py-0.5 text-[11px] border-none bg-transparent outline-none text-[#24292f]"
                  placeholder="Search console output..."
                  .value=${this.consoleSearchQuery}
                  @input=${(e: Event) => { this.consoleSearchQuery = (e.target as HTMLInputElement).value; this.requestUpdate(); }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Escape') {
                      this.consoleSearchVisible = false;
                      this.consoleSearchQuery = '';
                      this.requestUpdate();
                    }
                  }}
                />
                ${this.consoleSearchQuery ? html`
                  <button
                    class="p-0.5 rounded hover:bg-[#e5e7eb]"
                    @click=${() => { this.consoleSearchQuery = ''; this.requestUpdate(); }}
                    title="Clear search">
                    <iconify-icon icon="mdi:close" width="12"></iconify-icon>
                  </button>
                ` : ''}
              </div>
            ` : ''}

            <!-- Console output -->
            <div
              class="console-output font-mono text-xs flex-1 overflow-auto bg-white"
              style="height: calc(100% - 40px);">
              ${filteredOutputs.length === 0
                ? html`
                    <div class="flex flex-col items-center justify-center h-full text-[#57606a] gap-2">
                      <iconify-icon class="text-3xl opacity-50" icon="mdi:console-outline"></iconify-icon>
                      <span class="text-xs">No output</span>
                    </div>
                  `
                : filteredOutputs.map((output) => {
                    const bgClass = output.output_type === 'stderr' ? 'bg-red-50' : output.output_type === 'info' ? 'bg-blue-50' : '';
                    const textClass = output.output_type === 'stderr' ? 'text-red-700' : output.output_type === 'stdout' ? 'text-green-700' : output.output_type === 'info' ? 'text-blue-700' : 'text-gray-900';
                    const prefix = output.output_type === 'stdout' ? '▶' : output.output_type === 'stderr' ? '✖' : '●';

                    return html`
                      <div class="px-3 py-0.5 border-b border-[#f0f0f0] whitespace-pre-wrap break-words flex items-start gap-2 ${bgClass} ${textClass}">
                        <span class="text-[#9ca3af] font-bold flex-shrink-0 select-none">${prefix}</span>
                        <span class="flex-1">${this.highlightSearch(output.data)}</span>
                      </div>
                    `;
                  })}
            </div>
          </div>
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