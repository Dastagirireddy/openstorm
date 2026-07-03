import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import 'iconify-icon';
import type { SubAgent, PlanStep } from '../core/ai-state.js';

@customElement('openstorm-ai-task-sidebar')
export class AITaskSidebar extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; height: 100%; }
    .sidebar {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ai-panel-background, #ffffff);
      overflow-y: auto;
    }
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
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ai-text-muted, #6b7280);
    }
    .badge {
      padding: 2px 8px;
      border-radius: 12px;
      background: var(--ai-tool-header-background, #f3f4f6);
      font-size: 10px;
      font-weight: 600;
      color: var(--ai-text-muted, #6b7280);
    }
    .plan-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .plan-step {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 8px;
      background: var(--ai-tool-background, #f9fafb);
    }
    .plan-step.running,
    .plan-step.in_progress {
      border-color: var(--ai-primary, #3574f0);
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 5%, transparent);
    }
    .plan-step.completed,
    .plan-step.done {
      opacity: 0.7;
    }
    .plan-step.failed {
      border-color: var(--ai-danger, #ef4444);
      background: color-mix(in srgb, var(--ai-danger, #ef4444) 5%, transparent);
    }
    .step-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .step-icon.running,
    .step-icon.in_progress {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .step-info { flex: 1; min-width: 0; }
    .step-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--ai-text, #1f2937);
      margin-bottom: 2px;
    }
    .step-args {
      font-size: 11px;
      color: var(--ai-text-muted, #6b7280);
      font-family: 'SF Mono', 'Fira Code', monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .agent-list { display: flex; flex-direction: column; gap: 8px; }
    .agent-card {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 8px;
      background: var(--ai-tool-background, #f9fafb);
      transition: all 0.15s ease;
    }
    .agent-card:hover { border-color: var(--ai-text-muted, #6b7280); }
    .agent-card.completed { opacity: 0.6; }
    .status-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .status-icon.running { animation: spin 1s linear infinite; }
    .agent-info { flex: 1; min-width: 0; }
    .agent-task {
      font-size: 13px;
      font-weight: 500;
      color: var(--ai-text, #1f2937);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .agent-role {
      font-size: 10px;
      color: var(--ai-text-muted, #6b7280);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .empty {
      font-size: 13px;
      color: var(--ai-text-muted, #6b7280);
      text-align: center;
      padding: 20px;
    }
  `;

  @property({ type: Array }) subAgents: SubAgent[] = [];
  @property({ type: Array }) planSteps: PlanStep[] = [];

  private statusIcon(status: string) {
    switch (status) {
      case 'completed':
      case 'done': return html`<iconify-icon icon="mdi:check-circle" width="14" style="color:var(--ai-success,#22c55e)"></iconify-icon>`;
      case 'in_progress': return html`<iconify-icon icon="mdi:loading" width="14" class="spinner" style="color:var(--ai-primary,#3574f0)"></iconify-icon>`;
      case 'failed': return html`<iconify-icon icon="mdi:close-circle" width="14" style="color:var(--ai-danger,#ef4444)"></iconify-icon>`;
      default: return html`<iconify-icon icon="mdi:circle-outline" width="14" style="color:var(--ai-text-muted,#6b7280)"></iconify-icon>`;
    }
  }

  render() {
    const running = this.subAgents.filter(a => a.status === 'running');
    const completed = this.subAgents.filter(a => a.status === 'completed' || a.status === 'failed');

    return html`
      <div class="sidebar">
        ${this.planSteps.length > 0 ? html`
          <div class="section">
            <div class="section-header">
              <span class="section-title">Execution Plan</span>
              <span class="badge">${this.planSteps.length}</span>
            </div>
            <div class="plan-list">
              ${this.planSteps.map(step => html`
                <div class="plan-step ${step.status}">
                  <div class="step-icon ${step.status}">${this.statusIcon(step.status)}</div>
                  <div class="step-info">
                    <div class="step-name">${step.description}</div>
                  </div>
                </div>
              `)}
            </div>
          </div>
        ` : ''}

        <div class="section">
          <div class="section-header">
            <span class="section-title">Sub-Agents</span>
            ${this.subAgents.length ? html`<span class="badge">${this.subAgents.length}</span>` : ''}
          </div>
          ${this.subAgents.length === 0
            ? html`<div class="empty">No active agents</div>`
            : html`
              <div class="agent-list">
                ${running.map(a => html`
                  <div class="agent-card">
                    <div class="status-icon running">${this.statusIcon(a.status)}</div>
                    <div class="agent-info">
                      <div class="agent-task">${a.task}</div>
                      <div class="agent-role">${a.role}</div>
                    </div>
                  </div>
                `)}
                ${completed.map(a => html`
                  <div class="agent-card ${a.status}">
                    <div class="status-icon ${a.status}">${this.statusIcon(a.status)}</div>
                    <div class="agent-info">
                      <div class="agent-task">${a.task}</div>
                      <div class="agent-role">${a.role}</div>
                    </div>
                  </div>
                `)}
              </div>
            `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-task-sidebar': AITaskSidebar;
  }
}
