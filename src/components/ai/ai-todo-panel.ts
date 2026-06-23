import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import { aiState } from '../../lib/ai/ai-state.js';

interface TodoItem {
  id: string;
  content: string;
  status: string;
  priority: string;
}

@customElement('ai-todo-panel')
export class AiTodoPanel extends TailwindElement(css`
  :host {
    display: flex;
    height: 100%;
  }
  :host(.hidden) {
    display: none;
  }
`) {
  @state() private todos: TodoItem[] = [];
  @state() private isCollapsed = false;
  @state() private isActive = false;

  private _boundUpdate: ((todos: TodoItem[]) => void) | null = null;
  private _boundThinkingUpdate: (() => void) | null = null;
  private _unsubscribes: (() => void)[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this._boundUpdate = (todos: TodoItem[]) => {
      this.todos = [...todos];
      this.updateHostVisibility();
    };
    this._boundThinkingUpdate = () => {
      this.updateHostVisibility();
    };
    this._unsubscribes.push(
      aiState.on('todos-updated', this._boundUpdate),
      aiState.on('thinking-status', this._boundThinkingUpdate),
      aiState.on('streaming-status', this._boundThinkingUpdate),
    );
    this.todos = [...aiState.todos];
    this.updateHostVisibility();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribes.forEach(unsub => unsub());
    this._unsubscribes = [];
  }

  private updateHostVisibility(): void {
    const host = (this.shadowRoot as ShadowRoot)?.host as HTMLElement;
    if (host) {
      host.classList.toggle('hidden', this.todos.length === 0);
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return '✓';
      case 'in_progress': return '→';
      case 'failed': return '✗';
      default: return '○';
    }
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'in_progress': return 'text-amber-400';
      case 'failed': return 'text-red-400';
      default: return 'text-gray-500';
    }
  }

  private getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return 'text-red-400';
      case 'low': return 'text-gray-500';
      default: return 'text-gray-400';
    }
  }

  private toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  private clearCompleted(): void {
    this.todos = this.todos.filter(t => t.status !== 'completed');
    aiState.setTodos(this.todos);
  }

  render() {
    const completedCount = this.todos.filter(t => t.status === 'completed').length;
    const totalCount = this.todos.length;

    return html`
      <div class="h-full w-full flex flex-col bg-zinc-900 border-l border-zinc-800">
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-zinc-400 uppercase tracking-wide">Tasks</span>
            ${totalCount > 0 ? html`
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                ${completedCount}/${totalCount}
              </span>
            ` : ''}
          </div>
          <div class="flex items-center gap-1">
            ${completedCount > 0 ? html`
              <button
                @click=${this.clearCompleted}
                class="p-1 text-zinc-500 hover:text-zinc-300 rounded"
                title="Clear completed"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            ` : ''}
            <button
              @click=${this.toggleCollapse}
              class="p-1 text-zinc-500 hover:text-zinc-300 rounded"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${this.isCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Content -->
        ${this.isCollapsed ? '' : html`
          <div class="flex-1 overflow-y-auto">
            ${totalCount === 0 ? html`
              <div class="px-3 py-8 text-center">
                <div class="text-zinc-600 text-sm">No tasks yet</div>
                <div class="text-zinc-700 text-xs mt-1">Tasks will appear as the AI works</div>
              </div>
            ` : html`
              <div class="divide-y divide-zinc-800">
                ${this.todos.map(todo => html`
                  <div class="px-3 py-2 hover:bg-zinc-800/50 transition-colors">
                    <div class="flex items-start gap-2">
                      <span class="mt-0.5 text-sm ${this.getStatusColor(todo.status)}">
                        ${this.getStatusIcon(todo.status)}
                      </span>
                      <div class="flex-1 min-w-0">
                        <div class="text-sm text-zinc-200 leading-snug ${todo.status === 'completed' ? 'line-through text-zinc-500' : ''}">
                          ${todo.content}
                        </div>
                        <div class="flex items-center gap-2 mt-1">
                          <span class="text-[10px] ${this.getPriorityColor(todo.priority)} uppercase">
                            ${todo.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                `)}
              </div>
            `}
          </div>
        `}
      </div>
    `;
  }
}
