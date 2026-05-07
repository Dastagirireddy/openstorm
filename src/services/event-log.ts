/**
 * Global Event Log Service
 *
 * Centralized logging service for displaying notifications and events
 * across the entire IDE (IntelliJ-style event log).
 */

export type EventType = 'success' | 'error' | 'info' | 'warning';

export interface LogEntry {
  id: string;
  text: string;
  type: EventType;
  timestamp: string;
  details?: string;
  source?: string;
}

class EventLogService {
  private static instance: EventLogService;
  private listeners: Set<(entries: LogEntry[]) => void> = new Set();
  private entries: LogEntry[] = [];
  private maxEntries = 100;

  private constructor() {}

  static getInstance(): EventLogService {
    if (!EventLogService.instance) {
      EventLogService.instance = new EventLogService();
    }
    return EventLogService.instance;
  }

  /**
   * Subscribe to log updates
   */
  subscribe(callback: (entries: LogEntry[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get current log entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Get unread error count
   */
  getUnreadErrorCount(): number {
    return this.entries.filter(e => e.type === 'error').length;
  }

  /**
   * Add a log entry
   */
  log(text: string, type: EventType, details?: string, source?: string): void {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      type,
      timestamp: new Date().toLocaleTimeString(),
      details,
      source,
    };

    this.entries = [entry, ...this.entries].slice(0, this.maxEntries);
    this.notify();
  }

  success(text: string, details?: string, source?: string): void {
    this.log(text, 'success', details, source);
  }

  error(text: string, details?: string, source?: string): void {
    this.log(text, 'error', details, source);
  }

  info(text: string, details?: string, source?: string): void {
    this.log(text, 'info', details, source);
  }

  warning(text: string, details?: string, source?: string): void {
    this.log(text, 'warning', details, source);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.notify();
  }

  /**
   * Clear entries by type
   */
  clearByType(type: EventType): void {
    this.entries = this.entries.filter(e => e.type !== type);
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach(listener => listener(this.entries));
  }
}

// Export singleton instance
export const eventLog = EventLogService.getInstance();

// Export for use as custom element
export { EventLogService };
