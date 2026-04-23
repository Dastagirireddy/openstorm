/**
 * Hover Tooltip - Global LSP hover tooltip component
 *
 * Displays LSP hover information using pre-rendered HTML from backend
 * Positioned absolutely based on cursor location
 */

import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

/**
 * Apply syntax highlighting to HTML content
 * Highlights code patterns within text content (not inside existing tags)
 */
function highlightCodeInHtml(html: string): string {
  // Don't process if no code-like patterns
  if (!html.match(/\b(fn|let|const|use|impl|struct|trait|pub|crate|mod|if|else|for|while|match|return|async|await|mut|ref|dyn|where|Self|Option|Result|Vec|HashMap|String|Box|Arc|Rc|Ref|RefCell|println|writeln|format|unwrap|expect|unwrap_or|unwrap_or_else|unwrap_err|unwrap_or_default)\b/)) {
    return html;
  }

  // Keywords
  html = html.replace(/\b(fn|function|const|let|var|async|await|return|if|else|for|while|class|interface|type|enum|import|export|from|extends|implements|new|this|typeof|instanceof|in|of|void|null|undefined|true|false|try|catch|throw|switch|case|break|continue|default|yield|static|public|private|protected|readonly|abstract|declare|module|namespace|require|keyof|infer|pub|crate|self|Self|mut|ref|dyn|where|trait|impl|struct|use|mod|unsafe|match|as|box|loop|macro_rules)\b/g, '<span class="hl-kw">$1</span>');

  // Types
  html = html.replace(/\b(string|number|boolean|any|never|unknown|Option|Result|Vec|HashMap|HashSet|BTreeMap|BTreeSet|Rc|Arc|Box|Cell|Ref|RefCell|RefMut|Mutex|MutexGuard|RwLock|Path|PathBuf|OsStr|OsString|CString|CStr|Promise|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Date|RegExp|Error|JSON|Math|Console|Function|Write|stdout|stderr|stdin|File|BufReader|BufWriter|IoError|Result|None|Some|Ok|Err)\b/g, '<span class="hl-type">$1</span>');

  // Function calls
  html = html.replace(/([a-zA-Z_][a-zA-Z0-9_]*)(\(|!)/g, '<span class="hl-fn">$1</span>$2');

  // Strings (simplified - won't work inside HTML attributes)
  html = html.replace(/&quot;([^&]*?)&quot;/g, '<span class="hl-str">&quot;$1&quot;</span>');

  return html;
}

export interface HoverPosition {
  x: number;
  y: number;
  editorRect: DOMRect;
}

export interface HoverData {
  html: string;          // Pre-rendered HTML from backend
  contents?: string;     // Raw markdown (for debugging)
  position: HoverPosition;
  languageId?: string;
}

@customElement('hover-tooltip')
export class HoverTooltip extends TailwindElement() {
  @state() private visible: boolean = false;
  @state() private position: { x: number; y: number } = { x: 0, y: 0 };
  @state() private renderedHtml: string = '';

  private tooltipRef: HTMLElement | null = null;
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
    const { html, contents, position } = customEvent.detail;

    this.position = { x: position.x, y: position.y };
    // Use pre-rendered HTML from backend, apply syntax highlighting, fall back to raw contents
    const rawHtml = html || contents || '';
    this.renderedHtml = highlightCodeInHtml(rawHtml);
    this.visible = true;

    // Clear any pending hide timeout
    if (this.hideTimeout) {
      window.clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Position on next frame
    requestAnimationFrame(() => this._positionTooltip(position));
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

  private _positionTooltip(position: HoverPosition): void {
    if (!this.tooltipRef) return;

    const tooltip = this.tooltipRef;
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

    // Debug: log the actual rendered HTML
    console.log('[HoverTooltip] Rendering HTML:', this.renderedHtml.substring(0, 200));

    return html`
      <div
        ${this.tooltipRef = (el: HTMLElement) => { this.tooltipRef = el; }}
        class="hover-tooltip"
        style="position: fixed; left: ${this.position.x}px; top: ${this.position.y}px; z-index: 10000;"
        @mouseenter=${() => { if (this.hideTimeout) { window.clearTimeout(this.hideTimeout); this.hideTimeout = null; } }}
        @mouseleave=${() => { this._scheduleHide(); }}
      >
        <div class="tooltip-content">${unsafeHTML(this.renderedHtml)}</div>
      </div>
    `;
  }

  static styles = css`
    .hover-tooltip {
      pointer-events: auto;
    }

    .tooltip-content {
      max-width: 450px;
      max-height: 280px;
      overflow: auto;
      padding: 8px 12px;
      border: 1px solid var(--app-input-border);
      background: var(--app-bg);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.06);
      font-family: 'Fira Code', 'JetBrains Mono', monospace;
      font-size: 11px;
      line-height: 1.6;
      color: var(--app-foreground);
    }

    /* Code blocks */
    .tooltip-content .code-block {
      background: var(--app-toolbar-hover);
      border-radius: 4px;
      padding: 8px 10px;
      overflow: auto;
      margin: 8px 0;
      font-size: 10px;
      line-height: 1.4;
      border: 1px solid var(--app-input-border);
    }

    .tooltip-content .code-block code {
      background: transparent;
      padding: 0;
      color: inherit;
      font-family: 'Fira Code', 'JetBrains Mono', monospace;
    }

    /* Inline code pills */
    .tooltip-content .code-pill {
      background: var(--app-toolbar-hover);
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid var(--app-input-border);
      color: var(--app-type);
      font-family: 'Fira Code', 'JetBrains Mono', monospace;
      font-size: 10px;
    }

    /* Syntax highlighting */
    .tooltip-content .hl-kw { color: var(--app-keyword); }
    .tooltip-content .hl-type { color: var(--app-type); }
    .tooltip-content .hl-str { color: var(--app-string); }
    .tooltip-content .hl-num { color: var(--app-number); }
    .tooltip-content .hl-bool { color: var(--app-boolean); }
    .tooltip-content .hl-fn { color: var(--app-foreground); font-weight: 600; }
    .tooltip-content .hl-prop { color: var(--app-foreground); font-style: italic; }
    .tooltip-content .hl-comment { color: var(--app-disabled-foreground); font-style: italic; }

    /* Paragraphs */
    .tooltip-content p {
      margin: 0 0 8px 0;
    }
    .tooltip-content p:last-child { margin: 0; }

    /* Lists */
    .tooltip-content ul {
      margin: 8px 0;
      padding-left: 20px;
    }
    .tooltip-content li {
      margin-bottom: 4px;
    }

    /* Links */
    .tooltip-content a {
      color: var(--app-button-background);
      text-decoration: none;
    }
    .tooltip-content a:hover {
      text-decoration: underline;
    }

    /* Emphasis */
    .tooltip-content strong {
      font-weight: 600;
      color: var(--app-foreground);
    }
    .tooltip-content em {
      font-style: italic;
      color: var(--app-disabled-foreground);
    }

    /* Blockquotes */
    .tooltip-content blockquote {
      margin: 8px 0;
      padding: 6px 10px 6px 12px;
      border-left: 3px solid var(--app-button-background);
      background: var(--app-toolbar-hover);
      border-radius: 0 4px 4px 0;
      color: var(--app-disabled-foreground);
      font-style: italic;
    }

    /* Headers */
    .tooltip-content h1 {
      font-size: 13px;
      font-weight: 600;
      margin: 10px 0 6px;
    }
    .tooltip-content h2 {
      font-size: 12px;
      font-weight: 600;
      margin: 8px 0 4px;
    }
    .tooltip-content h3,
    .tooltip-content h4,
    .tooltip-content h5,
    .tooltip-content h6 {
      font-size: 11px;
      font-weight: 500;
      margin: 6px 0 3px;
    }

    /* Horizontal rule */
    .tooltip-content hr {
      border: none;
      border-top: 1px solid var(--app-input-border);
      margin: 10px 0;
    }
  `;
}
