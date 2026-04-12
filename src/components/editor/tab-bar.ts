import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ref, createRef } from 'lit/directives/ref.js';
import { TailwindElement } from '../../tailwind-element.js';
import type { EditorTab } from '../../lib/file-types.js';
import '../file-icon.js';

@customElement('tab-bar')
export class TabBar extends TailwindElement() {
  @property({ type: Array }) tabs: EditorTab[] = [];
  @property() activeTab = '';
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
        class="group flex items-center gap-2 min-w-[120px] max-w-[200px] h-full px-3 cursor-pointer border-r border-[#c7c7c7] transition-colors shrink-0
          ${isActive ? 'bg-white text-[#1a1a1a] border-t-2 border-t-[#3592c4]' : 'bg-[#f0f0f0] text-[#5a5a5a] hover:bg-[#e8e8e8] border-t-2 border-t-transparent'}"
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
          ? html`<span class="w-2 h-2 rounded-full bg-[#3592c4] flex-shrink-0"></span>`
          : html`
              <button
                class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#c7c7c7] transition-all flex-shrink-0"
                @click=${(e: MouseEvent) => {
                  e.stopPropagation();
                  this.closeTab(tab.id);
                }}>
                <svg class="w-3.5 h-3.5 text-[#5a5a5a] hover:text-[#1a1a1a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            `}
      </div>
    `;
  }

  private renderDropdownItem(tab: EditorTab): TemplateResult {
    const isActive = this.activeTab === tab.id;

    return html`
      <div
        class="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${isActive ? 'bg-[#b3d4ff] text-[#1a1a1a]' : 'text-[#1a1a1a] hover:bg-[#e8e8e8]'}"
        @click=${() => {
          this.selectTab(tab.id);
          this.showDropdown = false;
        }}>
        ${this.renderFileIcon(tab.path)}
        <span class="flex-1 text-[13px] truncate">${tab.name}</span>
        ${tab.modified ? html`<span class="w-2 h-2 rounded-full bg-[#3592c4] flex-shrink-0"></span>` : ''}
      </div>
    `;
  }

  render() {
    if (this.tabs.length === 0) return html``;

    return html`
      <div
        class="flex flex-row overflow-x-auto overflow-y-hidden bg-[#f0f0f0] border-b border-[#c7c7c7] h-[35px]"
        ${ref(this.tabsContainerRef)}>
        ${this.visibleTabs.map(tab => this.renderTab(tab))}
      </div>

      ${this.hiddenTabs.length > 0 ? html`
        <button
          class="dropdown-btn flex items-center justify-center px-2 h-full bg-[#f0f0f0] border-l border-[#c7c7c7] cursor-pointer text-[#5a5a5a] hover:text-[#1a1a1a] hover:bg-[#e0e0e0] transition-colors shrink-0"
          @click=${(e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            this.showDropdown = !this.showDropdown;
          }}
          title="Hidden tabs (${this.hiddenTabs.length})">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        ${this.showDropdown ? html`
          <div
            class="dropdown-menu absolute top-[66px] right-2 bg-white border border-[#c7c7c7] rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.15)] max-h-[calc(100vh-80px)] overflow-y-auto z-[1000] min-w-[260px] py-1"
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
