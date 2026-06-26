import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface PermissionRequest {
  toolName: string;
  reason: string;
  command: string;
}

const PERM_STYLES = `
  :host { display: block; }
  
  .permission-card {
    background: color-mix(in srgb, var(--ai-danger, #ef4444) 8%, var(--ai-panel-background, #ffffff));
    border: 1px solid color-mix(in srgb, var(--ai-danger, #ef4444) 30%, var(--ai-panel-border, #e5e7eb));
    border-radius: 10px;
    padding: 20px;
    margin: 12px 0;
    max-width: 680px;
  }
  
  .permission-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--ai-danger, #ef4444) 20%, var(--ai-panel-border, #e5e7eb));
  }
  
  .permission-icon {
    font-size: 20px;
  }
  
  .permission-warning-icon {
    font-size: 16px;
    color: var(--ai-danger, #ef4444);
  }
  
  .permission-title {
    color: var(--ai-danger, #ef4444);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  
  .permission-field {
    margin-bottom: 12px;
  }
  
  .permission-label {
    font-size: 13px;
    color: var(--ai-text-muted, #6b7280);
    font-weight: 600;
    margin-bottom: 4px;
  }
  
  .permission-value {
    font-size: 13px;
    color: var(--ai-text-muted, #6b7280);
    line-height: 1.6;
  }
  
  .permission-value code {
    background: var(--ai-code-background, #f9fafb);
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--ai-danger, #ef4444);
    font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  
  .permission-command {
    background: var(--ai-code-background, #f9fafb);
    border: 1px solid var(--ai-code-border, #e5e7eb);
    padding: 12px 16px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: var(--ai-text-muted, #6b7280);
    border-radius: 8px;
    margin: 12px 0 18px 0;
    overflow-x: auto;
    line-height: 1.6;
  }
  
  .permission-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  
  .perm-btn {
    background: var(--ai-tool-background, #f9fafb);
    border: 1px solid var(--ai-panel-border, #e5e7eb);
    color: var(--ai-text-muted, #6b7280);
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .perm-btn:hover {
    filter: brightness(0.95);
  }
  
  .perm-btn.deny:hover {
    background: color-mix(in srgb, var(--ai-danger, #ef4444) 12%, transparent);
    border-color: var(--ai-danger, #ef4444);
    color: var(--ai-danger, #ef4444);
  }
  
  .perm-btn.grant {
    background: color-mix(in srgb, var(--ai-accent, #3574f0) 12%, transparent);
    color: var(--ai-accent, #3574f0);
    border-color: color-mix(in srgb, var(--ai-accent, #3574f0) 25%, transparent);
  }
  .perm-btn.grant:hover {
    background: color-mix(in srgb, var(--ai-accent, #3574f0) 20%, transparent);
    border-color: var(--ai-accent, #3574f0);
  }
  
  .perm-btn.always {
    background: color-mix(in srgb, var(--ai-success, #22c55e) 12%, transparent);
    color: var(--ai-success, #22c55e);
    border-color: color-mix(in srgb, var(--ai-success, #22c55e) 25%, transparent);
  }
  .perm-btn.always:hover {
    background: color-mix(in srgb, var(--ai-success, #22c55e) 20%, transparent);
    border-color: var(--ai-success, #22c55e);
  }
  
  .perm-hint {
    font-size: 11px;
    color: var(--ai-text-dim, #9ca3af);
    font-family: 'SF Mono', 'Fira Code', monospace;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .perm-hint-key {
    background: var(--ai-tool-header-background, #f3f4f6);
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid var(--ai-panel-border, #e5e7eb);
  }
`;

@customElement('ai-permission-card')
export class AiPermissionCard extends LitElement {
  static styles = unsafeCSS(PERM_STYLES);

  @property({ type: Object }) request: PermissionRequest | null = null;

  private handleGrant(scope: 'once' | 'always') {
    this.dispatchEvent(new CustomEvent('permission-granted', {
      detail: { scope }, bubbles: true, composed: true,
    }));
  }

  private handleDeny() {
    this.dispatchEvent(new CustomEvent('permission-denied', {
      bubbles: true, composed: true,
    }));
  }

  render() {
    if (!this.request) return '';
    return html`
      <div class="permission-card">
        <div class="permission-header">
          <iconify-icon class="permission-icon" icon="mdi:alert" width="18"></iconify-icon>
          <span class="permission-title">PERMISSION REQUEST: ${this.request.toolName}</span>
        </div>
        <div class="permission-field">
          <div class="permission-label">Operation</div>
          <div class="permission-value">${this.request.reason}</div>
        </div>
        <div class="permission-field">
          <div class="permission-label">Exact Command</div>
          <div class="permission-command">${this.request.command}</div>
        </div>
        <div class="permission-actions">
          <button class="perm-btn deny" @click=${() => this.handleDeny()}>Deny Action</button>
          <button class="perm-btn grant" @click=${() => this.handleGrant('once')}>Grant Once</button>
          <button class="perm-btn always" @click=${() => this.handleGrant('always')}>Always Allow for this Project</button>
          <span class="perm-hint">$ select <span class="perm-hint-key">enter</span> confirm</span>
        </div>
      </div>
    `;
  }
}
