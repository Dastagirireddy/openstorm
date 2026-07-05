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
import { aiState } from '../../../lib/ai/ai-state.js';
import { dispatchAIEvent, listenAIEvent } from '../core/ai-events.js';
import './ai-header.js';
import '../chat/ai-message-list.js';
import '../chat/ai-composer.js';
import '../chat/ai-permission-bar.js';
import '../chat/ai-question-card.js';
import '../chat/ai-typing.js';
import '../layout/ai-task-sidebar.js';
import { parseFileMentions, readMentionedFiles, buildContextMessage } from '../ai-file-utils.js';
import { ASCII_LOGO } from '../ai-commands.js';

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
      min-height: 0;
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
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      min-height: 400px;
      text-align: center;
      padding: 40px;
      overflow: hidden;
    }
    .empty-icon {
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 11px;
      line-height: 1.2;
      color: var(--ai-text-dim, #9ca3af);
      white-space: pre;
      margin-bottom: 20px;
      opacity: 0.4;
    }
    .welcome-subtitle {
      font-size: 13px;
      color: var(--ai-text-muted, #6b7280);
      max-width: 320px;
      line-height: 1.5;
    }
    .permission-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10;
    }
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
  @state() private showFileSuggestions = false;
  @state() private fileSuggestions: string[] = [];
  @state() private selectedFileIndex = 0;
  @state() private fileFilter = '';
  private searchFilesRequestId = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _unsubscribes: (() => void)[] = [];
  private _listenUnsub: (() => void) | null = null;
  private _clearHandler = () => this.clearAndReset();

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('ai-clear', this._clearHandler);
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
    this.removeEventListener('ai-clear', this._clearHandler);
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
      const unlisten = await listen('ai:agent-event', (ev: { payload: any }) => {
        this._handleAgentEvent(ev.payload);
      });
      this._listenUnsub = unlisten;

      // Also listen for ai_v2 plan updates
      const unlistenV2 = await listen('ai:plan-update', (ev: { payload: any }) => {
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
      await invoke('ai_approve_tool', { approved });
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
        // Store preview in the matching tool call for diff rendering
        const toolCalls = aiStore.get('activeToolCalls');
        const previewData = event.preview ? JSON.parse(event.preview) : null;
        aiStore.set('activeToolCalls', toolCalls.map(tc =>
          tc.name === event.tool_name && tc.status === 'running'
            ? { ...tc, args: { ...tc.args, _preview: previewData } }
            : tc,
        ));
        // Also add to pending approvals for the permission bar
        const current = aiStore.get('pendingApprovals');
        aiStore.set('pendingApprovals', [...current, {
          toolCallId: `tc-${Date.now()}`,
          toolName: event.tool_name || 'unknown',
          argsSummary: event.preview || '',
          riskLevel: 'medium',
        }]);
        break;
      }
      case 'tool_preview': {
        // Attach structured preview to matching tool call (for file ops diffs)
        // Preview arrives after ToolResult, so status may already be 'completed'
        const toolCalls = aiStore.get('activeToolCalls');
        const previewData = event.preview ? JSON.parse(event.preview) : null;
        if (previewData) {
          aiStore.set('activeToolCalls', toolCalls.map(tc =>
            tc.name === event.tool_name
              ? { ...tc, args: { ...tc.args, _preview: previewData } }
              : tc,
          ));
        }
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
      case 'execution_summary': {
        // Show files modified summary in the chat
        const filesModified = event.files_modified || [];
        if (filesModified.length > 0) {
          const summaryLines = filesModified.map((f: any) => {
            const parts: string[] = [`📄 **${f.path}**`];
            if (f.lines_added > 0 || f.lines_removed > 0) {
              const changes: string[] = [];
              if (f.lines_added > 0) changes.push(`+${f.lines_added}`);
              if (f.lines_removed > 0) changes.push(`-${f.lines_removed}`);
              parts.push(`(${changes.join(', ')})`);
            }
            return parts.join(' ');
          });
          const summaryContent = `**Files modified:**\n${summaryLines.join('\n')}`;
          aiStore.set('messages', [...aiStore.get('messages'), {
            id: `summary-${Date.now()}`,
            role: 'assistant',
            content: summaryContent,
            timestamp: Date.now(),
          }]);
        }
        break;
      }
      case 'error': {
        const errorMsg = event.message || 'Unknown error';
        const current = aiStore.get('messages');
        aiStore.set('messages', [...current, {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${errorMsg}`,
          timestamp: Date.now(),
        }]);
        aiStore.set('isThinking', false);
        aiStore.set('isStreaming', false);
        this.scrollToBottom();
        break;
      }
    }
  }

  private onInput(e: Event) {
    const t = e.target as HTMLTextAreaElement;
    this.inputValue = t.value;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
    this.checkForAtMention(t.value);
  }

  private onCutPaste() {
    requestAnimationFrame(() => {
      const ta = this.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement;
      if (!ta) return;
      this.inputValue = ta.value;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
      this.checkForAtMention(ta.value);
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
    const { searchFiles } = await import('../ai-file-utils.js');
    const files = await searchFiles(query, this.projectPath);
    if (requestId !== this.searchFilesRequestId) return;
    this.fileSuggestions = files;
  }

  private selectFile(file: string) {
    const lastAtIndex = this.inputValue.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const afterAt = this.inputValue.slice(lastAtIndex + 1);
      const hashIndex = afterAt.indexOf('#');
      const lineRange = hashIndex >= 0 ? afterAt.slice(hashIndex) : '';
      this.inputValue = this.inputValue.slice(0, lastAtIndex) + `@${file}${lineRange}`;
    }
    this.showFileSuggestions = false;
    this.fileSuggestions = [];
    this.fileFilter = '';
    const ta = this.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement;
    if (ta) {
      ta.value = this.inputValue;
      ta.focus();
      const cursorPos = this.inputValue.lastIndexOf('#') >= 0
        ? this.inputValue.lastIndexOf('#')
        : this.inputValue.length;
      ta.setSelectionRange(cursorPos, cursorPos);
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  private async send() {
    if (!this.inputValue.trim() || this.state.isStreaming) return;
    const rawMsg = this.inputValue.trim();

    let msg = rawMsg;
    const mentions = parseFileMentions(rawMsg);
    if (mentions.length > 0 && this.projectPath) {
      const attachments = await readMentionedFiles(mentions, this.projectPath);
      msg = buildContextMessage(rawMsg, attachments);
    }

    aiStore.set('streamingMessage', null);
    aiStore.set('isThinking', true);

    const session = aiStore.get('messages');
    aiStore.set('messages', [...session, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: rawMsg,
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
      const errorMsg = String(err).includes('Network')
        ? 'Network error — check your connection and try again.'
        : `Failed to send: ${String(err)}`;
      const current = aiStore.get('messages');
      aiStore.set('messages', [...current, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${errorMsg}`,
        timestamp: Date.now(),
      }]);
      aiStore.set('isThinking', false);
      aiStore.set('isStreaming', false);
      this.scrollToBottom();
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
    aiStore.set('planSteps', []);
    aiStore.set('isThinking', false);
    aiStore.set('isStreaming', false);
    const currentSession = aiState.getActiveSession();
    if (currentSession) {
      aiState.clearSession(currentSession.id);
    }
    aiState.createSession('AI Conversation');
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
            <div class="scroll-area" tabindex="0" ${el => this.scrollContainer = el}>
              ${allMessages.length === 0 ? html`
                <div class="empty-state">
                  <div class="empty-icon">${ASCII_LOGO}</div>
                  <div class="welcome-subtitle">Ask about your code or attach files with @</div>
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

            <div class="input-wrap" style="position:relative;">
              ${this.state.pendingApprovals.length
                ? html`<openstorm-ai-permission-bar class="permission-overlay" .approvals=${this.state.pendingApprovals}></openstorm-ai-permission-bar>`
                : ''}

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
              <div class="input-box">
                <div class="input-area">
                  <textarea
                    class="input-textarea"
                    placeholder="Ask about your code... (@filename to attach)"
                    .value=${this.inputValue}
                    @input=${this.onInput}
                    @keydown=${this.onKey}
                    @cut=${this.onCutPaste}
                    @paste=${this.onCutPaste}
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
