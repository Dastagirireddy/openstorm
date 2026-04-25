/**
 * Commit Panel Component - IntelliJ Style
 *
 * Follows IntelliJ's Commit tool window layout:
 * - Left sidebar with file changes tree
 * - Commit message input
 * - Before Commit options (expandable)
 * - Commit actions at bottom
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
      .expandable-section {
        transition: all 0.2s ease;
      }
      .commit-btn {
        transition: all 0.15s ease;
      }
      .commit-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      .checkbox-custom {
        appearance: none;
        width: 16px;
        height: 16px;
        border: 2px solid var(--app-border);
        border-radius: 3px;
        cursor: pointer;
        position: relative;
      }
      .checkbox-custom:checked {
        background-color: var(--brand-primary);
        border-color: var(--brand-primary);
      }
      .checkbox-custom:checked::after {
        content: '✓';
        position: absolute;
        color: white;
        font-size: 12px;
        top: -1px;
        left: 2px;
      }
    `,
  ];

  @property() projectPath = '';
  @state() private repoInfo: RepoInfo | null = null;
  @state() private status: RepoStatus | null = null;
  @state() private commitMessage = '';
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private selectedFiles: Set<string> = new Set();
  @state() private showBeforeCommit = false;
  @state() private showAfterCommit = false;

  // Before Commit options
  @state() private reformatCode = false;
  @state() private rearrangeCode = false;
  @state() private optimizeImports = false;
  @state() private analyzeCode = false;
  @state() private checkTODO = false;
  @state() private cleanupCode = false;

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
      } else {
        this.status = null;
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Failed to load git status';
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

  private toggleFileSelection(filePath: string): void {
    if (this.selectedFiles.has(filePath)) {
      this.selectedFiles.delete(filePath);
    } else {
      this.selectedFiles.add(filePath);
    }
    this.requestUpdate();
  }

  private selectAllFiles(): void {
    if (!this.status) return;
    const allFiles = [...this.status.staged, ...this.status.unstaged, ...this.status.untracked];
    allFiles.forEach(f => this.selectedFiles.add(f.path));
    this.requestUpdate();
  }

  private deselectAllFiles(): void {
    this.selectedFiles.clear();
    this.requestUpdate();
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

  private async unstageAll(): Promise<void> {
    try {
      await git.gitUnstageAll(this.projectPath);
      await this.refreshStatus();
    } catch (e) {
      console.error('[Commit Panel] Failed to unstage all:', e);
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

  private async commit(): Promise<void> {
    if (!this.commitMessage.trim()) return;

    try {
      // If no files selected, stage all
      if (this.selectedFiles.size === 0) {
        await git.gitStageAll(this.projectPath);
        await this.refreshStatus();
      }

      const result = await git.gitCommit(this.projectPath, this.commitMessage);

      if (result.success) {
        this.commitMessage = '';
        this.selectedFiles.clear();
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
    return html`
      <div class="flex items-center gap-1 px-2 py-1.5 border-b" style="border-color: var(--app-border);">
        <button
          class="w-7 h-7 flex items-center justify-center rounded transition-colors"
          title="Show Diff"
          @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
          <os-icon name="file" size="14" color="var(--app-foreground)"></os-icon>
        </button>
        <button
          class="w-7 h-7 flex items-center justify-center rounded transition-colors"
          title="Refresh"
          @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          @click=${() => this.refreshStatus()}>
          <os-icon name="rotate-ccw" size="14" color="var(--app-foreground)"></os-icon>
        </button>
        <button
          class="w-7 h-7 flex items-center justify-center rounded transition-colors"
          title="Options"
          @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}>
          <os-icon name="more-horizontal" size="14" color="var(--app-foreground)"></os-icon>
        </button>
      </div>
    `;
  }

  private renderChangelistHeader(title: string, count: number, color: string): ReturnType<typeof html> {
    return html`
      <div class="flex items-center gap-2 px-2 py-1.5" style="background: color-mix(in srgb, ${color} 6%, transparent);">
        <os-icon name="chevron-right" size="12" color="var(--app-disabled-foreground)"></os-icon>
        <span class="section-header" style="color: ${color};">${title}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full" style="background-color: color-mix(in srgb, ${color} 15%, transparent); color: ${color};">${count}</span>
      </div>
    `;
  }

  private renderFileChange(change: FileChange): ReturnType<typeof html> {
    const fileName = change.path.split('/').pop() || change.path;
    const isSelected = this.selectedFiles.has(change.path);
    const statusColor = this.getFileStatusColor(change.status);

    return html`
      <div
        class="file-row flex items-center gap-2 px-3 py-1.5 cursor-pointer border-l-2"
        style="border-left-color: ${isSelected ? statusColor : 'transparent'}; background-color: ${isSelected ? 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' : 'transparent'};"
        @click=${() => this.toggleFileSelection(change.path)}>

        <input
          type="checkbox"
          class="checkbox-custom"
          ?checked=${change.staged}
          @click=${(e: Event) => {
            e.stopPropagation();
            if (change.staged) {
              this.unstageFile(change.path);
            } else {
              this.stageFile(change.path);
            }
          }}>

        <os-icon name="${this.getFileIcon(change.status)}" size="14" color="${statusColor}"></os-icon>

        <span class="flex-1 text-[12px] truncate" style="color: var(--app-foreground);">${fileName}</span>

        <button
          class="w-6 h-6 flex items-center justify-center rounded transition-colors"
          title="Discard"
          @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'color-mix(in srgb, var(--git-deleted) 10%, transparent)'}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          @click=${(e: Event) => {
            e.stopPropagation();
            this.discardFile(change.path, change.staged);
          }}>
          <os-icon name="x" size="12" color="var(--git-deleted)"></os-icon>
        </button>
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
          <div class="w-12 h-12 rounded-full flex items-center justify-center" style="background: color-mix(in srgb, var(--git-added) 10%, transparent);">
            <os-icon name="check" size="24" color="var(--git-added)"></os-icon>
          </div>
          <p class="mt-3 text-[12px] font-medium" style="color: var(--app-foreground);">No Changes</p>
          <p class="mt-1 text-[11px]" style="color: var(--app-disabled-foreground);">All files are committed</p>
        </div>
      `;
    }

    return html`
      <div class="flex-1 overflow-y-auto">
        ${staged.length > 0 ? html`
          ${this.renderChangelistHeader('Staged Changes', staged.length, 'var(--git-added)')}
          ${staged.map(change => this.renderFileChange(change))}
        ` : ''}

        ${unstaged.length > 0 ? html`
          ${this.renderChangelistHeader('Unstaged Changes', unstaged.length, 'var(--git-modified)')}
          ${unstaged.map(change => this.renderFileChange(change))}
        ` : ''}

        ${untracked.length > 0 ? html`
          ${this.renderChangelistHeader('Unversioned Files', untracked.length, 'var(--git-untracked)')}
          ${untracked.map(change => this.renderFileChange(change))}
        ` : ''}
      </div>
    `;
  }

  private renderCommitMessageSection(): ReturnType<typeof html> {
    return html`
      <div class="border-t p-3" style="border-color: var(--app-border);">
        <div class="flex items-center justify-between mb-2">
          <span class="section-header" style="color: var(--app-foreground);">Commit Message</span>
          <button
            class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
            style="background-color: var(--app-toolbar-hover); color: var(--app-foreground);"
            title="Recent commits">
            <os-icon name="clock" size="10"></os-icon>
          </button>
        </div>

        <textarea
          class="w-full h-20 px-2.5 py-2 text-[12px] border rounded resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: var(--app-input-border);"
          placeholder="Enter commit message..."
          .value=${this.commitMessage}
          @input=${(e: Event) => { this.commitMessage = (e.target as HTMLTextAreaElement).value; }}>
        </textarea>

        <div class="flex items-center gap-3 mt-2">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" class="checkbox-custom" style="width: 14px; height: 14px;">
            <span class="text-[11px]" style="color: var(--app-foreground);">Amend</span>
          </label>
        </div>
      </div>
    `;
  }

  private renderBeforeCommitSection(): ReturnType<typeof html> {
    const options = [
      { id: 'reformat', label: 'Reformat code', state: this.reformatCode },
      { id: 'rearrange', label: 'Rearrange code', state: this.rearrangeCode },
      { id: 'optimize', label: 'Optimize imports', state: this.optimizeImports },
      { id: 'analyze', label: 'Analyze code', state: this.analyzeCode },
      { id: 'todo', label: 'Check TODO', state: this.checkTODO },
      { id: 'cleanup', label: 'Cleanup code', state: this.cleanupCode },
    ];

    return html`
      <div class="border-t" style="border-color: var(--app-border);">
        <button
          class="w-full flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
          style="background-color: var(--app-toolbar-hover);"
          @click=${() => { this.showBeforeCommit = !this.showBeforeCommit; this.requestUpdate(); }}>
          <os-icon name="chevron-down" size="12" style="transform: ${this.showBeforeCommit ? 'rotate(0deg)' : 'rotate(-90deg)'}; transition: transform 0.2s; color: var(--app-foreground);"></os-icon>
          <span class="section-header" style="color: var(--app-foreground);">Before Commit</span>
        </button>

        ${this.showBeforeCommit ? html`
          <div class="px-3 py-2 space-y-1.5 expandable-section">
            ${options.map(opt => html`
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" class="checkbox-custom" style="width: 14px; height: 14px;" ?checked=${opt.state}>
                <span class="text-[11px]" style="color: var(--app-foreground);">${opt.label}</span>
              </label>
            `)}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderCommitActions(): ReturnType<typeof html> {
    const hasStaged = this.status?.staged && this.status.staged.length > 0;
    const canCommit = hasStaged && this.commitMessage.trim();

    return html`
      <div class="border-t p-3 flex items-center gap-2" style="border-color: var(--app-border);">
        <button
          class="commit-btn flex-1 px-3 py-2 text-[12px] font-semibold rounded text-white commit-btn"
          style="background: ${canCommit ? 'var(--brand-primary)' : 'var(--app-disabled-background)'};"
          ?disabled=${!canCommit}
          @click=${() => this.commit()}>
          Commit
        </button>
        <button
          class="px-3 py-2 text-[11px] font-medium rounded border transition-colors"
          style="border-color: var(--app-border); color: var(--app-foreground); background-color: var(--app-bg);"
          @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
          @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-bg)'}>
          <os-icon name="more-vertical" size="14"></os-icon>
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
          ${this.renderChangesSection()}
          ${this.renderCommitMessageSection()}
          ${this.renderBeforeCommitSection()}
          ${this.renderCommitActions()}
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
