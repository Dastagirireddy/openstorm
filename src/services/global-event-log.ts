/**
 * Global Event Log Panel
 *
 * IntelliJ-style event log displayed in the status bar area.
 * Shows notifications from all parts of the IDE.
 */

import { html, nothing, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';
import { eventLog, LogEntry, EventType } from './event-log.js';

@customElement('global-event-log')
export class GlobalEventLogPanel extends TailwindElement(css`
  :host {
    display: block;
    height: 100%;
  }
`) {
  @state() private entries: LogEntry[] = [];
  @state() private panelOpen = true;

  private unsubscribe!: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.unsubscribe = eventLog.subscribe(entries => {
      this.entries = entries;
      // Auto-open panel when new entries arrive
      if (entries.length > 0) {
        this.panelOpen = true;
      }
      this.requestUpdate();
    });
  }

  disconnectedCallback(): void {
    this.unsubscribe();
    super.disconnectedCallback();
  }

  private openPanel() {
    this.panelOpen = true;
  }

  private closePanel() {
    this.panelOpen = false;
  }

  private clearLog() {
    eventLog.clear();
  }

  private getIcon(type: EventType): string {
    switch (type) {
      case 'success': return 'mdi:check-circle';
      case 'error': return 'mdi:alert-circle';
      case 'warning': return 'mdi:alert';
      default: return 'mdi:information';
    }
  }

  private getColor(type: EventType): string {
    switch (type) {
      case 'success': return 'var(--success)';
      case 'error': return 'var(--error)';
      case 'warning': return 'var(--warning)';
      default: return 'var(--brand-primary)';
    }
  }

  private getErrorCount(): number {
    return this.entries.filter(e => e.type === 'error').length;
  }

  render() {
    const errorCount = this.getErrorCount();
    const hasErrors = errorCount > 0;

    return html`
      <div class="relative h-full flex items-center">
        <!-- Event Log Panel -->
        ${this.entries.length > 0 && this.panelOpen ? html`
          <div
            class="absolute bottom-full right-0 mb-[4px] w-80 max-h-72 overflow-hidden rounded-tl-lg shadow-2xl border z-50"
            style="background: var(--statusbar-background, var(--app-background)); border-color: var(--statusbar-border, var(--app-border));"
          >
            <!-- Header -->
            <div
              class="flex items-center justify-between px-3 py-2 border-b"
              style="border-color: var(--statusbar-border, var(--app-border)); background: var(--statusbar-background, var(--app-toolbar-background));"
            >
              <div class="flex items-center gap-2">
                <iconify-icon
                  icon="mdi:bell"
                  width="16"
                  style="color: ${hasErrors ? 'var(--error)' : 'var(--success)'};"
                ></iconify-icon>
                <span class="text-xs font-medium" style="color: var(--statusbar-foreground, var(--app-foreground));">
                  Events
                  ${errorCount > 0
                    ? html`<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px]" style="background: var(--error); color: white;">${errorCount} errors</span>`
                    : nothing}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <span class="text-[10px] mr-2" style="color: var(--statusbar-foreground, var(--app-foreground)); opacity: 0.7;">
                  ${this.entries.length} event${this.entries.length !== 1 ? 's' : ''}
                </span>
                <button
                  class="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--statusbar-hover-background, var(--app-toolbar-hover))]"
                  @click=${(e: Event) => { e.stopPropagation(); this.clearLog(); }}
                  title="Clear all"
                >
                  <iconify-icon icon="mdi:trash-can-outline" width="12" style="color: var(--statusbar-foreground, var(--app-foreground));"></iconify-icon>
                </button>
                <button
                  class="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--statusbar-hover-background, var(--app-toolbar-hover))]"
                  @click=${(e: Event) => { e.stopPropagation(); this.closePanel(); }}
                  title="Close"
                >
                  <iconify-icon icon="mdi:close" width="12" style="color: var(--statusbar-foreground, var(--app-foreground));"></iconify-icon>
                </button>
              </div>
            </div>

            <!-- Log Entries -->
            <div class="overflow-y-auto max-h-56">
              ${this.entries.map(entry => html`
                <div
                  class="px-3 py-2 border-b last:border-0 hover:bg-[var(--statusbar-hover-background, var(--app-tab-inactive))] transition-colors"
                  style="border-color: var(--statusbar-border, var(--app-border));"
                >
                  <div class="flex items-start gap-2">
                    <iconify-icon
                      icon="${this.getIcon(entry.type)}"
                      width="14"
                      height="14"
                      style="color: ${this.getColor(entry.type)}; margin-top: 2px;"
                    ></iconify-icon>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-medium truncate" style="color: var(--statusbar-foreground, var(--app-foreground));">${entry.text}</span>
                        <span class="text-[10px] flex-shrink-0" style="color: var(--statusbar-foreground, var(--app-foreground)); opacity: 0.6;">${entry.timestamp}</span>
                        ${entry.source ? html`
                          <span class="text-[10px] px-1 rounded" style="background: var(--statusbar-hover-background, var(--app-tab-inactive)); color: var(--statusbar-foreground, var(--app-foreground));">${entry.source}</span>
                        ` : nothing}
                      </div>
                      ${entry.details ? html`
                        <div
                          class="mt-1.5 text-[11px] font-mono rounded px-2 py-1.5 break-all"
                          style="background: ${entry.type === 'error' ? 'var(--error)/10' : 'var(--statusbar-hover-background, var(--app-tab-inactive))'}; color: ${entry.type === 'error' ? 'var(--error)' : 'var(--statusbar-foreground, var(--app-foreground))'}; opacity: ${entry.type === 'error' ? 1 : 0.8};"
                        >
                          ${entry.details}
                        </div>
                      ` : nothing}
                    </div>
                  </div>
                </div>
              `)}
            </div>
          </div>
        ` : nothing}

        <!-- Status Bar Button -->
        <div
          class="h-full px-2 flex items-center gap-1.5 hover:bg-[var(--statusbar-hover-background, var(--app-toolbar-hover))] transition-colors cursor-pointer"
          style="border-color: var(--statusbar-border, var(--app-border));"
          @click=${() => this.openPanel()}
          title="View event log"
        >
          <iconify-icon
            icon="${this.entries.length > 0 && this.panelOpen ? 'mdi:bell' : 'mdi:bell-outline'}"
            width="14"
            style="color: ${hasErrors ? 'var(--error)' : this.entries.length > 0 ? 'var(--success)' : 'var(--statusbar-foreground, var(--app-foreground))'}; opacity: ${hasErrors || this.entries.length > 0 ? 1 : 0.5};"
          ></iconify-icon>
          ${errorCount > 0 ? html`
            <span class="text-[10px] font-medium" style="color: var(--error);">${errorCount}</span>
          ` : nothing}
        </div>
      </div>
    `;
  }
}
