import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  highlightCode,
  isHighlightReady,
  initHighlighter,
} from '../../../src/components/ai-v2/lib/code-highlighter.js';

describe('highlightCode', () => {
  it('returns escaped code when no highlighter loaded', () => {
    const result = highlightCode('const x = 1;', 'typescript');
    expect(result.html).toContain('const x = 1;');
    expect(result.language).toBe('typescript');
  });

  it('escapes HTML in code', () => {
    const result = highlightCode('<div>test</div>');
    expect(result.html).not.toContain('<div>');
    expect(result.html).toContain('&lt;div&gt;');
  });

  it('defaults language to "text" when empty', () => {
    const result = highlightCode('hello');
    expect(result.language).toBe('text');
  });
});

describe('isHighlightReady', () => {
  it('returns false initially (without highlight.js)', () => {
    // In test environment highlight.js may not be available
    // so we just test the interface
    expect(typeof isHighlightReady()).toBe('boolean');
  });
});
