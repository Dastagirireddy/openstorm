import { html } from 'lit';
import { customElement, state, query, property } from 'lit/decorators.js';
import { EditorView, drawSelection, dropCursor, highlightActiveLine, lineNumbers, highlightActiveLineGutter, keymap, ViewUpdate, Decoration } from '@codemirror/view';
import { EditorState, EditorSelection, StateEffect } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldKeymap } from '@codemirror/language';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';

import { TailwindElement } from '../../tailwind-element.js';
import { customFoldGutter } from '../../lib/utils/custom-fold-gutter.js';
import { getFileExtension } from '../../lib/icons/file-icons.js';
import { dispatch } from '../../lib/types/events.js';
import type { EditorTab } from '../../lib/types/file-types.js';
import type { BreakpointCondition } from '../dialogs/conditional-breakpoint-dialog.js';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { ContextMenuItem } from '../dialogs/context-menu.js';

// Import extracted editor modules
import {
  getSyntaxHighlighting,
  getLanguageExtension,
  detectIndentUnit,
  getLanguageId,
} from '../../lib/editor/editor-syntax.js';
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
  checkDefinitionAtPosition,
  showLspHoverTooltip,
} from '../../lib/editor/editor-lsp.js';
import { formatHoverContent } from '../../lib/lsp/lsp-client.js';
import {
  getCompletions,
  getDefinition,
  completionKindToType,
  pathToFileUri,
  notifyDocumentOpened,
  notifyDocumentChanged,
} from '../../lib/lsp/lsp-client.js';
import {
  getEditorTheme,
  getLineNumbers,
} from '../../lib/editor/editor-theme.js';
import { getDebugService } from '../../lib/services/debug-service.js';
import { getCommonExtensions } from '../../lib/editor/editor-extensions.js';
import { invoke } from '@tauri-apps/api/core';
import { notifyDocumentOpened as notifyDocOpened } from '../../lib/lsp/lsp-client.js';
import {
  blameField,
  setBlameData,
  type BlameLine,
} from '../../lib/editor/editor-blame.js';
import { getBlame, type BlameData } from '../../lib/git/git-blame.js';

@customElement('editor-pane')
export class EditorPane extends TailwindElement() {
  @state() tabs: EditorTab[] = [];
  @state() activeTabId: string = '';
  @state() private isDebugging = false;
  @state() private currentDebugLine: number | null = null;
  @state() private debugState: 'running' | 'stopped' | 'terminated' = 'terminated';
  @property() projectPath: string = '';

  // Track breakpoints per file path
  private breakpoints: Map<string, Breakpoint[]> = new Map();
  private nextBreakpointId = 1;

  // Hover tooltip debounce
  private _hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  private _lastHoverPos: number | null = null;

  // Conditional breakpoint dialog
  private conditionalDialog: HTMLDivElement | null = null;
  private pendingBreakpointLine: number | null = null;

  // Git blame state
  @state() private blameVisible = false;
  @state() private blameData: BlameData | null = null;

  // Context menu state
  @state() private showContextMenu = false;
  @state() private contextMenuItems: ContextMenuItem[] = [];
  @state() private contextMenuAnchorX = 0;
  @state() private contextMenuAnchorY = 0;

  private editorView: EditorView | null = null;
  private _isInitialTabLoad = true;
  private _currentLanguage: string = '';
  private _savedContent: Map<string, string> = new Map();
  private _definitionCheckTimeout: ReturnType<typeof setTimeout> | null = null;
  private _lastCheckedPosition: string | null = null;
  private _lastHasDefinition: boolean = false;
  private _themeChangeHandler: () => void = this._handleThemeChanged.bind(this);


  /**
   * Check if there's a definition at the given position and update cursor style
   */
  private _checkDefinitionAtPosition(view: EditorView, line: number, column: number): void {
    // Clear any pending check
    if (this._definitionCheckTimeout) {
      clearTimeout(this._definitionCheckTimeout);
    }

    this._definitionCheckTimeout = setTimeout(async () => {
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (!activeTab) return;

      const ext = getFileExtension(activeTab.path);
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

      try {
        const locations = await getDefinition(
          languageId,
          activeTab.path,
          view.state.doc.toString(),
          line,
          column
        );

        if (locations.length > 0) {
          view.dom.classList.add('cm-has-definition');
        } else {
          view.dom.classList.remove('cm-has-definition');
        }
      } catch (error) {
        view.dom.classList.remove('cm-has-definition');
      }
    }, 30);
  }

  /**
   * Handle Ctrl+Click go-to-definition
   */
  private async _handleGoToDefinition(view: EditorView): Promise<void> {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    const ext = getFileExtension(activeTab.path);
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

    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const column = pos - line.from;

    try {
      const locations = await getDefinition(
        languageId,
        activeTab.path,
        view.state.doc.toString(),
        line.number - 1,
        column
      );

      if (locations.length === 0) {
        console.log('[LSP] No definition found');
        return;
      }

      // Navigate to the first location
      const loc = locations[0];
      console.log('[LSP] Going to definition:', loc);

      // Convert file:// URI to local path for comparison
      const targetPath = loc.uri.replace('file://', '');
      const isSameFile = targetPath === activeTab.path;

      // Show status message
      const statusBar = document.querySelector('status-bar') as any;
      if (statusBar) {
        statusBar.setStatusMessage(`Jumping to ${loc.uri.split('/').pop()}:${loc.start_line + 1}`);
      }

      // Dispatch event to navigate to the definition
      dispatch('go-to-location', {
        uri: loc.uri,
        line: loc.start_line,
        column: loc.start_char,
      });
    } catch (error) {
      console.error('[Editor] LSP definition error:', error);
    }
  }

  /**
   * Load git blame for current file
   */
  private async _loadBlame(): Promise<void> {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab || !this.projectPath) {
      console.warn('[Editor:_loadBlame] Skipping — no activeTab or projectPath:', { activeTab: !!activeTab, projectPath: this.projectPath });
      return;
    }

    console.log('[Editor:_loadBlame] Loading blame for:', { projectPath: this.projectPath, filePath: activeTab.path });

    try {
      const blame = await getBlame(this.projectPath, activeTab.path);
      console.log('[Editor:_loadBlame] Got blame data with', blame.lines.length, 'lines');
      this.blameData = blame;

      if (this.editorView) {
        this.editorView.dispatch({
          effects: setBlameData.of(blame),
        });
        console.log('[Editor:_loadBlame] Dispatched setBlameData to editor');
      } else {
        console.warn('[Editor:_loadBlame] No editorView to dispatch to');
      }
    } catch (e) {
      console.error('[Editor] Failed to load blame:', e);
      this.blameData = null;
    }
  }

  /**
   * Handle blame annotation click
   */
  private _handleBlameClick(line: number, blame: BlameLine): void {
    dispatch('blame-click', {
      line,
      blame: {
        hash: blame.hash,
        shortHash: blame.shortHash,
        author: blame.author,
        authorEmail: blame.authorEmail,
        authorTime: blame.authorTime,
        subject: blame.subject,
      },
    });
  }

  /**
   * Toggle git blame visibility
   */
  public toggleBlame(visible?: boolean): void {
    this.blameVisible = visible !== undefined ? visible : !this.blameVisible;

    if (this.editorView) {
      // Recreate editor with updated extensions
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (activeTab) {
        const content = activeTab.content;
        const cursorPos = this.editorView.state.selection.main.head;
        const indentUnitStr = detectIndentUnit(content, activeTab.path);
        const language = getLanguageExtension(activeTab.path);

        this.editorView.destroy();

        const state = EditorState.create({
          doc: content,
          extensions: [
            ...getCommonExtensions(
              indentUnitStr,
              (lineNum, wasThere) => this._handleBreakpointClick(lineNum, wasThere),
              this.blameVisible
            ),
            getEditorTheme(),
            language,
          ],
          selection: EditorSelection.create([EditorSelection.cursor(cursorPos)]),
        });

        this.editorView = new EditorView({
          state,
          parent: this.renderRoot.querySelector('#editor-container')!,
        });

        // Add CSS class for blame visibility
        if (this.blameVisible) {
          this.editorView.dom.classList.add('cm-blame-enabled');
        } else {
          this.editorView.dom.classList.remove('cm-blame-enabled');
        }

        this.editorView.dom.addEventListener('mousemove', (e: MouseEvent) => {
          this._handleEditorHover(e);
        });

        // Add context menu handler
        this.editorView.dom.addEventListener('contextmenu', (e: MouseEvent) => {
          this._handleContextMenu(e);
        });

        // Load blame data if showing
        if (this.blameVisible) {
          this._loadBlame();
        }
      }
    }

    dispatch('blame-toggled', { visible: this.blameVisible });
  }

  /**
   * Add a breakpoint at the specified line
   */
  private async _addBreakpoint(filePath: string, line: number, condition?: BreakpointCondition): Promise<void> {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    console.log("[Editor] Adding breakpoint at", filePath, "line:", line);

    const breakpoint: Breakpoint = {
      id: this.nextBreakpointId++,
      sourcePath: filePath,
      line,
      enabled: true,
      verified: false,
      condition: condition?.condition,
      hitCondition: condition?.hitCondition,
      logMessage: condition?.logMessage,
    };

    // Update local state
    const fileBreakpoints = this.breakpoints.get(filePath) || [];
    fileBreakpoints.push(breakpoint);
    this.breakpoints.set(filePath, fileBreakpoints);

    // Update editor state field
    if (this.editorView) {
      this.editorView.dispatch({
        effects: addBreakpointEffect.of(line),
      });
    }

    // Sync directly to backend (don't rely on panel being visible)
    try {
      const result = await invoke<Breakpoint>("add_breakpoint", {
        request: {
          source_path: filePath,
          line,
          condition: condition?.condition,
          hit_condition: condition?.hitCondition,
          log_message: condition?.logMessage,
        }
      });
      console.log("[Editor] Backend breakpoint result:", result);
      // Update with verified status from backend
      const updatedBp = fileBreakpoints.find(b => b.id === breakpoint.id);
      if (updatedBp) {
        updatedBp.verified = result.verified;
        updatedBp.id = result.id;
      }
    } catch (error) {
      console.error("[Editor] Failed to sync breakpoint:", error);
    }

    // Also dispatch event for debug panel (if visible)
    dispatch('breakpoint-added', breakpoint);
  }

  /**
   * Remove a breakpoint
   */
  private _removeBreakpoint(filePath: string, breakpoint: Breakpoint): void {
    // Update local state
    const fileBreakpoints = this.breakpoints.get(filePath) || [];
    this.breakpoints.set(
      filePath,
      fileBreakpoints.filter(bp => bp.id !== breakpoint.id),
    );

    // Update editor state field
    if (this.editorView) {
      this.editorView.dispatch({
        effects: removeBreakpointEffect.of(breakpoint.line),
      });
    }

    // Sync to backend
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("remove_breakpoint", {
        sourcePath: filePath,
        lines: [],
      }).catch(err => console.error("[Editor] Failed to remove breakpoint from backend:", err));
    });

    // Dispatch event for debug panel
    dispatch('breakpoint-removed', { id: breakpoint.id });
  }

  /**
   * Handle breakpoint click from gutter
   */
  private _handleBreakpointClick(lineNum: number, wasThere: boolean): void {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    // Negative lineNum indicates right-click (edit mode)
    if (lineNum < 0) {
      const actualLine = Math.abs(lineNum);
      const fileBreakpoints = this.breakpoints.get(activeTab.path) || [];
      const bp = fileBreakpoints.find(b => b.line === actualLine);
      if (bp) {
        this.showConditionalDialog(activeTab.path, actualLine, bp);
      }
      return;
    }

    if (wasThere) {
      const fileBreakpoints = this.breakpoints.get(activeTab.path) || [];
      const bp = fileBreakpoints.find(b => b.line === lineNum);
      if (bp) this._removeBreakpoint(activeTab.path, bp);
    } else {
      // Show conditional dialog for new breakpoint
      this.pendingBreakpointLine = lineNum;
      this.showConditionalDialog(activeTab.path, lineNum, null, true);
    }
  }

  /**
   * Show conditional breakpoint dialog
   */
  private async showConditionalDialog(filePath: string, line: number, existingBp: Breakpoint | null, isNew: boolean = false) {
    // For now, add breakpoint without condition - dialog integration needs proper import
    if (isNew) {
      await this._addBreakpoint(filePath, line);
    }
    // TODO: Show conditional breakpoint dialog for editing conditions
  }

  /**
   * Set breakpoints for a file (used when loading existing breakpoints)
   */
  public setBreakpointsForFile(filePath: string, breakpoints: Breakpoint[]): void {
    const fileBreakpoints = this.breakpoints.get(filePath) || [];
    this.breakpoints.set(filePath, breakpoints);

    // Update editor state field with all breakpoint lines
    if (this.editorView) {
      const lines = breakpoints.map(bp => bp.line);
      this.editorView.dispatch({
        effects: setBreakpointsEffect.of(lines),
      });
    }
  }

  /**
   * Set the current debug line (for highlighting during debugging)
   */
  public setDebugLine(line: number | null): void {
    this.currentDebugLine = line;
    if (this.editorView) {
      this.editorView.dispatch({
        effects: setDebugLineEffect.of(line),
      });
    }
    // Fetch and display inline values when stopped at a line
    if (line !== null) {
      this.fetchInlineValues();
    }
  }

  /**
   * Fetch variable values and display them inline
   */
  private async fetchInlineValues() {
    if (!this.editorView || !this.isDebugging) return;

    try {

      // Get scopes to find visible variables
      let scopes: any[] = [];
      try {
        scopes = await invoke<any[]>("get_scopes", {
          frameId: 0, // Use top frame
        });
      } catch (e) {
        // Some adapters don't support scopes (e.g., Go with Delve)
        return;
      }

      // No scopes available yet (debug session may not be fully stopped)
      if (!scopes || scopes.length === 0) {
        return;
      }

      // Get variables from each scope
      const inlineValues: { line: number; column: number; value: string }[] = [];

      for (const scope of scopes) {
        // Check again if still debugging (session might have ended)
        if (!this.isDebugging) return;

        const variablesReference = scope.variables_reference;
        if (!variablesReference || variablesReference === 0) continue;

        const variables = await invoke<any[]>("get_variables", {
          variablesReference,
        });

        // For each variable, try to find it in the current line
        for (const variable of variables.slice(0, 10)) { // Limit to first 10 variables
          const value = variable.value || String(variable);
          // Find variable occurrences in visible lines
          const currentLine = this.currentDebugLine;
          if (currentLine) {
            // Display value on the current debug line
            inlineValues.push({
              line: currentLine,
              column: 0,
              value: `${variable.name} = ${value.substring(0, 50)}`,
            });
          }
        }
      }

      // Clear existing and set new inline values
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
      console.error("[Editor] Failed to fetch inline values:", error);
    }
  }

  /**
   * LSP completion source for CodeMirror
   */
  private async _lspCompletionSource(context: CompletionContext): Promise<CompletionResult | null> {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) {
      return null;
    }

    const ext = getFileExtension(activeTab.path);
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
    if (!languageId) {
      return null;
    }

    // Use matchBefore to find word boundary at cursor position
    // This properly handles completions inside template literals, function calls, and member access (console.)
    const word = context.matchBefore(/[\w.]*$/);
    if (!word) {
      return null;
    }

    // Don't show completions for just a dot
    if (word.text === '.') {
      return null;
    }

    const pos = context.pos;
    const line = context.state.doc.lineAt(pos);
    const column = pos - line.from;

    try {
      const items = await getCompletions(
        languageId,
        activeTab.path,
        context.state.doc.toString(),
        line.number - 1,
        column
      );

      if (items.length === 0) return null;

      return {
        from: word.from,
        options: items.map((item) => {
          const type = completionKindToType(item.kind);
          return {
            label: item.label,
            type: type,
            detail: item.detail,
            info: (completion) => {
              if (item.documentation) {
                const div = document.createElement('div');
                // Parse documentation for rich tooltip
                const sections = item.documentation.split(/\n---\n/);
                const signature = sections[0]?.trim().replace(/^```(\w*)\n?([\s\S]*?)\n?```$/, '$2') || '';
                const linkMatch = sections[sections.length - 1]?.match(/\[([^\]]+)\]\(([^)]+)\)/);
                const link = linkMatch ? { text: linkMatch[1], url: linkMatch[2] } : undefined;

                div.innerHTML = formatHoverContent(item.documentation, {
                  signature,
                  tags: item.detail ? [item.detail] : undefined,
                  link,
                });
                return div;
              }
              return null;
            },
            apply: item.insertText || item.label,
            filterText: item.filterText || item.label,
          };
        }),
      };
    } catch (error) {
      console.error('[Editor] LSP completion error:', error);
      return null;
    }
  }

  /**
   * Debug hover tooltip - shows variable value on hover during debugging
   */
  private async _debugHoverTooltip(view: EditorView, pos: number): Promise<{ pos: number; above: boolean; create: () => { dom: HTMLElement } } | null> {
    if (!this.isDebugging || this.debugState !== 'stopped') return null;

    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return null;

    const line = view.state.doc.lineAt(pos);
    const column = pos - line.from;
    const word = view.state.wordAt(pos);
    if (!word) return null;

    const varName = view.state.doc.sliceString(word.from, word.to);

    // Skip keywords and invalid variable names
    const keywords = ['if', 'else', 'for', 'while', 'return', 'function', 'const', 'let', 'var', 'true', 'false', 'null', 'undefined'];
    if (keywords.includes(varName) || !/^[a-zA-Z_$][\w$]*$/.test(varName)) return null;

    try {

      const result = await invoke<any>("evaluate_expression", {
        expression: varName,
        frameId: 0,
      });

      if (!result) return null;

      const dom = document.createElement('div');
      dom.className = 'debug-hover-tooltip';
      dom.innerHTML = `
        <div class="debug-hover-header">
          <span class="debug-hover-name">${varName}</span>
          <span class="debug-hover-type">${result.variable_type || result.type || 'any'}</span>
        </div>
        <div class="debug-hover-value">${result.value || String(result)}</div>
        <button class="debug-hover-add-watch" title="Add to Watch">
          <iconify-icon icon="mdi:eye-outline" width="12"></iconify-icon>
          Add to Watch
        </button>
      `;

      // Add to watch button click handler
      const addWatchBtn = dom.querySelector('.debug-hover-add-watch');
      if (addWatchBtn) {
        addWatchBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await invoke("add_watch_expression", { expression: varName });
            // Notify debug panel to refresh
            dispatch('watches-refresh');
          } catch (err) {
            console.error("Failed to add watch:", err);
          }
        });
      }

      return {
        pos: word.from,
        above: true,
        create: () => ({ dom }),
      };
    } catch (error) {
      console.error("[Editor] Debug hover error:", error);
      return null;
    }
  }

  /**
   * Handle mouse hover in editor to show LSP tooltip
   */
  private _handleEditorHover(event: MouseEvent): void {
    if (!this.editorView) return;
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    const pos = this.editorView.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;

    // Debounce hover requests - only trigger if position changed significantly
    if (pos === this._lastHoverPos) return;
    this._lastHoverPos = pos;

    // Clear pending hover request
    if (this._hoverTimeout) {
      clearTimeout(this._hoverTimeout);
    }

    // Delay hover request to avoid flickering
    this._hoverTimeout = setTimeout(() => {
      if (this.editorView) {
        showLspHoverTooltip(this.editorView, pos, activeTab.path);
      }
    }, 150);
  }

  /**
   * Notify backend of document changes for LSP sync
   */
  private _documentVersion = 0;
  private _openedDocs = new Set<string>();

  private async _notifyDocumentOpened(content: string): Promise<void> {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    const ext = getFileExtension(activeTab.path);
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

    // Only open once per document
    if (this._openedDocs.has(activeTab.path)) return;
    this._openedDocs.add(activeTab.path);

    this._documentVersion = 1;
    const uri = pathToFileUri(activeTab.path);
    await notifyDocOpened(languageId, uri, content, this._documentVersion);
    console.log('[LSP] Document opened:', activeTab.path);
  }

  private async _notifyDocumentChanged(content: string): Promise<void> {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    const ext = getFileExtension(activeTab.path);
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

    // Ensure document is opened first
    await this._notifyDocumentOpened(content);

    this._documentVersion++;
    const uri = pathToFileUri(activeTab.path);
    await notifyDocumentChanged(languageId, uri, content, this._documentVersion);
  }

  /**
   * Updates or creates the editor view without unnecessary destruction
   */
  private _currentTabId: string | null = null;

  private _updateEditor = (): void => {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) {
      // No active tab - destroy editor view if it exists
      if (this.editorView) {
        this.editorView.destroy();
        this.editorView = null;
      }
      return;
    }

    // Re-query editorContainer since Lit may have re-created the DOM
    const editorContainer = this.renderRoot.querySelector('#editor-container');
    if (!editorContainer) return;

    const language = getLanguageExtension(activeTab.path);
    const newLanguageKey = activeTab.path.split('.').pop() || '';
    const tabChanged = this._currentTabId !== activeTab.id;

    // Detect indent unit from file content (or use language default for empty files)
    const indentUnitStr = detectIndentUnit(activeTab.content, activeTab.path);
    console.log('[Editor] Detected indent unit:', JSON.stringify(indentUnitStr), 'for file:', activeTab.path);

    // Check if editorView's DOM element is still in the document
    const editorViewInDom = this.editorView && document.contains(this.editorView.dom);

    if (!this.editorView || !editorViewInDom) {
      // Editor doesn't exist or its DOM was removed - create new editor
      if (this.editorView && !editorViewInDom) {
        this.editorView.destroy();
      }
      const state = EditorState.create({
        doc: activeTab.content,
        extensions: [
          ...getCommonExtensions(
            indentUnitStr,
            (lineNum, wasThere) => this._handleBreakpointClick(lineNum, wasThere),
            this.blameVisible
          ),
          getEditorTheme(),
          language,
        ]
      });
      this.editorView = new EditorView({
        state,
        parent: editorContainer
      });
      // Add CSS class for blame visibility
      if (this.blameVisible) {
        this.editorView.dom.classList.add('cm-blame-enabled');
      } else {
        this.editorView.dom.classList.remove('cm-blame-enabled');
      }
      // Add hover listener for LSP tooltips
      this.editorView.dom.addEventListener('mousemove', (e: MouseEvent) => {
        this._handleEditorHover(e);
      });
      // Notify LSP server that document is opened
      this._notifyDocumentOpened(activeTab.content);
      this._isInitialTabLoad = true;
      this._currentLanguage = newLanguageKey;
      this._currentTabId = activeTab.id;
      // Store initial content as "saved" state
      this._savedContent.set(activeTab.path, activeTab.content);
      // Load blame if enabled
      if (this.blameVisible) {
        this._loadBlame();
      }
    } else {
      // Editor exists - check if language or tab changed
      const languageChanged = newLanguageKey !== this._currentLanguage;

      if (tabChanged || languageChanged) {
        // Get stored cursor position for the new tab, or default to line 1, col 1
        const storedLine = activeTab.cursorLine ?? 1;
        const storedCol = activeTab.cursorCol ?? 1;

        // Calculate position from stored line/col
        const lineInfo = activeTab.content.split('\n');
        let pos = 0;
        for (let i = 1; i < storedLine && i <= lineInfo.length; i++) {
          pos += lineInfo[i - 1].length + 1; // +1 for newline
        }
        pos = Math.min(pos + (storedCol - 1), activeTab.content.length);

        // Create state with restored cursor position
        const state = EditorState.create({
          doc: activeTab.content,
          extensions: [
            ...getCommonExtensions(
              indentUnitStr,
              (lineNum, wasThere) => this._handleBreakpointClick(lineNum, wasThere),
              this.blameVisible
            ),
            getEditorTheme(),
            language,
          ],
          selection: EditorSelection.create([EditorSelection.cursor(pos)])
        });
        this.editorView.setState(state);
        // Update CSS class for blame visibility
        if (this.blameVisible) {
          this.editorView.dom.classList.add('cm-blame-enabled');
        } else {
          this.editorView.dom.classList.remove('cm-blame-enabled');
        }
        this._currentLanguage = newLanguageKey;
        this._currentTabId = activeTab.id;
        // Reload blame if enabled
        if (this.blameVisible) {
          this._loadBlame();
        }
        this._isInitialTabLoad = true;

        // Dispatch cursor position immediately after tab switch
        dispatch('cursor-position', { line: storedLine, column: storedCol });
      }
    }
  }

  private _handleContentChange(content: string) {
    // Ignore initial tab load - content is already saved
    if (this._isInitialTabLoad) {
      this._isInitialTabLoad = false;
      return;
    }

    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    // Compare with saved content to determine if file is truly modified
    const savedContent = this._savedContent.get(activeTab.path) || '';
    const isModified = content !== savedContent;

    // Dispatch content-changed event with modified status
    this.dispatchEvent(new CustomEvent('content-changed', {
      detail: { path: activeTab.path, content, isModified },
    }));
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    // Only update editor when activeTabId changes, not when tabs content changes
    // The editor view handles content changes internally via EditorView.updateListener
    if (changedProperties.has('activeTabId')) {
      // Wait for DOM to be ready before updating editor
      requestAnimationFrame(() => {
        this._updateEditor();
        this._notifyLanguageChange();
      });
    }
  }

  private _notifyLanguageChange(): void {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    const ext = getFileExtension(activeTab.path);
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

    const languageId = languageMap[ext] || null;
    if (languageId) {
      dispatch('active-language-changed', { languageId });
      // Trigger auto-install if server is missing
      this._triggerAutoInstall(languageId);
    }
  }

  private _triggerAutoInstall(languageId: string): void {
    // Dispatch a custom event that status-bar listens for
    // This is more reliable than direct method calls
    dispatch('lsp-auto-install-request', { languageId });
  }

  private async _handleLspServerReady(event: Event): Promise<void> {
    const customEvent = event as CustomEvent<{ languageId: string }>;
    const { languageId } = customEvent.detail;

    // Re-open current document to initialize LSP with newly installed server
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    const ext = getFileExtension(activeTab.path);
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

    const currentLanguageId = languageMap[ext];
    if (currentLanguageId !== languageId) return;

    console.log(`[LSP] Server ready for ${languageId}, re-notifying document open`);
    // Re-send document open notification to initialize LSP
    await notifyDocOpened(
      languageId,
      activeTab.path,
      activeTab.content || '',
      1,
    );
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Listen for save events to update saved content
    document.addEventListener('file-saved', this._handleFileSaved.bind(this));
    // Listen for cursor position restore events (e.g., from go-to-definition)
    document.addEventListener('restore-cursor-position', this._handleRestoreCursorPosition.bind(this));

    // Listen for debug session events
    document.addEventListener('debug-session-started', this._handleDebugSessionStarted.bind(this));
    document.addEventListener('debug-session-ended', this._handleDebugSessionEnded.bind(this));
    document.addEventListener('debug-stopped', ((e: Event) => this._handleDebugStopped(e as CustomEvent).catch(console.error)) as EventListener);
    document.addEventListener('debug-panel-request-breakpoints', this._handleDebugPanelRequestBreakpoints.bind(this));

    // Listen for breakpoint events from panels
    document.addEventListener('breakpoint-toggled', this._handleBreakpointToggled.bind(this));
    document.addEventListener('breakpoint-removed', this._handleBreakpointRemovedExternal.bind(this));
    // Listen for LSP server ready event (after install)
    document.addEventListener('lsp-server-ready', this._handleLspServerReady.bind(this));

    // Listen for blame toggle event
    document.addEventListener('toggle-blame', this._handleToggleBlame.bind(this));

    // Listen for theme changes
    document.addEventListener('theme-changed', this._themeChangeHandler);
  }

  private _handleThemeChanged(): void {
    // Recreate editor with new theme
    if (this.editorView) {
      // Store current state
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      const cursorPos = this.editorView.state.selection.main.head;

      // Destroy old view to clear cached theme styles
      this.editorView.destroy();
      this.editorView = null;
      this._currentTabId = null;

      // Recreate editor - _updateEditor will create a new EditorView with updated CSS variables
      this._updateEditor();

      // Restore cursor position (wait for next microtask to ensure editor is ready)
      requestAnimationFrame(() => {
        if (this.editorView && cursorPos >= 0) {
          this.editorView.dispatch({
            selection: EditorSelection.create([EditorSelection.cursor(cursorPos)]),
          });
        }
      });
    }
  }

  private _handleToggleBlame(e: CustomEvent<{ visible: boolean }>): void {
    this.toggleBlame(e.detail.visible);
  }

  private _handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    // Check if file is tracked by git
    const isGitFile = this.projectPath && activeTab.path.startsWith(this.projectPath);

    this.contextMenuItems = [
      {
        id: 'toggle-blame',
        label: this.blameVisible ? 'Hide Git Blame' : 'Show Git Blame',
        icon: 'git-commit',
        disabled: !isGitFile,
      },
      {
        id: 'separator',
        label: '',
        separator: true,
      },
      {
        id: 'copy-path',
        label: 'Copy File Path',
        icon: 'copy',
      },
      {
        id: 'copy-relative-path',
        label: 'Copy Relative Path',
        icon: 'copy',
      },
    ];

    this.contextMenuAnchorX = e.clientX;
    this.contextMenuAnchorY = e.clientY;
    this.showContextMenu = true;
  }

  private _handleContextMenuSelect(e: CustomEvent<{ itemId: string }>): void {
    const { itemId } = e.detail;
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    switch (itemId) {
      case 'toggle-blame':
        this.toggleBlame();
        // Dispatch to update main.ts state
        dispatch('toggle-blame', { visible: this.blameVisible });
        break;
      case 'copy-path':
        navigator.clipboard.writeText(activeTab.path);
        dispatch('status-message', { message: 'File path copied', type: 'success' });
        break;
      case 'copy-relative-path':
        const relativePath = activeTab.path.replace(this.projectPath + '/', '');
        navigator.clipboard.writeText(relativePath);
        dispatch('status-message', { message: 'Relative path copied', type: 'success' });
        break;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.editorView?.destroy();
    if (this._hoverTimeout) {
      clearTimeout(this._hoverTimeout);
    }
    document.removeEventListener('file-saved', this._handleFileSaved.bind(this));
    document.removeEventListener('restore-cursor-position', this._handleRestoreCursorPosition.bind(this));
    document.removeEventListener('debug-session-started', this._handleDebugSessionStarted.bind(this));
    document.removeEventListener('debug-session-ended', this._handleDebugSessionEnded.bind(this));
    document.removeEventListener('toggle-blame', this._handleToggleBlame.bind(this));
    // Note: debug-stopped listener is wrapped, so we can't easily remove it - minor memory leak but acceptable
    document.removeEventListener('breakpoint-toggled', this._handleBreakpointToggled.bind(this));
    document.removeEventListener('breakpoint-removed', this._handleBreakpointRemovedExternal.bind(this));
    document.removeEventListener('lsp-server-ready', this._handleLspServerReady.bind(this));
    document.removeEventListener('theme-changed', this._themeChangeHandler);
  }

  private _handleFileSaved(event: Event): void {
    const customEvent = event as CustomEvent<{ path: string; content: string }>;
    const { path, content } = customEvent.detail;
    this._savedContent.set(path, content);
  }

  private _handleRestoreCursorPosition(event: Event): void {
    const customEvent = event as CustomEvent<{ line: number; column: number }>;
    const { line, column } = customEvent.detail;

    if (!this.editorView) return;

    // Calculate position from line/col (1-indexed)
    const lineInfo = this.editorView.state.doc.line(Math.min(line, this.editorView.state.doc.lines));
    const pos = lineInfo.from + Math.min(column - 1, lineInfo.length);

    // Move cursor to the definition location
    this.editorView.dispatch({
      selection: EditorSelection.create([EditorSelection.cursor(pos)]),
      scrollIntoView: true,
    });

    // Update cursor position in active tab
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (activeTab) {
      activeTab.cursorLine = line;
      activeTab.cursorCol = column;
    }

    // Dispatch cursor position for status bar
    dispatch('cursor-position', { line, column });

    console.log('[Editor] Restored cursor to line', line, 'col', column);
  }

  private _handleDebugSessionStarted(): void {
    this.isDebugging = true;
    // Set debug mode in editor
    if (this.editorView) {
      this.editorView.dispatch({
        effects: setDebugModeEffect.of(true),
      });
    }
    console.log('[Editor] Debug session started');
  }

  private _handleDebugSessionEnded(): void {
    this.isDebugging = false;
    this.setDebugLine(null);
    // Clear debug mode in editor
    if (this.editorView) {
      this.editorView.dispatch({
        effects: setDebugModeEffect.of(false),
      });
    }
    console.log('[Editor] Debug session ended');
  }

  private _handleDebugPanelRequestBreakpoints(): void {
    // Send all breakpoints to the debug panel
    const allBreakpoints: Breakpoint[] = [];
    for (const [path, breakpoints] of this.breakpoints.entries()) {
      allBreakpoints.push(...breakpoints);
    }
    console.log('[Editor] Sending', allBreakpoints.length, 'breakpoints to debug panel');
    for (const bp of allBreakpoints) {
      dispatch('breakpoint-added', bp);
    }
  }

  private async _handleDebugStopped(event?: CustomEvent): Promise<void> {
    console.log('[Editor] Debug stopped', event?.detail);

    // Ensure debug mode is set
    if (this.editorView) {
      this.editorView.dispatch({
        effects: setDebugModeEffect.of(true),
      });
    }

    // Fetch the current stack frame to find the stopped location
    try {
      const stackFrames = await invoke<any[]>("get_stack_trace");
      if (stackFrames.length > 0) {
        const topFrame = stackFrames[0];
        const targetPath = topFrame.source?.path || topFrame.source?.name;

        if (targetPath) {
          const activeTab = this.tabs.find(t => t.id === this.activeTabId);
          const normalizedTargetPath = targetPath.replace('file://', '');

          // If stopped in a different file, open it first
          if (!activeTab || activeTab.path !== normalizedTargetPath) {
            dispatch('go-to-location', {
              uri: targetPath.startsWith('file://') ? targetPath : `file://${targetPath}`,
              line: topFrame.line - 1,
              column: topFrame.column - 1,
            });
          }

          // Wait for file to open (if needed), then highlight the line
          setTimeout(() => {
            this.setDebugLine(topFrame.line);
            console.log('[Editor] Set debug line to:', topFrame.line, 'in file:', normalizedTargetPath);
          }, 100);
        }
      }
    } catch (error) {
      console.error('[Editor] Failed to get stack trace:', error);
    }
  }

  private _handleBreakpointToggled(event: Event): void {
    const customEvent = event as CustomEvent<{ id: number; enabled: boolean }>;
    const { id, enabled } = customEvent.detail;

    // Find and update the breakpoint
    for (const [path, breakpoints] of this.breakpoints.entries()) {
      const bp = breakpoints.find(b => b.id === id);
      if (bp) {
        bp.enabled = enabled;
        console.log(`[Editor] Breakpoint ${enabled ? 'enabled' : 'disabled'} at ${path}:${bp.line}`);
        break;
      }
    }
  }

  private _handleBreakpointRemovedExternal(event: Event): void {
    const customEvent = event as CustomEvent<{ id: number }>;
    const { id } = customEvent.detail;

    // Find and remove the breakpoint from local state
    for (const [path, breakpoints] of this.breakpoints.entries()) {
      const bp = breakpoints.find(b => b.id === id);
      if (bp) {
        this.breakpoints.set(
          path,
          breakpoints.filter(b => b.id !== id),
        );
        console.log(`[Editor] Breakpoint removed from panel at ${path}:${bp.line}`);
        break;
      }
    }
  }

  render() {
    const hasContent = this.tabs.length > 0;

    return html`
      <div class="flex flex-col h-full overflow-hidden" style="background-color: var(--app-bg);">
        <slot name="tab-bar"></slot>
        ${hasContent
          ? html`<div id="editor-container" class="flex-1 overflow-hidden" style="border-top-color: var(--app-border);"></div>`
          : html`<div class="flex-1 flex items-center justify-center text-sm" style="color: var(--app-disabled-foreground);">Select a file to edit</div>`
        }
        ${this.showContextMenu ? html`
          <context-menu
            .open=${this.showContextMenu}
            .items=${this.contextMenuItems}
            .anchorX=${this.contextMenuAnchorX}
            .anchorY=${this.contextMenuAnchorY}
            @select=${this._handleContextMenuSelect.bind(this)}
            @close=${() => { this.showContextMenu = false; }}>
          </context-menu>
        ` : ''}
      </div>
    `;
  }
}