import { html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';

const componentStyles = css`
  :host {
    display: block;
    margin-top: 4px;
    margin-bottom: 4px;
  }

  .tool-output-widget {
    border: 1px solid var(--ai-panel-border, rgba(255,255,255,0.08));
    border-radius: 6px;
    overflow: hidden;
    background: var(--ai-panel-background, rgba(0,0,0,0.2));
  }

  .tool-output-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .tool-output-header:hover {
    background: var(--ai-surface-hover, rgba(255,255,255,0.03));
  }

  .tool-output-logs {
    max-height: 200px;
    overflow-y: auto;
    border-top: 1px solid var(--ai-panel-border, rgba(255,255,255,0.08));
  }

  .tool-output-content {
    padding: 6px 10px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .tool-output-line {
    color: var(--ai-text-primary, #e0e0e0);
    padding: 0 2px;
  }

  .tool-output-line.stderr {
    color: var(--ai-error, #f87171);
  }

  .tool-output-line.progress {
    color: var(--ai-warning, #fbbf24);
    font-style: italic;
  }

  .tool-output-line + .tool-output-line {
    margin-top: 1px;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

/**
 * Collapsible terminal widget for streaming command output in the AI panel.
 * Shows a compact header by default, expands to show live logs.
 * Handles progress bars (\r carriage returns) and ANSI stripping.
 */
@customElement('tool-output-widget')
export class ToolOutputWidget extends TailwindElement(componentStyles) {
  @property({ type: String }) output = '';
  @property({ type: String }) outputType = 'stdout';
  @property({ type: Boolean }) completed = false;
  @property({ type: Number }) exitCode: number | null = null;

  @state() private expanded = false;
  @state() private progressLine = '';

  @query('#log-container') private logContainer?: HTMLElement;

  private prevOutput = '';

  updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (changed.has('output') && this.logContainer) {
      // Auto-scroll to bottom when new output arrives
      requestAnimationFrame(() => {
        if (this.logContainer) {
          this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
      });
    }
    // Track progress line from \r carriage returns
    if (changed.has('output')) {
      this.updateProgressLine();
      this.prevOutput = this.output;
    }
  }

  private updateProgressLine(): void {
    if (!this.output) return;
    const lines = this.output.split('\n');
    // Find the last line that contains a carriage return
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('\r')) {
        this.progressLine = lines[i].replace(/\r/g, '').trim();
        return;
      }
    }
    this.progressLine = '';
  }

  private toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  private getLineCount(): number {
    if (!this.output) return 0;
    return this.output.split('\n').filter(l => l.trim().length > 0).length;
  }

  private getStatusIcon(): string {
    if (this.completed) {
      return this.exitCode === 0 ? 'mdi:check-circle' : 'mdi:alert-circle';
    }
    return 'mdi:loading';
  }

  private getStatusColor(): string {
    if (this.completed) {
      return this.exitCode === 0 ? 'var(--ai-success, #22c55e)' : 'var(--ai-error, #ef4444)';
    }
    return 'var(--ai-warning, #f59e0b)';
  }

  private getStatusText(): string {
    if (this.completed) {
      return this.exitCode === 0 ? 'Completed' : `Failed (exit ${this.exitCode})`;
    }
    if (this.progressLine) return this.progressLine;
    return 'Running...';
  }

  private stripAnsi(text: string): string {
    // Basic ANSI escape sequence stripping
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  render() {
    const lineCount = this.getLineCount();
    const statusIcon = this.getStatusIcon();
    const statusColor = this.getStatusColor();
    const statusText = this.getStatusText();

    return html`
      <div class="tool-output-widget">
        <!-- Header (always visible, clickable) -->
        <div class="tool-output-header" @click=${this.toggleExpanded}>
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <iconify-icon
              icon="${this.expanded ? 'mdi:chevron-down' : 'mdi:chevron-right'}"
              width="14"
              style="color: var(--ai-text-dim, #888); flex-shrink: 0;">
            </iconify-icon>
            <iconify-icon
              icon="${statusIcon}"
              width="14"
              style="color: ${statusColor}; flex-shrink: 0; ${!this.completed ? 'animation: spin 1s linear infinite;' : ''}">
            </iconify-icon>
            <span class="truncate text-xs" style="color: var(--ai-text-secondary, #aaa);">
              ${statusText}
            </span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${lineCount > 0 ? html`
              <span class="text-[10px] px-1.5 py-0.5 rounded"
                style="background: var(--ai-surface, rgba(255,255,255,0.05)); color: var(--ai-text-dim, #888);">
                ${lineCount} lines
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Expandable log area -->
        ${this.expanded ? html`
          <div id="log-container" class="tool-output-logs">
            ${this.renderLogs()}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderLogs() {
    if (!this.output) {
      return html`<div class="text-xs" style="color: var(--ai-text-dim, #666); padding: 8px;">Waiting for output...</div>`;
    }

    const lines = this.output.split('\n');
    return html`
      <div class="tool-output-content">
        ${lines.map((line, i) => {
          const clean = this.stripAnsi(line);
          if (!clean.trim() && i === lines.length - 1) return '';
          const isProgress = line.includes('\r');
          const isError = this.outputType === 'stderr';
          return html`
            <div class="tool-output-line ${isError ? 'stderr' : ''} ${isProgress ? 'progress' : ''}">
              ${clean.trim() || '&nbsp;'}
            </div>
          `;
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tool-output-widget': ToolOutputWidget;
  }
}
