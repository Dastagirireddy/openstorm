import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import mermaid from 'mermaid';

let mermaidInitialized = false;

async function tryRender(code: string, component: MermaidBlock): Promise<boolean> {
  try {
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const { svg } = await mermaid.render(id, code);
    component.renderedSvg = svg;
    component.error = '';
    return true;
  } catch {
    return false;
  }
}

function fixMermaidSyntax(code: string): string {
  let fixed = code;

  // Fix: escape pipe characters inside node labels that aren't edge labels
  // e.g., A[utils::fibonacci(n)] -> A["utils::fibonacci(n)"]
  fixed = fixed.replace(/\[([^\[\]]*::[^\[\]]*)\]/g, (_, content) => {
    return `["${content.replace(/"/g, "'")}"]`;
  });

  // Fix: escape special chars in node labels
  fixed = fixed.replace(/\[([^\[\]]*[()[\]<>]{1,}[^\[\]]*)\]/g, (_, content) => {
    if (!content.startsWith('"')) {
      return `["${content.replace(/"/g, "'")}"]`;
    }
    return `[${content}]`;
  });

  // Fix: ensure graph/direction declaration exists
  if (!fixed.match(/^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|gantt|pie|gitGraph)/m)) {
    fixed = `flowchart TD\n${fixed}`;
  }

  return fixed;
}

@customElement('mermaid-block')
export class MermaidBlock extends LitElement {
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

    .mermaid-lang {
      color: var(--code-lang-color, #58a6ff);
      font-weight: 500;
    }

    .mermaid-copy {
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

    .mermaid-copy:hover {
      background: var(--code-border, #30363d);
      color: var(--code-text, #e6edf3);
    }

    .mermaid-copy.copied {
      color: var(--code-success, #3fb950);
    }

    .mermaid-content {
      padding: 1em;
      text-align: center;
      overflow-x: auto;
    }

    .mermaid-content :deep(svg) {
      width: 100%;
      height: auto;
      min-height: 100px;
    }

    .mermaid-error {
      padding: 1em;
      color: #f85149;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
    }

    .mermaid-raw {
      text-align: left;
      padding: 0.75em;
      overflow-x: auto;
    }

    .mermaid-raw pre {
      margin: 0;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      line-height: 1.5;
      color: var(--code-text, #e6edf3);
      white-space: pre;
    }
  `;

  @property({ type: String })
  code = '';

  @state()
  private renderedSvg = '';

  @state()
  private error = '';

  async connectedCallback() {
    super.connectedCallback();
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
      });
      mermaidInitialized = true;
    }
    // Read code from script tag if code property is empty
    if (!this.code) {
      const script = this.querySelector('script[type="text/template"]');
      if (script) {
        this.code = script.textContent || '';
      }
    }
    await this.renderMermaid();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('code')) {
      this.renderMermaid();
    }
  }

  private async renderMermaid() {
    if (!this.code) {
      this.renderedSvg = '';
      this.error = '';
      return;
    }

    // Try rendering with the original code
    let success = await tryRender(this.code, this);
    if (success) return;

    // Try common fixes for LLM-generated mermaid
    const fixedCode = fixMermaidSyntax(this.code);
    if (fixedCode !== this.code) {
      success = await tryRender(fixedCode, this);
      if (success) return;
    }

    // All attempts failed - show raw code
    this.renderedSvg = '';
    this.error = '';
  }

  private async copyToClipboard() {
    try {
      await navigator.clipboard.writeText(this.code);
      const btn = this.shadowRoot?.querySelector('.mermaid-copy');
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

  render() {
    const hasContent = this.renderedSvg || this.error || this.code;

    return html`
      <div class="mermaid-container">
        <div class="mermaid-header">
          <span class="mermaid-lang">mermaid</span>
          <button class="mermaid-copy" @click=${this.copyToClipboard}>
            <iconify-icon icon="lucide:clipboard" width="14"></iconify-icon>
          </button>
        </div>
        <div class="mermaid-content">
          ${this.renderedSvg
            ? unsafeHTML(this.renderedSvg)
            : this.code
              ? html`<div class="mermaid-raw"><pre>${this.code}</pre></div>`
              : ''}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mermaid-block': MermaidBlock;
  }
}
