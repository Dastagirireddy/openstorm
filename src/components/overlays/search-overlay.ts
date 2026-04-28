import { html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../../tailwind-element.js';

export interface SearchResult {
  path: string;
  name: string;
  score: number;
}

@customElement('search-overlay')
export class SearchOverlay extends TailwindElement() {
  @query('#search-input') private searchInput!: HTMLInputElement;
  @state() private isOpen: boolean = false;
  @state() private query: string = '';
  @state() private results: SearchResult[] = [];
  @state() private selectedIndex: number = 0;
  @state() private isLoading: boolean = false;
  @state() private projectPath: string = '';

  private searchTimeout: number | null = null;

  open(projectPath: string) {
    this.projectPath = projectPath;
    this.isOpen = true;
    this.results = [];
    this.selectedIndex = 0;
    this.updateComplete.then(() => {
      this.searchInput?.focus();
    });
  }

  close() {
    this.isOpen = false;
    this.query = '';
    this.results = [];
  }

  toggle(projectPath: string) {
    if (this.isOpen) {
      this.close();
    } else {
      this.open(projectPath);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._handleKeyDown as EventListener);
    document.addEventListener('quick-search', this._handleQuickSearch as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeyDown as EventListener);
    document.removeEventListener('quick-search', this._handleQuickSearch as EventListener);
  }

  private _handleKeyDown = (e: KeyboardEvent) => {
    if (!this.isOpen) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        break;
      case 'Enter':
        if (this.results.length > 0) {
          e.preventDefault();
          this.selectResult(this.results[this.selectedIndex]);
        }
        break;
    }
  };

  private _handleQuickSearch = () => {
    this.toggle(this.projectPath);
  };

  private _handleInput(e: InputEvent) {
    const target = e.target as HTMLInputElement;
    this.query = target.value;

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (this.query.length < 2) {
      this.results = [];
      return;
    }

    this.searchTimeout = window.setTimeout(() => {
      this.performSearch();
    }, 150);
  }

  private async performSearch() {
    if (!this.projectPath || !this.query) return;

    this.isLoading = true;
    try {
      const result = await invoke('search_files', {
        rootPath: this.projectPath,
        query: this.query,
      });
      this.results = result as SearchResult[];
      this.selectedIndex = 0;
    } catch (error) {
      console.error('Search failed:', error);
      this.results = [];
    } finally {
      this.isLoading = false;
    }
  }

  private selectResult(result: SearchResult) {
    this.dispatchEvent(new CustomEvent('search-result', {
      detail: result,
      bubbles: true,
      composed: true,
    }));
    this.dispatchEvent(new CustomEvent('file-selected', {
      detail: { path: result.path, name: result.name },
      bubbles: true,
      composed: true,
    }));
    this.close();
  }

  render() {
    if (!this.isOpen) return html``;

    return html`
      <div class="fixed top-20 left-1/2 -translate-x-1/2 w-[600px] max-w-[90vw] border rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.15)] z-[1000] overflow-hidden" style="background-color: var(--app-bg); border-color: var(--app-border);">
        <!-- Search Input -->
        <div class="flex items-center gap-3 p-3 border-b" style="border-color: var(--app-border);">
          <svg class="w-5 h-5 flex-shrink-0" style="color: var(--app-disabled-foreground);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            id="search-input"
            type="text"
            placeholder="Search files... (type to search)"
            class="flex-1 bg-transparent text-[14px] outline-none"
            style="color: var(--app-foreground);"
            .value=${this.query}
            @input=${this._handleInput}/>
          <div class="flex items-center gap-1 flex-shrink-0">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-medium" style="background-color: var(--app-toolbar-hover); color: var(--app-disabled-foreground);">⌘P</span>
          </div>
        </div>

        <!-- Results -->
        <div class="max-h-[300px] overflow-y-auto py-2">
          ${this.isLoading
            ? html`
                <div class="flex items-center justify-center gap-2 py-6">
                  <div class="w-4 h-4 border-2 rounded-full animate-spin" style="border-color: var(--app-border); border-top-color: var(--app-button-background);"></div>
                  <span class="text-[13px]" style="color: var(--app-disabled-foreground);">Searching...</span>
                </div>
              `
            : this.results.length === 0 && this.query.length >= 2
            ? html`
                <div class="flex items-center justify-center py-6">
                  <span class="text-[13px]" style="color: var(--app-disabled-foreground);">No files found</span>
                </div>
              `
            : this.results.map((result, index) => this.renderResult(result, index))}
        </div>
      </div>
    `;
  }

  private renderResult(result: SearchResult, index: number) {
    const isSelected = index === this.selectedIndex;

    return html`
      <div
        class="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
        style="background-color: ${isSelected ? 'var(--app-selection-background)' : 'transparent'};"
        @click=${() => this.selectResult(result)}
        @mouseenter=${() => this.selectedIndex = index}>
        <svg class="w-4 h-4 flex-shrink-0" style="color: var(--app-disabled-foreground);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] truncate" style="color: var(--app-foreground);">${result.name}</div>
          <div class="text-[11px] truncate" style="color: var(--app-disabled-foreground);">${result.path}</div>
        </div>
        ${result.score > 0.9
          ? html`<span class="text-[10px] text-[#3592c4] font-medium flex-shrink-0">Best match</span>`
          : ''}
      </div>
    `;
  }
}
