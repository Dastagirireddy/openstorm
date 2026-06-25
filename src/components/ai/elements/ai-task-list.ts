import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface TaskItem {
  label: string;
  completed: boolean;
}

@customElement('ai-task-list')
export class AiTaskList extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.5em 0;
    }

    .task-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .task-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 4px 0;
    }

    .task-checkbox {
      width: 16px;
      height: 16px;
      border: 1.5px solid var(--ai-panel-border, #d1d5db);
      border-radius: 3px;
      flex-shrink: 0;
      margin-top: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ai-tool-background, #ffffff);
    }

    .task-checkbox.completed {
      background: var(--ai-primary, #3574f0);
      border-color: var(--ai-primary, #3574f0);
    }

    .task-label {
      color: var(--ai-text, #111827);
      font-size: 13px;
      line-height: 1.4;
    }

    .task-label.completed {
      text-decoration: line-through;
      color: var(--ai-text-dim, #9ca3af);
    }
  `;

  @property({ type: Array })
  tasks: TaskItem[] = [];

  private renderCheckbox(completed: boolean) {
    if (completed) {
      return html`
        <div class="task-checkbox completed">
          <iconify-icon icon="lucide:check" width="10" style="color: white;"></iconify-icon>
        </div>
      `;
    }
    return html`<div class="task-checkbox"></div>`;
  }

  render() {
    return html`
      <ul class="task-list">
        ${this.tasks.map(task => html`
          <li class="task-item">
            ${this.renderCheckbox(task.completed)}
            <span class="task-label ${task.completed ? 'completed' : ''}">${task.label}</span>
          </li>
        `)}
      </ul>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-task-list': AiTaskList;
  }
}
