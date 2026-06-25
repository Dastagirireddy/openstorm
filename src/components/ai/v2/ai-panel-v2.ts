import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { aiState } from '../../../lib/ai/ai-state.js';
import { createTimelineEventHandler } from './ai-timeline-event-handler.js';
import './ai-timeline.js';
import './ai-task-sidebar.js';
import './ai-input-deck.js';
import type { AiTimeline } from './ai-timeline.js';

const PANEL_STYLES = `
  :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .panel { display: flex; flex-direction: column; height: 100%; background: #141618; overflow: hidden; }
  
  .hdr { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    padding: 10px 16px; 
    background: #1a1d21; 
    border-bottom: 1px solid #2b2d31; 
    flex-shrink: 0; 
  }
  .hdr-left { display: flex; align-items: center; gap: 10px; }
  .hdr-avatar { 
    width: 28px; 
    height: 28px; 
    border-radius: 6px; 
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: white;
    flex-shrink: 0;
  }
  .hdr-label { font-size: 13px; font-weight: 600; color: #e0e0e0; }
  .hdr-dot { width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
  .hdr-dot.on { background: #98c379; box-shadow: 0 0 6px rgba(152, 195, 121, 0.5); }
  .hdr-dot.off { background: #e06c75; }
  .hdr-provider { font-size: 12px; color: #abb2bf; font-weight: 500; }
  .hdr-model { font-size: 11px; font-family: 'SF Mono', 'Fira Code', monospace; color: #5c6370; background: #21252b; padding: 2px 8px; border-radius: 4px; }
  
  .hdr-actions { display: flex; align-items: center; gap: 8px; }
  .hdr-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid;
  }
  .hdr-btn.stop {
    background: #2c1418;
    border-color: #4c2024;
    color: #e06c75;
  }
  .hdr-btn.stop:hover { background: #3d1a20; border-color: #e06c75; }
  .hdr-btn.restart {
    background: #1a2332;
    border-color: #1a2a4a;
    color: #60a5fa;
  }
  .hdr-btn.restart:hover { background: #1e2a3e; border-color: #60a5fa; }
  .hdr-btn-icon { font-size: 12px; }
  
  .body { display: flex; flex: 1; overflow: hidden; }
  .center { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .sidebar { width: 280px; flex-shrink: 0; }
`;

@customElement('ai-panel-v2')
export class AiPanelV2 extends LitElement {
  static styles = unsafeCSS(PANEL_STYLES);

  @property({ type: String }) sessionId = '';
  @property({ type: String }) projectPath = '';

  @query('ai-timeline') timelineEl!: AiTimeline;

  @state() private streaming = false;
  @state() private connected = 'connected';
  @state() private model = '';
  @state() private provider = '';

  private _handle: ((e: { type: string; [k: string]: unknown }) => void) | null = null;
  private _unsub: (() => void)[] = [];
  private _listenUnsub: (() => void) | null = null;

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    // Reset backend agent state on mount to ensure a clean session
    // (prevents stale events from a previous session's running agent)
    await this._resetBackendState();
    this._loadConfig();
    // Ensure a session exists for storing messages
    if (!aiState.activeSessionId) {
      aiState.createSession('AI Conversation');
    }
    this._unsub.push(
      aiState.on('ollama-status', (s: string) => { this.connected = s; }),
      aiState.on('model-selected', (m: { name: string; provider: string }) => { this.model = m.name; this.provider = m.provider; }),
      aiState.on('thinking-status', (t: boolean) => { this.streaming = t; if (this.timelineEl) this.timelineEl.setStreaming(t); }),
      aiState.on('streaming-status', (s: boolean) => { this.streaming = s; if (this.timelineEl) this.timelineEl.setStreaming(s); }),
    );
  }

  private async _resetBackendState() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ai_reset');
      // Reset frontend state to ensure clean session
      aiState.setThinking(false);
      aiState.setStreaming(false);
      aiState.setTodos([]);
    } catch (e) {
      // ai_reset may fail if no agent is running — that's fine
      console.debug('[AI] Reset on mount:', e);
    }
  }

  firstUpdated() {
    this._handle = createTimelineEventHandler(this.timelineEl);
    this._listen();
    this._setupPermissionListeners();
  }

  disconnectedCallback(): void { 
    super.disconnectedCallback(); 
    this._unsub.forEach(u => u()); 
    this._unsub = []; 
    this._listenUnsub?.();
    this._listenUnsub = null;
  }

  private async _loadConfig() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const c = await invoke<{ provider: string; model: string }>('ai_get_config');
      this.provider = c.provider || 'ollama';
      this.model = c.model || '';
    } catch (e) { console.error('Failed to load AI config:', e); }
  }

  private async _listen() {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('ai-agent-event', (ev: { payload: { type: string; [k: string]: unknown } }) => {
        this._handle?.(ev.payload);
      });
      this._listenUnsub = unlisten;
    } catch (e) { console.error('Failed to setup listener:', e); }
  }

  private _setupPermissionListeners() {
    this.addEventListener('permission-granted', async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('ai_approve_tool', { approved: true });
      } catch (e) { console.error('[AI] Permission approval failed:', e); }
    });
    this.addEventListener('permission-denied', async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('ai_approve_tool', { approved: false });
      } catch (e) { console.error('[AI] Permission denial failed:', e); }
    });
  }

  private async sendMsg(e: CustomEvent<{ message: string; originalText?: string }>) {
    const msg = e.detail.message;
    if (!msg.trim()) return;
    this.timelineEl?.setUserPrompt(e.detail.originalText || msg);

    // Build conversation history from aiState
    // Limit to last 10 messages to prevent context bloat from old conversations
    const session = aiState.getActiveSession();
    const MAX_HISTORY = 10;
    const history = session
      ? session.messages
          .filter((m, i) => (m.role === 'user' || m.role === 'assistant') && i < session.messages.length - 1)
          .slice(-MAX_HISTORY)
          .map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          }))
      : [];

    // Store user message in session history
    const sessionId = aiState.activeSessionId;
    if (sessionId) {
      aiState.addMessage(sessionId, {
        id: `user-${Date.now()}`,
        role: 'user',
        content: msg,
        timestamp: Date.now(),
      });
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ai_chat', {
        providerId: this.provider || 'ollama',
        model: this.model || 'minimax-m3:cloud',
        message: msg,
        projectPath: this.projectPath,
        history,
      });
    } catch (err) {
      console.error('Failed to send:', err);
      this.timelineEl?.setResponseText(`Error: ${err}`);
      this.streaming = false;
      this.timelineEl?.setStreaming(false);
    }
  }

  private async interrupt() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ai_abort');
    } catch (e) {
      console.error('[AI] Abort failed:', e);
    }
    // Reset streaming state immediately for instant UI feedback
    this.streaming = false;
    aiState.setThinking(false);
    aiState.setStreaming(false);
    if (this.timelineEl) {
      this.timelineEl.setStreaming(false);
    }
  }

  private clear() { this.timelineEl?.setUserPrompt(''); this.timelineEl?.setResponseText(''); }

  render() {
    return html`
      <div class="panel">
        <div class="hdr">
          <div class="hdr-left">
            <div class="hdr-avatar">\uD83E\uDD16</div>
            <span class="hdr-label">AI</span>
            <span class="hdr-dot ${this.connected === 'connected' ? 'on' : 'off'}"></span>
            <span class="hdr-provider">${this.provider || 'Ollama'}</span>
            <span class="hdr-model">${this.model || 'minimax-m3:cloud'}</span>
          </div>
          ${this.streaming ? html`
            <div class="hdr-actions">
              <button class="hdr-btn stop" @click=${this.interrupt}>
                <span class="hdr-btn-icon">\u25A0</span>
                Stop
              </button>
              <button class="hdr-btn restart" @click=${this.clear}>
                <span class="hdr-btn-icon">\u21BB</span>
                Restart
              </button>
            </div>
          ` : ''}
        </div>
        <div class="body">
          <div class="center">
            <ai-timeline .sessionId=${this.sessionId} style="flex:1;overflow:hidden;"></ai-timeline>
            <ai-input-deck .sessionId=${this.sessionId} .projectPath=${this.projectPath} @ai-send-message=${this.sendMsg} @ai-interrupt=${this.interrupt}></ai-input-deck>
          </div>
          <div class="sidebar">
            <ai-task-sidebar></ai-task-sidebar>
          </div>
        </div>
      </div>
    `;
  }
}
