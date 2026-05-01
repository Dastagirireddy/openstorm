/**
 * Split View Base Class - Common functionality for split-pane viewers (Lit Element version)
 *
 * Provides:
 * - Split pane layout with resizable handle
 * - View mode toggling (split/preview/code)
 * - Toolbar actions for view modes
 */

import { html } from 'lit';
import { property, state } from 'lit/decorators.js';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, historyKeymap, undo, redo, defaultKeymap, indentMore } from '@codemirror/commands';
import { lineNumbers, highlightActiveLine, drawSelection, dropCursor, keymap } from '@codemirror/view';
import { indentUnit, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';

import type { ViewerMetadata, ViewerAction } from '../types.js';
import { detectIndentUnit } from '../../lib/editor/editor-syntax.js';
import { getEditorTheme } from '../../lib/editor/editor-theme.js';
import { openStormHighlight } from '../../lib/editor/editor-syntax.js';
import { dispatch } from '../../lib/types/events.js';
import { TailwindElement } from '../../tailwind-element.js';

export type ViewMode = 'split' | 'preview' | 'code';

export interface SplitViewOptions {
  initialSplitRatio?: number;
  minPanelWidth?: number;
  showResizeHandle?: boolean;
}

/**
 * Base class for split-view editors
 */
export abstract class SplitViewViewerBase extends TailwindElement() {
  abstract readonly metadata: ViewerMetadata;

  @property({ type: String })
  protected filePath = '';

  @property({ type: String })
  protected content = '';

  @state()
  protected isDirty = false;

  @state()
  protected viewMode: ViewMode = 'split';

  @state()
  protected splitRatio = 50;

  protected editorView: EditorView | null = null;
  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartRatio = 0;

  private options: SplitViewOptions;

  constructor(options: SplitViewOptions = {}) {
    super();
    this.options = {
      initialSplitRatio: 50,
      minPanelWidth: 200,
      showResizeHandle: true,
      ...options,
    };
    this.splitRatio = this.options.initialSplitRatio!;
  }

  /**
   * Get additional toolbar actions (beyond view mode toggles)
   */
  getAdditionalToolbarActions?(): ViewerAction[];

  getToolbarActions(): ViewerAction[] {
    const viewModeActions: ViewerAction[] = [
      {
        id: 'split-view',
        icon: 'mdi:view-split-vertical',
        label: 'Split',
        onClick: () => this.setViewMode('split'),
        enabled: this.viewMode !== 'split',
      },
      {
        id: 'preview-only',
        icon: 'mdi:eye-outline',
        label: 'Preview',
        onClick: () => this.setViewMode('preview'),
        enabled: this.viewMode !== 'preview',
      },
      {
        id: 'code-only',
        icon: 'mdi:code-tags',
        label: 'Code',
        onClick: () => this.setViewMode('code'),
        enabled: this.viewMode !== 'code',
      },
    ];

    const additionalActions = this.getAdditionalToolbarActions?.() || [];
    return [...viewModeActions, ...additionalActions];
  }

  isDirtyState(): boolean {
    return this.isDirty;
  }

  canSave(): boolean {
    return this.isDirty;
  }

  /**
   * Setup resize handle
   */
  protected setupResizeHandle(): void {
    const handle = this.renderRoot.querySelector('#resize-handle') as HTMLElement;
    const codePanel = this.renderRoot.querySelector('#code-panel') as HTMLElement;
    const previewPanel = this.renderRoot.querySelector('#preview-panel') as HTMLElement;

    if (!handle || !codePanel || !previewPanel) return;

    const startResize = (e: MouseEvent) => {
      e.preventDefault();
      this.isResizing = true;
      this.resizeStartX = e.clientX;
      this.resizeStartRatio = this.splitRatio;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const resize = (e: MouseEvent) => {
      if (!this.isResizing) return;

      const mainArea = this.renderRoot.querySelector('#split-main-area') as HTMLElement;
      if (!mainArea) return;

      const mainRect = mainArea.getBoundingClientRect();
      const deltaX = e.clientX - this.resizeStartX;
      const newRatio = this.resizeStartRatio + (deltaX / mainRect.width) * 100;
      this.splitRatio = Math.max(20, Math.min(80, newRatio));
    };

    const stopResize = () => {
      this.isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  }

  /**
   * Apply view mode styles after render
   */
  protected applyViewModeStyles(): void {
    const codePanel = this.renderRoot.querySelector('#code-panel') as HTMLElement;
    const previewPanel = this.renderRoot.querySelector('#preview-panel') as HTMLElement;
    const resizeHandle = this.renderRoot.querySelector('#resize-handle') as HTMLElement;

    if (!codePanel || !previewPanel) return;

    // Apply styles based on view mode
    switch (this.viewMode) {
      case 'split':
        codePanel.style.display = 'block';
        codePanel.style.width = `${this.splitRatio}%`;
        codePanel.style.flex = 'none';
        codePanel.style.borderRight = '1px solid var(--app-border)';

        if (resizeHandle) resizeHandle.style.display = 'block';

        previewPanel.style.display = 'block';
        previewPanel.style.width = `${100 - this.splitRatio}%`;
        previewPanel.style.flex = 'none';
        break;

      case 'preview':
        codePanel.style.display = 'none';
        if (resizeHandle) resizeHandle.style.display = 'none';

        previewPanel.style.display = 'block';
        previewPanel.style.width = '100%';
        previewPanel.style.flex = '1';
        break;

      case 'code':
        previewPanel.style.display = 'none';
        if (resizeHandle) resizeHandle.style.display = 'none';

        codePanel.style.display = 'block';
        codePanel.style.width = '100%';
        codePanel.style.flex = '1';
        codePanel.style.borderRight = 'none';
        break;
    }

    // Update toolbar actions
    dispatch('viewer-actions-changed', { actions: this.getToolbarActions() });
  }

  /**
   * Set view mode
   */
  protected setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.updateComplete.then(() => {
      this.applyViewModeStyles();
    });
  }

  /**
   * Update toolbar actions
   */
  protected updateToolbarActions(): void {
    dispatch('viewer-actions-changed', { actions: this.getToolbarActions() });
  }

  /**
   * Create default editor extensions
   */
  protected createEditorExtensions(indentUnitStr: string, langExtension: any): any[] {
    return [
      EditorState.tabSize.of(4),
      indentUnit.of(indentUnitStr),
      lineNumbers(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      dropCursor(),
      bracketMatching(),
      indentOnInput(),
      indentationMarkers({
        highlightActiveBlock: false,
        markerType: 'scopeIndent',
        thickness: 1,
        activeThickness: 1,
        colors: {
          light: '#d0d0d0',
          dark: '#505050',
          activeLight: '#b0b0b0',
          activeDark: '#707070',
        },
      }),
      syntaxHighlighting(openStormHighlight),
      getEditorTheme(),
      langExtension,
      EditorView.updateListener.of((update) => {
        this.handleUpdate(update);
      }),
      keymap.of([
        ...historyKeymap,
        ...defaultKeymap,
        {
          key: 'Tab',
          run: indentMore,
        },
      ]),
    ];
  }

  /**
   * Handle editor updates
   */
  protected handleUpdate(update: ViewUpdate): void {
    if (update.docChanged) {
      const newContent = update.state.doc.toString();
      this.content = newContent;
      this.isDirty = true;

      // Live preview update
      this.updatePreview();

      // Dispatch content changed event
      dispatch('content-changed', {
        path: this.filePath,
        content: newContent,
        isModified: true,
      });
    }
  }

  /**
   * Format file size
   */
  protected formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Update preview - must be implemented by subclass
   */
  protected abstract updatePreview(): Promise<void> | void;

  /**
   * Create editor after Lit renders
   */
  protected async createEditorInContainer(content: string, extensions: any[]): Promise<void> {
    const codePanel = this.renderRoot.querySelector('#code-panel') as HTMLElement;
    if (!codePanel) return;

    // Clear panel
    codePanel.innerHTML = '';

    // Create editor state
    const state = EditorState.create({
      doc: content,
      extensions,
    });

    // Create editor view
    this.editorView = new EditorView({
      state,
      parent: codePanel,
    });

    // Setup resize handle after editor is created
    this.setupResizeHandle();
  }

  render() {
    const modeText = this.viewMode === 'split' ? 'Split View' : this.viewMode === 'preview' ? 'Preview Only' : 'Code Only';

    return html`
      <div class="flex flex-col h-full overflow-hidden" style="background: var(--app-workbench-bg);">
        <!-- Main content area -->
        <div id="split-main-area" class="flex-1 flex overflow-hidden">
          <!-- Code panel -->
          <div
            id="code-panel"
            class="overflow-hidden"
            style="
              min-width: ${this.options.minPanelWidth}px;
              width: ${this.viewMode === 'split' ? `${this.splitRatio}%` : this.viewMode === 'code' ? '100%' : 'auto'};
              flex: ${this.viewMode === 'split' ? 'none' : this.viewMode === 'code' ? '1' : 'none'};
              border-right: ${this.viewMode === 'code' ? 'none' : '1px solid var(--app-border)'};
            "
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
              min-width: ${this.options.minPanelWidth}px;
              width: ${this.viewMode === 'split' ? `${100 - this.splitRatio}%` : this.viewMode === 'preview' ? '100%' : 'auto'};
              flex: ${this.viewMode === 'split' ? 'none' : this.viewMode === 'preview' ? '1' : 'none'};
            "
          >
            <slot name="preview"></slot>
          </div>
        </div>
      </div>
    `;
  }
}
