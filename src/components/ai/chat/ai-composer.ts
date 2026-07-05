import { html, css, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import '../primitives/os-button.js';
import { dispatchAIEvent } from '../core/ai-events.js';
import { searchFiles, parseFileMentions, readMentionedFiles, buildContextMessage } from '../ai-file-utils.js';

@customElement('openstorm-ai-composer')
export class AIComposer extends LitElement {
  static styles = css`
    :host { display: block; position: relative; }
    .composer {
      border-top: 1px solid var(--os-border);
      background: var(--os-ai-composer-bg);
    }
    .attachments {
      display: flex;
      gap: 8px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--os-border-subtle);
      flex-wrap: wrap;
    }
    .attachment {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      background: rgba(88, 166, 255, 0.1);
      color: var(--os-accent);
      font-size: var(--os-text-xs);
      font-family: var(--os-font-mono);
    }
    .attachment button {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 0;
      font-size: 14px;
      opacity: 0.7;
    }
    .attachment button:hover { opacity: 1; }
    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 12px;
    }
    textarea {
      flex: 1;
      background: transparent;
      color: var(--os-text);
      border: 1px solid var(--os-border);
      border-radius: var(--os-radius-md);
      padding: 8px 12px;
      font-family: var(--os-font-sans);
      font-size: var(--os-text-sm);
      resize: none;
      outline: none;
      min-height: 40px;
      max-height: 200px;
      line-height: 1.5;
    }
    textarea:focus { border-color: var(--os-accent); }
    textarea::placeholder { color: var(--os-text-subtle); }
    textarea:disabled { opacity: 0.5; }
    .file-suggestions {
      position: absolute;
      bottom: calc(100% + 4px);
      left: 12px;
      right: 12px;
      background: var(--os-surface, #ffffff);
      border: 1px solid var(--os-border);
      border-radius: 8px;
      max-height: 200px;
      overflow-y: auto;
      padding: 4px;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
      z-index: 100;
    }
    .file-suggestion-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      color: var(--os-text-secondary, #6b7280);
      transition: background 0.1s ease;
    }
    .file-suggestion-item:hover,
    .file-suggestion-item.selected {
      background: var(--os-surface-hover, #f3f4f6);
      color: var(--os-text);
    }
    .file-suggestion-item.no-results {
      color: var(--os-text-subtle, #9ca3af);
      cursor: default;
      font-style: italic;
    }
    .file-suggestion-icon {
      font-size: 12px;
      flex-shrink: 0;
    }
    .file-suggestion-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;

  @property({ type: Boolean }) isStreaming = false;
  @property({ type: Array }) attachedFiles: string[] = [];
  @property({ type: String }) projectPath = '';

  @state() private showFileSuggestions = false;
  @state() private fileSuggestions: string[] = [];
  @state() private selectedFileIndex = 0;
  @state() private fileFilter = '';
  @state() private value = '';

  @query('textarea') textarea!: HTMLTextAreaElement;

  private searchFilesRequestId = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private removeFile(file: string) {
    this.attachedFiles = this.attachedFiles.filter(f => f !== file);
  }

  private onInput(e: Event) {
    const t = e.target as HTMLTextAreaElement;
    this.value = t.value;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
    this.checkForAtMention(t.value);
  }

  private onCutPaste() {
    // Sync value after cut/paste (input event may not fire in all browsers)
    requestAnimationFrame(() => {
      if (!this.textarea) return;
      this.value = this.textarea.value;
      this.textarea.style.height = 'auto';
      this.textarea.style.height = Math.min(this.textarea.scrollHeight, 120) + 'px';
      this.checkForAtMention(this.textarea.value);
    });
  }

  private checkForAtMention(value: string) {
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const afterAt = value.slice(lastAtIndex + 1);
      if (afterAt.indexOf(' ') === -1) {
        const searchQuery = afterAt.split('#')[0];
        this.fileFilter = searchQuery;
        this.showFileSuggestions = true;
        this.selectedFileIndex = 0;
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        const requestId = this.searchFilesRequestId + 1;
        this.searchFilesRequestId = requestId;
        this.debounceTimer = setTimeout(() => {
          this.triggerFileSearch(searchQuery, requestId);
        }, 150);
      } else {
        this.showFileSuggestions = false;
      }
    } else {
      this.showFileSuggestions = false;
    }
  }

  private async triggerFileSearch(query: string, requestId: number) {
    const files = await searchFiles(query, this.projectPath);
    if (requestId !== this.searchFilesRequestId) return;
    this.fileSuggestions = files;
  }

  private selectFile(file: string) {
    const lastAtIndex = this.value.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const afterAt = this.value.slice(lastAtIndex + 1);
      const hashIndex = afterAt.indexOf('#');
      const lineRange = hashIndex >= 0 ? afterAt.slice(hashIndex) : '';
      this.value = this.value.slice(0, lastAtIndex) + `@${file}${lineRange}`;
    }
    this.showFileSuggestions = false;
    this.fileSuggestions = [];
    this.fileFilter = '';
    if (this.textarea) {
      this.textarea.value = this.value;
      this.textarea.focus();
      const cursorPos = this.value.lastIndexOf('#') >= 0
        ? this.value.lastIndexOf('#')
        : this.value.length;
      this.textarea.setSelectionRange(cursorPos, cursorPos);
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (this.showFileSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedFileIndex = Math.min(this.selectedFileIndex + 1, this.fileSuggestions.length - 1);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedFileIndex = Math.max(this.selectedFileIndex - 1, 0);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (this.fileSuggestions.length > 0) {
          e.preventDefault();
          this.selectFile(this.fileSuggestions[this.selectedFileIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        this.showFileSuggestions = false;
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.onSend();
    }
  }

  private async onSend() {
    const text = this.textarea?.value.trim();
    if (!text) return;

    let messageToSend = text;

    const mentions = parseFileMentions(text);
    if (mentions.length > 0 && this.projectPath) {
      const attachments = await readMentionedFiles(mentions, this.projectPath);
      messageToSend = buildContextMessage(text, attachments);
    }

    dispatchAIEvent(this, 'ai:send-message', {
      message: messageToSend,
      originalText: text,
      attachments: [...this.attachedFiles],
    });

    this.value = '';
    this.showFileSuggestions = false;
    if (this.textarea) {
      this.textarea.value = '';
      this.textarea.style.height = 'auto';
    }
  }

  private onCancel() {
    dispatchAIEvent(this, 'ai:cancel', {});
  }

  render() {
    return html`
      <div class="composer">
        ${this.attachedFiles.length ? html`
          <div class="attachments">
            ${this.attachedFiles.map(f => html`
              <span class="attachment">
                ${f.split('/').pop()}
                <button @click=${() => this.removeFile(f)}>&times;</button>
              </span>
            `)}
          </div>
        ` : ''}
        <div class="input-row">
          <textarea
            placeholder="Ask AI anything... (@ to reference files)"
            @input=${this.onInput}
            @keydown=${this.onKeyDown}
            @cut=${this.onCutPaste}
            @paste=${this.onCutPaste}
            ?disabled=${this.isStreaming}
            rows="1"
          ></textarea>
          ${this.isStreaming
            ? html`<os-button variant="danger" size="sm" @click=${this.onCancel}>Stop</os-button>`
            : html`<os-button variant="primary" size="sm" @click=${this.onSend}>Send</os-button>`}
        </div>
        ${this.showFileSuggestions ? html`
          <div class="file-suggestions">
            ${this.fileSuggestions.length === 0 ? html`
              <div class="file-suggestion-item no-results">No files found</div>
            ` : this.fileSuggestions.map((file, i) => html`
              <div class="file-suggestion-item ${i === this.selectedFileIndex ? 'selected' : ''}"
                   @click=${() => this.selectFile(file)}>
                <iconify-icon class="file-suggestion-icon" icon="mdi:file-document-outline" width="14"></iconify-icon>
                <span class="file-suggestion-name">${file}</span>
              </div>
            `)}
          </div>
        ` : ''}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-composer': AIComposer;
  }
}
