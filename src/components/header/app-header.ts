import { html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import '../icon.js';
import '../file-icon.js';
import { parsePathToSegments, getFileIconColor } from '../../lib/breadcrumb.js';

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

  private renderAction(action: HeaderAction): TemplateResult {
    return html`
      <button
        class="p-0.5 rounded hover:bg-[#e0e0e0] transition-colors"
        title="${action.title}"
        data-action="${action.id}">
        <os-icon
          name="${action.icon}"
          color="${action.color || '#5f6368'}"
          size=${12}></os-icon>
      </button>
    `;
  }

  private renderSection(section: HeaderSection): TemplateResult {
    return html`
      <div class="flex items-center gap-1.5">
        ${section.actions.map(action => this.renderAction(action))}
      </div>
    `;
  }

  private renderBreadcrumbSegment(segment: BreadcrumbSegment, index: number, totalSegments: number): TemplateResult {
    const isLast = index === totalSegments - 1;
    const iconColor = isLast ? getFileIconColor(segment.path || segment.label) : '#5f6368';
    const isFolder = !isLast || segment.icon === 'folder';

    return html`
      <div class="flex items-center gap-1">
        ${isFolder ? html`
          <os-icon name="folder" color="${iconColor}" size=${14}></os-icon>
        ` : html`
          <file-icon path="${segment.path || segment.label}" size=${14}></file-icon>
        `}
        <span
          class="${isLast ? 'text-[#1a1a1a] font-semibold' : 'hover:text-[#1a1a1a] cursor-pointer transition-colors'} text-[13px]"
          ${!isLast && segment.path ? 'data-path="' + segment.path + '"' : ''}>
          ${segment.label}
        </span>
        ${!isLast ? html`
          <os-icon name="chevron-right" color="#a0a0a0" size=${18}></os-icon>
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
          class="flex items-center justify-between h-[36px] px-2 bg-gradient-to-b from-[#f5f5f5] to-[#e8e8e8] border-b border-[#d0d0d0] select-none">

          <!-- Left: Project name + Breadcrumb -->
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <os-brand-logo size="20"></os-brand-logo>
            <span class="text-[12px] font-medium text-[#1a1a1a] shrink-0">${projectName}</span>

            ${showBreadcrumb && breadcrumbSegments.length > 0 ? html`
              <div class="flex items-center gap-1 min-w-0">
                ${breadcrumbSegments.map((segment, index) => this.renderBreadcrumbSegment(segment, index, breadcrumbSegments.length))}
              </div>
            ` : ''}
          </div>

          <!-- Right: Toolbar sections -->
          <div class="flex items-center gap-2 shrink-0">
            <!-- Run section -->
            ${this.renderSection({
              id: 'run',
              actions: [
                { id: 'config', icon: 'chevron-down', title: 'Run configurations', label: 'Current File' },
                { id: 'run', icon: 'play', title: 'Run' },
                { id: 'debug', icon: 'bug', title: 'Debug' },
                { id: 'coverage', icon: 'gauge', title: 'Run with Coverage' },
                { id: 'profile', icon: 'clock', title: 'Profile' },
                { id: 'stop', icon: 'square', title: 'Stop' },
              ],
            })}

            <div class="w-[1px] h-3.5 bg-[#c0c0c0] mx-0.5"></div>

            <!-- Git section -->
            ${this.renderSection({
              id: 'git',
              actions: [
                { id: 'git-label', icon: '', title: 'Git:', label: 'Git:' },
                { id: 'pull', icon: 'arrow-down-to-line', title: 'Pull', color: '#3b82f6' },
                { id: 'commit', icon: 'check', title: 'Commit', color: '#22c55e' },
                { id: 'push', icon: 'arrow-up-from-line', title: 'Push', color: '#22c55e' },
                { id: 'history', icon: 'clock', title: 'History' },
                { id: 'rollback', icon: 'rotate-ccw', title: 'Rollback' },
              ],
            })}

            <div class="w-[1px] h-3.5 bg-[#c0c0c0] mx-0.5"></div>

            <!-- Update section -->
            ${this.renderSection({
              id: 'update',
              actions: [
                { id: 'update', icon: 'cloud', title: 'Update Project', color: '#f97316' },
              ],
            })}
          </div>
        </div>

        <!-- Unsaved indicator bar -->
        ${this.saveStatus === 'unsaved' ? html`
          <div class="h-[2px] bg-[#f57c00] w-full"></div>
        ` : ''}
      </div>
    `;
  }
}
