/**
 * Database Query Editor - Modern 2-Column Layout
 *
 * Opens as a tab in the main editor area.
 * - Left column: SQL editor with integrated toolbar
 * - Right column: Action buttons (Run, Cancel, etc.)
 * - Results: Modern card design with header, sidebar, and main content area
 * - High-fidelity data table with pagination using TailwindCSS
 */

import { html, nothing, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import { eventLog } from '../../../../services/event-log.js';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { sql, PostgreSQL, MySQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated?: boolean;
  hasMore?: boolean;
  limitApplied?: number;
}

export interface ColumnInfo {
  name: string;
  typeName: string | null;
  nullable: boolean | null;
}

export interface QueryFrame {
  id: string;
  sql: string;
  results: QueryResult | null;
  error: string | null;
  viewMode: 'table' | 'json' | 'explain';
  timestamp: number;
}

@customElement('database-query-editor')
export class DatabaseQueryEditor extends TailwindElement(css`
  :host {
    display: flex !important;
    flex-direction: column !important;
    height: 100% !important;
    width: 100% !important;
    position: relative;
    overflow: hidden;
  }
`) {

  @property({ type: String }) projectPath: string | null = null;
  @property({ type: String }) connectionId: string | null = null;
  @property({ type: String }) connectionName: string = '';
  @property({ type: String }) dialect: 'postgresql' | 'mysql' = 'postgresql';
  @property({ type: String }) tableName: string = '';
  @property({ type: String }) initialSql: string = '';

  @state() private sql: string = '';
  @state() private frames: QueryFrame[] = [];
  @state() private isRunning: boolean = false;
  @state() private activeFrameId: string | null = null;
  @state() private tablePage: number = 1;
  @state() private tablePageSize: number = 50;
  @state() private sortColumn: string | null = null;
  @state() private sortDirection: 'asc' | 'desc' = 'asc';
  @state() private selectedRows: Set<number> = new Set();
  @state() private columnWidths: Map<string, number> = new Map();
  @state() private queryHistory: string[] = [];
  @state() private showHistoryPanel = false;
  @state() private tableFilter: string = '';
  @state() private savedQueries: { name: string; sql: string; createdAt: number }[] = [];
  @state() private showSaveQueryDialog = false;
  @state() private showSavedQueriesPanel = false;
  @state() private expandedFrameIds: Set<string> = new Set();
  @state() private focusMode: boolean = false;
  @state() private showDownloadMenu: boolean = false;
  @state() private downloadFrameId: string | null = null;

  private editorView: EditorView | null = null;
  private editorInitialized = false;

  // Bound handlers for proper event handling
  private _boundHandleRun!: () => void;
  private _boundHandleCancel!: () => void;
  private _boundHandleFormatSql!: () => void;
  private _boundHandleClear!: () => void;
  private _boundHandleClickOutside!: (e: MouseEvent) => void;

  override connectedCallback(): void {
    super.connectedCallback();
    this.sql = this.initialSql || this.getDefaultQuery();
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    // Bind handlers
    this._boundHandleRun = this.handleRun.bind(this);
    this._boundHandleCancel = this.handleCancel.bind(this);
    this._boundHandleFormatSql = this.handleFormatSql.bind(this);
    this._boundHandleClear = this.handleClear.bind(this);
    this._boundHandleClickOutside = this.handleClickOutside.bind(this);
    document.addEventListener('click', this._boundHandleClickOutside);
  }

  override disconnectedCallback(): void {
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
    document.removeEventListener('click', this._boundHandleClickOutside);
    super.disconnectedCallback();
  }

  private handleClickOutside(e: MouseEvent): void {
    // Close download menu when clicking outside
    if (this.showDownloadMenu) {
      this.showDownloadMenu = false;
      this.downloadFrameId = null;
      this.requestUpdate();
    }
  }

  override firstUpdated(): void {
    requestAnimationFrame(() => {
      this.initEditor();
    });
  }

  override updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    console.log('[QueryEditor] updated()', {
      connectionId: this.connectionId,
      projectPath: this.projectPath,
      connectionName: this.connectionName,
      hasChanges: changedProperties.size
    });
    // Initialize editor when component is ready and we have required props
    if (!this.editorInitialized && this.connectionId) {
      requestAnimationFrame(() => {
        this.initEditor();
      });
    }
  }

  private getDefaultQuery(): string {
    if (!this.tableName) {
      return `SELECT * FROM your_table LIMIT 100;`;
    }
    return `SELECT * FROM ${this.tableName} LIMIT 100;`;
  }

  private async initEditor() {
    await this.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 50));

    const container = this.renderRoot.querySelector('#editor-container') as HTMLElement;
    console.log('[QueryEditor] initEditor - container found:', !!container, 'editorView exists:', !!this.editorView);
    if (!container || this.editorView) {
      if (!container) {
        console.error('[QueryEditor] Editor container not found!');
      }
      return;
    }

    this.editorInitialized = true;

    const sqlDialect = this.dialect === 'postgresql'
      ? sql({ dialect: PostgreSQL })
      : sql({ dialect: MySQL });

    // Light theme that matches the app's theme
    const lightTheme = EditorView.theme({
      '&': {
        backgroundColor: 'var(--app-bg)',
        color: 'var(--app-foreground)',
        outline: 'none !important',
      },
      '&.cm-focused': {
        outline: 'none !important',
        boxShadow: 'none !important',
      },
      '.cm-content': {
        padding: '8px 12px',
        outline: 'none !important',
      },
      '.cm-scroller': {
        fontFamily: 'monospace',
        fontSize: '13px',
        outline: 'none !important',
      },
      '.cm-cursor': {
        borderLeft: '2px solid var(--app-foreground) !important',
        caretColor: 'var(--app-foreground) !important',
      },
      '.cm-cursorLayer': {
        opacity: '1 !important',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--app-selection)',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'var(--app-selection-background) !important',
      },
    });

    // Syntax highlighting for light theme
    const lightHighlightStyle = HighlightStyle.define([
      { tag: tags.keyword, color: 'var(--app-keyword)' },
      { tag: tags.typeName, color: 'var(--app-type)' },
      { tag: tags.string, color: 'var(--app-string)' },
      { tag: tags.number, color: 'var(--app-number)' },
      { tag: tags.bool, color: 'var(--app-boolean)' },
      { tag: tags.null, color: 'var(--app-null)' },
      { tag: tags.comment, color: 'var(--app-disabled-foreground)', fontStyle: 'italic' },
      { tag: tags.function(tags.variableName), color: 'var(--app-keyword)' },
    ]);

    this.editorView = new EditorView({
      doc: this.sql,
      extensions: [
        EditorState.tabSize.of(4),
        history(),
        keymap.of([...historyKeymap, ...defaultKeymap]),
        sqlDialect,
        lightTheme,
        syntaxHighlighting(lightHighlightStyle),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.sql = update.state.doc.toString();
          }
        }),
        EditorView.domEventHandlers({
          keydown: (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              this.handleRun();
              return true;
            }
            return false;
          },
        }),
      ],
      parent: container,
    });
    console.log('[QueryEditor] Editor initialized successfully');
  }

  private async handleRun() {
    console.log('[QueryEditor] Run button clicked');
    const debugInfo = {
      hasSql: !!this.sql?.trim(),
      sql: this.sql?.substring(0, 100),
      connectionId: this.connectionId,
      projectPath: this.projectPath,
      isRunning: this.isRunning
    };
    console.log('[QueryEditor] State:', debugInfo);

    // Show alert for debugging
    if (!this.connectionId) {
      alert('Missing connectionId: ' + this.connectionId);
      return;
    }
    if (!this.projectPath) {
      alert('Missing projectPath: ' + this.projectPath);
      return;
    }
    if (!this.sql.trim()) {
      alert('Empty SQL query');
      return;
    }

    // Add to history if not duplicate
    const trimmedSql = this.sql.trim();
    if (!this.queryHistory.includes(trimmedSql)) {
      this.queryHistory = [trimmedSql, ...this.queryHistory].slice(0, 50);
    }

    this.isRunning = true;
    this.requestUpdate();
    console.log('[QueryEditor] Calling db_execute_query...');

    try {
      const results = await invoke('db_execute_query', {
        connectionId: this.connectionId,
        query: this.sql,
        projectPath: this.projectPath,
      });
      console.log('[QueryEditor] Query succeeded:', results);

      const frame: QueryFrame = {
        id: `frame-${Date.now()}`,
        sql: this.sql,
        results: results as QueryResult,
        error: null,
        viewMode: 'table',
        timestamp: Date.now(),
      };
      this.frames = [frame, ...this.frames];
      this.activeFrameId = frame.id;
      this.expandedFrameIds.add(frame.id);
      this.tablePage = 1;
      console.log('[QueryEditor] Frames updated, count:', this.frames.length);
    } catch (err) {
      console.error('[QueryEditor] Query failed:', err);
      const errorMessage = typeof err === 'string' ? err : (err as Error)?.message || 'Query execution failed';
      this.addEventLog('Query failed', 'error', errorMessage);
    } finally {
      this.isRunning = false;
      this.requestUpdate();
      console.log('[QueryEditor] Run completed');
    }
  }

  private handleCancel() {
    this.isRunning = false;
    this.requestUpdate();
  }

  private handleClear() {
    this.sql = '';
    if (this.editorView) {
      this.editorView.dispatch({ changes: { from: 0, to: this.editorView.state.doc.length, insert: '' } });
    }
  }

  private addEventLog(text: string, type: 'success' | 'error' | 'info', details?: string) {
    eventLog.log(text, type, details, 'Database');
  }

  private handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      const activeFrame = this.frames.find(f => f.id === this.activeFrameId);
      if (activeFrame?.results) {
        e.preventDefault();
        this.copyToClipboard(JSON.stringify(activeFrame.results.rows));
      }
    }
    if (e.key === 'Escape') {
      this.selectedRows.clear();
      this.requestUpdate();
    }
  }

  private handleSort(columnName: string) {
    if (this.sortColumn === columnName) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = columnName;
      this.sortDirection = 'asc';
    }
    this.requestUpdate();
  }

  private toggleFrameExpand(frameId: string) {
    if (this.expandedFrameIds.has(frameId)) {
      this.expandedFrameIds.delete(frameId);
    } else {
      this.expandedFrameIds.add(frameId);
    }
    this.requestUpdate();
  }

  private getSortedRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    if (!this.sortColumn) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[this.sortColumn!];
      const bVal = b[this.sortColumn!];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return this.sortDirection === 'asc' ? cmp : -cmp;
    });
  }

  private getFilteredRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    if (!this.tableFilter) return rows;
    const filterLower = this.tableFilter.toLowerCase();
    return rows.filter(row => {
      return Object.values(row).some(val => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(filterLower);
      });
    });
  }

  private getTruncatedStyle(truncated: boolean): { bg: string; color: string } {
    if (truncated) {
      return { bg: 'var(--warning)/10', color: 'var(--warning)' };
    }
    return { bg: 'var(--app-tab-inactive)', color: 'var(--app-foreground)' };
  }

  private updateFrameViewMode(frameId: string, viewMode: 'table' | 'json' | 'explain') {
    this.frames = this.frames.map(f =>
      f.id === frameId ? { ...f, viewMode } : f
    );
    this.requestUpdate();
  }

  private deleteFrame(frameId: string) {
    this.frames = this.frames.filter(f => f.id !== frameId);
    if (this.activeFrameId === frameId) {
      this.activeFrameId = this.frames.length > 0 ? this.frames[0].id : null;
    }
    this.requestUpdate();
  }

  private async reRunFrame(frame: QueryFrame) {
    this.sql = frame.sql;
    this.isRunning = true;
    this.requestUpdate();

    try {
      const results = await invoke('db_execute_query', {
        connectionId: this.connectionId,
        query: frame.sql,
        projectPath: this.projectPath,
      });

      // Update the existing frame with new results
      this.frames = this.frames.map(f =>
        f.id === frame.id
          ? { ...f, results: results as QueryResult, error: null, timestamp: Date.now() }
          : f
      );
      this.expandedFrameIds.add(frame.id);
      this.tablePage = 1;
    } catch (err) {
      // Update the existing frame with error
      this.frames = this.frames.map(f =>
        f.id === frame.id
          ? { ...f, results: null, error: err instanceof Error ? err.message : 'Query execution failed', timestamp: Date.now() }
          : f
      );
    } finally {
      this.isRunning = false;
      this.requestUpdate();
    }
  }

  private editFrame(frame: QueryFrame) {
    this.sql = frame.sql;
    if (this.editorView) {
      this.editorView.dispatch({ changes: { from: 0, to: this.editorView.state.doc.length, insert: frame.sql } });
    }
    this.expandedFrameIds.add(frame.id);
  }

  private async exportToJSON(frame: QueryFrame) {
    await this.exportFromBackend('json', frame);
    this.showDownloadMenu = false;
  }

  private async exportToCSV(frame: QueryFrame) {
    await this.exportFromBackend('csv', frame);
    this.showDownloadMenu = false;
  }

  private async exportToXLSX(frame: QueryFrame) {
    await this.exportFromBackend('xlsx', frame);
    this.showDownloadMenu = false;
  }

  private async exportFromBackend(format: 'csv' | 'json' | 'xlsx', frame: QueryFrame) {
    if (!frame.results || !this.connectionId || !this.projectPath) return;

    try {
      const timestamp = Date.now();
      const filename = `query-results-${timestamp}.${format === 'xlsx' ? 'xls' : format}`;

      // Use Tauri dialog to get save location
      const { save } = await import('@tauri-apps/plugin-dialog');
      const filePath = await save({
        defaultPath: filename,
        filters: [{
          name: format.toUpperCase(),
          extensions: [format === 'xlsx' ? 'xls' : format],
        }],
      });

      if (!filePath) return; // User cancelled

      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('db_export_query', {
        connectionId: this.connectionId,
        query: frame.sql,
        projectPath: this.projectPath,
        format,
        destinationPath: filePath,
        maxRows: 100_000,
      });

      const exportResult = result as { success: boolean; filePath: string; rowsExported: number; error?: string };

      if (exportResult.success) {
        // Show success notification
        this.copyToClipboard(`Exported ${exportResult.rowsExported} rows to ${exportResult.filePath}`);
      } else {
        console.error('Export failed:', exportResult.error);
      }
    } catch (err) {
      console.error('Export error:', err);
    }
  }

  private downloadBlob(blob: Blob, filename: string) {
    // Fallback for small exports - prefer backend export
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private toggleDownloadMenu(frameId: string) {
    if (this.downloadFrameId === frameId && this.showDownloadMenu) {
      this.showDownloadMenu = false;
      this.downloadFrameId = null;
    } else {
      this.showDownloadMenu = true;
      this.downloadFrameId = frameId;
    }
  }

  private setActiveFrame(frameId: string) {
    this.activeFrameId = frameId;
    this.tablePage = 1;
    this.requestUpdate();
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private formatValueForDisplay(value: unknown): { content: string; isNull: boolean; type: 'null' | 'boolean' | 'number' | 'string' | 'object' } {
    if (value === null || value === undefined) {
      return { content: 'null', isNull: true, type: 'null' };
    }
    if (typeof value === 'boolean') {
      return { content: value ? 'true' : 'false', isNull: false, type: 'boolean' };
    }
    if (typeof value === 'number') {
      return { content: String(value), isNull: false, type: 'number' };
    }
    if (typeof value === 'object') {
      return { content: JSON.stringify(value), isNull: false, type: 'object' };
    }
    return { content: String(value), isNull: false, type: 'string' };
  }

  private copyCellValue(value: string) {
    this.copyToClipboard(value);
  }

  private handleSaveQuery() {
    if (!this.sql.trim()) return;
    this.showSaveQueryDialog = true;
  }

  private confirmSaveQuery(name: string) {
    if (!name.trim()) return;
    this.savedQueries = [{ name, sql: this.sql.trim(), createdAt: Date.now() }, ...this.savedQueries];
    this.showSaveQueryDialog = false;
  }

  private loadSavedQuery(sql: string) {
    this.sql = sql;
    this.editorView?.dispatch({ changes: { from: 0, to: this.editorView.state.doc.length, insert: sql } });
  }

  private async handleFormatSql() {
    // Basic SQL formatting - in production, use a proper SQL formatter library
    let formatted = this.sql.trim();
    formatted = formatted.replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|ORDER BY|GROUP BY|HAVING|LIMIT|INSERT INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP)\b/gi, '\n$1');
    formatted = formatted.replace(/\b(AS|DISTINCT|BETWEEN|IN|LIKE|IS NULL|IS NOT NULL)\b/gi, '\n  $1');
    this.editorView?.dispatch({ changes: { from: 0, to: this.editorView.state.doc.length, insert: formatted } });
  }

  private renderStatusBar() {
    const activeFrame = this.frames.find(f => f.id === this.activeFrameId);
    return html`
      <div
        class="flex items-center justify-between px-4 py-1.5 border-t text-[10px]"
        style="background: var(--app-statusbar-background, var(--app-toolbar-background)); border-color: var(--app-border); color: var(--app-disabled-foreground);"
      >
        <div class="flex items-center gap-4">
          <span class="flex items-center gap-1.5 font-medium" style="color: var(--app-foreground);">
            <iconify-icon icon="mdi:database" width="10" style="color: var(--brand-primary);"></iconify-icon>
            ${this.connectionName}
          </span>
          ${activeFrame?.results ? html`
            <span class="flex items-center gap-1">
              <iconify-icon icon="mdi:table" width="10"></iconify-icon>
              <span>${activeFrame.results.rowCount} rows</span>
            </span>
            <span class="flex items-center gap-1">
              <iconify-icon icon="mdi:timer-outline" width="10"></iconify-icon>
              <span>${activeFrame.results.executionTimeMs}ms</span>
            </span>
          ` : nothing}
          ${this.tableFilter ? html`
            <span class="flex items-center gap-1 px-1.5 py-0.5 rounded" style="background: var(--indigo-500/10); color: var(--indigo-400);">
              <iconify-icon icon="mdi:filter-variant" width="10"></iconify-icon>
              Active filter
            </span>
          ` : nothing}
        </div>
        <div class="flex items-center gap-4">
          <span class="hidden md:inline-flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 rounded bg-gray-500/10 border" style="border-color: var(--app-border);">⌘</kbd>
            <span>+</span>
            <kbd class="px-1.5 py-0.5 rounded bg-gray-500/10 border" style="border-color: var(--app-border);">↩</kbd>
            <span class="ml-1">Run</span>
          </span>
          <span class="hidden md:inline-flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 rounded bg-gray-500/10 border" style="border-color: var(--app-border);">⌘</kbd>
            <span>+</span>
            <kbd class="px-1.5 py-0.5 rounded bg-gray-500/10 border" style="border-color: var(--app-border);">C</kbd>
            <span class="ml-1">Copy</span>
          </span>
          ${this.isRunning ? html`
            <span class="flex items-center gap-1.5 px-2 py-0.5 rounded" style="background: var(--brand-primary)/10; color: var(--brand-primary);">
              <iconify-icon icon="line-md:loading-loop" width="10"></iconify-icon>
              Executing query...
            </span>
          ` : html`
            <span class="flex items-center gap-1.5 px-2 py-0.5 rounded" style="background: var(--success)/10; color: var(--success);">
              <iconify-icon icon="mdi:check-circle" width="10"></iconify-icon>
              Ready
            </span>
          `}
        </div>
      </div>
    `;
  }

  private isNull(value: unknown): boolean {
    return value === null || value === undefined;
  }

  private handlePageChange(direction: 'prev' | 'next') {
    this.tablePage = direction === 'next' ? this.tablePage + 1 : Math.max(1, this.tablePage - 1);
    this.requestUpdate();
  }

  private renderResultCard(frame: QueryFrame, isActive: boolean) {
    const isExpanded = this.expandedFrameIds.has(frame.id);
    const totalPages = frame.results ? Math.ceil(frame.results.rowCount / this.tablePageSize) : 1;
    const startIndex = (this.tablePage - 1) * this.tablePageSize;
    const endIndex = Math.min(startIndex + this.tablePageSize, frame.results?.rowCount || 0);
    const paginatedRows = frame.results?.rows.slice(startIndex, endIndex) || [];

    console.log('[QueryEditor] renderResultCard called for frame:', frame.id, 'isActive:', isActive, 'hasResults:', !!frame.results);
    return html`
      <div
        class="border rounded-lg overflow-hidden transition-all ${isActive ? 'ring-2 ring-indigo-500 shadow-lg' : 'hover:shadow-md'}"
        style="background: var(--app-bg); border-color: var(--app-border);"
      >
        <!-- Card Header: Query on left, Actions on right -->
        <div
          class="flex items-center justify-between px-4 py-2 border-b"
          style="background: var(--app-toolbar-background); border-color: var(--app-border);"
        >
          <div class="flex items-center gap-2 overflow-hidden flex-1">
            <button
              class="p-1 rounded transition-colors flex items-center justify-center hover:bg-[var(--app-toolbar-hover)]"
              style="color: var(--app-foreground); background: transparent;"
              title="${isExpanded ? 'Collapse' : 'Expand'}"
              @click=${(e: Event) => { e.stopPropagation(); this.toggleFrameExpand(frame.id); }}
            >
              <iconify-icon icon="${isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}" width="16" height="16"></iconify-icon>
            </button>
            <span
              class="text-xs font-mono truncate px-2 py-1 rounded"
              style="color: var(--app-foreground); background: var(--app-tab-inactive);"
            >
              ${frame.sql}
            </span>
            <button
              class="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--app-toolbar-hover)] cursor-pointer"
              style="color: var(--app-foreground); background: transparent;"
              title="Copy SQL"
              @click=${(e: Event) => { e.stopPropagation(); this.copyToClipboard(frame.sql); }}
            >
              <iconify-icon icon="mdi:content-copy" width="14"></iconify-icon>
            </button>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${frame.results
              ? html`
                  <span class="flex items-center h-6 text-[10px] px-2 rounded font-mono" style="background: var(--app-tab-inactive); color: var(--app-foreground);" title="Execution time">
                    <iconify-icon icon="mdi:timer-outline" width="14" style="margin-right: 4px;"></iconify-icon>
                    ${frame.results.executionTimeMs}ms
                  </span>
                  ${(() => {
                    const style = this.getTruncatedStyle(!!frame.results.truncated);
                    return html`
                      <span
                        class="flex items-center h-6 text-[10px] px-2 rounded font-mono"
                        style="background: ${style.bg}; color: ${style.color};"
                        title=${frame.results.truncated ? 'Results truncated at ' + frame.results.limitApplied + ' rows' : 'Rows returned'}>
                        <iconify-icon icon="mdi:table" width="14" style="margin-right: 4px;"></iconify-icon>
                        ${frame.results.rowCount}${frame.results.truncated ? '+' : ''}
                      </span>
                    `;
                  })()}
                  <div style="position: relative;">
                    <button
                      class="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--app-toolbar-hover)]"
                      style="color: var(--app-foreground); background: transparent;"
                      title="Download"
                      @click=${(e: Event) => { e.stopPropagation(); this.toggleDownloadMenu(frame.id); }}
                    >
                      <iconify-icon icon="mdi:download" width="14"></iconify-icon>
                    </button>
                    ${this.showDownloadMenu && this.downloadFrameId === frame.id ? html`
                      <div
                        class="absolute right-0 top-7 z-50 rounded shadow-lg border min-w-[140px]"
                        style="background: var(--app-background); border-color: var(--app-border);"
                        @click=${(e: Event) => e.stopPropagation()}
                      >
                        <button
                          class="w-full px-3 py-1.5 text-xs text-left flex items-center gap-2 hover:bg-[var(--app-tab-inactive)] transition-colors"
                          style="color: var(--app-foreground);"
                          @click=${() => this.exportToJSON(frame)}
                        >
                          <iconify-icon icon="mdi:code-json" width="14"></iconify-icon>
                          JSON
                        </button>
                        <button
                          class="w-full px-3 py-1.5 text-xs text-left flex items-center gap-2 hover:bg-[var(--app-tab-inactive)] transition-colors"
                          style="color: var(--app-foreground);"
                          @click=${() => this.exportToCSV(frame)}
                        >
                          <iconify-icon icon="mdi:file-delimited" width="14"></iconify-icon>
                          CSV
                        </button>
                        <button
                          class="w-full px-3 py-1.5 text-xs text-left flex items-center gap-2 hover:bg-[var(--app-tab-inactive)] transition-colors"
                          style="color: var(--app-foreground);"
                          @click=${() => this.exportToXLSX(frame)}
                        >
                          <iconify-icon icon="mdi:microsoft-excel" width="14"></iconify-icon>
                          Excel
                        </button>
                      </div>
                    ` : nothing}
                  </div>
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--app-toolbar-hover)]"
                    style="color: var(--app-foreground); background: transparent;"
                    title="Edit query"
                    @click=${(e: Event) => { e.stopPropagation(); this.editFrame(frame); }}
                  >
                    <iconify-icon icon="mdi:pencil" width="14"></iconify-icon>
                  </button>
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--app-toolbar-hover)]"
                    style="color: var(--app-foreground); background: transparent;"
                    title="Re-run query"
                    @click=${(e: Event) => { e.stopPropagation(); this.reRunFrame(frame); }}
                  >
                    <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
                  </button>
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--app-toolbar-hover)]"
                    style="color: var(--error); background: transparent;"
                    title="Remove result"
                    @click=${(e: Event) => { e.stopPropagation(); this.deleteFrame(frame.id); }}
                  >
                    <iconify-icon icon="mdi:close" width="14"></iconify-icon>
                  </button>
                `
              : html`
                  <span class="flex items-center h-6 text-[10px] px-2 rounded" style="background: var(--error)/10; color: var(--error);" title="Query failed">
                    <iconify-icon icon="mdi:alert-circle" width="14" style="margin-right: 4px;"></iconify-icon>
                    Error
                  </span>
                  <button
                    class="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--app-toolbar-hover)]"
                    style="color: var(--error); background: transparent;"
                    title="Remove result"
                    @click=${(e: Event) => { e.stopPropagation(); this.deleteFrame(frame.id); }}
                  >
                    <iconify-icon icon="mdi:close" width="14"></iconify-icon>
                  </button>
                `}
          </div>
        </div>

        <!-- Card Body: Sidebar on left, Main content on right (only when expanded) -->
        ${isExpanded ? html`
        <div class="flex" style="min-height: 400px;">
          <!-- Sidebar: View Type Selector (Icons Only) -->
          <div
            class="w-12 border-r flex flex-col items-center py-2 gap-1"
            style="background: var(--app-sidebar-background, var(--app-tab-inactive)); border-color: var(--app-border);"
          >
            ${(['table', 'json', 'explain'] as const).map((mode, idx) => {
              const isActive = frame.viewMode === mode;
              const icons = ['mdi:table', 'mdi:code-json', 'mdi:chart-timeline-variant'];
              const titles = ['Table View', 'JSON View', 'Explain Plan'];
              return html`
                <button
                  class="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--app-toolbar-hover)]"
                  style="
                    background: ${isActive ? 'var(--brand-primary)' : 'transparent'};
                    color: ${isActive ? '#ffffff' : 'var(--app-disabled-foreground)'};
                  "
                  title="${titles[idx]}"
                  @click=${(e: Event) => { e.stopPropagation(); this.updateFrameViewMode(frame.id, mode); }}
                >
                  <iconify-icon icon="${icons[idx]}" width="18" height="18"></iconify-icon>
                </button>
              `;
            })}
          </div>

          <!-- Main: Results Output -->
          <div class="flex-1 p-4 overflow-auto" style="background: var(--app-bg); min-height: 350px;">
            ${frame.results?.truncated
              ? html`
                  <div class="mb-3 p-3 rounded-lg border flex items-center justify-between" style="background: var(--warning)/5; border-color: var(--warning)/30;">
                    <div class="flex items-center gap-2" style="color: var(--warning);">
                      <iconify-icon icon="mdi:information-outline" width="18" height="18"></iconify-icon>
                      <span class="text-sm" style="font-weight: 500;">
                        Results limited to ${frame.results.limitApplied} rows
                      </span>
                    </div>
                    <span class="text-xs" style="color: var(--app-disabled-foreground);">
                      Add LIMIT clause to fetch more
                    </span>
                  </div>
                `
              : nothing}
            ${frame.error
              ? html`
                  <div class="p-4 rounded-lg border font-mono text-sm" style="background: var(--error)/5; border-color: var(--error)/30; color: var(--error);">
                    <div class="flex items-center gap-2 mb-3">
                      <iconify-icon icon="mdi:alert-circle" width="18" height="18"></iconify-icon>
                      <strong style="font-size: 13px;">Query Error</strong>
                    </div>
                    <div style="line-height: 1.6;">${frame.error}</div>
                  </div>
                `
              : frame.results
                ? this.renderTableView(frame, paginatedRows, startIndex, totalPages)
                : html`
                    <div class="flex items-center justify-center h-40 text-sm" style="color: var(--app-disabled-foreground);">
                      <div class="text-center">
                        <iconify-icon icon="mdi:database-search" width="32" height="32" style="opacity: 0.3; margin-bottom: 8px;"></iconify-icon>
                        <p>Query returned no results</p>
                      </div>
                    </div>
                `}
          </div>
        </div>
        ` : nothing}
      </div>
    `;
  }

  private copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  private renderTableView(frame: QueryFrame, rows: Record<string, unknown>[], _startIndex: number, _totalPages: number) {
    console.log('[QueryEditor] renderTableView called:', {
      rowCount: rows.length,
      viewMode: frame.viewMode,
      hasResults: !!frame.results,
      columns: frame.results?.columns?.length || 0
    });
    // Recalculate based on filtered data
    const sortedRows = this.getSortedRows(rows);
    const filteredRows = this.getFilteredRows(sortedRows);
    const totalFilteredPages = Math.ceil(filteredRows.length / this.tablePageSize);
    const currentPage = Math.min(this.tablePage, totalFilteredPages || 1);
    const startIndex = (currentPage - 1) * this.tablePageSize;
    const endIndex = Math.min(startIndex + this.tablePageSize, filteredRows.length);
    const paginatedRows = filteredRows.slice(startIndex, endIndex);
    // Use backend row count for pagination display (shows actual returned rows)
    const backendRowCount = frame.results?.rowCount || 0;
    const isTruncated = frame.results?.truncated || false;
    console.log('[QueryEditor] renderTableView data:', {
      sortedRows: sortedRows.length,
      filteredRows: filteredRows.length,
      paginatedRows: paginatedRows.length,
      startIndex, endIndex
    });
    if (frame.viewMode === 'json') {
      return html`
        <div class="flex flex-col h-full">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs" style="color: var(--app-disabled-foreground);">JSON Result</span>
            <button
              class="px-2 py-1 text-xs rounded border transition-colors flex items-center gap-1"
              style="background: transparent; border-color: var(--app-border); color: var(--app-foreground);"
              @click=${() => this.copyToClipboard(JSON.stringify(frame.results?.rows, null, 2))}
            >
              <iconify-icon icon="mdi:content-copy" width="12"></iconify-icon>
              Copy
            </button>
          </div>
          <pre class="font-mono text-xs whitespace-pre-wrap break-words rounded border overflow-auto p-4 flex-1" style="background: var(--app-tab-inactive); border-color: var(--app-border); color: var(--app-foreground); line-height: 1.6;">
${JSON.stringify(frame.results?.rows, null, 2)}</pre>
        </div>
      `;
    }

    if (frame.viewMode === 'explain') {
      return html`
        <div class="flex items-center justify-center h-40 text-sm" style="color: var(--app-disabled-foreground);">
          <div class="text-center">
            <iconify-icon icon="mdi:chart-timeline-variant" width="32" height="32" style="opacity: 0.4; margin-bottom: 8px;"></iconify-icon>
            <p style="font-weight: 500;">EXPLAIN view</p>
            <p class="text-xs mt-1">Coming soon</p>
          </div>
        </div>
      `;
    }

    // Table view - Modern high-fidelity data table
    const columns = frame.results?.columns || [];

    return html`
      <div class="flex flex-col h-full">
        <div class="overflow-auto flex-1 relative">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr style="background: var(--app-toolbar-background); border-bottom: 2px solid var(--app-border);">
                <!-- Row Number Column -->
                <th class="w-12 px-2 py-2 text-center font-medium text-[10px] uppercase tracking-wide sticky top-0 z-10"
                    style="background: var(--app-toolbar-background); color: var(--app-disabled-foreground); border-right: 1px solid var(--app-border);">
                  #
                </th>
                ${columns.map(col => html`
                  <th
                    class="text-left px-3 py-2 font-medium text-[11px] uppercase tracking-wide whitespace-nowrap sticky top-0 cursor-pointer hover:bg-indigo-500/5 transition-colors group"
                    style="color: var(--app-foreground); background: var(--app-toolbar-background); border-right: 1px solid var(--app-border);"
                    @click=${() => this.handleSort(col.name)}
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate">${col.name}</span>
                      <div class="flex items-center gap-1">
                        ${this.sortColumn === col.name
                          ? html`<iconify-icon icon="${this.sortDirection === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'}" width="10" style="color: var(--brand-primary);"></iconify-icon>`
                          : html`<iconify-icon icon="mdi:arrow-unfold-all-horizontal" width="10" class="opacity-0 group-hover:opacity-100 transition-opacity" style="color: var(--app-disabled-foreground);"></iconify-icon>`}
                      </div>
                    </div>
                    ${col.typeName ? html`
                      <span class="text-[9px] font-normal normal-case mt-0.5 px-1 py-0.5 rounded inline-block"
                            style="background: var(--indigo-500/10); color: var(--indigo-400);">
                        ${col.typeName}
                      </span>
                    ` : nothing}
                  </th>
                `)}
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0
                ? html`
                    <tr>
                      <td colspan="${columns.length + 1}" class="px-4 py-12 text-center" style="color: var(--app-disabled-foreground);">
                        <div class="flex flex-col items-center">
                          <iconify-icon icon="mdi:table-row-remove" width="32" height="32" style="opacity: 0.3; margin-bottom: 8px;"></iconify-icon>
                          <p class="text-sm">No data available</p>
                        </div>
                      </td>
                    </tr>
                  `
                : rows.map((row, idx) => html`
                    <tr
                      class="border-b transition-colors hover:bg-indigo-500/5 group"
                      style="border-color: var(--app-border); ${idx % 2 === 0 ? 'background: var(--app-bg);' : 'background: var(--app-tab-inactive);'}"
                    >
                      <!-- Row Number -->
                      <td class="px-2 py-2 text-center text-[10px] font-mono sticky left-0 z-0"
                          style="background: inherit; color: var(--app-disabled-foreground); border-right: 1px solid var(--app-border);">
                        ${startIndex + idx + 1}
                      </td>
                      ${columns.map(col => {
                        const formatted = this.formatValueForDisplay(row[col.name]);
                        return html`
                          <td
                            class="px-3 py-2 max-w-[200px] truncate text-sm relative group/cell"
                            style="color: var(--app-foreground);"
                            title=${formatted.content}
                            @dblclick=${() => this.copyCellValue(formatted.content)}
                          >
                            ${formatted.isNull
                              ? html`<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium" style="background: var(--app-tab-inactive); color: var(--app-secondary-foreground); border: 1px solid var(--app-border);">NULL</span>`
                              : formatted.type === 'boolean'
                                ? html`
                                    <span class="px-1.5 py-0.5 rounded text-xs font-medium"
                                          style="background: ${formatted.content === 'true' ? 'var(--success)/10' : 'var(--error)/10'}; color: ${formatted.content === 'true' ? 'var(--success)' : 'var(--error)'};">
                                      <iconify-icon icon="mdi:${formatted.content === 'true' ? 'check-circle' : 'close-circle'}" width="12" style="vertical-align: -2px; margin-right: 2px;"></iconify-icon>
                                      ${formatted.content}
                                    </span>
                                  `
                                : formatted.type === 'number'
                                  ? html`<span style="font-family: 'JetBrains Mono', monospace;">${formatted.content}</span>`
                                  : html`<span class="truncate">${formatted.content}</span>`}
                            <iconify-icon icon="mdi:content-copy" width="12" class="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 transition-opacity cursor-pointer" style="color: var(--app-disabled-foreground);"></iconify-icon>
                          </td>
                        `;
                      })}
                    </tr>
                  `)}
            </tbody>
          </table>
        </div>

        <!-- Pagination Footer -->
        ${frame.results && frame.results.rowCount > 0
          ? html`
              <div
                class="flex items-center justify-between px-4 py-2 border-t mt-2"
                style="background: var(--app-toolbar-background); border-color: var(--app-border);"
              >
                <div class="flex items-center gap-4">
                  <span class="text-xs" style="color: var(--app-disabled-foreground);">
                    Rows <strong style="color: var(--app-foreground);">${startIndex + 1}-${endIndex}</strong> of <strong style="color: var(--app-foreground);">${backendRowCount}${isTruncated ? '+' : ''}</strong>${isTruncated ? html` <span class="ml-1 px-1.5 py-0.5 rounded text-[9px]" style="background: var(--warning)/10; color: var(--warning);">truncated</span>` : nothing}
                  </span>
                  ${totalFilteredPages > 1
                    ? html`
                        <div class="flex items-center gap-1">
                          <button
                            class="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-[var(--app-toolbar-hover)]"
                            style="background: ${currentPage === 1 ? 'var(--app-tab-inactive)' : 'transparent'}; color: ${currentPage === 1 ? 'var(--app-disabled-foreground)' : 'var(--app-foreground)'};"
                            @click=${(e: Event) => { e.stopPropagation(); this.handlePageChange('prev'); }}
                            ?disabled=${currentPage === 1}
                          >
                            <iconify-icon icon="mdi:chevron-left" width="14"></iconify-icon>
                          </button>
                          <span class="text-xs px-2 py-1 rounded font-mono" style="background: var(--app-tab-inactive); color: var(--app-foreground);">
                            ${currentPage} / ${totalFilteredPages}
                          </span>
                          <button
                            class="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-[var(--app-toolbar-hover)]"
                            style="background: ${currentPage === totalFilteredPages ? 'var(--app-tab-inactive)' : 'transparent'}; color: ${currentPage === totalFilteredPages ? 'var(--app-disabled-foreground)' : 'var(--app-foreground)'};"
                            @click=${(e: Event) => { e.stopPropagation(); this.handlePageChange('next'); }}
                            ?disabled=${currentPage === totalFilteredPages}
                          >
                            <iconify-icon icon="mdi:chevron-right" width="14"></iconify-icon>
                          </button>
                        </div>
                      `
                    : html`<span></span>`}
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs" style="color: var(--app-disabled-foreground);">Rows per page:</span>
                  <div class="relative">
                    <select
                      class="appearance-none text-xs pl-3 pr-8 py-1.5 rounded border cursor-pointer hover:bg-[var(--app-toolbar-hover)] transition-colors"
                      style="background: var(--app-input-background); border-color: var(--app-border); color: var(--app-foreground);"
                      @change=${(e: Event) => { this.tablePageSize = parseInt((e.target as HTMLSelectElement).value); this.tablePage = 1; this.requestUpdate(); }}
                    >
                      <option value="25" ?selected=${this.tablePageSize === 25}>25</option>
                      <option value="50" ?selected=${this.tablePageSize === 50}>50</option>
                      <option value="100" ?selected=${this.tablePageSize === 100}>100</option>
                      <option value="200" ?selected=${this.tablePageSize === 200}>200</option>
                      <option value="500" ?selected=${this.tablePageSize === 500}>500</option>
                    </select>
                    <iconify-icon icon="mdi:chevron-down" width="14" class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style="color: var(--app-disabled-foreground);"></iconify-icon>
                  </div>
                </div>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  override render() {
    console.log('[QueryEditor] render() called, frames:', this.frames.length, 'activeFrameId:', this.activeFrameId);
    const activeFrame = this.frames.find(f => f.id === this.activeFrameId) || this.frames[0];

    return html`
      <!-- Main Layout -->
      <div class="flex flex-col h-full w-full overflow-hidden" style="background: var(--app-bg);">
        <!-- Editor Section: Left = Actions, Right = Editor -->
        <div class="flex shrink-0 items-stretch border-b" style="background: var(--app-background); border-color: var(--app-border);">
          <!-- Left Column: Primary Action Buttons (hidden in focus mode) -->
          <div
            class="${this.focusMode ? 'hidden' : 'w-12'} border-r flex flex-col items-center justify-start gap-1 py-2 shrink-0"
            style="background: var(--app-toolbar-background); border-color: var(--app-border);"
          >
            <button
              class="w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer hover:bg-[var(--app-toolbar-hover)]"
              style="color: var(--success);"
              title="Run Query (⌘ + ↩)"
              @click=${(e: MouseEvent) => {
                console.log('[QueryEditor] Run button CLICKED!');
                e.preventDefault();
                e.stopPropagation();
                this._boundHandleRun();
              }}
              ?disabled=${this.isRunning || !this.sql.trim()}
            >
              ${this.isRunning
                ? html`<iconify-icon icon="line-md:loading-loop" width="16" height="16"></iconify-icon>`
                : html`<iconify-icon icon="mdi:play" width="16" height="16"></iconify-icon>`}
            </button>
            <button
              class="w-8 h-8 rounded flex items-center justify-center transition-all hover:bg-[var(--app-toolbar-hover)] ${this.isRunning ? 'cursor-pointer' : 'cursor-not-allowed'}"
              style="color: ${this.isRunning ? 'var(--error)' : 'var(--app-disabled-foreground)'};"
              title="Cancel Query"
              @click=${this._boundHandleCancel}
              ?disabled=${!this.isRunning}
            >
              <iconify-icon icon="mdi:stop" width="16" height="16"></iconify-icon>
            </button>
            <div class="w-6 h-px my-1" style="background: var(--app-border);"></div>
            <button
              class="w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer hover:bg-[var(--app-toolbar-hover)]"
              style="color: var(--app-keyword);"
              title="Format SQL"
              @click=${this._boundHandleFormatSql}
            >
              <iconify-icon icon="mdi:code-tags" width="16" height="16"></iconify-icon>
            </button>
            <button
              class="w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer hover:bg-[var(--app-toolbar-hover)]"
              style="color: var(--warning);"
              title="Clear Editor"
              @click=${() => {
                this.sql = '';
                if (this.editorView) {
                  this.editorView.dispatch({ changes: { from: 0, to: this.editorView.state.doc.length, insert: '' } });
                }
              }}
            >
              <iconify-icon icon="mdi:eraser" width="16" height="16"></iconify-icon>
            </button>
          </div>

          <!-- Right Column: SQL Editor (takes maximum space) -->
          <div class="flex-1 flex flex-col min-w-0 relative">
            <!-- Editor Container -->
            <div id="editor-container" class="w-full h-full"></div>
            <!-- Exit Focus Mode Button (overlay, shown only in focus mode) -->
            ${this.focusMode ? html`
              <button
                class="absolute top-2 right-2 z-10 px-3 py-1.5 text-xs rounded-lg border shadow-lg transition-all hover:scale-105"
                style="background: var(--app-toolbar-background); border-color: var(--app-border); color: var(--app-foreground);"
                title="Exit Focus Mode"
                @click=${() => { this.focusMode = false; this.requestUpdate(); }}
              >
                <iconify-icon icon="mdi:focus-auto" width="14" style="vertical-align: -2px; margin-right: 4px;"></iconify-icon>
                Exit Focus
              </button>
            ` : nothing}
          </div>

          <!-- Far Right: Secondary Actions (hidden in focus mode) -->
          <div
            class="${this.focusMode ? 'hidden' : 'w-12'} border-l flex flex-col items-center justify-start gap-1 py-2 shrink-0"
            style="background: var(--app-toolbar-background); border-color: var(--app-border);"
          >
            <button
              class="w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer hover:bg-[var(--app-toolbar-hover)]"
              style="color: var(--brand-primary);"
              title="Save Query"
              @click=${() => { this.showSaveQueryDialog = true; }}
            >
              <iconify-icon icon="mdi:content-save" width="16" height="16"></iconify-icon>
            </button>
            <button
              class="w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer hover:bg-[var(--app-toolbar-hover)] ${this.showHistoryPanel ? 'bg-[var(--app-toolbar-active)]' : ''}"
              style="color: var(--app-console-info);"
              title="Query History"
              @click=${() => { this.showHistoryPanel = !this.showHistoryPanel; this.showSavedQueriesPanel = false; this.requestUpdate(); }}
            >
              <iconify-icon icon="mdi:history" width="16" height="16"></iconify-icon>
            </button>
            <button
              class="w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer hover:bg-[var(--app-toolbar-hover)] ${this.showSavedQueriesPanel ? 'bg-[var(--app-toolbar-active)]' : ''}"
              style="color: var(--project-database);"
              title="Saved Queries"
              @click=${() => { this.showSavedQueriesPanel = !this.showSavedQueriesPanel; this.showHistoryPanel = false; this.requestUpdate(); }}
            >
              <iconify-icon icon="mdi:bookmark" width="16" height="16"></iconify-icon>
            </button>
            <div class="w-6 h-px my-1" style="background: var(--app-border);"></div>
            <button
              class="w-8 h-8 rounded flex items-center justify-center transition-all cursor-pointer hover:bg-[var(--app-toolbar-hover)] ${this.focusMode ? 'bg-[var(--app-toolbar-active)]' : ''}"
              style="color: var(--app-foreground);"
              title="Focus Mode"
              @click=${() => { this.focusMode = !this.focusMode; this.requestUpdate(); }}
            >
              <iconify-icon icon="${this.focusMode ? 'mdi:focus-auto' : 'mdi:focus-field'}" width="16" height="16"></iconify-icon>
            </button>
          </div>
        </div>

        <!-- Query History Panel -->
        ${this.showHistoryPanel ? html`
          <div
            class="border-t p-3 overflow-auto"
            style="background: var(--app-tab-inactive); border-color: var(--app-border); max-height: 180px;"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium" style="color: var(--app-foreground);">
                <iconify-icon icon="mdi:history" width="12" style="vertical-align: -2px; margin-right: 4px;"></iconify-icon>
                Recent Queries
              </span>
              <button
                class="text-xs px-1.5 py-0.5 rounded hover:bg-gray-500/20"
                style="color: var(--app-disabled-foreground);"
                @click=${() => { this.queryHistory = []; this.showHistoryPanel = false; }}
              >
                <iconify-icon icon="mdi:trash-can" width="12"></iconify-icon>
              </button>
            </div>
            ${this.queryHistory.length === 0
              ? html`<p class="text-xs text-center py-4" style="color: var(--app-disabled-foreground);">No recent queries</p>`
              : html`
                  <div class="space-y-1">
                    ${this.queryHistory.slice(0, 8).map((query, idx) => html`
                      <div
                        class="text-xs p-2 rounded cursor-pointer hover:bg-indigo-500/10 transition-colors group"
                        style="color: var(--app-foreground);"
                        @click=${() => { this.sql = query; this.editorView?.dispatch({ changes: { from: 0, to: this.editorView.state.doc.length, insert: query } }); this.showHistoryPanel = false; }}
                      >
                        <div class="flex items-start justify-between gap-2">
                          <code class="truncate flex-1" style="font-family: 'JetBrains Mono', monospace;">${query.substring(0, 70)}${query.length > 70 ? '...' : ''}</code>
                          <iconify-icon icon="mdi:play-circle" width="14" class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style="color: var(--brand-primary);"></iconify-icon>
                        </div>
                      </div>
                    `)}
                  </div>
                `}
          </div>
        ` : nothing}

        <!-- Saved Queries Panel -->
        ${this.showSavedQueriesPanel ? html`
          <div
            class="border-t p-3 overflow-auto"
            style="background: var(--app-tab-inactive); border-color: var(--app-border); max-height: 180px;"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium" style="color: var(--app-foreground);">
                <iconify-icon icon="mdi:bookmark" width="12" style="vertical-align: -2px; margin-right: 4px;"></iconify-icon>
                Saved Queries
              </span>
              <button
                class="text-xs px-1.5 py-0.5 rounded hover:bg-gray-500/20"
                style="color: var(--app-disabled-foreground);"
                @click=${() => { this.showSaveQueryDialog = true; }}
                title="Save current query"
              >
                <iconify-icon icon="mdi:plus" width="12"></iconify-icon>
              </button>
            </div>
            ${this.savedQueries.length === 0
              ? html`<p class="text-xs text-center py-4" style="color: var(--app-disabled-foreground);">No saved queries</p>`
              : html`
                  <div class="space-y-1">
                    ${this.savedQueries.map((saved, idx) => html`
                      <div
                        class="text-xs p-2 rounded cursor-pointer hover:bg-indigo-500/10 transition-colors group"
                        style="color: var(--app-foreground);"
                        @click=${() => { this.loadSavedQuery(saved.sql); this.showSavedQueriesPanel = false; }}
                      >
                        <div class="flex items-start justify-between gap-2">
                          <div class="flex-1 min-w-0">
                            <div class="font-medium mb-0.5">${saved.name}</div>
                            <code class="truncate block text-[10px]" style="font-family: 'JetBrains Mono', monospace; color: var(--app-disabled-foreground);">${saved.sql.substring(0, 50)}${saved.sql.length > 50 ? '...' : ''}</code>
                          </div>
                          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              class="p-0.5 rounded hover:bg-gray-500/20"
                              @click=${(e: Event) => { e.stopPropagation(); this.savedQueries = this.savedQueries.filter((_, i) => i !== idx); }}
                            >
                              <iconify-icon icon="mdi:trash-can" width="12" style="color: var(--app-disabled-foreground);"></iconify-icon>
                            </button>
                          </div>
                        </div>
                      </div>
                    `)}
                  </div>
                `}
          </div>
        ` : nothing}

        <!-- Save Query Dialog -->
        ${this.showSaveQueryDialog ? html`
          <div
            class="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
            @click=${() => { this.showSaveQueryDialog = false; }}
          >
            <div
              class="bg-[var(--app-bg)] border rounded-xl shadow-2xl overflow-hidden w-80"
              style="border-color: var(--app-border);"
              @click=${(e: Event) => e.stopPropagation()}
            >
              <div class="px-4 py-3 border-b" style="border-color: var(--app-border);">
                <h3 class="text-sm font-semibold" style="color: var(--app-foreground);">Save Query</h3>
                <p class="text-[10px] mt-0.5" style="color: var(--app-disabled-foreground);">Give your query a name</p>
              </div>
              <div class="p-4">
                <input
                  type="text"
                  class="w-full text-sm px-3 py-2 rounded border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  style="background: var(--app-bg); border-color: var(--app-border); color: var(--app-foreground);"
                  placeholder="e.g., Get all users"
                  id="save-query-name"
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      this.confirmSaveQuery((this.renderRoot.querySelector('#save-query-name') as HTMLInputElement)?.value || '');
                    }
                    if (e.key === 'Escape') {
                      this.showSaveQueryDialog = false;
                    }
                  }}
                />
              </div>
              <div class="flex items-center justify-end gap-2 px-4 py-3 border-t" style="border-color: var(--app-border);">
                <button
                  class="px-3 py-1.5 text-xs rounded border transition-colors"
                  style="background: transparent; border-color: var(--app-border); color: var(--app-foreground);"
                  @click=${() => { this.showSaveQueryDialog = false; }}
                >
                  Cancel
                </button>
                <button
                  class="px-3 py-1.5 text-xs rounded transition-colors"
                  style="background: var(--brand-primary); color: white;"
                  @click=${() => {
                    const name = (this.renderRoot.querySelector('#save-query-name') as HTMLInputElement)?.value || '';
                    this.confirmSaveQuery(name);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ` : nothing}

        <!-- Results Section -->
        <div class="flex-1 overflow-y-auto p-4 min-h-0" style="background: var(--app-bg);">
          ${this.frames.length === 0
            ? html`
                <div class="flex flex-col items-center justify-center h-full py-12">
                  <iconify-icon icon="mdi:database-outline" width="48" height="48" style="color: var(--app-disabled-foreground); opacity: 0.5;"></iconify-icon>
                  <h3 class="text-sm font-medium mt-4" style="color: var(--app-foreground);">No queries yet</h3>
                  <p class="text-xs mt-1.5 text-center max-w-md" style="color: var(--app-secondary-foreground);">
                    Write a SQL query and click <strong>Run</strong> to see results
                  </p>
                  <div class="flex items-center gap-2 mt-4 text-[11px]" style="color: var(--app-disabled-foreground);">
                    <kbd class="px-1.5 py-0.5 rounded bg-gray-500/10 border" style="border-color: var(--app-border);">⌘</kbd> + <kbd class="px-1.5 py-0.5 rounded bg-gray-500/10 border" style="border-color: var(--app-border);">↩</kbd>
                    <span>to run query</span>
                  </div>
                </div>
              `
            : html`
                <div class="space-y-2">
                  <!-- Results Tabs -->
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-medium" style="color: var(--app-foreground);">
                      ${this.frames.filter(f => f.results).length} result${this.frames.filter(f => f.results).length !== 1 ? 's' : ''}
                    </span>
                    <div class="flex-1"></div>
                    <button
                      class="text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1"
                      style="background: transparent; border-color: var(--app-border); color: var(--app-foreground);"
                      @click=${() => { this.frames = []; this.activeFrameId = null; }}
                    >
                      <iconify-icon icon="mdi:trash-can-outline" width="12"></iconify-icon>
                      Clear All
                    </button>
                  </div>
                  ${this.frames.filter(frame => frame.results).map(frame => this.renderResultCard(frame, frame.id === this.activeFrameId))}
                </div>
              `}
        </div>

        <!-- Status Bar -->
        ${this.renderStatusBar()}
      </div>
    `;
  }
}
