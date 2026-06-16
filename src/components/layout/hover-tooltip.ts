/**
 * Hover Tooltip - Global LSP hover tooltip component
 *
 * Displays LSP hover information using markdown-it for rendering
 * Positioned absolutely based on cursor location
 */

import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

export interface HoverPosition {
  x: number;
  y: number;
  editorRect: DOMRect;
}

export interface HoverData {
  html: string;
  contents?: string;
  position: HoverPosition;
  languageId?: string;
}

@customElement('hover-tooltip')
export class HoverTooltip extends TailwindElement() {
  @state() private visible: boolean = false;
  @state() private position: { x: number; y: number } = { x: 0, y: 0 };
  @state() private renderedHtml: string = '';

  private tooltipEl: HTMLElement | null = null;
  private hideTimeout: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('lsp-hover', this._handleHover as EventListener);
    document.addEventListener('mousemove', this._handleMouseMove as EventListener);
    document.addEventListener('scroll', this._handleScroll, true);
    document.addEventListener('keydown', this._handleKeyDown as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('lsp-hover', this._handleHover as EventListener);
    document.removeEventListener('mousemove', this._handleMouseMove as EventListener);
    document.removeEventListener('scroll', this._handleScroll, true);
    document.removeEventListener('keydown', this._handleKeyDown as EventListener);
  }

  private _handleHover = (e: Event) => {
    const customEvent = e as CustomEvent<HoverData>;
    const detail = customEvent.detail;

    this.position = { x: detail.position.x, y: detail.position.y };

    // Render markdown to HTML using markdown-it
    const markdownContent = detail.contents || detail.html || '';
    const rawHtml = md.render(markdownContent);
    // Apply syntax highlighting to code blocks
    this.renderedHtml = this._highlightCodeBlocks(rawHtml);

    this.visible = true;

    if (this.hideTimeout) {
      window.clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    requestAnimationFrame(() => this._positionTooltip(detail.position));
  };

  private _handleMouseMove = (e: MouseEvent) => {
    if (!this.visible) return;

    // Check if mouse moved significantly from hover position
    const dx = Math.abs(e.clientX - this.position.x);
    const dy = Math.abs(e.clientY - this.position.y);

    if (dx > 100 || dy > 100) {
      this._scheduleHide();
    }
  };

  private _handleScroll = () => {
    this._hide();
  };

  private _handleKeyDown = (e: KeyboardEvent) => {
    if (this.visible && e.key === 'Escape') {
      this._hide();
    }
  };

  private _scheduleHide(): void {
    if (this.hideTimeout) return;
    this.hideTimeout = window.setTimeout(() => {
      this._hide();
    }, 150);
  }

  private _hide(): void {
    this.visible = false;
    this.renderedHtml = '';
    if (this.hideTimeout) {
      window.clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  /**
   * Apply syntax highlighting to <pre><code> blocks in HTML.
   * Uses placeholder extraction to avoid regex corruption.
   */
  private _highlightCodeBlocks(html: string): string {
    return html.replace(
      /<pre><code(?:\s+class="[^"]*")?>([\s\S]*?)<\/code><\/pre>/g,
      (_match, codeContent: string) => {
        let code = codeContent;

        // Decode HTML entities
        code = code
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"');

        // Step 1: Extract comments and strings into placeholders
        const placeholders: string[] = [];
        const placeholder = (text: string, cls: string) => {
          const idx = placeholders.length;
          placeholders.push(`<span class="${cls}">${text}</span>`);
          return `\x00${idx}\x00`;
        };

        // Multi-line comments
        code = code.replace(/\/\*[\s\S]*?\*\//g, (m) => placeholder(m, 'hl-comment'));
        // Single-line comments
        code = code.replace(/\/\/.*$/gm, (m) => placeholder(m, 'hl-comment'));
        // Strings (double, single, backtick)
        code = code.replace(/"(?:[^"\\]|\\.)*"/g, (m) => placeholder(m, 'hl-str'));
        code = code.replace(/'(?:[^'\\]|\\.)*'/g, (m) => placeholder(m, 'hl-str'));
        code = code.replace(/`(?:[^`\\]|\\.)*`/g, (m) => placeholder(m, 'hl-str'));

        // Step 2: Highlight keywords, types, numbers on the safe remaining text
        code = code.replace(
          /\b(const|let|var|function|async|await|return|if|else|for|while|class|interface|type|enum|import|export|from|extends|implements|new|this|typeof|instanceof|in|of|void|null|undefined|true|false|try|catch|throw|switch|case|break|continue|default|yield|static|public|private|protected|readonly|abstract|declare|fn|impl|struct|trait|use|mod|pub|crate|self|Self|mut|ref|dyn|where|as|loop|unsafe)\b/g,
          '<span class="hl-kw">$1</span>'
        );
        code = code.replace(
          /\b(string|number|boolean|any|never|unknown|Object|Array|Promise|Map|Set|Vec|HashMap|Option|Result|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|str)\b/g,
          '<span class="hl-type">$1</span>'
        );
        code = code.replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span class="hl-type">$1</span>');
        code = code.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
        code = code.replace(/([a-zA-Z_][a-zA-Z0-9_]*)\(/g, '<span class="hl-fn">$1</span>(');
        code = code.replace(/\.([a-zA-Z_][a-zA-Z0-9_]*)/g, '.<span class="hl-prop">$1</span>');

        // Step 3: Restore placeholders
        code = code.replace(/\x00(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx)]);

        // Escape any remaining HTML in the code (not in spans)
        // Actually, the code is already safe since we extracted strings/comments first

        return `<pre><code class="highlighted">${code}</code></pre>`;
      }
    );
  }

  private _setTooltipRef = (el: HTMLElement) => {
    this.tooltipEl = el;
  };

  private _positionTooltip(position: HoverPosition): void {
    if (!this.tooltipEl) return;

    const tooltip = this.tooltipEl;
    const padding = 8;

    // Reset dimensions for measurement
    tooltip.style.left = '0';
    tooltip.style.top = '0';
    tooltip.style.maxWidth = '450px';
    tooltip.style.maxHeight = '280px';

    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x + padding;
    let y = position.y + padding;

    // Check right edge - flip to left if needed
    if (x + tooltipRect.width > viewportWidth - padding) {
      x = position.x - tooltipRect.width - padding;
    }

    // Check left edge
    if (x < padding) {
      x = padding;
    }

    // Check bottom edge - flip to above if needed
    if (y + tooltipRect.height > viewportHeight - padding) {
      y = position.y - tooltipRect.height - padding;
    }

    // Check top edge
    if (y < padding) {
      y = padding;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  render() {
    if (!this.visible) return html``;

    // Just render the HTML from backend
    return html`
      <div
        class="hover-tooltip"
        style="position: fixed; left: ${this.position.x}px; top: ${this.position.y}px; z-index: 10000;"
        @mouseenter=${() => { if (this.hideTimeout) { window.clearTimeout(this.hideTimeout); this.hideTimeout = null; } }}
        @mouseleave=${() => { this._scheduleHide(); }}
        ${this._setTooltipRef}
      >
        <div class="hover-tooltip-content">
          <div class="hover-body">${unsafeHTML(this.renderedHtml)}</div>
        </div>
      </div>
    `;
  }

  static styles = css`
    .hover-tooltip {
      pointer-events: auto;
    }

    .hover-tooltip-content {
      min-width: 280px;
      max-width: 500px;
      max-height: 400px;
      overflow: auto;
      border: 1px solid var(--app-input-border);
      border-radius: 8px;
      background: var(--app-bg);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
      padding: 12px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--app-foreground);
    }

    /* markdown-it output styles */
    .hover-tooltip-content p {
      margin: 0 0 12px 0;
    }

    .hover-tooltip-content p:last-child {
      margin: 0;
    }

    /* Code blocks (fenced code) */
    .hover-tooltip-content pre {
      background: var(--app-toolbar-hover);
      border-radius: 4px;
      padding: 10px 12px;
      overflow-x: auto;
      margin: 10px 0;
      font-size: 11px;
      line-height: 1.5;
      border: 1px solid var(--app-input-border);
    }

    .hover-tooltip-content pre code {
      background: transparent;
      padding: 0;
      font-family: 'Fira Code', 'JetBrains Mono', monospace;
      color: var(--app-foreground);
    }

    /* Inline code */
    .hover-tooltip-content code {
      background: var(--app-toolbar-hover);
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid var(--app-input-border);
      color: var(--app-type);
      font-family: 'Fira Code', 'JetBrains Mono', monospace;
      font-size: 11px;
    }

    .hover-tooltip-content pre code {
      background: transparent;
      padding: 0;
      border: none;
    }

    /* Lists */
    .hover-tooltip-content ul,
    .hover-tooltip-content ol {
      margin: 10px 0;
      padding-left: 20px;
    }

    .hover-tooltip-content li {
      margin-bottom: 6px;
    }

    /* Links */
    .hover-tooltip-content a {
      color: var(--app-button-background);
      text-decoration: none;
    }

    .hover-tooltip-content a:hover {
      text-decoration: underline;
    }

    /* Emphasis */
    .hover-tooltip-content strong {
      font-weight: 600;
    }

    .hover-tooltip-content em {
      font-style: italic;
    }

    /* Headers */
    .hover-tooltip-content h1,
    .hover-tooltip-content h2,
    .hover-tooltip-content h3,
    .hover-tooltip-content h4 {
      font-size: 13px;
      font-weight: 600;
      margin: 10px 0 6px;
    }

    /* Horizontal rule */
    .hover-tooltip-content hr {
      border: none;
      border-top: 1px solid var(--app-input-border);
      margin: 12px 0;
    }

    /* Blockquotes */
    .hover-tooltip-content blockquote {
      border-left: 3px solid var(--app-input-border);
      padding-left: 12px;
      margin: 10px 0;
      color: var(--app-disabled-foreground);
    }

    /* Tables */
    .hover-tooltip-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 10px 0;
      font-size: 11px;
    }

    .hover-tooltip-content th,
    .hover-tooltip-content td {
      border: 1px solid var(--app-input-border);
      padding: 6px 8px;
      text-align: left;
    }

    .hover-tooltip-content th {
      background: var(--app-toolbar-hover);
      font-weight: 600;
    }

    /* Syntax highlighting classes (must be in shadow DOM) */
    .hl-kw {
      color: var(--app-keyword);
      font-weight: 500;
    }
    .hl-type {
      color: var(--app-type);
    }
    .hl-str {
      color: var(--app-string);
    }
    .hl-num {
      color: var(--app-number);
    }
    .hl-bool {
      color: var(--app-boolean);
    }
    .hl-fn {
      color: var(--app-foreground);
      font-weight: 600;
    }
    .hl-prop {
      color: var(--app-foreground);
      font-style: italic;
    }
    .hl-comment {
      color: var(--app-disabled-foreground);
      font-style: italic;
    }
  `;
}
