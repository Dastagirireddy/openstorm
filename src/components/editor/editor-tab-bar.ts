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
  @state() private showAddMenu = false;
  @state() private visibleTabs: EditorTab[] = [];
  @state() private hiddenTabs: EditorTab[] = [];

  private tabsContainerRef = createRef<HTMLDivElement>();
  private dropdownMenuRef = createRef<HTMLDivElement>();
  private addMenuRef = createRef<HTMLDivElement>();
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
    const tabWidth = 100;
    const dropdownBtnWidth = 32;
    const addBtnWidth = 28;
    const maxVisibleTabs = Math.max(1, Math.floor((containerWidth - dropdownBtnWidth - addBtnWidth) / tabWidth));

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
    const target = e.target as Node;

    if (this.showDropdown && this.dropdownMenuRef.value) {
      const clickedInside = this.dropdownMenuRef.value.contains(target);
      const clickedButton = (target as HTMLElement).closest('.dropdown-btn');

      if (!clickedInside && !clickedButton) {
        this.showDropdown = false;
      }
    }

    if (this.showAddMenu && this.addMenuRef.value) {
      const clickedInside = this.addMenuRef.value.contains(target);
      const clickedButton = (target as HTMLElement).closest('.add-btn');

      if (!clickedInside && !clickedButton) {
        this.showAddMenu = false;
      }
    }
  };

  private renderTabIcon(tab: EditorTab): TemplateResult {
    const tabType = tab.tabType || 'file';

    if (tabType === 'terminal') {
      return html`
        <os-icon name="terminal" size="12" color="var(--app-foreground)"></os-icon>
      `;
    }

    if (tabType === 'openstorm') {
      return html`
        <os-icon name="sparkles" size="12" color="var(--app-foreground)"></os-icon>
      `;
    }

    return html`
      <file-icon path="${tab.path}" size=${12}></file-icon>
    `;
  }

  private renderTab(tab: EditorTab): TemplateResult {
    const isActive = this.activeTab === tab.id;

    return html`
      <div
        class="group flex items-center gap-1 min-w-[80px] max-w-[140px] h-[28px] px-2 cursor-pointer transition-colors duration-100 shrink-0 rounded hover:bg-[var(--app-toolbar-active)]"
        style="background-color: ${isActive ? 'var(--app-tab-active)' : 'var(--app-tab-inactive)'}; color: ${isActive ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'};"
        data-tab-id="${tab.id}"
        @click=${() => this.selectTab(tab.id)}
        @auxclick=${(e: MouseEvent) => {
          if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            this.closeTab(tab.id);
          }
        }}>
        ${this.renderTabIcon(tab)}
        <span class="flex-1 text-[11px] truncate select-none font-medium">${tab.name}</span>
        ${tab.modified
          ? html`<span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: var(--app-tab-active-border);"></span>`
          : html`
              <button
                class="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity duration-100 flex-shrink-0 flex items-center justify-center hover:bg-[var(--app-toolbar-hover)]"
                style="color: var(--app-disabled-foreground);"
                @click=${(e: MouseEvent) => {
                  e.stopPropagation();
                  this.closeTab(tab.id);
                }}>
                <os-icon name="x" size="10"></os-icon>
              </button>
            `}
      </div>
    `;
  }

  private renderDropdownItem(tab: EditorTab): TemplateResult {
    const isActive = this.activeTab === tab.id;

    return html`
      <div
        class="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors duration-100 hover:bg-[var(--app-toolbar-hover)]"
        style="background-color: ${isActive ? 'var(--app-selection-background)' : 'transparent'}; color: ${isActive ? 'var(--app-selection-foreground)' : 'var(--app-foreground)'};"
        @click=${() => {
          this.selectTab(tab.id);
          this.showDropdown = false;
        }}>
        ${this.renderTabIcon(tab)}
        <span class="flex-1 text-[12px] truncate">${tab.name}</span>
        ${tab.modified ? html`<span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: var(--app-tab-active-border);"></span>` : ''}
      </div>
    `;
  }

  render() {
    if (this.tabs.length === 0) return html``;

    return html`
      <div class="flex items-center gap-1 h-full w-full">
        <div
          class="flex items-center gap-0.5 overflow-x-auto overflow-y-hidden flex-1 min-w-0"
          ${ref(this.tabsContainerRef)}>
          ${this.visibleTabs.map(tab => this.renderTab(tab))}
        </div>

        ${this.hiddenTabs.length > 0 ? html`
          <button
            class="dropdown-btn flex items-center justify-center w-6 h-6 shrink-0 cursor-pointer rounded hover:bg-[var(--app-toolbar-active)]"
            style="color: var(--app-disabled-foreground);"
            @click=${(e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              this.showDropdown = !this.showDropdown;
            }}
            title="Hidden tabs (${this.hiddenTabs.length})">
            <os-icon name="chevron-down" size="12"></os-icon>
          </button>

          ${this.showDropdown ? html`
            <div
              class="dropdown-menu absolute top-full left-0 mt-1 border rounded-md max-h-[calc(100vh-80px)] overflow-y-auto z-[1000] min-w-[200px] py-1"
              style="background-color: var(--app-bg); border-color: var(--app-border); box-shadow: 0 4px 20px rgba(0,0,0,0.2);"
              ${ref(this.dropdownMenuRef)}>
              ${this.hiddenTabs.map(tab => this.renderDropdownItem(tab))}
            </div>
          ` : ''}
        ` : ''}

        <div class="relative">
          <button
            class="add-btn flex items-center justify-center w-6 h-6 shrink-0 cursor-pointer rounded hover:bg-[var(--app-toolbar-active)]"
            style="color: var(--app-disabled-foreground);"
            title="New tab"
            @click=${(e: Event) => {
              e.stopPropagation();
              this.showAddMenu = !this.showAddMenu;
            }}>
            <os-icon name="plus" size="12"></os-icon>
          </button>

          ${this.showAddMenu ? html`
            <div
              class="absolute top-full right-0 mt-1 border rounded-md min-w-[160px] py-1 z-[1000]"
              style="background-color: var(--app-bg); border-color: var(--app-border); box-shadow: 0 4px 20px rgba(0,0,0,0.2);"
              ${ref(this.addMenuRef)}>
              <div
                class="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)]"
                style="color: var(--app-foreground);"
                @click=${() => {
                  this.showAddMenu = false;
                  this.dispatchEvent(new CustomEvent('tab-add', { detail: { type: 'terminal' }, bubbles: true, composed: true }));
                }}>
                <os-icon name="terminal" size="12"></os-icon>
                <span class="text-[12px]">Terminal</span>
              </div>
              <div
                class="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)]"
                style="color: var(--app-foreground);"
                @click=${() => {
                  this.showAddMenu = false;
                  this.dispatchEvent(new CustomEvent('tab-add', { detail: { type: 'file' }, bubbles: true, composed: true }));
                }}>
                <os-icon name="file" size="12"></os-icon>
                <span class="text-[12px]">New File</span>
              </div>
              <div
                class="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)]"
                style="color: var(--app-foreground);"
                @click=${() => {
                  this.showAddMenu = false;
                  this.dispatchEvent(new CustomEvent('tab-add', { detail: { type: 'openstorm' }, bubbles: true, composed: true }));
                }}>
                <os-icon name="sparkles" size="12"></os-icon>
                <span class="text-[12px]">OpenStorm AI</span>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
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
