import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { aiState } from '../../../lib/ai/ai-state.js';
import { createTimelineEventHandler } from './ai-timeline-event-handler.js';
import './ai-timeline.js';
import './ai-task-sidebar.js';
import './ai-input-deck.js';
import type { AiTimeline } from './ai-timeline.js';

const PANEL_STYLES = `
  :host { 
    display: flex; 
    flex-direction: column; 
    height: 100%; 
    overflow: hidden; 
    background: var(--ai-panel-background, #ffffff);
    color: var(--ai-text, #1f2937);
  }
  .panel { 
    display: flex; 
    flex-direction: column; 
    height: 100%; 
    background: var(--ai-panel-background, #ffffff); 
    overflow: hidden; 
  }
  
  .hdr { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    padding: 10px 16px; 
    background: var(--ai-tool-header-background, #f3f4f6); 
    border-bottom: 1px solid var(--ai-panel-border, #e5e7eb); 
    flex-shrink: 0; 
  }
  .hdr-left { display: flex; align-items: center; gap: 10px; }
  .hdr-avatar { 
    width: 28px; 
    height: 28px; 
    border-radius: 6px; 
    background: linear-gradient(135deg, var(--ai-primary, #3574f0) 0%, var(--ai-secondary, #5a9cf8) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: white;
    flex-shrink: 0;
  }
  .hdr-label { font-size: 13px; font-weight: 600; color: var(--ai-text, #1f2937); }
  .hdr-dot { width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
  .hdr-dot.on { background: var(--ai-success, #22c55e); box-shadow: 0 0 6px var(--ai-success, #22c55e); }
  .hdr-dot.off { background: var(--ai-error, #ef4444); }
  .hdr-provider { font-size: 12px; color: var(--ai-text-muted, #6b7280); font-weight: 500; }
  
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
    background: color-mix(in srgb, var(--ai-error, #ef4444) 15%, transparent);
    border-color: color-mix(in srgb, var(--ai-error, #ef4444) 30%, transparent);
    color: var(--ai-error, #ef4444);
  }
  .hdr-btn.stop:hover { 
    background: color-mix(in srgb, var(--ai-error, #ef4444) 25%, transparent); 
    border-color: var(--ai-error, #ef4444); 
  }
  .hdr-btn-icon-only {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ai-text-dim, #9ca3af);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .hdr-btn-icon-only:hover {
    background: var(--ai-tool-background, #f9fafb);
    border-color: var(--ai-panel-border, #e5e7eb);
    color: var(--ai-text, #1f2937);
  }
  .hdr-btn-icon { font-size: 12px; }
  
  /* Custom model dropdown */
  .model-dropdown {
    position: relative;
  }
  .model-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--ai-tool-background, #f9fafb);
    border: 1px solid var(--ai-panel-border, #e5e7eb);
    color: var(--ai-text, #1f2937);
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    outline: none;
    max-width: 200px;
  }
  .model-trigger:hover { border-color: var(--ai-primary, #3574f0); }
  .model-trigger:focus { border-color: var(--ai-primary, #3574f0); box-shadow: 0 0 0 1px var(--ai-primary, #3574f0); }
  .model-trigger-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .model-trigger-chevron {
    font-size: 8px;
    color: var(--ai-text-dim, #9ca3af);
    transition: transform 0.15s ease;
    flex-shrink: 0;
  }
  .model-dropdown.open .model-trigger-chevron {
    transform: rotate(180deg);
  }
  .model-dropdown.open .model-trigger {
    border-color: var(--ai-primary, #3574f0);
    box-shadow: 0 0 0 1px var(--ai-primary, #3574f0);
  }
  .model-list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 220px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--ai-panel-background, #ffffff);
    border: 1px solid var(--ai-panel-border, #e5e7eb);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    padding: 4px;
  }
  .model-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: var(--ai-text-muted, #6b7280);
    transition: background 0.1s ease;
  }
  .model-list-item:hover {
    background: var(--ai-tool-background, #f9fafb);
    color: var(--ai-text, #1f2937);
  }
  .model-list-item.selected {
    background: color-mix(in srgb, var(--ai-primary, #3574f0) 10%, transparent);
    color: var(--ai-primary, #3574f0);
  }
  .model-list-item-icon {
    font-size: 10px;
    color: var(--ai-text-dim, #9ca3af);
    flex-shrink: 0;
  }
  .model-list-item.selected .model-list-item-icon {
    color: var(--ai-primary, #3574f0);
  }
  .model-list-empty {
    padding: 12px;
    text-align: center;
    color: var(--ai-text-dim, #9ca3af);
    font-size: 12px;
    font-style: italic;
  }
  
  .body { display: flex; flex: 1; overflow: hidden; }
  .center { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .sidebar { 
    width: 280px; 
    flex-shrink: 0; 
    border-left: 1px solid var(--ai-panel-border, #e5e7eb);
  }
`;

@customElement('ai-panel-v2')
export class AiPanelV2 extends LitElement {
  static styles = unsafeCSS(PANEL_STYLES);

  @property({ type: String }) sessionId = '';
  @property({ type: String }) projectPath = '';

  @query('ai-timeline') timelineEl!: AiTimeline;

  @state() private streaming = false;
  @state() private connected = 'connected';
  @state() private modelId = '';
  @state() private modelName = '';
  @state() private provider = '';
  @state() private models: Array<{ id: string; name: string }> = [];
  @state() private showModelDropdown = false;
  @state() private hasContent = false;

  private _handle: ((e: { type: string; [k: string]: unknown }) => void) | null = null;
  private _resetContext: (() => void) | null = null;
  private _unsub: (() => void)[] = [];
  private _listenUnsub: (() => void) | null = null;

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    // Reset backend agent state on mount to ensure a clean session
    // (prevents stale events from a previous session's running agent)
    await this._resetBackendState();
    this._loadConfig();
    this._loadModels();
    // Ensure a session exists for storing messages
    if (!aiState.activeSessionId) {
      aiState.createSession('AI Conversation');
    }
    this._unsub.push(
      aiState.on('ollama-status', (s: string) => { this.connected = s; }),
      aiState.on('model-selected', (m: { id: string; name: string; provider: string }) => { 
        this.modelId = m.id;
        this.modelName = m.name;
        if (m.provider) this.provider = m.provider;
      }),
      aiState.on('thinking-status', (t: boolean) => { this.streaming = t; if (this.timelineEl) this.timelineEl.setStreaming(t); }),
      aiState.on('streaming-status', (s: boolean) => { this.streaming = s; if (this.timelineEl) this.timelineEl.setStreaming(s); }),
    );
    // Close dropdown on outside click
    document.addEventListener('click', this._handleOutsideClick);
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
    const handlers = createTimelineEventHandler(this.timelineEl);
    this._handle = handlers.handleAgentEvent;
    this._resetContext = handlers.resetContext;
    this._listen();
    this._setupPermissionListeners();
    // Listen for clear events from input deck
    this.addEventListener('ai-clear', () => this.clearAndReset());
    // Listen for timeline content changes
    this.addEventListener('timeline-content-change', ((e: CustomEvent<{ hasContent: boolean }>) => {
      this.hasContent = e.detail.hasContent;
    }) as EventListener);
  }

  disconnectedCallback(): void { 
    super.disconnectedCallback(); 
    this._unsub.forEach(u => u()); 
    this._unsub = []; 
    this._listenUnsub?.();
    this._listenUnsub = null;
    document.removeEventListener('click', this._handleOutsideClick);
  }

  private _handleOutsideClick = (e: MouseEvent) => {
    const path = e.composedPath();
    const dropdown = this.shadowRoot?.querySelector('.model-dropdown');
    if (dropdown && !path.includes(dropdown)) {
      this.showModelDropdown = false;
    }
  };

  private async _loadConfig() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const c = await invoke<{ provider: string; model: string; model_name: string }>('ai_get_config');
      this.provider = c.provider || 'ollama';
      this.modelId = c.model || '';
      this.modelName = c.model_name || '';
      // Emit to other components
      if (this.modelId) {
        aiState.setSelectedModel(this.modelId);
      }
    } catch (e) { console.error('Failed to load AI config:', e); }
  }

  private async _loadModels() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const models = await invoke<Array<{ id: string; name: string }>>('ai_list_models', { providerId: this.provider || 'ollama' });
      this.models = models;
      // Set model name from loaded models if not already set
      if (this.modelId && !this.modelName) {
        const found = models.find(m => m.id === this.modelId);
        this.modelName = found ? found.name : this.modelId;
      } else if (models.length > 0 && !this.modelId) {
        // Select first model if none selected
        this.modelId = models[0].id;
        this.modelName = models[0].name;
        aiState.setSelectedModel(models[0].id);
        await invoke('ai_set_config', { config: { provider: this.provider, base_url: '', api_key: '', model: models[0].id, model_name: models[0].name } });
      }
    } catch (e) { console.error('Failed to load models:', e); }
  }

  private async selectModel(modelId: string) {
    const model = this.models.find(m => m.id === modelId);
    this.modelId = modelId;
    this.modelName = model ? model.name : modelId;
    this.showModelDropdown = false;
    aiState.setSelectedModel(modelId);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ai_set_config', { config: { provider: this.provider, base_url: '', api_key: '', model: modelId, model_name: model ? model.name : modelId } });
    } catch (e) { console.error('Failed to save model:', e); }
  }

  private toggleModelDropdown() {
    this.showModelDropdown = !this.showModelDropdown;
  }

  private async clearAndReset() {
    // Reset backend state first
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ai_reset');
      aiState.setThinking(false);
      aiState.setStreaming(false);
      aiState.setTodos([]);
    } catch (e) {
      console.debug('[AI] Reset backend failed:', e);
    }
    // Clear all timeline content
    this.timelineEl?.clearAll();
    // Clear current session messages and create a new fresh session
    const currentSession = aiState.getActiveSession();
    if (currentSession) {
      aiState.clearSession(currentSession.id);
    }
    aiState.createSession('AI Conversation');
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

    // Clear previous response state to prevent stale content
    this.timelineEl?.clearResponse();
    this._resetContext?.();
    this.timelineEl?.setUserPrompt(e.detail.originalText || msg);

    // Build conversation history from aiState
    // Limit to last 10 messages to prevent context bloat from old conversations
    const session = aiState.getActiveSession();
    const MAX_HISTORY = 10;
    const history = session
      ? session.messages
          .filter((m, i) => (m.role === 'user' || m.role === 'assistant') && i < session.messages.length - 1)
          .filter(m => m.content && m.content.trim().length > 0)
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
        model: this.modelId || 'minimax-m3:cloud',
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
            <iconify-icon class="hdr-avatar" icon="mdi:robot-outline" width="18"></iconify-icon>
            <span class="hdr-label">AI</span>
            <span class="hdr-dot ${this.connected === 'connected' ? 'on' : 'off'}"></span>
            <span class="hdr-provider">${this.provider || 'Ollama'}</span>
            <!-- Custom model dropdown -->
            <div class="model-dropdown ${this.showModelDropdown ? 'open' : ''}">
              <button class="model-trigger" @click=${this.toggleModelDropdown}>
                <span class="model-trigger-text">${this.modelName || 'Select model'}</span>
                <span class="model-trigger-chevron"><iconify-icon icon="mdi:chevron-down" width="14"></iconify-icon></span>
              </button>
              ${this.showModelDropdown ? html`
                <div class="model-list">
                  ${this.models.length === 0 ? html`
                    <div class="model-list-empty">No models available</div>
                  ` : this.models.map(m => html`
                    <div class="model-list-item ${m.id === this.modelId ? 'selected' : ''}"
                         @click=${() => this.selectModel(m.id)}>
                      <span class="model-list-item-icon">${m.id === this.modelId ? html`<iconify-icon icon="mdi:check" width="14"></iconify-icon>` : html`<iconify-icon icon="mdi:circle-outline" width="14"></iconify-icon>`}</span>
                      <span>${m.name}</span>
                    </div>
                  `)}
                </div>
              ` : ''}
            </div>
          </div>
          <div class="hdr-actions">
            ${this.hasContent ? html`
              <button class="hdr-btn-icon-only" @click=${this.clearAndReset} title="Clear conversation and reset context">
                <iconify-icon icon="mdi:delete-outline" width="14"></iconify-icon>
              </button>
            ` : ''}
            ${this.streaming ? html`
              <button class="hdr-btn stop" @click=${this.interrupt}>
                <iconify-icon class="hdr-btn-icon" icon="mdi:stop" width="14"></iconify-icon>
                Stop
              </button>
            ` : ''}
          </div>
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
