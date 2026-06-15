import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../../tailwind-element.js';
import { dispatch } from '../../lib/types/events.js';
import '../layout/icon.js';

interface SearchResult {
  path: string;
  name: string;
  score: number;
}

interface GroupedResults {
  [filePath: string]: SearchResult[];
}

@customElement('search-panel')
export class SearchPanel extends TailwindElement() {
  @property({ type: String }) projectPath = '';

  @state() private query = '';
  @state() private results: SearchResult[] = [];
  @state() private isLoading = false;
  @state() private caseSensitive = false;
  @state() private wholeWord = false;
  @state() private useRegex = false;
  @state() private selectedPath: string | null = null;

  private searchTimeout: number | null = null;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
  }

  private _handleInput(e: InputEvent): void {
    const target = e.target as HTMLInputElement;
    this.query = target.value;

    if (this.searchTimeout) clearTimeout(this.searchTimeout);

    if (this.query.length < 2) {
      this.results = [];
      return;
    }

    this.searchTimeout = window.setTimeout(() => {
      this.performSearch();
    }, 200);
  }

  private async performSearch(): Promise<void> {
    if (!this.projectPath || !this.query) return;

    this.isLoading = true;
    try {
      const result = await invoke('search_files', {
        rootPath: this.projectPath,
        query: this.query,
      });
      let searchResults = result as SearchResult[];

      if (this.wholeWord) {
        const pattern = new RegExp(`^${this.escapeRegex(this.query)}$`, this.caseSensitive ? '' : 'i');
        searchResults = searchResults.filter(r => pattern.test(r.name));
      } else if (!this.useRegex) {
        searchResults = searchResults.filter(r => {
          const name = this.caseSensitive ? r.name : r.name.toLowerCase();
          const q = this.caseSensitive ? this.query : this.query.toLowerCase();
          return name.includes(q);
        });
      }

      this.results = searchResults;
    } catch (error) {
      console.error('[SearchPanel] Search failed:', error);
      this.results = [];
    } finally {
      this.isLoading = false;
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private groupByFile(results: SearchResult[]): GroupedResults {
    const grouped: GroupedResults = {};
    for (const result of results) {
      if (!grouped[result.path]) {
        grouped[result.path] = [];
      }
      grouped[result.path].push(result);
    }
    return grouped;
  }

  private getRelativePath(fullPath: string): string {
    if (this.projectPath && fullPath.startsWith(this.projectPath)) {
      return fullPath.slice(this.projectPath.length + 1);
    }
    return fullPath;
  }

  private selectResult(result: SearchResult): void {
    this.selectedPath = result.path;
    dispatch('file-selected', { path: result.path });
  }

  private toggleCaseSensitive(): void {
    this.caseSensitive = !this.caseSensitive;
    if (this.query.length >= 2) this.performSearch();
  }

  private toggleWholeWord(): void {
    this.wholeWord = !this.wholeWord;
    if (this.query.length >= 2) this.performSearch();
  }

  private toggleRegex(): void {
    this.useRegex = !this.useRegex;
    if (this.query.length >= 2) this.performSearch();
  }

  render() {
    const grouped = this.groupByFile(this.results);
    const fileCount = Object.keys(grouped).length;

    return html`
      <div class="flex flex-col h-full overflow-hidden" style="background-color: var(--sidebar-bg, var(--activitybar-background));">
        <!-- Header -->
        <div class="px-3 py-2 border-b shrink-0" style="border-color: var(--activitybar-border);">
          <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style="color: var(--app-disabled-foreground);">
            <os-icon name="search" size="12"></os-icon>
            Search
          </div>
        </div>

        <!-- Search Input -->
        <div class="px-3 py-2 shrink-0">
          <div class="flex items-center gap-1 border rounded px-2 py-1" style="border-color: var(--app-border); background-color: var(--app-input-background, var(--app-bg));">
            <os-icon name="search" size="14" class="flex-shrink-0" style="color: var(--app-disabled-foreground);"></os-icon>
            <input
              type="text"
              placeholder="Search files..."
              class="flex-1 bg-transparent text-[12px] outline-none min-w-0"
              style="color: var(--app-foreground);"
              .value=${this.query}
              @input=${this._handleInput}
            />
            ${this.query ? html`
              <button
                class="flex-shrink-0 p-0.5 rounded hover:opacity-80"
                style="color: var(--app-disabled-foreground);"
                @click=${() => { this.query = ''; this.results = []; }}
                title="Clear">
                <os-icon name="x" size="12"></os-icon>
              </button>
            ` : ''}
          </div>

          <!-- Options -->
          <div class="flex items-center gap-1 mt-1.5">
            <button
              class="px-1.5 py-0.5 rounded text-[10px] border transition-colors"
              style="border-color: ${this.caseSensitive ? 'var(--brand-primary)' : 'var(--app-border)'}; background-color: ${this.caseSensitive ? 'var(--brand-primary)' : 'transparent'}; color: ${this.caseSensitive ? '#fff' : 'var(--app-disabled-foreground)'};"
              @click=${this.toggleCaseSensitive}
              title="Match Case">
              Aa
            </button>
            <button
              class="px-1.5 py-0.5 rounded text-[10px] border transition-colors"
              style="border-color: ${this.wholeWord ? 'var(--brand-primary)' : 'var(--app-border)'}; background-color: ${this.wholeWord ? 'var(--brand-primary)' : 'transparent'}; color: ${this.wholeWord ? '#fff' : 'var(--app-disabled-foreground)'};"
              @click=${this.toggleWholeWord}
              title="Match Whole Word">
              Ab
            </button>
            <button
              class="px-1.5 py-0.5 rounded text-[10px] border transition-colors"
              style="border-color: ${this.useRegex ? 'var(--brand-primary)' : 'var(--app-border)'}; background-color: ${this.useRegex ? 'var(--brand-primary)' : 'transparent'}; color: ${this.useRegex ? '#fff' : 'var(--app-disabled-foreground)'};"
              @click=${this.toggleRegex}
              title="Use Regular Expression">
              .*
            </button>
          </div>
        </div>

        <!-- Results -->
        <div class="flex-1 overflow-y-auto min-h-0">
          ${this.isLoading
            ? html`
                <div class="flex items-center justify-center gap-2 py-8">
                  <div class="w-3 h-3 border-2 rounded-full animate-spin" style="border-color: var(--app-border); border-top-color: var(--brand-primary);"></div>
                  <span class="text-[11px]" style="color: var(--app-disabled-foreground);">Searching...</span>
                </div>
              `
            : this.query.length < 2
            ? html`
                <div class="flex flex-col items-center justify-center py-8 px-4 gap-2">
                  <os-icon name="search" size="24" style="color: var(--app-disabled-foreground); opacity: 0.4;"></os-icon>
                  <span class="text-[11px] text-center" style="color: var(--app-disabled-foreground);">Type at least 2 characters to search</span>
                </div>
              `
            : this.results.length === 0
            ? html`
                <div class="flex flex-col items-center justify-center py-8 px-4 gap-2">
                  <os-icon name="search-off" size="24" style="color: var(--app-disabled-foreground); opacity: 0.4;"></os-icon>
                  <span class="text-[11px] text-center" style="color: var(--app-disabled-foreground);">No results found</span>
                </div>
              `
            : html`
                <div class="py-1">
                  <div class="px-3 py-1 text-[10px]" style="color: var(--app-disabled-foreground);">
                    ${this.results.length} result${this.results.length !== 1 ? 's' : ''} in ${fileCount} file${fileCount !== 1 ? 's' : ''}
                  </div>
                  ${Object.entries(grouped).map(([filePath, fileResults]) => this.renderFileGroup(filePath, fileResults))}
                </div>
              `}
        </div>
      </div>
    `;
  }

  private renderFileGroup(filePath: string, results: SearchResult[]) {
    const relativePath = this.getRelativePath(filePath);
    const dir = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : '';
    const fileName = relativePath.split('/').pop() || relativePath;

    return html`
      <div class="border-b" style="border-color: var(--activitybar-border);">
        <!-- File header -->
        <div class="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:opacity-80" style="background-color: var(--activitybar-active-background);">
          <os-icon name="file" size="12" style="color: var(--app-disabled-foreground);"></os-icon>
          <span class="text-[11px] font-medium truncate" style="color: var(--app-foreground);">${fileName}</span>
          ${dir ? html`<span class="text-[10px] truncate ml-auto" style="color: var(--app-disabled-foreground);">${dir}</span>` : ''}
        </div>
        <!-- Results in file -->
        ${results.map(result => this.renderResult(result))}
      </div>
    `;
  }

  private renderResult(result: SearchResult) {
    const relativePath = this.getRelativePath(result.path);
    const isSelected = this.selectedPath === result.path;

    return html`
      <div
        class="flex items-center gap-2 px-3 pl-6 py-1 cursor-pointer transition-colors"
        style="background-color: ${isSelected ? 'var(--app-selection-background)' : 'transparent'};"
        @click=${() => this.selectResult(result)}
        @mouseenter=${() => this.selectedPath = result.path}>
        <div class="flex-1 min-w-0">
          <div class="text-[11px] truncate" style="color: var(--app-foreground);">${result.name}</div>
          <div class="text-[10px] truncate" style="color: var(--app-disabled-foreground);">${relativePath}</div>
        </div>
      </div>
    `;
  }
}
