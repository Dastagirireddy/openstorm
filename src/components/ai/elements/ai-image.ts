import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('ai-image')
export class AiImage extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin: 0.75em 0;
    }

    .image-container {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      background: var(--ai-tool-background, #f9fafb);
    }

    .image-container:hover .image-overlay {
      opacity: 1;
    }

    img {
      display: block;
      max-width: 100%;
      height: auto;
      cursor: zoom-in;
    }

    .image-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .image-btn {
      background: rgba(255, 255, 255, 0.9);
      border: none;
      border-radius: 6px;
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
      color: #1f2937;
      transition: background 0.15s ease;
    }

    .image-btn:hover {
      background: #ffffff;
    }

    .image-caption {
      padding: 8px 12px;
      font-size: 12px;
      color: var(--ai-text-muted, #6b7280);
      text-align: center;
      border-top: 1px solid var(--ai-panel-border, #e5e7eb);
    }

    .image-error {
      padding: 2em;
      text-align: center;
      color: var(--ai-text-dim, #9ca3af);
    }

    .image-loading {
      padding: 2em;
      text-align: center;
      color: var(--ai-text-dim, #9ca3af);
    }
  `;

  @property({ type: String })
  src = '';

  @property({ type: String })
  alt = '';

  @property({ type: String })
  caption = '';

  @property({ type: Boolean })
  private loading = true;

  @property({ type: Boolean })
  private error = false;

  private handleLoad() {
    this.loading = false;
  }

  private handleError() {
    this.loading = false;
    this.error = true;
  }

  private async copyUrl() {
    try {
      await navigator.clipboard.writeText(this.src);
    } catch (err) {
      console.error('[AiImage] Copy URL failed:', err);
    }
  }

  private openInNewTab() {
    window.open(this.src, '_blank');
  }

  render() {
    return html`
      <div class="image-container">
        ${this.error
          ? html`<div class="image-error">Failed to load image</div>`
          : this.loading
            ? html`<div class="image-loading">Loading...</div>`
            : html`
              <img 
                src="${this.src}" 
                alt="${this.alt}"
                @load=${this.handleLoad}
                @error=${this.handleError}
              />
              <div class="image-overlay">
                <button class="image-btn" @click=${this.openInNewTab}>
                  <iconify-icon icon="lucide:external-link" width="14"></iconify-icon>
                  Open
                </button>
                <button class="image-btn" @click=${this.copyUrl}>
                  <iconify-icon icon="lucide:link" width="14"></iconify-icon>
                  Copy URL
                </button>
              </div>
            `}
        ${this.caption ? html`<div class="image-caption">${this.caption}</div>` : ''}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-image': AiImage;
  }
}
