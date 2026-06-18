import { AISession, ChatMessage } from '../types/ai-types.js';

const STORAGE_PREFIX = 'openstorm-ai-';
const SESSIONS_KEY = `${STORAGE_PREFIX}sessions`;
const ACTIVE_SESSION_KEY = `${STORAGE_PREFIX}active-session`;
const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;

export interface AIStorageSettings {
  maxSessions: number;
  maxMessagesPerSession: number;
  autoSaveInterval: number;
  compressionEnabled: boolean;
}

const DEFAULT_SETTINGS: AIStorageSettings = {
  maxSessions: 100,
  maxMessagesPerSession: 1000,
  autoSaveInterval: 5000,
  compressionEnabled: false,
};

export class AIStorage {
  private static instance: AIStorage;
  private settings: AIStorageSettings = DEFAULT_SETTINGS;

  private constructor() {
    this.loadSettings();
  }

  static getInstance(): AIStorage {
    if (!AIStorage.instance) {
      AIStorage.instance = new AIStorage();
    }
    return AIStorage.instance;
  }

  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('[AI Storage] Failed to load settings:', e);
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.error('[AI Storage] Failed to save settings:', e);
    }
  }

  getSettings(): AIStorageSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<AIStorageSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
  }

  loadSessions(): AISession[] {
    try {
      const stored = localStorage.getItem(SESSIONS_KEY);
      if (stored) {
        const sessions = JSON.parse(stored);
        // Enforce limits
        if (sessions.length > this.settings.maxSessions) {
          const trimmed = sessions.slice(0, this.settings.maxSessions);
          this.saveSessions(trimmed);
          return trimmed;
        }
        return sessions;
      }
    } catch (e) {
      console.error('[AI Storage] Failed to load sessions:', e);
    }
    return [];
  }

  saveSessions(sessions: AISession[]): void {
    try {
      // Enforce message limits
      const limited = sessions.map(session => ({
        ...session,
        messages: session.messages.slice(-this.settings.maxMessagesPerSession),
      }));
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(limited));
    } catch (e) {
      console.error('[AI Storage] Failed to save sessions:', e);
    }
  }

  loadActiveSessionId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_SESSION_KEY);
    } catch (e) {
      console.error('[AI Storage] Failed to load active session:', e);
    }
    return null;
  }

  saveActiveSessionId(sessionId: string | null): void {
    try {
      if (sessionId) {
        localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    } catch (e) {
      console.error('[AI Storage] Failed to save active session:', e);
    }
  }

  clearAll(): void {
    try {
      localStorage.removeItem(SESSIONS_KEY);
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    } catch (e) {
      console.error('[AI Storage] Failed to clear storage:', e);
    }
  }

  exportSessions(): string {
    const sessions = this.loadSessions();
    return JSON.stringify(sessions, null, 2);
  }

  importSessions(json: string): boolean {
    try {
      const sessions = JSON.parse(json) as AISession[];
      if (!Array.isArray(sessions)) {
        return false;
      }
      this.saveSessions(sessions);
      return true;
    } catch (e) {
      console.error('[AI Storage] Failed to import sessions:', e);
      return false;
    }
  }

  getStorageUsage(): { used: number; quota: number } {
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const value = localStorage.getItem(key);
        if (value) {
          used += value.length * 2; // UTF-16 characters = 2 bytes each
        }
      }
    }
    return {
      used,
      quota: 5 * 1024 * 1024, // 5MB typical limit
    };
  }
}

export const aiStorage = AIStorage.getInstance();
