import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export interface TelemetryField {
  key: string;
  value: string;
  field_type: 'text' | 'link' | 'success' | 'error' | 'running';
}

export type StepStatus = 'pending' | 'active' | 'completed' | 'failed';

const STEP_STYLES = `
  :host { display: block; }
  
  .step {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0 12px 24px;
    border-left: 2px solid var(--ai-panel-border, #e5e7eb);
    margin-left: 12px;
    position: relative;
  }
  
  .step.completed {
    border-left-color: var(--ai-success, #22c55e);
  }
  
  .step.active {
    border-left-color: var(--ai-warning, #f59e0b);
  }
  
  .step.failed {
    border-left-color: var(--ai-danger, #ef4444);
  }
  
  .step-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  .step-icon {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  
  .step-icon.pending { color: var(--ai-text-dim, #9ca3af); }
  .step-icon.active { 
    color: var(--ai-warning, #f59e0b); 
    animation: pulse 1.5s infinite;
  }
  .step-icon.completed { 
    color: var(--ai-success, #22c55e); 
    background: color-mix(in srgb, var(--ai-success, #22c55e) 15%, transparent);
  }
  .step-icon.failed { color: var(--ai-danger, #ef4444); }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  
  @media (prefers-reduced-motion: reduce) {
    .step-icon.active { animation: none; opacity: 1; }
    .step-waiting-icon { animation: none; }
  }
  
  .step-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  
  .step-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
  }
  
  .step-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--ai-text, #1f2937);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .step.active .step-name { color: var(--ai-warning, #f59e0b); }
  .step.completed .step-name { color: var(--ai-success, #22c55e); }
  .step.failed .step-name { color: var(--ai-danger, #ef4444); }
  
  .step-badge {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 11px;
    background: color-mix(in srgb, var(--ai-accent, #3574f0) 12%, transparent);
    color: var(--ai-accent, #3574f0);
    border: 1px solid color-mix(in srgb, var(--ai-accent, #3574f0) 25%, transparent);
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  
  .step-badge.tool {
    background: color-mix(in srgb, var(--ai-success, #22c55e) 12%, transparent);
    color: var(--ai-success, #22c55e);
    border-color: color-mix(in srgb, var(--ai-success, #22c55e) 25%, transparent);
  }
  
  .step-tag {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
  }
  
  .step-tag.new {
    background: color-mix(in srgb, var(--ai-accent, #3574f0) 12%, transparent);
    color: var(--ai-accent, #3574f0);
  }
  
  .step-tag.formatted {
    background: color-mix(in srgb, var(--ai-success, #22c55e) 12%, transparent);
    color: var(--ai-success, #22c55e);
  }
  
  .step-description {
    font-size: 12px;
    color: var(--ai-text-dim, #9ca3af);
    line-height: 1.5;
  }
  
  .step-subtitle {
    font-size: 13px;
    color: var(--ai-text-muted, #6b7280);
    line-height: 1.4;
  }
  
  .step-bullets {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    padding-left: 4px;
  }
  
  .step-bullet {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ai-text-muted, #6b7280);
    line-height: 1.5;
  }
  
  .step-bullet::before {
    content: '\\2022';
    color: var(--ai-text-dim, #9ca3af);
    font-weight: bold;
  }
  
  .step-waiting {
    font-size: 12px;
    color: var(--ai-warning, #f59e0b);
    font-style: italic;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .step-waiting-icon {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .step-verified {
    font-size: 12px;
    color: var(--ai-success, #22c55e);
    font-weight: 500;
  }
  
  .telemetry-box {
    background: var(--ai-panel-background, #ffffff);
    border: 1px solid var(--ai-panel-border, #e5e7eb);
    border-radius: 8px;
    padding: 12px 16px;
    max-width: 520px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 12px;
    margin-top: 6px;
  }
  
  .telemetry-row {
    display: flex;
    align-items: baseline;
    line-height: 1.8;
  }
  
  .telemetry-key {
    color: var(--ai-text-dim, #9ca3af);
    min-width: 80px;
    flex-shrink: 0;
  }
  
  .telemetry-value {
    color: var(--ai-text-muted, #6b7280);
    font-weight: 500;
  }
  
  .telemetry-value.success { color: var(--ai-success, #22c55e); }
  .telemetry-value.error { color: var(--ai-danger, #ef4444); }
  .telemetry-value.running { 
    color: var(--ai-success, #22c55e);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .telemetry-value.link {
    color: var(--ai-accent, #3574f0);
    text-decoration: none;
    cursor: pointer;
  }
  .telemetry-value.link:hover { text-decoration: underline; }
`;

@customElement('ai-timeline-step')
export class AiTimelineStep extends LitElement {
  static styles = unsafeCSS(STEP_STYLES);

  @property({ attribute: false }) stepName = '';
  @property({ attribute: false }) stepDescription = '';
  @property({ attribute: false }) toolBadge = '';
  @property({ attribute: false }) status: StepStatus = 'pending';
  @property({ attribute: false }) telemetryFields: TelemetryField[] = [];
  @property({ attribute: false }) bullets: string[] = [];
  @property({ attribute: false }) tag = '';

  private statusClass() {
    switch (this.status) {
      case 'completed': return 'completed';
      case 'active': return 'active';
      case 'failed': return 'failed';
      default: return 'pending';
    }
  }

  private icon() {
    switch (this.status) {
      case 'completed': return html`<iconify-icon icon="mdi:check-circle" width="16"></iconify-icon>`;
      case 'active': return html`<iconify-icon icon="mdi:loading" width="16"></iconify-icon>`;
      case 'failed': return html`<iconify-icon icon="mdi:close-circle" width="16"></iconify-icon>`;
      default: return html`<iconify-icon icon="mdi:circle-outline" width="16"></iconify-icon>`;
    }
  }

  render() {
    const name = this.stepName || 'Unknown Step';
    const desc = this.stepDescription || '';
    const badge = this.toolBadge || '';
    const hasBullets = this.bullets && this.bullets.length > 0;
    const hasTelemetry = this.telemetryFields && this.telemetryFields.length > 0;

    return html`
      <div class="step ${this.statusClass()}">
        <div class="step-header">
          <span class="step-icon ${this.statusClass()}">${this.icon()}</span>
          <div class="step-content">
            <div class="step-title-row">
              <span class="step-name">${name}</span>
              ${this.tag ? html`<span class="step-tag ${this.tag === 'New' ? 'new' : 'formatted'}">${this.tag}</span>` : ''}
              ${badge ? html`<span class="step-badge tool">${badge}</span>` : ''}
            </div>
            ${desc ? html`<span class="step-description">${desc}</span>` : ''}
          </div>
        </div>
        
        ${hasBullets ? html`
          <div class="step-bullets">
            ${this.bullets.map(b => html`<div class="step-bullet">${b}</div>`)}
          </div>
        ` : ''}
        
        ${hasTelemetry ? html`
          <div class="telemetry-box">
            ${this.telemetryFields.map(f => html`
              <div class="telemetry-row">
                <span class="telemetry-key">${f.key}</span>
                ${f.field_type === 'link'
                  ? html`<a href="${f.value}" target="_blank" class="telemetry-value link">${f.value}</a>`
                  : html`<span class="telemetry-value ${f.field_type === 'success' ? 'success' : f.field_type === 'error' ? 'error' : ''}">${f.field_type === 'success' ? html`<iconify-icon icon="mdi:check" width="12"></iconify-icon> ` : f.field_type === 'running' ? html`<iconify-icon icon="mdi:circle" width="8"></iconify-icon> ` : ''}${f.value}</span>`}
              </div>
            `)}
          </div>
        ` : ''}
      </div>
    `;
  }
}
