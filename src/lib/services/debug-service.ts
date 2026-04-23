/**
 * Debug Service - Abstraction for Debug Adapter Protocol operations
 *
 * Provides a clean API for debugging features that can be:
 * - Mocked for testing
 * - Extended by plugins
 * - Multiplied for multiple debug adapters
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { StackFrame, Variable, Breakpoint, DebugOutput, WatchExpression, DebugThread } from '../../components/debug-panel.js';

/**
 * Debug session configuration
 */
export interface DebugConfiguration {
  type: string;
  request: 'launch' | 'attach';
  name: string;
  program?: string;
  cwd?: string;
  args?: string[];
  env?: Record<string, string>;
  stopOnEntry?: boolean;
  [key: string]: any;
}

/**
 * Debug session info
 */
export interface DebugSessionInfo {
  id: string;
  configuration: DebugConfiguration;
  state: 'stopped' | 'running' | 'terminated';
  startedAt?: Date;
}

/**
 * Debug event types
 */
export interface DebugEvent {
  type: 'initialized' | 'stopped' | 'continued' | 'terminated' | 'output' | 'breakpoint';
  sessionId: string;
  details?: any;
}

/**
 * Debug Service class
 */
export class DebugService {
  private static instance: DebugService;
  private sessions: Map<string, DebugSessionInfo> = new Map();
  private listeners: Set<(event: DebugEvent) => void> = new Set();
  private eventUnsubscribers: (() => void)[] = [];

  protected constructor() {}

  static getInstance(): DebugService {
    if (!DebugService.instance) {
      DebugService.instance = new DebugService();
    }
    return DebugService.instance;
  }

  /**
   * Initialize debug service
   */
  async initialize(): Promise<void> {
    await this.setupEventListeners();
  }

  /**
   * Setup event listeners for DAP events
   */
  private async setupEventListeners(): Promise<void> {
    // Listen for debug initialized
    const unsubscribeInitialized = await listen('debug-initialized', (event: any) => {
      const sessionId = event.payload.session_id || 'default';
      this.sessions.set(sessionId, {
        id: sessionId,
        configuration: event.payload.configuration || {},
        state: 'stopped',
        startedAt: new Date(),
      });
      this.notifyListeners({
        type: 'initialized',
        sessionId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeInitialized);

    // Listen for debug stopped
    const unsubscribeStopped = await listen('debug-stopped', (event: any) => {
      const sessionId = event.payload.session_id || 'default';
      this.updateSessionState(sessionId, 'stopped');
      this.notifyListeners({
        type: 'stopped',
        sessionId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeStopped);

    // Listen for debug continued
    const unsubscribeContinued = await listen('debug-continued', (event: any) => {
      const sessionId = event.payload.session_id || 'default';
      this.updateSessionState(sessionId, 'running');
      this.notifyListeners({
        type: 'continued',
        sessionId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeContinued);

    // Listen for debug terminated
    const unsubscribeTerminated = await listen('debug-terminated', (event: any) => {
      const sessionId = event.payload.session_id || 'default';
      this.updateSessionState(sessionId, 'terminated');
      this.sessions.delete(sessionId);
      this.notifyListeners({
        type: 'terminated',
        sessionId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeTerminated);

    // Listen for debug output
    const unsubscribeOutput = await listen('debug-output', (event: any) => {
      const sessionId = event.payload.session_id || 'default';
      this.notifyListeners({
        type: 'output',
        sessionId,
        details: event.payload,
      });
    });
    this.eventUnsubscribers.push(unsubscribeOutput);
  }

  /**
   * Update session state
   */
  private updateSessionState(sessionId: string, state: DebugSessionInfo['state']): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = state;
    }
  }

  /**
   * Start a debug session
   */
  async start(configuration: DebugConfiguration): Promise<string> {
    const sessionId = await invoke<string>('start_debug', { configuration });
    this.sessions.set(sessionId, {
      id: sessionId,
      configuration,
      state: 'running',
      startedAt: new Date(),
    });
    return sessionId;
  }

  /**
   * Stop a debug session
   */
  async stop(sessionId?: string): Promise<void> {
    await invoke('stop_debug', { sessionId });
  }

  /**
   * Continue execution
   */
  async continue(sessionId?: string): Promise<void> {
    await invoke('debug_continue', { sessionId });
  }

  /**
   * Step over
   */
  async stepOver(sessionId?: string): Promise<void> {
    await invoke('debug_step_over', { sessionId });
  }

  /**
   * Step into
   */
  async stepInto(sessionId?: string): Promise<void> {
    await invoke('debug_step_into', { sessionId });
  }

  /**
   * Step out
   */
  async stepOut(sessionId?: string): Promise<void> {
    await invoke('debug_step_out', { sessionId });
  }

  /**
   * Restart debug session
   */
  async restart(sessionId?: string): Promise<void> {
    await invoke('debug_restart', { sessionId });
  }

  /**
   * Pause execution
   */
  async pause(sessionId?: string): Promise<void> {
    await invoke('debug_pause', { sessionId });
  }

  /**
   * Set breakpoints
   */
  async setBreakpoints(
    sourcePath: string,
    breakpoints: Array<{ line: number; condition?: string; hitCondition?: string; logMessage?: string }>
  ): Promise<Breakpoint[]> {
    return invoke('set_breakpoints', { sourcePath, breakpoints });
  }

  /**
   * Get stack frames
   */
  async getStackFrames(sessionId?: string): Promise<StackFrame[]> {
    return invoke('get_stack_frames', { sessionId });
  }

  /**
   * Get variables for a scope
   */
  async getVariables(
    variablesReference: number,
    sessionId?: string
  ): Promise<Variable[]> {
    return invoke('get_variables', { variablesReference, sessionId });
  }

  /**
   * Evaluate expression
   */
  async evaluate(
    expression: string,
    frameId?: number,
    sessionId?: string
  ): Promise<Variable> {
    return invoke('evaluate', { expression, frameId, sessionId });
  }

  /**
   * Get threads
   */
  async getThreads(sessionId?: string): Promise<DebugThread[]> {
    return invoke('get_threads', { sessionId });
  }

  /**
   * Select thread
   */
  async selectThread(threadId: number, sessionId?: string): Promise<void> {
    await invoke('select_thread', { threadId, sessionId });
  }

  /**
   * Get available debug configurations
   */
  async getDebugConfigurations(): Promise<DebugConfiguration[]> {
    return invoke('get_debug_configurations');
  }

  /**
   * Check if debugger is available for a type
   */
  async isDebuggerAvailable(type: string): Promise<boolean> {
    return invoke('is_debugger_available', { type });
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): DebugSessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getSessions(): DebugSessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active session
   */
  getActiveSession(): DebugSessionInfo | undefined {
    const running = Array.from(this.sessions.values()).find(
      (s) => s.state === 'running' || s.state === 'stopped'
    );
    return running;
  }

  /**
   * Subscribe to debug events
   */
  subscribe(listener: (event: DebugEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  private notifyListeners(event: DebugEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[DebugService] Listener error:', error);
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
    this.sessions.clear();
  }
}

/**
 * Get debug service instance
 */
export function getDebugService(): DebugService {
  return DebugService.getInstance();
}
