import { html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import '../layout/icon.js';

@customElement('ai-completion')
export class AiCompletion extends TailwindElement(css`
  .completion-item {
    transition: background 0.1s;
  }
`) {

  @property({ type: Boolean }) show = false;
  @property({ type: Array }) results: string[] = [];
  @property({ type: Number }) selectedIndex = 0;

  private selectItem(index: number) {
    this.dispatchEvent(new CustomEvent('completion-select', {
      detail: { index },
      bubbles: true,
      composed: true,
    }));
  }

  private hoverItem(index: number) {
    this.dispatchEvent(new CustomEvent('completion-hover', {
      detail: { index },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this.show || this.results.length === 0) {
      return html``;
    }

    return html`
      <div class="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded border shadow-lg z-50"
           style="background: var(--menu-background); border-color: var(--panel-border);">
        ${this.results.map((result, index) => html`
          <div class="completion-item flex items-center gap-2 px-3 py-1.5 cursor-pointer ${index === this.selectedIndex ? 'bg-[var(--list-hover-background)]' : ''}"
               @click=${() => this.selectItem(index)}
               @mouseenter=${() => this.hoverItem(index)}>
            <os-icon name="file" size="12" style="color: var(--app-disabled-foreground);"></os-icon>
            <span class="text-[12px] truncate" style="color: var(--app-foreground);">${result}</span>
          </div>
        `)}
      </div>
    `;
  }
}
