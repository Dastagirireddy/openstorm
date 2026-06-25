import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderMarkdown } from '../ai-markdown.js';
import { ASCII_LOGO } from '../ai-commands.js';

import './ai-timeline-step.js';
import './ai-permission-card.js';
import './ai-execution-summary.js';
import type { TelemetryField, StepStatus } from './ai-timeline-step.js';
import type { PermissionRequest } from './ai-permission-card.js';
import type { FileModification, CostSnapshot } from './ai-execution-summary.js';

export interface TimelineStepData {
  id: string;
  name: string;
  description: string;
  toolBadge: string;
  status: StepStatus;
  telemetryFields: TelemetryField[];
  bullets?: string[];
  tag?: string;
}

export interface SummaryData {
  status: string;
  filesModified: FileModification[];
  totalToolCalls: number;
  durationMs: number;
  costSummary: CostSnapshot | null;
}

const TIMELINE_STYLES = `
  :host { 
    display: flex; 
    flex-direction: column; 
    height: 100%; 
    overflow: hidden; 
    background: var(--ai-panel-background, #ffffff);
  }
  .scroll { 
    flex: 1; 
    overflow-y: auto; 
    padding: 24px 32px; 
    display: flex; 
    flex-direction: column; 
    gap: 0; 
  }
  .scroll::-webkit-scrollbar { width: 6px; }
  .scroll::-webkit-scrollbar-track { background: transparent; }
  .scroll::-webkit-scrollbar-thumb { background: var(--ai-text-dim, #d1d5db); border-radius: 3px; }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 400px;
    text-align: center;
    padding: 40px;
  }
  
  .empty-icon {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 11px;
    line-height: 1.2;
    color: var(--ai-text-dim, #9ca3af);
    white-space: pre;
    margin-bottom: 20px;
    opacity: 0.4;
  }
  
  .welcome-subtitle {
    font-size: 13px;
    color: var(--ai-text-muted, #6b7280);
    max-width: 320px;
    line-height: 1.5;
  }
  
  .header-text { 
    font-size: 14px; 
    font-weight: 500; 
    color: var(--ai-text, #1f2937); 
    line-height: 1.6; 
    margin-bottom: 20px; 
    padding: 14px 18px; 
    background: linear-gradient(135deg, color-mix(in srgb, var(--ai-primary, #3574f0) 6%, transparent) 0%, color-mix(in srgb, var(--ai-secondary, #5a9cf8) 4%, transparent) 100%); 
    border-left: 3px solid var(--ai-primary, #3574f0);
    border-radius: 0 8px 8px 0; 
    font-weight: 600;
  }
  .response-text { 
    font-size: 14px; 
    color: var(--ai-text, #4b5563); 
    line-height: 1.7; 
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--ai-panel-border, #e5e7eb);
  }
  .response-text h1, .response-text h2, .response-text h3, .response-text h4 { 
    color: var(--ai-text, #1f2937); 
    margin: 16px 0 8px 0; 
    line-height: 1.4;
  }
  .response-text h1 { font-size: 18px; }
  .response-text h2 { font-size: 16px; }
  .response-text h3 { font-size: 14px; }
  .response-text p { margin: 8px 0; }
  .response-text ul, .response-text ol { margin: 8px 0; padding-left: 24px; }
  .response-text li { margin: 4px 0; }
  .response-text code { 
    background: var(--ai-code-background, #f3f4f6); 
    padding: 2px 6px; 
    border-radius: 4px; 
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 13px;
    color: var(--ai-syntax-keyword, #dc2626);
    border: 1px solid var(--ai-code-border, #e5e7eb);
  }
  .response-text pre { 
    background: var(--ai-input-background, #f9fafb); 
    border: 1px solid var(--ai-panel-border, #e5e7eb); 
    border-radius: 8px; 
    padding: 12px 16px; 
    margin: 12px 0;
    overflow-x: auto;
  }
  .response-text pre code { 
    background: none; 
    padding: 0; 
    border-radius: 0;
  }
  .response-text strong { color: var(--ai-text, #1f2937); font-weight: 600; }
  .response-text em { color: var(--ai-text, #4b5563); }
  .response-text a { color: var(--ai-accent, #3574f0); text-decoration: none; }
  .response-text a:hover { text-decoration: underline; }
  .response-text blockquote { 
    border-left: 3px solid var(--ai-text-dim, #d1d5db); 
    margin: 12px 0; 
    padding: 8px 16px; 
    color: var(--ai-text-muted, #6b7280);
    background: var(--ai-input-background, #f9fafb);
    border-radius: 0 8px 8px 0;
  }
  .response-text table { 
    width: 100%; 
    border-collapse: collapse; 
    margin: 16px 0; 
    font-size: 13px;
  }
  .response-text thead th { 
    background: var(--ai-tool-header-background, #f3f4f6); 
    color: var(--ai-text, #1f2937); 
    font-weight: 600; 
    text-align: left; 
    padding: 10px 14px; 
    border-bottom: 2px solid var(--ai-panel-border, #e5e7eb);
  }
  .response-text tbody td { 
    padding: 10px 14px; 
    border-bottom: 1px solid var(--ai-panel-border, #e5e7eb); 
    color: var(--ai-text, #4b5563);
    vertical-align: top;
  }
  .response-text tbody tr:hover { 
    background: var(--ai-tool-background, #f9fafb); 
  }
  .response-text tbody tr:last-child td { 
    border-bottom: none; 
  }
  .response-text code-block { 
    display: block;
    margin: 12px 0;
  }
`;

@customElement('ai-timeline')
export class AiTimeline extends LitElement {
  static styles = unsafeCSS(TIMELINE_STYLES);

  @property({ type: String }) sessionId = '';
  @state() userPrompt = '';
  @state() responseText = '';
  @state() steps: TimelineStepData[] = [];
  @state() permissionRequest: PermissionRequest | null = null;
  @state() summary: SummaryData | null = null;
  @state() isStreaming = false;
  @state() headerText = '';

  @query('.scroll') private scrollEl!: HTMLDivElement;

  private scrollToBottom() {
    requestAnimationFrame(() => {
      if (this.scrollEl) this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
    });
  }

  setUserPrompt(prompt: string) {
    this.userPrompt = prompt;
    this.responseText = '';
    this.steps = [];
    this.permissionRequest = null;
    this.summary = null;
    this.headerText = prompt;
    this.scrollToBottom();
    this._emitContentChange();
  }

  clearAll() {
    this.userPrompt = '';
    this.responseText = '';
    this.steps = [];
    this.permissionRequest = null;
    this.summary = null;
    this.headerText = '';
    this._emitContentChange();
  }

  private _emitContentChange() {
    const hasContent = !!(this.headerText || this.steps.length > 0 || this.responseText || this.permissionRequest || this.summary);
    this.dispatchEvent(new CustomEvent('timeline-content-change', { 
      detail: { hasContent }, 
      bubbles: true, 
      composed: true 
    }));
  }

  clearResponse() {
    this.responseText = '';
    this.permissionRequest = null;
    this.summary = null;
  }

  setResponseText(text: string) { this.responseText = text; this.scrollToBottom(); this._emitContentChange(); }
  appendResponseText(delta: string) { this.responseText += delta; this.scrollToBottom(); this._emitContentChange(); }

  addStep(step: TimelineStepData) { 
    this.steps = [...this.steps, step]; 
    this.scrollToBottom();
    this._emitContentChange();
  }

  updateStep(id: string, updates: Partial<TimelineStepData>) {
    this.steps = this.steps.map(s => s.id === id ? { ...s, ...updates } : s);
    this.scrollToBottom();
    this._emitContentChange();
  }

  updateStepTelemetry(id: string, fields: TelemetryField[]) {
    this.steps = this.steps.map(s => s.id === id ? { ...s, telemetryFields: fields } : s);
    this.scrollToBottom();
  }

  showPermission(request: PermissionRequest) { this.permissionRequest = request; this.scrollToBottom(); }
  hidePermission() { this.permissionRequest = null; }
  showSummary(summary: SummaryData) { this.summary = summary; this.scrollToBottom(); }
  setStreaming(streaming: boolean) { this.isStreaming = streaming; }

  private _onPermissionGranted() {
    this.permissionRequest = null;
    this.dispatchEvent(new CustomEvent('permission-granted', { bubbles: true, composed: true }));
  }

  private _onPermissionDenied() {
    this.permissionRequest = null;
    this.dispatchEvent(new CustomEvent('permission-denied', { bubbles: true, composed: true }));
  }

  render() {
    const renderedResponse = this.responseText ? renderMarkdown(this.responseText) : '';
    const hasContent = this.headerText || this.steps.length > 0 || this.responseText || this.permissionRequest || this.summary;
    
    return html`
      <div class="scroll">
        ${!hasContent ? html`
          <div class="empty-state">
            <div class="empty-icon">${ASCII_LOGO}</div>
            <div class="welcome-subtitle">Ask about your code or attach files with @</div>
          </div>
        ` : html`
          ${this.headerText ? html`<div class="header-text">${this.headerText}</div>` : ''}
          ${this.steps.filter(s => s && s.name).map(step => html`
            <ai-timeline-step
              .stepName=${step.name}
              .stepDescription=${step.description}
              .toolBadge=${step.toolBadge}
              .status=${step.status}
              .telemetryFields=${step.telemetryFields}
              .bullets=${step.bullets || []}
              .tag=${step.tag || ''}
            ></ai-timeline-step>
          `)}
          ${this.responseText ? html`<div class="response-text">${unsafeHTML(renderedResponse)}</div>` : ''}
          ${this.permissionRequest ? html`<ai-permission-card .request=${this.permissionRequest} @permission-granted=${this._onPermissionGranted} @permission-denied=${this._onPermissionDenied}></ai-permission-card>` : ''}
          ${this.summary ? html`
            <ai-execution-summary
              .status=${this.summary.status}
              .filesModified=${this.summary.filesModified}
              .totalToolCalls=${this.summary.totalToolCalls}
              .durationMs=${this.summary.durationMs}
              .costSummary=${this.summary.costSummary}
            ></ai-execution-summary>
          ` : ''}
        `}
      </div>
    `;
  }
}
