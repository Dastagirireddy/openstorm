import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { aiState } from '../../../lib/ai/ai-state.js';

interface TodoItem { id: string; content: string; status: string; priority: string; }

const SIDEBAR_STYLES = `
  :host { display: flex; flex-direction: column; height: 100%; }
  
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ai-panel-background, #ffffff);
    border-left: 1px solid var(--ai-panel-border, #e5e7eb);
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  
  .sidebar::-webkit-scrollbar { width: 6px; }
  .sidebar::-webkit-scrollbar-track { background: transparent; }
  .sidebar::-webkit-scrollbar-thumb { background: var(--ai-text-dim, #d1d5db); border-radius: 3px; }
  
  .section {
    padding: 16px;
  }
  
  .section + .section {
    border-top: 1px solid var(--ai-panel-border, #e5e7eb);
  }
  
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  
  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--ai-text-muted, #6b7280);
  }
  
  .section-badge {
    background: var(--ai-tool-background, #f9fafb);
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    color: var(--ai-text-muted, #6b7280);
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  
  .task-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .task-card {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    background: var(--ai-tool-background, #f9fafb);
    border: 1px solid var(--ai-tool-border, #e5e7eb);
    border-radius: 6px;
    transition: all 0.15s ease;
  }
  
  .task-card:hover {
    background: var(--ai-tool-header-background, #f3f4f6);
    border-color: var(--ai-text-dim, #d1d5db);
  }
  
  .task-card.pending {
    opacity: 0.6;
  }
  
  .task-card.completed {
    opacity: 0.8;
  }
  
  .task-icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 1px;
  }
  
  .task-icon.pending {
    color: var(--ai-text-dim, #9ca3af);
    border: 1.5px solid var(--ai-panel-border, #e5e7eb);
  }
  
  .task-icon.in_progress {
    color: var(--ai-warning, #f59e0b);
    border: 1.5px solid var(--ai-warning, #f59e0b);
  }
  
  .task-icon.completed {
    color: var(--ai-success, #22c55e);
    background: color-mix(in srgb, var(--ai-success, #22c55e) 15%, transparent);
    border: none;
  }
  
  .task-icon.failed {
    color: var(--ai-danger, #ef4444);
    background: color-mix(in srgb, var(--ai-danger, #ef4444) 15%, transparent);
    border: none;
  }
  
  .task-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  
  .task-name {
    font-size: 13px;
    line-height: 1.4;
    color: var(--ai-text, #4b5563);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .task-card.completed .task-name {
    color: var(--ai-text-dim, #9ca3af);
    text-decoration: line-through;
  }
  
  .task-priority {
    display: inline-flex;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 3px;
    width: fit-content;
  }
  
  .task-priority.high {
    color: var(--ai-danger, #ef4444);
    background: color-mix(in srgb, var(--ai-danger, #ef4444) 10%, transparent);
  }
  
  .task-priority.medium {
    color: var(--ai-warning, #f59e0b);
    background: color-mix(in srgb, var(--ai-warning, #f59e0b) 10%, transparent);
  }
  
  .task-priority.low {
    color: var(--ai-text-muted, #6b7280);
    background: color-mix(in srgb, var(--ai-text-muted, #6b7280) 20%, transparent);
  }
  
  .system-resources {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  
  .resource-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .resource-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--ai-text-muted, #6b7280);
  }
  
  .resource-value {
    font-size: 13px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: var(--ai-text, #4b5563);
  }
  
  .resource-value.warning {
    color: var(--ai-warning, #f59e0b);
  }
  
  .resource-value.error {
    color: var(--ai-danger, #ef4444);
  }
`;

@customElement('ai-task-sidebar')
export class AiTaskSidebar extends LitElement {
  static styles = unsafeCSS(SIDEBAR_STYLES);

  @state() private todos: TodoItem[] = [];
  @state() private tokens = '0 tokens';
  @state() private memory = 'LSPs are disabled';

  private _unsubscribes: (() => void)[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribes.push(
      aiState.on('todos-updated', (todos: TodoItem[]) => { this.todos = [...todos]; }),
      aiState.on('cost-update', (data: { prompt_tokens: number; completion_tokens: number }) => {
        this.tokens = `${((data.prompt_tokens || 0) + (data.completion_tokens || 0)).toLocaleString()} tokens`;
      }),
    );
    this.todos = [...aiState.todos];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribes.forEach(u => u());
    this._unsubscribes = [];
  }

  private icon(s: string) {
    switch (s) {
      case 'completed': return html`<iconify-icon icon="mdi:check-circle" width="16"></iconify-icon>`;
      case 'in_progress': return html`<iconify-icon icon="mdi:loading" width="16"></iconify-icon>`;
      case 'failed': return html`<iconify-icon icon="mdi:close-circle" width="16"></iconify-icon>`;
      default: return html`<iconify-icon icon="mdi:circle-outline" width="16"></iconify-icon>`;
    }
  }

  private iconClass(s: string) {
    switch (s) {
      case 'completed': return 'completed';
      case 'in_progress': return 'in_progress';
      case 'failed': return 'failed';
      default: return 'pending';
    }
  }

  private completedCount() { return this.todos.filter(t => t.status === 'completed').length; }

  render() {
    return html`
      <div class="sidebar">
        <div class="section">
          <div class="section-header">
            <span class="section-title">System Resources</span>
          </div>
          <div class="system-resources">
            <div class="resource-item">
              <span class="resource-label">Tokens</span>
              <span class="resource-value">${this.tokens}</span>
            </div>
            <div class="resource-item">
              <span class="resource-label">Memory</span>
              <span class="resource-value warning">${this.memory}</span>
            </div>
          </div>
        </div>
        ${this.todos.length > 0 ? html`
          <div class="section">
            <div class="section-header">
              <span class="section-title">Tasks</span>
              <span class="section-badge">${this.completedCount()}/${this.todos.length}</span>
            </div>
            <div class="task-list">
              ${this.todos.map(t => html`
                <div class="task-card ${t.status}">
                  <div class="task-icon ${this.iconClass(t.status)}">${this.icon(t.status)}</div>
                  <div class="task-content">
                    <span class="task-name">${t.content}</span>
                    <span class="task-priority ${t.priority}">${t.priority}</span>
                  </div>
                </div>
              `)}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
}
