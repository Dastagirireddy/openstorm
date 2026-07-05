import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/primitives/os-button.js';
import type { OSButton } from '../../../src/components/ai-v2/primitives/os-button.js';

async function renderButton(attrs: Partial<{ variant: string; size: string; disabled: boolean }> = {}) {
  const el = document.createElement('os-button') as OSButton;
  if (attrs.variant) el.setAttribute('variant', attrs.variant);
  if (attrs.size) el.setAttribute('size', attrs.size);
  if (attrs.disabled) el.setAttribute('disabled', '');
  el.textContent = 'Click me';
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('os-button', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders with default variant and size', async () => {
    const el = await renderButton();
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn).toBeTruthy();
    expect(el.textContent).toContain('Click me');
    expect(btn.classList.contains('ghost')).toBe(true);
    expect(btn.classList.contains('md')).toBe(true);
  });

  it('applies variant class', async () => {
    const el = await renderButton({ variant: 'primary' });
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.classList.contains('primary')).toBe(true);
  });

  it('applies size class', async () => {
    const el = await renderButton({ size: 'sm' });
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.classList.contains('sm')).toBe(true);
  });

  it('disabled attribute disables button', async () => {
    const el = await renderButton({ disabled: true });
    const btn = el.shadowRoot!.querySelector('button')!;
    expect(btn.disabled).toBe(true);
  });

  it('dispatches button-click on click', async () => {
    const el = await renderButton();
    const btn = el.shadowRoot!.querySelector('button')!;
    let received = false;
    el.addEventListener('button-click', () => { received = true; });
    btn.click();
    expect(received).toBe(true);
  });
});
