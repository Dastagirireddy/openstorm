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
    this.renderedHtml = md.render(markdownContent);

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
  `;
}
