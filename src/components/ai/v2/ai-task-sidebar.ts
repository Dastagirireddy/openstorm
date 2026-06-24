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
    background: #0d0f12;
    border-left: 1px solid #1e2128;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  
  .sidebar::-webkit-scrollbar { width: 6px; }
  .sidebar::-webkit-scrollbar-track { background: transparent; }
  .sidebar::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
  
  .section {
    padding: 16px;
  }
  
  .section + .section {
    border-top: 1px solid #1e2128;
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
    color: #5c6370;
  }
  
  .section-badge {
    background: #1e2128;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    color: #abb2bf;
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
    background: #141618;
    border: 1px solid #1e2128;
    border-radius: 6px;
    transition: all 0.15s ease;
  }
  
  .task-card:hover {
    background: #1a1d21;
    border-color: #2b2d31;
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
    color: #5c6370;
    border: 1.5px solid #3e4451;
  }
  
  .task-icon.in_progress {
    color: #d19a66;
    border: 1.5px solid #d19a66;
  }
  
  .task-icon.completed {
    color: #98c379;
    background: rgba(152, 195, 121, 0.15);
    border: none;
  }
  
  .task-icon.failed {
    color: #e06c75;
    background: rgba(224, 108, 117, 0.15);
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
    color: #abb2bf;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .task-card.completed .task-name {
    color: #5c6370;
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
    color: #e06c75;
    background: rgba(224, 108, 117, 0.1);
  }
  
  .task-priority.medium {
    color: #d19a66;
    background: rgba(209, 154, 102, 0.1);
  }
  
  .task-priority.low {
    color: #5c6370;
    background: rgba(92, 99, 112, 0.2);
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
    color: #5c6370;
  }
  
  .resource-value {
    font-size: 13px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #abb2bf;
  }
  
  .resource-value.warning {
    color: #d19a66;
  }
  
  .resource-value.error {
    color: #e06c75;
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
      case 'completed': return '\u2713';
      case 'in_progress': return '\u2192';
      case 'failed': return '\u2717';
      default: return '\u25CB';
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
      </div>
    `;
  }
}
