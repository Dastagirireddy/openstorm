import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('ai-file-link')
export class AiFileLink extends LitElement {
  static styles = css`
    :host {
      display: inline;
    }

    .file-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      background: var(--ai-tool-background, #f3f4f6);
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 4px;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-size: 12px;
      color: var(--ai-primary, #3574f0);
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .file-link:hover {
      background: var(--ai-primary, #3574f0);
      color: #ffffff;
      border-color: var(--ai-primary, #3574f0);
    }

    .file-icon {
      font-size: 12px;
    }

    .file-line {
      color: var(--ai-text-dim, #9ca3af);
    }

    .file-link:hover .file-line {
      color: rgba(255, 255, 255, 0.8);
    }
  `;

  @property({ type: String })
  path = '';

  @property({ type: Number, attribute: 'start-line' })
  startLine?: number;

  @property({ type: Number, attribute: 'end-line' })
  endLine?: number;

  private getFileIcon() {
    const ext = this.path.split('.').pop()?.toLowerCase();
    const icons: Record<string, string> = {
      'rs': 'lucide:file-code',
      'ts': 'lucide:file-code',
      'js': 'lucide:file-code',
      'tsx': 'lucide:file-code',
      'jsx': 'lucide:file-code',
      'py': 'lucide:file-code',
      'go': 'lucide:file-code',
      'json': 'lucide:file-json',
      'toml': 'lucide:file-cog',
      'yaml': 'lucide:file-cog',
      'yml': 'lucide:file-cog',
      'md': 'lucide:file-text',
      'txt': 'lucide:file-text',
    };
    return icons[ext || ''] || 'lucide:file';
  }

  private getFileName() {
    return this.path.split('/').pop() || this.path;
  }

  private handleClick(e: Event) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('file-open', {
      detail: {
        path: this.path,
        startLine: this.startLine,
        endLine: this.endLine,
      },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const lineInfo = this.startLine 
      ? this.endLine 
        ? `:${this.startLine}-${this.endLine}`
        : `:${this.startLine}`
      : '';

    return html`
      <a class="file-link" href="#" @click=${this.handleClick} title="${this.path}">
        <iconify-icon class="file-icon" icon="${this.getFileIcon()}" width="12"></iconify-icon>
        <span>${this.getFileName()}</span>
        ${lineInfo ? html`<span class="file-line">${lineInfo}</span>` : ''}
      </a>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-file-link': AiFileLink;
  }
}
