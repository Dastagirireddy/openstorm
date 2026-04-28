import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ref, createRef } from 'lit/directives/ref.js';
import { TailwindElement } from '../../tailwind-element.js';
import type { EditorTab } from '../../lib/types/file-types.js';
import '../layout/file-icon.js';
import '../layout/icon.js';

@customElement('tab-bar')
export class TabBar extends TailwindElement() {
  @property({ type: Array }) tabs: EditorTab[] = [];
  @property({ type: String }) activeTab = '';
  @property({ type: Number }) tabLimit = 10;

  @state() private showDropdown = false;
  @state() private visibleTabs: EditorTab[] = [];
  @state() private hiddenTabs: EditorTab[] = [];

  private tabsContainerRef = createRef<HTMLDivElement>();
  private dropdownMenuRef = createRef<HTMLDivElement>();
  private resizeObserver: ResizeObserver | null = null;

  firstUpdated(): void {
    document.addEventListener('click', this.handleOutsideClick);
    this.setupResizeObserver();
    this.updateVisibleTabs();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this.handleOutsideClick);
    this.resizeObserver?.disconnect();
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('tabs') || changedProperties.has('activeTab')) {
      this.updateVisibleTabs();
    }
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => this.updateVisibleTabs());
    if (this.tabsContainerRef.value) {
      this.resizeObserver.observe(this.tabsContainerRef.value);
    }
  }

  private updateVisibleTabs(): void {
    const container = this.tabsContainerRef.value;
    if (!container) {
      this.visibleTabs = this.tabs;
      this.hiddenTabs = [];
      return;
    }

    const containerWidth = container.clientWidth;
    const tabWidth = 120;
    const dropdownBtnWidth = 40;
    const maxVisibleTabs = Math.max(1, Math.floor((containerWidth - dropdownBtnWidth) / tabWidth));

    const pinnedTabs = this.tabs.filter(t => t.pinned);
    const unpinnedTabs = this.tabs.filter(t => !t.pinned);

    const remainingSlots = Math.max(0, maxVisibleTabs - pinnedTabs.length);

    if (unpinnedTabs.length <= remainingSlots) {
      this.visibleTabs = [...pinnedTabs, ...unpinnedTabs];
      this.hiddenTabs = [];
    } else {
      const activeTab = unpinnedTabs.find(t => t.id === this.activeTab);
      const nonActiveTabs = unpinnedTabs.filter(t => t.id !== this.activeTab);

      if (activeTab) {
        const otherVisible = nonActiveTabs.slice(0, remainingSlots - 1);
        const hidden = nonActiveTabs.slice(remainingSlots - 1);
        this.visibleTabs = [...pinnedTabs, activeTab, ...otherVisible];
        this.hiddenTabs = hidden;
      } else {
        this.visibleTabs = [...pinnedTabs, ...nonActiveTabs.slice(0, remainingSlots)];
        this.hiddenTabs = nonActiveTabs.slice(remainingSlots);
      }
    }
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.showDropdown && this.dropdownMenuRef.value) {
      const target = e.target as Node;
      const clickedInside = this.dropdownMenuRef.value.contains(target);
      const clickedButton = (target as HTMLElement).closest('.dropdown-btn');

      if (!clickedInside && !clickedButton) {
        this.showDropdown = false;
      }
    }
  };

  private renderFileIcon(path: string): TemplateResult {
    return html`
      <file-icon path="${path}" size=${16}></file-icon>
    `;
  }

  private renderTab(tab: EditorTab): TemplateResult {
    const isActive = this.activeTab === tab.id;

    return html`
      <div
        class="group flex items-center gap-2 min-w-[120px] max-w-[200px] h-full px-3 cursor-pointer border-r-0 transition-colors shrink-0 border-t-2"
        style="background-color: ${isActive ? 'var(--app-tab-active)' : 'var(--app-tab-inactive)'}; color: ${isActive ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'}; border-top-color: ${isActive ? 'var(--app-tab-active-border)' : 'transparent'};"
        @mouseenter=${(e: Event) => { if (!isActive) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
        @mouseleave=${(e: Event) => { if (!isActive) (e.target as HTMLElement).style.backgroundColor = 'var(--app-tab-inactive)'; }}
        data-tab-id="${tab.id}"
        @click=${() => this.selectTab(tab.id)}
        @auxclick=${(e: MouseEvent) => {
          if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            this.closeTab(tab.id);
          }
        }}>
        ${this.renderFileIcon(tab.path)}
        <span class="flex-1 text-[13px] truncate select-none">${tab.name}</span>
        ${tab.modified
          ? html`<span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: var(--app-tab-active-border);"></span>`
          : html`
              <button
                class="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all flex-shrink-0 flex items-center justify-center"
                style="color: var(--app-disabled-foreground);"
                @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-active)'; }}
                @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                @click=${(e: MouseEvent) => {
                  e.stopPropagation();
                  this.closeTab(tab.id);
                }}>
                <os-icon name="x" size="12"></os-icon>
              </button>
            `}
      </div>
    `;
  }

  private renderDropdownItem(tab: EditorTab): TemplateResult {
    const isActive = this.activeTab === tab.id;

    return html`
      <div
        class="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors"
        style="background-color: ${isActive ? 'var(--app-selection-background)' : 'transparent'}; color: var(--app-foreground);"
        @mouseenter=${(e: Event) => { if (!isActive) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
        @mouseleave=${(e: Event) => { if (!isActive) (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
        @click=${() => {
          this.selectTab(tab.id);
          this.showDropdown = false;
        }}>
        ${this.renderFileIcon(tab.path)}
        <span class="flex-1 text-[13px] truncate">${tab.name}</span>
        ${tab.modified ? html`<span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: var(--app-tab-active-border);"></span>` : ''}
      </div>
    `;
  }

  render() {
    if (this.tabs.length === 0) return html``;

    return html`
      <div
        class="flex flex-row overflow-x-auto overflow-y-hidden h-[35px]"
        style="background-color: var(--app-tab-inactive);"
        ${ref(this.tabsContainerRef)}>
        ${this.visibleTabs.map(tab => this.renderTab(tab))}
      </div>

      ${this.hiddenTabs.length > 0 ? html`
        <button
          class="dropdown-btn flex items-center justify-center px-2 h-full border-l cursor-pointer transition-colors shrink-0"
          style="background-color: var(--app-tab-inactive); border-left-color: var(--app-tab-border); color: var(--app-disabled-foreground);"
          @mouseenter=${(e: Event) => {
            (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)';
            (e.target as HTMLElement).style.color = 'var(--app-foreground)';
          }}
          @mouseleave=${(e: Event) => {
            (e.target as HTMLElement).style.backgroundColor = 'var(--app-tab-inactive)';
            (e.target as HTMLElement).style.color = 'var(--app-disabled-foreground)';
          }}
          @click=${(e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            this.showDropdown = !this.showDropdown;
          }}
          title="Hidden tabs (${this.hiddenTabs.length})">
          <os-icon name="chevron-down" size="16"></os-icon>
        </button>

        ${this.showDropdown ? html`
          <div
            class="dropdown-menu absolute top-[66px] right-2 border rounded-md max-h-[calc(100vh-80px)] overflow-y-auto z-[1000] min-w-[260px] py-1"
            style="background-color: var(--app-bg); border-color: var(--app-border); box-shadow: 0 4px 20px rgba(0,0,0,0.15);"
            ${ref(this.dropdownMenuRef)}>
            ${this.hiddenTabs.map(tab => this.renderDropdownItem(tab))}
          </div>
        ` : ''}
      ` : ''}
    `;
  }

  private selectTab(tabId: string): void {
    this.activeTab = tabId;
    this.dispatchEvent(new CustomEvent('tab-select', {
      detail: { tabId, timestamp: Date.now() },
      bubbles: true,
      composed: true,
    }));
    requestAnimationFrame(() => this.updateVisibleTabs());
  }

  private closeTab(tabId: string): void {
    this.dispatchEvent(new CustomEvent('tab-close', {
      detail: { tabId },
      bubbles: true,
      composed: true,
    }));
  }
}
