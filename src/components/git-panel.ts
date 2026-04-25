/**
 * Git Panel Component - IntelliJ Style (Bottom Panel)
 *
 * Follows IntelliJ's Git Log tool window layout:
 * - Bottom panel showing repository history
 * - Multi-pane view: branches, commit graph, changed files, commit details
 * - Used for viewing git log, repository status, and commit history
 */

import { html, css, type CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement, getTailwindStyles } from '../tailwind-element.js';
import type { RepoInfo, CommitEntry, BranchInfo } from '../lib/git-types.js';
import * as git from '../lib/git-api.js';
import './icon.js';

interface LogEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  branches: string[];
}

@customElement('git-panel')
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

  @property() projectPath = '';
  @property() height = 300;
  @state() private repoInfo: RepoInfo | null = null;
  @state() private currentBranch = '';
  @state() private branches: BranchInfo[] = [];
  @state() private commits: LogEntry[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private selectedCommit: LogEntry | null = null;
  @state() private activeTab: 'log' | 'branches' = 'log';
  @state() private showGraph = true;

  connectedCallback(): void {
    super.connectedCallback();

    document.addEventListener('project-opened', (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string }>;
      this.projectPath = customEvent.detail.path;
      this.refreshData();
    });

    document.addEventListener('git-refresh', () => {
      this.refreshData();
    });

    document.addEventListener('git-initialized', () => {
      this.refreshData();
    });

    document.addEventListener('git-committed', () => {
      this.refreshData();
    });

    if (this.projectPath) {
      this.refreshData();
    }
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('projectPath') && this.projectPath) {
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
        const [branch, branches, commitLog] = await Promise.all([
          git.gitGetBranch(this.projectPath),
          git.gitListBranches(this.projectPath),
          git.gitGetLog(this.projectPath, 100),
        ]);

        this.currentBranch = branch;
        this.branches = branches;
        this.commits = commitLog.map((c: CommitEntry) => ({
          hash: c.hash,
          shortHash: c.hash.substring(0, 7),
          subject: c.subject,
          author: c.author,
          date: this.formatDate(c.timestamp),
          branches: this.extractBranches(c.hash, branches),
        }));
      } else {
        this.repoInfo = null;
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load git data';
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

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return String(timestamp);
    }
  }

  private extractBranches(hash: string, branches: BranchInfo[]): string[] {
    const branchNames: string[] = [];
    for (const branch of branches) {
      if (branch.top_commit === hash || hash.startsWith(branch.top_commit)) {
        branchNames.push(branch.name);
      }
    }
    return branchNames;
  }

  private selectCommit(commit: LogEntry): void {
    this.selectedCommit = commit;
    this.requestUpdate();
  }

  private renderToolbar(): ReturnType<typeof html> {
    return html`
      <div class="flex items-center justify-between px-2 py-1.5 border-b" style="border-color: var(--app-border); background-color: var(--app-toolbar-background);">
        <div class="flex items-center gap-1">
          <button
            class="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-[var(--app-toolbar-hover)]"
            title="Refresh"
            @click=${() => this.refreshData()}>
            <os-icon name="rotate-ccw" size="14" color="var(--app-foreground)"></os-icon>
          </button>
          <button
            class="w-7 h-7 flex items-center justify-center rounded transition-colors"
            style="background-color: ${this.showGraph ? 'var(--brand-primary)' : 'transparent'}; color: ${this.showGraph ? 'white' : 'var(--app-foreground)'};"
            title="Toggle Graph"
            @click=${() => { this.showGraph = !this.showGraph; this.requestUpdate(); }}>
            <os-icon name="git-branch" size="14"></os-icon>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[11px]" style="color: var(--app-disabled-foreground);">
            ${this.currentBranch ? `on ${this.currentBranch}` : ''}
          </span>
          <button
            class="px-2 py-1 text-[11px] rounded border transition-colors hover:bg-[var(--app-toolbar-hover)]"
            style="border-color: var(--app-border); color: var(--app-foreground);">
            <os-icon name="list-filter" size="12"></os-icon>
          </button>
        </div>
      </div>
    `;
  }

  private renderTabs(): ReturnType<typeof html> {
    return html`
      <div class="flex items-center gap-1 px-2 py-1 border-b" style="border-color: var(--app-border);">
        <button
          class="px-3 py-1 text-[11px] font-medium rounded transition-colors hover:bg-[var(--app-toolbar-hover)]"
          style="background-color: ${this.activeTab === 'log' ? 'var(--brand-primary)' : 'transparent'}; color: ${this.activeTab === 'log' ? 'white' : 'var(--app-foreground)'};"
          @click=${() => { this.activeTab = 'log'; this.requestUpdate(); }}>
          Log
        </button>
        <button
          class="px-3 py-1 text-[11px] font-medium rounded transition-colors hover:bg-[var(--app-toolbar-hover)]"
          style="background-color: ${this.activeTab === 'branches' ? 'var(--brand-primary)' : 'transparent'}; color: ${this.activeTab === 'branches' ? 'white' : 'var(--app-foreground)'};"
          @click=${() => { this.activeTab = 'branches'; this.requestUpdate(); }}>
          Branches
        </button>
      </div>
    `;
  }

  private renderCommitGraph(commit: LogEntry): ReturnType<typeof html> {
    if (!this.showGraph) return html``;

    return html`
      <div class="flex items-center gap-1 mr-2" style="width: 60px;">
        <div class="w-3 h-3 rounded-full" style="background-color: var(--brand-primary);"></div>
        <div class="w-[1px] h-4" style="background-color: var(--app-border);"></div>
      </div>
    `;
  }

  private renderCommitList(): ReturnType<typeof html> {
    if (this.commits.length === 0) {
      return html`
        <div class="flex-1 flex flex-col items-center justify-center py-8">
          <os-icon name="circle-dot" size="36" color="var(--app-disabled-foreground)"></os-icon>
          <p class="mt-3 text-[12px] font-medium" style="color: var(--app-foreground);">No Commits</p>
          <p class="mt-1 text-[11px]" style="color: var(--app-disabled-foreground);">Repository is empty</p>
        </div>
      `;
    }

    return html`
      <div class="flex-1 overflow-y-auto">
        ${this.commits.map(commit => html`
          <div
            class="flex items-center gap-2 px-3 py-2 cursor-pointer border-b transition-colors hover:bg-[var(--app-hover-background)] ${this.selectedCommit?.hash === commit.hash ? 'bg-[var(--brand-primary)] text-white' : ''}"
            style="border-bottom-color: var(--app-border);"
            @click=${() => this.selectCommit(commit)}>

            ${this.renderCommitGraph(commit)}

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[12px] font-medium truncate" style="color: var(--app-foreground);">
                  ${commit.subject}
                </span>
                ${commit.branches.map(b => html`
                  <span class="text-[10px] px-1 rounded" style="background-color: var(--brand-primary); color: white;">
                    ${b}
                  </span>
                `)}
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-[10px]" style="color: var(--app-disabled-foreground);">
                  ${commit.author}
                </span>
                <span class="text-[10px]" style="color: var(--app-disabled-foreground);">
                  ${commit.date}
                </span>
                <span class="text-[9px] font-mono px-1 rounded" style="background-color: var(--app-toolbar-hover); color: var(--app-foreground);">
                  ${commit.shortHash}
                </span>
              </div>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private renderBranchList(): ReturnType<typeof html> {
    return html`
      <div class="flex-1 overflow-y-auto">
        ${this.branches.map(branch => html`
          <div
            class="flex items-center gap-2 px-3 py-2 cursor-pointer border-b hover:bg-[var(--app-hover-background)]"
            style="border-bottom-color: var(--app-border);">

            <os-icon name="git-branch" size="14" color="var(--brand-primary)"></os-icon>

            <span class="text-[12px]" style="color: var(--app-foreground);">
              ${branch.name}
            </span>

            ${branch.name === this.currentBranch ? html`
              <span class="text-[10px] px-1.5 py-0.5 rounded" style="background-color: var(--brand-primary); color: white;">
                Current
              </span>
            ` : ''}

            <span class="text-[10px] ml-auto" style="color: var(--app-disabled-foreground);">
              ${branch.top_commit?.substring(0, 7) || ''}
            </span>
          </div>
        `)}
      </div>
    `;
  }

  private renderCommitDetails(): ReturnType<typeof html> {
    if (!this.selectedCommit) {
      return html`
        <div class="flex-1 flex flex-col items-center justify-center py-4">
          <p class="text-[11px]" style="color: var(--app-disabled-foreground);">Select a commit to view details</p>
        </div>
      `;
    }

    return html`
      <div class="flex-1 overflow-y-auto p-3 border-t" style="border-color: var(--app-border);">
        <div class="mb-3">
          <p class="text-[12px] font-semibold" style="color: var(--app-foreground);">
            ${this.selectedCommit.subject}
          </p>
          <p class="text-[10px] mt-1" style="color: var(--app-disabled-foreground);">
            ${this.selectedCommit.hash}
          </p>
        </div>

        <div class="flex items-center gap-4 mb-3">
          <div>
            <span class="text-[10px]" style="color: var(--app-disabled-foreground);">Author</span>
            <p class="text-[11px]" style="color: var(--app-foreground);">${this.selectedCommit.author}</p>
          </div>
          <div>
            <span class="text-[10px]" style="color: var(--app-disabled-foreground);">Date</span>
            <p class="text-[11px]" style="color: var(--app-foreground);">${this.selectedCommit.date}</p>
          </div>
        </div>

        ${this.selectedCommit.branches.length > 0 ? html`
          <div>
            <span class="text-[10px]" style="color: var(--app-disabled-foreground);">Branches</span>
            <div class="flex gap-1 mt-1">
              ${this.selectedCommit.branches.map(b => html`
                <span class="text-[10px] px-1.5 py-0.5 rounded" style="background-color: var(--brand-primary); color: white;">
                  ${b}
                </span>
              `)}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderNoRepo(): ReturnType<typeof html> {
    return html`
      <div class="flex flex-col items-center justify-center h-full py-8 px-4">
        <os-icon name="git-branch" size="36" color="var(--app-disabled-foreground)"></os-icon>
        <p class="mt-3 text-[12px] font-medium" style="color: var(--app-foreground);">No Git Repository</p>
        <p class="mt-1.5 text-[11px] text-center" style="color: var(--app-disabled-foreground);">Initialize to view history</p>
      </div>
    `;
  }

  render() {
    return html`
      <div class="flex flex-col h-full w-full" style="background-color: var(--app-bg);">
        ${this.renderToolbar()}
        ${this.renderTabs()}
        <div class="flex flex-1 overflow-hidden min-h-0">
          <!-- Left: Commit List / Branch List -->
          <div class="flex-1 flex flex-col overflow-hidden min-w-0" style="border-right-color: var(--app-border); border-right-width: 1px; border-right-style: solid;">
            ${this.activeTab === 'log' ? this.renderCommitList() : this.renderBranchList()}
          </div>

          <!-- Right: Commit Details -->
          ${this.activeTab === 'log' ? html`
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" style="width: 300px;">
              ${this.renderCommitDetails()}
            </div>
          ` : ''}
        </div>
        ${this.loading ? html`
          <div class="flex items-center justify-center py-4 border-t" style="border-color: var(--app-border);">
            <os-icon name="rotate-ccw" size="16" color="var(--brand-primary)" class="animate-spin"></os-icon>
            <span class="text-[11px] ml-2" style="color: var(--app-disabled-foreground);">Loading...</span>
          </div>
        ` : ''}
        ${this.error ? html`
          <div class="flex items-center justify-center py-4 border-t" style="border-color: var(--app-border);">
            <os-icon name="circle-dot" size="16" color="var(--git-deleted)"></os-icon>
            <span class="text-[11px] ml-2" style="color: var(--git-deleted);">${this.error}</span>
          </div>
        ` : ''}
      </div>
    `;
  }
}
