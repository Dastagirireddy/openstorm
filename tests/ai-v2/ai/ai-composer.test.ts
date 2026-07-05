import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-composer.js';
import type { AIComposer } from '../../../src/components/ai-v2/ai/ai-composer.js';

async function renderComposer(isStreaming = false) {
  const el = document.createElement('openstorm-ai-composer') as AIComposer;
  el.isStreaming = isStreaming;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-composer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders textarea and Send button', async () => {
    const el = await renderComposer();
    const textarea = el.shadowRoot!.querySelector('textarea')!;
    const buttons = el.shadowRoot!.querySelectorAll('os-button');
    expect(textarea).toBeTruthy();
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('textarea is disabled when streaming', async () => {
    const el = await renderComposer(true);
    const textarea = el.shadowRoot!.querySelector('textarea')!;
    expect(textarea.disabled).toBe(true);
  });

  it('shows Stop button when streaming', async () => {
    const el = await renderComposer(true);
    const buttons = el.shadowRoot!.querySelectorAll('os-button');
    const texts = Array.from(buttons).map(b => b.textContent?.trim());
    expect(texts).toContain('Stop');
  });

  it('shows Send button when not streaming', async () => {
    const el = await renderComposer(false);
    const buttons = el.shadowRoot!.querySelectorAll('os-button');
    const texts = Array.from(buttons).map(b => b.textContent?.trim());
    expect(texts).toContain('Send');
  });

  it('emits ai:send-message on Send click', async () => {
    const el = await renderComposer();
    const textarea = el.shadowRoot!.querySelector('textarea')!;
    textarea.value = 'Test message';
    const sendBtn = Array.from(el.shadowRoot!.querySelectorAll('os-button'))
      .find(b => b.textContent?.includes('Send'));
    let received = false;
    el.addEventListener('ai:send-message', () => { received = true; });
    sendBtn?.click();
    expect(received).toBe(true);
  });

  it('emits ai:cancel on Stop click', async () => {
    const el = await renderComposer(true);
    const stopBtn = Array.from(el.shadowRoot!.querySelectorAll('os-button'))
      .find(b => b.textContent?.includes('Stop'));
    let received = false;
    el.addEventListener('ai:cancel', () => { received = true; });
    stopBtn?.click();
    expect(received).toBe(true);
  });

  it('renders attached files', async () => {
    const el = await renderComposer();
    el.attachedFiles = ['/path/to/file.ts', '/other/file.js'];
    await el.updateComplete;
    const attachments = el.shadowRoot!.querySelector('.attachments')!;
    expect(attachments).toBeTruthy();
    const chips = attachments.querySelectorAll('.attachment');
    expect(chips.length).toBe(2);
  });

  it('removes file on click', async () => {
    const el = await renderComposer();
    el.attachedFiles = ['/file.ts'];
    await el.updateComplete;
    const removeBtn = el.shadowRoot!.querySelector('.attachment button')! as HTMLButtonElement;
    removeBtn.click();
    await el.updateComplete;
    expect(el.attachedFiles).toEqual([]);
  });
});
