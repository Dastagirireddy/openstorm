import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../../src/components/ai-v2/primitives/os-code-block.js';
import type { OSCodeBlock } from '../../../src/components/ai-v2/primitives/os-code-block.js';

async function renderCodeBlock(code = 'const x = 1;', language = 'typescript') {
  const el = document.createElement('os-code-block') as OSCodeBlock;
  el.code = code;
  el.language = language;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('os-code-block', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders code content', async () => {
    const el = await renderCodeBlock('hello world');
    const code = el.shadowRoot!.querySelector('code')!;
    expect(code.textContent).toContain('hello world');
  });

  it('shows language in header', async () => {
    const el = await renderCodeBlock('x', 'rust');
    const header = el.shadowRoot!.querySelector('.header')!;
    expect(header.textContent).toContain('rust');
  });

  it('shows Copy button', async () => {
    const el = await renderCodeBlock();
    const btn = el.shadowRoot!.querySelector('.copy-btn')!;
    expect(btn.textContent).toContain('Copy');
  });

  it('copies code to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const el = await renderCodeBlock('test code');
    const btn = el.shadowRoot!.querySelector('.copy-btn')! as HTMLButtonElement;
    btn.click();
    await new Promise(r => setTimeout(r, 10));

    expect(writeText).toHaveBeenCalledWith('test code');
  });
});
