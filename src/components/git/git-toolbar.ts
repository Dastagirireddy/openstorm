/**
 * Git Toolbar Component
 *
 * Toolbar for Git panel with search, filter buttons, and actions.
 */

import { html, css, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";
import { TailwindElement, getTailwindStyles } from "../../tailwind-element.js";
import "../layout/icon.js";

@customElement("git-toolbar")
export class GitToolbar extends TailwindElement() {
  static override styles: CSSResultGroup[] = [
    getTailwindStyles(),
    css`
      :host {
        display: block;
      }
    `,
  ];

  @property() searchQuery = "";
  @property() datePreset = "all";
  @property() filterAuthor = "";
  @property() filterPath = "";
  @property() filterMergesOnly = false;
  @property() filterNoMerges = false;
  @property() showBranchPanel = true;
  @property() showCommitDetails = true;
  @property() showTimeDropdown = false;
  @property() showAuthorDropdown = false;
  @property() showPathDropdown = false;
  @property() showMoreMenu = false;
  @property() filteredCount = 0;
  @property() totalCount = 0;
  @property() availableAuthors: Array<{ name: string; count: number }> = [];
  @property() availablePaths: string[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this._handleOutsideClick.bind(this));
  }

  private _handleOutsideClick(e: Event): void {
    const target = e.target as HTMLElement;
    const isInside = target.closest("#time-filter") ||
                     target.closest("#author-filter") ||
                     target.closest("#path-filter") ||
                     target.closest("#more-filters");
    if (!isInside) {
      this._closeAllDropdowns();
    }
  }

  private _closeAllDropdowns(): void {
    this.showTimeDropdown = false;
    this.showAuthorDropdown = false;
    this.showPathDropdown = false;
    this.showMoreMenu = false;
  }

  private _toggleDropdown(name: string): void {
    this._closeAllDropdowns();
    if (name === "time") this.showTimeDropdown = true;
    else if (name === "author") this.showAuthorDropdown = true;
    else if (name === "path") this.showPathDropdown = true;
    else if (name === "more") this.showMoreMenu = true;
  }

  render(): ReturnType<typeof html> {
    const hasFilters = !!(
      this.filterAuthor || this.filterMergesOnly || this.filterNoMerges ||
      this.datePreset !== "all"
    );

    return html`
      <div class="flex items-center gap-2 px-3 py-2 border-b border-[var(--app-border)]"
           style="background: var(--app-toolbar-background, var(--app-bg, #f5f5f5));">

        <!-- Left: Actions -->
        <div class="flex items-center gap-1">
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
            title="Toggle Branch Panel"
            @click=${() => this.dispatchEvent(new CustomEvent("toggle-branch-panel"))}>
            <os-icon name="sidebar" size="14"
                     color="${this.showBranchPanel ? "var(--brand-primary)" : "var(--app-foreground)"}"></os-icon>
          </button>

          <button
            class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
            title="Toggle Commit Details"
            @click=${() => this.dispatchEvent(new CustomEvent("toggle-commit-details"))}>
            <os-icon name="sidebar" size="14" class="rotate-180"
                     color="${this.showCommitDetails ? "var(--brand-primary)" : "var(--app-secondary-foreground)"}"></os-icon>
          </button>

          <div class="w-px h-5 bg-[var(--app-border)] mx-1"></div>

          <button
            class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
            title="Refresh"
            @click=${() => this.dispatchEvent(new CustomEvent("git-refresh"))}>
            <os-icon name="rotate-ccw" size="14" color="var(--app-foreground)"></os-icon>
          </button>
        </div>

        <!-- Middle: Search -->
        <div class="flex-1 flex items-center gap-2">
          <div class="relative flex-1 max-w-xs">
            <input
              type="text"
              class="w-full px-3 py-1.5 text-[11px] rounded-md border border-[var(--app-input-border)] bg-[var(--app-input-background)] text-[var(--app-input-foreground)] outline-none focus:ring-1 focus:ring-[var(--brand-primary)] transition-shadow"
              placeholder="Search commits by message, author, or hash..."
              value="${this.searchQuery}"
              @input=${(e: Event) => this.dispatchEvent(new CustomEvent("search-changed", {
                detail: { query: (e.target as HTMLInputElement).value }
              }))}
            />
            ${this.searchQuery
              ? html`
                  <button
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded hover:bg-[var(--app-toolbar-hover)] transition-colors"
                    @click=${() => this.dispatchEvent(new CustomEvent("search-changed", { detail: { query: "" } }))}>
                    <os-icon name="x" size="12" color="var(--app-secondary-foreground)"></os-icon>
                  </button>
                `
              : html`
                  <os-icon name="search" size="12" color="var(--app-secondary-foreground)"
                           class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"></os-icon>
                `}
          </div>

          <!-- Filter buttons -->
          <div class="flex items-center gap-1">
            <!-- Time filter -->
            <div class="relative" id="time-filter">
              <button
                class="px-2 py-1.5 text-[10px] rounded-md bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none hover:bg-[var(--app-toolbar-hover)] transition-shadow flex items-center gap-1"
                title="Time range"
                @click=${(e: Event) => { e.stopPropagation(); this._toggleDropdown("time"); }}>
                <os-icon name="clock" size="12"></os-icon>
                <span>${this.datePreset === "all" ? "Time" : this.datePreset}</span>
                <os-icon name="chevron-down" size="10"></os-icon>
              </button>
              ${this.showTimeDropdown ? this._renderTimeDropdown() : ""}
            </div>

            <!-- Author filter -->
            <div class="relative" id="author-filter">
              <button
                class="px-2 py-1.5 text-[10px] rounded-md bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none hover:bg-[var(--app-toolbar-hover)] transition-shadow flex items-center gap-1 ${this.filterAuthor ? "text-[var(--brand-primary)]" : ""}"
                title="Author"
                @click=${(e: Event) => { e.stopPropagation(); this._toggleDropdown("author"); }}>
                <os-icon name="user" size="12"></os-icon>
                <span>${this.filterAuthor || "Author"}</span>
                <os-icon name="chevron-down" size="10"></os-icon>
              </button>
              ${this.showAuthorDropdown ? this._renderAuthorDropdown() : ""}
            </div>

            <!-- Path filter -->
            <div class="relative" id="path-filter">
              <button
                class="px-2 py-1.5 text-[10px] rounded-md bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none hover:bg-[var(--app-toolbar-hover)] transition-shadow flex items-center gap-1 ${this.filterPath ? "text-[var(--brand-primary)]" : ""}"
                title="Path"
                @click=${(e: Event) => { e.stopPropagation(); this._toggleDropdown("path"); }}>
                <os-icon name="folder" size="12"></os-icon>
                <span>${this.filterPath || "Path"}</span>
                <os-icon name="chevron-down" size="10"></os-icon>
              </button>
              ${this.showPathDropdown ? this._renderPathDropdown() : ""}
            </div>

            <!-- More filters -->
            <div class="relative" id="more-filters">
              <button
                class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
                title="More filters"
                @click=${(e: Event) => { e.stopPropagation(); this._toggleDropdown("more"); }}>
                <os-icon name="sliders-horizontal" size="14"></os-icon>
              </button>
              ${this.showMoreMenu ? this._renderMoreMenu() : ""}
            </div>
          </div>

          <!-- Clear filters button -->
          ${hasFilters
            ? html`
                <div class="w-px h-5 bg-[var(--app-border)] mx-1"></div>
                <button
                  class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
                  title="Clear all filters"
                  @click=${() => this.dispatchEvent(new CustomEvent("clear-filters"))}>
                  <os-icon name="x" size="14" color="var(--brand-primary)"></os-icon>
                </button>
              `
            : ""}

          <div class="w-px h-5 bg-[var(--app-border)] mx-1"></div>

          <span class="text-[10px] font-medium text-[var(--app-secondary-foreground)]">
            ${this.filteredCount} of ${this.totalCount} commits
          </span>
        </div>
      </div>
    `;
  }

  private _renderTimeDropdown(): ReturnType<typeof html> {
    const options = [
      { value: "all", label: "All Time" },
      { value: "today", label: "Today" },
      { value: "yesterday", label: "Yesterday" },
      { value: "week", label: "Last 7 Days" },
      { value: "month", label: "Last 30 Days" },
      { value: "3months", label: "Last 90 Days" },
      { value: "6months", label: "Last 180 Days" },
      { value: "year", label: "Last Year" },
    ];

    return html`
      <div class="absolute top-full left-0 mt-1 z-50 min-w-[160px] py-1 rounded-md shadow-xl border border-[var(--app-border)]"
           style="background: var(--app-menu-background, #ffffff);"
           @click=${(e: Event) => e.stopPropagation()}>
        ${options.map(opt => html`
          <div
            class="px-3 py-1.5 text-[11px] cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center justify-between ${this.datePreset === opt.value ? "text-[var(--brand-primary)]" : "text-[var(--app-foreground)]"}"
            @click=${(e: Event) => {
              e.stopPropagation();
              this.dispatchEvent(new CustomEvent("date-preset-changed", { detail: { preset: opt.value } }));
            }}>
            <span>${opt.label}</span>
            ${this.datePreset === opt.value ? html`<os-icon name="check" size="12"></os-icon>` : ""}
          </div>
        `)}
      </div>
    `;
  }

  private _renderAuthorDropdown(): ReturnType<typeof html> {
    return html`
      <div
        class="absolute top-full left-0 mt-1 z-50 min-w-[200px] py-1 rounded-md shadow-xl border border-[var(--app-border)]"
        style="background: var(--app-menu-background, #ffffff);"
        @click=${(e: Event) => e.stopPropagation()}>
        <div class="px-3 py-2 border-b border-[var(--app-border)]">
          <input
            type="text"
            class="w-full px-2 py-1 text-[11px] rounded-md border border-[var(--app-border)] bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            placeholder="Filter authors..."
            value="${this.filterAuthor}"
            @input=${(e: Event) => this.dispatchEvent(new CustomEvent("filter-author", {
              detail: { author: (e.target as HTMLInputElement).value }
            }))}
          />
        </div>
        ${this.availableAuthors.length === 0
          ? html`<div class="px-3 py-2 text-[11px] text-[var(--app-secondary-foreground)]">No authors yet</div>`
          : this.availableAuthors.map(author => html`
              <div
                class="px-3 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center justify-between ${this.filterAuthor === author.name ? "bg-[var(--brand-primary)]/10" : ""}"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  const newAuthor = this.filterAuthor === author.name ? "" : author.name;
                  this.dispatchEvent(new CustomEvent("filter-author", { detail: { author: newAuthor } }));
                }}>
                <div class="flex items-center gap-2">
                  <div class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                       style="background-color: ${this._getAuthorColor(author.name)}">
                    ${this._getAuthorInitials(author.name)}
                  </div>
                  <span class="text-[11px] text-[var(--app-foreground)]">${author.name}</span>
                </div>
                <span class="text-[10px] text-[var(--app-secondary-foreground)]">${author.count}</span>
              </div>
            `)}
        ${this.filterAuthor
          ? html`
              <div class="px-3 py-2 border-t border-[var(--app-border)]">
                <button
                  class="w-full text-[11px] text-[var(--brand-primary)] hover:underline"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.dispatchEvent(new CustomEvent("filter-author", { detail: { author: "" } }));
                  }}>
                  Clear author filter
                </button>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private _renderPathDropdown(): ReturnType<typeof html> {
    return html`
      <div
        class="absolute top-full left-0 mt-1 z-50 min-w-[200px] py-1 rounded-md shadow-xl border border-[var(--app-border)]"
        style="background: var(--app-menu-background, #ffffff);"
        @click=${(e: Event) => e.stopPropagation()}>
        <div class="px-3 py-2 border-b border-[var(--app-border)]">
          <input
            type="text"
            class="w-full px-2 py-1 text-[11px] rounded-md border border-[var(--app-border)] bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            placeholder="Filter by path..."
            value="${this.filterPath}"
            @input=${(e: Event) => this.dispatchEvent(new CustomEvent("filter-path", {
              detail: { path: (e.target as HTMLInputElement).value }
            }))}
          />
        </div>
        ${this.availablePaths.length === 0
          ? html`<div class="px-3 py-2 text-[11px] text-[var(--app-secondary-foreground)]">Type to filter by path</div>`
          : this.availablePaths.slice(0, 10).map(path => html`
              <div
                class="px-3 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center gap-2 ${this.filterPath === path ? "bg-[var(--brand-primary)]/10" : ""}"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  const newPath = this.filterPath === path ? "" : path;
                  this.dispatchEvent(new CustomEvent("filter-path", { detail: { path: newPath } }));
                }}>
                <os-icon name="folder" size="12" color="var(--app-secondary-foreground)"></os-icon>
                <span class="text-[11px] text-[var(--app-foreground)]">${path}</span>
              </div>
            `)}
        ${this.filterPath
          ? html`
              <div class="px-3 py-2 border-t border-[var(--app-border)]">
                <button
                  class="w-full text-[11px] text-[var(--brand-primary)] hover:underline"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.dispatchEvent(new CustomEvent("filter-path", { detail: { path: "" } }));
                  }}>
                  Clear path filter
                </button>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private _renderMoreMenu(): ReturnType<typeof html> {
    return html`
      <div
        class="absolute top-full right-0 mt-1 z-50 min-w-[160px] py-1 rounded-md shadow-xl border border-[var(--app-border)]"
        style="background: var(--app-menu-background, #ffffff);"
        @click=${(e: Event) => e.stopPropagation()}>
        <div class="px-3 py-2 border-b border-[var(--app-border)]">
          <span class="text-[10px] font-semibold text-[var(--app-secondary-foreground)] uppercase tracking-wide">Filters</span>
        </div>
        <div
          class="px-3 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center justify-between ${this.filterMergesOnly ? "bg-[var(--brand-primary)]/10" : ""}"
          @click=${(e: Event) => {
            e.stopPropagation();
            this.dispatchEvent(new CustomEvent("toggle-merges-only"));
          }}>
          <div class="flex items-center gap-2">
            <os-icon name="git-merge" size="12" color="var(--app-secondary-foreground)"></os-icon>
            <span class="text-[11px] text-[var(--app-foreground)]">Merges only</span>
          </div>
          <os-icon name="${this.filterMergesOnly ? "check-square" : "square"}" size="12"
                   color="${this.filterMergesOnly ? "var(--brand-primary)" : "var(--app-secondary-foreground)"}"></os-icon>
        </div>
        <div
          class="px-3 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center justify-between ${this.filterNoMerges ? "bg-[var(--brand-primary)]/10" : ""}"
          @click=${(e: Event) => {
            e.stopPropagation();
            this.dispatchEvent(new CustomEvent("toggle-no-merges"));
          }}>
          <div class="flex items-center gap-2">
            <os-icon name="git-branch" size="12" color="var(--app-secondary-foreground)"></os-icon>
            <span class="text-[11px] text-[var(--app-foreground)]">Hide merges</span>
          </div>
          <os-icon name="${this.filterNoMerges ? "check-square" : "square"}" size="12"
                   color="${this.filterNoMerges ? "var(--brand-primary)" : "var(--app-secondary-foreground)"}"></os-icon>
        </div>
      </div>
    `;
  }

  private _getAuthorColor(author: string): string {
    let hash = 0;
    for (let i = 0; i < author.length; i++) {
      hash = (hash << 5) - hash + author.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 40%)`;
  }

  private _getAuthorInitials(author: string): string {
    const parts = author.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return author.slice(0, 2).toUpperCase();
  }
}
