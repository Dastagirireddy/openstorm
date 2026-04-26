/**

 * Git Panel Component - IntelliJ Style (Bottom Panel)

 *

 * Follows IntelliJ's Git Log tool window layout:

 * - Bottom panel showing repository history

 * - Multi-pane view: branches, commit graph, changed files, commit details

 * - Used for viewing git log, repository status, and commit history

 */

import { html, svg, css, type CSSResultGroup } from "lit";

import { customElement, property, state } from "lit/decorators.js";

import { TailwindElement, getTailwindStyles } from "../tailwind-element.js";

import type {
  RepoInfo,
  RepoStatus,
  CommitEntry,
  BranchInfo,
  ChangedFile,
  CommitEntryWithStats,
} from "../lib/git-types.js";

import * as git from "../lib/git-api.js";

import {
  buildGraphData,
  type GraphData,
  type GraphCommit,
} from "../lib/git-graph.js";

import "./icon.js";

interface LogEntry extends CommitEntryWithStats {
  shortHash: string;

  date: string;

  dateTitle: string;

  branchLabels: string[];

  graphColor: string;
}

@customElement("git-panel")
export class GitPanel extends TailwindElement() {
  static override styles: CSSResultGroup[] = [
    getTailwindStyles(),

    css`
      :host {
        display: flex;

        flex-direction: column;

        width: 100%;

        height: 100%;

        overflow: hidden;
      }
    `,
  ];

  @property() projectPath = "";

  @property() height = 300;

  @state() private repoInfo: RepoInfo | null = null;

  @state() private currentBranch = "";

  @state() private branches: BranchInfo[] = [];

  @state() private commits: LogEntry[] = [];

  @state() private loading = false;

  @state() private error: string | null = null;

  @state() private selectedCommit: LogEntry | null = null;

  @state() private activeTab: "log" | "branches" = "log";

  @state() private showGraph = true;

  @state() private showCommitDetails = true;

  @state() private searchQuery = "";

  @state() private filterMergesOnly = false;

  @state() private filterNoMerges = false;

  @state() private filterBranch: string | "all" = "all";

  @state() private filterAuthor = "";

  @state() private filterSince = "";

  @state() private filterUntil = "";

  @state() private filterPath = "";

  @state() private datePreset = "all";

  @state() private showTimeDropdown = false;

  @state() private showAuthorDropdown = false;

  @state() private showPathDropdown = false;

  @state() private showMoreMenu = false;

  @state() private availableAuthors: Array<{ name: string; count: number }> = [];

  @state() private availablePaths: string[] = [];

  @state() private changedFiles: ChangedFile[] = [];

  @state() private diffPreview = "";

  @state() private branchColors = new Map<string, string>();

  @state() private repoStatus: RepoStatus | null = null;

  @state() private showBranchPanel = true;

  @state() private visibleBranches = new Set<string>();

  @state() private graphData: GraphData | null = null;

  connectedCallback(): void {
    super.connectedCallback();

    document.addEventListener("project-opened", (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string }>;

      this.projectPath = customEvent.detail.path;

      this.refreshData();
    });

    document.addEventListener("git-refresh", () => {
      this.refreshData();
    });

    document.addEventListener("git-initialized", () => {
      this.refreshData();
    });

    document.addEventListener("git-committed", () => {
      this.refreshData();
    });

    // Close dropdowns on click outside
    document.addEventListener("click", (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#time-filter") && !target.closest("#author-filter") &&
          !target.closest("#path-filter") && !target.closest("#more-filters")) {
        this.showTimeDropdown = false;
        this.showAuthorDropdown = false;
        this.showPathDropdown = false;
        this.showMoreMenu = false;
        this.requestUpdate();
      }
    });

    if (this.projectPath) {
      this.refreshData();
    }
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    if (changedProperties.has("projectPath") && this.projectPath) {
      this.refreshData();
    }
  }

  private async refreshData(): Promise<void> {
    if (!this.projectPath) return;

    this.loading = true;

    this.error = null;

    try {
      this.repoInfo = await git.gitCheckRepository(this.projectPath);

      if (this.repoInfo?.is_repository) {
        // Build filter object
        const filters: Record<string, string | boolean> = {};
        if (this.filterAuthor) filters.author = this.filterAuthor;
        if (this.filterSince) filters.since = this.filterSince;
        if (this.filterUntil) filters.until = this.filterUntil;
        if (this.filterPath) filters.path = this.filterPath;
        if (this.filterMergesOnly) filters.mergesOnly = true;
        if (this.filterNoMerges) filters.noMerges = true;

        const [branch, branches, commitLog, status] = await Promise.all([
          git.gitGetBranch(this.projectPath),

          git.gitListBranches(this.projectPath),

          Object.keys(filters).length > 0
            ? git.gitGetLog(this.projectPath, 100, filters)
            : git.gitGetLog(this.projectPath, 100),

          git.gitGetStatus(this.projectPath),
        ]);

        this.currentBranch = branch;

        this.branches = branches;

        this.repoStatus = status;

        // Assign colors to branches

        this.branchColors = this.assignBranchColors(branches);

        // Enrich commits with stats

        const commitsWithStats = await git.enrichCommitsWithStats(
          this.projectPath,
          commitLog,
        );

        this.commits = commitsWithStats.map((c) => ({
          ...c,

          shortHash: c.hash.substring(0, 7),

          date: this.formatDate(c.timestamp),

          dateTitle: new Date(c.timestamp * 1000).toLocaleString(),

          branchLabels: this.extractBranches(c.hash, branches),

          graphColor: this.getBranchColor(c.hash, branches),
        }));

        // Build graph data

        this.graphData = buildGraphData(commitsWithStats, this.branchColors);

        // Extract unique authors for dropdown
        this.availableAuthors = this.extractAuthors(commitsWithStats);
        // Extract paths asynchronously
        this.extractPathsFromCommits(commitsWithStats).then(paths => {
          this.availablePaths = paths;
          this.requestUpdate();
        });

        console.log("[git-panel] graphData:", this.graphData);
      } else {
        this.repoInfo = null;
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Failed to load git data";
    } finally {
      this.loading = false;

      this.requestUpdate();
    }
  }

  private formatDate(timestamp: number): string {
    try {
      const date = new Date(timestamp * 1000);

      const now = new Date();

      const diffMs = now.getTime() - date.getTime();

      const diffMins = Math.floor(diffMs / 60000);

      const diffHours = Math.floor(diffMs / 3600000);

      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";

      if (diffMins < 60) return `${diffMins}m ago`;

      if (diffHours < 24) return `${diffHours}h ago`;

      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return String(timestamp);
    }
  }

  private extractBranches(hash: string, branches: BranchInfo[]): string[] {
    const branchNames: string[] = [];

    for (const branch of branches) {
      const topCommit = branch.top_commit;

      if (topCommit && (topCommit === hash || hash.startsWith(topCommit))) {
        branchNames.push(branch.name);
      }
    }

    return branchNames;
  }

  private extractAuthors(commits: CommitEntryWithStats[]): Array<{ name: string; count: number }> {
    const authorMap = new Map<string, number>();
    for (const commit of commits) {
      const count = authorMap.get(commit.author) || 0;
      authorMap.set(commit.author, count + 1);
    }
    return Array.from(authorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  private async extractPathsFromCommits(commits: CommitEntryWithStats[]): Promise<string[]> {
    const pathSet = new Set<string>();
    // Get paths from the last few commits to populate the dropdown
    for (const commit of commits.slice(0, 20)) {
      try {
        const files = await git.getCommitChangedFiles(this.projectPath, commit.hash);
        for (const file of files) {
          // Extract directory path
          const dir = file.path.includes("/") ? file.path.substring(0, file.path.lastIndexOf("/")) : file.path;
          if (dir) pathSet.add(dir);
        }
      } catch {
        // Skip if we can't get files for this commit
      }
    }
    return Array.from(pathSet).sort();
  }

  private assignBranchColors(branches: BranchInfo[]): Map<string, string> {
    const colors = [
      "var(--brand-primary)",

      "var(--git-added)",

      "var(--git-modified)",

      "var(--git-deleted)",

      "var(--git-renamed)",

      "#f59e0b",

      "#8b5cf6",

      "#ec4899",

      "#06b6d4",

      "#84cc16",
    ];

    const colorMap = new Map<string, string>();

    branches.forEach((branch, i) => {
      colorMap.set(branch.name, colors[i % colors.length]);
    });

    return colorMap;
  }

  private getBranchColor(hash: string, branches: BranchInfo[]): string {
    for (const branch of branches) {
      const topCommit = branch.top_commit;

      if (topCommit && (topCommit === hash || hash.startsWith(topCommit))) {
        return this.branchColors.get(branch.name) || "var(--brand-primary)";
      }
    }

    return "var(--app-border)";
  }

  private isMergeCommit(commit: CommitEntry): boolean {
    return commit.parent_hashes && commit.parent_hashes.length > 1;
  }

  private getFilteredCommits(): LogEntry[] {
    // Search query is still filtered on frontend since it's a text search
    if (!this.searchQuery) {
      return this.commits;
    }

    return this.commits.filter((commit) => {
      const query = this.searchQuery.toLowerCase();

      if (
        !commit.subject.toLowerCase().includes(query) &&
        !commit.author.toLowerCase().includes(query) &&
        !commit.shortHash.toLowerCase().includes(query)
      ) {
        return false;
      }

      return true;
    });
  }

  private async selectCommit(commit: LogEntry): Promise<void> {
    this.selectedCommit = commit;

    try {
      const [files, diff] = await Promise.all([
        git.getCommitChangedFiles(this.projectPath, commit.hash),

        git.gitShowCommit(this.projectPath, commit.hash),
      ]);

      this.changedFiles = files;

      this.diffPreview = diff;
    } catch {
      this.changedFiles = [];

      this.diffPreview = "";
    }

    this.requestUpdate();
  }

  private renderToolbar(): ReturnType<typeof html> {
    const filteredCount = this.getFilteredCommits().length;

    const totalCount = this.commits.length;

    return html`
      <div
        class="flex items-center gap-2 px-3 py-2 border-b border-[var(--app-border)]"
        style="background: var(--app-toolbar-background, var(--app-bg, #f5f5f5));"
      >
        <!-- Left: Actions -->
        <div class="flex items-center gap-1">
          ${this.activeTab === "log"
            ? html`
                <button
                  class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
                  title="Toggle Branch Panel"
                  @click=${() => {
                    this.showBranchPanel = !this.showBranchPanel;
                    this.requestUpdate();
                  }}
                >
                  <os-icon
                    name="sidebar"
                    size="14"
                    color="${this.showBranchPanel
                      ? "var(--brand-primary)"
                      : "var(--app-foreground)"}"
                  ></os-icon>
                </button>
              `
            : ""}

          <button
            class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
            title="Toggle Commit Details"
            @click=${() => {
              this.showCommitDetails = !this.showCommitDetails;
              this.requestUpdate();
            }}
          >
            <os-icon
              name="sidebar"
              size="14"
              class="rotate-180"
              color="${this.showCommitDetails
                ? "var(--brand-primary)"
                : "var(--app-secondary-foreground)"}"
            ></os-icon>
          </button>

          <div class="w-px h-5 bg-[var(--app-border)] mx-1"></div>

          <button
            class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
            title="Refresh"
            @click=${() => this.refreshData()}
          >
            <os-icon
              name="rotate-ccw"
              size="14"
              color="var(--app-foreground)"
            ></os-icon>
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
              @input=${(e: Event) => {
                this.searchQuery = (e.target as HTMLInputElement).value;
                this.requestUpdate();
              }}
            />

            ${this.searchQuery
              ? html`
                  <button
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded hover:bg-[var(--app-toolbar-hover)] transition-colors"
                    @click=${() => {
                      this.searchQuery = "";
                      this.requestUpdate();
                    }}
                  >
                    <os-icon name="x" size="12" color="var(--app-secondary-foreground)"></os-icon>
                  </button>
                `
              : html`
                  <os-icon
                    name="search"
                    size="12"
                    color="var(--app-secondary-foreground)"
                    class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                  ></os-icon>
                `}
          </div>

          <!-- Filter buttons -->
          <div class="flex items-center gap-1">
            <!-- Time filter dropdown -->
            <div class="relative" id="time-filter">
              <button
                class="px-2 py-1.5 text-[10px] rounded-md bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none hover:bg-[var(--app-toolbar-hover)] transition-shadow flex items-center gap-1"
                title="Time range"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this.showTimeDropdown = !this.showTimeDropdown;
                  this.showAuthorDropdown = false;
                  this.showPathDropdown = false;
                  this.showMoreMenu = false;
                  this.requestUpdate();
                }}
              >
                <os-icon name="clock" size="12"></os-icon>
                <span>${this.datePreset === "all" ? "Time" : this.datePreset}</span>
                <os-icon name="chevron-down" size="10"></os-icon>
              </button>
              ${this.showTimeDropdown ? this.renderTimeDropdown() : ""}
            </div>

            <!-- Author filter dropdown -->
            <div class="relative" id="author-filter">
              <button
                class="px-2 py-1.5 text-[10px] rounded-md bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none hover:bg-[var(--app-toolbar-hover)] transition-shadow flex items-center gap-1 ${this.filterAuthor ? "text-[var(--brand-primary)]" : ""}"
                title="Author"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this.showAuthorDropdown = !this.showAuthorDropdown;
                  this.showTimeDropdown = false;
                  this.showPathDropdown = false;
                  this.showMoreMenu = false;
                  this.requestUpdate();
                }}
              >
                <os-icon name="user" size="12"></os-icon>
                <span>${this.filterAuthor || "Author"}</span>
                <os-icon name="chevron-down" size="10"></os-icon>
              </button>
              ${this.showAuthorDropdown ? this.renderAuthorDropdown() : ""}
            </div>

            <!-- Path filter dropdown -->
            <div class="relative" id="path-filter">
              <button
                class="px-2 py-1.5 text-[10px] rounded-md bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none hover:bg-[var(--app-toolbar-hover)] transition-shadow flex items-center gap-1 ${this.filterPath ? "text-[var(--brand-primary)]" : ""}"
                title="Path"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this.showPathDropdown = !this.showPathDropdown;
                  this.showTimeDropdown = false;
                  this.showAuthorDropdown = false;
                  this.showMoreMenu = false;
                  this.requestUpdate();
                }}
              >
                <os-icon name="folder" size="12"></os-icon>
                <span>${this.filterPath || "Path"}</span>
                <os-icon name="chevron-down" size="10"></os-icon>
              </button>
              ${this.showPathDropdown ? this.renderPathDropdown() : ""}
            </div>

            <!-- More filters menu -->
            <div class="relative" id="more-filters">
              <button
                class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
                title="More filters"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this.showMoreMenu = !this.showMoreMenu;
                  this.showTimeDropdown = false;
                  this.showAuthorDropdown = false;
                  this.showPathDropdown = false;
                  this.requestUpdate();
                }}
              >
                <os-icon name="sliders-horizontal" size="14"></os-icon>
              </button>
              ${this.showMoreMenu ? this.renderMoreMenu() : ""}
            </div>
          </div>

          <!-- Clear filters button -->
          ${this.hasActiveFilters()
            ? html`
                <div class="w-px h-5 bg-[var(--app-border)] mx-1"></div>
                <button
                  class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors"
                  title="Clear all filters"
                  @click=${() => this.clearAllFilters()}
                >
                  <os-icon name="x" size="14" color="var(--brand-primary)"></os-icon>
                </button>
              `
            : ""}

          <div class="w-px h-5 bg-[var(--app-border)] mx-1"></div>

          <span class="text-[10px] font-medium text-[var(--app-secondary-foreground)]">
            ${filteredCount} of ${totalCount} commits
          </span>
        </div>
      </div>
    `;
  }

  private renderTimeDropdown(): ReturnType<typeof html> {
    return html`
      <div
        class="absolute top-full left-0 mt-1 z-50 min-w-[160px] py-1 rounded-md shadow-xl border border-[var(--app-border)]"
        style="background: var(--app-menu-background, #ffffff);"
        @click=${(e: Event) => {
          e.stopPropagation();
          this.showTimeDropdown = false;
          this.requestUpdate();
        }}
      >
        ${[
          { value: "all", label: "All Time" },
          { value: "today", label: "Today" },
          { value: "yesterday", label: "Yesterday" },
          { value: "week", label: "Last 7 Days" },
          { value: "month", label: "Last 30 Days" },
          { value: "3months", label: "Last 90 Days" },
          { value: "6months", label: "Last 180 Days" },
          { value: "year", label: "Last Year" },
        ].map(
          (opt) => html`
            <div
              class="px-3 py-1.5 text-[11px] cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center justify-between ${this.datePreset === opt.value ? "text-[var(--brand-primary)]" : "text-[var(--app-foreground)]"}"
              @click=${(e: Event) => {
                e.stopPropagation();
                this.datePreset = opt.value;
                this.applyDatePreset(opt.value);
                this.showTimeDropdown = false;
                this.refreshData();
              }}
            >
              <span>${opt.label}</span>
              ${this.datePreset === opt.value ? html`<os-icon name="check" size="12"></os-icon>` : ""}
            </div>
          `,
        )}
      </div>
    `;
  }

  private renderAuthorDropdown(): ReturnType<typeof html> {
    return html`
      <div
        class="absolute top-full left-0 mt-1 z-50 min-w-[200px] py-1 rounded-md shadow-xl border border-[var(--app-border)]"
        style="background: var(--app-menu-background, #ffffff);"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="px-3 py-2 border-b border-[var(--app-border)]">
          <input
            type="text"
            class="w-full px-2 py-1 text-[11px] rounded-md border border-[var(--app-border)] bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            placeholder="Filter authors..."
            value="${this.filterAuthor}"
            @input=${(e: Event) => {
              e.stopPropagation();
              this.filterAuthor = (e.target as HTMLInputElement).value;
            }}
            @blur=${() => {
              if (this.filterAuthor) this.refreshData();
            }}
          />
        </div>
        ${this.availableAuthors.length === 0
          ? html`<div class="px-3 py-2 text-[11px] text-[var(--app-secondary-foreground)]">No authors yet</div>`
          : this.availableAuthors.map(
              (author) => html`
                <div
                  class="px-3 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center justify-between ${this.filterAuthor === author.name ? "bg-[var(--brand-primary)]/10" : ""}"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.filterAuthor = this.filterAuthor === author.name ? "" : author.name;
                    this.showAuthorDropdown = false;
                    this.refreshData();
                  }}
                >
                  <div class="flex items-center gap-2">
                    <div
                      class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style="background-color: ${this.getAuthorColor(author.name)}"
                    >
                      ${this.getAuthorInitials(author.name)}
                    </div>
                    <span class="text-[11px] text-[var(--app-foreground)]">${author.name}</span>
                  </div>
                  <span class="text-[10px] text-[var(--app-secondary-foreground)]">${author.count}</span>
                </div>
              `,
            )}
        ${this.filterAuthor
          ? html`
              <div class="px-3 py-2 border-t border-[var(--app-border)]">
                <button
                  class="w-full text-[11px] text-[var(--brand-primary)] hover:underline"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.filterAuthor = "";
                    this.showAuthorDropdown = false;
                    this.refreshData();
                  }}
                >
                  Clear author filter
                </button>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private renderPathDropdown(): ReturnType<typeof html> {
    return html`
      <div
        class="absolute top-full left-0 mt-1 z-50 min-w-[200px] py-1 rounded-md shadow-xl border border-[var(--app-border)]"
        style="background: var(--app-menu-background, #ffffff);"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="px-3 py-2 border-b border-[var(--app-border)]">
          <input
            type="text"
            class="w-full px-2 py-1 text-[11px] rounded-md border border-[var(--app-border)] bg-[var(--app-input-background)] text-[var(--app-foreground)] outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            placeholder="Filter by path..."
            value="${this.filterPath}"
            @input=${(e: Event) => {
              e.stopPropagation();
              this.filterPath = (e.target as HTMLInputElement).value;
            }}
            @blur=${() => {
              if (this.filterPath) this.refreshData();
            }}
          />
        </div>
        ${this.availablePaths.length === 0
          ? html`<div class="px-3 py-2 text-[11px] text-[var(--app-secondary-foreground)]">Type to filter by path</div>`
          : this.availablePaths.slice(0, 10).map(
              (path) => html`
                <div
                  class="px-3 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center gap-2 ${this.filterPath === path ? "bg-[var(--brand-primary)]/10" : ""}"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.filterPath = this.filterPath === path ? "" : path;
                    this.showPathDropdown = false;
                    this.refreshData();
                  }}
                >
                  <os-icon name="folder" size="12" color="var(--app-secondary-foreground)"></os-icon>
                  <span class="text-[11px] text-[var(--app-foreground)]">${path}</span>
                </div>
              `,
            )}
        ${this.filterPath
          ? html`
              <div class="px-3 py-2 border-t border-[var(--app-border)]">
                <button
                  class="w-full text-[11px] text-[var(--brand-primary)] hover:underline"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.filterPath = "";
                    this.showPathDropdown = false;
                    this.refreshData();
                  }}
                >
                  Clear path filter
                </button>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private renderMoreMenu(): ReturnType<typeof html> {
    return html`
      <div
        class="absolute top-full right-0 mt-1 z-50 min-w-[160px] py-1 rounded-md shadow-xl border border-[var(--app-border)]"
        style="background: var(--app-menu-background, #ffffff);"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="px-3 py-2 border-b border-[var(--app-border)]">
          <span class="text-[10px] font-semibold text-[var(--app-secondary-foreground)] uppercase tracking-wide">Filters</span>
        </div>
        <div
          class="px-3 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center justify-between ${this.filterMergesOnly ? "bg-[var(--brand-primary)]/10" : ""}"
          @click=${(e: Event) => {
            e.stopPropagation();
            this.filterMergesOnly = !this.filterMergesOnly;
            if (this.filterMergesOnly) this.filterNoMerges = false;
            this.showMoreMenu = false;
            this.refreshData();
          }}
        >
          <div class="flex items-center gap-2">
            <os-icon name="git-merge" size="12" color="var(--app-secondary-foreground)"></os-icon>
            <span class="text-[11px] text-[var(--app-foreground)]">Merges only</span>
          </div>
          <os-icon name="${this.filterMergesOnly ? "check-square" : "square"}" size="12" color="${this.filterMergesOnly ? "var(--brand-primary)" : "var(--app-secondary-foreground)"}"></os-icon>
        </div>
        <div
          class="px-3 py-1.5 cursor-pointer hover:bg-[var(--app-toolbar-hover)] flex items-center justify-between ${this.filterNoMerges ? "bg-[var(--brand-primary)]/10" : ""}"
          @click=${(e: Event) => {
            e.stopPropagation();
            this.filterNoMerges = !this.filterNoMerges;
            if (this.filterNoMerges) this.filterMergesOnly = false;
            this.showMoreMenu = false;
            this.refreshData();
          }}
        >
          <div class="flex items-center gap-2">
            <os-icon name="git-branch" size="12" color="var(--app-secondary-foreground)"></os-icon>
            <span class="text-[11px] text-[var(--app-foreground)]">Hide merges</span>
          </div>
          <os-icon name="${this.filterNoMerges ? "check-square" : "square"}" size="12" color="${this.filterNoMerges ? "var(--brand-primary)" : "var(--app-secondary-foreground)"}"></os-icon>
        </div>
      </div>
    `;
  }

  private hasActiveFilters(): boolean {
    return !!(
      this.filterAuthor ||
      this.filterSince ||
      this.filterUntil ||
      this.filterPath ||
      this.filterMergesOnly ||
      this.filterNoMerges ||
      this.datePreset !== "all"
    );
  }

  private clearAllFilters(): void {
    this.filterAuthor = "";
    this.filterSince = "";
    this.filterUntil = "";
    this.filterPath = "";
    this.filterMergesOnly = false;
    this.filterNoMerges = false;
    this.datePreset = "all";
    this.refreshData();
  }

  private applyDatePreset(preset: string): void {
    const now = new Date();
    switch (preset) {
      case "today":
        this.filterSince = "today";
        this.filterUntil = "";
        break;
      case "yesterday":
        this.filterSince = "yesterday";
        this.filterUntil = "";
        break;
      case "week":
        this.filterSince = "1 week ago";
        this.filterUntil = "";
        break;
      case "month":
        this.filterSince = "1 month ago";
        this.filterUntil = "";
        break;
      case "3months":
        this.filterSince = "3 months ago";
        this.filterUntil = "";
        break;
      case "6months":
        this.filterSince = "6 months ago";
        this.filterUntil = "";
        break;
      case "year":
        this.filterSince = "1 year ago";
        this.filterUntil = "";
        break;
      default:
        this.filterSince = "";
        this.filterUntil = "";
    }
  }
  
  private renderCommitGraph(filteredCommits: LogEntry[]): ReturnType<typeof html> {
    if (!this.showGraph || !this.graphData || filteredCommits.length === 0) return html``;
  
    const ROW_H = 36;
    const LANE_W = 24;
    const DOT_R = 4;
    const OFFSET_X = 24;
  
    // 1. Build the coordinate map
    const posMap = new Map<string, { x: number; y: number; color: string }>();
    filteredCommits.forEach((commit, i) => {
      const laneData = this.graphData!.commits.find(c => c.hash === commit.hash);
      const lane = laneData?.lane ?? 0;
      posMap.set(commit.hash, {
        x: OFFSET_X + (lane * LANE_W),
        y: (i * ROW_H) + (ROW_H / 2),
        color: laneData?.laneColor ?? '#999'
      });
    });
  
    const elements: any[] = [];
  
    // 2. Generate Lines (using svg`...`)
    filteredCommits.forEach((commit, i) => {
      const childPos = posMap.get(commit.hash);
      if (!childPos) return;
  
      const commitData = this.graphData!.commits.find(c => c.hash === commit.hash);
      const parents = commitData?.parent_hashes || [];
      let connected = false;
  
      parents.forEach(pHash => {
        const parentPos = posMap.get(pHash);
        if (parentPos) {
          connected = true;
          elements.push(this.createSvgLine(childPos, parentPos, childPos.color));
        }
      });
  
      // Bridge logic for visual continuity
      if (!connected && i < filteredCommits.length - 1) {
        const nextPos = posMap.get(filteredCommits[i + 1].hash);
        if (nextPos) {
          elements.push(this.createSvgLine(childPos, nextPos, nextPos.color));
        }
      }
    });
  
    // 3. Generate Dots (using svg`...`)
    filteredCommits.forEach(commit => {
      const pos = posMap.get(commit.hash);
      if (pos) {
        elements.push(svg`
          <circle cx="${pos.x}" cy="${pos.y}" r="${DOT_R}" 
                  fill="${pos.color}" stroke="var(--app-bg)" stroke-width="2" />
        `);
      }
    });
  
    const width = (Math.max(...this.graphData.lanes.map(l => l.id), 0) + 1) * LANE_W + (OFFSET_X * 2);
  
    // Parent wrapper uses html`, but children inside <svg> must be from the svg` literal
    return html`
      <div class="graph-wrapper" style="position: absolute; left: 0; top: 0; pointer-events: none; z-index: 100;">
        <svg width="${width}" height="${filteredCommits.length * ROW_H}" style="overflow: visible; display: block;">
          <g id="graph-content">
            ${elements}
          </g>
        </svg>
      </div>
    `;
  }
  
  /**
   * Generates SVG line/path using the SVG namespace literal
   */
  private createSvgLine(start: {x: number, y: number}, end: {x: number, y: number}, color: string) {
    if (start.x === end.x) {
      return svg`
        <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"
              stroke="${color}" stroke-width="2" />
      `;
    }
    
    const midY = (start.y + end.y) / 2;
    const d = `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;
    return svg`
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />
    `;
  }
  
  /**
   * Internal helper to create the SVG path string or line
   */
  private createPath(start: {x: number, y: number}, end: {x: number, y: number}, color: string) {
    if (start.x === end.x) {
      return html`
        <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"
              stroke="${color}" stroke-width="2" />
      `;
    }
    // Curved transition
    const midY = (start.y + end.y) / 2;
    const d = `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;
    return html`
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />
    `;
  }

  private getGraphWidth(): number {
    if (!this.graphData || this.graphData.commits.length === 0) return 60;

    const maxLane = Math.max(...this.graphData.commits.map((c) => c.lane), 0);

    const LANE_W = 24;
    const OFFSET_X = 16;

    return (maxLane + 1) * LANE_W + (OFFSET_X * 2);
  }

  private renderCommitList(): ReturnType<typeof html> {
    const filteredCommits = this.getFilteredCommits();

    if (filteredCommits.length === 0) {
      return html`
        <div class="flex-1 flex flex-col items-center justify-center py-8">
          <os-icon
            name="circle-dot"
            size="36"
            color="var(--app-secondary-foreground)"
          ></os-icon>

          <p class="mt-3 text-[12px] font-medium text-[var(--app-foreground)]">
            ${this.commits.length === 0 ? "No Commits" : "No matching commits"}
          </p>

          <p class="mt-1 text-[11px] text-[var(--app-secondary-foreground)]">
            ${this.commits.length === 0
              ? "Repository is empty"
              : "Try adjusting filters"}
          </p>
        </div>
      `;
    }

    const graphWidth = this.getGraphWidth();

    const commitRows = filteredCommits.map((commit) => {
      const isSelected = this.selectedCommit?.hash === commit.hash;

      return html`
        <div
          class="group flex items-center gap-2 px-3 cursor-pointer h-9"
          @click=${() => this.selectCommit(commit)}
        >
          <!-- Commit hash label -->
          <span
            class="text-[10px] font-mono px-2 py-0.5 rounded flex-shrink-0 bg-[var(--app-toolbar-hover)] text-[var(--app-secondary-foreground)]"
          >
            ${commit.shortHash}
          </span>

          <!-- Author avatar -->
          <div
            class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 text-white shadow-sm"
            style="background-color: ${this.getAuthorColor(commit.author)}"
            title="${commit.author}"
          >
            ${this.getAuthorInitials(commit.author)}
          </div>

          <!-- Commit subject -->
          <span
            class="text-[12px] truncate px-2 py-0.5 rounded flex-1 font-medium cursor-pointer ${isSelected
              ? "bg-[var(--brand-primary)]/20 text-[var(--brand-primary)]"
              : "text-[var(--app-foreground)]"}"
            title="${commit.subject}"
          >
            ${commit.subject}
          </span>

          <!-- Branch labels -->
          ${commit.branchLabels
            .slice(0, 2)
            .map(
              (b) =>
                html`<span
                  class="text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 font-medium bg-[var(--brand-primary)] text-white"
                  >${b}</span
                >`,
            )}

          <!-- Changed files indicator -->
          ${commit.files_changed > 0
            ? html`
                <span
                  class="flex items-center gap-1.5 flex-shrink-0 text-[10px] text-[var(--app-secondary-foreground)]"
                  title="${commit.files_changed} files changed, +${commit.additions} -${commit.deletions}"
                >
                  <os-icon name="file-diff" size="10"></os-icon>
                  <span>${commit.files_changed}</span>
                  ${commit.additions > 0
                    ? html`<span class="text-[var(--git-added)]">+${commit.additions}</span>`
                    : ""}
                  ${commit.deletions > 0
                    ? html`<span class="text-[var(--git-deleted)]">-${commit.deletions}</span>`
                    : ""}
                </span>
              `
            : ""}

          <!-- Date -->
          <span
            class="text-[10px] flex-shrink-0 px-2 py-0.5 rounded-md text-[var(--app-secondary-foreground)] bg-[var(--app-toolbar-hover)]"
            title="${commit.dateTitle}"
          >
            ${commit.date}
          </span>
        </div>
      `;
    });

    const graphColumn = this.showGraph && this.graphData && this.graphData.commits.length > 0
      ? html`
          <div class="flex-shrink-0 relative" style="width: ${graphWidth}px;">
            ${this.renderCommitGraph(filteredCommits)}
          </div>
        `
      : html`<div style="width: ${graphWidth}px;"></div>`;

    return html`
      <div class="flex-1 overflow-y-auto">
        <div class="flex">
          ${graphColumn}

          <div class="flex-1" style="min-width: 0;">
            <div class="flex flex-col">
              ${commitRows}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderFileChangesIndicator(
    commit: LogEntry,
  ): ReturnType<typeof html> {
    // Show small file icons with status colors based on changed files

    // In a real implementation we'd parse the actual files, but for now show a summary

    return html`
      <span class="text-[9px] flex items-center gap-1">
        <os-icon name="file" size="9" color="var(--git-modified)"></os-icon>

        <span>${commit.files_changed}</span>

        ${commit.additions > 0
          ? html`<span style="color: var(--git-added);"
              >+${commit.additions}</span
            >`
          : ""}
        ${commit.deletions > 0
          ? html`<span style="color: var(--git-deleted);"
              >-${commit.deletions}</span
            >`
          : ""}
      </span>
    `;
  }

  private getAuthorColor(author: string): string {
    let hash = 0;

    for (let i = 0; i < author.length; i++) {
      hash = (hash << 5) - hash + author.charCodeAt(i);

      hash |= 0;
    }

    const hue = Math.abs(hash) % 360;

    return `hsl(${hue}, 60%, 40%)`;
  }

  private getAuthorInitials(author: string): string {
    const parts = author.split(" ");

    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    return author.slice(0, 2).toUpperCase();
  }

  private renderBranchList(): ReturnType<typeof html> {
    const localBranches = this.branches.filter((b) => !b.is_remote);

    return html`
      <div class="flex flex-col h-full">
        <!-- Local branches header -->
        <div
          class="px-3 py-2 flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-toolbar-background)]"
        >
          <div class="flex items-center gap-2">
            <os-icon
              name="git-branch"
              size="12"
              color="var(--app-secondary-foreground)"
            ></os-icon>
            <span class="text-[11px] font-semibold text-[var(--app-foreground)] uppercase tracking-wide">
              Branches
            </span>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--app-toolbar-hover)] text-[var(--app-secondary-foreground)]">
            ${localBranches.length}
          </span>
        </div>

        <!-- Branches list -->
        <div class="flex-1 overflow-y-auto">
          ${localBranches.map(
            (branch) => html`
              <div
                class="group flex items-center gap-2 px-3 py-2 hover:bg-[var(--app-hover-background)] transition-colors border-b border-[var(--app-border)] last:border-b-0"
              >
                <!-- Checkbox -->
                <input
                  type="checkbox"
                  class="w-4 h-4 rounded cursor-pointer"
                  style="accent-color: var(--brand-primary);"
                  ?checked="${this.visibleBranches.has(branch.name) ||
                  this.visibleBranches.size === 0}"
                  @change=${(e: Event) =>
                    this.toggleBranchVisibility(
                      branch.name,
                      (e.target as HTMLInputElement).checked,
                    )}
                />

                <!-- Branch icon with current indicator -->
                <div class="relative">
                  <os-icon
                    name="git-branch"
                    size="14"
                    color="${branch.name === this.currentBranch
                      ? "var(--brand-primary)"
                      : "var(--app-secondary-foreground)"}"
                  ></os-icon>
                  ${branch.name === this.currentBranch
                    ? html`
                        <span
                          class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--brand-primary)] ring-2 ring-[var(--app-bg)]"
                        ></span>
                      `
                    : ""}
                </div>

                <!-- Branch name -->
                <span
                  class="text-[12px] flex-1 font-medium ${branch.name === this.currentBranch
                    ? "text-[var(--brand-primary)]"
                    : "text-[var(--app-foreground)]"}"
                  title="${branch.name}"
                >
                  ${branch.name}
                </span>

                <!-- Ahead/behind indicator -->
                ${this.renderAheadBehind(branch.name)}
              </div>
            `,
          )}
        </div>

        <!-- Sync status -->
        ${this.repoStatus
          ? html`
              <div
                class="px-3 py-2 text-[11px] border-t border-[var(--app-border)] bg-[var(--app-toolbar-background)]"
              >
                <div class="flex items-center gap-2">
                  <os-icon
                    name="${this.repoStatus.ahead || this.repoStatus.behind ? "circle-alert" : "check-circle"}"
                    size="12"
                    color="${this.repoStatus.ahead || this.repoStatus.behind
                      ? "var(--git-added)"
                      : "var(--app-secondary-foreground)"}"
                  ></os-icon>
                  <span style="color: var(--app-secondary-foreground);">
                    ${this.repoStatus.ahead
                      ? `${this.repoStatus.ahead} ahead`
                      : ""}
                    ${this.repoStatus.ahead && this.repoStatus.behind ? ", " : ""}
                    ${this.repoStatus.behind
                      ? `${this.repoStatus.behind} behind`
                      : ""}
                    ${!this.repoStatus.ahead && !this.repoStatus.behind
                      ? "Up to date with remote"
                      : ""}
                  </span>
                </div>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private toggleBranchVisibility(branchName: string, visible: boolean): void {
    if (visible) {
      this.visibleBranches.add(branchName);
    } else {
      this.visibleBranches.delete(branchName);
    }

    this.requestUpdate();
  }

  private renderAheadBehind(branchName: string): ReturnType<typeof html> {
    if (!this.repoStatus) return html``;

    const { ahead, behind } = this.repoStatus;

    if (!ahead && !behind) return html``;

    return html`
      <span
        class="text-[9px] flex items-center gap-0.5 text-[var(--app-secondary-foreground)]"
      >
        ${ahead
          ? html`<span class="text-[var(--git-added)]">↑${ahead}</span>`
          : ""}
        ${behind
          ? html`<span class="text-[var(--git-deleted)]">↓${behind}</span>`
          : ""}
      </span>
    `;
  }

  private renderCommitDetails(): ReturnType<typeof html> {
    if (!this.selectedCommit) {
      return html`
        <div class="flex-1 flex flex-col items-center justify-center py-8">
          <os-icon
            name="git-commit"
            size="40"
            color="var(--app-secondary-foreground)"
          ></os-icon>

          <p class="mt-4 text-[12px] font-medium text-[var(--app-foreground)]">
            Select a commit to view details
          </p>

          <p class="mt-1 text-[11px] text-[var(--app-secondary-foreground)]">
            Click on any commit in the list
          </p>
        </div>
      `;
    }

    const c = this.selectedCommit;

    return html`
      <div class="flex flex-col h-full overflow-hidden">
        <!-- Commit header -->
        <div class="px-4 py-3 border-b border-[var(--app-border)]">
          <p class="text-[12px] font-semibold text-[var(--app-foreground)]">
            ${c.subject}
          </p>

          ${c.body
            ? html`
                <p
                  class="text-[10px] mt-1 text-[var(--app-secondary-foreground)] leading-relaxed"
                >
                  ${c.body}
                </p>
              `
            : ""}

          <div class="flex items-center gap-2 mt-2">
            <p
              class="flex-1 text-[9px] font-mono text-[var(--app-foreground)] bg-[var(--app-toolbar-hover)] px-2 py-1 rounded truncate"
              title="${c.hash}"
            >
              ${c.hash}
            </p>
            <button
              class="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors flex-shrink-0"
              title="Copy commit hash"
              @click=${(e: Event) => {
                e.stopPropagation();
                navigator.clipboard.writeText(c.hash);
              }}
            >
              <os-icon name="copy" size="12" color="var(--app-foreground)"></os-icon>
            </button>
          </div>
        </div>

        <!-- Metadata row -->
        <div class="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--app-border)]">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
              style="background-color: ${this.getAuthorColor(c.author)}"
              title="${c.author}"
            >
              ${this.getAuthorInitials(c.author)}
            </div>

            <div class="flex flex-col">
              <span class="text-[11px] font-medium text-[var(--app-foreground)]">${c.author}</span>
              <span class="text-[9px] text-[var(--app-secondary-foreground)]" title="${c.dateTitle}">${c.date}</span>
            </div>
          </div>
        </div>

        <!-- Stats bar -->
        <div
          class="flex items-center gap-3 px-4 py-2 text-[11px] border-b border-[var(--app-border)] bg-[var(--app-toolbar-hover)]"
        >
          <span class="text-[var(--app-foreground)]">
            <strong>${c.files_changed}</strong> files changed
          </span>

          ${c.additions > 0
            ? html`
                <span class="flex items-center gap-1 text-[var(--git-added)]">
                  <os-icon name="plus" size="8"></os-icon>
                  ${c.additions}
                </span>
              `
            : ""}
          ${c.deletions > 0
            ? html`
                <span class="flex items-center gap-1 text-[var(--git-deleted)]">
                  <os-icon name="minus" size="8"></os-icon>
                  ${c.deletions}
                </span>
              `
            : ""}
        </div>

        <!-- Branch labels -->
        ${c.branchLabels.length > 0
          ? html`
              <div class="px-4 py-2 flex items-center gap-2 flex-wrap border-b border-[var(--app-border)]">
                <os-icon name="git-branch" size="12" color="var(--app-secondary-foreground)"></os-icon>
                ${c.branchLabels.map(
                  (b) => html`
                    <span
                      class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand-primary)] text-white font-medium"
                    >
                      ${b}
                    </span>
                  `,
                )}
              </div>
            `
          : ""}

        <!-- Changed files list -->
        <div class="flex-1 flex flex-col overflow-hidden min-h-0">
          <div
            class="px-4 py-2 flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-toolbar-background)]"
          >
            <div class="flex items-center gap-2">
              <os-icon name="files" size="12" color="var(--app-secondary-foreground)"></os-icon>
              <span class="text-[10px] font-semibold text-[var(--app-foreground)] uppercase tracking-wide">
                Changed Files
              </span>
            </div>

            <span class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--app-toolbar-hover)] text-[var(--app-secondary-foreground)]">
              ${this.changedFiles.length}
            </span>
          </div>

          <div class="flex-1 overflow-y-auto">
            ${this.changedFiles.length === 0
              ? html`
                  <p
                    class="px-4 py-3 text-[10px] text-[var(--app-secondary-foreground)]"
                  >
                    No file changes
                  </p>
                `
              : html`
                  ${this.changedFiles.map(
                    (file) => html`
                      <div
                        class="group flex items-center gap-2 px-4 py-2 hover:bg-[var(--app-hover-background)] transition-colors border-b border-[var(--app-border)] last:border-b-0"
                      >
                        ${this.renderFileStatusIcon(file.status)}

                        <span
                          class="text-[11px] flex-1 truncate text-[var(--app-foreground)]"
                          title="${file.path}"
                        >
                          ${file.path}
                        </span>

                        ${!file.binary &&
                        (file.additions > 0 || file.deletions > 0)
                          ? html`
                              <span
                                class="text-[10px] flex items-center gap-2 flex-shrink-0"
                              >
                                ${file.additions > 0
                                  ? html`<span class="text-[var(--git-added)] font-medium"
                                      >+${file.additions}</span
                                    >`
                                  : ""}
                                ${file.deletions > 0
                                  ? html`<span class="text-[var(--git-deleted)] font-medium"
                                      >-${file.deletions}</span
                                    >`
                                  : ""}
                              </span>
                            `
                          : html`
                              ${file.binary
                                ? html`<span
                                    class="text-[9px] px-2 py-0.5 rounded-md bg-[var(--app-toolbar-hover)] text-[var(--app-secondary-foreground)]"
                                    >binary</span
                                  >`
                                : ""}
                            `}
                      </div>
                    `,
                  )}
                `}
          </div>
        </div>
      </div>
    `;
  }

  private renderFileStatusIcon(status: string): ReturnType<typeof html> {
    const iconMap: Record<string, { icon: string; color: string }> = {
      added: { icon: "plus", color: "var(--git-added)" },

      deleted: { icon: "trash-2", color: "var(--git-deleted)" },

      modified: { icon: "file-diff", color: "var(--git-modified)" },

      renamed: { icon: "arrow-right", color: "var(--git-renamed)" },
    };

    const { icon, color } = iconMap[status] || {
      icon: "file",
      color: "var(--app-foreground)",
    };

    return html`
      <os-icon name="${icon}" size="12" color="${color}"></os-icon>
    `;
  }

  private renderNoRepo(): ReturnType<typeof html> {
    return html`
      <div class="flex flex-col items-center justify-center h-full py-12 px-4">
        <div
          class="w-16 h-16 rounded-full flex items-center justify-center bg-[var(--app-toolbar-hover)]"
        >
          <os-icon
            name="git-branch"
            size="32"
            color="var(--app-secondary-foreground)"
          ></os-icon>
        </div>

        <p class="mt-4 text-[13px] font-semibold text-[var(--app-foreground)]">
          No Git Repository
        </p>

        <p
          class="mt-2 text-[11px] text-center text-[var(--app-secondary-foreground)] max-w-[280px]"
        >
          Initialize a Git repository to view commit history and branch management
        </p>
      </div>
    `;
  }

  render() {
    return html`
      <div class="flex flex-col h-full w-full bg-[var(--app-bg)]">
        ${this.renderToolbar()}

        <div class="flex flex-1 overflow-hidden min-h-0">
          <!-- Left: Branch Panel (toggleable) -->

          ${this.showBranchPanel && this.activeTab === "log"
            ? html`
                <div
                  class="flex flex-col overflow-hidden w-[260px] min-w-[220px] border-r border-[var(--app-border)]"
                >
                  ${this.renderBranchList()}
                </div>
              `
            : ""}

          <!-- Middle: Commit List / Branch List -->

          <div
            class="flex-1 flex flex-col overflow-hidden min-w-0 border-r border-[var(--app-border)]"
          >
            ${this.activeTab === "log"
              ? this.renderCommitList()
              : this.renderBranchList()}
          </div>

          <!-- Right: Commit Details -->
          ${this.activeTab === "log" && this.showCommitDetails
            ? html`
                <div
                  class="flex flex-col overflow-hidden w-[340px] min-w-[300px] border-l border-[var(--app-border)]"
                >
                  ${this.renderCommitDetails()}
                </div>
              `
            : ""}
        </div>

        ${this.loading
          ? html`
              <div class="flex items-center justify-center py-6 border-t border-[var(--app-border)]">
                <os-icon
                  name="rotate-ccw"
                  size="16"
                  color="var(--brand-primary)"
                  class="animate-spin"
                ></os-icon>
                <span
                  class="text-[11px] ml-3 font-medium text-[var(--app-secondary-foreground)]"
                  >Loading git history...</span
                >
              </div>
            `
          : ""}
        ${this.error
          ? html`
              <div class="flex items-center justify-center py-6 border-t border-[var(--app-border)]">
                <os-icon
                  name="triangle-alert"
                  size="16"
                  color="var(--git-deleted)"
                ></os-icon>
                <span class="text-[11px] ml-3 font-medium text-[var(--git-deleted)]"
                  >${this.error}</span
                >
              </div>
            `
          : ""}
      </div>
    `;
  }
}
