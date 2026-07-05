import { describe, it, expect, beforeEach } from 'vitest';
import '../../../src/components/ai-v2/layout/ai-task-sidebar.js';
import type { AITaskSidebar } from '../../../src/components/ai-v2/layout/ai-task-sidebar.js';
import type { SubAgent } from '../../../src/components/ai-v2/core/ai-state.js';

async function renderSidebar(agents: SubAgent[] = []) {
  const el = document.createElement('openstorm-ai-task-sidebar') as AITaskSidebar;
  el.subAgents = agents;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('openstorm-ai-task-sidebar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows empty state when no agents', async () => {
    const el = await renderSidebar([]);
    const empty = el.shadowRoot!.querySelector('.empty')!;
    expect(empty.textContent).toContain('No active agents');
  });

  it('renders agent cards', async () => {
    const agents: SubAgent[] = [
      { id: 'a1', task: 'Fix bug', role: 'debugger', status: 'running' },
      { id: 'a2', task: 'Write tests', role: 'tester', status: 'completed' },
    ];
    const el = await renderSidebar(agents);
    const cards = el.shadowRoot!.querySelectorAll('.agent-card');
    expect(cards.length).toBe(2);
  });

  it('displays agent task and role', async () => {
    const agents: SubAgent[] = [
      { id: 'a1', task: 'Refactor auth', role: 'architect', status: 'completed' },
    ];
    const el = await renderSidebar(agents);
    await el.updateComplete;
    const task = el.shadowRoot!.querySelector('.agent-task');
    const role = el.shadowRoot!.querySelector('.agent-role');
    expect(task).toBeTruthy();
    expect(task!.textContent).toContain('Refactor auth');
    expect(role!.textContent).toContain('architect');
  });

  it('shows agent count badge', async () => {
    const agents: SubAgent[] = [
      { id: 'a1', task: 'T1', role: 'r1', status: 'running' },
      { id: 'a2', task: 'T2', role: 'r2', status: 'completed' },
    ];
    const el = await renderSidebar(agents);
    const badge = el.shadowRoot!.querySelector('.badge')!;
    expect(badge.textContent).toContain('2');
  });

  it('applies status-specific classes', async () => {
    const agents: SubAgent[] = [
      { id: 'a1', task: 'Running', role: 'r', status: 'running' },
      { id: 'a2', task: 'Done', role: 'r', status: 'completed' },
      { id: 'a3', task: 'Failed', role: 'r', status: 'failed' },
    ];
    const el = await renderSidebar(agents);
    const icons = el.shadowRoot!.querySelectorAll('.status-icon');
    expect(icons.length).toBe(3);
    expect(icons[0].classList.contains('running')).toBe(true);
    expect(icons[1].classList.contains('completed')).toBe(true);
    expect(icons[2].classList.contains('failed')).toBe(true);
  });
});
