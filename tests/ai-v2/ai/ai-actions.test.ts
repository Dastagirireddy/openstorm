import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-actions.js';
import type { AIActions } from '../../../src/components/ai-v2/ai/ai-actions.js';

async function renderActions(messageId = 'msg-1', content = 'Test content') {
  const el = document.createElement('openstorm-ai-actions') as AIActions;
  el.messageId = messageId;
  el.content = content;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-actions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders action buttons', async () => {
    const el = await renderActions();
    const buttons = el.shadowRoot!.querySelectorAll('.btn');
    expect(buttons.length).toBe(4); // copy, retry, thumbs up, thumbs down
  });

  it('copy button copies to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const el = await renderActions('m1', 'copy me');
    const btns = el.shadowRoot!.querySelectorAll('.btn');
    (btns[0] as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 10));
    expect(writeText).toHaveBeenCalledWith('copy me');
  });

  it('retry button emits ai:retry', async () => {
    const el = await renderActions('msg-retry');
    let received = false;
    let detail: any = null;
    el.addEventListener('ai:retry', ((e: CustomEvent) => {
      received = true;
      detail = e.detail;
    }) as EventListener);
    const btns = el.shadowRoot!.querySelectorAll('.btn');
    (btns[1] as HTMLButtonElement).click();
    expect(received).toBe(true);
    expect(detail.messageId).toBe('msg-retry');
  });

  it('thumbs up emits ai:feedback with up', async () => {
    const el = await renderActions('msg-fb');
    let detail: any = null;
    el.addEventListener('ai:feedback', ((e: CustomEvent) => {
      detail = e.detail;
    }) as EventListener);
    const btns = el.shadowRoot!.querySelectorAll('.btn');
    (btns[2] as HTMLButtonElement).click();
    expect(detail.type).toBe('up');
    expect(detail.messageId).toBe('msg-fb');
  });

  it('thumbs down emits ai:feedback with down', async () => {
    const el = await renderActions('msg-fb2');
    let detail: any = null;
    el.addEventListener('ai:feedback', ((e: CustomEvent) => {
      detail = e.detail;
    }) as EventListener);
    const btns = el.shadowRoot!.querySelectorAll('.btn');
    (btns[3] as HTMLButtonElement).click();
    expect(detail.type).toBe('down');
  });
});
