import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  AIState,
  AIMessage,
  ToolApproval,
  Question,
  SubAgent,
} from '../core/ai-state.js';
import { createDefaultState, aiStore } from '../core/ai-state.js';
import { dispatchAIEvent, listenAIEvent } from '../core/ai-events.js';
import '../ai/ai-header.js';
import '../ai/ai-message-list.js';
import '../ai/ai-composer.js';
import '../ai/ai-permission-bar.js';
import '../ai/ai-question-card.js';
import '../ai/ai-typing.js';
import '../layout/ai-task-sidebar.js';

@customElement('openstorm-ai-panel')
export class AIPanel extends LitElement {
  static styles = css`
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
      overflow: hidden;
    }
    .body {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .center {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .header-text {
      font-size: 14px;
      font-weight: 600;
      color: var(--ai-text, #1f2937);
      line-height: 1.6;
      margin-bottom: 8px;
      padding: 12px 16px;
      background: linear-gradient(135deg, color-mix(in srgb, var(--ai-primary, #3574f0) 6%, transparent) 0%, color-mix(in srgb, var(--ai-secondary, #5a9cf8) 4%, transparent) 100%);
      border-left: 3px solid var(--ai-primary, #3574f0);
      border-radius: 0 8px 8px 0;
      user-select: text;
    }
    .scroll-area {
      flex: 1;
      overflow-y: auto;
      padding: 24px 32px;
      display: flex;
      flex-direction: column;
      gap: 0;
      user-select: text;
    }
    .scroll-area::-webkit-scrollbar { width: 6px; }
    .scroll-area::-webkit-scrollbar-track { background: transparent; }
    .scroll-area::-webkit-scrollbar-thumb { background: var(--ai-text-dim, #d1d5db); border-radius: 3px; }
    .sidebar-wrap {
      width: 280px;
      flex-shrink: 0;
      border-left: 1px solid var(--ai-panel-border, #e5e7eb);
    }
    .input-wrap {
      border-top: 1px solid var(--ai-panel-border, #e5e7eb);
      background: var(--ai-tool-header-background, #f3f4f6);
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
      50% { background: var(--ai-orange, #f97316); }
    }
    @media (prefers-reduced-motion: reduce) {
      .loader-segment { animation: none; background: var(--ai-orange, #f97316); }
    }
  `;

  @property({ type: String }) projectPath = '';

  @state() private state: AIState = createDefaultState();
  @state() private inputValue = '';
  @state() private provider = '';
  @state() private model = '';
  @state() private tokens = '0 in  0 out';
  private _unsubscribes: (() => void)[] = [];
  private _listenUnsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._unsubscribes.push(
      aiStore.subscribe('messages', (msgs) => {
        this.state = { ...this.state, messages: msgs };
      }),
      aiStore.subscribe('streamingMessage', (msg) => {
        this.state = { ...this.state, streamingMessage: msg };
      }),
      aiStore.subscribe('isStreaming', (val) => {
        this.state = { ...this.state, isStreaming: val };
      }),
      aiStore.subscribe('isThinking', (val) => {
        this.state = { ...this.state, isThinking: val };
      }),
      aiStore.subscribe('currentModel', (val) => {
        this.state = { ...this.state, currentModel: val };
      }),
      aiStore.subscribe('pendingApprovals', (val) => {
        this.state = { ...this.state, pendingApprovals: val };
      }),
      aiStore.subscribe('pendingQuestions', (val) => {
        this.state = { ...this.state, pendingQuestions: val };
      }),
      aiStore.subscribe('subAgents', (val) => {
        this.state = { ...this.state, subAgents: val };
      }),
      aiStore.subscribe('totalTokens', (val) => {
        this.state = { ...this.state, totalTokens: val };
      }),
      aiStore.subscribe('totalCost', (val) => {
        this.state = { ...this.state, totalCost: val };
      }),
      aiStore.subscribe('lastLatencyMs', (val) => {
        this.state = { ...this.state, lastLatencyMs: val };
      }),
      aiStore.subscribe('attachedFiles', (val) => {
        this.state = { ...this.state, attachedFiles: val };
      }),
      aiStore.subscribe('planSteps', (val) => {
        this.state = { ...this.state, planSteps: val };
      }),
    );
    this._loadConfig();
    this._listenToBackend();
    this._listenForPermissionEvents();
    this._resetSession();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribes.forEach(u => u());
    this._unsubscribes = [];
    this._listenUnsub?.();
    this._listenUnsub = null;
  }

  private async _loadConfig() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const c = await invoke<{ provider: string; model: string; model_name: string; api_key: string; provider_keys: Record<string, string> }>('ai_get_config');
      this.provider = c.provider;
      this.model = c.model_name || c.model;
      aiStore.set('currentModel', c.model_name || c.model);
    } catch (e) {
      console.debug('Failed to load AI config:', e);
    }
  }

  private async _resetSession() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ai_reset');
    } catch (e) {
      // ai_reset may fail if no agent is running — that's fine
    }
    aiStore.set('messages', []);
    aiStore.set('streamingMessage', null);
    aiStore.set('pendingApprovals', []);
    aiStore.set('pendingQuestions', []);
    aiStore.set('activeToolCalls', []);
    aiStore.set('subAgents', []);
    aiStore.set('planSteps', []);
    aiStore.set('isThinking', false);
    aiStore.set('isStreaming', false);
  }

  private async _listenToBackend() {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('ai-agent-event', (ev: { payload: any }) => {
        this._handleAgentEvent(ev.payload);
      });
      this._listenUnsub = unlisten;

      // Also listen for ai_v2 plan updates
      const unlistenV2 = await listen('ai-v2:plan-update', (ev: { payload: any }) => {
        aiStore.set('planSteps', ev.payload?.steps || []);
      });
      this._unsubscribes.push(unlistenV2);
    } catch (e) {
      console.error('[AI Panel] Failed to setup listener:', e);
    }
  }

  private _listenForPermissionEvents() {
    this.addEventListener('ai:approve-tool' as any, ((e: CustomEvent) => {
      const { toolCallId, approved } = e.detail;
      this._handleToolApproval(toolCallId, approved);
    }) as EventListener);
  }

  private async _handleToolApproval(toolCallId: string, approved: boolean) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ai_approve_tool', { toolCallId, approved });
      // Remove from pending approvals
      const current = aiStore.get('pendingApprovals');
      aiStore.set('pendingApprovals', current.filter(a => a.toolCallId !== toolCallId));
    } catch (e) {
      console.error('[AI Panel] Failed to approve tool:', e);
    }
  }

  private _handleAgentEvent(event: any) {
    switch (event.type) {
      case 'thinking':
        aiStore.set('isThinking', true);
        break;
      case 'text_delta': {
        aiStore.set('isThinking', false);
        aiStore.set('isStreaming', true);
        const current = aiStore.get('streamingMessage');
        if (current) {
          aiStore.set('streamingMessage', {
            ...current,
            content: current.content + (event.content || ''),
          });
        } else {
          aiStore.set('streamingMessage', {
            id: `stream-${Date.now()}`,
            role: 'assistant',
            content: event.content || '',
            timestamp: Date.now(),
            streaming: true,
          });
        }
        this.scrollToBottom();
        break;
      }
      case 'response': {
        const streamingMsg = aiStore.get('streamingMessage');
        const finalContent = event.content || streamingMsg?.content || '';
        if (finalContent) {
          aiStore.set('messages', [...aiStore.get('messages'), {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: finalContent,
            timestamp: Date.now(),
            streaming: false,
          }]);
        }
        aiStore.set('streamingMessage', null);
        aiStore.set('isThinking', false);
        aiStore.set('isStreaming', false);
        break;
      }
      case 'tool_use': {
        const current = aiStore.get('activeToolCalls');
        aiStore.set('activeToolCalls', [...current, {
          id: `tc-${Date.now()}`,
          name: event.tool_name || 'unknown',
          args: typeof event.arguments === 'string' ? JSON.parse(event.arguments || '{}') : (event.arguments || {}),
          status: 'running',
        }]);
        break;
      }
      case 'tool_result': {
        const current = aiStore.get('activeToolCalls');
        aiStore.set('activeToolCalls', current.map(tc =>
          tc.name === event.tool_name && tc.status === 'running'
            ? { ...tc, status: (event.result?.startsWith?.('Error') ? 'failed' : 'completed') as any }
            : tc,
        ));
        break;
      }
      case 'tool_approval_required': {
        const current = aiStore.get('pendingApprovals');
        aiStore.set('pendingApprovals', [...current, {
          toolCallId: `tc-${Date.now()}`,
          toolName: event.tool_name || 'unknown',
          argsSummary: event.preview || '',
          riskLevel: 'medium',
        }]);
        break;
      }
      case 'question-request': {
        const current = aiStore.get('pendingQuestions');
        aiStore.set('pendingQuestions', [...current, ...(event.questions || [])]);
        break;
      }
      case 'todo_update': {
        // Todo updates are for internal tracking, plan_steps are used for sidebar display
        break;
      }
      case 'plan_update': {
        aiStore.set('planSteps', event.steps || []);
        break;
      }
      case 'error': {
        aiStore.set('isThinking', false);
        aiStore.set('isStreaming', false);
        break;
      }
    }
  }

  private onInput(e: Event) {
    const t = e.target as HTMLTextAreaElement;
    this.inputValue = t.value;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  private async send() {
    if (!this.inputValue.trim() || this.state.isStreaming) return;
    const msg = this.inputValue.trim();

    aiStore.set('streamingMessage', null);
    aiStore.set('isThinking', true);

    const session = aiStore.get('messages');
    aiStore.set('messages', [...session, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    }]);

    this.scrollToBottom();
    this.inputValue = '';
    const ta = this.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement;
    if (ta) ta.style.height = 'auto';

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const history = session
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .filter(m => m.content && m.content.trim().length > 0)
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      await invoke('ai_chat', {
        providerId: this.provider,
        model: this.state.currentModel || 'minimax-m3:cloud',
        message: msg,
        projectPath: this.projectPath,
        history,
        apiKey: null,
        baseUrl: null,
      });
    } catch (err) {
      console.error('[AI Panel] Send failed:', err);
      aiStore.set('isThinking', false);
      aiStore.set('isStreaming', false);
    }
  }

  private async abort() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ai_abort');
    } catch (e) {
      console.error('[AI Panel] Abort failed:', e);
    }
    aiStore.set('isThinking', false);
    aiStore.set('isStreaming', false);
  }

  private _getCurrentStepDescription(): string {
    const planSteps = this.state.planSteps;
    const inProgress = planSteps.find(s => s.status === 'in_progress');
    return inProgress?.description || '';
  }

  private _getCurrentStepNumber(): number {
    const planSteps = this.state.planSteps;
    const inProgress = planSteps.find(s => s.status === 'in_progress');
    return inProgress?.step || 0;
  }

  private async clearAndReset() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ai_reset');
    } catch (e) {
      console.debug('[AI Panel] Reset failed:', e);
    }
    aiStore.set('messages', []);
    aiStore.set('streamingMessage', null);
    aiStore.set('pendingApprovals', []);
    aiStore.set('pendingQuestions', []);
    aiStore.set('activeToolCalls', []);
    aiStore.set('subAgents', []);
    aiStore.set('isThinking', false);
    aiStore.set('isStreaming', false);
  }

  private scrollContainer: HTMLElement | null = null;

  updated() {
    this.scrollToBottom();
  }

  private scrollToBottom() {
    if (this.scrollContainer) {
      requestAnimationFrame(() => {
        const { scrollHeight, clientHeight } = this.scrollContainer!;
        const isNearBottom = scrollHeight - clientHeight - this.scrollContainer!.scrollTop < 300;
        if (isNearBottom) {
          this.scrollContainer!.scrollTop = scrollHeight;
        }
      });
    }
  }

  render() {
    const allMessages = this.state.streamingMessage
      ? [...this.state.messages, this.state.streamingMessage]
      : this.state.messages;

    // Show all messages in the message list (user + assistant)
    const displayMessages = allMessages;

    return html`
      <div class="panel">
        <openstorm-ai-header
          .model=${this.state.currentModel}
          .isStreaming=${this.state.isStreaming}
          .isConnected=${true}
          .hasContent=${allMessages.length > 0}
          .projectPath=${this.projectPath}
        ></openstorm-ai-header>

        <div class="body">
          <div class="center">
            <div class="scroll-area" ${el => this.scrollContainer = el}>
              ${allMessages.length === 0 ? html`
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:400px;text-align:center;padding:40px;">
                  <div style="font-size:13px;color:var(--ai-text-muted,#6b7280);max-width:320px;line-height:1.5;">
                    Start a conversation with AI. Ask about your codebase, generate code, or get explanations.
                  </div>
                </div>
              ` : html`
                <openstorm-ai-message-list
                  .messages=${displayMessages}
                  .streamingMessage=${null}
                ></openstorm-ai-message-list>
                ${this.state.isThinking ? html`
                  <openstorm-ai-typing
                    .stepDescription=${this._getCurrentStepDescription()}
                    .stepNumber=${this._getCurrentStepNumber()}
                  ></openstorm-ai-typing>
                ` : ''}
              `}
            </div>

            ${this.state.pendingQuestions.length
              ? html`<openstorm-ai-question-card .questions=${this.state.pendingQuestions}></openstorm-ai-question-card>`
              : ''}

            ${this.state.pendingApprovals.length
              ? html`<openstorm-ai-permission-bar .approvals=${this.state.pendingApprovals}></openstorm-ai-permission-bar>`
              : ''}

            <div class="input-wrap">
              <div class="input-box">
                <div class="input-area">
                  <textarea
                    class="input-textarea"
                    placeholder="Ask about your code... (@filename to attach)"
                    .value=${this.inputValue}
                    @input=${this.onInput}
                    @keydown=${this.onKey}
                    rows="1"
                  ></textarea>
                  <div class="input-actions">
                    <div class="input-btn-group">
                      ${this.state.isStreaming ? html`
                        <button class="input-btn interrupt" @click=${this.abort}>
                          <iconify-icon class="input-btn-icon" icon="mdi:pause" width="14"></iconify-icon>
                          interrupt
                        </button>
                      ` : ''}
                      <button class="input-btn send" @click=${this.send} ?disabled=${this.state.isStreaming || !this.inputValue.trim()}>
                        <iconify-icon class="input-btn-icon" icon="mdi:send" width="14"></iconify-icon>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="status-bar">
                <div class="status-left">
                  <span class="status-dot"></span>
                  <span class="status-provider">${this.provider}</span>
                  <span class="status-model">${this.model || 'No model selected'}</span>
                  ${(this.state.isStreaming || this.state.isThinking) ? html`
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
                  <span class="status-tokens">
                    <iconify-icon icon="mdi:arrow-down" width="12"></iconify-icon>
                    ${this.state.totalTokens || 0} tokens
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="sidebar-wrap">
            <openstorm-ai-task-sidebar
              .subAgents=${this.state.subAgents}
              .planSteps=${this.state.planSteps}
            ></openstorm-ai-task-sidebar>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-panel': AIPanel;
  }
}
