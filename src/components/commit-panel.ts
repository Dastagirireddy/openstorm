/**
 * Commit Panel Component
 *
 * Professional commit panel for staging files and creating commits.
 * Features:
 * - Branch indicator showing current branch
 * - File change list with staged/unstaged/untracked sections
 * - Commit message input with length indicators
 * - Amend commit option
 */

import { html, css, type CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement, getTailwindStyles } from '../tailwind-element.js';
import { dispatch } from '../lib/events.js';
import type { RepoStatus, FileChange, RepoInfo } from '../lib/git-types.js';
import './icon.js';
import * as git from '../lib/git-api.js';

@customElement('commit-panel')
export class CommitPanel extends TailwindElement() {
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
      .file-row {
        transition: background-color 0.1s ease;
      }
      .file-row:hover {
        background-color: var(--app-hover-background);
      }
      .section-header {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .commit-btn {
        transition: all 0.15s ease;
      }
      .checkbox-custom {
        appearance: none;
        width: 16px;
        height: 16px;
        border: 2px solid var(--app-border);
        border-radius: 3px;
        cursor: pointer;
        position: relative;
        flex-shrink: 0;
      }
      .checkbox-custom:hover {
        border-color: var(--brand-primary);
      }
      .checkbox-custom:checked {
        background-color: var(--brand-primary);
        border-color: var(--brand-primary);
      }
      .checkbox-custom:checked::after {
        content: '✓';
        position: absolute;
        color: white;
        font-size: 11px;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
    `,
  ];

  @property() projectPath = '';
  @state() private repoInfo: RepoInfo | null = null;
  @state() private status: RepoStatus | null = null;
  @state() private currentBranch = '';
  @state() private commitMessage = '';
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private expandedSections: Set<string> = new Set(['staged', 'unstaged', 'untracked']);

  connectedCallback(): void {
    super.connectedCallback();

    document.addEventListener('project-opened', (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string }>;
      this.projectPath = customEvent.detail.path;
      this.refreshStatus();
    });

    document.addEventListener('git-refresh', () => {
      this.refreshStatus();
    });

    document.addEventListener('git-initialized', () => {
      this.refreshStatus();
    });

    if (this.projectPath) {
      this.refreshStatus();
    }
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('projectPath') && this.projectPath) {
      this.refreshStatus();
    }
  }

  private async refreshStatus(): Promise<void> {
    if (!this.projectPath) return;

    this.loading = true;
    this.error = null;

    try {
      this.repoInfo = await git.gitCheckRepository(this.projectPath);

      if (this.repoInfo.is_repository) {
        this.status = await git.gitGetStatus(this.projectPath);
        this.currentBranch = await git.gitGetBranch(this.projectPath);

        // Fetch diff stats for each file
        if (this.status) {
          const allFiles = [...this.status.staged, ...this.status.unstaged, ...this.status.untracked];
          for (const file of allFiles) {
            try {
              const stats = await git.gitGetFileDiffStats(this.projectPath, file.path, file.staged);
              file.additions = stats.additions;
              file.deletions = stats.deletions;
            } catch {
              // Ignore stats fetch errors, continue without stats
            }
          }
        }
      } else {
        this.status = null;
        this.currentBranch = '';
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load git status';
      this.currentBranch = '';
    } finally {
      this.loading = false;
      this.requestUpdate();
    }
  }

  private async initRepo(): Promise<void> {
    if (!this.projectPath) return;

    try {
      const branch = await git.gitInit(this.projectPath);
      await this.refreshStatus();
      dispatch('git-initialized', { branch });
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to initialize repository';
    }
  }

  private async stageFile(filePath: string): Promise<void> {
    try {
      await git.gitStageFile(this.projectPath, filePath);
      await this.refreshStatus();
    } catch (e) {
      console.error('[Commit Panel] Failed to stage file:', e);
    }
  }

  private async unstageFile(filePath: string): Promise<void> {
    try {
      await git.gitUnstageFile(this.projectPath, filePath);
      await this.refreshStatus();
    } catch (e) {
      console.error('[Commit Panel] Failed to unstage file:', e);
    }
  }

  private async stageAll(): Promise<void> {
    try {
      await git.gitStageAll(this.projectPath);
      await this.refreshStatus();
    } catch (e) {
      console.error('[Commit Panel] Failed to stage all:', e);
    }
  }

  private async discardFile(filePath: string, staged: boolean): Promise<void> {
    try {
      await git.gitDiscardFile(this.projectPath, filePath, staged);
      await this.refreshStatus();
    } catch (e) {
      console.error('[Commit Panel] Failed to discard file:', e);
    }
  }

  private async discardAllChanges(): Promise<void> {
    if (!confirm('Discard all changes? This action cannot be undone.')) return;

    try {
      await git.gitDiscardAll(this.projectPath);
      await this.refreshStatus();
    } catch (e) {
      console.error('[Commit Panel] Failed to discard all changes:', e);
    }
  }

  private async commit(): Promise<void> {
    if (!this.commitMessage.trim()) return;

    try {
      // Stage all changes before commit
      await git.gitStageAll(this.projectPath);
      await this.refreshStatus();

      const result = await git.gitCommit(this.projectPath, this.commitMessage);

      if (result.success) {
        this.commitMessage = '';
        await this.refreshStatus();
        dispatch('git-committed', { hash: result.commit_hash });
      } else {
        this.error = result.error || 'Commit failed';
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Commit failed';
    }
  }

  private getFileIcon(status: string): string {
    switch (status) {
      case 'added': return 'file-plus';
      case 'deleted': return 'file-x';
      case 'modified': return 'file-diff';
      case 'renamed': return 'file-rename';
      case 'untracked': return 'file-question';
      default: return 'file';
    }
  }

  private getFileStatusColor(status: string): string {
    switch (status) {
      case 'added': return 'var(--git-added)';
      case 'deleted': return 'var(--git-deleted)';
      case 'modified': return 'var(--git-modified)';
      case 'renamed': return 'var(--git-renamed)';
      case 'untracked': return 'var(--git-untracked)';
      default: return 'var(--app-foreground)';
    }
  }

  private renderToolbar(): ReturnType<typeof html> {
    const hasChanges = this.status && (this.status.staged.length > 0 || this.status.unstaged.length > 0 || this.status.untracked.length > 0);

    return html`
      <div class="flex items-center justify-between px-2 py-1.5 border-b" style="border-color: var(--app-border);">
        <span class="text-[11px] font-medium" style="color: var(--app-foreground);">Changes</span>
        <div class="flex items-center gap-1">
          <button
            class="px-2 py-1 text-[11px] rounded transition-colors flex items-center gap-1"
            title="Discard All Changes"
            ?disabled=${!hasChanges}
            style="background: ${hasChanges ? 'transparent' : 'var(--app-disabled-background)'}; color: ${hasChanges ? 'var(--git-deleted)' : 'var(--app-disabled-foreground)'};"
            @mouseenter=${(e: Event) => { if (hasChanges) (e.target as HTMLElement).style.backgroundColor = 'color-mix(in srgb, var(--git-deleted) 10%, transparent)'; }}
            @mouseleave=${(e: Event) => { if (hasChanges) (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
            @click=${() => this.discardAllChanges()}>
            <os-icon name="rotate-ccw" size="12"></os-icon>
            Discard all
          </button>
          <button
            class="w-7 h-7 flex items-center justify-center rounded transition-colors"
            title="Refresh"
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
            @click=${() => this.refreshStatus()}>
            <os-icon name="rotate-cw" size="14" color="var(--app-foreground)"></os-icon>
          </button>
        </div>
      </div>
    `;
  }

  private renderChangelistHeader(title: string, count: number, color: string, sectionKey: string): ReturnType<typeof html> {
    const isExpanded = this.expandedSections.has(sectionKey);

    return html`
      <div
        class="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
        style="background: color-mix(in srgb, ${color} 6%, transparent);"
        @click=${() => {
          if (isExpanded) {
            this.expandedSections.delete(sectionKey);
          } else {
            this.expandedSections.add(sectionKey);
          }
          this.requestUpdate();
        }}>
        <os-icon name="chevron-right" size="12" style="transform: ${isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'}; transition: transform 0.15s; color: var(--app-disabled-foreground);"></os-icon>
        <span class="section-header" style="color: ${color};">${title}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full" style="background-color: color-mix(in srgb, ${color} 15%, transparent); color: ${color};">${count}</span>
      </div>
    `;
  }

  private renderFileChange(change: FileChange): ReturnType<typeof html> {
    const fileName = change.path.split('/').pop() || change.path;
    const statusColor = this.getFileStatusColor(change.status);
    const additions = change.additions ?? 0;
    const deletions = change.deletions ?? 0;

    // Untracked files don't have diff stats - show "new"
    const isUntracked = change.status === 'untracked';

    return html`
      <div
        class="file-row flex items-center gap-2 px-3 py-1.5"
        style="background-color: ${change.staged ? 'color-mix(in srgb, var(--git-added) 6%, transparent)' : 'transparent'};">

        <input
          type="checkbox"
          class="checkbox-custom"
          ?checked=${change.staged}
          @change=${(e: Event) => {
            e.stopPropagation();
            const target = e.target as HTMLInputElement;
            if (target.checked) {
              this.stageFile(change.path);
            } else {
              this.unstageFile(change.path);
            }
          }}>

        <os-icon name="${this.getFileIcon(change.status)}" size="14" color="${statusColor}"></os-icon>

        <span class="flex-1 text-[12px] truncate" style="color: var(--app-foreground);">${fileName}</span>

        ${isUntracked ? html`
          <span class="text-[10px]" style="color: var(--git-added);">new</span>
        ` : html`
          <div class="flex items-center gap-1 text-[10px]" style="color: var(--app-disabled-foreground);">
            <span style="color: var(--git-added);">+${additions}</span>
            <span style="color: var(--git-deleted);">-${deletions}</span>
          </div>
        `}
      </div>
    `;
  }

  private renderChangesSection(): ReturnType<typeof html> {
    if (!this.status) return html``;

    const { staged, unstaged, untracked } = this.status;
    const hasChanges = staged.length > 0 || unstaged.length > 0 || untracked.length > 0;

    if (!hasChanges) {
      return html`
        <div class="flex-1 flex flex-col items-center justify-center py-8">
          <div class="w-12 h-12 rounded-full flex items-center justify-center" style="background: color-mix(in srgb, var(--brand-primary) 10%, transparent);">
            <os-icon name="git-commit-vertical" size="24" color="var(--brand-primary)"></os-icon>
          </div>
          <p class="mt-3 text-[12px] font-medium" style="color: var(--app-foreground);">No Changes</p>
          <p class="mt-1 text-[11px]" style="color: var(--app-disabled-foreground);">All files are committed</p>
        </div>
      `;
    }

    const expandedStaged = this.expandedSections.has('staged');
    const expandedUnstaged = this.expandedSections.has('unstaged');
    const expandedUntracked = this.expandedSections.has('untracked');

    return html`
      <div class="flex flex-col">
        <div class="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0" style="border-color: var(--app-border); background-color: var(--app-bg);">
          <os-icon name="git-branch" size="14" color="var(--app-foreground)"></os-icon>
          <span class="text-[11px] font-medium" style="color: var(--app-foreground);">${this.currentBranch || 'HEAD'}</span>
          <span class="text-[10px]" style="color: var(--app-disabled-foreground);">
            ${staged.length + unstaged.length + untracked.length} file${staged.length + unstaged.length + untracked.length !== 1 ? 's' : ''} changed
          </span>
        </div>
        <div>
          ${staged.length > 0 ? html`
            ${this.renderChangelistHeader('Staged Changes', staged.length, 'var(--git-added)', 'staged')}
            ${expandedStaged ? staged.map(change => this.renderFileChange(change)) : ''}
          ` : ''}

          ${unstaged.length > 0 ? html`
            ${this.renderChangelistHeader('Unstaged Changes', unstaged.length, 'var(--git-modified)', 'unstaged')}
            ${expandedUnstaged ? unstaged.map(change => this.renderFileChange(change)) : ''}
          ` : ''}

          ${untracked.length > 0 ? html`
            ${this.renderChangelistHeader('Unversioned Files', untracked.length, 'var(--git-untracked)', 'untracked')}
            ${expandedUntracked ? untracked.map(change => this.renderFileChange(change)) : ''}
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderCommitMessageSection(): ReturnType<typeof html> {
    const messageLength = this.commitMessage.trim().length;
    const firstLineLength = this.commitMessage.trim().split('\n')[0]?.length || 0;
    const showFirstLineWarning = firstLineLength > 50;
    const showLengthWarning = messageLength > 72;

    return html`
      <div class="border-t p-3 flex-shrink-0" style="border-color: var(--app-border);">
        <div class="flex items-center justify-between mb-1.5">
          <span class="section-header" style="color: var(--app-foreground);">Commit Message</span>
          <span class="text-[10px]" style="color: ${showFirstLineWarning || showLengthWarning ? 'var(--git-deleted)' : 'var(--app-disabled-foreground)'};">
            ${firstLineLength}/${messageLength} chars
          </span>
        </div>

        <textarea
          class="w-full h-12 px-2 py-1 text-[12px] border rounded resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: var(--app-input-border);"
          placeholder="Enter commit message..."
          .value=${this.commitMessage}
          @input=${(e: Event) => { this.commitMessage = (e.target as HTMLTextAreaElement).value; this.requestUpdate(); }}>
        </textarea>

        ${showFirstLineWarning ? html`
          <p class="mt-1 text-[10px]" style="color: var(--git-deleted);">First line exceeds 50 characters</p>
        ` : showLengthWarning ? html`
          <p class="mt-1 text-[10px]" style="color: var(--git-deleted);">Message exceeds 72 characters</p>
        ` : ''}

        <div class="flex items-center gap-3 mt-1.5">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" class="checkbox-custom" style="width: 14px; height: 14px;">
            <span class="text-[11px]" style="color: var(--app-foreground);">Amend</span>
          </label>
        </div>
      </div>
    `;
  }


  private renderCommitActions(): ReturnType<typeof html> {
    const hasChanges = this.status && (this.status.staged.length > 0 || this.status.unstaged.length > 0 || this.status.untracked.length > 0);
    const canCommit = hasChanges && this.commitMessage.trim();

    return html`
      <div class="border-t p-3 flex-shrink-0" style="border-color: var(--app-border);">
        <button
          class="w-full px-3 py-1.5 text-[13px] font-medium rounded transition-all"
          style="background: ${canCommit ? 'var(--brand-primary)' : 'var(--app-disabled-background)'}; color: ${canCommit ? 'white' : 'var(--app-disabled-foreground)'};"
          ?disabled=${!canCommit}
          @click=${() => this.commit()}>
          Commit
        </button>
      </div>
    `;
  }

  private renderNoRepo(): ReturnType<typeof html> {
    return html`
      <div class="flex flex-col items-center justify-center h-full py-8 px-4">
        <os-icon name="git-branch" size="36" color="var(--app-disabled-foreground)"></os-icon>
        <p class="mt-3 text-[12px] font-medium" style="color: var(--app-foreground);">No Git Repository</p>
        <p class="mt-1.5 text-[11px] text-center" style="color: var(--app-disabled-foreground);">Initialize to track changes</p>
        <button
          class="mt-3 px-4 py-1.5 text-[11px] font-medium rounded border transition-colors"
          style="border-color: var(--app-border); color: var(--app-foreground); background-color: var(--app-bg);"
          @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-bg)'}
          @click=${() => this.initRepo()}>
          Initialize Repository
        </button>
      </div>
    `;
  }

  render() {
    return html`
      <div class="flex flex-col h-full w-full" style="background-color: var(--app-bg);">
        ${this.renderToolbar()}
        ${!this.loading && !this.error && this.repoInfo?.is_repository ? html`
          <div class="flex-1 overflow-y-auto min-h-0">
            ${this.renderChangesSection()}
            ${this.renderCommitMessageSection()}
            ${this.renderCommitActions()}
          </div>
        ` : ''}
        ${!this.loading && !this.error && !this.repoInfo?.is_repository ? this.renderNoRepo() : ''}
        ${this.loading ? html`
          <div class="flex-1 flex items-center justify-center">
            <os-icon name="loader" size="24" color="var(--brand-primary)" class="animate-spin"></os-icon>
          </div>
        ` : ''}
        ${this.error ? html`
          <div class="flex-1 flex flex-col items-center justify-center p-4">
            <os-icon name="alert-circle" size="24" color="var(--git-deleted)"></os-icon>
            <p class="mt-2 text-[12px]" style="color: var(--app-foreground);">${this.error}</p>
          </div>
        ` : ''}
      </div>
    `;
  }
}
