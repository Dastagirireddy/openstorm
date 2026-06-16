/**
 * Unified Console Panel
 * Single console for all output: run, debug, app logs + expression evaluation
 * IntelliJ-inspired: status bar, restart, clickable stack traces, output folding
 */

import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../../tailwind-element.js';
import { listen } from '@tauri-apps/api/event';
import { eventLog } from '../../services/event-log.js';
import { dispatch } from '../../lib/types/events.js';

export interface ConsoleOutput {
  id: number;
  source: 'run' | 'debug' | 'app' | 'console';
  output_type: 'stdout' | 'stderr' | 'info' | 'log' | 'warning';
  data: string;
  timestamp: number;
}

interface OutputGroup {
  type: 'line' | 'group';
  output?: ConsoleOutput;
  lines?: ConsoleOutput[];
  count: number;
  collapsed: boolean;
}

@customElement('app-console-panel')
export class AppConsolePanel extends TailwindElement() {
  @state() outputs: ConsoleOutput[] = [];
  @state() filter: string = 'all';
  @state() autoScroll = true;
  @state() searchVisible = false;
  @state() searchQuery = '';
  @state() wrapEnabled = false;
  @state() hasNewOutput = false;
  @state() isDebugging = false;
  @state() debugSessionState: 'running' | 'stopped' | 'terminated' = 'terminated';
  @state() processStatus: 'idle' | 'running' | 'exited' = 'idle';
  @state() processExitCode: number | null = null;
  @state() configName = '';
  @state() groupRepeated = true;

  private outputCounter = 0;
  private _seenLogEntries = new Set<string>();
  private consoleHistory: string[] = [];
  private consoleHistoryIndex = -1;
  private _onDebugOutput!: (e: Event) => void;

  connectedCallback(): void {
    super.connectedCallback();

    // Debug state tracking
    document.addEventListener('debug-state-changed', (e: any) => {
      this.isDebugging = e.detail.isDebugging;
      this.debugSessionState = e.detail.debugState || 'running';
      this.requestUpdate();
    });

    // Process status
    listen<{ process_id: number; config_name?: string }>('process-started', (event) => {
      this.processStatus = 'running';
      this.processExitCode = null;
      this.configName = event.payload.config_name || '';
      this.addOutput({
        source: 'run', output_type: 'info',
        data: `[${this.configName || 'Process'}] started`,
        timestamp: Date.now(),
      });
    });

    listen<{ process_id: number }>('process-terminated', (event: any) => {
      this.processStatus = 'exited';
      this.processExitCode = event.payload?.exit_code ?? null;
      const msg = this.processExitCode !== null
        ? `[Process exited with code ${this.processExitCode}]`
        : '[Process exited]';
      this.addOutput({ source: 'run', output_type: 'info', data: msg, timestamp: Date.now() });
    });

    // Debug session lifecycle
    listen('debug-initialized', () => {
      this.isDebugging = true;
      this.debugSessionState = 'running';
      this.processStatus = 'running';
      this.processExitCode = null;
    });

    listen<{ reason?: string }>('debug-stopped', (event) => {
      this.debugSessionState = 'stopped';
      this.processStatus = 'running';
    });

    listen('debug-continued', () => {
      this.debugSessionState = 'running';
      this.processStatus = 'running';
    });

    listen('debug-terminated', () => {
      this.isDebugging = false;
      this.debugSessionState = 'terminated';
      this.processStatus = 'exited';
    });

    listen<{ exitCode?: number }>('debug-exited', (event) => {
      this.isDebugging = false;
      this.debugSessionState = 'terminated';
      this.processStatus = 'exited';
      this.processExitCode = event.payload?.exitCode ?? null;
    });

    listen('debug-session-ended', () => {
      this.isDebugging = false;
      this.debugSessionState = 'terminated';
      this.processStatus = 'exited';
    });

    // Process output (run configurations)
    listen<{ process_id: number; output_type: string; data: string; timestamp: number }>('process-output', (event) => {
      const { output_type, data } = event.payload;
      this.addOutput({
        source: 'run',
        output_type: output_type as 'stdout' | 'stderr',
        data,
        timestamp: event.payload.timestamp || Date.now(),
      });
    });

    // Debug output (DAP) — received as DOM events from main.ts (with buffer replay)
    this._onDebugOutput = (e: Event) => {
      const payload = (e as CustomEvent).detail;
      const category = payload.category || 'log';
      if (category === 'telemetry') return;
      this.addOutput({
        source: 'debug',
        output_type: category as 'stdout' | 'stderr' | 'log',
        data: payload.output,
        timestamp: Date.now(),
      });
    };
    document.addEventListener('debug-output', this._onDebugOutput);

    // Request buffer flush from main.ts
    document.dispatchEvent(new CustomEvent('console-flush'));

    // Backend application logs
    listen<{ level: string; message: string; timestamp: number }>('app-log', (event) => {
      const { level, message, timestamp } = event.payload;
      this.addOutput({
        source: 'app',
        output_type: level === 'error' ? 'stderr' : level === 'warn' ? 'info' : 'log',
        data: message,
        timestamp: timestamp || Date.now(),
      });
    });

    // Frontend event log
    eventLog.subscribe((entries) => {
      const newEntries = entries.filter(e => !this._seenLogEntries.has(e.id));
      for (const entry of newEntries) {
        this._seenLogEntries.add(entry.id);
        const prefix = entry.source ? `[${entry.source}] ` : '';
        this.addOutput({
          source: 'app',
          output_type: entry.type === 'error' ? 'stderr' : 'info',
          data: `${prefix}${entry.text}`,
          timestamp: Date.now(),
        });
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', this._handleGlobalKeydown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleGlobalKeydown);
    document.removeEventListener('debug-output', this._onDebugOutput);
    document.dispatchEvent(new CustomEvent('console-unsubscribed'));
  }

  private _handleGlobalKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      this.searchVisible = !this.searchVisible;
      if (!this.searchVisible) this.searchQuery = '';
      this.requestUpdate();
    }
    if (e.key === 'Escape' && this.searchVisible) {
      this.searchVisible = false;
      this.searchQuery = '';
      this.requestUpdate();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      this.clear();
    }
  };

  private addOutput(output: Omit<ConsoleOutput, 'id'>): void {
    // Skip empty lines — they cause visual double-spacing
    if (!output.data || !output.data.trim()) return;

    this.outputCounter++;
    this.outputs = [...this.outputs, { ...output, id: this.outputCounter }];

    if (this.outputs.length > 2000) {
      this.outputs = this.outputs.slice(-1000);
    }

    this.hasNewOutput = true;
    document.dispatchEvent(new CustomEvent('app-console-output', { bubbles: true, composed: true }));

    if (this.autoScroll) {
      requestAnimationFrame(() => {
        const el = this.renderRoot.querySelector('.console-output');
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }

  clear(): void {
    this.outputs = [];
    this.outputCounter = 0;
    this.hasNewOutput = false;
    this.requestUpdate();
  }

  // --- Restart ---
  private handleRestart = () => {
    dispatch('restart-debug');
  };

  // --- Output grouping ---
  private buildGroups(outputs: ConsoleOutput[]): OutputGroup[] {
    if (!this.groupRepeated) {
      return outputs.map(o => ({ type: 'line' as const, output: o, count: 1, collapsed: false }));
    }

    const groups: OutputGroup[] = [];
    let i = 0;
    while (i < outputs.length) {
      const current = outputs[i];
      let runCount = 1;
      while (
        i + runCount < outputs.length &&
        outputs[i + runCount].data === current.data &&
        outputs[i + runCount].output_type === current.output_type &&
        outputs[i + runCount].source === current.source
      ) {
        runCount++;
      }
      if (runCount >= 3) {
        groups.push({ type: 'group', output: current, count: runCount, collapsed: true, lines: outputs.slice(i, i + runCount) });
      } else {
        for (let j = 0; j < runCount; j++) {
          groups.push({ type: 'line', output: outputs[i + j], count: 1, collapsed: false });
        }
      }
      i += runCount;
    }
    return groups;
  }

  private toggleGroup(group: OutputGroup) {
    group.collapsed = !group.collapsed;
    this.requestUpdate();
  }

  // --- Stack trace link parsing ---
  private parseLineWithLinks(text: string, projectPath?: string): ReturnType<typeof html> {
    // Match file:line or file:line:col patterns
    const regex = /((?:\/[^\s:]+|[A-Za-z]:\\[^\s:]+|[./][^\s:]+)):(\d+)(?::(\d+))?/g;
    const parts: ReturnType<typeof html>[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const filePath = match[1];
      const line = parseInt(match[2], 10);
      const col = match[3] ? parseInt(match[3], 10) : 1;

      // Only link if it looks like a real file path (has extension)
      if (/\.\w{1,10}$/.test(filePath) && !filePath.startsWith('http')) {
        // Text before the match
        if (match.index > lastIndex) {
          parts.push(html`${text.slice(lastIndex, match.index)}`);
        }
        // Clickable link
        const displayPath = filePath.length > 40 ? '...' + filePath.slice(-37) : filePath;
        parts.push(html`<span class="file-link" data-path="${filePath}" data-line="${line}" data-col="${col}"
          @click=${this.handleFileLinkClick}
          title="${filePath}:${line}:${col}">${displayPath}:${line}${match[3] ? ':' + match[3] : ''}</span>`);
        lastIndex = match.index + match[0].length;
      }
    }

    if (lastIndex === 0) return html`${text}`;
    if (lastIndex < text.length) parts.push(html`${text.slice(lastIndex)}`);
    return html`${parts}`;
  }

  private handleFileLinkClick = (e: Event) => {
    const el = (e.target as HTMLElement).closest('.file-link') as HTMLElement;
    if (!el) return;
    const filePath = el.dataset.path;
    const line = parseInt(el.dataset.line || '1', 10);
    const col = parseInt(el.dataset.col || '1', 10);
    if (!filePath) return;

    const absPath = filePath.startsWith('/') ? filePath : filePath;
    dispatch('go-to-location', {
      uri: absPath.startsWith('file://') ? absPath : `file://${absPath}`,
      line: line - 1,
      column: col - 1,
    });
  };

  // --- Expression evaluation ---
  private navigateHistory(direction: number) {
    if (this.consoleHistory.length === 0) return;
    const newIndex = this.consoleHistoryIndex + direction;
    if (newIndex < 0 || newIndex >= this.consoleHistory.length) return;
    this.consoleHistoryIndex = newIndex;
    const input = this.renderRoot.querySelector('#console-input') as HTMLInputElement;
    if (input) input.value = this.consoleHistory[newIndex];
  }

  private async evaluateExpression() {
    const input = this.renderRoot.querySelector('#console-input') as HTMLInputElement;
    if (!input || !input.value.trim()) return;
    const expression = input.value.trim();
    input.value = '';
    this.consoleHistory.push(expression);
    this.consoleHistoryIndex = this.consoleHistory.length;
    this.addOutput({ source: 'console', output_type: 'log', data: `> ${expression}`, timestamp: Date.now() });
    try {
      const result = await invoke<any>('evaluate_expression', { expression, frameId: 0 });
      this.addOutput({ source: 'console', output_type: 'log', data: result.value || String(result), timestamp: Date.now() });
    } catch (error) {
      this.addOutput({ source: 'console', output_type: 'stderr', data: `Error: ${error}`, timestamp: Date.now() });
    }
  }

  private handleInputKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') this.evaluateExpression();
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.navigateHistory(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.navigateHistory(1); }
  };

  // --- Filtering ---
  private getFilteredOutputs(): ConsoleOutput[] {
    let outputs = this.outputs;
    if (this.filter !== 'all') {
      outputs = outputs.filter(o => o.output_type === this.filter || o.source === this.filter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      outputs = outputs.filter(o => o.data.toLowerCase().includes(q));
    }
    return outputs;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private highlightSearch(text: string): ReturnType<typeof html> {
    if (!this.searchQuery) return this.parseLineWithLinks(text);
    const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
    const parts = text.split(regex);
    return html`${parts.map(part =>
      part.toLowerCase() === this.searchQuery.toLowerCase()
        ? html`<mark class="bg-yellow-200 text-black rounded px-0.5">${part}</mark>`
        : this.parseLineWithLinks(part)
    )}`;
  }

  private formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
  }

  // --- Status bar ---
  private getStatusLabel(): string {
    if (this.processStatus === 'idle') return 'Ready';
    if (this.processStatus === 'exited') {
      const code = this.processExitCode;
      return code !== null ? `Exited with code ${code}` : 'Exited';
    }
    if (this.isDebugging) {
      return this.debugSessionState === 'stopped' ? 'Paused' : 'Debugging';
    }
    return 'Running';
  }

  private getStatusColor(): string {
    if (this.processStatus === 'idle') return 'var(--app-disabled-foreground)';
    if (this.processStatus === 'exited') {
      return (this.processExitCode !== null && this.processExitCode !== 0) ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)';
    }
    if (this.debugSessionState === 'stopped') return 'var(--warning, #f59e0b)';
    return 'var(--success, #22c55e)';
  }

  private getStatusIcon(): string {
    if (this.processStatus === 'idle') return 'mdi:circle-outline';
    if (this.processStatus === 'exited') return (this.processExitCode !== null && this.processExitCode !== 0) ? 'mdi:alert-circle' : 'mdi:check-circle';
    if (this.debugSessionState === 'stopped') return 'mdi:pause-circle';
    return 'mdi:loading';
  }

  render() {
    const filtered = this.getFilteredOutputs();
    const groups = this.buildGroups(filtered);
    const statusLabel = this.getStatusLabel();
    const statusColor = this.getStatusColor();

    return html`
      <div class="flex flex-col h-full w-full" style="background-color: var(--app-bg);">
        <!-- Status bar -->
        <div class="flex items-center gap-2 px-3 py-1 border-b text-[11px]"
          style="background-color: var(--app-surface, var(--app-bg)); border-color: var(--app-border);">
          <iconify-icon icon="${this.getStatusIcon()}" width="12" style="color: ${statusColor};"></iconify-icon>
          <span style="color: ${statusColor}; font-weight: 500;">${statusLabel}</span>
          ${this.configName ? html`<span style="color: var(--app-disabled-foreground);">·</span>
            <span style="color: var(--app-disabled-foreground);">${this.configName}</span>` : ''}
          <div class="flex-1"></div>
          <span style="color: var(--app-disabled-foreground);">${this.outputs.length} lines</span>
        </div>

        <!-- Toolbar -->
        <div class="flex items-center gap-1 px-2 py-1 border-b" style="background-color: var(--app-bg); border-color: var(--app-border);">
          <span class="text-[10px] font-semibold uppercase tracking-wide mr-1" style="color: var(--app-disabled-foreground);">Filter:</span>
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.filter === 'all' ? '!bg-[var(--brand-primary)]/10 !text-[var(--brand-primary)] !border-[var(--brand-primary)]/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.filter = 'all'; this.requestUpdate(); }}>All</button>
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.filter === 'stdout' ? '!bg-green-500/10 !text-green-600 !border-green-500/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.filter = 'stdout'; this.requestUpdate(); }}>Stdout</button>
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.filter === 'stderr' ? '!bg-red-500/10 !text-red-600 !border-red-500/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.filter = 'stderr'; this.requestUpdate(); }}>Stderr</button>
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.filter === 'log' ? '!bg-blue-500/10 !text-blue-600 !border-blue-500/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.filter = 'log'; this.requestUpdate(); }}>Log</button>
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border rounded bg-transparent cursor-pointer transition-all hover:bg-[var(--app-toolbar-hover)] ${this.filter === 'info' ? '!bg-purple-500/10 !text-purple-600 !border-purple-500/30' : ''}"
            style="border-color: var(--app-border); color: var(--app-disabled-foreground);"
            @click=${() => { this.filter = 'info'; this.requestUpdate(); }}>Info</button>
          <div class="w-px h-4 mx-1" style="background-color: var(--app-border);"></div>
          <!-- Restart button (visible when debugging) -->
          ${(this.isDebugging || this.processStatus === 'running') ? html`
            <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)]"
              style="color: var(--success, #22c55e);"
              @click=${this.handleRestart}
              title="Restart (Ctrl+Shift+F5)">
              <iconify-icon icon="mdi:restart" width="14"></iconify-icon>
            </button>
          ` : ''}
          <!-- Fold repeated lines toggle -->
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)] ${this.groupRepeated ? 'text-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : ''}"
            style="color: var(--app-disabled-foreground);"
            @click=${() => { this.groupRepeated = !this.groupRepeated; this.requestUpdate(); }}
            title="Fold repeated lines">
            <iconify-icon icon="mdi:format-list-group" width="14"></iconify-icon>
          </button>
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)] ${this.searchVisible ? 'text-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : ''}"
            style="color: var(--app-disabled-foreground);"
            @click=${() => { this.searchVisible = !this.searchVisible; if (!this.searchVisible) this.searchQuery = ''; this.requestUpdate(); }}
            title="Search (Ctrl+F)">
            <iconify-icon icon="mdi:magnify" width="14"></iconify-icon>
          </button>
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)] ${this.autoScroll ? 'text-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : ''}"
            style="color: var(--app-disabled-foreground);"
            @click=${() => { this.autoScroll = !this.autoScroll; this.requestUpdate(); }}
            title="Auto-scroll">
            <iconify-icon icon="${this.autoScroll ? 'mdi:arrow-down-bold' : 'mdi:arrow-down-bold-outline'}" width="14"></iconify-icon>
          </button>
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)] ${this.wrapEnabled ? 'text-[var(--brand-primary)] bg-[var(--brand-primary)]/10' : ''}"
            style="color: var(--app-disabled-foreground);"
            @click=${() => { this.wrapEnabled = !this.wrapEnabled; this.requestUpdate(); }}
            title="Word wrap">
            <iconify-icon icon="mdi:wrap-text" width="14"></iconify-icon>
          </button>
          <button class="flex items-center justify-center px-2 py-0.5 text-[11px] border-none rounded bg-transparent cursor-pointer transition-colors hover:bg-[var(--app-toolbar-hover)]"
            style="color: var(--app-disabled-foreground);"
            @click=${() => this.clear()}
            title="Clear (Ctrl+L)">
            <iconify-icon icon="mdi:delete-outline" width="14"></iconify-icon>
          </button>
        </div>

        <!-- Search bar -->
        ${this.searchVisible ? html`
          <div class="flex items-center gap-1 px-2 py-1 border-b" style="background-color: var(--app-bg); border-color: var(--app-border);">
            <iconify-icon icon="mdi:magnify" width="14" style="color: var(--app-disabled-foreground);"></iconify-icon>
            <input type="text"
              class="flex-1 px-1 py-0.5 text-[11px] border-none bg-transparent outline-none focus:ring-1 focus:ring-[var(--brand-primary)] rounded"
              style="color: var(--app-foreground);"
              placeholder="Search..."
              .value=${this.searchQuery}
              @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value; this.requestUpdate(); }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') { this.searchVisible = false; this.searchQuery = ''; this.requestUpdate(); } }} />
            ${this.searchQuery ? html`
              <span class="text-[10px] px-1" style="color: var(--app-disabled-foreground);">${this.getFilteredOutputs().length} matches</span>
              <button class="p-0.5 rounded hover:bg-[var(--app-toolbar-hover)]" @click=${() => { this.searchQuery = ''; this.requestUpdate(); }}>
                <iconify-icon icon="mdi:close" width="12"></iconify-icon>
              </button>
            ` : ''}
          </div>
        ` : ''}

        <!-- Console output -->
        <div class="console-output font-mono text-xs flex-1 overflow-auto"
          style="background-color: var(--app-bg);">
          ${filtered.length === 0
            ? html`
                <div class="flex flex-col items-center justify-center min-h-[80px] gap-2">
                  <iconify-icon class="text-3xl opacity-30" icon="mdi:console-outline" style="color: var(--app-disabled-foreground);"></iconify-icon>
                  <span class="text-[11px]" style="color: var(--app-disabled-foreground);">No output${this.searchQuery ? ' matching search' : ''}</span>
                </div>
              `
            : groups.map((group) => {
                if (group.type === 'group' && group.collapsed) {
                  return html`
                    <div class="px-3 py-0.5 flex items-center gap-2 cursor-pointer hover:bg-[var(--app-toolbar-hover)]"
                      @click=${() => this.toggleGroup(group)}>
                      <span class="text-[10px] flex-shrink-0 select-none opacity-50" style="color: var(--app-disabled-foreground);">${this.formatTimestamp(group.lines![0].timestamp)}</span>
                      <iconify-icon icon="mdi:chevron-right" width="12" style="color: var(--app-disabled-foreground);"></iconify-icon>
                      <span class="text-[11px] px-1.5 py-0.5 rounded" style="background: var(--brand-primary); color: white; font-weight: 500;">×${group.count}</span>
                      <span class="flex-1 truncate" style="color: var(--app-disabled-foreground);">${group.output!.data}</span>
                    </div>
                  `;
                }
                if (group.type === 'group' && !group.collapsed) {
                  return html`
                    <div class="group-header px-3 py-0.5 flex items-center gap-2 cursor-pointer border-b hover:bg-[var(--app-toolbar-hover)]"
                      style="border-color: var(--app-border);"
                      @click=${() => this.toggleGroup(group)}>
                      <span class="text-[10px] flex-shrink-0 select-none opacity-50" style="color: var(--app-disabled-foreground);">${this.formatTimestamp(group.lines![0].timestamp)}</span>
                      <iconify-icon icon="mdi:chevron-down" width="12" style="color: var(--app-disabled-foreground);"></iconify-icon>
                      <span class="text-[11px] px-1.5 py-0.5 rounded" style="background: var(--brand-primary); color: white; font-weight: 500;">×${group.count}</span>
                      <span class="flex-1 truncate" style="color: var(--app-disabled-foreground);">expanded group</span>
                    </div>
                    ${group.lines!.map(line => this.renderLine(line))}
                  `;
                }
                return this.renderLine(group.output!);
              })}
        </div>

        <!-- Expression input — only visible during active debug session -->
        ${this.isDebugging ? html`
          <div class="flex items-center gap-1.5 px-3 py-1.5 border-t" style="background-color: var(--app-bg); border-color: var(--app-border);">
            <span class="font-bold text-xs" style="color: var(--app-foreground);">&gt;</span>
            <input type="text"
              class="flex-1 px-2 py-1 text-xs border border-transparent rounded font-mono outline-none focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]"
              style="background-color: var(--app-input-background); color: var(--app-input-foreground);"
              placeholder="Evaluate expression... (Enter to run)"
              @keydown=${this.handleInputKeydown}
              id="console-input" />
            <span class="text-[10px] hidden sm:inline" style="color: var(--app-disabled-foreground);">
              ${this.consoleHistory.length > 0 ? `${this.consoleHistory.length} in history` : ''}
            </span>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderLine(output: ConsoleOutput): ReturnType<typeof html> {
    const isError = output.output_type === 'stderr';
    const isSuccess = output.output_type === 'stdout';
    const isWarning = output.output_type === 'warning';
    const isConsole = output.source === 'console';
    const textClass = isError ? 'text-red-600' : isSuccess ? 'text-green-600' : isWarning ? 'text-yellow-600' : isConsole ? 'text-purple-600' : '';
    const bgClass = isError ? 'bg-red-50' : isWarning ? 'bg-yellow-50/50' : '';
    const prefix = isSuccess ? '▶' : isError ? '✖' : isWarning ? '⚠' : isConsole ? '>' : '●';

    return html`
      <div class="px-3 py-0.5 whitespace-pre-wrap break-words flex items-start gap-2 ${bgClass} ${textClass}">
        <span class="text-[10px] flex-shrink-0 select-none opacity-50 mt-px" style="color: var(--app-disabled-foreground);">${this.formatTimestamp(output.timestamp)}</span>
        <span class="font-bold flex-shrink-0 select-none">${prefix}</span>
        <span class="flex-1">${this.highlightSearch(output.data)}</span>
      </div>
    `;
  }
}
