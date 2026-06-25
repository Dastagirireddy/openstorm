import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('ai-math')
export class AiMath extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.75em 0;
    }

    .math-block {
      padding: 16px;
      background: var(--ai-tool-background, #f9fafb);
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 8px;
      overflow-x: auto;
      text-align: center;
    }

    .math-inline {
      display: inline;
      padding: 0 4px;
    }

    .math-error {
      color: var(--ai-error, #ef4444);
      font-size: 12px;
      padding: 8px;
      background: var(--ai-tool-background, #f9fafb);
      border: 1px solid var(--ai-error, #ef4444);
      border-radius: 4px;
    }

    .math-loading {
      color: var(--ai-text-dim, #9ca3af);
      font-size: 12px;
      font-style: italic;
    }
  `;

  @property({ type: String })
  latex = '';

  @property({ type: Boolean })
  inline = false;

  @state()
  private rendered = '';

  @state()
  private error = '';

  private katexLoaded = false;

  connectedCallback() {
    super.connectedCallback();
    this.loadKaTeX();
  }

  private async loadKaTeX() {
    if (this.katexLoaded || (window as any).katex) {
      this.renderLatex();
      return;
    }

    try {
      // Load KaTeX CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
      document.head.appendChild(link);

      // Load KaTeX JS
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
      script.onload = () => {
        this.katexLoaded = true;
        this.renderLatex();
      };
      document.head.appendChild(script);
    } catch (err) {
      this.error = 'Failed to load KaTeX';
    }
  }

  private renderLatex() {
    const katex = (window as any).katex;
    if (!katex || !this.latex) return;

    try {
      this.rendered = katex.renderToString(this.latex, {
        displayMode: !this.inline,
        throwOnError: false,
        output: 'html',
      });
      this.error = '';
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'LaTeX rendering error';
    }
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('latex') && this.katexLoaded) {
      this.renderLatex();
    }
  }

  render() {
    if (this.error) {
      return html`<div class="math-error">${this.error}</div>`;
    }

    if (!this.rendered) {
      return html`<span class="math-loading">Loading math...</span>`;
    }

    if (this.inline) {
      return html`<span class="math-inline" .innerHTML=${this.rendered}></span>`;
    }

    return html`
      <div class="math-block" .innerHTML=${this.rendered}></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-math': AiMath;
  }
}
