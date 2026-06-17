import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import { getVersion } from '@tauri-apps/api/app';
import '../layout/icon.js';
import '../layout/file-icon.js';
import '../debug/run-toolbar.js';
import '../editor/editor-tab-bar.js';
import { parsePathToSegments, getFileIconColor } from '../../lib/utils/breadcrumb.js';
import * as git from '../../lib/git/git-api.js';
import { dispatch } from '../../lib/types/events.js';
import type { EditorTab } from '../../lib/types/file-types.js';

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
  @property({ type: Array }) tabs: EditorTab[] = [];
  @property({ type: String }) activeTabId = '';

  @state() private gitOperationInProgress = false;
  @state() private appVersion = '';

  constructor() {
    super();
    getVersion().then(v => { this.appVersion = v; }).catch(() => {});
  }

  private handleTabSelect(e: CustomEvent): void {
    this.dispatchEvent(new CustomEvent('tab-select', {
      detail: e.detail,
      bubbles: true,
      composed: true,
    }));
  }

  private handleTabClose(e: CustomEvent): void {
    this.dispatchEvent(new CustomEvent('tab-close', {
      detail: e.detail,
      bubbles: true,
      composed: true,
    }));
  }

  private renderBreadcrumbSegment(segment: BreadcrumbSegment, index: number, totalSegments: number): TemplateResult {
    const isLast = index === totalSegments - 1;
    const iconColor = isLast ? getFileIconColor(segment.path || segment.label) : 'var(--app-disabled-foreground)';
    const isFolder = !isLast || segment.icon === 'folder';

    return html`
      <div class="flex items-center gap-1">
        ${isFolder ? html`
          <os-icon name="folder" color="${iconColor}" size=${12}></os-icon>
        ` : html`
          <file-icon path="${segment.path || segment.label}" size=${12}></file-icon>
        `}
        <span
          class="${isLast ? 'font-medium' : 'hover:opacity-80 cursor-pointer transition-opacity'} text-[11px]"
          style="color: ${isLast ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'};"
          ${!isLast && segment.path ? 'data-path="' + segment.path + '"' : ''}>
          ${segment.label}
        </span>
        ${!isLast ? html`
          <os-icon name="chevron-right" color="var(--app-disabled-foreground)" size=${14}></os-icon>
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
        <!-- Single header row: project selector + tabs + actions (terax-style) -->
        <div
          class="flex items-center h-[36px] px-2 border-b select-none gap-2"
          style="background: var(--app-toolbar-hover); border-bottom-color: var(--app-border);">

          <!-- Left: Project selector (like terax) -->
          <div class="flex items-center gap-1.5 shrink-0">
            <os-brand-logo size="18"></os-brand-logo>
            <span class="text-[12px] font-medium" style="color: var(--app-foreground);">${projectName}</span>
            <os-icon name="chevron-down" color="var(--app-disabled-foreground)" size=${14}></os-icon>
          </div>

          <!-- Separator -->
          <div class="w-[1px] h-4" style="background-color: var(--app-border);"></div>

          <!-- Middle: Tabs (integrated into header like terax) -->
          <div class="flex-1 min-w-0">
            ${this.tabs.length > 0 ? html`
              <tab-bar
                class="h-[32px]"
                .tabs=${this.tabs}
                .activeTab=${this.activeTabId}
                @tab-select=${this.handleTabSelect}
                @tab-close=${this.handleTabClose}
              >
              </tab-bar>
            ` : ''}
          </div>

          <!-- Right: Run toolbar + Search + Settings -->
          <div class="flex items-center gap-1 shrink-0">
            <run-toolbar id="run-toolbar"></run-toolbar>

            <div class="w-[1px] h-4 mx-0.5" style="background-color: var(--app-border);"></div>

            <button
              class="w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer hover:bg-[var(--app-toolbar-active)]"
              title="Search (⌘F)"
              @click=${() => dispatch('quick-search')}>
              <os-icon name="search" color="var(--app-disabled-foreground)" width="14"></os-icon>
            </button>
            <button
              class="w-7 h-7 flex items-center justify-center border-none rounded bg-transparent cursor-pointer hover:bg-[var(--app-toolbar-active)]"
              title="Settings"
              @click=${() => dispatch('open-settings')}>
              <os-icon name="settings" color="var(--app-disabled-foreground)" width="14"></os-icon>
            </button>
          </div>
        </div>

        <!-- Unsaved indicator bar -->
        ${this.saveStatus === 'unsaved' ? html`
          <div class="h-[2px] w-full" style="background-color: var(--app-pause-color);"></div>
        ` : ''}
      </div>
    `;
  }
}
