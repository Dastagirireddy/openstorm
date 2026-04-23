/**
 * LSP Service - Abstraction for Language Server Protocol operations
 *
 * Provides a clean API for LSP features that can be:
 * - Mocked for testing
 * - Extended by plugins
 * - Multiplied for multiple language servers
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  CompletionItem,
  HoverInfo,
  LocationInfo,
  DiagnosticInfo,
} from '../lsp-client.js';

/**
 * LSP Server status
 */
export interface LspServerStatus {
  languageId: string;
  serverName: string;
  isInstalled: boolean;
  isRunning: boolean;
  isInstalling: boolean;
  error?: string;
}

/**
 * Completion context
 */
export interface CompletionContext {
  uri: string;
  line: number;
  column: number;
  triggerCharacter?: string;
}

/**
 * Hover context
 */
export interface HoverContext {
  uri: string;
  line: number;
  column: number;
}

/**
 * Definition context
 */
export interface DefinitionContext {
  uri: string;
  line: number;
  column: number;
}

/**
 * Diagnostic context
 */
export interface DiagnosticContext {
  uri: string;
}

/**
 * LSP Event types
 */
export interface LspEvent {
  type: 'server-started' | 'server-stopped' | 'diagnostics' | 'install-progress';
  languageId: string;
  details?: any;
}

/**
 * LSP Service class
 */
export class LspService {
  private static instance: LspService;
  private listeners: Set<(event: LspEvent) => void> = new Set();
  private serverStatuses: Map<string, LspServerStatus> = new Map();
  private eventUnsubscribers: (() => void)[] = [];

  protected constructor() {}

  static getInstance(): LspService {
    if (!LspService.instance) {
      LspService.instance = new LspService();
    }
    return LspService.instance;
  }

  /**
   * Initialize LSP service
   */
  async initialize(): Promise<void> {
    // Listen for LSP events from backend
    await this.setupEventListeners();
  }

  /**
   * Setup event listeners for LSP events
   */
  private async setupEventListeners(): Promise<void> {
    // Listen for diagnostics
    const unsubscribeDiagnostics = await listen('lsp-diagnostics', (event: any) => {
      this.notifyListeners({
        type: 'diagnostics',
        languageId: event.payload.language_id,
        details: event.payload.diagnostics,
      });
    });
    this.eventUnsubscribers.push(unsubscribeDiagnostics);

    // Listen for server started
    const unsubscribeStarted = await listen('lsp-server-started', (event: any) => {
      const languageId = event.payload.language_id;
      this.updateServerStatus(languageId, { isRunning: true });
      this.notifyListeners({
        type: 'server-started',
        languageId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeStarted);

    // Listen for server stopped
    const unsubscribeStopped = await listen('lsp-server-stopped', (event: any) => {
      const languageId = event.payload.language_id;
      this.updateServerStatus(languageId, { isRunning: false });
      this.notifyListeners({
        type: 'server-stopped',
        languageId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeStopped);

    // Listen for install progress
    const unsubscribeProgress = await listen('lsp-install-progress', (event: any) => {
      const languageId = event.payload.language_id;
      this.updateServerStatus(languageId, { isInstalling: true });
      this.notifyListeners({
        type: 'install-progress',
        languageId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeProgress);
  }

  /**
   * Update server status
   */
  private updateServerStatus(languageId: string, updates: Partial<LspServerStatus>): void {
    const current = this.serverStatuses.get(languageId) || {
      languageId,
      serverName: languageId,
      isInstalled: false,
      isRunning: false,
      isInstalling: false,
    };
    this.serverStatuses.set(languageId, { ...current, ...updates });
  }

  /**
   * Initialize LSP pool for a project
   */
  async initializePool(rootPath: string): Promise<void> {
    await invoke('initialize_lsp_pool', { rootPath });
  }

  /**
   * Get completions at a position
   */
  async getCompletions(context: CompletionContext): Promise<CompletionItem[]> {
    return invoke('lsp_get_completions', {
      uri: context.uri,
      line: context.line,
      column: context.column,
      triggerCharacter: context.triggerCharacter,
    });
  }

  /**
   * Get hover information at a position
   */
  async getHover(context: HoverContext): Promise<HoverInfo | null> {
    return invoke('lsp_get_hover', {
      uri: context.uri,
      line: context.line,
      column: context.column,
    });
  }

  /**
   * Get definition at a position
   */
  async getDefinition(context: DefinitionContext): Promise<LocationInfo | null> {
    return invoke('lsp_get_definition', {
      uri: context.uri,
      line: context.line,
      column: context.column,
    });
  }

  /**
   * Get diagnostics for a file
   */
  async getDiagnostics(context: DiagnosticContext): Promise<DiagnosticInfo[]> {
    return invoke('lsp_get_diagnostics', { uri: context.uri });
  }

  /**
   * Get server status for a language
   */
  getServerStatus(languageId: string): LspServerStatus | undefined {
    return this.serverStatuses.get(languageId);
  }

  /**
   * Get all server statuses
   */
  getAllServerStatuses(): LspServerStatus[] {
    return Array.from(this.serverStatuses.values());
  }

  /**
   * Install LSP server for a language
   */
  async installServer(languageId: string): Promise<void> {
    this.updateServerStatus(languageId, { isInstalling: true });
    await invoke('install_lsp_server', { languageId });
  }

  /**
   * Restart LSP server for a language
   */
  async restartServer(languageId: string): Promise<void> {
    await invoke('restart_lsp_server', { languageId });
  }

  /**
   * Stop LSP server for a language
   */
  async stopServer(languageId: string): Promise<void> {
    await invoke('stop_lsp_server', { languageId });
  }

  /**
   * Subscribe to LSP events
   */
  subscribe(listener: (event: LspEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  private notifyListeners(event: LspEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[LspService] Listener error:', error);
      }
    });
  }

  /**
   * Dispose service
   */
  dispose(): void {
    this.eventUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.eventUnsubscribers = [];
    this.listeners.clear();
  }
}

/**
 * Get LSP service instance
 */
export function getLspService(): LspService {
  return LspService.getInstance();
}
