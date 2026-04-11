import { html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
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
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { highlightActiveLineGutter, drawSelection, dropCursor, highlightActiveLine } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { TailwindElement } from '../../tailwind-element.js';
import type { EditorTab } from '../../lib/file-types.js';
import { getFileExtension } from '../../lib/file-icons.js';
import '../icon.js';

@customElement('editor-pane')
export class EditorPane extends TailwindElement() {
  @query('#editor-container') private editorContainer!: HTMLElement;

  @state() tabs: EditorTab[] = [];
  @state() activeTabId: string = '';
  @state() tabLimit = 10;
  @state() autoSaveEnabled: boolean = true;
  @state() autoSaveDelay: number = 1000; // 1 second

  private editorView: EditorView | null = null;
  private autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  private get activeTab(): EditorTab | undefined {
    return this.tabs.find(t => t.id === this.activeTabId);
  }

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('open-file', this._handleOpenFile as EventListener);
    document.addEventListener('clear-editor', this._handleClearEditor as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('open-file', this._handleOpenFile as EventListener);
    document.removeEventListener('clear-editor', this._handleClearEditor as EventListener);
    this.editorView?.destroy();
  }

  private getLanguageExtension(path: string) {
    const ext = getFileExtension(path);
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
      case 'sh': case 'bash': case 'zsh': case 'rb': return javascript();
      default: return javascript();
    }
  }

  // Custom light theme syntax highlighting
  private static lightTheme = HighlightStyle.define([
    { tag: t.keyword, color: '#0000ff', fontWeight: 'bold' },
    { tag: t.atom, color: '#0000ff' },
    { tag: t.number, color: '#098658' },
    { tag: t.comment, color: '#808080', fontStyle: 'italic' },
    { tag: t.string, color: '#a31515' },
    { tag: t.variableName, color: '#001080' },
    { tag: t.propertyName, color: '#001080' },
    { tag: t.typeName, color: '#267f99' },
    { tag: t.function(t.variableName), color: '#795e26' },
    { tag: t.macroName, color: '#795e26' },
    { tag: t.operator, color: '#000000' },
    { tag: t.className, color: '#267f99' },
    { tag: t.definition(t.typeName), color: '#267f99' },
    { tag: t.angleBracket, color: '#808080' },
    { tag: t.bracket, color: '#000000' },
    { tag: t.paren, color: '#000000' },
    { tag: t.squareBracket, color: '#000000' },
    { tag: t.tagName, color: '#800000' },
    { tag: t.attributeName, color: '#ff0000' },
    { tag: t.content, color: '#000000' },
    { tag: t.null, color: '#0000ff' },
    { tag: t.bool, color: '#0000ff' },
  ]);

  private createEditorView(content: string): EditorView {
    const language = this.activeTab ? this.getLanguageExtension(this.activeTab.path) : undefined;

    return new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          // Core extensions
          EditorState.tabSize.of(4),
          EditorState.allowMultipleSelections.of(true),

          // Language support
          language,
          bracketMatching(),
          indentOnInput(),

          // Folding
          foldGutter({
            openText: '▼',
            closedText: '▶',
          }),

          // Selection & cursor
          drawSelection(),
          dropCursor(),
          highlightActiveLineGutter(),
          highlightActiveLine(),

          // History
          history(),

          // Keymaps
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
          ]),

          // Custom theme
          syntaxHighlighting(this.lightTheme),
          EditorView.theme({
            '&': {
              fontSize: '14px',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Monaco, monospace",
              lineHeight: '1.6',
              background: '#ffffff',
              color: '#1a1a1a',
              height: '100%',
            },
            '.cm-content': {
              padding: '4px 0',
              color: '#1a1a1a',
              '&:empty': { height: '1em' },
            },
            '.cm-line': { padding: '0 4px' },
            '.cm-scroller': {
              overflow: 'auto',
              height: '100%',
              outline: 'none !important',
            },
            '.cm-gutters': {
              background: '#f7f7f7',
              borderRight: '1px solid #c7c7c7',
              color: '#5a5a5a',
              fontSize: '13px',
              border: 'none',
              paddingRight: '2px',
            },
            '.cm-gutter': {
              '& .foldGutter': { color: '#5a5a5a' },
              '& .foldGutter:hover': { color: '#1a1a1a', cursor: 'pointer' },
            },
            '.cm-foldGutter': { width: '15px' },
            '.cm-lineNumbers': {
              minWidth: '50px',
              '& .activeLine': { color: '#1a1a1a' },
            },
            '.cm-activeLineGutter': {
              background: '#e8e8e8',
              color: '#1a1a1a',
              fontWeight: '600',
            },
            '.cm-activeLine': { background: '#e8e8e880' },
            '.cm-selectionBackground': { background: '#b3d4ff' },
            '.cm-focused .cm-selectionBackground': { background: '#b3d4ff' },
            '.cm-cursor': { borderLeftColor: '#1a1a1a' },
            '.cm-matchingBracket': {
              background: '#e8e8e8',
              borderBottom: '1px solid #3592c4',
              fontWeight: '600',
            },
            // Syntax colors
            '.cm-keyword': { color: '#0000ff', fontWeight: 'bold' },
            '.cm-atom': { color: '#0000ff' },
            '.cm-number': { color: '#098658' },
            '.cm-comment': { color: '#808080', fontStyle: 'italic' },
            '.cm-string': { color: '#a31515' },
            '.cm-variable': { color: '#001080' },
            '.cm-variableName': { color: '#001080' },
            '.cm-property': { color: '#001080' },
            '.cm-propertyName': { color: '#001080' },
            '.cm-typeName': { color: '#267f99' },
            '.cm-function': { color: '#795e26' },
            '.cm-operator': { color: '#000000' },
            '.cm-class': { color: '#267f99' },
            '.cm-tag': { color: '#800000' },
            '.cm-attribute': { color: '#ff0000' },
            '.cm-bool': { color: '#0000ff' },
            '.cm-null': { color: '#0000ff' },
          }),

          // Update listener for content changes + auto-save
          EditorView.updateListener.of((update) => {
            if (update.docChanged && this.activeTab) {
              // Dispatch content changed event
              this.dispatchEvent(new CustomEvent('content-changed', {
                detail: { path: this.activeTab.path, content: update.state.doc.toString() },
                bubbles: true,
                composed: true,
              }));

              // Trigger auto-save if enabled
              if (this.autoSaveEnabled) {
                this.triggerAutoSave();
              }
            }
          }),
        ],
      }),
      parent: this.editorContainer,
    });
  }

  private triggerAutoSave(): void {
    // Clear existing timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    // Set new timeout
    this.autoSaveTimeout = setTimeout(() => {
      if (this.activeTab) {
        this.saveActiveFile();
      }
    }, this.autoSaveDelay);
  }

  private async saveActiveFile(): Promise<void> {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab || !activeTab.modified) return;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_file', {
        path: activeTab.path,
        content: activeTab.content,
      });

      this.tabs = this.tabs.map(t =>
        t.id === activeTab.id ? { ...t, modified: false } : t
      );

      this.dispatchEvent(new CustomEvent('auto-saved', {
        detail: { path: activeTab.path },
        bubbles: true,
        composed: true,
      }));
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  private renderWelcome(): ReturnType<typeof html> {
    return html`
      <div class="flex flex-col items-center justify-center h-full bg-white px-8">
        <div class="flex flex-col items-center mb-4">
          <os-brand-logo size="64"></os-brand-logo>
        </div>
        <div class="flex flex-col items-center mb-8">
          <h1 class="text-[28px] font-bold text-[#1a1a1a]">OpenStorm</h1>
          <p class="text-[12px] text-[#5a5a5a]">Enterprise-grade IDE</p>
        </div>

        <p class="text-[13px] text-[#5a5a5a] mb-8 max-w-[400px] text-center">
          Start coding by opening a file or folder. Use keyboard shortcuts for quick access.
        </p>

        <div class="flex flex-col gap-2 w-full max-w-[420px]">
          <div class="flex items-center gap-2 mb-1">
            <svg class="w-4 h-4 text-[#3592c4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="text-[11px] font-semibold text-[#5a5a5a] uppercase tracking-wide">Start</span>
          </div>

          <div
            class="flex items-center gap-3 px-4 py-3 bg-[#f7f7f7] rounded-lg cursor-pointer transition-colors hover:bg-[#e8e8e8] hover:shadow-sm group border border-transparent hover:border-[#c7c7c7]"
            @click=${() => this.dispatchEvent(new CustomEvent('open-folder'))}>
            <div class="w-9 h-9 rounded-lg bg-[#e8e8e8] flex items-center justify-center flex-shrink-0 group-hover:bg-white transition-colors">
              <svg class="w-5 h-5 text-[#5a5a5a] group-hover:text-[#3592c4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-medium text-[#1a1a1a]">Open Folder</div>
              <div class="text-[11px] text-[#8a8a8a]">Open an entire project folder</div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span class="px-1.5 py-0.5 bg-white rounded text-[10px] font-medium text-[#5a5a5a] border border-[#e0e0e0]">⌘</span>
              <span class="px-1.5 py-0.5 bg-white rounded text-[10px] font-medium text-[#5a5a5a] border border-[#e0e0e0]">K</span>
              <span class="px-1.5 py-0.5 bg-white rounded text-[10px] font-medium text-[#5a5a5a] border border-[#e0e0e0]">O</span>
            </div>
          </div>

          <div
            class="flex items-center gap-3 px-4 py-3 bg-[#f7f7f7] rounded-lg cursor-pointer transition-colors hover:bg-[#e8e8e8] hover:shadow-sm group border border-transparent hover:border-[#c7c7c7]"
            @click=${() => this.dispatchEvent(new CustomEvent('quick-search'))}>
            <div class="w-9 h-9 rounded-lg bg-[#e8e8e8] flex items-center justify-center flex-shrink-0 group-hover:bg-white transition-colors">
              <svg class="w-5 h-5 text-[#5a5a5a] group-hover:text-[#3592c4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-medium text-[#1a1a1a]">Quick Open</div>
              <div class="text-[11px] text-[#8a8a8a]">Search and open files quickly</div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span class="px-1.5 py-0.5 bg-white rounded text-[10px] font-medium text-[#5a5a5a] border border-[#e0e0e0]">⌘</span>
              <span class="px-1.5 py-0.5 bg-white rounded text-[10px] font-medium text-[#5a5a5a] border border-[#e0e0e0]">P</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const hasContent = this.tabs.length > 0 || this.activeTab;

    // Don't show welcome screen - parent (main.ts) handles it when no project is open
    if (!hasContent) {
      return html`<div class="flex items-center justify-center h-full bg-white"></div>`;
    }

    return html`
      <div class="flex flex-col h-full overflow-hidden bg-white">
        <!-- Tab bar slot - parent renders tabs -->
        <slot name="tab-bar"></slot>

        <!-- Editor container -->
        <div id="editor-container" class="flex-1 overflow-hidden"></div>
      </div>
    `;
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    if (changedProperties.has('tabs') || changedProperties.has('activeTabId')) {
      this._updateEditor();
    }
  }

  private _updateEditor(): void {
    if (!this.activeTab) return;

    this.editorView?.destroy();
    this.editorView = this.createEditorView(this.activeTab.content);
  }

  private _handleOpenFile = (e: CustomEvent): void => {
    const { path, content } = e.detail;
    const name = path.split('/').pop() || '';

    const existingTab = this.tabs.find(t => t.path === path);
    if (existingTab) {
      this.activeTabId = existingTab.id;
      this.tabs = this.tabs.map(t =>
        t.id === existingTab.id ? { ...t, content, lastUsed: Date.now() } : t
      );
    } else {
      const newTab: EditorTab = {
        id: path,
        name,
        path,
        modified: false,
        content,
        lastUsed: Date.now(),
      };
      this.tabs = [...this.tabs, newTab];
      this.activeTabId = path;
    }
  };

  private _handleClearEditor = (): void => {
    this.tabs = [];
    this.activeTabId = '';
    this.editorView?.destroy();
    this.editorView = null;
  };

  // Public API for tab management
  selectTab(tabId: string): void {
    this.activeTabId = tabId;
    this.dispatchEvent(new CustomEvent('tab-select', {
      detail: { tabId, timestamp: Date.now() },
      bubbles: true,
      composed: true,
    }));
  }

  closeTab(tabId: string): void {
    this.dispatchEvent(new CustomEvent('tab-close', {
      detail: { tabId },
      bubbles: true,
      composed: true,
    }));
  }

  togglePin(tabId: string): void {
    this.dispatchEvent(new CustomEvent('tab-pin-toggle', {
      detail: { tabId },
      bubbles: true,
      composed: true,
    }));
  }
}
