import { html } from 'lit';
import type { ChatMessage, ModelInfo, ProviderInfo, AISession } from '../../lib/types/ai-types.js';
import { renderMessage } from './ai-message-renderers.js';
import { ASCII_LOGO, AI_TIPS, formatTokenCount } from './ai-commands.js';
import '../layout/icon.js';
import '../layout/code-block.js';
import '../layout/mermaid-block.js';

export interface PanelRenderState {
  sessions: AISession[];
  activeSessionId: string | null;
  inputText: string;
  models: ModelInfo[];
  selectedModel: string;
  currentProvider: string;
  providers: ProviderInfo[];
  providerConnected: boolean;
  providerLoading: boolean;
  isThinking: boolean;
  isStreaming: boolean;
  isDragging: boolean;
  showCommands: boolean;
  commandFilter: string;
  selectedCommandIndex: number;
  currentTipIndex: number;
  showFileSuggestions: boolean;
  fileSuggestions: string[];
  selectedFileIndex: number;
  sessionStats: { tokens: { input: number; output: number }; cost: number };
  lastResponseTime: number;
  lastUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

export interface PanelRenderActions {
  clearSession: () => void;
  handleDragEnter: (e: DragEvent) => void;
  handleDragLeave: (e: DragEvent) => void;
  handleDragOver: (e: DragEvent) => void;
  handleDrop: (e: DragEvent) => void;
  selectCommand: (cmd: { name: string; description: string }) => void;
  selectFile: (file: string) => void;
  handleInput: (e: Event) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  updateCustomCaret: () => void;
  abortRequest: () => void;
  switchProvider: (providerId: string) => void;
  selectModel: (modelId: string) => void;
  handleToolApproval: (approved: boolean) => void;
  getFilteredCommands: () => { name: string; description: string; icon: string }[];
}

export function renderPanel(
  s: PanelRenderState,
  a: PanelRenderActions
) {
  const messages = s.activeSessionId
    ? (s.sessions.find(ss => ss.id === s.activeSessionId)?.messages || [])
    : [];

  return html`
    <div style="display: flex; flex-direction: column; height: 100%; background: rgba(13, 17, 23, 0.5);">

      <!-- Header -->
      <div style="display: flex; align-items: center; gap: 0.8em; padding: 0.5em 0.8em; border-bottom: 1px solid var(--ai-panel-border); background: var(--ai-panel-background);">
        <span style="font-weight: 500;">AI</span>
        <span style="color: var(--ai-text-dim);">·</span>
        <span class="ai-status-item">
          <span class="ai-status-dot ${s.providerLoading ? '' : s.providerConnected ? 'connected' : 'disconnected'}" style="${s.providerLoading ? 'background: var(--ai-warning); animation: pulse 1.5s infinite;' : ''}"></span>
          <span>${s.providerLoading ? 'Connecting...' : s.providerConnected ? (s.currentProvider === 'lmstudio' ? 'LM Studio' : 'Ollama') : 'Disconnected'}</span>
        </span>
        <div style="flex: 1;"></div>
        <button class="ai-icon-btn" @click=${a.clearSession} title="Clear chat (Ctrl+Shift+X)">
          <iconify-icon icon="lucide:trash-2" width="14"></iconify-icon>
        </button>
      </div>

      <!-- Body: Chat+Input | Todo -->
      <div style="display: flex; flex: 1; overflow: hidden;">

        <!-- Chat + Input Column -->
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: hidden;">

          <!-- Messages area -->
          <div id="chat-scroll" style="flex: 1; overflow-y: auto; padding: 0.8em 1em;">
            ${s.isThinking ? html`
              <div class="ai-floating-thinking">
                <span class="thinking-spinner"></span>
                <span class="thinking-label">Model is thinking...</span>
              </div>
            ` : ''}
            ${messages.length === 0 ? html`
              <div class="ai-empty-state">
                <div class="ai-empty-logo">${ASCII_LOGO}</div>
                <div class="ai-empty-input-preview">
                  Ask anything... "Fix a TODO in the codebase"
                </div>
                <div class="ai-empty-model-info">
                  <span class="ai-empty-model-dot ${s.providerConnected ? '' : 'disconnected'}"></span>
                  <span>${s.selectedModel || 'No model'}</span>
                  <span>·</span>
                  <span>${s.providerConnected ? `${s.models.length} model${s.models.length !== 1 ? 's' : ''} ready` : 'Disconnected'}</span>
                </div>
                <div class="ai-empty-shortcuts">
                  <span>tab agents</span>
                  <span>ctrl+p commands</span>
                </div>
                <div class="ai-empty-tip">
                  <span class="ai-empty-tip-dot">●</span>
                  <span>Tip ${AI_TIPS[s.currentTipIndex]}</span>
                </div>
              </div>
            ` : html`
              ${messages.map(msg => html`
                <div>${renderMessage(msg, {
                  selectedModel: s.selectedModel,
                  lastResponseTime: s.lastResponseTime,
                  lastUsage: s.lastUsage,
                  sessionStats: s.sessionStats,
                  handleToolApproval: a.handleToolApproval,
                })}</div>
              `)}
              ${s.isThinking ? html`
                <div class="ai-msg-thinking">
                  <span class="thinking-spinner"></span>
                  <span class="thinking-label">Thinking...</span>
                </div>
              ` : ''}
            `}
          </div>

          <!-- Input area -->
          <div class="ai-input-area">
            <div class="ai-input-container ${s.isDragging ? 'dragging' : ''}"
                 @dragenter=${a.handleDragEnter}
                 @dragleave=${a.handleDragLeave}
                 @dragover=${a.handleDragOver}
                 @drop=${a.handleDrop}>

              ${s.isDragging ? html`<div class="ai-drop-overlay">Drop files here</div>` : ''}

              ${s.showCommands ? html`
                <div class="ai-command-menu">
                  ${a.getFilteredCommands().map((cmd, i) => html`
                    <div class="ai-command-item ${i === s.selectedCommandIndex ? 'selected' : ''}"
                         @click=${() => a.selectCommand(cmd)}>
                      <span class="ai-command-item-icon"><os-icon name="${cmd.icon}" size="14"></os-icon></span>
                      <span class="ai-command-item-name">${cmd.name}</span>
                      <span class="ai-command-item-desc">${cmd.description}</span>
                    </div>
                  `)}
                </div>
              ` : ''}

              ${s.showFileSuggestions ? html`
                <div class="ai-command-menu">
                  ${s.fileSuggestions.length === 0 ? html`
                    <div class="ai-command-item">
                      <span class="ai-command-item-name">No files found</span>
                    </div>
                  ` : s.fileSuggestions.map((file, i) => html`
                    <div class="ai-command-item ${i === s.selectedFileIndex ? 'selected' : ''}"
                         @click=${() => a.selectFile(file)}>
                      <span class="ai-command-item-icon"><os-icon name="file" size="14"></os-icon></span>
                      <span class="ai-command-item-name">${file}</span>
                    </div>
                  `)}
                </div>
              ` : ''}

              <div class="ai-prompt-frame">
                <div class="ai-prompt-content">
                  <div class="ai-prompt-border-left"></div>
                  <div class="ai-prompt-body">
                    <div class="ai-prompt-input-row" style="position: relative;">
                      <textarea
                        id="chat-input"
                        class="ai-prompt-textarea"
                        placeholder="Ask about your code... (@filename to attach)"
                        .disabled=${!s.providerConnected || s.isThinking}
                        .value=${s.inputText}
                        @input=${a.handleInput}
                        @keydown=${a.handleKeyDown}
                        @click=${a.updateCustomCaret}
                        @keyup=${a.updateCustomCaret}
                        @focus=${a.updateCustomCaret}
                        autocomplete="off"
                      ></textarea>
                      <div id="custom-caret" class="ai-custom-caret"></div>
                      <div class="ai-prompt-actions">
                        ${s.isThinking ? html`
                          <button class="ai-prompt-icon-btn" title="Stop generation" @click=${a.abortRequest} style="color: var(--ai-error);">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="6" width="12" height="12" rx="2"/>
                            </svg>
                          </button>
                        ` : ''}
                      </div>
                    </div>

                    <div class="ai-prompt-stats-bar">
                      <div class="ai-prompt-border-left"></div>
                      <div class="ai-prompt-model">
                        <span class="ai-prompt-model-dot" style="background: ${s.providerLoading ? 'var(--ai-warning)' : s.providerConnected ? 'var(--ai-success)' : 'var(--ai-error)'}; ${s.providerLoading ? 'animation: pulse 1.5s infinite;' : ''}"></span>
                        <select class="ai-model-bare" .value=${s.currentProvider}
                                .disabled=${s.providerLoading}
                                @change=${(e: Event) => a.switchProvider((e.target as HTMLSelectElement).value)}>
                          ${s.providers.map(p => html`<option value="${p.id}">${p.name}</option>`)}
                        </select>
                      </div>
                      <div class="ai-prompt-model">
                        <select class="ai-model-bare" .value=${s.selectedModel}
                                @change=${(e: Event) => a.selectModel((e.target as HTMLSelectElement).value)}>
                          ${s.models.length === 0
                            ? html`<option value="">No models</option>`
                            : s.models.map(m => html`<option value="${m.id}">${m.name}</option>`)
                          }
                        </select>
                      </div>
                      <div class="ai-prompt-stats">
                        <span class="ai-prompt-stat">
                          <iconify-icon icon="lucide:arrow-down-to-line" width="12"></iconify-icon>
                          ${formatTokenCount(s.sessionStats.tokens.input)} in
                        </span>
                        <span class="ai-prompt-stat">
                          <iconify-icon icon="lucide:arrow-up-from-line" width="12"></iconify-icon>
                          ${formatTokenCount(s.sessionStats.tokens.output)} out
                        </span>
                        ${s.sessionStats.cost > 0 ? html`
                          <span class="ai-prompt-stat cost">
                            $${s.sessionStats.cost.toFixed(4)}
                          </span>
                        ` : ''}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="ai-prompt-hints">
                  <span class="ai-prompt-hint"><kbd>esc</kbd> interrupt</span>
                  ${(s.isThinking || s.isStreaming) ? html`
                    <span class="ai-streaming-indicator">
                      <span class="ai-loader-segment"></span>
                      <span class="ai-loader-segment"></span>
                      <span class="ai-loader-segment"></span>
                      <span class="ai-loader-segment"></span>
                      <span class="ai-loader-segment"></span>
                    </span>
                  ` : ''}
                  <span class="ai-prompt-hints-spacer"></span>
                  <span class="ai-prompt-hint"><kbd>/</kbd> commands</span>
                  <span class="ai-prompt-hint"><kbd>⌘</kbd><kbd>↵</kbd> send</span>
                  <span class="ai-prompt-hint"><kbd>drop</kbd> files</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Todo Panel -->
        <ai-todo-panel style="width: 300px; flex-shrink: 0; border-left: 1px solid var(--ai-panel-border);"></ai-todo-panel>
      </div>
    </div>
  `;
}
