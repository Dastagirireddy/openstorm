/**
 * Text Viewer - CodeMirror 6 based text editor (Lit Element version)
 *
 * Wraps CodeMirror with syntax highlighting, LSP, and debugging support
 */

import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { EditorView, ViewUpdate, keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState, EditorSelection, StateEffect } from '@codemirror/state';
import { history, historyKeymap, undo, redo, defaultKeymap } from '@codemirror/commands';

import type { ViewerMetadata, ViewerAction } from '../types.js';
import { getCommonExtensions } from '../../lib/editor/editor-extensions.js';
import { getSyntaxHighlighting, getLanguageExtension, detectIndentUnit } from '../../lib/editor/editor-syntax.js';
import { getEditorTheme } from '../../lib/editor/editor-theme.js';
import {
  type Breakpoint,
  breakpointField,
  debugLineField,
  addBreakpointEffect,
  removeBreakpointEffect,
  setBreakpointsEffect,
  setDebugLineEffect,
  setDebugModeEffect,
  clearInlineValueEffect,
  setInlineValueEffect,
  BreakpointManager,
} from '../../lib/editor/editor-breakpoints.js';
import {
  lspCompletionSource,
  debugHoverTooltip,
  notifyLspDocumentOpen,
  notifyLspDocumentChange,
  handleGoToDefinition,
  showLspHoverTooltip,
} from '../../lib/editor/editor-lsp.js';
import { autocompletion } from '@codemirror/autocomplete';
import { invoke } from '@tauri-apps/api/core';
import { dispatch } from '../../lib/types/events.js';
import { getFileExtension } from '../../lib/icons/file-icons.js';
import { TailwindElement } from '../../tailwind-element.js';

@customElement('text-viewer')
export class TextViewer extends TailwindElement() {
  readonly metadata: ViewerMetadata = {
    id: 'text',
    displayName: 'Text Editor',
    supportedExtensions: ['*'],
  };

  @property({ type: String })
  filePath = '';

  @property({ type: String })
  content = '';

  @state()
  private isDirty = false;

  @state()
  private documentVersion = 0;

  private editorView: EditorView | null = null;
  private openedDocs = new Set<string>();
  private _hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  private _lastHoverPos: number | null = null;

  // Breakpoint management
  private breakpoints = new Map<string, Breakpoint[]>();
  private nextBreakpointId = 1;

  // Debug state
  @state()
  private isDebugging = false;

  @state()
  private currentDebugLine: number | null = null;

  // Event listeners
  private _boundHandleThemeChange = this.handleThemeChange.bind(this);

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('theme-changed', this._boundHandleThemeChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
    document.removeEventListener('theme-changed', this._boundHandleThemeChange);
  }

  async loadFile(path: string, content: string): Promise<void> {
    this.filePath = path;
    this.content = content;
    this.isDirty = false;
    this.documentVersion = 0;

    // Clear previous editor
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }

    // Clear the container content
    const editorContainer = this.renderRoot.querySelector('#editor-container') as HTMLElement;
    if (editorContainer) {
      editorContainer.innerHTML = '';
    }

    await this.updateComplete;

    const editorContainerAfter = this.renderRoot.querySelector('#editor-container') as HTMLElement;
    if (!editorContainerAfter) {
      throw new Error('Editor container not found');
    }

    // Detect indent unit
    const indentUnitStr = detectIndentUnit(content, path);

    // Create editor state
    const state = EditorState.create({
      doc: content,
      extensions: [
        ...getCommonExtensions(indentUnitStr, (lineNum, wasThere) => {
          this.handleBreakpointClick(lineNum, wasThere);
        }),
        getEditorTheme(),
        getLanguageExtension(path),
        getSyntaxHighlighting(),
        // LSP completion
        autocompletion({
          override: [
            (context) => this.lspCompletionSource(context),
          ],
        }),
        // Update listener for content changes
        EditorView.updateListener.of((update) => {
          this.handleUpdate(update);
        }),
      ],
    });

    // Create editor view
    this.editorView = new EditorView({
      state,
      parent: editorContainerAfter,
    });

    // Add hover listener for LSP tooltips
    this.editorView.dom.addEventListener('mousemove', (e: MouseEvent) => {
      this.handleMouseHover(e);
    });

    // Notify LSP of document open
    await this.notifyDocumentOpen(content);
  }

  async saveFile(): Promise<string> {
    if (!this.editorView) {
      throw new Error('No editor view');
    }

    const content = this.editorView.state.doc.toString();
    await invoke('write_file', { path: this.filePath, content });
    this.isDirty = false;
    this.content = content;

    // Notify LSP
    await this.notifyDocumentChange(content);

    return content;
  }

  isDirtyState(): boolean {
    return this.isDirty;
  }

  canSave(): boolean {
    return this.isDirty;
  }

  getToolbarActions(): ViewerAction[] {
    return [];
  }

  // Public API for breakpoint/debug support
  setBreakpointsForFile(breakpoints: Breakpoint[]): void {
    this.breakpoints.set(this.filePath, breakpoints);

    if (this.editorView) {
      const lines = breakpoints.map(bp => bp.line);
      this.editorView.dispatch({
        effects: setBreakpointsEffect.of(lines),
      });
    }
  }

  setDebugLine(line: number | null): void {
    this.currentDebugLine = line;

    if (this.editorView) {
      this.editorView.dispatch({
        effects: setDebugLineEffect.of(line),
      });
    }

    if (line !== null) {
      this.fetchInlineValues();
    }
  }

  setDebugMode(enabled: boolean): void {
    this.isDebugging = enabled;

    if (this.editorView) {
      this.editorView.dispatch({
        effects: setDebugModeEffect.of(enabled),
      });
    }
  }

  private handleUpdate(update: ViewUpdate): void {
    if (update.docChanged) {
      const newContent = update.state.doc.toString();
      this.content = newContent;
      this.isDirty = true;
      this.notifyDocumentChange(newContent);

      // Dispatch content changed event
      dispatch('content-changed', {
        path: this.filePath,
        content: newContent,
        isModified: true,
      });
    }
  }

  private async notifyDocumentOpen(content: string): Promise<void> {
    const ext = getFileExtension(this.filePath);
    const languageMap: Record<string, string> = {
      'rs': 'rust',
      'go': 'go',
      'py': 'python',
      'cpp': 'cpp',
      'c': 'c',
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
    };
    const languageId = languageMap[ext];
    if (!languageId) return;

    if (this.openedDocs.has(this.filePath)) return;
    this.openedDocs.add(this.filePath);

    this.documentVersion = 1;
    await notifyLspDocumentOpen(content, this.filePath);
  }

  private async notifyDocumentChange(content: string): Promise<void> {
    const ext = getFileExtension(this.filePath);
    const languageMap: Record<string, string> = {
      'rs': 'rust',
      'go': 'go',
      'py': 'python',
      'cpp': 'cpp',
      'c': 'c',
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
    };
    const languageId = languageMap[ext];
    if (!languageId) return;

    await this.notifyDocumentOpen(content);

    this.documentVersion++;
    await notifyLspDocumentChange(content, this.filePath, this.documentVersion);
  }

  private async lspCompletionSource(context: any): Promise<any> {
    const ext = getFileExtension(this.filePath);
    const languageMap: Record<string, string> = {
      'rs': 'rust',
      'go': 'go',
      'py': 'python',
      'cpp': 'cpp',
      'c': 'c',
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
    };
    const languageId = languageMap[ext];
    if (!languageId) return null;

    const word = context.matchBefore(/[\w.]*$/);
    if (!word || word.text === '.') return null;

    const pos = context.pos;
    const line = context.state.doc.lineAt(pos);
    const column = pos - line.from;

    try {
      const completions = await import('../../lib/lsp/lsp-client.js').then(m =>
        m.getCompletions(languageId, this.filePath, context.state.doc.toString(), line.number - 1, column)
      );

      if (completions.length === 0) return null;

      return {
        from: word.from,
        options: completions.map((item: any) => ({
          label: item.label,
          type: 'text',
          detail: item.detail,
          apply: item.insertText || item.label,
        })),
      };
    } catch (error) {
      console.error('[TextViewer] LSP completion error:', error);
      return null;
    }
  }

  private handleMouseHover(event: MouseEvent): void {
    if (!this.editorView) return;

    const pos = this.editorView.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;

    if (pos === this._lastHoverPos) return;
    this._lastHoverPos = pos;

    if (this._hoverTimeout) {
      clearTimeout(this._hoverTimeout);
    }

    this._hoverTimeout = setTimeout(() => {
      showLspHoverTooltip(this.editorView!, pos, this.filePath);
    }, 150);
  }

  private async handleBreakpointClick(lineNum: number, wasThere: boolean): Promise<void> {
    if (wasThere) {
      const fileBreakpoints = this.breakpoints.get(this.filePath) || [];
      const bp = fileBreakpoints.find(b => b.line === lineNum);
      if (bp) {
        this.removeBreakpoint(bp);
      }
    } else {
      this.addBreakpoint(lineNum);
    }
  }

  private async addBreakpoint(line: number): Promise<void> {
    const breakpoint: Breakpoint = {
      id: this.nextBreakpointId++,
      sourcePath: this.filePath,
      line,
      enabled: true,
      verified: false,
    };

    const fileBreakpoints = this.breakpoints.get(this.filePath) || [];
    fileBreakpoints.push(breakpoint);
    this.breakpoints.set(this.filePath, fileBreakpoints);

    if (this.editorView) {
      this.editorView.dispatch({
        effects: addBreakpointEffect.of(line),
      });
    }

    // Sync to backend
    try {
      const result = await invoke<Breakpoint>('add_breakpoint', {
        request: {
          source_path: this.filePath,
          line,
        },
      });
      breakpoint.verified = result.verified;
      breakpoint.id = result.id;
    } catch (error) {
      console.error('[TextViewer] Failed to sync breakpoint:', error);
    }

    dispatch('breakpoint-added', breakpoint);
  }

  private removeBreakpoint(breakpoint: Breakpoint): void {
    const fileBreakpoints = this.breakpoints.get(this.filePath) || [];
    this.breakpoints.set(
      this.filePath,
      fileBreakpoints.filter(bp => bp.id !== breakpoint.id),
    );

    if (this.editorView) {
      this.editorView.dispatch({
        effects: removeBreakpointEffect.of(breakpoint.line),
      });
    }

    // Sync to backend
    invoke('remove_breakpoint', {
      sourcePath: this.filePath,
      lines: [],
    }).catch(err => console.error('[TextViewer] Failed to remove breakpoint:', err));

    dispatch('breakpoint-removed', { id: breakpoint.id });
  }

  private async fetchInlineValues(): Promise<void> {
    if (!this.editorView || !this.isDebugging) return;

    try {
      let scopes: any[] = [];
      try {
        scopes = await invoke<any[]>('get_scopes', { frameId: 0 });
      } catch (e) {
        return;
      }

      if (!scopes || scopes.length === 0) return;

      const inlineValues: { line: number; column: number; value: string }[] = [];

      for (const scope of scopes) {
        if (!this.isDebugging) return;

        const variablesReference = scope.variables_reference;
        if (!variablesReference || variablesReference === 0) continue;

        const variables = await invoke<any[]>('get_variables', {
          variablesReference,
        });

        const currentLine = this.currentDebugLine;
        if (currentLine) {
          for (const variable of variables.slice(0, 10)) {
            const value = variable.value || String(variable);
            inlineValues.push({
              line: currentLine,
              column: 0,
              value: `${variable.name} = ${value.substring(0, 50)}`,
            });
          }
        }
      }

      if (this.editorView) {
        this.editorView.dispatch({
          effects: clearInlineValueEffect.of(null),
        });

        for (const inlineValue of inlineValues) {
          this.editorView.dispatch({
            effects: setInlineValueEffect.of(inlineValue),
          });
        }
      }
    } catch (error) {
      console.error('[TextViewer] Failed to fetch inline values:', error);
    }
  }

  private handleThemeChange(): void {
    if (!this.editorView) return;

    const cursorPos = this.editorView.state.selection.main.head;

    // Destroy and recreate with new theme
    this.editorView.destroy();
    this.editorView = null;

    // Recreate editor
    this.loadFile(this.filePath, this.content);

    // Restore cursor position
    if (this.editorView && cursorPos >= 0) {
      this.editorView.dispatch({
        selection: EditorSelection.create([EditorSelection.cursor(cursorPos)]),
      });
    }
  }

  render() {
    return html`
      <div id="editor-container" class="w-full h-full overflow-hidden"></div>
    `;
  }
}
