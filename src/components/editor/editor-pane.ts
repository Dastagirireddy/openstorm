import { html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { EditorView, drawSelection, dropCursor, highlightActiveLine, lineNumbers, highlightActiveLineGutter, keymap, ViewUpdate } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput, foldKeymap, syntaxHighlighting, HighlightStyle, indentUnit } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

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
import { hoverTooltip, HoverTooltip } from '@codemirror/view';

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

@customElement('editor-pane')
export class EditorPane extends TailwindElement() {
  @query('#editor-container') private editorContainer!: HTMLElement;

  @state() tabs: EditorTab[] = [];
  @state() activeTabId: string = '';

  private editorView: EditorView | null = null;
  private _isInitialTabLoad = true;
  private _currentLanguage: string = '';

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
   */
  private getCommonExtensions() {
    return [
      EditorState.tabSize.of(4),
      indentUnit.of("    "),
      lineNumbers(),
      highlightActiveLineGutter(),
      ...customFoldGutter(),
      history(),
      drawSelection(),
      dropCursor(),
      highlightActiveLine(),
      bracketMatching(),
      indentOnInput(),
      syntaxHighlighting(intellijLightHighlight),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),

      // LSP Intellisense
      autocompletion({
        override: [this._lspCompletionSource.bind(this)],
        activateOnTyping: true,
        activateOnTypingDelay: 50,
        minChars: 1,
        maxRenderedOptions: 10,
        defaultKeymap: true,
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
        },
        ".cm-line": { padding: "0 8px" },
        ".cm-gutters": {
          backgroundColor: IJ_COLORS.gutterBackground,
          color: IJ_COLORS.lineNumbers,
          borderRight: `1px solid ${IJ_COLORS.gutterBorder}`,
          border: "none",
          direction: "ltr !important",
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
        // Hover tooltip styling
        ".cm-tooltip": {
          padding: "10px 14px",
          maxWidth: "600px",
          backgroundColor: "#ffffff",
          border: "1px solid #c7c7c7",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          borderRadius: "4px",
          fontSize: "13px",
          lineHeight: "1.5",
        },
        ".cm-tooltip code": {
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: "12px",
          backgroundColor: "#f5f5f5",
          padding: "2px 6px",
          borderRadius: "3px",
          color: "#00627a",
        },
        ".cm-tooltip pre": {
          backgroundColor: "#f8f8f8",
          border: "1px solid #e0e0e0",
          borderRadius: "4px",
          padding: "10px",
          overflow: "auto",
          fontSize: "12px",
          margin: "8px 0",
        },
        ".cm-tooltip-hover": {
          fontSize: "13px",
          lineHeight: "1.6",
        },
        ".cm-tooltip b, .cm-tooltip strong": {
          color: "#0033b3",
          fontWeight: "600",
        },
      }),

      // Listen for changes
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          const content = update.state.doc.toString();
          this._handleContentChange(content);
          this._notifyDocumentChanged(content);
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
      })
    ];
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

      // If it's the same file, just move cursor
      if (loc.uri === activeTab.path || loc.uri.startsWith('file://')) {
        // For now, just show a notification - full navigation would require
        // opening the target file and positioning the cursor
        const statusBar = document.querySelector('status-bar') as any;
        if (statusBar) {
          statusBar.setStatusMessage(`Jumping to ${loc.uri.split('/').pop()}:${loc.start_line + 1}`);
        }

        // Dispatch event to open the target file
        document.dispatchEvent(new CustomEvent('go-to-location', {
          detail: {
            uri: loc.uri,
            line: loc.start_line,
            column: loc.start_char,
          },
          bubbles: true,
          composed: true,
        }));
      } else {
        // Different file - dispatch event to open it
        document.dispatchEvent(new CustomEvent('go-to-location', {
          detail: {
            uri: loc.uri,
            line: loc.start_line,
            column: loc.start_char,
          },
          bubbles: true,
          composed: true,
        }));
      }
    } catch (error) {
      console.error('[Editor] LSP definition error:', error);
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
                div.innerHTML = formatHoverContent(item.documentation);
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
   * LSP hover tooltip for CodeMirror
   */
  private async _lspHoverTooltip(view: EditorView, pos: number): Promise<HoverTooltip | null> {
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

      const dom = document.createElement('div');
      dom.innerHTML = formatHoverContent(hover.contents);

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
    if (!activeTab || !this.editorContainer) return;

    const language = this.getLanguageExtension(activeTab.path);
    const newLanguageKey = activeTab.path.split('.').pop() || '';
    const tabChanged = this._currentTabId !== activeTab.id;

    if (!this.editorView) {
      // First time - create new editor
      const state = EditorState.create({
        doc: activeTab.content,
        extensions: [...this.getCommonExtensions(), language]
      });
      this.editorView = new EditorView({
        state,
        parent: this.editorContainer
      });
      // Notify LSP server that document is opened
      this._notifyDocumentOpened(activeTab.content);
      this._isInitialTabLoad = true;
      this._currentLanguage = newLanguageKey;
      this._currentTabId = activeTab.id;
    } else {
      // Editor exists - check if language or tab changed
      const languageChanged = newLanguageKey !== this._currentLanguage;

      // Get current selection to restore after update
      const selection = this.editorView.state.selection;

      if (tabChanged || languageChanged) {
        // Tab switched - load the new tab's content
        const state = EditorState.create({
          doc: activeTab.content,
          extensions: [...this.getCommonExtensions(), language],
          selection: selection
        });
        this.editorView.setState(state);
        this._currentLanguage = newLanguageKey;
        this._currentTabId = activeTab.id;
        this._isInitialTabLoad = true;
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
    if (activeTab) {
      this.dispatchEvent(new CustomEvent('content-changed', {
        detail: { path: activeTab.path, content },
        bubbles: true,
        composed: true,
      }));
    }
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('activeTabId') || changedProperties.has('tabs')) {
      this._updateEditor();
      this._notifyLanguageChange();
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

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.editorView?.destroy();
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