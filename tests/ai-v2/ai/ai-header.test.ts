import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-header.js';
import type { AIHeader } from '../../../src/components/ai-v2/ai/ai-header.js';

async function renderHeader(overrides: Partial<{ model: string; isStreaming: boolean; isConnected: boolean }> = {}) {
  const el = document.createElement('openstorm-ai-header') as AIHeader;
  if (overrides.model !== undefined) el.setAttribute('model', overrides.model);
  if (overrides.isStreaming) el.setAttribute('isStreaming', '');
  if (overrides.isConnected === false) el.setAttribute('isConnected', 'false');
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-header', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders header with label and avatar', async () => {
    const el = await renderHeader();
    const label = el.shadowRoot!.querySelector('.label')!;
    expect(label.textContent).toContain('OpenStorm AI');
    const avatar = el.shadowRoot!.querySelector('os-avatar')!;
    expect(avatar).toBeTruthy();
  });

  it('shows connected dot by default', async () => {
    const el = await renderHeader({ isConnected: true });
    const dot = el.shadowRoot!.querySelector('.dot')!;
    expect(dot.classList.contains('connected')).toBe(true);
  });

  it('shows disconnected dot', async () => {
    const el = document.createElement('openstorm-ai-header') as AIHeader;
    el.isConnected = false;
    document.body.appendChild(el);
    await el.updateComplete;
    const dot = el.shadowRoot!.querySelector('.dot')!;
    expect(dot.classList.contains('disconnected')).toBe(true);
  });

  it('shows Clear button when not streaming', async () => {
    const el = await renderHeader({ isStreaming: false });
    const buttons = el.shadowRoot!.querySelectorAll('os-button');
    const texts = Array.from(buttons).map(b => b.textContent?.trim());
    expect(texts).toContain('Clear');
  });

  it('shows Stop button when streaming', async () => {
    const el = await renderHeader({ isStreaming: true });
    const buttons = el.shadowRoot!.querySelectorAll('os-button');
    const texts = Array.from(buttons).map(b => b.textContent?.trim());
    expect(texts).toContain('Stop');
  });

  it('emits ai:select-model on model change', async () => {
    const el = await renderHeader();
    const select = el.shadowRoot!.querySelector('select')!;
    let received = false;
    el.addEventListener('ai:select-model', () => { received = true; });
    select.value = 'gpt-4o';
    select.dispatchEvent(new Event('change'));
    expect(received).toBe(true);
  });

  it('emits ai:cancel when Stop clicked', async () => {
    const el = await renderHeader({ isStreaming: true });
    const stopBtn = Array.from(el.shadowRoot!.querySelectorAll('os-button'))
      .find(b => b.textContent?.includes('Stop'));
    let received = false;
    el.addEventListener('ai:cancel', () => { received = true; });
    stopBtn?.click();
    expect(received).toBe(true);
  });
});
