/**
 * SVG Viewer - Split view with code editor and live preview (Lit Element version)
 */

import { html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { html as htmlLang } from '@codemirror/lang-html';
import { invoke } from '@tauri-apps/api/core';
import { dispatch } from '../../lib/types/events.js';
import type { ViewerAction } from '../types.js';
import { SplitViewViewerBase } from './split-view-base.js';

interface SvgMetadata {
  width?: string;
  height?: string;
  viewBox?: string;
  size: number;
}

@customElement('svg-viewer')
export class SvgViewer extends SplitViewViewerBase {
  readonly metadata = {
    id: 'svg',
    displayName: 'SVG Editor',
    supportedExtensions: ['svg'],
  };

  @state()
  private svgMetadata: SvgMetadata | null = null;

  @state()
  private previewScale = 1;

  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('viewMode')) {
      this.applyViewModeStyles();
    }
  }

  async loadFile(path: string, content: string): Promise<void> {
    this.filePath = path;
    this.content = content;
    this.isDirty = false;

    // Parse SVG metadata
    this.svgMetadata = this.parseSvgMetadata(content);

    // Clear previous editor
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }

    await this.updateComplete;

    // Create editor view
    await this.createEditorView(content);

    // Apply view mode styles (this triggers another render)
    this.applyViewModeStyles();

    // Wait for applyViewModeStyles to complete, then setup resize
    await this.updateComplete;
    this.setupResizeHandle();
    this.setupResetOnDoubleClick();
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

    // Dispatch content-changed with isModified: false to update tab state
    dispatch('content-changed', {
      path: this.filePath,
      content,
      isModified: false,
    });

    return content;
  }

  getAdditionalToolbarActions(): ViewerAction[] {
    return [
      {
        id: 'zoom-out',
        icon: 'mdi:magnify-minus-outline',
        label: 'Zoom Out',
        onClick: () => this.zoomPreview(0.8),
        enabled: this.previewScale > 0.2,
      },
      {
        id: 'zoom-reset',
        icon: 'mdi:magnify-expand',
        label: 'Reset',
        onClick: () => this.resetZoom(),
      },
      {
        id: 'zoom-in',
        icon: 'mdi:magnify-plus-outline',
        label: 'Zoom In',
        onClick: () => this.zoomPreview(1.25),
        enabled: this.previewScale < 4,
      },
      {
        id: 'copy-svg',
        icon: 'mdi:content-copy',
        label: 'Copy SVG',
        onClick: () => this.copyToClipboard(),
      },
    ];
  }

  private parseSvgMetadata(content: string): SvgMetadata | null {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) return null;

      const size = new Blob([content]).size;

      return {
        width: svg.getAttribute('width') || undefined,
        height: svg.getAttribute('height') || undefined,
        viewBox: svg.getAttribute('viewBox') || undefined,
        size,
      };
    } catch (e) {
      console.warn('[SvgViewer] Failed to parse SVG metadata:', e);
      return null;
    }
  }

  private async createEditorView(content: string): Promise<void> {
    const indentUnitStr = this.detectIndentUnit(content);
    const langExtension = htmlLang();
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
    const previewContainer = this.renderRoot.querySelector('#preview-content') as HTMLElement;
    if (!previewContainer) return;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.content, 'image/svg+xml');

      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        console.error('[SvgViewer] SVG parse error:', parseError.textContent);
      }

      const svgElement = doc.querySelector('svg');

      if (!svgElement) {
        previewContainer.innerHTML = `
          <div class="flex items-center justify-center h-full text-sm" style="color: var(--app-disabled-foreground);">
            <p>Invalid SVG content</p>
          </div>
        `;
        return;
      }

      const svgClone = svgElement.cloneNode(true) as SVGElement;

      if (!svgClone.getAttribute('width') && !svgClone.getAttribute('height')) {
        const viewBox = svgClone.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.split(/[\s,]+/);
          if (parts.length === 4) {
            svgClone.setAttribute('width', parts[2]);
            svgClone.setAttribute('height', parts[3]);
          }
        }
      }

      // Apply checkerboard background to the preview container
      previewContainer.style.background = `
        repeating-linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%, #f0f0f0),
        repeating-linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%, #f0f0f0)
      `;
      previewContainer.style.backgroundPosition = '0 0, 10px 10px';
      previewContainer.style.backgroundSize = '20px 20px';

      // Apply zoom transform
      svgClone.style.transform = `scale(${this.previewScale})`;
      svgClone.style.transformOrigin = 'center';
      svgClone.style.maxWidth = '100%';
      svgClone.style.maxHeight = '100%';
      svgClone.style.width = 'auto';
      svgClone.style.height = 'auto';

      previewContainer.innerHTML = '';
      previewContainer.appendChild(svgClone);
    } catch (error) {
      console.error('[SvgViewer] Failed to render preview:', error);
      previewContainer.innerHTML = `
        <div class="flex items-center justify-center h-full text-sm" style="color: var(--app-disabled-foreground);">
          <p>Failed to render SVG</p>
        </div>
      `;
    }
  }

  private zoomPreview(factor: number): void {
    this.previewScale = Math.max(0.1, Math.min(10, this.previewScale * factor));
    this.updatePreview();
    this.updateToolbarActions();
  }

  private resetZoom(): void {
    this.previewScale = 1;
    this.updatePreview();
    this.updateToolbarActions();
  }

  private async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.content);
      dispatch('notification', {
        type: 'success',
        message: 'SVG code copied to clipboard',
      });
    } catch (error) {
      console.error('[SvgViewer] Failed to copy to clipboard:', error);
      dispatch('notification', {
        type: 'error',
        message: 'Failed to copy SVG',
      });
    }
  }

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

          <!-- Preview panel -->
          <div
            id="preview-panel"
            class="overflow-hidden relative"
            style="
              background: var(--app-workbench-bg);
              min-width: 200px;
            "
          >
            <div id="preview-content" class="absolute inset-0 flex items-center justify-center" style="padding: 40px; box-sizing: border-box;">
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderSvgPreview() {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.content, 'image/svg+xml');
      const svgElement = doc.querySelector('svg');

      if (!svgElement) {
        return html`
          <div class="flex items-center justify-center h-full text-sm" style="color: var(--app-disabled-foreground);">
            <p>Invalid SVG content</p>
          </div>
        `;
      }

      // Clone and style the SVG
      const svgClone = svgElement.cloneNode(true) as SVGElement;
      if (!svgClone.getAttribute('width') && !svgClone.getAttribute('height')) {
        const viewBox = svgClone.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.split(/[\s,]+/);
          if (parts.length === 4) {
            svgClone.setAttribute('width', parts[2]);
            svgClone.setAttribute('height', parts[3]);
          }
        }
      }

      svgClone.style.transform = `scale(${this.previewScale})`;
      svgClone.style.transformOrigin = 'center';
      svgClone.style.maxWidth = '100%';
      svgClone.style.maxHeight = '100%';
      svgClone.style.width = 'auto';
      svgClone.style.height = 'auto';

      return svgClone;
    } catch (error) {
      return html`
        <div class="flex items-center justify-center h-full text-sm" style="color: var(--app-disabled-foreground);">
          <p>Failed to render SVG</p>
        </div>
      `;
    }
  }
}
