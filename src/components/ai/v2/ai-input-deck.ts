import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { aiState } from '../../../lib/ai/ai-state.js';

const INPUT_STYLES = `
  :host { display: block; }
  
  .input-container {
    background: #1a1d21;
    border-top: 1px solid #2b2d31;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
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
`;

@customElement('ai-input-deck')
export class AiInputDeck extends LitElement {
  static styles = unsafeCSS(INPUT_STYLES);

  @property({ type: String }) sessionId = '';
  @state() private value = '';
  @state() private streaming = false;
  @state() private thinking = false;
  @state() private model = '';
  @state() private provider = '';
  @state() private tokens = '0 in  0 out';

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
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }

  private send() {
    if (!this.value.trim() || this.streaming) return;
    this.dispatchEvent(new CustomEvent('ai-send-message', { detail: { message: this.value, sessionId: this.sessionId }, bubbles: true, composed: true }));
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
