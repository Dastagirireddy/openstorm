import { html, unsafeCSS } from 'lit';
import { customElement, state, query, property } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { aiState } from '../../lib/ai/ai-state.js';
import type { ChatMessage, ModelInfo, AISession, ProviderInfo, AiProviderConfig } from '../../lib/types/ai-types.js';
import hljsTheme from 'highlight.js/styles/monokai-sublime.css?inline';

// Extracted modules
import { aiPanelStyles } from './ai-panel-styles.js';
import { handleAgentEvent, type AgentEvent } from './ai-event-handler.js';
import { AI_COMMANDS, AI_TIPS, handleCommand, formatTokenCount } from './ai-commands.js';
import { parseFileMentions, readMentionedFiles, buildContextMessage, searchFiles } from './ai-file-utils.js';
import { renderPanel, type PanelRenderState, type PanelRenderActions } from './ai-panel-renderer.js';
import {
  handleInput as handleInputAction,
  handleKeyDown as handleKeyDownAction,
  getFilteredCommands,
  scrollSelectedIntoView,
  type InputHandlerState,
  type InputHandlerActions,
} from './ai-input-handler.js';

@customElement('ai-panel')
export class AiPanel extends TailwindElement(aiPanelStyles, unsafeCSS(hljsTheme)) {
  @property({ type: String }) projectPath = '';
  @state() private sessions: AISession[] = [];
  @state() private activeSessionId: string | null = null;
  @state() private inputText = '';
  @state() private models: ModelInfo[] = [];
  @state() private selectedModel = '';
  @state() private currentProvider = 'ollama';
  @state() private providers: ProviderInfo[] = [];
  @state() private providerConnected = false;
  @state() private providerLoading = false;
  @state() private isThinking = false;
  @state() private isStreaming = false;
  @state() private showToolDetails = new Set<string>();
  @state() private responseStartTime: number = 0;
  @state() private lastResponseTime: number = 0;
  @state() private lastUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;
  @state() private sessionStats = { tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0, messageCount: 0 };
  @state() private isDragging = false;
  @state() private showCommands = false;
  @state() private commandFilter = '';
  @state() private selectedCommandIndex = 0;
  @state() private currentTipIndex = 0;
  @state() private showFileSuggestions = false;
  @state() private fileSuggestions: string[] = [];
  @state() private fileFilter = '';
  @state() private selectedFileIndex = 0;
  private searchFilesDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchFilesRequestId = 0;
  private _iterationStartTime: number = 0;
  private _scrollRafId: number = 0;

  @query('#chat-scroll') private chatScroll!: HTMLDivElement;
  @query('#chat-input') private chatInput!: HTMLTextAreaElement;

  private unlistenFn?: () => void;
  private tipTimer?: ReturnType<typeof setInterval>;

  connectedCallback() {
    super.connectedCallback();
    this.setupEventListeners();
    this.loadState();
    this.tipTimer = setInterval(() => {
      this.currentTipIndex = (this.currentTipIndex + 1) % AI_TIPS.length;
    }, 6000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unlistenFn?.();
    if (this.tipTimer) {
      clearInterval(this.tipTimer);
      this.tipTimer = undefined;
    }
  }

  private loadState() {
    this.sessions = aiState.sessions;
    this.activeSessionId = aiState.activeSessionId;
    this.models = aiState.models;
    this.selectedModel = aiState.selectedModel;
    this.providerConnected = aiState.ollamaConnected;
    this.updateSessionStats();

    aiState.on('session-created', (session: AISession) => {
      this.sessions = [...aiState.sessions];
      this.activeSessionId = session.id;
      this.updateSessionStats();
    });

    aiState.on('session-switched', (sessionId: string) => {
      this.activeSessionId = sessionId;
      this.updateSessionStats();
    });

    aiState.on('session-deleted', () => {
      this.sessions = [...aiState.sessions];
      this.activeSessionId = aiState.activeSessionId;
      this.updateSessionStats();
    });

    aiState.on('session-cleared', () => {
      this.sessions = [...aiState.sessions];
      this.updateSessionStats();
    });

    aiState.on('models-updated', (models: ModelInfo[]) => {
      this.models = models;
    });

    aiState.on('model-selected', (modelId: string) => {
      this.selectedModel = modelId;
    });

    aiState.on('ollama-status', (connected: boolean) => {
      this.providerConnected = connected;
    });

    aiState.on('thinking-status', (thinking: boolean) => {
      this.isThinking = thinking;
    });

    aiState.on('streaming-status', (streaming: boolean) => {
      this.isStreaming = streaming;
    });
  }

  private async setupEventListeners() {
    this.unlistenFn = await listen('ai-agent-event', (event: any) => {
      this.handleAgentEvent(event.payload);
    });
  }

  private async initialize() {
    this.providerLoading = true;
    this.providerConnected = false;
    try {
      const config = await invoke<AiProviderConfig>('ai_get_config');
      this.currentProvider = config.provider || 'ollama';
      this.providers = await invoke<ProviderInfo[]>('ai_list_providers');

      const connected = await invoke<boolean>('ai_check_connection', { providerId: this.currentProvider });
      this.providerConnected = connected;
      aiState.setOllamaConnected(connected);

      if (connected) {
        const models = await invoke<ModelInfo[]>('ai_list_models', { providerId: this.currentProvider });
        aiState.setModels(models);
        if (models.length > 0) {
          const savedModel = config.model;
          const match = savedModel ? models.find(m => m.id === savedModel) : null;
          aiState.setSelectedModel(match ? match.id : models[0].id);
        }
      }
    } catch (e) {
      console.error('[AI] Failed to initialize:', e);
      this.providerConnected = false;
    } finally {
      this.providerLoading = false;
    }
  }

  firstUpdated() {
    this.initialize();
    this.createSession();
    setTimeout(() => {
      this.chatInput?.focus();
      this.updateCustomCaret();
    }, 100);
  }

  private async switchProvider(providerId: string) {
    if (providerId === this.currentProvider) return;
    this.currentProvider = providerId;
    this.providerLoading = true;
    this.providerConnected = false;
    aiState.setModels([]);
    aiState.setSelectedModel('');
    try {
      await invoke('ai_set_config', { config: { provider: providerId, base_url: '', api_key: '', model: '' } });
      const connected = await invoke<boolean>('ai_check_connection', { providerId });
      this.providerConnected = connected;
      aiState.setOllamaConnected(connected);
      if (connected) {
        const models = await invoke<ModelInfo[]>('ai_list_models', { providerId });
        aiState.setModels(models);
        if (models.length > 0) {
          aiState.setSelectedModel(models[0].id);
          await invoke('ai_set_config', { config: { provider: providerId, base_url: '', api_key: '', model: models[0].id } });
        }
      }
    } catch (e) {
      console.error('[AI] Failed to switch provider:', e);
      this.providerConnected = false;
    } finally {
      this.providerLoading = false;
    }
  }

  private async selectModel(modelId: string) {
    aiState.setSelectedModel(modelId);
    try {
      await invoke('ai_set_config', { config: { provider: this.currentProvider, base_url: '', api_key: '', model: modelId } });
    } catch (e) {
      console.error('[AI] Failed to save model:', e);
    }
  }

  private getActiveSession(): AISession | undefined {
    return this.sessions.find(s => s.id === this.activeSessionId);
  }

  private getMessages(): ChatMessage[] {
    return this.getActiveSession()?.messages || [];
  }

  private createSession() {
    aiState.createSession();
  }

  private updateSessionStats() {
    if (this.activeSessionId) {
      this.sessionStats = aiState.getSessionStats(this.activeSessionId);
    } else {
      this.sessionStats = { tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0, messageCount: 0 };
    }
  }

  private clearSession() {
    if (!this.activeSessionId) return;
    aiState.clearSession(this.activeSessionId);
    this.sessions = [...aiState.sessions];
    this.updateSessionStats();
  }

  private handleAgentEvent(event: AgentEvent) {
    const sessionId = this.activeSessionId;
    if (!sessionId) return;

    handleAgentEvent(event, sessionId, {
      getMessages: () => this.getMessages(),
      addMessage: (id, msg) => aiState.addMessage(id, msg),
      updateMessage: (sessionId, msgId, update) => aiState.updateMessage(sessionId, msgId, update),
      appendToOrCreateAssistant: (id, content) => this.appendToOrCreateAssistant(id, content),
      scrollToBottom: () => this.scrollToBottom(),
      updateSessionStats: () => this.updateSessionStats(),
      formatDuration: (s) => this.formatDuration(s),
    }, {
      _iterationStartTime: this._iterationStartTime,
      responseStartTime: this.responseStartTime,
      lastResponseTime: this.lastResponseTime,
      lastUsage: this.lastUsage,
    });

    this.sessions = [...aiState.sessions];
    this.scrollToBottom();
  }

  private appendToOrCreateAssistant(sessionId: string, content: string) {
    const messages = this.getMessages();
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
      aiState.updateMessage(sessionId, lastMsg.id, {
        content: lastMsg.content + content,
      });
    } else {
      aiState.addMessage(sessionId, {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: Date.now(),
        isStreaming: true,
      });
      requestAnimationFrame(() => {
        if (this.chatScroll) {
          this.chatScroll.scrollTop = this.chatScroll.scrollHeight;
        }
      });
    }
  }

  private formatDuration(seconds: number): string {
    if (seconds < 1) {
      return `${Math.round(seconds * 1000)}ms`;
    } else if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = (seconds % 60).toFixed(0);
      return `${mins}mn ${secs}s`;
    }
  }

  private scrollToBottom() {
    if (this._scrollRafId) cancelAnimationFrame(this._scrollRafId);
    
    this._scrollRafId = requestAnimationFrame(() => {
      if (this.chatScroll) {
        const el = this.chatScroll;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        if (isNearBottom) {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: 'smooth',
          });
        }
      }
    });
  }

  private async sendMessage() {
    const text = this.inputText.trim();
    if (!text || this.isThinking) return;

    if (text.startsWith('/')) {
      this.handleCommand(text);
      return;
    }

    if (!this.activeSessionId) {
      this.createSession();
    }
    const sessionId = this.activeSessionId!;

    const mentions = parseFileMentions(text);
    const attachments = await readMentionedFiles(mentions, this.projectPath);
    const contextMessage = buildContextMessage(text, attachments);

    aiState.addMessage(sessionId, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });

    this.inputText = '';
    this.lastUsage = null;
    aiState.setThinking(true);

    const messages = this.getMessages();
    const history = messages
      .filter((m, i) => (m.role === 'user' || m.role === 'assistant') && i < messages.length - 1)
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

    try {
      await invoke('ai_chat', {
        providerId: this.currentProvider,
        model: this.selectedModel,
        message: contextMessage,
        projectPath: this.projectPath,
        history,
      });
    } catch (e) {
      aiState.addMessage(sessionId, {
        id: `err-${Date.now()}`,
        role: 'error',
        content: String(e),
        timestamp: Date.now(),
      });
      aiState.setThinking(false);
    }
    this.sessions = [...aiState.sessions];
  }

  private async abortRequest() {
    try {
      await invoke('ai_abort');
      aiState.setThinking(false);
      aiState.setStreaming(false);
    } catch (e) {
      console.error('[AI] Abort failed:', e);
    }
  }

  private async handleToolApproval(approved: boolean) {
    try {
      await invoke('ai_approve_tool', { approved });
    } catch (e) {
      console.error('[AI] Tool approval failed:', e);
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    handleKeyDownAction(e, this.getInputHandlerState(), this.getInputHandlerActions());
  }

  private handleInput(e: Event) {
    handleInputAction(e, this.getInputHandlerState(), this.getInputHandlerActions());
  }

  private getInputHandlerState(): InputHandlerState {
    return {
      showCommands: this.showCommands,
      showFileSuggestions: this.showFileSuggestions,
      fileSuggestions: this.fileSuggestions,
      selectedCommandIndex: this.selectedCommandIndex,
      selectedFileIndex: this.selectedFileIndex,
      commandFilter: this.commandFilter,
      fileFilter: this.fileFilter,
      inputText: this.inputText,
      isThinking: this.isThinking,
      searchFilesRequestId: this.searchFilesRequestId,
    };
  }

  private getInputHandlerActions(): InputHandlerActions {
    return {
      setShowCommands: (v) => { this.showCommands = v; },
      setShowFileSuggestions: (v) => { this.showFileSuggestions = v; },
      setSelectedCommandIndex: (v) => { this.selectedCommandIndex = v; },
      setSelectedFileIndex: (v) => { this.selectedFileIndex = v; },
      setCommandFilter: (v) => { this.commandFilter = v; },
      setFileFilter: (v) => { this.fileFilter = v; },
      setInputText: (v) => { this.inputText = v; },
      setSearchFilesRequestId: (v) => { this.searchFilesRequestId = v; },
      getFilteredCommands: () => getFilteredCommands(this.commandFilter),
      scrollSelectedIntoView: () => scrollSelectedIntoView(this.renderRoot),
      selectCommand: (cmd) => this.selectCommand(cmd),
      selectFile: (file) => this.selectFile(file),
      sendMessage: () => this.sendMessage(),
      abortRequest: () => this.abortRequest(),
      createSession: () => this.createSession(),
      clearSession: () => this.clearSession(),
      triggerFileSearch: (query, requestId) => this.searchFiles(query, requestId),
    };
  }

  private selectCommand(command: { name: string; description: string }) {
    this.inputText = command.name + ' ';
    this.showCommands = false;
    this.commandFilter = '';
    this.chatInput?.focus();
  }

  private handleCommand(text: string) {
    this.inputText = '';
    handleCommand(text, {
      clearSession: () => this.clearSession(),
      createSession: () => this.createSession(),
      addSystemMessage: (content) => this.addSystemMessage(content),
      activeSessionId: this.activeSessionId,
      focusModelSelector: () => this.focusModelSelector(),
    });
  }

  private addSystemMessage(content: string) {
    if (!this.activeSessionId) {
      this.createSession();
    }
    aiState.addMessage(this.activeSessionId!, {
      id: `sys-${Date.now()}`,
      role: 'system',
      content,
      timestamp: Date.now(),
    });
    this.sessions = [...aiState.sessions];
  }

  private focusModelSelector() {
    const select = this.renderRoot.querySelector('.ai-model-bare') as HTMLSelectElement;
    select?.focus();
    this.addSystemMessage('Use the model selector below to switch models.');
  }

  private handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = true;
  }

  private handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = false;
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = false;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      this.attachFiles(Array.from(files));
    }
  }

  private async searchFiles(query: string, requestId: number) {
    const files = await searchFiles(query, this.projectPath);
    if (requestId !== this.searchFilesRequestId) return;
    this.fileSuggestions = files;
  }

  private selectFile(file: string) {
    const lastAtIndex = this.inputText.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const afterAt = this.inputText.slice(lastAtIndex + 1);
      const hashIndex = afterAt.indexOf('#');
      const lineRange = hashIndex >= 0 ? afterAt.slice(hashIndex) : '';
      this.inputText = this.inputText.slice(0, lastAtIndex) + `@${file}${lineRange}`;
    }
    this.showFileSuggestions = false;
    this.fileSuggestions = [];
    this.fileFilter = '';

    if (this.chatInput) {
      this.chatInput.value = this.inputText;
      this.chatInput.focus();
      const cursorPos = this.inputText.lastIndexOf('#') >= 0 
        ? this.inputText.lastIndexOf('#') 
        : this.inputText.length;
      this.chatInput.setSelectionRange(cursorPos, cursorPos);
    }
  }

  private updateCustomCaret = () => {
    requestAnimationFrame(() => {
      const ta = this.chatInput;
      const caret = this.renderRoot.querySelector('#custom-caret') as HTMLElement;
      const inputRow = this.renderRoot.querySelector('.ai-prompt-input-row') as HTMLElement;
      if (!ta || !caret || !inputRow) return;

      if (ta.selectionStart === null || ta.selectionStart !== ta.selectionEnd) {
        caret.style.display = 'none';
        return;
      }

      const text = ta.value.substring(0, ta.selectionStart);
      const lines = text.split('\n');
      const currentLine = lines.length - 1;
      const currentCol = lines[currentLine].length;

      const taStyle = getComputedStyle(ta);
      const fontSize = parseFloat(taStyle.fontSize);
      const lineHeight = parseFloat(taStyle.lineHeight) || fontSize * 1.5;

      const rowStyle = getComputedStyle(inputRow);
      const rowPaddingLeft = parseFloat(rowStyle.paddingLeft) || 0;
      const rowPaddingTop = parseFloat(rowStyle.paddingTop) || 0;

      const charWidth = fontSize * 0.602;
      const x = rowPaddingLeft + currentCol * charWidth;
      const y = rowPaddingTop + currentLine * lineHeight;

      caret.style.display = 'block';
      caret.style.left = `${x}px`;
      caret.style.top = `${y}px`;
    });
  };

  render() {
    return renderPanel(
      {
        sessions: this.sessions,
        activeSessionId: this.activeSessionId,
        inputText: this.inputText,
        models: this.models,
        selectedModel: this.selectedModel,
        currentProvider: this.currentProvider,
        providers: this.providers,
        providerConnected: this.providerConnected,
        providerLoading: this.providerLoading,
        isThinking: this.isThinking,
        isStreaming: this.isStreaming,
        isDragging: this.isDragging,
        showCommands: this.showCommands,
        commandFilter: this.commandFilter,
        selectedCommandIndex: this.selectedCommandIndex,
        currentTipIndex: this.currentTipIndex,
        showFileSuggestions: this.showFileSuggestions,
        fileSuggestions: this.fileSuggestions,
        selectedFileIndex: this.selectedFileIndex,
        sessionStats: this.sessionStats,
        lastResponseTime: this.lastResponseTime,
        lastUsage: this.lastUsage,
      },
      {
        clearSession: () => this.clearSession(),
        handleDragEnter: (e) => this.handleDragEnter(e),
        handleDragLeave: (e) => this.handleDragLeave(e),
        handleDragOver: (e) => this.handleDragOver(e),
        handleDrop: (e) => this.handleDrop(e),
        selectCommand: (cmd) => this.selectCommand(cmd),
        selectFile: (file) => this.selectFile(file),
        handleInput: (e) => this.handleInput(e),
        handleKeyDown: (e) => this.handleKeyDown(e),
        updateCustomCaret: () => this.updateCustomCaret(),
        abortRequest: () => this.abortRequest(),
        switchProvider: (id) => this.switchProvider(id),
        selectModel: (id) => this.selectModel(id),
        handleToolApproval: (approved) => this.handleToolApproval(approved),
        getFilteredCommands: () => getFilteredCommands(this.commandFilter),
      }
    );
  }
}
