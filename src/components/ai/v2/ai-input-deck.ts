import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { aiState } from '../../../lib/ai/ai-state.js';
import { searchFiles, parseFileMentions, readMentionedFiles, buildContextMessage } from '../ai-file-utils.js';

const INPUT_STYLES = `
  :host { display: block; }
  
  .input-container {
    background: #1a1d21;
    border-top: 1px solid #2b2d31;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
  }
  
  .input-box {
    background: #0d0f12;
    border: 1px solid #2b2d31;
    border-radius: 8px;
    display: flex;
    align-items: flex-end;
    padding: 12px 16px;
    transition: border-color 0.15s ease;
  }
  
  .input-box:focus-within {
    border-color: var(--ai-accent, #60a5fa);
    box-shadow: 0 0 0 1px var(--ai-accent, #60a5fa);
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
    color: #e0e0e0;
    font-size: 14px;
    line-height: 1.5;
    outline: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    resize: none;
    min-height: 24px;
    max-height: 120px;
  }
  
  .input-textarea::placeholder {
    color: #5c6370;
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
    background: #21252b;
    border-color: #3e4451;
    color: #abb2bf;
  }
  .input-btn.interrupt:hover {
    background: #2c313c;
    border-color: #4b5263;
  }
  
  .input-btn.send {
    background: #1a2332;
    border-color: #1a2a4a;
    color: #60a5fa;
  }
  .input-btn.send:hover {
    background: #1e2a3e;
    border-color: #60a5fa;
  }
  
  .input-btn.send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  
  .input-btn.drop {
    background: transparent;
    border-color: transparent;
    color: #5c6370;
  }
  .input-btn.drop:hover {
    color: #abb2bf;
  }
  
  .input-btn-icon {
    font-size: 12px;
  }
  
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #5c6370;
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
    background: #98c379;
    border-radius: 50%;
  }
  
  .status-provider {
    color: #abb2bf;
  }
  
  .status-model {
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #5c6370;
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
    background: #3e4451;
    border-radius: 2px;
    animation: segment-fill 1.2s ease-in-out infinite;
  }

  .loader-segment:nth-child(1) { animation-delay: 0s; }
  .loader-segment:nth-child(2) { animation-delay: 0.15s; }
  .loader-segment:nth-child(3) { animation-delay: 0.3s; }
  .loader-segment:nth-child(4) { animation-delay: 0.45s; }
  .loader-segment:nth-child(5) { animation-delay: 0.6s; }

  @keyframes segment-fill {
    0%, 100% { background: #3e4451; }
    50% { background: #61afef; }
  }

  @media (prefers-reduced-motion: reduce) {
    .loader-segment { animation: none; background: #61afef; }
  }

  .file-suggestions {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 20px;
    right: 20px;
    background: #1a1d21;
    border: 1px solid #2b2d31;
    border-radius: 8px;
    max-height: 200px;
    overflow-y: auto;
    padding: 4px;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
  }

  .file-suggestion-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    color: #abb2bf;
    transition: background 0.1s ease;
  }

  .file-suggestion-item:hover,
  .file-suggestion-item.selected {
    background: #21252b;
    color: #e0e0e0;
  }

  .file-suggestion-item.no-results {
    color: #5c6370;
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
    this._unsub.push(
      aiState.on('model-selected', (m: { name: string; provider: string }) => { this.model = m.name; this.provider = m.provider; }),
      aiState.on('streaming-status', (s: boolean) => { this.streaming = s; }),
      aiState.on('thinking-status', (t: boolean) => { this.thinking = t; }),
      aiState.on('cost-update', (data: { prompt_tokens: number; completion_tokens: number }) => {
        this.tokens = `${(data.prompt_tokens || 0).toLocaleString()} in  ${(data.completion_tokens || 0).toLocaleString()} out`;
      }),
    );
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
                    <span class="input-btn-icon">\u23F8</span>
                    interrupt
                  </button>
                ` : ''}
                <button class="input-btn send" @click=${this.send} ?disabled=${this.streaming || !this.value.trim()}>
                  <span class="input-btn-icon">\u25B6</span>
                </button>
                <button class="input-btn drop" disabled title="Attach file (coming soon)">
                  <span class="input-btn-icon">\u23CF</span>
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
                <span class="file-suggestion-icon">\uD83D\uDCC4</span>
                <span class="file-suggestion-name">${file}</span>
              </div>
            `)}
          </div>
        ` : ''}
        ${(this.streaming || this.thinking) ? html`
          <div class="streaming-indicator">
            <span class="loader-segment"></span>
            <span class="loader-segment"></span>
            <span class="loader-segment"></span>
            <span class="loader-segment"></span>
            <span class="loader-segment"></span>
          </div>
        ` : ''}
        <div class="status-bar">
          <div class="status-left">
            <span class="status-dot"></span>
            <span class="status-provider">${this.provider || 'Ollama'}</span>
            <span class="status-model">${this.model || 'minimax-m3:cloud'}</span>
          </div>
          <div class="status-right">
            <span class="status-tokens">\u2193 ${this.tokens}</span>
          </div>
        </div>
      </div>
    `;
  }
}
