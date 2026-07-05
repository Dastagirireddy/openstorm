import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/primitives/os-collapsible.js';
import type { OSCollapsible } from '../../../src/components/ai-v2/primitives/os-collapsible.js';

async function renderCollapsible(label: string = 'Section', isOpen: boolean = false) {
  const el = document.createElement('os-collapsible') as OSCollapsible;
  el.setAttribute('label', label);
  if (isOpen) el.setAttribute('open', '');
  el.innerHTML = '<p>Content here</p>';
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('os-collapsible', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders with label and collapsed by default', async () => {
    const el = await renderCollapsible('My Section');
    const trigger = el.shadowRoot!.querySelector('.trigger')!;
    const content = el.shadowRoot!.querySelector('.content')!;
    expect(trigger.textContent).toContain('My Section');
    expect(content.classList.contains('open')).toBe(false);
    expect(el.open).toBe(false);
  });

  it('toggles open state on click', async () => {
    const el = await renderCollapsible();
    const trigger = el.shadowRoot!.querySelector('.trigger')! as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;
    expect(el.open).toBe(true);
    const content = el.shadowRoot!.querySelector('.content')!;
    expect(content.classList.contains('open')).toBe(true);
  });

  it('renders open when open attribute is set', async () => {
    const el = await renderCollapsible('Section', true);
    const content = el.shadowRoot!.querySelector('.content')!;
    expect(content.classList.contains('open')).toBe(true);
  });

  it('rotates chevron when open', async () => {
    const el = await renderCollapsible();
    const chevron = el.shadowRoot!.querySelector('.chevron')!;
    expect(chevron.classList.contains('open')).toBe(false);

    const trigger = el.shadowRoot!.querySelector('.trigger')! as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;
    const chevronAfter = el.shadowRoot!.querySelector('.chevron')!;
    expect(chevronAfter.classList.contains('open')).toBe(true);
  });
});
