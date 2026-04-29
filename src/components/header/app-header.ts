import { html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import '../layout/icon.js';
import '../layout/file-icon.js';
import '../debug/run-toolbar.js';
import { parsePathToSegments, getFileIconColor } from '../../lib/utils/breadcrumb.js';

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
