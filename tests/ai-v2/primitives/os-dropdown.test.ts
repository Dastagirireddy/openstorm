import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/primitives/os-dropdown.js';
import type { OSDropdown } from '../../../src/components/ai-v2/primitives/os-dropdown.js';

async function renderDropdown(options: Array<{ value: string; label: string }> = []) {
  const el = document.createElement('os-dropdown') as OSDropdown;
  el.options = options;
  el.value = options[0]?.value ?? '';
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('os-dropdown', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders trigger with selected label', async () => {
    const opts = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];
    const el = await renderDropdown(opts);
    const trigger = el.shadowRoot!.querySelector('.trigger')!;
    expect(trigger.textContent).toContain('Alpha');
  });

  it('opens menu on click', async () => {
    const el = await renderDropdown([{ value: 'a', label: 'A' }]);
    const trigger = el.shadowRoot!.querySelector('.trigger')! as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;
    const menu = el.shadowRoot!.querySelector('.menu')!;
    expect(menu.classList.contains('open')).toBe(true);
  });

  it('renders options in menu', async () => {
    const opts = [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }];
    const el = await renderDropdown(opts);
    const trigger = el.shadowRoot!.querySelector('.trigger')! as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;
    const options = el.shadowRoot!.querySelectorAll('.option');
    expect(options.length).toBe(2);
  });

  it('selects option and closes menu', async () => {
    const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
    const el = await renderDropdown(opts);
    const trigger = el.shadowRoot!.querySelector('.trigger')! as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;

    const optionB = el.shadowRoot!.querySelectorAll('.option')[1] as HTMLElement;
    optionB.click();
    await el.updateComplete;

    expect(el.value).toBe('b');
    const menu = el.shadowRoot!.querySelector('.menu')!;
    expect(menu.classList.contains('open')).toBe(false);
  });

  it('emits change event on select', async () => {
    const el = await renderDropdown([{ value: 'a', label: 'A' }]);
    let received = false;
    el.addEventListener('change', () => { received = true; });
    const trigger = el.shadowRoot!.querySelector('.trigger')! as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;
    const opt = el.shadowRoot!.querySelector('.option')! as HTMLElement;
    opt.click();
    expect(received).toBe(true);
  });
});
