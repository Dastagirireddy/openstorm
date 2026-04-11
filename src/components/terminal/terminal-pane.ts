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
    top: 0;
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
    background-color: #0969da !important;
    color: #ffffff !important;
  }

  .xterm-selection {
    pointer-events: none !important;
  }

  .xterm-selection div {
    background-color: #0969da !important;
    mix-blend-mode: multiply !important;
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
        // Scroll after content is rendered
        requestAnimationFrame(() => {
          if (!instance.userScrolledUp) instance.xterm.scrollToBottom();
        });
      }
    }).then(unlisten => { this.globalOutputUnlisten = unlisten; });

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
  }

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
      convertEol: true
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    // 5. Attach and Fit
    xterm.open(terminalDiv);
    console.log('[TerminalPane] xterm.open() called');
    console.log('[TerminalPane] terminalDiv dimensions before fit:', terminalDiv.offsetWidth, 'x', terminalDiv.offsetHeight);

    const instance: TerminalInstance = {
      id,
      name: `Terminal ${this.terminalCounter}`,
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

  private disposeTerminal(instance: TerminalInstance): void {
    if (instance.terminalId !== null) invoke('terminal_close', { id: instance.terminalId }).catch(() => {});
    instance.xterm?.dispose();
    this.terminalWrapper?.querySelector(`#${instance.id}`)?.remove();
  }

  render() {
    return html`
      <div class="flex flex-col h-full w-full bg-white border-t border-[#d0d7de]">
        <div class="flex items-center justify-between h-[36px] px-2 bg-[#f6f8fa] shrink-0">
          <div class="flex items-center gap-1 h-full">
            <span class="text-[12px] font-semibold px-2 text-[#24292f]">TERMINAL</span>
            <div class="flex items-center gap-1 ml-2 h-full">
              ${this.terminals.map(t => html`
                <div @click=${() => this.switchTerminal(t.id)}
                  class="px-3 py-1 text-[11px] rounded cursor-pointer transition-colors
                  ${this.activeTerminalId === t.id ? 'bg-[#0969da] text-white' : 'bg-[#e5e7eb] text-[#57606a] hover:bg-[#d0d7de]'}"
                >${t.name}</div>
              `)}
            </div>
          </div>
          <button @click=${() => this.addTerminal()} class="p-1 hover:bg-[#d0d7de] rounded">＋</button>
        </div>

        <div id="terminal-container">
          <div id="terminal-wrapper" ?hidden=${!this.hasTerminal}></div>
          ${!this.hasTerminal ? html`
            <div class="flex h-full items-center justify-center">
              <button class="bg-[#2da44e] text-white px-4 py-1.5 rounded text-sm font-medium shadow-sm hover:bg-[#2c974b]" 
                @click=${() => this.addTerminal()}>Open Terminal</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}