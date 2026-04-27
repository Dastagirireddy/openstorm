/**
 * Git Panel Component - Famous Style (Bottom Panel)
 *
 * Orchestrates sub-components for git log visualization.
 */

import { html, css, type CSSResultGroup } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { TailwindElement, getTailwindStyles } from "../tailwind-element.js";
import type { RepoInfo, RepoStatus, BranchInfo, ChangedFile, CommitEntryWithStats } from "../lib/git-types.js";
import * as git from "../lib/git-api.js";
import { buildGraphData, type GraphData } from "../lib/git-graph.js";
import "./git-toolbar.js";
import "./git-commit-list.js";
import "./git-branch-panel.js";
import "./git-commit-details.js";
import "./icon.js";

interface LogEntry extends CommitEntryWithStats {
  shortHash: string;
  date: string;
  dateTitle: string;
  branchLabels: string[];
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
  @state() private repoInfo: RepoInfo | null = null;
  @state() private currentBranch = "";
  @state() private branches: BranchInfo[] = [];
  @state() private commits: LogEntry[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private selectedCommit: LogEntry | null = null;
  @state() private showGraph = true;
  @state() private showCommitDetails = true;
  @state() private showBranchPanel = true;
  @state() private searchQuery = "";
  @state() private filterMergesOnly = false;
  @state() private filterNoMerges = false;
  @state() private filterAuthor = "";
  @state() private filterPath = "";
  @state() private filterSince = "";
  @state() private filterUntil = "";
  @state() private datePreset = "all";
  @state() private visibleBranches = new Set<string>();
  @state() private repoStatus: RepoStatus | null = null;
  @state() private graphData: GraphData | null = null;
  @state() private changedFiles: ChangedFile[] = [];
  @state() private availableAuthors: Array<{ name: string; count: number }> = [];
  @state() private availablePaths: string[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    this._setupListeners();
    if (this.projectPath) this.refreshData();
  }

  private _setupListeners(): void {
    document.addEventListener("project-opened", (e: Event) => {
      this.projectPath = (e as CustomEvent<{ path: string }>).detail.path;
      this.refreshData();
    });
    document.addEventListener("git-refresh", () => this.refreshData());
    document.addEventListener("git-initialized", () => this.refreshData());
    document.addEventListener("git-committed", () => this.refreshData());
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
      if (!this.repoInfo?.is_repository) {
        this.repoInfo = null;
        return;
      }

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

      const commitsWithStats = await git.enrichCommitsWithStats(this.projectPath, commitLog);
      this.commits = commitsWithStats.map(c => ({
        ...c,
        shortHash: c.hash.substring(0, 7),
        date: this._formatDate(c.timestamp),
        dateTitle: new Date(c.timestamp * 1000).toLocaleString(),
        branchLabels: this._extractBranches(c.hash, branches),
      }));

      this.graphData = buildGraphData(commitsWithStats, this._assignBranchColors(branches));
      this.availableAuthors = this._extractAuthors(commitsWithStats);
      this.availablePaths = await this._extractPathsFromCommits(commitsWithStats);
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Failed to load git data";
    } finally {
      this.loading = false;
      this.requestUpdate();
    }
  }

  private _formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  private _extractBranches(hash: string, branches: BranchInfo[]): string[] {
    return branches
      .filter(b => b.top_commit && (b.top_commit === hash || hash.startsWith(b.top_commit)))
      .map(b => b.name);
  }

  private _extractAuthors(commits: CommitEntryWithStats[]): Array<{ name: string; count: number }> {
    const authorMap = new Map<string, number>();
    commits.forEach(c => authorMap.set(c.author, (authorMap.get(c.author) || 0) + 1));
    return Array.from(authorMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  private async _extractPathsFromCommits(commits: CommitEntryWithStats[]): Promise<string[]> {
    const pathSet = new Set<string>();
    for (const commit of commits.slice(0, 20)) {
      try {
        const files = await git.getCommitChangedFiles(this.projectPath, commit.hash);
        files.forEach(f => {
          const dir = f.path.includes("/") ? f.path.substring(0, f.path.lastIndexOf("/")) : "";
          if (dir) pathSet.add(dir);
        });
      } catch { /* skip */ }
    }
    return Array.from(pathSet).sort();
  }

  private _assignBranchColors(branches: BranchInfo[]): Map<string, string> {
    const colors = ["var(--brand-primary)", "var(--git-added)", "var(--git-modified)",
      "var(--git-deleted)", "var(--git-renamed)", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
    const colorMap = new Map<string, string>();
    branches.forEach((b, i) => colorMap.set(b.name, colors[i % colors.length]));
    return colorMap;
  }

  private _applyDatePreset(preset: string): void {
    const presets: Record<string, string> = {
      today: "today", yesterday: "yesterday", week: "1 week ago",
      month: "1 month ago", "3months": "3 months ago", "6months": "6 months ago", year: "1 year ago"
    };
    this.filterSince = presets[preset] || "";
    this.filterUntil = "";
  }

  private _handleCommitSelected(e: CustomEvent<{ commit: LogEntry }>): void {
    this.selectedCommit = e.detail.commit;
    git.getCommitChangedFiles(this.projectPath, e.detail.commit.hash)
      .then(files => { this.changedFiles = files; this.requestUpdate(); })
      .catch(() => { this.changedFiles = []; });
  }

  private _handleBranchVisibilityChanged(e: CustomEvent<{ branchName: string; visible: boolean }>): void {
    const { branchName, visible } = e.detail;
    if (visible) this.visibleBranches.add(branchName);
    else this.visibleBranches.delete(branchName);
    this.requestUpdate();
  }

  render() {
    const filteredCount = this.searchQuery
      ? this.commits.filter(c =>
          c.subject.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          c.author.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          c.shortHash.toLowerCase().includes(this.searchQuery.toLowerCase())
        ).length
      : this.commits.length;

    return html`
      <div class="flex flex-col h-full w-full bg-[var(--app-bg)]">
        <git-toolbar
          .searchQuery="${this.searchQuery}"
          .datePreset="${this.datePreset}"
          .filterAuthor="${this.filterAuthor}"
          .filterPath="${this.filterPath}"
          .filterMergesOnly="${this.filterMergesOnly}"
          .filterNoMerges="${this.filterNoMerges}"
          .showBranchPanel="${this.showBranchPanel}"
          .showCommitDetails="${this.showCommitDetails}"
          .filteredCount="${filteredCount}"
          .totalCount="${this.commits.length}"
          .availableAuthors="${this.availableAuthors}"
          .availablePaths="${this.availablePaths}"
          @search-changed=${(e: CustomEvent<{ query: string }>) => { this.searchQuery = e.detail.query; this.requestUpdate(); }}
          @date-preset-changed=${(e: CustomEvent<{ preset: string }>) => { this.datePreset = e.detail.preset; this._applyDatePreset(e.detail.preset); this.refreshData(); }}
          @filter-author=${(e: CustomEvent<{ author: string }>) => { this.filterAuthor = e.detail.author; this.refreshData(); }}
          @filter-path=${(e: CustomEvent<{ path: string }>) => { this.filterPath = e.detail.path; this.refreshData(); }}
          @toggle-merges-only=${() => { this.filterMergesOnly = !this.filterMergesOnly; this.filterNoMerges = false; this.refreshData(); }}
          @toggle-no-merges=${() => { this.filterNoMerges = !this.filterNoMerges; this.filterMergesOnly = false; this.refreshData(); }}
          @clear-filters=${() => {
            this.filterAuthor = ""; this.filterPath = ""; this.filterSince = "";
            this.filterUntil = ""; this.filterMergesOnly = false; this.filterNoMerges = false;
            this.datePreset = "all"; this.refreshData();
          }}
          @toggle-branch-panel=${() => { this.showBranchPanel = !this.showBranchPanel; this.requestUpdate(); }}
          @toggle-commit-details=${() => { this.showCommitDetails = !this.showCommitDetails; this.requestUpdate(); }}
          @git-refresh=${() => this.refreshData()}
        ></git-toolbar>

        <div class="flex flex-1 overflow-hidden min-h-0">
          ${this.showBranchPanel
            ? html`<div class="flex flex-col overflow-hidden w-[260px] min-w-[220px] border-r border-[var(--app-border)]">
                <git-branch-panel
                  .branches="${this.branches}"
                  .currentBranch="${this.currentBranch}"
                  .visibleBranches="${this.visibleBranches}"
                  .repoStatus="${this.repoStatus}"
                  @branch-visibility-changed=${this._handleBranchVisibilityChanged}
                ></git-branch-panel>
              </div>`
            : ""}

          <div class="flex-1 flex flex-col overflow-hidden min-w-0 border-r border-[var(--app-border)]">
            <git-commit-list
              .commits="${this.commits}"
              .graphData="${this.graphData}"
              .showGraph="${this.showGraph}"
              .selectedCommit="${this.selectedCommit}"
              .searchQuery="${this.searchQuery}"
              @commit-selected=${this._handleCommitSelected}
            ></git-commit-list>
          </div>

          ${this.showCommitDetails
            ? html`<div class="flex flex-col overflow-hidden w-[340px] min-w-[300px] border-l border-[var(--app-border)]">
                <git-commit-details
                  .commit="${this.selectedCommit}"
                  .changedFiles="${this.changedFiles}"
                ></git-commit-details>
              </div>`
            : ""}
        </div>

        ${this.loading
          ? html`<div class="flex items-center justify-center py-6 border-t border-[var(--app-border)]">
              <os-icon name="rotate-ccw" size="16" color="var(--brand-primary)" class="animate-spin"></os-icon>
              <span class="text-[11px] ml-3 font-medium text-[var(--app-secondary-foreground)]">Loading git history...</span>
            </div>`
          : ""}
        ${this.error
          ? html`<div class="flex items-center justify-center py-6 border-t border-[var(--app-border)]">
              <os-icon name="triangle-alert" size="16" color="var(--git-deleted)"></os-icon>
              <span class="text-[11px] ml-3 font-medium text-[var(--git-deleted)]">${this.error}</span>
            </div>`
          : ""}
      </div>
    `;
  }
}
