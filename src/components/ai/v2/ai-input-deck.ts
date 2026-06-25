import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { aiState } from '../../../lib/ai/ai-state.js';
import { searchFiles, parseFileMentions, readMentionedFiles, buildContextMessage } from '../ai-file-utils.js';

const INPUT_STYLES = `
  :host { display: block; }
  
  .input-container {
    background: var(--ai-tool-header-background, #f3f4f6);
    border-top: 1px solid var(--ai-panel-border, #e5e7eb);
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
  }
  
  .input-box {
    background: var(--ai-input-background, #ffffff);
    border: 1px solid var(--ai-input-border, #d1d5db);
    border-radius: 8px;
    display: flex;
    align-items: flex-end;
    padding: 12px 16px;
    transition: border-color 0.15s ease;
  }
  
  .input-box:focus-within {
    border-color: var(--ai-accent, #3574f0);
    box-shadow: 0 0 0 1px var(--ai-accent, #3574f0);
  }
  
  .input-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .input-textarea {
    width: 100%;
    background: none;
    border: none;
    color: var(--ai-input-text, #1f2937);
    font-size: 14px;
    line-height: 1.5;
    outline: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    resize: none;
    min-height: 24px;
    max-height: 120px;
  }
  
  .input-textarea::placeholder {
    color: var(--ai-input-placeholder, #9ca3af);
  }
  
  .input-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }
  
  .input-btn-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .input-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid;
  }
  
  .input-btn.interrupt {
    background: var(--ai-tool-background, #f9fafb);
    border-color: var(--ai-panel-border, #e5e7eb);
    color: var(--ai-text-muted, #6b7280);
  }
  .input-btn.interrupt:hover {
    background: var(--ai-tool-header-background, #f3f4f6);
    border-color: var(--ai-text-dim, #d1d5db);
  }
  
  .input-btn.send {
    background: color-mix(in srgb, var(--ai-primary, #3574f0) 10%, transparent);
    border-color: color-mix(in srgb, var(--ai-primary, #3574f0) 30%, transparent);
    color: var(--ai-primary, #3574f0);
  }
  .input-btn.send:hover {
    background: color-mix(in srgb, var(--ai-primary, #3574f0) 20%, transparent);
    border-color: var(--ai-primary, #3574f0);
  }
  
  .input-btn.send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  
  .input-btn.drop {
    background: transparent;
    border-color: transparent;
    color: var(--ai-text-dim, #9ca3af);
  }
  .input-btn.drop:hover {
    color: var(--ai-text-muted, #6b7280);
  }
  
  .input-btn-icon {
    font-size: 12px;
  }
  
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--ai-text-dim, #9ca3af);
    padding: 0 4px;
  }
  
  .status-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .status-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: var(--ai-success, #22c55e);
    border-radius: 50%;
  }
  
  .status-provider {
    color: var(--ai-text-muted, #6b7280);
  }
  
  .status-model {
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: var(--ai-text-dim, #9ca3af);
  }
  
  .status-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .status-tokens {
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .streaming-indicator {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 8px;
  }

  .loader-segment {
    width: 16px;
    height: 3px;
    background: var(--ai-panel-border, #e5e7eb);
    border-radius: 2px;
    animation: segment-fill 1.2s ease-in-out infinite;
  }

  .loader-segment:nth-child(1) { animation-delay: 0s; }
  .loader-segment:nth-child(2) { animation-delay: 0.15s; }
  .loader-segment:nth-child(3) { animation-delay: 0.3s; }
  .loader-segment:nth-child(4) { animation-delay: 0.45s; }
  .loader-segment:nth-child(5) { animation-delay: 0.6s; }

  @keyframes segment-fill {
    0%, 100% { background: var(--ai-panel-border, #e5e7eb); }
    50% { background: var(--ai-primary, #3574f0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .loader-segment { animation: none; background: var(--ai-primary, #3574f0); }
  }

  .file-suggestions {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 20px;
    right: 20px;
    background: var(--ai-panel-background, #ffffff);
    border: 1px solid var(--ai-panel-border, #e5e7eb);
    border-radius: 8px;
    max-height: 200px;
    overflow-y: auto;
    padding: 4px;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  }

  .file-suggestion-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    color: var(--ai-text-muted, #6b7280);
    transition: background 0.1s ease;
  }

  .file-suggestion-item:hover,
  .file-suggestion-item.selected {
    background: var(--ai-tool-background, #f9fafb);
    color: var(--ai-text, #1f2937);
  }

  .file-suggestion-item.no-results {
    color: var(--ai-text-dim, #9ca3af);
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

@customElement('ai-input-deck')
export class AiInputDeck extends LitElement {
  static styles = unsafeCSS(INPUT_STYLES);

  @property({ type: String }) sessionId = '';
  @property({ type: String }) projectPath = '';
  @state() private value = '';
  @state() private streaming = false;
  @state() private thinking = false;
  @state() private model = '';
  @state() private provider = '';
  @state() private tokens = '0 in  0 out';
  @state() private showFileSuggestions = false;
  @state() private fileSuggestions: string[] = [];
  @state() private selectedFileIndex = 0;
  @state() private fileFilter = '';
  private searchFilesRequestId = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  @query('textarea') private ta!: HTMLTextAreaElement;

  private _unsub: (() => void)[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    // Initialize from backend config directly
    this._loadFromConfig();
    this._unsub.push(
      aiState.on('model-selected', (m: { id: string; name: string; provider: string }) => { 
        this.model = m.name; 
        this.provider = m.provider; 
      }),
      aiState.on('streaming-status', (s: boolean) => { this.streaming = s; }),
      aiState.on('thinking-status', (t: boolean) => { this.thinking = t; }),
      aiState.on('cost-update', (data: { prompt_tokens: number; completion_tokens: number }) => {
        this.tokens = `${(data.prompt_tokens || 0).toLocaleString()} in  ${(data.completion_tokens || 0).toLocaleString()} out`;
      }),
    );
  }

  private async _loadFromConfig() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const c = await invoke<{ provider: string; model: string; model_name: string }>('ai_get_config');
      this.provider = c.provider || 'Ollama';
      this.model = c.model_name || c.model || '';
    } catch (e) { console.debug('Failed to load AI config for input deck:', e); }
  }

  disconnectedCallback(): void { super.disconnectedCallback(); this._unsub.forEach(u => u()); this._unsub = []; }

  private onInput(e: Event) {
    const t = e.target as HTMLTextAreaElement;
    this.value = t.value;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
    this.checkForAtMention(t.value);
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
    if (this.ta) {
      this.ta.value = this.value;
      this.ta.focus();
      const cursorPos = this.value.lastIndexOf('#') >= 0
        ? this.value.lastIndexOf('#')
        : this.value.length;
      this.ta.setSelectionRange(cursorPos, cursorPos);
    }
  }

  private onKey(e: KeyboardEvent) {
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

    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  private async send() {
    if (!this.value.trim() || this.streaming) return;
    const text = this.value.trim();

    // Handle commands
    if (text.startsWith('/')) {
      this.handleCommand(text);
      return;
    }

    const mentions = parseFileMentions(text);
    let messageToSend = text;
    if (mentions.length > 0 && this.projectPath) {
      const attachments = await readMentionedFiles(mentions, this.projectPath);
      messageToSend = buildContextMessage(text, attachments);
    }

    this.dispatchEvent(new CustomEvent('ai-send-message', { detail: { message: messageToSend, originalText: text, sessionId: this.sessionId }, bubbles: true, composed: true }));
    this.value = '';
    if (this.ta) this.ta.style.height = 'auto';
  }

  private handleCommand(text: string) {
    const cmd = text.split(/\s+/)[0].toLowerCase();
    
    switch (cmd) {
      case '/clear':
      case '/reset':
        // Dispatch clear event to parent panel
        this.dispatchEvent(new CustomEvent('ai-clear', { bubbles: true, composed: true }));
        break;
      case '/help':
        // Show help message
        this.dispatchEvent(new CustomEvent('ai-send-message', { 
          detail: { 
            message: 'Available commands:\n/clear - Clear conversation and reset context\n/reset - Same as /clear\n/help - Show this help', 
            originalText: text, 
            sessionId: this.sessionId 
          }, 
          bubbles: true, 
          composed: true 
        }));
        break;
      default:
        // Unknown command - send as regular message
        this.dispatchEvent(new CustomEvent('ai-send-message', { 
          detail: { 
            message: text, 
            originalText: text, 
            sessionId: this.sessionId 
          }, 
          bubbles: true, 
          composed: true 
        }));
        break;
    }
    this.value = '';
    if (this.ta) this.ta.style.height = 'auto';
  }

  private interrupt() {
    this.dispatchEvent(new CustomEvent('ai-interrupt', { detail: { sessionId: this.sessionId }, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="input-container">
        <div class="input-box">
          <div class="input-area">
            <textarea 
              class="input-textarea" 
              placeholder="Ask about your code... (@filename to attach)" 
              .value=${this.value} 
              @input=${this.onInput} 
              @keydown=${this.onKey} 
              rows="1"
            ></textarea>
            <div class="input-actions">
              <div class="input-btn-group">
                ${this.streaming ? html`
                  <button class="input-btn interrupt" @click=${this.interrupt}>
                    <iconify-icon class="input-btn-icon" icon="mdi:pause" width="14"></iconify-icon>
                    interrupt
                  </button>
                ` : ''}
                <button class="input-btn send" @click=${this.send} ?disabled=${this.streaming || !this.value.trim()}>
                  <iconify-icon class="input-btn-icon" icon="mdi:send" width="14"></iconify-icon>
                </button>
                <button class="input-btn drop" disabled title="Attach file (coming soon)">
                  <iconify-icon class="input-btn-icon" icon="mdi:paperclip" width="14"></iconify-icon>
                </button>
              </div>
            </div>
          </div>
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
        <div class="status-bar">
          <div class="status-left">
            <span class="status-dot"></span>
            <span class="status-provider">${this.provider || 'Ollama'}</span>
            <span class="status-model">${this.model || 'No model selected'}</span>
            ${(this.streaming || this.thinking) ? html`
              <div class="streaming-indicator">
                <span class="loader-segment"></span>
                <span class="loader-segment"></span>
                <span class="loader-segment"></span>
                <span class="loader-segment"></span>
                <span class="loader-segment"></span>
              </div>
            ` : ''}
          </div>
          <div class="status-right">
            <span class="status-tokens"><iconify-icon icon="mdi:arrow-down" width="12"></iconify-icon> ${this.tokens}</span>
          </div>
        </div>
      </div>
    `;
  }
}
