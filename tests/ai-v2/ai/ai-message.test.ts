import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-message.js';
import type { AIMessage } from '../../../src/components/ai-v2/ai/ai-message.js';
import type { AIMessage as AIMessageType } from '../../../src/components/ai-v2/core/ai-state.js';

async function renderMessage(msg: AIMessageType, streaming = false) {
  const el = document.createElement('openstorm-ai-message') as AIMessage;
  el.message = msg;
  el.streaming = streaming;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-message', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when message is null', async () => {
    const el = document.createElement('openstorm-ai-message') as AIMessage;
    el.message = null;
    document.body.appendChild(el);
    await el.updateComplete;
    const msg = el.shadowRoot!.querySelector('.message');
    expect(msg).toBeNull();
  });

  it('renders user message with correct layout', async () => {
    const msg: AIMessageType = {
      id: '1',
      role: 'user',
      content: 'Hello AI',
      timestamp: Date.now(),
    };
    const el = await renderMessage(msg);
    const wrapper = el.shadowRoot!.querySelector('.message')!;
    expect(wrapper.classList.contains('user')).toBe(true);
  });

  it('renders assistant message with different layout', async () => {
    const msg: AIMessageType = {
      id: '2',
      role: 'assistant',
      content: 'Hello user',
      timestamp: Date.now(),
    };
    const el = await renderMessage(msg);
    const wrapper = el.shadowRoot!.querySelector('.message')!;
    expect(wrapper.classList.contains('user')).toBe(false);
  });

  it('displays content in ai-content', async () => {
    const msg: AIMessageType = {
      id: '3',
      role: 'assistant',
      content: 'Test content',
      timestamp: Date.now(),
    };
    const el = await renderMessage(msg);
    const content = el.shadowRoot!.querySelector('openstorm-ai-content')!;
    expect(content).toBeTruthy();
  });

  it('displays timestamp', async () => {
    const ts = new Date(2026, 0, 15, 10, 30).getTime();
    const msg: AIMessageType = {
      id: '4',
      role: 'user',
      content: 'Hi',
      timestamp: ts,
    };
    const el = await renderMessage(msg);
    const meta = el.shadowRoot!.querySelector('.meta')!;
    expect(meta.textContent).toContain('You');
  });

  it('shows avatar', async () => {
    const msg: AIMessageType = {
      id: '5',
      role: 'assistant',
      content: 'Hi',
      timestamp: Date.now(),
    };
    const el = await renderMessage(msg);
    const avatar = el.shadowRoot!.querySelector('openstorm-ai-avatar')!;
    expect(avatar).toBeTruthy();
  });

  it('renders tool calls when present', async () => {
    const msg: AIMessageType = {
      id: '6',
      role: 'assistant',
      content: 'Done',
      timestamp: Date.now(),
      toolCalls: [
        { id: 'tc-1', name: 'read_file', args: { path: 'test.ts' }, status: 'completed' },
      ],
    };
    const el = await renderMessage(msg);
    const toolCalls = el.shadowRoot!.querySelector('openstorm-ai-tool-call')!;
    expect(toolCalls).toBeTruthy();
  });
});

describe('openstorm-ai-content', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('displays content text', async () => {
    const el = document.createElement('openstorm-ai-content') as any;
    el.content = 'Hello world';
    document.body.appendChild(el);
    await el.updateComplete;
    const div = el.shadowRoot!.querySelector('.content')!;
    expect(div.textContent).toContain('Hello world');
  });

  it('adds streaming class when streaming', async () => {
    const el = document.createElement('openstorm-ai-content') as any;
    el.content = 'Streaming...';
    el.streaming = true;
    document.body.appendChild(el);
    await el.updateComplete;
    const div = el.shadowRoot!.querySelector('.content')!;
    expect(div.classList.contains('streaming')).toBe(true);
  });
});
