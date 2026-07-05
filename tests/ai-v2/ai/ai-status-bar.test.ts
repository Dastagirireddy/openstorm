import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-status-bar.js';
import type { AIStatusBar } from '../../../src/components/ai-v2/ai/ai-status-bar.js';

async function renderStatusBar(tokens = 0, cost = 0, latency = 0) {
  const el = document.createElement('openstorm-ai-status-bar') as AIStatusBar;
  el.totalTokens = tokens;
  el.totalCost = cost;
  el.lastLatencyMs = latency;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-status-bar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders status bar with metrics', async () => {
    const el = await renderStatusBar();
    const bar = el.shadowRoot!.querySelector('.status-bar')!;
    expect(bar).toBeTruthy();
  });

  it('displays token count', async () => {
    const el = await renderStatusBar(1234);
    const metrics = el.shadowRoot!.querySelectorAll('.metric-value');
    const texts = Array.from(metrics).map(m => m.textContent?.trim());
    expect(texts).toContain('1.2k');
  });

  it('displays cost', async () => {
    const el = await renderStatusBar(0, 5.50);
    const metrics = el.shadowRoot!.querySelectorAll('.metric-value');
    const texts = Array.from(metrics).map(m => m.textContent?.trim());
    expect(texts).toContain('$5.50');
  });

  it('displays latency', async () => {
    const el = await renderStatusBar(0, 0, 2500);
    const metrics = el.shadowRoot!.querySelectorAll('.metric-value');
    const texts = Array.from(metrics).map(m => m.textContent?.trim());
    expect(texts).toContain('2.5s');
  });
});
