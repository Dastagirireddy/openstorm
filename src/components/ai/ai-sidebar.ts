import { html, css } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import '../layout/icon.js';
import '../../lib/types/ai-types.js';
import { aiState } from '../../lib/ai/ai-state.js';
import type { AISession } from '../../lib/types/ai-types.js';

@customElement('ai-sidebar')
export class AiSidebar extends TailwindElement(css`
  .session-item {
    transition: border-color 0.15s;
  }
  .rename-input {
    background: var(--input-background);
    border-color: var(--accent-color);
    color: var(--app-foreground);
  }
`) {

  @property({ type: Array }) sessions: AISession[] = [];
  @property({ type: String }) activeSessionId: string | null = null;

  @state() private renamingSessionId: string | null = null;
  @state() private renameInput = '';

  private formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private createSession() {
    aiState.createSession();
  }

  private switchSession(sessionId: string) {
    aiState.switchSession(sessionId);
  }

  private deleteSession(sessionId: string) {
    aiState.deleteSession(sessionId);
  }

  private startRenameSession(session: AISession) {
    this.renamingSessionId = session.id;
    this.renameInput = session.name;
  }

  private cancelRename() {
    this.renamingSessionId = null;
    this.renameInput = '';
  }

  private saveRename() {
    if (this.renamingSessionId && this.renameInput.trim()) {
      aiState.renameSession(this.renamingSessionId, this.renameInput.trim());
    }
    this.cancelRename();
  }

  private handleRenameKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.saveRename();
    } else if (e.key === 'Escape') {
      this.cancelRename();
    }
  }

  render() {
    return html`
      <div class="flex flex-col h-full" style="background: var(--panel-background);">
        <div class="flex items-center justify-between px-4 py-3" style="border-bottom: 1px solid var(--panel-border);">
          <span class="text-[12px] font-semibold tracking-tight" style="color: var(--app-foreground);">Sessions</span>
          <button class="p-1.5 rounded-lg transition-colors hover:bg-[var(--list-hover-background)]"
                  @click=${() => this.createSession()}
                  title="New Session (Ctrl+N)"
                  style="color: var(--app-secondary-foreground);">
            <os-icon name="plus" size="14"></os-icon>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto py-1">
          ${this.sessions.length === 0 ? html`
            <div class="px-4 py-8 text-center text-[12px]" style="color: var(--app-disabled-foreground);">
              No sessions yet
            </div>
          ` : html`
            ${this.sessions.map(session => html`
              <div class="session-item flex items-center gap-2.5 mx-2 px-3 py-2.5 cursor-pointer rounded-lg transition-colors hover:bg-[var(--list-hover-background)] ${session.id === this.activeSessionId ? 'bg-[var(--list-hover-background)]' : ''}"
                   style="${session.id === this.activeSessionId ? 'border-left: 2px solid var(--accent-color);' : 'border-left: 2px solid transparent;'}"
                   @click=${() => this.switchSession(session.id)}>
                <div class="flex-1 min-w-0">
                  ${this.renamingSessionId === session.id ? html`
                    <input
                      type="text"
                      class="rename-input w-full text-[12px] px-2 py-1 rounded-md border outline-none"
                      .value=${this.renameInput}
                      @input=${(e: Event) => this.renameInput = (e.target as HTMLInputElement).value}
                      @keydown=${this.handleRenameKeyDown}
                      @blur=${() => this.saveRename()}
                      @click=${(e: Event) => e.stopPropagation()}
                    />
                  ` : html`
                    <div class="text-[12px] truncate font-medium" style="color: var(--app-foreground);"
                         @dblclick=${(e: Event) => {
                           e.stopPropagation();
                           this.startRenameSession(session);
                         }}>
                      ${session.name}
                    </div>
                  `}
                  <div class="text-[11px] mt-0.5" style="color: var(--app-disabled-foreground);">
                    ${session.messages.length} messages · ${this.formatTimestamp(session.updatedAt)}
                  </div>
                </div>
                <button class="p-1.5 rounded-md opacity-0 transition-opacity hover:bg-[var(--list-hover-background)] group-hover:opacity-100"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          this.deleteSession(session.id);
                        }}
                        style="color: var(--app-disabled-foreground);">
                  <os-icon name="trash" size="12"></os-icon>
                </button>
              </div>
            `)}
          `}
        </div>
      </div>
    `;
  }
}
