import { html, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';

export type RightActivityItem = 'database' | '';

interface ActivityDefinition {
  id: RightActivityItem;
  label: string;
  icon: string;
}

@customElement('right-activity-bar')
export class RightActivityBar extends TailwindElement() {
  @state() activeItem: RightActivityItem = '';

  private readonly items: ActivityDefinition[] = [
    {
      id: 'database',
      label: 'Database',
      icon: 'mdi:database',
    },
  ];

  private setActive(item: RightActivityItem): void {
    this.activeItem = this.activeItem === item ? '' as RightActivityItem : item;
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
        class="gap-1 py-2 flex flex-col items-center justify-center cursor-pointer border-r-2 transition-colors relative group"
        style="border-right-color: transparent; background-color: ${isActive ? 'var(--activitybar-active-background)' : 'transparent'};"
        @mouseenter=${(e: Event) => {
          if (!isActive) (e.target as HTMLElement).style.backgroundColor = 'var(--activitybar-active-background)';
        }}
        @mouseleave=${(e: Event) => {
          if (!isActive) (e.target as HTMLElement).style.backgroundColor = 'transparent';
        }}
        @click=${() => this.setActive(item.id)}
        title="${item.label}">
        <div class="rotate-90" style="color: ${isActive ? 'var(--activitybar-active-foreground)' : 'var(--activitybar-inactive-foreground)'}; display: flex; align-items: center; justify-content: center;">
          <iconify-icon
            icon="${item.icon}"
            width="16"
            height="16">
          </iconify-icon>
        </div>
        <span
          class="text-[11px] font-medium tracking-wide"
          style="writing-mode: vertical-rl; transform: rotate(0deg); color: ${isActive ? 'var(--activitybar-active-foreground)' : 'var(--activitybar-inactive-foreground)'}; ${isActive ? 'font-weight: 600;' : ''}">
          ${item.label}
        </span>
      </div>
    `;
  }

  render() {
    return html`
      <div class="w-[28px] h-full flex flex-col shrink-0"
           style="background-color: var(--activitybar-background); border-left-color: var(--activitybar-border); border-left-width: 1px; border-left-style: solid;">
        <!-- Top Section: Main Activities -->
        <div class="flex flex-col gap-1">
          ${this.items.map(item => this.renderActivityItem(item))}
        </div>
      </div>
    `;
  }
}
