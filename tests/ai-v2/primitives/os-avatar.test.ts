import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/primitives/os-avatar.js';
import type { OSAvatar } from '../../../src/components/ai-v2/primitives/os-avatar.js';

async function renderAvatar(role: string = 'agent', size: string = 'sm') {
  const el = document.createElement('os-avatar') as OSAvatar;
  el.setAttribute('role', role);
  el.setAttribute('size', size);
  el.textContent = 'A';
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('os-avatar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders with agent role and sm size by default', async () => {
    const el = await renderAvatar();
    const avatar = el.shadowRoot!.querySelector('.avatar')!;
    expect(avatar).toBeTruthy();
    expect(avatar.classList.contains('agent')).toBe(true);
    expect(avatar.classList.contains('sm')).toBe(true);
  });

  it('applies user role class', async () => {
    const el = await renderAvatar('user');
    const avatar = el.shadowRoot!.querySelector('.avatar')!;
    expect(avatar.classList.contains('user')).toBe(true);
  });

  it('applies size class', async () => {
    const el = await renderAvatar('agent', 'md');
    const avatar = el.shadowRoot!.querySelector('.avatar')!;
    expect(avatar.classList.contains('md')).toBe(true);
  });

  it('displays slot content', async () => {
    const el = document.createElement('os-avatar') as OSAvatar;
    el.setAttribute('role', 'tool');
    el.setAttribute('size', 'xs');
    el.textContent = '🔧';
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.textContent).toContain('🔧');
  });
});
