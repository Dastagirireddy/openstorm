import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/layout/ai-split-view.js';
import type { AISplitView } from '../../../src/components/ai-v2/layout/ai-split-view.js';

async function renderSplitView() {
  const el = document.createElement('openstorm-ai-split-view') as AISplitView;
  el.innerHTML = '<div slot="editor">Editor</div><div slot="chat">Chat</div>';
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-split-view', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders editor and chat panes', async () => {
    const el = await renderSplitView();
    const editorPane = el.shadowRoot!.querySelector('.editor-pane')!;
    const chatPane = el.shadowRoot!.querySelector('.chat-pane')!;
    expect(editorPane).toBeTruthy();
    expect(chatPane).toBeTruthy();
  });

  it('renders divider between panes', async () => {
    const el = await renderSplitView();
    const divider = el.shadowRoot!.querySelector('.divider')!;
    expect(divider).toBeTruthy();
  });

  it('has draggable divider', async () => {
    const el = await renderSplitView();
    const divider = el.shadowRoot!.querySelector('.divider')!;
    expect(divider.getAttribute('draggable')).toBe('true');
  });

  it('defaults split ratio to 0.6', async () => {
    const el = await renderSplitView();
    expect(el.splitRatio).toBe(0.6);
  });
});
