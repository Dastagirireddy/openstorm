import { html, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import '../layout/icon.js';

export type ActivityItem = 'explorer' | 'terminal' | 'ai' | 'graph';

interface ActivityDefinition {
  id: ActivityItem;
  label: string;
  icon: TemplateResult;
  filledIcon: TemplateResult;
}

@customElement('activity-bar')
export class ActivityBar extends TailwindElement() {
  @state() activeItem: ActivityItem = 'explorer';

  private readonly items: ActivityDefinition[] = [
    {
      id: 'explorer',
      label: 'Explorer',
      icon: html`<os-icon name="folder" size="16"></os-icon>`,
      filledIcon: html`<os-icon name="folder-check" size="16"></os-icon>`,
    },
    {
      id: 'terminal',
      label: 'Terminal',
      icon: html`<os-icon name="terminal" size="16"></os-icon>`,
      filledIcon: html`<os-icon name="terminal" size="16"></os-icon>`,
    },
    {
      id: 'ai',
      label: 'AI',
      icon: html`<os-icon name="sparkles" size="16"></os-icon>`,
      filledIcon: html`<os-icon name="sparkles" size="16"></os-icon>`,
    },
    {
      id: 'graph',
      label: 'Graph',
      icon: html`<os-icon name="git-branch" size="16"></os-icon>`,
      filledIcon: html`<os-icon name="git-branch" size="16"></os-icon>`,
    },
  ];

  private setActive(item: ActivityItem): void {
    this.activeItem = this.activeItem === item ? '' as ActivityItem : item;
    this.dispatchEvent(new CustomEvent('item-change', {
      detail: { item: this.activeItem },
      bubbles: true,
      composed: true,
    }));
  }

  private renderActivityItem(item: ActivityDefinition): TemplateResult {
    const isActive = this.activeItem === item.id;

    return html`
      <div
        class="gap-1 py-2 flex flex-col items-center justify-center cursor-pointer border-l-2 transition-colors duration-150 group hover:bg-[var(--activitybar-active-background)]"
        style="border-left-color: transparent; background-color: ${isActive ? 'var(--activitybar-active-background)' : 'transparent'};"
        @click=${() => this.setActive(item.id)}
        title="${item.label}">
        <span
          class="text-[11px] font-medium tracking-wide"
          style="writing-mode: vertical-rl; transform: rotate(180deg); margin-top: 4px; color: ${isActive ? 'var(--activitybar-active-foreground)' : 'var(--activitybar-inactive-foreground)'}; ${isActive ? 'font-weight: 600;' : ''}">
          ${item.label}
        </span>
        <div class="-rotate-90" style="color: ${isActive ? 'var(--activitybar-active-foreground)' : 'var(--activitybar-inactive-foreground)'};">
          ${isActive ? item.filledIcon : item.icon}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="w-[28px] h-full flex flex-col shrink-0"
           style="background-color: var(--activitybar-background); border-right-color: var(--activitybar-border); border-right-width: 1px; border-right-style: solid;">
        <!-- Main Activities -->
        <div class="flex flex-col gap-1">
          ${this.items.map(item => this.renderActivityItem(item))}
        </div>
      </div>
    `;
  }
}
