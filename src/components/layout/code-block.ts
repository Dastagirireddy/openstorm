import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { unsafeCSS } from 'lit';
import hljs from 'highlight.js';
import hljsTheme from 'highlight.js/styles/monokai-sublime.css?inline';

const COLLAPSE_THRESHOLD = 12;

const hljsOverrides = css`
  .code-content code.hljs { background: transparent !important; padding: 0 !important; }
  .code-content code.hljs .hljs-keyword,
  .code-content code.hljs .hljs-selector-tag,
  .code-content code.hljs .hljs-name,
  .code-content code.hljs .hljs-attr { color: #f92672 !important; }
  .code-content code.hljs .hljs-string,
  .code-content code.hljs .hljs-type,
  .code-content code.hljs .hljs-built_in { color: #e6db74 !important; }
  .code-content code.hljs .hljs-comment,
  .code-content code.hljs .hljs-deletion { color: #75715e !important; }
  .code-content code.hljs .hljs-number,
  .code-content code.hljs .hljs-literal,
  .code-content code.hljs .hljs-regexp { color: #ae81ff !important; }
  .code-content code.hljs .hljs-title,
  .code-content code.hljs .hljs-section,
  .code-content code.hljs .hljs-selector-class { color: #a6e22e !important; }
  .code-content code.hljs .hljs-symbol,
  .code-content code.hljs .hljs-attribute { color: #66d9ef !important; }
  .code-content code.hljs .hljs-params { color: #f8f8f2 !important; }
`;

@customElement('ai-code-block')
export class AiCodeBlock extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.5em 0;
    }

    .code-block {
      background: var(--code-bg, #0d1117);
      border: 1px solid var(--code-border, #30363d);
      overflow: hidden;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Consolas', monospace;
      border-radius: 6px;
    }

    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.4em 0.75em;
      background: var(--code-header-bg, #161b22);
      border-bottom: 1px solid var(--code-border, #30363d);
      font-size: 11px;
    }

    .code-header-left {
      display: flex;
      align-items: center;
      gap: 0.5em;
    }

    .code-lang {
      color: var(--code-lang-color, #58a6ff);
      font-weight: 500;
      text-transform: lowercase;
    }

    .code-lines {
      color: var(--code-text-dim, #8b949e);
      font-size: 10px;
    }

    .code-actions {
      display: flex;
      align-items: center;
      gap: 0.25em;
    }

    .code-btn {
      background: none;
      border: none;
      color: var(--code-text-dim, #8b949e);
      cursor: pointer;
      padding: 0.25em 0.4em;
      border-radius: 3px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 0.25em;
      font-size: 10px;
      font-family: inherit;
    }

    .code-btn:hover {
      background: var(--code-border, #30363d);
      color: var(--code-text, #e6edf3);
    }

    .code-btn.copied {
      color: var(--code-success, #3fb950);
    }

    .code-btn.expand-btn {
      color: var(--code-lang-color, #58a6ff);
    }

    .code-btn.expand-btn:hover {
      background: rgba(88, 166, 255, 0.1);
    }

    .code-content {
      display: flex;
      overflow-x: auto;
      position: relative;
    }

    .code-content.collapsed {
      max-height: 240px;
      overflow-y: hidden;
    }

    .code-content.collapsed::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 40px;
      background: linear-gradient(transparent, var(--code-bg, #0d1117));
      pointer-events: none;
    }

    .code-line-numbers {
      display: flex;
      flex-direction: column;
      padding: 0.75em 0;
      background: var(--code-header-bg, #161b22);
      border-right: 1px solid var(--code-border, #30363d);
      user-select: none;
      font-size: 11px;
      line-height: 1.5;
      color: var(--code-text-dim, #8b949e);
      text-align: right;
      min-width: 2.5em;
    }

    .code-line-numbers span {
      padding: 0 0.5em;
    }

    .code-content code {
      display: block;
      padding: 0.75em;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
      background: transparent;
      flex: 1;
      color: var(--code-text, #e6edf3);
      white-space: pre;
    }

    .code-content::-webkit-scrollbar {
      height: 6px;
    }

    .code-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .code-content::-webkit-scrollbar-thumb {
      background: var(--code-border, #30363d);
      border-radius: 3px;
    }

    .code-content::-webkit-scrollbar-thumb:hover {
      background: var(--code-text-dim, #8b949e);
    }

    ${unsafeCSS(hljsTheme)}
    ${hljsOverrides}
  `;

  @property({ type: String })
  language = '';

  @property({ type: String })
  code = '';

  @property({ type: Boolean })
  showLineNumbers = true;

  @property({ type: Number })
  maxLinesForNumbers = 3;

  @state()
  private isExpanded = false;

  @state()
  private showPreview = false;

  private highlightedCode = '';
  private lines: string[] = '';
  private displayLanguage = '';

  get isHtml(): boolean {
    return this.language === 'html' || this.language === 'htm';
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('code') || changedProperties.has('language')) {
      this.highlightCode();
    }
  }

  private highlightCode() {
    if (!this.code) {
      this.highlightedCode = '';
      this.lines = [];
      this.displayLanguage = '';
      return;
    }

    this.lines = this.code.split('\n');
    let code = this.code;
    let hasHighlight = false;
    let detectedLang = this.language;

    // Try explicit language first (if provided and valid)
    if (detectedLang && hljs.getLanguage(detectedLang)) {
      try {
        code = hljs.highlight(this.code, { language: detectedLang }).value;
        hasHighlight = true;
      } catch (err) {
        console.error('[CodeBlock] Highlight error:', err);
      }
    } else {
      // Auto-detect language from content
      try {
        const result = hljs.highlightAuto(this.code);
        if (result.language) {
          code = result.value;
          detectedLang = result.language;
          hasHighlight = true;
        }
      } catch (err) {
        console.error('[CodeBlock] Auto-highlight error:', err);
      }
    }

    this.displayLanguage = detectedLang || 'text';
    const langClass = detectedLang ? `language-${detectedLang}` : '';
    const hljsClass = hasHighlight ? 'hljs' : '';
    this.highlightedCode = `<code class="${hljsClass} ${langClass}">${code}</code>`;
  }

  private async copyToClipboard() {
    try {
      await navigator.clipboard.writeText(this.code);
      const btn = this.shadowRoot?.querySelector('.code-copy');
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
      console.error('[CodeBlock] Copy failed:', err);
    }
  }

  private toggleExpand() {
    this.isExpanded = !this.isExpanded;
  }

  private togglePreview() {
    this.showPreview = !this.showPreview;
  }

  private openPreviewInNewTab() {
    const blob = new Blob([this.code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  render() {
    const lineCount = this.lines.length;
    const shouldShowLineNumbers = this.showLineNumbers && lineCount > this.maxLinesForNumbers;
    const canCollapse = lineCount > COLLAPSE_THRESHOLD;
    const showCollapsed = canCollapse && !this.isExpanded;

    return html`
      <div class="code-block">
        <div class="code-header">
          <div class="code-header-left">
            <span class="code-lang">${this.displayLanguage}</span>
            <span class="code-lines">${lineCount} lines</span>
          </div>
          <div class="code-actions">
            ${this.isHtml ? html`
              <button class="code-btn ${this.showPreview ? 'copied' : ''}" @click=${this.togglePreview}>
                <iconify-icon icon="${this.showPreview ? 'lucide:code' : 'lucide:eye'}" width="12"></iconify-icon>
                ${this.showPreview ? 'Code' : 'Preview'}
              </button>
              ${this.showPreview ? html`
                <button class="code-btn" @click=${this.openPreviewInNewTab}>
                  <iconify-icon icon="lucide:external-link" width="12"></iconify-icon>
                </button>
              ` : ''}
            ` : ''}
            ${canCollapse ? html`
              <button class="code-btn expand-btn" @click=${this.toggleExpand}>
                <iconify-icon icon="${this.isExpanded ? 'lucide:minimize-2' : 'lucide:maximize-2'}" width="12"></iconify-icon>
                ${this.isExpanded ? 'Collapse' : 'Expand'}
              </button>
            ` : ''}
            <button class="code-btn" @click=${this.copyToClipboard}>
              <iconify-icon icon="lucide:clipboard" width="12"></iconify-icon>
            </button>
          </div>
        </div>
        ${this.showPreview && this.isHtml ? html`
          <div style="padding: 0; background: white;">
            <iframe 
              srcdoc="${this.code}" 
              style="width: 100%; height: 300px; border: none;"
              sandbox="allow-scripts"
            ></iframe>
          </div>
        ` : html`
          <div class="code-content ${showCollapsed ? 'collapsed' : ''}">
            ${shouldShowLineNumbers ? html`
              <span class="code-line-numbers">
                ${this.lines.map((_, i) => html`<span>${i + 1}</span>`)}
              </span>
            ` : ''}
            ${unsafeHTML(this.highlightedCode)}
          </div>
        `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-code-block': AiCodeBlock;
  }
}
