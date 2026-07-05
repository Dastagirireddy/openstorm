import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../../src/components/ai-v2/lib/markdown-renderer.js';

describe('renderMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('renders bold text', () => {
    const result = renderMarkdown('**bold**');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('renders italic text', () => {
    const result = renderMarkdown('*italic*');
    expect(result).toContain('<em>italic</em>');
  });

  it('renders inline code', () => {
    const result = renderMarkdown('Use `npm`');
    expect(result).toContain('<code>npm</code>');
  });

  it('renders code blocks', () => {
    const result = renderMarkdown('```js\nconst x = 1;\n```');
    expect(result).toContain('<pre><code class="language-js">');
    expect(result).toContain('const x = 1;');
  });

  it('renders headings', () => {
    expect(renderMarkdown('# H1')).toContain('<h1>H1</h1>');
    expect(renderMarkdown('## H2')).toContain('<h2>H2</h2>');
    expect(renderMarkdown('### H3')).toContain('<h3>H3</h3>');
    expect(renderMarkdown('#### H4')).toContain('<h4>H4</h4>');
  });

  it('renders links', () => {
    const result = renderMarkdown('[click](https://example.com)');
    expect(result).toContain('<a href="https://example.com" target="_blank">click</a>');
  });

  it('renders horizontal rule', () => {
    const result = renderMarkdown('---');
    expect(result).toContain('<hr>');
  });

  it('renders blockquote', () => {
    const result = renderMarkdown('> quote');
    expect(result).toContain('<blockquote>quote</blockquote>');
  });

  it('renders strikethrough', () => {
    const result = renderMarkdown('~~deleted~~');
    expect(result).toContain('<del>deleted</del>');
  });

  it('escapes HTML', () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('renders unordered lists', () => {
    const result = renderMarkdown('- item1\n- item2');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item1</li>');
    expect(result).toContain('<li>item2</li>');
  });
});
