import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';

@customElement('status-bar')
export class StatusBar extends TailwindElement() {
  @state() private branch = 'main';
  @state() private cursorLine = 1;
  @state() private cursorCol = 1;
  @state() private encoding = 'UTF-8';
  @state() private lineEnding = 'LF';
  @state() private spaces = 4;
  @state() private hasErrors = false;
  @state() private hasWarnings = false;
  @state() private statusMessage = 'Ready';
  @state() terminalVisible = true;

  static properties = {
    terminalVisible: { type: Boolean },
  };

  private renderStatusItem(icon: ReturnType<typeof html>, label: string, hasHover = true): ReturnType<typeof html> {
    return html`
      <div class="flex items-center gap-1.5 ${hasHover ? 'hover:bg-[#eaeef2] hover:text-[#24292f] px-2 py-0.5 rounded cursor-pointer transition-colors' : ''}">
        ${icon}
        <span>${label}</span>
      </div>
    `;
  }

  private renderIconButton(icon: ReturnType<typeof html>, title: string, onClick: () => void): ReturnType<typeof html> {
    return html`
      <button
        class="p-1 hover:bg-[#eaeef2] hover:text-[#0969da] rounded transition-colors"
        title="${title}"
        @click=${onClick}>
        ${icon}
      </button>
    `;
  }

  render() {
    const branchIcon = html`
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="18" r="3"/>
        <circle cx="6" cy="6" r="3"/>
        <circle cx="18" cy="6" r="3"/>
        <path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9"/>
      </svg>
    `;

    const checkIcon = html`
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    `;

    const errorIcon = html`
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    `;

    const warningIcon = html`
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    `;

    const terminalIcon = html`
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    `;

    return html`
      <div
        class="flex h-[28px] items-center justify-between px-3 bg-[#f6f8fa] border-t border-[#d0d7de] text-[#57606a] text-[12px] shrink-0 select-none">

        <!-- Left section -->
        <div class="flex items-center gap-3">
          ${this.renderStatusItem(branchIcon, this.branch)}

          ${this.hasErrors
            ? this.renderStatusItem(errorIcon, '0 Errors', true)
            : ''}

          ${this.hasWarnings
            ? this.renderStatusItem(warningIcon, '0 Warnings', true)
            : ''}

          ${this.renderStatusItem(checkIcon, this.statusMessage)}

          <!-- Terminal toggle button -->
          ${this.renderIconButton(terminalIcon, 'Toggle Terminal (Ctrl+`)', () => {
            this.dispatchEvent(new CustomEvent('toggle-terminal', { bubbles: true }));
          })}
        </div>

        <!-- Right section -->
        <div class="flex items-center gap-3">
          ${this.cursorLine > 0
            ? html`<div class="flex items-center gap-1 hover:bg-[#eaeef2] hover:text-[#24292f] px-2 py-0.5 rounded cursor-pointer transition-colors font-mono">
                <span>Ln ${this.cursorLine}, Col ${this.cursorCol}</span>
              </div>`
            : ''}

          ${this.renderStatusItem(html``, `${this.spaces} spaces`, false)}
          ${this.renderStatusItem(html``, this.encoding.toUpperCase(), false)}
          ${this.renderStatusItem(html``, this.lineEnding, false)}
        </div>
      </div>
    `;
  }

  // Public API
  setCursorPosition(line: number, col: number): void {
    this.cursorLine = line;
    this.cursorCol = col;
  }

  setBranch(branch: string): void {
    this.branch = branch;
  }

  setHasErrors(hasErrors: boolean): void {
    this.hasErrors = hasErrors;
    this.hasWarnings = false;
  }

  setStatusMessage(message: string): void {
    this.statusMessage = message;
  }
}
