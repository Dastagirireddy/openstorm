/**
 * SQL Query Editor Component
 *
 * CodeMirror 6 wrapper for SQL editing with syntax highlighting.
 */

import { html, nothing, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../../tailwind-element.js';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { sql, PostgreSQL, MySQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';

@customElement('sql-query-editor')
export class SqlQueryEditor extends TailwindElement() {
  @property({ type: String }) sql = '';
  @property({ type: String }) dialect: 'postgresql' | 'mysql' = 'postgresql';
  @property({ type: String }) status: 'idle' | 'running' | 'complete' | 'error' = 'idle';
  @property({ type: String }) error: string | null = null;

  @state() private editorView: EditorView | null = null;
  private containerRef: HTMLDivElement | null = null;

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .editor-container {
      flex: 1;
      overflow: hidden;
      font-size: 13px;
    }

    .cm-editor {
      height: 100%;
      font-size: 13px;
    }

    .cm-scroller {
      overflow: auto;
    }

    .cm-gutters {
      background: transparent !important;
      border-right: 1px solid var(--app-border) !important;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
      border-bottom: 1px solid var(--app-border);
      background: var(--app-toolbar-background);
    }

    .run-button {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-md);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      border: none;
    }

    .run-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-size: 11px;
      color: var(--app-disabled-foreground);
    }
  `;

  override firstUpdated(): void {
    this.initEditor();
  }

  override updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has('sql') && this.editorView) {
      const currentCursor = this.editorView.state.selection.main.head;
      const currentContent = this.editorView.state.doc.toString();

      if (currentContent !== this.sql) {
        this.editorView.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: this.sql,
          },
        });
      }
    }
  }

  private initEditor() {
    if (!this.containerRef) return;

    const sqlDialect = this.dialect === 'postgresql' ? sql({ dialect: PostgreSQL }) : sql({ dialect: MySQL });

    this.editorView = new EditorView({
      doc: this.sql,
      extensions: [
        EditorState.tabSize.of(4),
        history(),
        keymap.of([...historyKeymap, ...defaultKeymap]),
        sqlDialect,
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            this.sql = newValue;
            this.dispatchEvent(
              new CustomEvent('change', {
                detail: { value: newValue },
                bubbles: true,
                composed: true,
              })
            );
          }
        }),
        EditorView.domEventHandlers({
          keydown: (event, view) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              this.dispatchEvent(
                new CustomEvent('run', {
                  bubbles: true,
                  composed: true,
                })
              );
              return true;
            }
            return false;
          },
        }),
      ],
      parent: this.containerRef,
    });
  }

  private handleRun() {
    this.dispatchEvent(
      new CustomEvent('run', {
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    return html`
      <div class="toolbar">
        <button
          class="run-button"
          style="background: var(--brand-primary); color: white;"
          @click=${() => this.handleRun()}
          ?disabled=${this.status === 'running' || !this.sql.trim()}
        >
          ${this.status === 'running'
            ? html`<iconify-icon icon="line-md:loading-loop" width="16" height="16"></iconify-icon>`
            : html`<iconify-icon icon="mdi:play" width="16" height="16"></iconify-icon>`}
          ${this.status === 'running' ? 'Running...' : 'Run'}
        </button>

        ${this.status === 'complete' && this.sql.trim()
          ? html`
              <span class="status-indicator">
                <iconify-icon icon="mdi:check-circle" width="14" height="14" style="color: var(--success);"></iconify-icon>
                Query executed successfully
              </span>
            `
          : nothing}

        ${this.status === 'error'
          ? html`
              <span class="status-indicator" style="color: var(--error);">
                <iconify-icon icon="mdi:alert-circle" width="14" height="14"></iconify-icon>
                ${this.error}
              </span>
            `
          : nothing}
      </div>

      <div class="editor-container">
        <div ${((el: HTMLDivElement) => (this.containerRef = el)) as any}></div>
      </div>
    `;
  }

  override disconnectedCallback(): void {
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
    super.disconnectedCallback();
  }
}
