import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Question } from '../core/ai-state.js';
import '../primitives/os-button.js';
import { dispatchAIEvent } from '../core/ai-events.js';

@customElement('openstorm-ai-question-card')
export class AIQuestionCard extends LitElement {
  static styles = css`
    :host { display: block; }
    .question-card {
      border-top: 1px solid var(--os-border);
      background: var(--os-surface);
      padding: 12px 16px;
    }
    .title {
      font-size: var(--os-text-xs);
      font-weight: 600;
      color: var(--os-text-muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .question {
      border: 1px solid var(--os-border);
      border-radius: var(--os-radius-md);
      padding: 12px;
      margin-bottom: 8px;
    }
    .question:last-child { margin-bottom: 0; }
    .question-text {
      font-size: var(--os-text-sm);
      font-weight: 500;
      margin-bottom: 8px;
    }
    .options {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .option {
      padding: 4px 12px;
      border-radius: var(--os-radius-sm);
      border: 1px solid var(--os-border);
      background: transparent;
      color: var(--os-text);
      font-size: var(--os-text-xs);
      cursor: pointer;
      transition: all var(--os-transition-fast);
    }
    .option:hover { background: var(--os-surface-2); }
    .option.selected {
      background: var(--os-accent);
      color: #fff;
      border-color: var(--os-accent);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
  `;

  @property({ type: Array }) questions: Question[] = [];
  @state() private selectedAnswers: Record<string, string | string[]> = {};

  private toggleOption(questionId: string, option: string, multiSelect: boolean) {
    const current = this.selectedAnswers[questionId];
    if (multiSelect) {
      const arr = (Array.isArray(current) ? current : []) as string[];
      const idx = arr.indexOf(option);
      this.selectedAnswers = {
        ...this.selectedAnswers,
        [questionId]: idx >= 0 ? arr.filter(o => o !== option) : [...arr, option],
      };
    } else {
      this.selectedAnswers = { ...this.selectedAnswers, [questionId]: option };
    }
  }

  private submit() {
    for (const q of this.questions) {
      dispatchAIEvent(this, 'ai:answer-question', {
        questionId: q.id,
        answers: { [q.id]: this.selectedAnswers[q.id] || '' },
      });
    }
  }

  render() {
    if (!this.questions.length) return html``;

    return html`
      <div class="question-card">
        <div class="title">Questions (${this.questions.length})</div>
        ${this.questions.map(q => html`
          <div class="question">
            <div class="question-text">${q.text}</div>
            ${q.options?.length ? html`
              <div class="options">
                ${q.options.map(opt => html`
                  <button
                    class="option ${this.selectedAnswers[q.id] === opt ? 'selected' : ''}"
                    @click=${() => this.toggleOption(q.id, opt, q.multiSelect)}
                  >${opt}</button>
                `)}
              </div>
            ` : ''}
          </div>
        `)}
        <div class="actions">
          <os-button variant="primary" size="sm" @click=${this.submit}>Submit</os-button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-question-card': AIQuestionCard;
  }
}
