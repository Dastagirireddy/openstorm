import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/ai/ai-permission-bar.js';
import type { AIPermissionBar } from '../../../src/components/ai-v2/ai/ai-permission-bar.js';
import type { ToolApproval } from '../../../src/components/ai-v2/core/ai-state.js';

async function renderPermissionBar(approvals: ToolApproval[] = []) {
  const el = document.createElement('openstorm-ai-permission-bar') as AIPermissionBar;
  el.approvals = approvals;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-permission-bar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when no approvals', async () => {
    const el = await renderPermissionBar([]);
    const bar = el.shadowRoot!.querySelector('.permission-bar');
    expect(bar).toBeNull();
  });

  it('renders approval cards', async () => {
    const approvals: ToolApproval[] = [
      { toolCallId: 'tc-1', toolName: 'write_file', argsSummary: 'Write to auth.ts', riskLevel: 'high' },
      { toolCallId: 'tc-2', toolName: 'read_file', argsSummary: 'Read config.json', riskLevel: 'low' },
    ];
    const el = await renderPermissionBar(approvals);
    const cards = el.shadowRoot!.querySelectorAll('.approval-card');
    expect(cards.length).toBe(2);
  });

  it('displays tool name and risk level', async () => {
    const approvals: ToolApproval[] = [
      { toolCallId: 'tc-1', toolName: 'run_command', argsSummary: 'rm -rf /', riskLevel: 'high' },
    ];
    const el = await renderPermissionBar(approvals);
    const name = el.shadowRoot!.querySelector('.tool-name')!;
    expect(name.textContent).toContain('run_command');
    const badge = el.shadowRoot!.querySelector('os-badge')!;
    expect(badge.textContent).toContain('high');
  });

  it('shows Deny, Allow Once, Always Allow buttons', async () => {
    const approvals: ToolApproval[] = [
      { toolCallId: 'tc-1', toolName: 'delete', argsSummary: 'Delete file', riskLevel: 'medium' },
    ];
    const el = await renderPermissionBar(approvals);
    const buttons = el.shadowRoot!.querySelectorAll('os-button');
    const texts = Array.from(buttons).map(b => b.textContent?.trim());
    expect(texts).toContain('Deny');
    expect(texts).toContain('Allow Once');
    expect(texts).toContain('Always Allow');
  });

  it('emits ai:approve-tool with approved=false on Deny', async () => {
    const approvals: ToolApproval[] = [
      { toolCallId: 'tc-1', toolName: 'write', argsSummary: 'Write', riskLevel: 'high' },
    ];
    const el = await renderPermissionBar(approvals);
    let received = false;
    let detail: any = null;
    el.addEventListener('ai:approve-tool', ((e: CustomEvent) => {
      received = true;
      detail = e.detail;
    }) as EventListener);
    const denyBtn = Array.from(el.shadowRoot!.querySelectorAll('os-button'))
      .find(b => b.textContent?.includes('Deny'));
    denyBtn?.click();
    expect(received).toBe(true);
    expect(detail.toolCallId).toBe('tc-1');
    expect(detail.approved).toBe(false);
  });

  it('emits ai:approve-tool with approved=true on Allow Once', async () => {
    const approvals: ToolApproval[] = [
      { toolCallId: 'tc-2', toolName: 'read', argsSummary: 'Read', riskLevel: 'low' },
    ];
    const el = await renderPermissionBar(approvals);
    let received = false;
    let detail: any = null;
    el.addEventListener('ai:approve-tool', ((e: CustomEvent) => {
      received = true;
      detail = e.detail;
    }) as EventListener);
    const allowBtn = Array.from(el.shadowRoot!.querySelectorAll('os-button'))
      .find(b => b.textContent?.includes('Allow Once'));
    allowBtn?.click();
    expect(received).toBe(true);
    expect(detail.approved).toBe(true);
  });
});
