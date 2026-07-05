import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-tool-call.js';
import type { AIToolCall } from '../../../src/components/ai-v2/ai/ai-tool-call.js';
import type { ToolCall } from '../../../src/components/ai-v2/core/ai-state.js';

async function renderToolCall(tc: ToolCall) {
  const el = document.createElement('openstorm-ai-tool-call') as AIToolCall;
  el.toolCall = tc;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-tool-call', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when toolCall is null', async () => {
    const el = document.createElement('openstorm-ai-tool-call') as AIToolCall;
    el.toolCall = null;
    document.body.appendChild(el);
    await el.updateComplete;
    const tc = el.shadowRoot!.querySelector('.tool-call');
    expect(tc).toBeNull();
  });

  it('renders tool name and status', async () => {
    const el = await renderToolCall({
      id: 'tc-1',
      name: 'read_file',
      args: { path: 'auth.rs' },
      status: 'completed',
    });
    const name = el.shadowRoot!.querySelector('.tool-name')!;
    const status = el.shadowRoot!.querySelector('.tool-status')!;
    expect(name.textContent).toContain('read_file');
    expect(status.textContent).toContain('completed');
  });

  it('expands on click to show args', async () => {
    const el = await renderToolCall({
      id: 'tc-2',
      name: 'write_file',
      args: { path: 'out.ts', content: 'hello' },
      status: 'running',
    });
    const trigger = el.shadowRoot!.querySelector('.trigger')! as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;
    const details = el.shadowRoot!.querySelector('.details')!;
    expect(details.classList.contains('open')).toBe(true);
    expect(details.textContent).toContain('path');
    expect(details.textContent).toContain('out.ts');
  });

  it('shows result when available', async () => {
    const el = await renderToolCall({
      id: 'tc-3',
      name: 'search_files',
      args: { query: 'auth' },
      status: 'completed',
      result: { output: 'Found 3 files' },
    });
    const trigger = el.shadowRoot!.querySelector('.trigger')! as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;
    const details = el.shadowRoot!.querySelector('.details')!;
    expect(details.textContent).toContain('Found 3 files');
  });

  it('collapses when clicked again', async () => {
    const el = await renderToolCall({
      id: 'tc-4',
      name: 'list_directory',
      args: { path: '.' },
      status: 'completed',
    });
    const trigger = el.shadowRoot!.querySelector('.trigger')! as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;
    trigger.click();
    await el.updateComplete;
    const details = el.shadowRoot!.querySelector('.details')!;
    expect(details).toBeNull();
  });
});
