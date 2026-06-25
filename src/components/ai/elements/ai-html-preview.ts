import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('ai-html-preview')
export class AiHtmlPreview extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.75em 0;
    }

    .preview-container {
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 8px;
      overflow: hidden;
    }

    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--ai-tool-background, #f9fafb);
      border-bottom: 1px solid var(--ai-panel-border, #e5e7eb);
    }

    .preview-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--ai-text, #111827);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .preview-actions {
      display: flex;
      gap: 8px;
    }

    .preview-btn {
      background: none;
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--ai-text-dim, #9ca3af);
      transition: all 0.15s ease;
    }

    .preview-btn:hover {
      background: var(--ai-panel-border, #e5e7eb);
      color: var(--ai-text, #111827);
    }

    .preview-btn.active {
      background: var(--ai-primary, #3574f0);
      border-color: var(--ai-primary, #3574f0);
      color: white;
    }

    .preview-frame {
      width: 100%;
      height: 300px;
      border: none;
      background: white;
    }

    .preview-frame.dark {
      background: #1e1e1e;
    }

    .source-view {
      padding: 12px;
      background: var(--ai-code-bg, #1e1e1e);
      color: #e5e5e5;
      font-family: 'SF Mono', 'Monaco', monospace;
      font-size: 12px;
      line-height: 1.5;
      overflow: auto;
      max-height: 300px;
      white-space: pre-wrap;
      word-break: break-all;
    }
  `;

  @property({ type: String })
  code = '';

  @property({ type: Boolean, attribute: 'dark-mode' })
  darkMode = false;

  @state()
  private showPreview = true;

  @state()
  private iframeSrc = '';

  connectedCallback() {
    super.connectedCallback();
    this.updateIframeSrc();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('code')) {
      this.updateIframeSrc();
    }
  }

  private updateIframeSrc() {
    if (!this.code) {
      this.iframeSrc = '';
      return;
    }

    const blob = new Blob([this.code], { type: 'text/html' });
    this.iframeSrc = URL.createObjectURL(blob);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.iframeSrc) {
      URL.revokeObjectURL(this.iframeSrc);
    }
  }

  private toggleView() {
    this.showPreview = !this.showPreview;
  }

  private openInNewTab() {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(this.code);
      win.document.close();
    }
  }

  render() {
    return html`
      <div class="preview-container">
        <div class="preview-header">
          <span class="preview-title">
            <iconify-icon icon="lucide:eye" width="14"></iconify-icon>
            HTML Preview
          </span>
          <div class="preview-actions">
            <button 
              class="preview-btn ${this.showPreview ? 'active' : ''}" 
              @click=${this.toggleView}
            >
              <iconify-icon icon="lucide:eye" width="12"></iconify-icon>
              Preview
            </button>
            <button 
              class="preview-btn ${!this.showPreview ? 'active' : ''}" 
              @click=${this.toggleView}
            >
              <iconify-icon icon="lucide:code" width="12"></iconify-icon>
              Source
            </button>
            <button class="preview-btn" @click=${this.openInNewTab}>
              <iconify-icon icon="lucide:external-link" width="12"></iconify-icon>
              Open
            </button>
          </div>
        </div>
        ${this.showPreview
          ? html`
            <iframe 
              class="preview-frame ${this.darkMode ? 'dark' : ''}" 
              src="${this.iframeSrc}"
              sandbox="allow-scripts allow-same-origin"
            ></iframe>
          `
          : html`
            <pre class="source-view">${this.code}</pre>
          `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-html-preview': AiHtmlPreview;
  }
}
