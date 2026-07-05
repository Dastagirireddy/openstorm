import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ToolCall as ToolCallType } from '../core/ai-state.js';

@customElement('openstorm-ai-tool-call')
export class AIToolCall extends LitElement {
  static styles = css`
    :host { display: block; }
    .tool-call {
      border-radius: var(--os-radius-md);
      border: 1px solid var(--os-ai-tool-border);
      background: var(--os-ai-tool-bg);
      font-size: var(--os-text-xs);
    }
    .trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: inherit;
      color: var(--os-text);
      transition: background var(--os-transition-fast);
    }
    .trigger:hover { background: var(--os-surface-2); }
    .tool-name { font-weight: 500; }
    .tool-path {
      color: var(--os-text-subtle);
      font-family: var(--os-font-mono);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 300px;
    }
    .tool-status { color: var(--os-text-subtle); margin-left: auto; }
    .chevron {
      color: var(--os-text-subtle);
      transition: transform var(--os-transition-fast);
    }
    .chevron.open { transform: rotate(180deg); }
    .details {
      padding: 8px 12px;
      border-top: 1px solid var(--os-border-subtle);
      display: none;
    }
    .details.open { display: block; }
    .details pre {
      background: var(--os-surface-3);
      padding: 8px;
      border-radius: var(--os-radius-sm);
      font-family: var(--os-font-mono);
      font-size: var(--os-text-xs);
      overflow-x: auto;
      white-space: pre-wrap;
      margin: 4px 0;
    }
    .details strong { color: var(--os-text-muted); }
    .result-label { margin-top: 8px; }
    .diff-container {
      border: 1px solid var(--os-border-subtle);
      border-radius: var(--os-radius-sm);
      overflow: hidden;
      font-family: var(--os-font-mono);
      font-size: 11px;
      margin: 4px 0;
    }
    .diff-header {
      background: var(--os-surface-2);
      padding: 6px 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--os-border-subtle);
    }
    .diff-header-path {
      font-weight: 500;
      color: var(--os-text);
    }
    .diff-stats {
      display: flex;
      gap: 8px;
      font-size: 10px;
    }
    .diff-stat-add { color: var(--os-success, #22c55e); }
    .diff-stat-del { color: var(--os-danger, #ef4444); }
    .diff-body {
      max-height: 300px;
      overflow-y: auto;
    }
    .diff-line {
      display: flex;
      line-height: 1.6;
      padding: 0 8px;
    }
    .diff-line-num {
      width: 36px;
      text-align: right;
      padding-right: 8px;
      color: var(--os-text-subtle);
      user-select: none;
      flex-shrink: 0;
    }
    .diff-line-content {
      flex: 1;
      white-space: pre;
      overflow-x: auto;
    }
    .diff-line.add {
      background: color-mix(in srgb, var(--os-success, #22c55e) 10%, transparent);
    }
    .diff-line.add .diff-line-content { color: var(--os-success, #22c55e); }
    .diff-line.del {
      background: color-mix(in srgb, var(--os-danger, #ef4444) 10%, transparent);
    }
    .diff-line.del .diff-line-content { color: var(--os-danger, #ef4444); }
    .diff-line.context .diff-line-content { color: var(--os-text-muted); }
    .file-output {
      background: var(--os-surface-3);
      padding: 8px;
      border-radius: var(--os-radius-sm);
      font-family: var(--os-font-mono);
      font-size: 11px;
      overflow-x: auto;
      white-space: pre-wrap;
      margin: 4px 0;
      max-height: 200px;
      overflow-y: auto;
    }
  `;

  @property({ type: Object }) toolCall: ToolCallType | null = null;
  @state() private expanded = false;

  private getIcon(): string {
    const icons: Record<string, string> = {
      read_file: '📄',
      write_file: '✏️',
      edit_file: '✏️',
      search_files: '🔍',
      run_command: '▶️',
      list_directory: '📁',
    };
    return icons[this.toolCall?.name ?? ''] ?? '🔧';
  }

  private getPreview(): { type: string; file_path?: string; hunks?: Array<{ type: string; content: string; old_line?: number; new_line?: number }> } | null {
    const args = this.toolCall?.args;
    if (!args?._preview) return null;
    return args._preview as any;
  }

  private getFilePath(): string {
    const args = this.toolCall?.args;
    if (!args) return '';
    // Check preview first (has file_path), then raw args
    const preview = this.getPreview();
    if (preview?.file_path) return preview.file_path;
    return (args.path as string) || (args.file_path as string) || '';
  }

  private getDisplayName(): string {
    const name = this.toolCall?.name ?? '';
    const path = this.getFilePath();
    const labels: Record<string, string> = {
      read_file: 'Read',
      write_file: 'Write',
      edit_file: 'Edit',
      search_files: 'Search',
      run_command: 'Run',
      list_directory: 'List',
    };
    const label = labels[name] || name.replace(/_/g, ' ');
    return path ? `${label}` : label;
  }

  private getDiffFromPreview(): Array<{ type: string; content: string; oldLine?: number; newLine?: number }> | null {
    const preview = this.getPreview();
    if (!preview?.hunks) return null;
    return preview.hunks.map(h => ({
      type: h.type === 'added' ? 'add' : h.type === 'removed' ? 'del' : 'context',
      content: h.content,
      oldLine: h.old_line ?? undefined,
      newLine: h.new_line ?? undefined,
    }));
  }

  private getDiffFromResult(): Array<{ type: string; content: string; num: number }> | null {
    const output = this.toolCall?.result?.output ?? '';
    if (!output) return null;
    const lines = output.split('\n');
    const diffLines: Array<{ type: string; content: string; num: number }> = [];
    let hasDiff = false;
    let lineNum = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        hasDiff = true;
        diffLines.push({ type: 'context', content: line, num: 0 });
      } else if (line.startsWith('+')) {
        hasDiff = true;
        lineNum++;
        diffLines.push({ type: 'add', content: line, num: lineNum });
      } else if (line.startsWith('-')) {
        hasDiff = true;
        lineNum++;
        diffLines.push({ type: 'del', content: line, num: lineNum });
      } else {
        lineNum++;
        diffLines.push({ type: 'context', content: line, num: lineNum });
      }
    }

    return hasDiff ? diffLines : null;
  }

  private getDiffStats(diff: Array<{ type: string }>): { added: number; removed: number } {
    return {
      added: diff.filter(l => l.type === 'add').length,
      removed: diff.filter(l => l.type === 'del').length,
    };
  }

  render() {
    if (!this.toolCall) return html``;

    const filePath = this.getFilePath();
    const previewDiff = this.getDiffFromPreview();
    const resultDiff = this.getDiffFromResult();
    const hasPreview = previewDiff !== null;

    return html`
      <div class="tool-call">
        <button class="trigger" @click=${() => this.expanded = !this.expanded}>
          <span>${this.getIcon()}</span>
          <span class="tool-name">${this.getDisplayName()}</span>
          ${filePath ? html`<span class="tool-path">${filePath}</span>` : ''}
          <span class="tool-status">${this.toolCall.status}</span>
          <span class="chevron ${this.expanded ? 'open' : ''}">&#9660;</span>
        </button>
        ${this.expanded ? html`
          <div class="details open">
            ${hasPreview ? html`
              <div class="diff-container">
                <div class="diff-header">
                  <span class="diff-header-path">${filePath || 'Changes'}</span>
                  <div class="diff-stats">
                    <span class="diff-stat-add">+${this.getDiffStats(previewDiff!).added}</span>
                    <span class="diff-stat-del">-${this.getDiffStats(previewDiff!).removed}</span>
                  </div>
                </div>
                <div class="diff-body">
                  ${previewDiff!.map(line => html`
                    <div class="diff-line ${line.type}">
                      <span class="diff-line-num">${line.newLine || line.oldLine || ''}</span>
                      <span class="diff-line-content">${line.content}</span>
                    </div>
                  `)}
                </div>
              </div>
            ` : resultDiff ? html`
              <div class="diff-container">
                <div class="diff-header">
                  <span class="diff-header-path">${filePath || 'Result'}</span>
                  <div class="diff-stats">
                    <span class="diff-stat-add">+${this.getDiffStats(resultDiff).added}</span>
                    <span class="diff-stat-del">-${this.getDiffStats(resultDiff).removed}</span>
                  </div>
                </div>
                <div class="diff-body">
                  ${resultDiff.map(line => html`
                    <div class="diff-line ${line.type}">
                      <span class="diff-line-num">${line.num || ''}</span>
                      <span class="diff-line-content">${line.content}</span>
                    </div>
                  `)}
                </div>
              </div>
            ` : html`
              <div><strong>Args:</strong></div>
              <pre>${JSON.stringify(this.toolCall.args, null, 2)}</pre>
              ${this.toolCall.result ? html`
                <div class="result-label"><strong>Result:</strong></div>
                <div class="file-output">${this.toolCall.result.output}</div>
              ` : ''}
            `}
          </div>
        ` : ''}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-tool-call': AIToolCall;
  }
}
