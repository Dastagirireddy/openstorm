/**
 * Terminal Service - Abstraction for terminal/PTY operations
 *
 * Provides a clean API for terminal features that can be:
 * - Mocked for testing
 * - Extended by plugins
 * - Multiplied for multiple terminal instances
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Terminal instance info
 */
export interface TerminalInstanceInfo {
  id: string;
  name: string;
  cwd: string | null;
  shell: string;
  createdAt: Date;
}

/**
 * Terminal configuration
 */
export interface TerminalConfig {
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  name?: string;
}

/**
 * Terminal output event
 */
export interface TerminalOutputEvent {
  terminalId: string;
  data: string;
  timestamp: number;
}

/**
 * Terminal event types
 */
export interface TerminalEvent {
  type: 'created' | 'closed' | 'output' | 'title-changed';
  terminalId: string;
  details?: any;
}

/**
 * Console output (for app console panel)
 */
export interface ConsoleOutput {
  id: number;
  source: 'run' | 'debug';
  output_type: 'stdout' | 'stderr' | 'info';
  data: string;
  timestamp: number;
}

/**
 * Terminal Service class
 */
export class TerminalService {
  private static instance: TerminalService;
  private terminals: Map<string, TerminalInstanceInfo> = new Map();
  private consoleOutputs: ConsoleOutput[] = [];
  private maxConsoleOutputs: number = 1000;
  private listeners: Set<(event: TerminalEvent) => void> = new Set();
  private eventUnsubscribers: (() => void)[] = [];

  protected constructor() {}

  static getInstance(): TerminalService {
    if (!TerminalService.instance) {
      TerminalService.instance = new TerminalService();
    }
    return TerminalService.instance;
  }

  /**
   * Initialize terminal service
   */
  async initialize(): Promise<void> {
    await this.setupEventListeners();
  }

  /**
   * Setup event listeners for terminal events
   */
  private async setupEventListeners(): Promise<void> {
    // Listen for terminal output
    const unsubscribeOutput = await listen('terminal-output', (event: any) => {
      this.notifyListeners({
        type: 'output',
        terminalId: event.payload.terminal_id,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeOutput);

    // Listen for terminal created
    const unsubscribeCreated = await listen('terminal-created', (event: any) => {
      const terminalId = event.payload.terminal_id;
      this.terminals.set(terminalId, {
        id: terminalId,
        name: event.payload.name || `Terminal ${terminalId}`,
        cwd: event.payload.cwd || null,
        shell: event.payload.shell || 'bash',
        createdAt: new Date(),
      });
      this.notifyListeners({
        type: 'created',
        terminalId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeCreated);

    // Listen for terminal closed
    const unsubscribeClosed = await listen('terminal-closed', (event: any) => {
      const terminalId = event.payload.terminal_id;
      this.terminals.delete(terminalId);
      this.notifyListeners({
        type: 'closed',
        terminalId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeClosed);

    // Listen for console output
    const unsubscribeConsole = await listen('console-output', (event: any) => {
      const output: ConsoleOutput = event.payload;
      this.consoleOutputs.push(output);

      // Trim old outputs
      if (this.consoleOutputs.length > this.maxConsoleOutputs) {
        this.consoleOutputs = this.consoleOutputs.slice(-this.maxConsoleOutputs);
      }
    });
    this.eventUnsubscribers.push(unsubscribeConsole);
  }

  /**
   * Create a new terminal instance
   */
  async createTerminal(config: TerminalConfig = {}): Promise<string> {
    const terminalId = await invoke<string>('create_terminal', {
      cwd: config.cwd,
      shell: config.shell,
      env: config.env,
      name: config.name,
    });
    return terminalId;
  }

  /**
   * Close a terminal instance
   */
  async closeTerminal(terminalId: string): Promise<void> {
    await invoke('close_terminal', { terminalId });
    this.terminals.delete(terminalId);
  }

  /**
   * Send data to a terminal
   */
  async sendToTerminal(terminalId: string, data: string): Promise<void> {
    await invoke('write_terminal', { terminalId, data });
  }

  /**
   * Resize a terminal
   */
  async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
    await invoke('resize_terminal', { terminalId, cols, rows });
  }

  /**
   * Send SIGINT to terminal
   */
  async sendSigInt(terminalId: string): Promise<void> {
    await invoke('send_sigint', { terminalId });
  }

  /**
   * Send SIGKILL to terminal
   */
  async sendSigKill(terminalId: string): Promise<void> {
    await invoke('send_sigkill', { terminalId });
  }

  /**
   * Get terminal info
   */
  getTerminal(terminalId: string): TerminalInstanceInfo | undefined {
    return this.terminals.get(terminalId);
  }

  /**
   * Get all terminals
   */
  getTerminals(): TerminalInstanceInfo[] {
    return Array.from(this.terminals.values());
  }

  /**
   * Get console outputs
   */
  getConsoleOutputs(limit?: number): ConsoleOutput[] {
    const outputs = [...this.consoleOutputs];
    if (limit) {
      return outputs.slice(-limit);
    }
    return outputs;
  }

  /**
   * Clear console outputs
   */
  clearConsoleOutputs(): void {
    this.consoleOutputs = [];
  }

  /**
   * Filter console outputs by type
   */
  filterConsoleOutputs(type: 'stdout' | 'stderr' | 'info'): ConsoleOutput[] {
    return this.consoleOutputs.filter((o) => o.output_type === type);
  }

  /**
   * Run a command and capture output
   */
  async runCommand(command: string, cwd?: string): Promise<string> {
    return invoke('run_command', { command, cwd });
  }

  /**
   * Subscribe to terminal events
   */
  subscribe(listener: (event: TerminalEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  private notifyListeners(event: TerminalEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[TerminalService] Listener error:', error);
      }
    });
  }

  /**
   * Set max console output buffer size
   */
  setMaxConsoleOutputs(max: number): void {
    this.maxConsoleOutputs = max;
  }

  /**
   * Dispose service
   */
  dispose(): void {
    this.eventUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.eventUnsubscribers = [];
    this.listeners.clear();
    this.terminals.clear();
    this.consoleOutputs = [];
  }
}

/**
 * Get terminal service instance
 */
export function getTerminalService(): TerminalService {
  return TerminalService.getInstance();
}
