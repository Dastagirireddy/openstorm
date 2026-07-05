import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-suggestions.js';
import type { AISuggestions } from '../../../src/components/ai-v2/ai/ai-suggestions.js';

async function renderSuggestions() {
  const el = document.createElement('openstorm-ai-suggestions') as AISuggestions;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-suggestions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders suggestion chips', async () => {
    const el = await renderSuggestions();
    const chips = el.shadowRoot!.querySelectorAll('.chip');
    expect(chips.length).toBeGreaterThan(0);
  });

  it('includes expected suggestions', async () => {
    const el = await renderSuggestions();
    const chips = Array.from(el.shadowRoot!.querySelectorAll('.chip'));
    const texts = chips.map(c => c.textContent?.trim());
    expect(texts).toContain('Explain this code');
    expect(texts).toContain('Fix the bug');
    expect(texts).toContain('Write tests');
  });

  it('emits ai:send-message on chip click', async () => {
    const el = await renderSuggestions();
    let received = false;
    let detail: any = null;
    el.addEventListener('ai:send-message', ((e: CustomEvent) => {
      received = true;
      detail = e.detail;
    }) as EventListener);
    const firstChip = el.shadowRoot!.querySelector('.chip')! as HTMLButtonElement;
    firstChip.click();
    expect(received).toBe(true);
    expect(detail.message).toBeTruthy();
  });
});
