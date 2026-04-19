import { html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { EditorView, drawSelection, dropCursor, highlightActiveLine, lineNumbers, highlightActiveLineGutter, keymap, ViewUpdate, gutter, GutterMarker, Decoration } from '@codemirror/view';
import { EditorState, EditorSelection, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldKeymap, syntaxHighlighting, HighlightStyle, indentUnit } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';
import { Facet } from '@codemirror/state';

// Language Imports
import { rust } from '@codemirror/lang-rust';
import { javascript } from '@codemirror/lang-javascript';
import { go } from '@codemirror/lang-go';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { html as htmlLang } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { java } from '@codemirror/lang-java';
import { sql } from '@codemirror/lang-sql';
import { php } from '@codemirror/lang-php';

import { TailwindElement } from '../../tailwind-element.js';
import { customFoldGutter } from '../../lib/custom-fold-gutter.js';
import { getFileExtension } from '../../lib/file-icons.js';
import type { EditorTab } from '../../lib/file-types.js';
import {
  getCompletions,
  getHover,
  getDefinition,
  notifyDocumentOpened,
  notifyDocumentChanged,
  notifyDocumentClosed,
  completionKindToType,
  getCompletionIcon,
  formatHoverContent,
  pathToFileUri,
} from '../../lib/lsp-client.js';
import {
  autocompletion,
  CompletionContext,
  CompletionResult,
  Completion,
} from '@codemirror/autocomplete';
import { hoverTooltip } from '@codemirror/view';

/**
 * IntelliJ Classic Light Theme Constants
 */
const IJ_COLORS = {
  background: '#ffffff',
  gutterBackground: '#f0f0f0',
  gutterBorder: '#d1d1d1',
  activeLine: '#e4ffaf7a', 
  selection: '#2142832e',
  lineNumbers: '#adadad',
};

const intellijLightHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier], color: '#0033b3', fontWeight: 'bold' },
  { tag: [t.definition(t.variableName), t.function(t.variableName)], color: '#00627a' },
  { tag: t.propertyName, color: '#871094' },
  { tag: t.string, color: '#067d17' },
  { tag: t.number, color: '#1750eb' },
  { tag: [t.comment, t.lineComment], color: '#8c8c8c', fontStyle: 'italic' },
  { tag: t.meta, color: '#9e880d' },
  { tag: t.operator, color: '#000000' },
  { tag: t.bracket, color: '#000000' }
]);

/**
 * Breakpoint interface
 */
export interface Breakpoint {
  id: number;
  sourcePath: string;
  line: number;
  enabled: boolean;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  verified: boolean;
}

/**
 * State field for tracking breakpoints in the editor
 */
const breakpointField = StateField.define<Set<number>>({
  create: () => new Set<number>(),
  update(value, transaction) {
    for (const e of transaction.effects) {
      if (e.is(addBreakpointEffect)) {
        const newValue = new Set(value);
        newValue.add(e.value);
        return newValue;
      }
      if (e.is(removeBreakpointEffect)) {
        const newValue = new Set(value);
        newValue.delete(e.value);
        return newValue;
      }
      if (e.is(setBreakpointsEffect)) {
        return new Set(e.value);
      }
    }
    return value;
  },
});

/**
 * State effects for breakpoint operations
 */
const addBreakpointEffect = StateEffect.define<number>();
const removeBreakpointEffect = StateEffect.define<number>();
const setBreakpointsEffect = StateEffect.define<number[]>();

/**
 * Gutter marker for breakpoints
 */
class BreakpointMarker extends GutterMarker {
  toDOM() {
    const div = document.createElement('div');
    div.className = 'cm-breakpoint-dot';
    return div;
  }
}

const breakpointMarker = new BreakpointMarker();

/**
 * Gutter extension for breakpoints - must be before lineNumbers() to render first
 */
function breakpointGutter(onBreakpointClick?: (lineNum: number, hasBreakpoint: boolean) => void) {
  return [
    breakpointField,
    gutter({
      class: 'cm-breakpoint-gutter',
      lineMarker: (view, line) => {
        const breakpoints = view.state.field(breakpointField);
        const lineNum = view.state.doc.lineAt(line.from).number;
        return breakpoints.has(lineNum) ? breakpointMarker : null;
      },
      lineMarkerChange: (update) => {
        return update.transactions.some(t => t.effects.some(e =>
          e.is(addBreakpointEffect) || e.is(removeBreakpointEffect) || e.is(setBreakpointsEffect)
        ));
      },
      domEventHandlers: {
        mousedown(view, line) {
          const lineNum = view.state.doc.lineAt(line.from).number;
          const breakpoints = view.state.field(breakpointField);
          const hasBreakpoint = breakpoints.has(lineNum);

          view.dispatch({
            effects: hasBreakpoint
              ? removeBreakpointEffect.of(lineNum)
              : addBreakpointEffect.of(lineNum)
          });

          if (onBreakpointClick) onBreakpointClick(lineNum, hasBreakpoint);
          return true;
        }
      },
    }),
    EditorView.baseTheme({
      '.cm-breakpoint-gutter': {
        width: '24px',
        minWidth: '24px',
        cursor: 'pointer',
      },
      '.cm-breakpoint-gutter .cm-breakpoint-dot': {
        display: 'block',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        backgroundColor: '#e53935',
        border: '1px solid #b71c1c',
        margin: '5px auto',
      },
      '.cm-breakpoint-gutter .cm-breakpoint-dot:hover': {
        backgroundColor: '#ff5252',
      },
      '.cm-debug-line': {
        backgroundColor: '#fff9c4 !important',
      },
    }),
  ];
}

/**
 * State field for current debug line highlighting
 */
const debugLineField = StateField.define<number | null>({
  create: () => null,
  update(value, transaction) {
    for (const e of transaction.effects) {
      if (e.is(setDebugLineEffect)) {
        return e.value;
      }
    }
    return value;
  },
});

const setDebugLineEffect = StateEffect.define<number | null>();

function debugLineHighlight() {
  return [
    debugLineField,
    EditorView.decorations.compute(['doc', debugLineField], (state) => {
      const line = state.field(debugLineField);
      if (line === null) return Decoration.none;

      const lineInfo = state.doc.line(line);
      if (!lineInfo) return Decoration.none;

      return Decoration.set([
        Decoration.line({ class: 'cm-debug-line' }).range(lineInfo.from),
      ]);
    }),
  ];
}

@customElement('editor-pane')
export class EditorPane extends TailwindElement() {
  @state() tabs: EditorTab[] = [];
  @state() activeTabId: string = '';
  @state() private isDebugging = false;
  @state() private currentDebugLine: number | null = null;

  // Track breakpoints per file path
  private breakpoints: Map<string, Breakpoint[]> = new Map();
  private nextBreakpointId = 1;

  private editorView: EditorView | null = null;
  private _isInitialTabLoad = true;
  private _currentLanguage: string = '';
  private _savedContent: Map<string, string> = new Map();
  private _definitionCheckTimeout: ReturnType<typeof setTimeout> | null = null;
  private _lastCheckedPosition: string | null = null;
  private _lastHasDefinition: boolean = false;

  /**
   * Detects the indentation unit from file content
   * Analyzes the first 100 lines to find the most common indentation
   * Falls back to language-specific defaults for empty files
   */
  private detectIndentUnit(content: string, path?: string): string {
    // For empty files, use language-specific defaults
    if (!content || !content.trim()) {
      if (path) {
        const ext = getFileExtension(path).toLowerCase();
        // JS/TS typically use 2 spaces
        if (['ts', 'tsx', 'js', 'jsx', 'mjs'].includes(ext)) {
          return '  ';
        }
        // Go, Rust, Python typically use 4 spaces (or tabs for Go)
        if (['go', 'rs', 'py'].includes(ext)) {
          return '    ';
        }
      }
      // Default to 4 spaces
      return '    ';
    }

    const lines = content.split('\n').slice(0, 100);
    const indentCounts = new Map<number, number>();

    for (const line of lines) {
      if (!line.trim()) continue; // Skip empty lines

      const match = line.match(/^(\t+)/);
      if (match && match[1].length > 0) {
        // Tab indentation
        indentCounts.set(1, (indentCounts.get(1) || 0) + 1);
        continue;
      }

      const spaces = line.match(/^( +)/);
      if (spaces) {
        const count = spaces[1].length;
        // Count common indent sizes (2, 4, 8 spaces)
        if (count >= 2) {
          const normalized = count >= 8 ? 8 : count >= 4 ? 4 : 2;
          indentCounts.set(normalized, (indentCounts.get(normalized) || 0) + 1);
        }
      }
    }

    // Find most common indent size
    let maxCount = 0;
    let indentSize = 4; // Default to 4 spaces

    for (const [size, count] of indentCounts) {
      if (count > maxCount) {
        maxCount = count;
        indentSize = size;
      }
    }

    // Return indent unit string
    if (indentSize === 1) return '\t';
    return ' '.repeat(indentSize);
  }

  /**
   * Maps file paths to CodeMirror language extensions
   */
  private getLanguageExtension(path: string) {
    const ext = getFileExtension(path).toLowerCase();
    switch (ext) {
      case 'rs': return rust();
      case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs': return javascript();
      case 'go': return go();
      case 'py': return python();
      case 'c': case 'cpp': case 'cc': case 'cxx': case 'h': case 'hpp': case 'hxx': return cpp();
      case 'html': case 'htm': case 'xhtml': return htmlLang();
      case 'css': case 'scss': case 'sass': case 'less': return css();
      case 'json': return json();
      case 'md': case 'markdown': return markdown();
      case 'yaml': case 'yml': return yaml();
      case 'java': return java();
      case 'sql': return sql();
      case 'php': return php();
      default: return javascript();
    }
  }

  /**
   * Generates the core extension stack for IntelliJ look and feel
   * @param indentUnitStr - The detected indent unit string (e.g., "  ", "    ", "\t")
   */
  private getCommonExtensions(indentUnitStr: string = "    ") {
    return [
      EditorState.tabSize.of(4),
      indentUnit.of(indentUnitStr),
      ...breakpointGutter((lineNum, wasThere) => {
        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        if (!activeTab) return;

        if (wasThere) {
          const fileBreakpoints = this.breakpoints.get(activeTab.path) || [];
          const bp = fileBreakpoints.find(b => b.line === lineNum);
          if (bp) this._removeBreakpoint(activeTab.path, bp);
        } else {
          this._addBreakpoint(activeTab.path, lineNum);
        }
      }),
      lineNumbers(),
      highlightActiveLineGutter(),
      ...customFoldGutter(),
      ...debugLineHighlight(),
      history(),
      drawSelection(),
      dropCursor(),
      highlightActiveLine(),
      bracketMatching(),
      indentOnInput(),
      // indentationMarkers with "fullScope" tracks both tabs and spaces
      indentationMarkers({
        highlightActiveBlock: true,
        markerType: "fullScope",
        thickness: 1,
        activeThickness: 1,
        colors: {
          light: '#d0d0d0',
          dark: '#505050',
          activeLight: '#b0b0b0',
          activeDark: '#707070',
        },
      }),
      syntaxHighlighting(intellijLightHighlight),
      // Keymap order matters - historyKeymap must come before defaultKeymap
      // so undo/redo takes precedence
      // Explicitly define undo/redo keybindings for macOS Cmd+Z / Cmd+Shift+Z
      keymap.of([
        {
          key: 'Mod-z',
          run: (view) => {
            console.log('[Editor] Undo key pressed (Mod-z)');
            return undo(view);
          },
        },
        {
          key: 'Mod-y',
          run: (view) => {
            console.log('[Editor] Redo key pressed (Mod-y)');
            return redo(view);
          },
        },
        {
          key: 'Mod-Shift-z',
          run: (view) => {
            console.log('[Editor] Redo key pressed (Mod-Shift-z)');
            return redo(view);
          },
        },
        ...historyKeymap,
        ...defaultKeymap,
        ...foldKeymap,
      ]),

      // LSP Intellisense
      autocompletion({
        override: [this._lspCompletionSource.bind(this)],
        activateOnTyping: true,
        activateOnTypingDelay: 50,
      }),
      hoverTooltip(this._lspHoverTooltip.bind(this), {
        hoverTime: 500,
      }),

      // Theme matching IntelliJ Classic
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "15px",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          backgroundColor: IJ_COLORS.background,
          direction: "ltr !important",
        },
        ".cm-content": {
          padding: "10px 0",
          direction: "ltr !important",
          caretColor: "#000000",
          cursor: "text",
        },
        // Use 2px padding to match library's expected padding for indent markers
        ".cm-line": {
          padding: "0 2px",
          cursor: "text",
        },
        ".cm-gutters": {
          backgroundColor: IJ_COLORS.gutterBackground,
          color: IJ_COLORS.lineNumbers,
          borderRight: `1px solid ${IJ_COLORS.gutterBorder}`,
          border: "none",
          direction: "ltr !important",
        },
        ".cm-breakpoint-gutter": {
          pointerEvents: "auto",
          cursor: "pointer",
        },
        ".cm-activeLine": { backgroundColor: IJ_COLORS.activeLine },
        ".cm-activeLineGutter": { backgroundColor: "#d4ebf7", color: "#000000" },
        ".cm-lineNumbers .cm-gutterElement": {
          padding: "0 8px 0 12px",
          minWidth: "40px"
        },
        ".cm-selectionBackground": { backgroundColor: IJ_COLORS.selection },
        "&.cm-focused .cm-selectionBackground": { backgroundColor: IJ_COLORS.selection },
        ".cm-cursor": { borderLeft: "2px solid #000000" },
        // Pointer cursor when hovering over a definition (Cmd+Click target)
        "&.cm-has-definition .cm-content, &.cm-has-definition .cm-line": {
          cursor: "pointer !important",
        },
        // Autocomplete styling - IntelliJ style
        ".cm-tooltip-autocomplete": {
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: "13px",
          padding: "0",
          backgroundColor: "#ffffff",
          border: "1px solid #c7c7c7",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          borderRadius: "4px",
          overflow: "hidden",
        },
        ".cm-tooltip-autocomplete ul": {
          padding: "4px 0",
          margin: "0",
        },
        ".cm-tooltip-autocomplete ul li": {
          padding: "4px 12px",
          margin: "0",
          cursor: "default",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#000000",
        },
        ".cm-tooltip-autocomplete ul li[aria-selected]": {
          backgroundColor: "#4f46e5",
          color: "#ffffff !important",
        },
        ".cm-tooltip-autocomplete ul li[aria-selected] .cm-completionLabel, .cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail": {
          color: "#ffffff !important",
        },
        // Completion item type icons/colors
        ".cm-tooltip-autocomplete .cm-completionLabel": {
          fontWeight: "500",
          color: "#000000",
        },
        ".cm-tooltip-autocomplete .cm-completionDetail": {
          color: "#666666",
          marginLeft: "8px",
          fontSize: "12px",
        },
        // Type-specific colors (matching IntelliJ)
        ".cm-tooltip-autocomplete .cm-completionIcon-method, .cm-tooltip-autocomplete .cm-completionIcon-function": {
          color: "#871094",
        },
        ".cm-tooltip-autocomplete .cm-completionIcon-variable, .cm-tooltip-autocomplete .cm-completionIcon-field": {
          color: "#00627a",
        },
        ".cm-tooltip-autocomplete .cm-completionIcon-class, .cm-tooltip-autocomplete .cm-completionIcon-interface": {
          color: "#0033b3",
        },
        ".cm-tooltip-autocomplete .cm-completionIcon-keyword": {
          color: "#0033b3",
        },
        // Hover tooltip - IntelliJ style (exact match)
        ".cm-tooltip": {
          padding: "0",
          maxWidth: "450px",
          backgroundColor: "#ffffff",
          color: "#1d1d1d",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: "12px",
          border: "1px solid #c9c9c9",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          borderRadius: "0",
        },
        ".cm-tooltip .cm-tooltip-hover": {
          padding: "0",
        },
        // Top header with error message
        ".cm-tooltip .tooltip-top-header": {
          padding: "4px 8px",
          display: "flex",
          justifyContent: "space-between",
          color: "#1d1d1d",
        },
        ".cm-tooltip .tooltip-top-header .error-msg": {
          fontSize: "11px",
          color: "#666666",
        },
        ".cm-tooltip .tooltip-top-header .menu-icon": {
          color: "#888888",
          cursor: "pointer",
          fontSize: "14px",
        },
        // Quick actions bar
        ".cm-tooltip .intellij-actions": {
          display: "flex",
          gap: "12px",
          padding: "2px 8px 6px 8px",
        },
        ".cm-tooltip .intellij-actions .action-item": {
          display: "flex",
          alignItems: "center",
          gap: "4px",
        },
        ".cm-tooltip .intellij-actions .action-link": {
          color: "#2470b3",
          cursor: "pointer",
          fontSize: "11px",
        },
        ".cm-tooltip .intellij-actions .action-shortcut": {
          color: "#909090",
          fontSize: "10px",
        },
        // Divider
        ".cm-tooltip .intellij-divider": {
          border: "none",
          borderTop: "1px solid #ebebeb",
          margin: "0",
        },
        // Signature
        ".cm-tooltip .tooltip-signature": {
          padding: "8px",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "11px",
        },
        ".cm-tooltip .tooltip-signature code": {
          color: "#1d1d1d",
        },
        ".cm-tooltip .tooltip-signature .keyword": {
          color: "#871094",
          fontWeight: "bold",
        },
        ".cm-tooltip .tooltip-signature .variable": {
          color: "#1d1d1d",
        },
        ".cm-tooltip .tooltip-signature .type": {
          color: "#0033b3",
        },
        // Availability bar
        ".cm-tooltip .availability-bar": {
          padding: "6px 8px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          color: "#595959",
          fontSize: "11px",
        },
        ".cm-tooltip .availability-bar .check-icon": {
          color: "#4fa54f",
          fontWeight: "bold",
          fontSize: "12px",
        },
        ".cm-tooltip .availability-bar .avail-text": {
          flex: "1",
        },
        ".cm-tooltip .availability-bar .chevron-icon": {
          color: "#888888",
          fontSize: "12px",
        },
        // Body content
        ".cm-tooltip .tooltip-body": {
          padding: "8px",
          lineHeight: "1.5",
          fontSize: "11px",
          color: "#333333",
        },
        ".cm-tooltip .tooltip-body p": {
          margin: "0 0 6px 0",
        },
        ".cm-tooltip .tooltip-body p:last-child": {
          margin: "0",
        },
        ".cm-tooltip .tooltip-body code": {
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "10px",
          backgroundColor: "#f5f5f5",
          padding: "1px 4px",
          borderRadius: "2px",
          border: "1px solid #e8e8e8",
        },
        ".cm-tooltip .tooltip-body pre": {
          backgroundColor: "#f9f9f9",
          border: "1px solid #e8e8e8",
          borderRadius: "2px",
          padding: "8px",
          overflow: "auto",
          fontSize: "10px",
          margin: "6px 0",
          fontFamily: "'JetBrains Mono', monospace",
        },
        ".cm-tooltip .tooltip-body .kw": { color: "#871094", fontWeight: "bold" },
        ".cm-tooltip .tooltip-body .type": { color: "#0033b3" },
        ".cm-tooltip .tooltip-body .string": { color: "#067d17" },
        ".cm-tooltip .tooltip-body .comment": { color: "#999999", fontStyle: "italic" },
        // Footer
        ".cm-tooltip .tooltip-footer": {
          padding: "8px",
          borderTop: "1px solid #ebebeb",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "10px",
        },
        ".cm-tooltip .tooltip-footer .ts-badge": {
          background: "#3178c6",
          color: "white",
          fontSize: "9px",
          padding: "1px 3px",
          borderRadius: "2px",
          fontWeight: "bold",
        },
        ".cm-tooltip .tooltip-footer .footer-meta": {
          color: "#888888",
        },
        ".cm-tooltip .tooltip-footer .mdn-link": {
          color: "#2470b3",
          textDecoration: "none",
          marginLeft: "auto",
        },
        ".cm-tooltip .tooltip-footer .mdn-link:hover": {
          textDecoration: "underline",
        },
      }),

      // Listen for changes and cursor position updates
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          const content = update.state.doc.toString();
          this._handleContentChange(content);
          this._notifyDocumentChanged(content);
        }
        // Track cursor position per tab on selection changes
        if (update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          const column = pos - line.from;

          // Update cursor position in the active tab
          const activeTab = this.tabs.find(t => t.id === this.activeTabId);
          if (activeTab) {
            activeTab.cursorLine = line.number;
            activeTab.cursorCol = column + 1;
          }

          // Dispatch cursor position for status bar
          document.dispatchEvent(new CustomEvent('cursor-position', {
            detail: { line: line.number, column: column + 1 },
            bubbles: true,
            composed: true,
          }));
        }
      }),

      // Click handler for Ctrl+Click go-to-definition
      EditorView.domEventHandlers({
        click: (event, view) => {
          if ((event.ctrlKey || event.metaKey) && view.state.selection.main) {
            this._handleGoToDefinition(view);
            return true;
          }
          return false;
        },
        mousemove: (event, view) => {
          const isCtrlOrMeta = event.ctrlKey || event.metaKey;
          if (isCtrlOrMeta) {
            // Show pointer cursor immediately when Cmd is held
            view.dom.classList.add('cm-has-definition');

            const rect = view.dom.getBoundingClientRect();
            const pos = view.posAtCoords({ x: event.clientX - rect.left, y: event.clientY - rect.top });
            if (pos !== null) {
              const line = view.state.doc.lineAt(pos);
              const column = pos - line.from;
              this._checkDefinitionAtPosition(view, line.number - 1, column);
            }
          } else {
            view.dom.classList.remove('cm-has-definition');
          }
          return false;
        },
        keyup: (event, view) => {
          if (event.key === 'Control' || event.key === 'Meta') {
            view.dom.classList.remove('cm-has-definition');
            if (this._definitionCheckTimeout) {
              clearTimeout(this._definitionCheckTimeout);
              this._definitionCheckTimeout = null;
            }
          }
          return false;
        },
      })
    ];
  }

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
      document.dispatchEvent(new CustomEvent('go-to-location', {
        detail: {
          uri: loc.uri,
          line: loc.start_line,
          column: loc.start_char,
        },
        bubbles: true,
        composed: true,
      }));
    } catch (error) {
      console.error('[Editor] LSP definition error:', error);
    }
  }

  /**
   * Add a breakpoint at the specified line
   */
  private async _addBreakpoint(filePath: string, line: number): Promise<void> {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return;

    console.log("[Editor] Adding breakpoint at", filePath, "line:", line);

    const breakpoint: Breakpoint = {
      id: this.nextBreakpointId++,
      sourcePath: filePath,
      line,
      enabled: true,
      verified: false,
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
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<Breakpoint>("add_breakpoint", {
        sourcePath: filePath,
        line,
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
    document.dispatchEvent(new CustomEvent('breakpoint-added', {
      detail: breakpoint,
      bubbles: true,
      composed: true,
    }));
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

    // Dispatch event for debug panel
    document.dispatchEvent(new CustomEvent('breakpoint-removed', {
      detail: { id: breakpoint.id },
      bubbles: true,
      composed: true,
    }));
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
   * LSP hover tooltip for CodeMirror - IntelliJ style
   */
  private async _lspHoverTooltip(view: EditorView, pos: number): Promise<{ pos: number; above: boolean; create: () => { dom: HTMLElement } } | null> {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab) return null;

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
    if (!languageId) return null;

    const line = view.state.doc.lineAt(pos);
    const column = pos - line.from;

    try {
      const hover = await getHover(
        languageId,
        activeTab.path,
        view.state.doc.toString(),
        line.number - 1,
        column
      );

      if (!hover || !hover.contents) return null;

      // Parse hover contents to extract metadata for rich tooltip
      const sections = hover.contents.split(/\n---\n/);
      const signature = sections[0]?.trim().replace(/^```(\w*)\n?([\s\S]*?)\n?```$/, '$2') || '';
      const description = sections.slice(1, -1).join('\n').trim();
      const lastSection = sections[sections.length - 1]?.trim() || '';

      // Parse link from last section
      const linkMatch = lastSection.match(/\[([^\]]+)\]\(([^)]+)\)/);
      const link = linkMatch ? { text: linkMatch[1], url: linkMatch[2] } : undefined;

      // Detect tags from content or signature
      const tags: string[] = [];
      if (signature.includes('Console') || languageId === 'typescript') {
        if (signature.includes('Console')) tags.push('built-in');
        tags.push('dom');
      }

      // Detect availability from content keywords
      let availability: 'widely-available' | 'experimental' | 'deprecated' | undefined;
      if (description.toLowerCase().includes('deprecated')) {
        availability = 'deprecated';
      } else if (description.toLowerCase().includes('experimental')) {
        availability = 'experimental';
      } else if (description.toLowerCase().includes('widely available') || description.toLowerCase().includes('standard')) {
        availability = 'widely-available';
      }

      const dom = document.createElement('div');
      dom.innerHTML = formatHoverContent(hover.contents, {
        signature,
        typeInfo: hover.range ? 'property' : undefined,
        tags: tags.length > 0 ? tags : undefined,
        link,
        availability,
      });

      return {
        pos,
        above: true,
        create: () => ({ dom }),
      };
    } catch (error) {
      console.error('[Editor] LSP hover error:', error);
      return null;
    }
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
    await notifyDocumentOpened(languageId, uri, content, this._documentVersion);
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

    const language = this.getLanguageExtension(activeTab.path);
    const newLanguageKey = activeTab.path.split('.').pop() || '';
    const tabChanged = this._currentTabId !== activeTab.id;

    // Detect indent unit from file content (or use language default for empty files)
    const indentUnitStr = this.detectIndentUnit(activeTab.content, activeTab.path);
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
        extensions: [...this.getCommonExtensions(indentUnitStr), language]
      });
      this.editorView = new EditorView({
        state,
        parent: editorContainer
      });
      // Notify LSP server that document is opened
      this._notifyDocumentOpened(activeTab.content);
      this._isInitialTabLoad = true;
      this._currentLanguage = newLanguageKey;
      this._currentTabId = activeTab.id;
      // Store initial content as "saved" state
      this._savedContent.set(activeTab.path, activeTab.content);
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
          extensions: [...this.getCommonExtensions(indentUnitStr), language],
          selection: EditorSelection.create([EditorSelection.cursor(pos)])
        });
        this.editorView.setState(state);
        this._currentLanguage = newLanguageKey;
        this._currentTabId = activeTab.id;
        this._isInitialTabLoad = true;

        // Dispatch cursor position immediately after tab switch
        document.dispatchEvent(new CustomEvent('cursor-position', {
          detail: { line: storedLine, column: storedCol },
          bubbles: true,
          composed: true,
        }));
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
      bubbles: true,
      composed: true,
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
      document.dispatchEvent(new CustomEvent('active-language-changed', { detail: { languageId } }));
      // Trigger auto-install if server is missing
      this._triggerAutoInstall(languageId);
    }
  }

  private _triggerAutoInstall(languageId: string): void {
    // Dispatch a custom event that status-bar listens for
    // This is more reliable than direct method calls
    document.dispatchEvent(new CustomEvent('lsp-auto-install-request', {
      detail: { languageId },
      bubbles: true,
      composed: true,
    }));
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

    // Listen for breakpoint events from panels
    document.addEventListener('breakpoint-toggled', this._handleBreakpointToggled.bind(this));
    document.addEventListener('breakpoint-removed', this._handleBreakpointRemovedExternal.bind(this));
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.editorView?.destroy();
    document.removeEventListener('file-saved', this._handleFileSaved.bind(this));
    document.removeEventListener('restore-cursor-position', this._handleRestoreCursorPosition.bind(this));
    document.removeEventListener('debug-session-started', this._handleDebugSessionStarted.bind(this));
    document.removeEventListener('debug-session-ended', this._handleDebugSessionEnded.bind(this));
    // Note: debug-stopped listener is wrapped, so we can't easily remove it - minor memory leak but acceptable
    document.removeEventListener('breakpoint-toggled', this._handleBreakpointToggled.bind(this));
    document.removeEventListener('breakpoint-removed', this._handleBreakpointRemovedExternal.bind(this));
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
    document.dispatchEvent(new CustomEvent('cursor-position', {
      detail: { line, column },
      bubbles: true,
      composed: true,
    }));

    console.log('[Editor] Restored cursor to line', line, 'col', column);
  }

  private _handleDebugSessionStarted(): void {
    this.isDebugging = true;
    console.log('[Editor] Debug session started');
  }

  private _handleDebugSessionEnded(): void {
    this.isDebugging = false;
    this.setDebugLine(null);
    console.log('[Editor] Debug session ended');
  }

  private async _handleDebugStopped(event?: CustomEvent): Promise<void> {
    console.log('[Editor] Debug stopped', event?.detail);

    // Get the stopped location from the event or fetch it
    const threadId = event?.detail?.threadId;
    const stoppedLine = event?.detail?.line;
    const stoppedSourcePath = event?.detail?.source?.path;

    // If we have the stopped location, highlight it
    if (stoppedLine && stoppedSourcePath) {
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      const targetPath = stoppedSourcePath.replace('file://', '');

      // If stopped in a different file, open it first
      if (!activeTab || activeTab.path !== targetPath) {
        // Open the file where execution stopped
        document.dispatchEvent(new CustomEvent('go-to-location', {
          detail: {
            uri: stoppedSourcePath.startsWith('file://') ? stoppedSourcePath : `file://${stoppedSourcePath}`,
            line: stoppedLine - 1,
            column: 0,
          },
          bubbles: true,
          composed: true,
        }));
      }

      // Wait a tick for the editor to switch files, then highlight the line
      setTimeout(() => {
        this.setDebugLine(stoppedLine);
      }, 50);
    } else {
      // Fetch the current stack frame to find the stopped location
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const stackFrames = await invoke<any[]>("get_stack_trace");
        if (stackFrames.length > 0) {
          const topFrame = stackFrames[0];
          const activeTab = this.tabs.find(t => t.id === this.activeTabId);
          const targetPath = topFrame.source?.path || topFrame.source?.name;

          if (targetPath && (!activeTab || activeTab.path !== targetPath)) {
            document.dispatchEvent(new CustomEvent('go-to-location', {
              detail: {
                uri: `file://${targetPath}`,
                line: topFrame.line - 1,
                column: topFrame.column - 1,
              },
              bubbles: true,
              composed: true,
            }));
          }

          setTimeout(() => {
            this.setDebugLine(topFrame.line);
          }, 50);
        }
      } catch (error) {
        console.error('[Editor] Failed to get stack trace:', error);
      }
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
      <div class="flex flex-col h-full overflow-hidden bg-white">
        <slot name="tab-bar"></slot>
        ${hasContent
          ? html`<div id="editor-container" class="flex-1 overflow-hidden border-t border-[#c7c7c7]"></div>`
          : html`<div class="flex-1 flex items-center justify-center text-[#8a8a8a] text-sm">Select a file to edit</div>`
        }
      </div>
    `;
  }
}