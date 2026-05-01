/**
 * Markdown Viewer - Split view with markdown code and live preview
 *
 * Uses CodeMirror for editing and embedded markdown preview for rendering
 */

import { html, css, LitElement } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { dispatch } from '../../lib/types/events.js';
import type { ViewerAction } from '../types.js';
import { SplitViewViewerBase } from './split-view-base.js';
import { markdown } from '@codemirror/lang-markdown';
import { invoke } from '@tauri-apps/api/core';
import { ThemeService } from '../../lib/services/theme-service.js';
import MarkdownIt from 'markdown-it';
import markdownItKatex from '@traptitech/markdown-it-katex';
import mermaid from 'mermaid';
import hljs from 'highlight.js';
import darkTheme from 'highlight.js/styles/github-dark.css?inline';
import lightTheme from 'highlight.js/styles/github.css?inline';

interface MarkdownMetadata {
  wordCount: number;
  headingCount: number;
  codeBlockCount: number;
  imageCount: number;
  size: number;
}

/**
 * Markdown Preview - Embedded component for rendering markdown preview
 * Separated to avoid CSS conflicts between Tailwind and markdown styles
 */
@customElement('markdown-preview-inline')
class MarkdownPreviewInline extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
    }
    .mermaid { text-align: center; padding: 16px; margin: 16px 0; }
    .mermaid svg { max-width: 100%; height: auto; }
  `;

  @property({ type: String })
  content = '';

  @property({ type: Boolean })
  darkMode = false;

  private md: MarkdownIt;
  private mermaidInitialized = false;

  constructor() {
    super();
    this.md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    });

    this.md.use(markdownItKatex, {
      throwOnError: false,
      displayMode: true,
    });

    const defaultFenceRenderer = this.md.renderer.rules.fence;
    this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const lang = token.info ? token.info.trim().split(/\s+/)[0] : '';

      if (lang === 'mermaid') {
        return `<div class="mermaid">${token.content}</div>`;
      }

      let code = token.content;
      let hasHighlight = false;

      if (lang && hljs.getLanguage(lang)) {
        try {
          code = hljs.highlight(token.content, { language: lang }).value;
          hasHighlight = true;
        } catch (err) {
          console.error('[MarkdownPreviewInline] Highlight error:', err);
        }
      }

      const langClass = lang ? `language-${lang}` : '';
      const hljsClass = hasHighlight ? 'hljs' : '';
      return `<pre><code class="${hljsClass} ${langClass}">${code}</code></pre>`;
    };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.applyHighlightJsTheme();
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    if (changedProperties.has('content')) {
      this.renderMermaidDiagrams();
    }
    if (changedProperties.has('darkMode')) {
      this.applyHighlightJsTheme();
    }
  }

  private applyHighlightJsTheme(): void {
    const existing = this.renderRoot.getElementById('hljs-theme');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'hljs-theme';
    style.textContent = this.darkMode ? darkTheme : lightTheme;
    this.renderRoot.appendChild(style);
  }

  private async renderMermaidDiagrams(): Promise<void> {
    await this.updateComplete;

    const mermaidBlocks = this.renderRoot.querySelectorAll('.mermaid');
    if (mermaidBlocks.length === 0) return;

    if (!this.mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });
      this.mermaidInitialized = true;
    }

    for (let i = 0; i < mermaidBlocks.length; i++) {
      const block = mermaidBlocks[i];
      const graphDefinition = block.textContent?.trim() || '';

      if (!graphDefinition) continue;

      try {
        const { svg } = await mermaid.render(`mermaid-${Date.now()}-${i}`, graphDefinition);
        block.innerHTML = svg;
        block.setAttribute('data-mermaid-rendered', 'true');
      } catch (error) {
        console.error('[MarkdownPreviewInline] Failed to render Mermaid:', error);
        block.innerHTML = `<div class="text-red-500 text-sm p-4 bg-red-50 rounded">Failed to render diagram</div>`;
      }
    }
  }

  render() {
    const renderedHtml = this.md.render(this.content);
    return html`<div>${unsafeHTML(renderedHtml)}</div>`;
  }
}

@customElement('markdown-viewer')
export class MarkdownViewer extends SplitViewViewerBase {
  readonly metadata = {
    id: 'markdown',
    displayName: 'Markdown Editor',
    supportedExtensions: ['md', 'markdown', 'mdown'],
  };

  @state()
  private markdownMetadata: MarkdownMetadata | null = null;

  private themeUnsubscribe?: () => void;
  private isDarkMode = false;

  constructor() {
    super();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.setupThemeListener();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.themeUnsubscribe?.();
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('viewMode')) {
      this.applyViewModeStyles();
    }
  }

  private setupThemeListener(): void {
    try {
      const themeService = ThemeService.getInstance();
      const currentTheme = themeService.getCurrentWorkbenchTheme();
      console.log('[MarkdownViewer] Selected theme:', JSON.stringify({ id: currentTheme.id, type: currentTheme.type }));
      console.log('[MarkdownViewer] Theme mode:', themeService.getThemeMode());

      // Check actual applied theme by reading CSS variable (handles system mode correctly)
      const root = document.documentElement;
      const bgColor = getComputedStyle(root).getPropertyValue('--app-bg').trim();
      // Light theme bg is typically #ffffff, dark theme is darker
      const isLightBg = bgColor.toLowerCase().includes('fff') || bgColor === '#ffffff';
      this.isDarkMode = !isLightBg;

      console.log('[MarkdownViewer] Detected applied theme:', this.isDarkMode ? 'dark' : 'light', 'bg:', bgColor);

      this.themeUnsubscribe = themeService.subscribe((event) => {
        console.log('[MarkdownViewer] Theme change event:', JSON.stringify({ id: event.themeId, type: event.theme.type }));
        this.isDarkMode = event.theme.type === 'dark';
        this.updatePreviewMode();
      });
    } catch (err) {
      console.error('[MarkdownViewer] Failed to setup theme listener:', err);
    }
  }

  private updatePreviewMode(): void {
    const previewEl = this.renderRoot.querySelector('markdown-preview-inline') as any;
    if (previewEl) {
      previewEl.darkMode = this.isDarkMode;
    }
  }

  async loadFile(path: string, content: string): Promise<void> {
    this.filePath = path;
    this.content = content;
    this.isDirty = false;

    // Parse markdown metadata
    this.markdownMetadata = this.parseMarkdownMetadata(content);

    // Clear previous editor
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }

    await this.updateComplete;

    // Create editor view
    await this.createEditorView(content);

    // Apply view mode styles
    this.applyViewModeStyles();

    // Ensure preview element has correct darkMode value
    this.updatePreviewMode();
  }

  async saveFile(): Promise<string> {
    if (!this.editorView) {
      throw new Error('No editor view');
    }

    const content = this.editorView.state.doc.toString();
    await invoke('write_file', { path: this.filePath, content });
    this.isDirty = false;
    this.content = content;

    // Update preview
    this.updatePreview();

    return content;
  }

  private parseMarkdownMetadata(content: string): MarkdownMetadata {
    const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;
    const headingCount = (content.match(/^#{1,6}\s+/gm) || []).length;
    const codeBlockCount = (content.match(/```/g) || []).length / 2;
    const imageCount = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
    const size = new Blob([content]).size;

    return {
      wordCount,
      headingCount,
      codeBlockCount,
      imageCount,
      size,
    };
  }

  private async createEditorView(content: string): Promise<void> {
    const indentUnitStr = this.detectIndentUnit(content);
    const langExtension = markdown();
    const extensions = this.createEditorExtensions(indentUnitStr, langExtension);

    await this.createEditorInContainer(content, extensions);

    // Initial preview render
    this.updatePreview();
  }

  private detectIndentUnit(content: string): string {
    if (/^\t/m.test(content)) return '\t';
    const lines = content.split('\n');
    const indents = lines
      .filter(line => /^\s+/.test(line))
      .map(line => line.match(/^(\s+)/)?.[1] || '');

    if (indents.length === 0) return '  ';

    const counts: Record<string, number> = {};
    let maxCount = 0;
    let mostCommon = '  ';

    for (const indent of indents) {
      if (indent.length === 0) continue;
      counts[indent] = (counts[indent] || 0) + 1;
      if (counts[indent] > maxCount) {
        maxCount = counts[indent];
        mostCommon = indent;
      }
    }

    return mostCommon;
  }

  protected updatePreview(): void {
    const previewEl = this.renderRoot.querySelector('markdown-preview-inline') as any;
    if (!previewEl) return;

    previewEl.content = this.content;
    previewEl.darkMode = this.isDarkMode;

    this.markdownMetadata = this.parseMarkdownMetadata(this.content);
  }

  /**
   * Override render to use markdown-preview-element
   */
  override render() {
    return html`
      <div class="flex flex-col h-full overflow-hidden" style="background: var(--app-workbench-bg);">
        <!-- Main content area -->
        <div id="split-main-area" class="flex-1 flex overflow-hidden">
          <!-- Code panel -->
          <div
            id="code-panel"
            class="overflow-hidden"
            style="min-width: 200px;"
          ></div>

          <!-- Resize handle -->
          ${this.viewMode === 'split'
            ? html`<div
                id="resize-handle"
                class="w-1 cursor-col-resize hover:bg-[var(--app-indigo)] transition-colors"
                style="background: var(--app-border);"
              ></div>`
            : ''}

          <!-- Preview panel with isolated markdown preview element -->
          <div
            id="preview-panel"
            class="overflow-hidden relative"
            style="
              background: var(--app-workbench-bg);
              min-width: 200px;
            "
          >
            <markdown-preview-inline
              class="absolute inset-0 w-full h-full px-2.5"
              .content=${this.content}
              .darkMode=${this.isDarkMode}
            ></markdown-preview-inline>
          </div>
        </div>
      </div>
    `;
  }
}
