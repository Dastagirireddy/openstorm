import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/primitives/os-spinner.js';
import type { OSSpinner } from '../../../src/components/ai-v2/primitives/os-spinner.js';

async function renderSpinner(size: string = 'sm') {
  const el = document.createElement('os-spinner') as OSSpinner;
  el.setAttribute('size', size);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('os-spinner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders spinner element', async () => {
    const el = await renderSpinner();
    const spinner = el.shadowRoot!.querySelector('.spinner')!;
    expect(spinner).toBeTruthy();
    expect(spinner.classList.contains('sm')).toBe(true);
  });

  it('applies size class', async () => {
    const el = await renderSpinner('lg');
    const spinner = el.shadowRoot!.querySelector('.spinner')!;
    expect(spinner.classList.contains('lg')).toBe(true);
  });

  it('applies xs size', async () => {
    const el = await renderSpinner('xs');
    const spinner = el.shadowRoot!.querySelector('.spinner')!;
    expect(spinner.classList.contains('xs')).toBe(true);
  });
});
