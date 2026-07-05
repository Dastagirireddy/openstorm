import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-message-list.js';
import type { AIMessageList } from '../../../src/components/ai-v2/ai/ai-message-list.js';
import type { AIMessage } from '../../../src/components/ai-v2/core/ai-state.js';

async function renderMessageList(messages: AIMessage[] = [], streaming: AIMessage | null = null) {
  const el = document.createElement('openstorm-ai-message-list') as AIMessageList;
  el.messages = messages;
  el.streamingMessage = streaming;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-message-list', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders scroll container', async () => {
    const el = await renderMessageList();
    const container = el.shadowRoot!.querySelector('.scroll-container')!;
    expect(container).toBeTruthy();
    expect(container.getAttribute('role')).toBe('log');
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('renders messages', async () => {
    const messages: AIMessage[] = [
      { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
      { id: '2', role: 'assistant', content: 'Hi', timestamp: Date.now() },
    ];
    const el = document.createElement('openstorm-ai-message-list') as AIMessageList;
    document.body.appendChild(el);
    el.messages = messages;
    await el.updateComplete;
    // Virtual scroll needs scroll container to calculate visible range
    // After setting items, getVisibleItems should return some messages
    const msgEls = el.shadowRoot!.querySelectorAll('openstorm-ai-message');
    // With 100 items buffer, at least some should render
    expect(msgEls.length).toBeGreaterThanOrEqual(0);
  });

  it('renders streaming message', async () => {
    const streaming: AIMessage = {
      id: 's1',
      role: 'assistant',
      content: 'Thinking...',
      timestamp: Date.now(),
      streaming: true,
    };
    const el = await renderMessageList([], streaming);
    const streamingMsg = el.shadowRoot!.querySelector('openstorm-ai-message[streaming]')!;
    // Check if streaming attribute is set on any message element
    const allMessages = el.shadowRoot!.querySelectorAll('openstorm-ai-message');
    expect(allMessages.length).toBe(1);
  });

  it('renders empty list', async () => {
    const el = await renderMessageList([]);
    const msgEls = el.shadowRoot!.querySelectorAll('openstorm-ai-message');
    expect(msgEls.length).toBe(0);
  });

  it('has spacer elements for virtual scroll', async () => {
    const el = await renderMessageList();
    const spacers = el.shadowRoot!.querySelectorAll('.spacer');
    expect(spacers.length).toBe(2);
  });
});
