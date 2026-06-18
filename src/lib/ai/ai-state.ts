import { AISession, ChatMessage, AIAttachment, ModelInfo, TokenUsage } from '../types/ai-types.js';

export class AIStateManager {
  private static instance: AIStateManager;
  private listeners: Map<string, Set<Function>> = new Map();

  sessions: AISession[] = [];
  activeSessionId: string | null = null;
  models: ModelInfo[] = [];
  selectedModel: string = '';
  ollamaConnected: boolean = false;
  isThinking: boolean = false;
  isStreaming: boolean = false;

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): AIStateManager {
    if (!AIStateManager.instance) {
      AIStateManager.instance = new AIStateManager();
    }
    return AIStateManager.instance;
  }

  private generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('ai-sessions');
      if (stored) {
        this.sessions = JSON.parse(stored);
      }
      const activeId = localStorage.getItem('ai-active-session');
      if (activeId) {
        this.activeSessionId = activeId;
      }
    } catch (e) {
      console.error('[AI State] Failed to load from storage:', e);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('ai-sessions', JSON.stringify(this.sessions));
      if (this.activeSessionId) {
        localStorage.setItem('ai-active-session', this.activeSessionId);
      }
    } catch (e) {
      console.error('[AI State] Failed to save to storage:', e);
    }
  }

  private emit(event: string, data?: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(fn => fn(data));
    }
  }

  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  createSession(name?: string): AISession {
    const session: AISession = {
      id: this.generateId(),
      name: name || `Session ${this.sessions.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    this.sessions.unshift(session);
    this.activeSessionId = session.id;
    this.saveToStorage();
    this.emit('session-created', session);
    this.emit('session-switched', session.id);
    return session;
  }

  switchSession(sessionId: string): void {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      this.activeSessionId = sessionId;
      this.saveToStorage();
      this.emit('session-switched', sessionId);
    }
  }

  deleteSession(sessionId: string): void {
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = this.sessions[0]?.id || null;
    }
    this.saveToStorage();
    this.emit('session-deleted', sessionId);
  }

  renameSession(sessionId: string, name: string): void {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      session.name = name;
      session.updatedAt = Date.now();
      this.saveToStorage();
      this.emit('session-renamed', { sessionId, name });
    }
  }

  clearSession(sessionId: string): void {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      session.messages = [];
      session.updatedAt = Date.now();
      this.saveToStorage();
      this.emit('session-cleared', sessionId);
    }
  }

  getSessionStats(sessionId: string): { tokens: TokenUsage; cost: number; messageCount: number } {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      return { tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0, messageCount: 0 };
    }

    const tokens: TokenUsage = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
    let cost = 0;

    for (const msg of session.messages) {
      if (msg.tokens) {
        tokens.input += msg.tokens.input;
        tokens.output += msg.tokens.output;
        tokens.reasoning += msg.tokens.reasoning;
        tokens.cacheRead += msg.tokens.cacheRead;
        tokens.cacheWrite += msg.tokens.cacheWrite;
      }
      if (msg.cost) {
        cost += msg.cost;
      }
    }

    return { tokens, cost, messageCount: session.messages.length };
  }

  getActiveSession(): AISession | undefined {
    return this.sessions.find(s => s.id === this.activeSessionId);
  }

  addMessage(sessionId: string, message: ChatMessage): void {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      session.messages.push(message);
      session.updatedAt = Date.now();
      this.saveToStorage();
      this.emit('message-added', { sessionId, message });
    }
  }

  updateMessage(sessionId: string, messageId: string, updates: Partial<ChatMessage>): void {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      const message = session.messages.find(m => m.id === messageId);
      if (message) {
        Object.assign(message, updates);
        session.updatedAt = Date.now();
        this.saveToStorage();
        this.emit('message-updated', { sessionId, messageId, updates });
      }
    }
  }

  setModels(models: ModelInfo[]): void {
    this.models = models;
    this.emit('models-updated', models);
  }

  setSelectedModel(modelId: string): void {
    this.selectedModel = modelId;
    this.emit('model-selected', modelId);
  }

  setOllamaConnected(connected: boolean): void {
    this.ollamaConnected = connected;
    this.emit('ollama-status', connected);
  }

  setThinking(thinking: boolean): void {
    this.isThinking = thinking;
    this.emit('thinking-status', thinking);
  }

  setStreaming(streaming: boolean): void {
    this.isStreaming = streaming;
    this.emit('streaming-status', streaming);
  }
}

export const aiState = AIStateManager.getInstance();
