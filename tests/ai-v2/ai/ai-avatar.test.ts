import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-avatar.js';
import type { AIAvatar } from '../../../src/components/ai-v2/ai/ai-avatar.js';

async function renderAiAvatar(role: string = 'agent', size: string = 'sm') {
  const el = document.createElement('openstorm-ai-avatar') as AIAvatar;
  el.setAttribute('role', role);
  el.setAttribute('size', size);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-avatar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders avatar with agent role', async () => {
    const el = await renderAiAvatar('agent', 'md');
    const avatar = el.shadowRoot!.querySelector('.avatar')!;
    expect(avatar.classList.contains('agent')).toBe(true);
    expect(avatar.classList.contains('md')).toBe(true);
  });

  it('displays initial for agent', async () => {
    const el = await renderAiAvatar('agent');
    const avatar = el.shadowRoot!.querySelector('.avatar')!;
    expect(avatar.textContent).toContain('A');
  });

  it('displays initial for user', async () => {
    const el = await renderAiAvatar('user');
    const avatar = el.shadowRoot!.querySelector('.avatar')!;
    expect(avatar.textContent).toContain('U');
  });

  it('displays initial for tool', async () => {
    const el = await renderAiAvatar('tool');
    const avatar = el.shadowRoot!.querySelector('.avatar')!;
    expect(avatar.textContent).toContain('T');
  });

  it('uses custom label over default initial', async () => {
    const el = document.createElement('openstorm-ai-avatar') as AIAvatar;
    el.role = 'agent';
    el.label = 'X';
    document.body.appendChild(el);
    await el.updateComplete;
    const avatar = el.shadowRoot!.querySelector('.avatar')!;
    expect(avatar.textContent).toContain('X');
  });
});
