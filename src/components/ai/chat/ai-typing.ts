import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import 'iconify-icon';

@customElement('openstorm-ai-typing')
export class AITyping extends LitElement {
  static styles = css`
    :host { display: block; }
    .typing {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      color: var(--ai-text-muted, #6b7280);
      font-size: 13px;
    }
    .loader {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .loader-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--ai-orange, #f97316);
      animation: loader-pulse 1.4s ease-in-out infinite;
    }
    .loader-dot:nth-child(1) { animation-delay: 0s; }
    .loader-dot:nth-child(2) { animation-delay: 0.2s; }
    .loader-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes loader-pulse {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }
    .step-info {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .step-label {
      font-weight: 500;
      color: var(--ai-text, #1f2937);
    }
    .thinking-text {
      color: var(--ai-orange, #f97316);
    }
  `;

  @property({ type: String }) stepDescription = '';
  @property({ type: Number }) stepNumber = 0;

  render() {
    return html`
      <div class="typing">
        <div class="loader">
          <span class="loader-dot"></span>
          <span class="loader-dot"></span>
          <span class="loader-dot"></span>
        </div>
        ${this.stepDescription
          ? html`
            <div class="step-info">
              <span class="step-label">Step ${this.stepNumber}:</span>
              <span>${this.stepDescription}</span>
            </div>
          `
          : html`<span class="thinking-text">Thinking...</span>`
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-typing': AITyping;
  }
}
