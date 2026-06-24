import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderMarkdown } from '../ai-markdown.js';
import { ASCII_LOGO, AI_TIPS } from '../ai-commands.js';
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
  :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--ai-panel-background, #141618); }
  .scroll { flex: 1; overflow-y: auto; padding: 24px 32px; display: flex; flex-direction: column; gap: 0; }
  .scroll::-webkit-scrollbar { width: 6px; }
  .scroll::-webkit-scrollbar-track { background: transparent; }
  .scroll::-webkit-scrollbar-thumb { background: var(--ai-text-dim, #333); border-radius: 3px; }
  
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
  
  .logo {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 11px;
    line-height: 1.2;
    color: var(--ai-text-dim, #3e4451);
    white-space: pre;
    margin-bottom: 32px;
    opacity: 0.8;
  }
  
  .welcome-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--ai-text, #abb2bf);
    margin-bottom: 8px;
  }
  
  .welcome-subtitle {
    font-size: 13px;
    color: var(--ai-text-muted, #5c6370);
    margin-bottom: 24px;
    max-width: 400px;
    line-height: 1.6;
  }
  
  .tips {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 360px;
  }
  
  .tip {
    font-size: 12px;
    color: var(--ai-text-muted, #5c6370);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .tip::before {
    content: '\\2022';
    color: var(--ai-text-dim, #3e4451);
  }
  
  .header-text { font-size: 14px; color: var(--ai-text, #abb2bf); line-height: 1.6; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--ai-panel-border, #1e2128); }
  .response-text { 
    font-size: 14px; 
    color: var(--ai-text, #abb2bf); 
    line-height: 1.7; 
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--ai-panel-border, #1e2128);
  }
  .response-text h1, .response-text h2, .response-text h3, .response-text h4 { 
    color: var(--ai-text, #e0e0e0); 
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
    background: var(--ai-code-background, #21252b); 
    padding: 2px 6px; 
    border-radius: 4px; 
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 13px;
    color: var(--ai-text, #abb2bf);
  }
  .response-text pre { 
    background: var(--ai-input-background, #0d0f12); 
    border: 1px solid var(--ai-panel-border, #1e2128); 
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
  .response-text strong { color: var(--ai-text, #e0e0e0); font-weight: 600; }
  .response-text em { color: var(--ai-text, #abb2bf); }
  .response-text a { color: var(--ai-accent, #61afef); text-decoration: none; }
  .response-text a:hover { text-decoration: underline; }
  .response-text blockquote { 
    border-left: 3px solid var(--ai-text-dim, #3e4451); 
    margin: 12px 0; 
    padding: 8px 16px; 
    color: var(--ai-text-muted, #828997);
    background: var(--ai-input-background, #0d0f12);
    border-radius: 0 8px 8px 0;
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
    this.headerText = `Execution timeline for '${prompt}' task:`;
    this.scrollToBottom();
  }

  clearResponse() {
    this.responseText = '';
    this.permissionRequest = null;
    this.summary = null;
  }

  setResponseText(text: string) { this.responseText = text; this.scrollToBottom(); }
  appendResponseText(delta: string) { this.responseText += delta; this.scrollToBottom(); }

  addStep(step: TimelineStepData) { 
    this.steps = [...this.steps, step]; 
    this.scrollToBottom(); 
  }

  updateStep(id: string, updates: Partial<TimelineStepData>) {
    this.steps = this.steps.map(s => s.id === id ? { ...s, ...updates } : s);
    this.scrollToBottom();
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
            <div class="logo">${ASCII_LOGO}</div>
            <div class="welcome-title">OpenStorm AI</div>
            <div class="welcome-subtitle">Ask questions about your code, get help with tasks, or let me analyze your project.</div>
            <div class="tips">
              ${AI_TIPS.slice(0, 4).map(tip => html`<div class="tip">${tip}</div>`)}
            </div>
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
