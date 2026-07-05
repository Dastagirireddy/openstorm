import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-toolbar.js';
import type { AIToolbar } from '../../../src/components/ai-v2/ai/ai-toolbar.js';

async function renderToolbar() {
  const el = document.createElement('openstorm-ai-toolbar') as AIToolbar;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-toolbar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders toolbar with attach button', async () => {
    const el = await renderToolbar();
    const btn = el.shadowRoot!.querySelector('.btn')!;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('title')).toBe('Attach file');
  });

  it('dispatches ai:attach-file on click', async () => {
    const el = await renderToolbar();
    let received = false;
    el.addEventListener('ai:attach-file', () => { received = true; });
    const btn = el.shadowRoot!.querySelector('.btn')! as HTMLButtonElement;
    btn.click();
    expect(received).toBe(true);
  });
});
