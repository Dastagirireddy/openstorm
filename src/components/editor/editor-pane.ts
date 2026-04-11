import { html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
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

  private editorView: EditorView | null = null;

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
      case 'kt': case 'kts': case 'scala': case 'swift': case 'rb': case 'php': case 'sql': case 'sh': case 'bash': case 'zsh': return java();
      default: return javascript();
    }
  }

  private createEditorView(content: string): EditorView {
    const language = this.activeTab ? this.getLanguageExtension(this.activeTab.path) : undefined;

    return new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          language,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          history(),
          EditorView.theme({
            '&': {
              fontSize: '14px',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Monaco, monospace",
              lineHeight: '1.6',
              background: '#ffffff',
              color: '#1a1a1a',
              height: '100%',
            },
            '.cm-content': { padding: '4px 0', color: '#1a1a1a' },
            '.cm-line': { padding: '0 4px' },
            '.cm-scroller': { overflow: 'auto', height: '100%' },
            '.cm-gutters': {
              background: '#f7f7f7',
              borderRight: '1px solid #c7c7c7',
              color: '#5a5a5a',
              fontSize: '13px',
            },
            '.cm-activeLineGutter': { background: '#e8e8e8', color: '#1a1a1a' },
            '.cm-activeLine': { background: '#e8e8e880' },
            '.cm-selectionBackground': { background: '#b3d4ff' },
            '.cm-focused .cm-selectionBackground': { background: '#b3d4ff' },
            '.cm-cursor': { borderLeftColor: '#1a1a1a' },
            '.cm-matchingBracket': { background: '#e8e8e8', borderBottom: '1px solid #3592c4' },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && this.activeTab) {
              this.dispatchEvent(new CustomEvent('content-changed', {
                detail: { path: this.activeTab.path, content: update.state.doc.toString() },
                bubbles: true,
                composed: true,
              }));
            }
          }),
        ],
      }),
      parent: this.editorContainer,
    });
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
