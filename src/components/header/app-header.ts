import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import '../icon.js';
import '../file-icon.js';
import '../run-toolbar.js';
import { parsePathToSegments, getFileIconColor } from '../../lib/breadcrumb.js';
import * as git from '../../lib/git-api.js';
import { dispatch } from '../../lib/events.js';

export interface HeaderAction {
  id: string;
  icon: string;
  title: string;
  color?: string;
  label?: string;
}

export interface HeaderSection {
  id: string;
  actions: HeaderAction[];
}

export interface BreadcrumbSegment {
  label: string;
  path?: string;
  icon?: string;
  clickable?: boolean;
}

@customElement('app-header')
export class AppHeader extends TailwindElement() {
  @property() projectPath = '';
  @property() activeFile = '';
  @property() saveStatus: 'saved' | 'unsaved' = 'saved';
  @property() isSingleFileMode = false;

  @state() private gitOperationInProgress = false;

  private async handleGitAction(actionId: string): Promise<void> {
    if (!this.projectPath || this.gitOperationInProgress) return;

    try {
      this.gitOperationInProgress = true;

      switch (actionId) {
        case 'pull': {
          console.log('[Git] Pulling from remote...');
          const result = await git.gitPull(this.projectPath);
          console.log('[Git] Pull result:', result);
          dispatch('git-refresh');
          dispatch('status-message', { message: result || 'Pull completed', type: 'success' });
          break;
        }
        case 'commit': {
          // Open commit panel
          dispatch('set-active-activity', { activity: 'commits' });
          break;
        }
        case 'push': {
          console.log('[Git] Pushing to remote...');
          const result = await git.gitPush(this.projectPath, false);
          console.log('[Git] Push result:', result);
          dispatch('git-refresh');
          dispatch('status-message', { message: result || 'Push completed', type: 'success' });
          break;
        }
        case 'history': {
          // Toggle git panel
          dispatch('toggle-git-log', { visible: true });
          break;
        }
        case 'rollback': {
          const confirmed = confirm('Are you sure you want to discard all local changes? This cannot be undone.');
          if (confirmed) {
            await git.gitDiscardAll(this.projectPath);
            dispatch('git-refresh');
            dispatch('status-message', { message: 'All local changes discarded', type: 'success' });
          }
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Operation failed';
      console.error('[Git] Error:', message);
      dispatch('status-message', { message, type: 'error' });
    } finally {
      this.gitOperationInProgress = false;
    }
  }

  private renderAction(action: HeaderAction): TemplateResult {
    const isLabel = action.id === 'git-label';
    if (isLabel) {
      return html`
        <span class="text-[12px] font-medium" style="color: var(--app-disabled-foreground);">${action.label}</span>
      `;
    }

    const isGitAction = ['pull', 'commit', 'push', 'history', 'rollback'].includes(action.id);
    const disabled = this.gitOperationInProgress && isGitAction;

    return html`
      <button
        class="w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer overflow-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        @mouseenter=${(e: Event) => {
          if (!disabled) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)';
        }}
        @mouseleave=${(e: Event) => {
          (e.target as HTMLElement).style.backgroundColor = 'transparent';
        }}
        title="${action.title}"
        data-action="${action.id}"
        ?disabled=${disabled}
        @click=${() => this.handleGitAction(action.id)}>
        <os-icon
          name="${action.icon}"
          color="${action.color || 'var(--app-disabled-foreground)'}"
          width="16"></os-icon>
      </button>
    `;
  }

  private renderSection(section: HeaderSection): TemplateResult {
    return html`
      <div class="flex items-center gap-0.5">
        ${section.actions.map(action => this.renderAction(action))}
      </div>
    `;
  }

  private renderBreadcrumbSegment(segment: BreadcrumbSegment, index: number, totalSegments: number): TemplateResult {
    const isLast = index === totalSegments - 1;
    const iconColor = isLast ? getFileIconColor(segment.path || segment.label) : 'var(--app-disabled-foreground)';
    const isFolder = !isLast || segment.icon === 'folder';

    return html`
      <div class="flex items-center gap-1">
        ${isFolder ? html`
          <os-icon name="folder" color="${iconColor}" size=${14}></os-icon>
        ` : html`
          <file-icon path="${segment.path || segment.label}" size=${14}></file-icon>
        `}
        <span
          class="${isLast ? 'font-semibold' : 'hover:text-[#1a1a1a] cursor-pointer transition-colors'} text-[13px]"
          style="color: ${isLast ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'};"
          ${!isLast && segment.path ? 'data-path="' + segment.path + '"' : ''}>
          ${segment.label}
        </span>
        ${!isLast ? html`
          <os-icon name="chevron-right" color="var(--app-disabled-foreground)" size=${18}></os-icon>
        ` : ''}
      </div>
    `;
  }

  render() {
    const projectName = this.projectPath.split('/').pop() || 'OpenStorm';
    const breadcrumbSegments = parsePathToSegments(this.projectPath, this.activeFile);
    const showBreadcrumb = breadcrumbSegments.length > 0;

    return html`
      <div class="flex flex-col shrink-0">
        <!-- Titlebar with integrated breadcrumb -->
        <div
          class="flex items-center justify-between h-[36px] px-2 border-b select-none"
          style="background: linear-gradient(to bottom, var(--app-tab-inactive), var(--app-toolbar-hover)); border-bottom-color: var(--app-input-border);">

          <!-- Left: Project name + Breadcrumb -->
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <os-brand-logo size="20"></os-brand-logo>
            <span class="text-[12px] font-medium shrink-0" style="color: var(--app-foreground);">${projectName}</span>

            ${showBreadcrumb && breadcrumbSegments.length > 0 ? html`
              <div class="flex items-center gap-1 min-w-0">
                ${breadcrumbSegments.map((segment, index) => this.renderBreadcrumbSegment(segment, index, breadcrumbSegments.length))}
              </div>
            ` : ''}
          </div>

          <!-- Right: Toolbar sections (hidden in single-file mode) -->
          ${!this.isSingleFileMode
            ? html`
                <div class="flex items-center gap-2 shrink-0">
                  <run-toolbar id="run-toolbar"></run-toolbar>

                  <div class="w-[1px] h-3.5 mx-0.5" style="background-color: var(--app-scrollbar);"></div>

                  <!-- Git section -->
                  ${this.renderSection({
                    id: 'git',
                    actions: [
                      { id: 'git-label', icon: '', title: 'Git:', label: 'Git:' },
                      { id: 'pull', icon: 'arrow-down-to-line', title: 'Pull', color: 'var(--app-step-color)' },
                      { id: 'commit', icon: 'check', title: 'Commit', color: 'var(--app-continue-color)' },
                      { id: 'push', icon: 'arrow-up-from-line', title: 'Push', color: 'var(--app-continue-color)' },
                      { id: 'history', icon: 'clock', title: 'History' },
                      { id: 'rollback', icon: 'rotate-ccw', title: 'Rollback' },
                    ],
                  })}

                  <div class="w-[1px] h-3.5 mx-0.5" style="background-color: var(--app-scrollbar);"></div>

                  <!-- Update section -->
                  ${this.renderSection({
                    id: 'update',
                    actions: [
                      { id: 'update', icon: 'cloud', title: 'Update Project', color: 'var(--app-pause-color)' },
                    ],
                  })}
                </div>
              `
            : ''}
        </div>

        <!-- Unsaved indicator bar -->
        ${this.saveStatus === 'unsaved' ? html`
          <div class="h-[2px] w-full" style="background-color: var(--app-pause-color);"></div>
        ` : ''}
      </div>
    `;
  }
}
