import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { unsafeCSS } from 'lit';
import hljs from 'highlight.js';
import hljsTheme from 'highlight.js/styles/monokai-sublime.css?inline';

/**
 * Code Block Component
 * Renders code with syntax highlighting, line numbers, and copy button
 * 
 * @element code-block
 * 
 * @example
 * <code-block language="rust" code="fn main() {}"></code-block>
 * <code-block language="javascript" .code=${codeString}></code-block>
 */
@customElement('code-block')
export class CodeBlock extends LitElement {
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

    .code-lang {
      color: var(--code-lang-color, #58a6ff);
      font-weight: 500;
      text-transform: lowercase;
    }

    .code-lines {
      color: var(--code-text-dim, #8b949e);
      font-size: 10px;
    }

    .code-copy {
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

    .code-copy:hover {
      background: var(--code-border, #30363d);
      color: var(--code-text, #e6edf3);
    }

    .code-copy.copied {
      color: var(--code-success, #3fb950);
    }

    .code-content {
      display: flex;
      overflow-x: auto;
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

    /* Scrollbar styling */
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
  `;

  @property({ type: String })
  language = '';

  @property({ type: String })
  code = '';

  @property({ type: Boolean })
  showLineNumbers = true;

  @property({ type: Number })
  maxLinesForNumbers = 3;

  private highlightedCode = '';
  private lines: string[] = [];
  private displayLanguage = '';

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

  render() {
    const lineCount = this.lines.length;
    const shouldShowLineNumbers = this.showLineNumbers && lineCount > this.maxLinesForNumbers;

    return html`
      <div class="code-block">
        <div class="code-header">
          <span class="code-lang">${this.displayLanguage}</span>
          <button class="code-copy" @click=${this.copyToClipboard}>
            <iconify-icon icon="lucide:clipboard" width="14"></iconify-icon>
          </button>
        </div>
        <div class="code-content">
          ${shouldShowLineNumbers ? html`
            <span class="code-line-numbers">
              ${this.lines.map((_, i) => html`<span>${i + 1}</span>`)}
            </span>
          ` : ''}
          ${unsafeHTML(this.highlightedCode)}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'code-block': CodeBlock;
  }
}
