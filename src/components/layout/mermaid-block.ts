import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderMermaid } from '../../lib/mermaid/mermaid-client.js';

@customElement('ai-mermaid')
export class AiMermaid extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.5em 0;
    }

    .mermaid-container {
      background: var(--code-bg, #0d1117);
      border: 1px solid var(--code-border, #30363d);
      border-radius: 6px;
      overflow: hidden;
    }

    .mermaid-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.4em 0.75em;
      background: var(--code-header-bg, #161b22);
      border-bottom: 1px solid var(--code-border, #30363d);
      font-size: 11px;
    }

    .mermaid-header-left {
      display: flex;
      align-items: center;
      gap: 0.5em;
    }

    .mermaid-lang {
      color: var(--code-lang-color, #58a6ff);
      font-weight: 500;
    }

    .mermaid-toggle {
      background: none;
      border: 1px solid var(--code-border, #30363d);
      color: var(--code-text-dim, #8b949e);
      cursor: pointer;
      padding: 0.15em 0.5em;
      border-radius: 3px;
      font-size: 10px;
      font-family: inherit;
      transition: all 0.15s ease;
    }

    .mermaid-toggle:hover {
      background: var(--code-border, #30363d);
      color: var(--code-text, #e6edf3);
    }

    .mermaid-toggle.active {
      background: var(--code-border, #30363d);
      color: var(--code-text, #e6edf3);
    }

    .mermaid-actions {
      display: flex;
      align-items: center;
      gap: 0.25em;
    }

    .mermaid-btn {
      background: none;
      border: none;
      color: var(--code-text-dim, #8b949e);
      cursor: pointer;
      padding: 0.25em;
      border-radius: 3px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mermaid-btn:hover {
      background: var(--code-border, #30363d);
      color: var(--code-text, #e6edf3);
    }

    .mermaid-btn.copied {
      color: var(--code-success, #3fb950);
    }

    .mermaid-content {
      padding: 1em;
      text-align: center;
      overflow-x: auto;
    }

    .mermaid-content svg {
      width: 100%;
      height: auto;
      min-height: 100px;
    }

    .mermaid-source {
      text-align: left;
      padding: 0.75em;
      overflow-x: auto;
    }

    .mermaid-source pre {
      margin: 0;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      line-height: 1.5;
      color: var(--code-text, #e6edf3);
      white-space: pre;
    }

    .mermaid-error {
      padding: 1em;
      color: #f85149;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
    }

    .mermaid-placeholder {
      padding: 2em;
      text-align: center;
      color: var(--code-text-dim, #8b949e);
      font-size: 12px;
    }
  `;

  @property({ type: String })
  code = '';

  @state()
  private renderedSvg = '';

  @state()
  private error = '';

  @state()
  private isVisible = false;

  @state()
  private hasRendered = false;

  @state()
  private showSource = false;

  private observer: IntersectionObserver | null = null;

  connectedCallback() {
    super.connectedCallback();
    if (!this.code) {
      const script = this.querySelector('script[type="text/template"]');
      if (script) {
        this.code = script.textContent || '';
      }
    }
    this.setupIntersectionObserver();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.observer?.disconnect();
    this.observer = null;
  }

  private setupIntersectionObserver() {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !this.isVisible) {
            this.isVisible = true;
            if (this.code && !this.hasRendered) {
              this.scheduleRender();
            }
          }
        }
      },
      { rootMargin: '200px' }
    );
    this.observer.observe(this);
  }

  private scheduleRender() {
    if (this.hasRendered) return;
    this.hasRendered = true;
    this.renderDiagram();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('code') && this.isVisible) {
      this.hasRendered = false;
      this.renderDiagram();
    }
  }

  private async renderDiagram() {
    if (!this.code) {
      this.renderedSvg = '';
      this.error = '';
      return;
    }

    try {
      const svg = await renderMermaid(this.code);
      if (svg) {
        this.renderedSvg = svg;
        this.error = '';
      } else {
        this.renderedSvg = '';
        this.error = '';
      }
    } catch (err: any) {
      console.error('[MermaidBlock] Render error:', err);
      this.renderedSvg = '';
      this.error = err?.message || 'Mermaid render failed';
    }
  }

  private toggleSource() {
    this.showSource = !this.showSource;
  }

  private async copyToClipboard() {
    try {
      await navigator.clipboard.writeText(this.code);
      const btn = this.shadowRoot?.querySelector('.mermaid-btn');
      if (btn) {
        const icon = btn.querySelector('iconify-icon');
        if (icon) icon.setAttribute('icon', 'lucide:check');
        btn.classList.add('copied');
        setTimeout(() => {
          if (icon) icon.setAttribute('icon', 'lucide:clipboard');
          btn.classList.remove('copied');
        }, 2000);
      }
    } catch (err) {
      console.error('[MermaidBlock] Copy failed:', err);
    }
  }

  private renderDiagramContent() {
    if (this.renderedSvg) {
      return unsafeHTML(this.renderedSvg);
    }
    if (this.error) {
      return html`<div class="mermaid-error">${this.error}</div>`;
    }
    if (!this.isVisible) {
      return html`<div class="mermaid-placeholder">Loading diagram...</div>`;
    }
    return html`<div class="mermaid-placeholder">No diagram to display</div>`;
  }

  private renderSourceContent() {
    return html`<div class="mermaid-source"><pre>${this.code}</pre></div>`;
  }

  render() {
    const hasRendered = !!this.renderedSvg;

    return html`
      <div class="mermaid-container">
        <div class="mermaid-header">
          <div class="mermaid-header-left">
            <span class="mermaid-lang">mermaid</span>
            ${hasRendered ? html`
              <button
                class="mermaid-toggle ${this.showSource ? 'active' : ''}"
                @click=${this.toggleSource}
              >
                ${this.showSource ? 'Diagram' : 'Source'}
              </button>
            ` : ''}
          </div>
          <div class="mermaid-actions">
            <button class="mermaid-btn" @click=${this.copyToClipboard}>
              <iconify-icon icon="lucide:clipboard" width="14"></iconify-icon>
            </button>
          </div>
        </div>
        <div class="mermaid-content">
          ${this.showSource
            ? this.renderSourceContent()
            : this.renderDiagramContent()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-mermaid': AiMermaid;
  }
}
