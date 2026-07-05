import { html, css, LitElement, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import 'iconify-icon';
import hljs from 'highlight.js';
import hljsTheme from 'highlight.js/styles/monokai-sublime.css?inline';

const hljsOverrides = css`
  code.hljs { background: transparent !important; padding: 0 !important; }
  code.hljs .hljs-keyword,
  code.hljs .hljs-selector-tag,
  code.hljs .hljs-name,
  code.hljs .hljs-attr { color: #f92672 !important; }
  code.hljs .hljs-string,
  code.hljs .hljs-type,
  code.hljs .hljs-built_in { color: #e6db74 !important; }
  code.hljs .hljs-comment,
  code.hljs .hljs-deletion { color: #75715e !important; }
  code.hljs .hljs-number,
  code.hljs .hljs-literal,
  code.hljs .hljs-regexp { color: #ae81ff !important; }
  code.hljs .hljs-title,
  code.hljs .hljs-section,
  code.hljs .hljs-selector-class { color: #a6e22e !important; }
  code.hljs .hljs-symbol,
  code.hljs .hljs-attribute { color: #66d9ef !important; }
  code.hljs .hljs-params { color: #fd971f !important; }
  code.hljs .hljs-variable { color: #f8f8f2 !important; }
`;

@customElement('os-code-block')
export class OSCodeBlock extends LitElement {
  static styles = [
    unsafeCSS(hljsTheme),
    hljsOverrides,
    css`
    :host { display: block; }
    .code-block {
      margin: 12px 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #3e3d32;
      background: #272822;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #1e1f1c;
      border-bottom: 1px solid #3e3d32;
    }
    .lang-label {
      font-size: 12px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: #75715e;
    }
    .copy-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      background: transparent;
      color: #75715e;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s ease;
    }
    .copy-btn:hover {
      background: #3e3d32;
      color: #f8f8f2;
    }
    .copy-btn.copied {
      color: #a6e22e;
    }
    .code-body {
      display: flex;
      overflow-x: auto;
    }
    .line-numbers {
      display: flex;
      flex-direction: column;
      padding: 12px 0;
      background: #1e1f1c;
      border-right: 1px solid #3e3d32;
      user-select: none;
    }
    .line-number {
      padding: 0 12px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #75715e;
      text-align: right;
      min-width: 40px;
    }
    pre {
      margin: 0;
      padding: 12px 16px;
      flex: 1;
      overflow-x: auto;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: #f8f8f2;
    }
    code {
      background: none;
      padding: 0;
      border: none;
    }
    .code-line {
      display: block;
    }
    `
  ];

  @property({ type: String }) code = '';
  @property({ type: String }) language = '';
  @state() private copied = false;

  private get highlightedCode(): string {
    if (!this.code) return '';
    const lang = this.language && hljs.getLanguage(this.language) ? this.language : 'plaintext';
    try {
      return hljs.highlight(this.code, { language: lang }).value;
    } catch {
      return this.code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }

  private get lineCount(): number {
    return this.code.split('\n').length;
  }

  private get langDisplay(): string {
    if (!this.language) return 'Code';
    return this.language.charAt(0).toUpperCase() + this.language.slice(1);
  }

  private async copyCode() {
    try {
      await navigator.clipboard.writeText(this.code);
      this.copied = true;
      setTimeout(() => { this.copied = false; }, 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = this.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.copied = true;
      setTimeout(() => { this.copied = false; }, 2000);
    }
  }

  render() {
    const lines = this.highlightedCode.split('\n');
    const lineNumbers = Array.from({ length: this.lineCount }, (_, i) => i + 1);

    return html`
      <div class="code-block">
        <div class="header">
          <span class="lang-label">${this.langDisplay} — ${this.lineCount} lines</span>
          <button class="copy-btn ${this.copied ? 'copied' : ''}" @click=${this.copyCode} title="Copy code">
            ${this.copied
              ? html`<iconify-icon icon="mdi:check" width="14"></iconify-icon>`
              : html`<iconify-icon icon="mdi:content-copy" width="14"></iconify-icon>`
            }
          </button>
        </div>
        <div class="code-body">
          <div class="line-numbers">
            ${lineNumbers.map(n => html`<span class="line-number">${n}</span>`)}
          </div>
          <pre><code class="hljs">${lines.map(line => html`<span class="code-line">${unsafeHTML(line || ' ')}</span>`)}</code></pre>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'os-code-block': OSCodeBlock;
  }
}
