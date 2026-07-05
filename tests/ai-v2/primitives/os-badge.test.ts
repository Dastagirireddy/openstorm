import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/primitives/os-badge.js';
import type { OSBadge } from '../../../src/components/ai-v2/primitives/os-badge.js';

async function renderBadge(variant: string = 'neutral', text: string = 'Label') {
  const el = document.createElement('os-badge') as OSBadge;
  el.setAttribute('variant', variant);
  el.textContent = text;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('os-badge', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders with neutral variant by default', async () => {
    const el = await renderBadge();
    const badge = el.shadowRoot!.querySelector('.badge')!;
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('neutral')).toBe(true);
  });

  it('applies variant class', async () => {
    const el = await renderBadge('danger');
    const badge = el.shadowRoot!.querySelector('.badge')!;
    expect(badge.classList.contains('danger')).toBe(true);
  });

  it('displays text content', async () => {
    const el = await renderBadge('info', 'Status');
    expect(el.textContent).toContain('Status');
  });

  it('supports all variants', async () => {
    for (const v of ['info', 'success', 'warning', 'danger', 'neutral']) {
      const el = await renderBadge(v);
      const badge = el.shadowRoot!.querySelector('.badge')!;
      expect(badge.classList.contains(v)).toBe(true);
    }
  });
});
