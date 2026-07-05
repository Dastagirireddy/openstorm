import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/primitives/os-markdown.js';
import type { OSMarkdown } from '../../../src/components/ai-v2/primitives/os-markdown.js';

async function renderMarkdown(content = 'Hello **world**') {
  const el = document.createElement('os-markdown') as OSMarkdown;
  el.content = content;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('os-markdown', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders markdown container', async () => {
    const el = await renderMarkdown('test');
    const md = el.shadowRoot!.querySelector('.markdown')!;
    expect(md).toBeTruthy();
  });

  it('renders bold text', async () => {
    const el = await renderMarkdown('**bold**');
    const md = el.shadowRoot!.querySelector('.markdown')!;
    expect(md.innerHTML).toContain('<strong>bold</strong>');
  });

  it('renders code blocks', async () => {
    const el = await renderMarkdown('```\nconst x = 1;\n```');
    const md = el.shadowRoot!.querySelector('.markdown')!;
    expect(md.innerHTML).toContain('<pre><code');
  });

  it('renders inline code', async () => {
    const el = await renderMarkdown('Use `npm install`');
    const md = el.shadowRoot!.querySelector('.markdown')!;
    expect(md.innerHTML).toContain('<code>npm install</code>');
  });

  it('renders headings', async () => {
    const el = await renderMarkdown('# Title');
    const md = el.shadowRoot!.querySelector('.markdown')!;
    expect(md.innerHTML).toContain('<h1>Title</h1>');
  });
});
