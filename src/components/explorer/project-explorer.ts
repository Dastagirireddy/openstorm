import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../../tailwind-element.js';
import type { FileNode } from '../../lib/file-types.js';
import { getFileIconColor } from '../../lib/file-icons.js';

@customElement('project-explorer')
export class ProjectExplorer extends TailwindElement() {
  @property() projectPath = '';
  @state() private files: FileNode[] = [];
  @state() private selectedPath = '';
  @state() private isLoading = false;
  @state() private expandedFolders = new Set<string>();

  async loadDirectory(path: string): Promise<void> {
    this.isLoading = true;
    try {
      const result = await invoke('list_directory', { path });
      this.files = result as FileNode[];
      this.projectPath = path;
    } catch (error) {
      console.error('Failed to load directory:', error);
    } finally {
      this.isLoading = false;
    }
  }

  firstUpdated(): void {
    if (this.projectPath) {
      this.loadDirectory(this.projectPath);
    }
    // Listen for refresh events from file watcher
    document.addEventListener('refresh-explorer', this.handleRefresh as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('refresh-explorer', this.handleRefresh as EventListener);
  }

  private handleRefresh = (): void => {
    // Reload the directory to show new files
    if (this.projectPath) {
      this.loadDirectory(this.projectPath);
    }
  };

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('projectPath') && this.projectPath && this.files.length === 0) {
      this.loadDirectory(this.projectPath);
    }
  }

  private toggleNode(node: FileNode): void {
    if (node.is_dir) {
      if (this.expandedFolders.has(node.path)) {
        this.expandedFolders.delete(node.path);
      } else {
        this.expandedFolders.add(node.path);
        if (!node.children) {
          this.loadChildren(node);
        }
      }
      this.requestUpdate();
    } else {
      this.selectFile(node);
    }
  }

  private async loadChildren(node: FileNode): Promise<void> {
    try {
      const result = await invoke('list_directory', { path: node.path });
      node.children = result as FileNode[];
      this.requestUpdate();
    } catch (error) {
      console.error('Failed to load children:', error);
    }
  }

  private selectFile(node: FileNode): void {
    this.selectedPath = node.path;
    this.dispatchEvent(new CustomEvent('file-selected', {
      detail: { path: node.path, name: node.name },
      bubbles: true,
      composed: true,
    }));
    this.requestUpdate();
  }

  private renderIcon(node: FileNode, isExpanded: boolean): TemplateResult {
    if (node.is_dir) {
      return html`
        <svg class="w-4 h-4 ${isExpanded ? 'text-[#c9a228]' : 'text-[#5a5a5a]'}" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
        </svg>
      `;
    }

    const color = getFileIconColor(node.name);

    return html`
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" stroke="${color}" stroke-width="1.5" fill="none"/>
        <polyline points="14 2 14 8 20 8" stroke="${color}" stroke-width="1.5" fill="none"/>
      </svg>
    `;
  }

  private renderNode(node: FileNode, depth: number): TemplateResult {
    const isSelected = this.selectedPath === node.path;
    const isExpanded = this.expandedFolders.has(node.path);
    const indent = depth * 12;

    return html`
      <div>
        <div
          class="flex items-center gap-1 h-[22px] px-2 cursor-pointer text-[13px] transition-colors
            ${isSelected ? 'bg-[#b3d4ff] text-[#1a1a1a]' : 'text-[#1a1a1a] hover:bg-[#e8e8e8]'}"
          style="padding-left: ${indent + 8}px"
          @click=${() => this.toggleNode(node)}>
          ${node.is_dir
            ? html`
                <svg class="w-4 h-4 text-[#5a5a5a] flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              `
            : html`<span class="w-4 flex-shrink-0"></span>`}

          <span class="flex-shrink-0">${this.renderIcon(node, isExpanded)}</span>
          <span class="truncate select-none">${node.name}</span>
        </div>

        ${node.children && isExpanded
          ? html`<div>${node.children.map(child => this.renderNode(child, depth + 1))}</div>`
          : ''}
      </div>
    `;
  }

  private renderEmptyState(): TemplateResult {
    const hasProject = !!this.projectPath;
    const projectName = hasProject ? this.projectPath.split('/').pop() : '';

    return html`
      <div class="flex flex-col items-center justify-center h-full px-6 text-center">
        <div class="w-16 h-16 mb-4 rounded-xl bg-[#f0f0f0] flex items-center justify-center">
          <svg class="w-8 h-8 text-[#8a8a8a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        ${hasProject
          ? html`
              <h3 class="text-[13px] font-semibold text-[#1a1a1a] mb-1">Empty Folder</h3>
              <p class="text-[12px] text-[#6a6a6a] mb-4 max-w-[200px]">
                "${projectName}" has no files or directories
              </p>
              <button
                class="px-4 py-2 bg-[#2da44e] hover:bg-[#2c974b] text-white text-[12px] font-medium rounded-md transition-colors shadow-sm"
                @click=${() => this.dispatchEvent(new CustomEvent('create-file'))}>
                Create File
              </button>
            `
          : html`
              <h3 class="text-[14px] font-semibold text-[#1a1a1a] mb-1">No Project Open</h3>
              <p class="text-[12px] text-[#6a6a6a] mb-4 max-w-[200px]">
                Open a folder to start exploring your project files
              </p>
              <button
                class="px-5 py-2 bg-[#0969da] hover:bg-[#0860ca] text-white text-[13px] font-medium rounded-md transition-colors shadow-sm"
                @click=${() => this.dispatchEvent(new CustomEvent('open-folder'))}>
                Open Folder
              </button>
            `}
      </div>
    `;
  }

  private renderHeader(): TemplateResult {
    return html`
      <div class="flex items-center justify-between h-[35px] px-3 bg-[#f7f7f7] border-b border-[#c7c7c7] shrink-0">
        <span class="text-[10px] font-bold text-[#5a5a5a] uppercase tracking-wide">Project</span>
        <div class="flex items-center gap-0.5">
          <button
            class="p-1.5 rounded hover:bg-[#e0e0e0] text-[#5a5a5a] hover:text-[#1a1a1a] transition-colors"
            title="New File"
            @click=${() => this.dispatchEvent(new CustomEvent('create-file'))}>
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>
          <button
            class="p-1.5 rounded hover:bg-[#e0e0e0] text-[#5a5a5a] hover:text-[#1a1a1a] transition-colors"
            title="New Folder"
            @click=${() => this.dispatchEvent(new CustomEvent('create-folder'))}>
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </button>
          <button
            class="p-1.5 rounded hover:bg-[#e0e0e0] text-[#5a5a5a] hover:text-[#1a1a1a] transition-colors"
            title="Refresh"
            @click=${() => this.loadDirectory(this.projectPath)}>
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 21h5v-5"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  render() {
    const projectName = this.projectPath ? this.projectPath.split('/').pop() : 'OpenStorm';

    return html`
      <div class="flex flex-col h-full overflow-hidden bg-[#f7f7f7]">
        ${this.renderHeader()}

        <div class="flex-1 overflow-y-auto">
          ${this.files.length === 0
            ? this.renderEmptyState()
            : html`
                <div class="py-1">
                  <div class="flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-semibold text-[#1a1a1a] bg-[#e8e8e8] cursor-pointer">
                    <svg class="w-3.5 h-3.5 text-[#5a5a5a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="m9 18 6-6-6-6"/>
                    </svg>
                    <svg class="w-3.5 h-3.5 text-[#c9a228]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
                    </svg>
                    <span class="truncate flex-1">${projectName}</span>
                  </div>
                  <div class="mt-0.5">${this.files.map(file => this.renderNode(file, 1))}</div>
                </div>
              `}
        </div>
      </div>
    `;
  }
}
