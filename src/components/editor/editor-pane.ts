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
      
      // Theme matching IntelliJ Classic
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "15px",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          backgroundColor: IJ_COLORS.background,
        },
        ".cm-gutters": {
          backgroundColor: IJ_COLORS.gutterBackground,
          color: IJ_COLORS.lineNumbers,
          borderRight: `1px solid ${IJ_COLORS.gutterBorder}`,
          border: "none"
        },
        ".cm-activeLine": { backgroundColor: IJ_COLORS.activeLine },
        ".cm-activeLineGutter": { backgroundColor: "#d4ebf7", color: "#000000" },
        ".cm-lineNumbers .cm-gutterElement": {
          padding: "0 8px 0 12px",
          minWidth: "40px"
        },
        ".cm-content": { padding: "10px 0" },
        ".cm-line": { padding: "0 8px" },
        ".cm-selectionBackground": { backgroundColor: IJ_COLORS.selection },
        "&.cm-focused .cm-selectionBackground": { backgroundColor: IJ_COLORS.selection },
        ".cm-cursor": { borderLeft: "2px solid #000000" }
      }),

      // Listen for changes
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          this._handleContentChange(update.state.doc.toString());
        }
      })
    ];
  }

  /**
   * Updates or creates the editor view without unnecessary destruction
   */
  private _updateEditor = (): void => {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab || !this.editorContainer) return;

    const language = this.getLanguageExtension(activeTab.path);
    const state = EditorState.create({
      doc: activeTab.content,
      extensions: [...this.getCommonExtensions(), language]
    });

    if (!this.editorView) {
      this.editorView = new EditorView({
        state,
        parent: this.editorContainer
      });
    } else {
      // Reusing the view is significantly faster for OpenStorm
      this.editorView.setState(state);
    }
  }

  private _handleContentChange(content: string) {
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
    }
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