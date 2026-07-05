import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-question-card.js';
import type { AIQuestionCard } from '../../../src/components/ai-v2/ai/ai-question-card.js';
import type { Question } from '../../../src/components/ai-v2/core/ai-state.js';

async function renderQuestionCard(questions: Question[] = []) {
  const el = document.createElement('openstorm-ai-question-card') as AIQuestionCard;
  el.questions = questions;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-question-card', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when no questions', async () => {
    const el = await renderQuestionCard([]);
    const card = el.shadowRoot!.querySelector('.question-card');
    expect(card).toBeNull();
  });

  it('renders question text', async () => {
    const el = await renderQuestionCard([
      { id: 'q1', text: 'Which language?', options: ['TS', 'Rust'], multiSelect: false },
    ]);
    const text = el.shadowRoot!.querySelector('.question-text')!;
    expect(text.textContent).toContain('Which language?');
  });

  it('renders option buttons', async () => {
    const el = await renderQuestionCard([
      { id: 'q1', text: 'Pick one', options: ['A', 'B', 'C'], multiSelect: false },
    ]);
    const options = el.shadowRoot!.querySelectorAll('.option');
    expect(options.length).toBe(3);
  });

  it('selects option on click', async () => {
    const el = await renderQuestionCard([
      { id: 'q1', text: 'Pick', options: ['X', 'Y'], multiSelect: false },
    ]);
    const optionY = Array.from(el.shadowRoot!.querySelectorAll('.option'))
      .find(o => o.textContent?.trim() === 'Y');
    optionY?.click();
    await el.updateComplete;
    expect(optionY?.classList.contains('selected')).toBe(true);
  });

  it('shows Submit button', async () => {
    const el = await renderQuestionCard([
      { id: 'q1', text: 'Q?', options: [], multiSelect: false },
    ]);
    const buttons = el.shadowRoot!.querySelectorAll('os-button');
    const texts = Array.from(buttons).map(b => b.textContent?.trim());
    expect(texts).toContain('Submit');
  });
});
