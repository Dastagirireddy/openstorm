import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ToolApproval } from '../core/ai-state.js';
import { dispatchAIEvent } from '../core/ai-events.js';

@customElement('openstorm-ai-permission-bar')
export class AIPermissionBar extends LitElement {
  static styles = css`
    :host { display: block; }
    .permission-bar {
      border-top: 1px solid var(--ai-panel-border, #e5e7eb);
      background: var(--ai-tool-header-background, #f3f4f6);
      padding: 16px 20px;
    }
    .approval-item {
      background: var(--ai-input-background, #ffffff);
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-left: 3px solid var(--ai-warning, #f59e0b);
      border-radius: 0 8px 8px 0;
      padding: 16px 20px;
      margin-bottom: 12px;
    }
    .approval-item:last-child {
      margin-bottom: 0;
    }
    .approval-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .approval-icon {
      color: var(--ai-warning, #f59e0b);
      font-size: 14px;
    }
    .approval-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--ai-text, #1f2937);
    }
    .approval-detail {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--ai-text-muted, #6b7280);
      margin-bottom: 12px;
    }
    .approval-detail code {
      font-family: 'SF Mono', 'Fira Code', monospace;
      padding: 2px 8px;
      background: var(--ai-tool-background, #f9fafb);
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 4px;
      color: var(--ai-text, #1f2937);
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      border: none;
      background: none;
    }
    .btn-primary {
      background: var(--ai-warning, #f59e0b);
      color: #000;
    }
    .btn-primary:hover {
      background: color-mix(in srgb, var(--ai-warning, #f59e0b) 90%, black);
    }
    .btn-secondary {
      color: var(--ai-text-muted, #6b7280);
    }
    .btn-secondary:hover {
      color: var(--ai-text, #1f2937);
    }
    .btn-reject {
      color: var(--ai-text-muted, #6b7280);
    }
    .btn-reject:hover {
      color: var(--ai-danger, #ef4444);
    }
  `;

  @property({ type: Array }) approvals: ToolApproval[] = [];

  private parseToolInfo(toolName: string, argsSummary: string): { action: string; target: string; detail: string } {
    try {
      const args = JSON.parse(argsSummary);
      // Backend sends diff preview with file_path (not path)
      const filePath = args.file_path || args.path || '';
      switch (toolName) {
        case 'run_command':
        case 'bash':
          return {
            action: 'Execute command',
            target: this.truncateText(args.command || '', 80),
            detail: '',
          };
        case 'write_file':
          return {
            action: 'Write to file',
            target: filePath,
            detail: args.old_lines !== undefined ? `${args.old_lines} → ${args.new_lines} lines` : '',
          };
        case 'edit_file':
          return {
            action: 'Edit file',
            target: filePath,
            detail: args.start_line ? `Lines ${args.start_line}-${args.end_line}` : '',
          };
        case 'read_file':
          return {
            action: 'Read file',
            target: filePath,
            detail: '',
          };
        case 'search_code':
          return {
            action: 'Search code',
            target: this.truncateText(args.pattern || '', 80),
            detail: args.file_pattern || '',
          };
        case 'spawn_agent':
        case 'run_subagent':
          return {
            action: toolName === 'spawn_agent' ? 'Spawn agent' : 'Run agent',
            target: this.truncateText(args.task || '', 80),
            detail: args.strategy || '',
          };
        case 'todo_write':
          return {
            action: 'Update task list',
            target: `${args.todos?.length || 0} items`,
            detail: '',
          };
        default:
          return {
            action: toolName.replace(/_/g, ' '),
            target: this.truncateText(argsSummary, 60),
            detail: '',
          };
      }
    } catch {
      return {
        action: toolName.replace(/_/g, ' '),
        target: this.truncateText(argsSummary, 60),
        detail: '',
      };
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private onDecision(toolCallId: string, approved: boolean) {
    dispatchAIEvent(this, 'ai:approve-tool', { toolCallId, approved });
  }

  render() {
    if (!this.approvals.length) return html``;

    return html`
      <div class="permission-bar">
        ${this.approvals.map(a => {
          const { action, target, detail } = this.parseToolInfo(a.toolName, a.argsSummary);
          return html`
            <div class="approval-item">
              <div class="approval-header">
                <span class="approval-icon">⚠</span>
                <span class="approval-title">Permission required</span>
              </div>
              <div class="approval-detail">
                <span>→</span>
                <span>${action}</span>
                <code>${target}</code>
                ${detail ? html`<span>${detail}</span>` : ''}
              </div>
              <div class="actions">
                <button class="btn btn-primary" @click=${() => this.onDecision(a.toolCallId, true)}>Allow once</button>
                <button class="btn btn-secondary" @click=${() => this.onDecision(a.toolCallId, true)}>Allow always</button>
                <button class="btn btn-reject" @click=${() => this.onDecision(a.toolCallId, false)}>Reject</button>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-permission-bar': AIPermissionBar;
  }
}
