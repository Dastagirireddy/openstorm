/**
 * Pull Requests Panel Component - Famous Style
 *
 * Follows Famous's Pull Requests tool window layout:
 * - Left sidebar panel with PR list
 * - Filters for open/closed/merged PRs
 * - PR details view
 */

import { html, css, type CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement, getTailwindStyles } from '../../tailwind-element.js';
import '../layout/icon';
import { gitGetPullRequests } from '../../lib/git';
import type { PullRequest } from '../../lib/git';

interface PullRequest {
  id: number;
  title: string;
  author: string;
  created_at: string;
  branch: string;
  base: string;
  status: 'open' | 'closed' | 'merged';
  description?: string;
  commits?: number;
  changed_files?: number;
  additions?: number;
  deletions?: number;
}

@customElement('pull-requests-panel')
export class PullRequestsPanel extends TailwindElement() {
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
      .pr-row.selected {
        background-color: var(--brand-primary) !important;
      }
      .pr-row.selected * {
        color: white !important;
      }
      .pr-row.selected os-icon {
        color: white !important;
      }
    `,
  ];

  @property() projectPath = '';
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private pullRequests: PullRequest[] = [];
  @state() private selectedPR: PullRequest | null = null;
  @state() private activeFilter: 'open' | 'closed' | 'merged' | 'all' = 'open';
  @state() private searchQuery = '';
  @state() private showDetails = false;

  connectedCallback(): void {
    super.connectedCallback();

    document.addEventListener('project-opened', (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string }>;
      this.projectPath = customEvent.detail.path;
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
      const prs = await gitGetPullRequests(this.projectPath);

      // Map backend PRs to frontend format
      this.pullRequests = prs.map(pr => ({
        id: pr.number,
        title: pr.title,
        author: pr.author,
        created_at: pr.created_at,
        branch: pr.head_branch,
        base: pr.base_branch,
        status: pr.state as 'open' | 'closed' | 'merged',
        description: pr.body || undefined,
        commits: pr.commits,
        changed_files: pr.changed_files,
        additions: pr.additions,
        deletions: pr.deletions,
      }));
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load pull requests';
      console.error('Failed to load PRs:', e);
    } finally {
      this.loading = false;
      this.requestUpdate();
    }
  }

  private selectPR(pr: PullRequest): void {
    this.selectedPR = pr;
    this.showDetails = true;
    this.requestUpdate();
  }

  private goBackToList(): void {
    this.showDetails = false;
    this.requestUpdate();
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'open': return 'var(--git-added)';
      case 'closed': return 'var(--git-deleted)';
      case 'merged': return 'var(--brand-primary)';
      default: return 'var(--app-foreground)';
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'open': return 'git-branch';
      case 'closed': return 'x-circle';
      case 'merged': return 'git-merge';
      default: return 'git-pull-request';
    }
  }

  private renderToolbar(): ReturnType<typeof html> {
    return html`
      <div class="flex items-center justify-between px-2 py-1.5 border-b" style="border-color: var(--app-border); background-color: var(--app-toolbar-background);">
        <div class="flex items-center gap-1">
          <button
            class="w-7 h-7 flex items-center justify-center rounded transition-colors"
            title="Refresh"
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
            @click=${() => this.refreshData()}>
            <os-icon name="rotate-ccw" size="14" color="var(--app-foreground)"></os-icon>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="text"
            class="px-2 py-1 text-[11px] border rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: var(--app-input-border);"
            placeholder="Search PRs..."
            .value=${this.searchQuery}
            @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value; this.requestUpdate(); }}>
        </div>
      </div>
    `;
  }

  private renderFilters(): ReturnType<typeof html> {
    const filters: Array<{ id: 'open' | 'closed' | 'merged' | 'all'; label: string; count: number }> = [
      { id: 'open', label: 'Open', count: this.pullRequests.filter(pr => pr.status === 'open').length },
      { id: 'merged', label: 'Merged', count: this.pullRequests.filter(pr => pr.status === 'merged').length },
      { id: 'closed', label: 'Closed', count: this.pullRequests.filter(pr => pr.status === 'closed').length },
      { id: 'all', label: 'All', count: this.pullRequests.length },
    ];

    return html`
      <div class="flex items-center gap-1 px-3 py-2 border-b" style="border-color: var(--app-border); background-color: var(--app-bg); overflow-x: auto; overflow-y: hidden; width: 100%;">
        ${filters.map(filter => html`
          <button
            class="px-3 py-1.5 text-[11px] font-medium rounded transition-colors cursor-pointer"
            style="background-color: ${this.activeFilter === filter.id ? 'var(--brand-primary)' : 'transparent'}; color: ${this.activeFilter === filter.id ? 'white' : 'var(--app-foreground)'}; white-space: nowrap; flex-shrink: 0;"
            @click=${() => { this.activeFilter = filter.id; this.requestUpdate(); }}>
            ${filter.label}
            <span
              class="text-[10px] ml-1.5 px-1.5 py-0.5 rounded"
              style="background-color: ${this.activeFilter === filter.id ? 'rgba(255,255,255,0.2)' : 'var(--app-toolbar-hover)'}; color: ${this.activeFilter === filter.id ? 'white' : 'var(--app-disabled-foreground)'};">
              ${filter.count}
            </span>
          </button>
        `)}
      </div>
    `;
  }

  private renderPRList(): ReturnType<typeof html> {
    const filteredPRs = this.pullRequests.filter(pr => {
      if (this.activeFilter !== 'all' && pr.status !== this.activeFilter) return false;
      if (this.searchQuery && !pr.title.toLowerCase().includes(this.searchQuery.toLowerCase())) return false;
      return true;
    });

    if (filteredPRs.length === 0) {
      return html`
        <div class="flex flex-col items-center justify-center h-full py-8">
          <os-icon name="git-pull-request" size="36" color="var(--app-disabled-foreground)"></os-icon>
          <p class="mt-3 text-[12px] font-medium" style="color: var(--app-foreground);">No Pull Requests</p>
          <p class="mt-1 text-[11px]" style="color: var(--app-disabled-foreground);">
            ${this.activeFilter === 'open' ? 'No open pull requests' : 'No pull requests found'}
          </p>
        </div>
      `;
    }

    return html`
      <div class="flex flex-col">
        ${filteredPRs.map(pr => html`
          <div
            class="pr-row flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b ${this.selectedPR?.id === pr.id ? 'selected' : ''}"
            style="border-bottom-color: var(--app-border); background-color: ${this.selectedPR?.id === pr.id ? 'var(--brand-primary)' : 'transparent'};"
            @click=${() => this.selectPR(pr)}>

            <os-icon
              name="${this.getStatusIcon(pr.status)}"
              size="16"
              style="color: ${this.selectedPR?.id === pr.id ? 'white' : this.getStatusColor(pr.status)}; margin-top: 2px; flex-shrink: 0;">
            </os-icon>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[12px] font-medium truncate" style="color: ${this.selectedPR?.id === pr.id ? 'white' : 'var(--app-foreground)'};">
                  ${pr.title}
                </span>
              </div>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[10px]" style="color: ${this.selectedPR?.id === pr.id ? 'rgba(255,255,255,0.8)' : 'var(--app-disabled-foreground)'};">
                  #${pr.id} by ${pr.author}
                </span>
                <span class="text-[10px]" style="color: ${this.selectedPR?.id === pr.id ? 'rgba(255,255,255,0.8)' : 'var(--app-disabled-foreground)'};">
                  ${pr.created_at}
                </span>
              </div>
              <div class="flex items-center gap-1.5 mt-1.5">
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded"
                  style="background-color: ${this.selectedPR?.id === pr.id ? 'rgba(255,255,255,0.15)' : 'var(--app-toolbar-hover)'}; color: ${this.selectedPR?.id === pr.id ? 'white' : 'var(--app-foreground)'};">
                  ${pr.branch}
                </span>
                <os-icon name="arrow-right" size="10" style="color: ${this.selectedPR?.id === pr.id ? 'rgba(255,255,255,0.6)' : 'var(--app-disabled-foreground)'};"></os-icon>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded"
                  style="background-color: ${this.selectedPR?.id === pr.id ? 'rgba(255,255,255,0.15)' : 'var(--app-toolbar-hover)'}; color: ${this.selectedPR?.id === pr.id ? 'white' : 'var(--app-foreground)'};">
                  ${pr.base}
                </span>
              </div>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private renderPRDetails(): ReturnType<typeof html> {
    if (!this.selectedPR) {
      return html`
        <div class="flex flex-col items-center justify-center h-full py-4">
          <p class="text-[11px]" style="color: var(--app-disabled-foreground);">Select a pull request to view details</p>
        </div>
      `;
    }

    const pr = this.selectedPR;

    return html`
      <div class="flex flex-col h-full overflow-y-auto p-3">
        <div class="mb-3">
          <div class="flex items-center gap-2 mb-2">
            <span
              class="text-[10px] px-2 py-0.5 rounded font-medium"
              style="background-color: ${this.getStatusColor(pr.status)}20; color: ${this.getStatusColor(pr.status)};">
              ${pr.status.charAt(0).toUpperCase() + pr.status.slice(1)}
            </span>
            <span class="text-[10px]" style="color: var(--app-disabled-foreground);">#${pr.id}</span>
          </div>
          <p class="text-[13px] font-semibold" style="color: var(--app-foreground);">
            ${pr.title}
          </p>
        </div>

        ${pr.description ? html`
          <div class="mb-3 p-2 rounded" style="background-color: var(--app-toolbar-hover);">
            <p class="text-[11px]" style="color: var(--app-foreground);">${pr.description}</p>
          </div>
        ` : ''}

        <div class="mb-3 flex items-center gap-4">
          <div>
            <span class="text-[10px]" style="color: var(--app-disabled-foreground);">Author</span>
            <p class="text-[11px]" style="color: var(--app-foreground);">${pr.author}</p>
          </div>
          <div>
            <span class="text-[10px]" style="color: var(--app-disabled-foreground);">Created</span>
            <p class="text-[11px]" style="color: var(--app-foreground);">${pr.created_at}</p>
          </div>
          ${pr.commits ? html`
            <div>
              <span class="text-[10px]" style="color: var(--app-disabled-foreground);">Commits</span>
              <p class="text-[11px]" style="color: var(--app-foreground);">${pr.commits}</p>
            </div>
          ` : ''}
        </div>

        <div class="mb-3">
          <span class="text-[10px]" style="color: var(--app-disabled-foreground);">Branches</span>
          <div class="flex items-center gap-1.5 mt-1">
            <span class="text-[11px] px-1.5 py-0.5 rounded" style="background-color: var(--brand-primary); color: white;">
              ${pr.branch}
            </span>
            <os-icon name="arrow-right" size="12" style="color: var(--app-disabled-foreground);"></os-icon>
            <span class="text-[11px] px-1.5 py-0.5 rounded" style="background-color: var(--app-toolbar-hover); color: var(--app-foreground);">
              ${pr.base}
            </span>
          </div>
        </div>

        ${(pr.additions !== undefined || pr.deletions !== undefined) ? html`
          <div>
            <span class="text-[10px]" style="color: var(--app-disabled-foreground);">Changes</span>
            <div class="flex items-center gap-3 mt-1">
              ${pr.additions !== undefined ? html`
                <span class="text-[11px]" style="color: var(--git-added);">+${pr.additions}</span>
              ` : ''}
              ${pr.deletions !== undefined ? html`
                <span class="text-[11px]" style="color: var(--git-deleted);">-${pr.deletions}</span>
              ` : ''}
              ${pr.changed_files !== undefined ? html`
                <span class="text-[11px]" style="color: var(--app-disabled-foreground);">${pr.changed_files} files</span>
              ` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  render() {
    return html`
      <div class="flex flex-col h-full w-full" style="background-color: var(--app-bg);">
        ${this.showDetails ? this.renderPRDetailsView() : this.renderPRListView()}
        ${this.loading ? html`
          <div class="flex items-center justify-center py-4 border-t" style="border-color: var(--app-border);">
            <os-icon name="loader" size="16" color="var(--brand-primary)" class="animate-spin"></os-icon>
            <span class="text-[11px] ml-2" style="color: var(--app-disabled-foreground);">Loading...</span>
          </div>
        ` : ''}
        ${this.error ? html`
          <div class="flex items-center justify-center py-4 border-t" style="border-color: var(--app-border);">
            <os-icon name="alert-circle" size="16" color="var(--git-deleted)"></os-icon>
            <span class="text-[11px] ml-2" style="color: var(--git-deleted);">${this.error}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderPRListView(): ReturnType<typeof html> {
    return html`
      ${this.renderToolbar()}
      ${this.renderFilters()}
      <div class="flex flex-col flex-1 overflow-y-auto" style="min-height: 0;">
        ${this.renderPRList()}
      </div>
    `;
  }

  private renderPRDetailsView(): ReturnType<typeof html> {
    return html`
      ${this.renderDetailsHeader()}
      ${this.renderPRDetails()}
    `;
  }

  private renderDetailsHeader(): ReturnType<typeof html> {
    return html`
      <div class="flex items-center gap-2 px-3 py-2 border-b" style="border-color: var(--app-border); background-color: var(--app-toolbar-background);">
        <button
          class="w-7 h-7 flex items-center justify-center rounded transition-colors"
          title="Back to list"
          @click=${() => this.goBackToList()}>
          <os-icon name="chevron-left" size="16" color="var(--app-foreground)"></os-icon>
        </button>
        <span class="text-[12px] font-medium" style="color: var(--app-foreground);">Pull Request Details</span>
      </div>
    `;
  }
}
