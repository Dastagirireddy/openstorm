import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-typing.js';
import type { AITyping } from '../../../src/components/ai-v2/ai/ai-typing.js';

async function renderTyping() {
  const el = document.createElement('openstorm-ai-typing') as AITyping;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-typing', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders three animated dots', async () => {
    const el = await renderTyping();
    const dots = el.shadowRoot!.querySelectorAll('.dot');
    expect(dots.length).toBe(3);
  });

  it('has typing container', async () => {
    const el = await renderTyping();
    const typing = el.shadowRoot!.querySelector('.typing')!;
    expect(typing).toBeTruthy();
  });
});
