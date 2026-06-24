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
    background: #1a1215;
    border: 1px solid #3d2025;
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
    border-bottom: 1px solid #3d2025;
  }
  
  .permission-icon {
    font-size: 20px;
  }
  
  .permission-warning-icon {
    font-size: 16px;
    color: #e06c75;
  }
  
  .permission-title {
    color: #e06c75;
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
    color: #abb2bf;
    font-weight: 600;
    margin-bottom: 4px;
  }
  
  .permission-value {
    font-size: 13px;
    color: #abb2bf;
    line-height: 1.6;
  }
  
  .permission-value code {
    background: #212327;
    padding: 2px 6px;
    border-radius: 4px;
    color: #e06c75;
    font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  
  .permission-command {
    background: #0d0f12;
    border: 1px solid #1e2128;
    padding: 12px 16px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: #abb2bf;
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
    background: #1e2128;
    border: 1px solid #2d3139;
    color: #abb2bf;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .perm-btn:hover {
    filter: brightness(1.2);
  }
  
  .perm-btn.deny:hover {
    background: #2c1418;
    border-color: #e06c75;
    color: #e06c75;
  }
  
  .perm-btn.grant {
    background: #1a2332;
    color: #60a5fa;
    border-color: #1a2a4a;
  }
  .perm-btn.grant:hover {
    background: #1e2a3e;
    border-color: #60a5fa;
  }
  
  .perm-btn.always {
    background: #1a2322;
    color: #4ade80;
    border-color: #1a3a2a;
  }
  .perm-btn.always:hover {
    background: #1e2e2c;
    border-color: #4ade80;
  }
  
  .perm-hint {
    font-size: 11px;
    color: #5c6370;
    font-family: 'SF Mono', 'Fira Code', monospace;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .perm-hint-key {
    background: #21252b;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #3e4451;
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
          <span class="permission-icon">\u26A0\uFE0F</span>
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
