import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatRelativeTime,
  formatTokens,
  formatCost,
  formatLatency,
} from '../../../src/components/ai-v2/lib/formatters.js';

describe('formatTime', () => {
  it('formats timestamp to HH:MM', () => {
    const ts = new Date(2026, 0, 15, 9, 5).getTime();
    expect(formatTime(ts)).toBe('09:05');
  });

  it('pads single digits', () => {
    const ts = new Date(2026, 0, 15, 0, 0).getTime();
    expect(formatTime(ts)).toBe('00:00');
  });

  it('handles noon', () => {
    const ts = new Date(2026, 0, 15, 13, 45).getTime();
    expect(formatTime(ts)).toBe('13:45');
  });
});

describe('formatRelativeTime', () => {
  it('returns "just now" for recent timestamps', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 30000)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 120000)).toBe('2m ago');
  });

  it('returns hours ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 7200000)).toBe('2h ago');
  });

  it('returns days ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 172800000)).toBe('2d ago');
  });
});

describe('formatTokens', () => {
  it('formats small numbers as-is', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(42)).toBe('42');
    expect(formatTokens(999)).toBe('999');
  });

  it('formats thousands with k suffix', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(12345)).toBe('12.3k');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokens(1000000)).toBe('1.0M');
    expect(formatTokens(2500000)).toBe('2.5M');
  });
});

describe('formatCost', () => {
  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats small cents with 3 decimals', () => {
    expect(formatCost(0.5)).toBe('$0.500');
  });

  it('formats larger amounts with 2 decimals', () => {
    expect(formatCost(1)).toBe('$1.00');
    expect(formatCost(12.34)).toBe('$12.34');
  });
});

describe('formatLatency', () => {
  it('formats milliseconds', () => {
    expect(formatLatency(500)).toBe('500ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('formats seconds with one decimal', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(2500)).toBe('2.5s');
  });
});
