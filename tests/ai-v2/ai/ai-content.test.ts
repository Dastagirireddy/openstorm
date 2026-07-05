import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-content.js';
import type { AIContent } from '../../../src/components/ai-v2/ai/ai-content.js';

async function renderContent(content = 'Test content', streaming = false) {
  const el = document.createElement('openstorm-ai-content') as AIContent;
  el.content = content;
  el.streaming = streaming;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-content', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders content text', async () => {
    const el = await renderContent('Hello world');
    const div = el.shadowRoot!.querySelector('.content')!;
    expect(div.textContent).toContain('Hello world');
  });

  it('adds streaming class when streaming', async () => {
    const el = await renderContent('stream', true);
    const div = el.shadowRoot!.querySelector('.content')!;
    expect(div.classList.contains('streaming')).toBe(true);
  });

  it('does not add streaming class when not streaming', async () => {
    const el = await renderContent('static', false);
    const div = el.shadowRoot!.querySelector('.content')!;
    expect(div.classList.contains('streaming')).toBe(false);
  });

  it('renders empty content', async () => {
    const el = await renderContent('');
    const div = el.shadowRoot!.querySelector('.content')!;
    expect(div.textContent).toBe('');
  });
});
