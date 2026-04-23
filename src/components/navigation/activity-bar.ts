import { html, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';

export type ActivityItem = 'explorer' | 'search' | 'commits' | 'pull-requests' | 'settings';

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
      icon: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`,
      filledIcon: html`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`,
    },
    {
      id: 'search',
      label: 'Search',
      icon: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
      filledIcon: html`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    },
    {
      id: 'commits',
      label: 'Commits',
      icon: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M12 2v7M12 15v7M5 12h7"/></svg>`,
      filledIcon: html`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="2" r="2"/><circle cx="12" cy="22" r="2"/><circle cx="5" cy="12" r="2"/></svg>`,
    },
    {
      id: 'pull-requests',
      label: 'Pull Requests',
      icon: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12"/></svg>`,
      filledIcon: html`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7h-2V8h-3V6zM6 9h2v12H6V9z"/></svg>`,
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
        class="gap-1 py-2 flex flex-col items-center justify-center cursor-pointer border-l-2 transition-colors relative group"
        style="border-left-color: transparent; background-color: ${isActive ? 'var(--activitybar-active-background)' : 'transparent'};"
        @mouseenter=${(e: Event) => {
          if (!isActive) (e.target as HTMLElement).style.backgroundColor = 'var(--activitybar-active-background)';
        }}
        @mouseleave=${(e: Event) => {
          if (!isActive) (e.target as HTMLElement).style.backgroundColor = 'transparent';
        }}
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

  private renderSettingsItem(): TemplateResult {
    const isActive = this.activeItem === 'settings';

    return html`
      <div
        class="gap-1 flex flex-col items-center justify-center py-2 cursor-pointer border-l-2 transition-colors"
        style="border-left-color: transparent;"
        @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--activitybar-active-background)'}
        @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
        @click=${() => this.setActive('settings')}
        title="Settings">
        <span
          class="text-[11px] font-medium tracking-wide"
          style="writing-mode: vertical-rl; transform: rotate(180deg); margin-top: 4px; color: var(--activitybar-inactive-foreground);">
          Settings
        </span>
        <div style="color: ${isActive ? 'var(--activitybar-active-foreground)' : 'var(--activitybar-inactive-foreground)'};">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="w-[28px] h-full flex flex-col shrink-0"
           style="background-color: var(--activitybar-background); border-right-color: var(--activitybar-border); border-right-width: 1px; border-right-style: solid;">
        <!-- Top Section: Main Activities -->
        <div class="flex flex-col gap-1">
          ${this.items.map(item => this.renderActivityItem(item))}
        </div>

        <!-- Bottom Section: Settings -->
        <div class="mt-auto flex flex-col">
          ${this.renderSettingsItem()}
        </div>
      </div>
    `;
  }
}
