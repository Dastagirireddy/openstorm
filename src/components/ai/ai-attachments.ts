import { html, css } from 'lit';
import { customElement, property, eventOptions } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import '../layout/icon.js';
import '../../lib/types/ai-types.js';
import type { AIAttachment } from '../../lib/types/ai-types.js';

@customElement('ai-attachments')
export class AiAttachments extends TailwindElement(css`
  .attachment-chip {
    transition: background 0.15s;
  }
  .attachment-chip:hover {
    background: var(--list-hover-background);
  }
  .remove-btn:hover {
    color: var(--app-foreground);
  }
`) {

  @property({ type: Array }) attachments: AIAttachment[] = [];
  @property({ type: Number }) maxAttachments = 5;

  private addAttachment() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;

      const newAttachments: AIAttachment[] = [];
      for (const file of Array.from(files).slice(0, this.maxAttachments - this.attachments.length)) {
        newAttachments.push({
          id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          path: file.name,
          name: file.name,
          type: 'file',
        });
      }
      if (newAttachments.length > 0) {
        this.dispatchEvent(new CustomEvent('attachments-add', {
          detail: { attachments: newAttachments },
          bubbles: true,
          composed: true,
        }));
      }
    };
    input.click();
  }

  private removeAttachment(id: string) {
    this.dispatchEvent(new CustomEvent('attachment-remove', {
      detail: { id },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="flex flex-wrap gap-1">
        ${this.attachments.map(att => html`
          <span class="attachment-chip flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                style="background: var(--editor-background); color: var(--app-disabled-foreground);">
            <os-icon name="file" size="10"></os-icon>
            ${att.name}
            <button class="remove-btn ml-0.5"
                    @click=${() => this.removeAttachment(att.id)}>
              <os-icon name="x" size="10"></os-icon>
            </button>
          </span>
        `)}
        ${this.attachments.length < this.maxAttachments ? html`
          <button class="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-dashed hover:border-solid"
                  style="border-color: var(--input-border); color: var(--app-disabled-foreground);"
                  @click=${() => this.addAttachment()}
                  title="Add File (max ${this.maxAttachments})">
            <os-icon name="paperclip" size="10"></os-icon>
            Add
          </button>
        ` : ''}
      </div>
    `;
  }
}
