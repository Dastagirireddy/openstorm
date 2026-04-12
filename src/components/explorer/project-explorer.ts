import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../../tailwind-element.js';
import type { FileNode } from '../../lib/file-types.js';
import type { FileTemplate } from '../file-type-picker.js';
import type { ContextMenuItem } from '../context-menu.js';
import '../icon.js';
import '../file-icon.js';
import '../dialog.js';
import '../file-create-dialog.js';
import '../context-menu.js';

@customElement('project-explorer')
export class ProjectExplorer extends TailwindElement() {
  @property() projectPath = '';
  @state() private files: FileNode[] = [];
  @state() private selectedPath = '';
  @state() private isLoading = false;
  @state() private expandedFolders = new Set<string>();
  @state() private isProjectExpanded = true;
  @state() private showCreateDialog = false;
  @state() private showFolderDialog = false;
  @state() private showContextMenu = false;
  @state() private dialogParentPath = '';
  @state() private availableTemplates: FileTemplate[] = [];
  @state() private contextMenuItems: ContextMenuItem[] = [];
  @state() private contextMenuAnchorX = 0;
  @state() private contextMenuAnchorY = 0;
  @state() private contextMenuNode: FileNode | null = null;

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
    // Listen for create file/folder events
    document.addEventListener('create-file', this.handleCreateFile as EventListener);
    document.addEventListener('create-folder', this.handleCreateFolder as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('refresh-explorer', this.handleRefresh as EventListener);
    document.removeEventListener('create-file', this.handleCreateFile as EventListener);
    document.removeEventListener('create-folder', this.handleCreateFolder as EventListener);
  }

  private handleCreateFile = (e?: CustomEvent<{ parentPath?: string }>): void => {
    let parentPath = (e?.detail?.parentPath as string);

    if (!parentPath) {
      const selectedNode = this.files.find(f => f.path === this.selectedPath);
      if (selectedNode && selectedNode.is_dir) {
        parentPath = selectedNode.path;
      } else {
        parentPath = this.projectPath;
      }
    }

    this.dialogParentPath = parentPath;
    this.availableTemplates = this.detectTemplates();
    this.showCreateDialog = true;
  };

  private handleContextMenu = (e: MouseEvent, node: FileNode): void => {
    e.preventDefault();
    e.stopPropagation();

    // Select the node first
    this.selectedPath = node.path;
    if (node.is_dir) {
      this.expandedFolders.add(node.path);
    }
    this.contextMenuNode = node;

    // Build context menu items based on file/folder
    const items: ContextMenuItem[] = [];

    if (node.is_dir) {
      items.push(
        { id: 'new-file', label: 'New File', icon: 'file-plus' },
        { id: 'new-folder', label: 'New Folder', icon: 'folder-plus' },
        { id: 'separator', label: '', separator: true },
      );
    } else {
      items.push(
        { id: 'open', label: 'Open', icon: 'file' },
        { id: 'separator', label: '', separator: true },
      );
    }

    items.push(
      { id: 'rename', label: 'Rename', icon: 'edit' },
      { id: 'delete', label: 'Delete', icon: 'trash', disabled: false },
    );

    this.contextMenuItems = items;
    this.contextMenuAnchorX = e.clientX;
    this.contextMenuAnchorY = e.clientY;
    this.showContextMenu = true;

    this.requestUpdate();
  };

  private handleContextMenuSelect = (e: CustomEvent<{ itemId: string }>): void => {
    const itemId = e.detail.itemId;
    const node = this.contextMenuNode;

    if (!node) return;

    switch (itemId) {
      case 'new-file':
        this.dialogParentPath = node.path;
        this.availableTemplates = this.detectTemplates();
        this.showCreateDialog = true;
        break;
      case 'new-folder':
        this.dialogParentPath = node.path;
        this.showFolderDialog = true;
        break;
      case 'open':
        if (!node.is_dir) {
          this.dispatchEvent(
            new CustomEvent('file-selected', {
              detail: { path: node.path, name: node.name },
              bubbles: true,
              composed: true,
            }),
          );
        }
        break;
      case 'rename':
        // TODO: Implement rename dialog
        console.log('Rename:', node.path);
        break;
      case 'delete':
        // TODO: Implement delete
        console.log('Delete:', node.path);
        break;
    }

    this.showContextMenu = false;
    this.contextMenuNode = null;
  };

  private handleCreateFolder = (e?: CustomEvent<{ parentPath?: string }>): void => {
    this.dialogParentPath = e?.detail?.parentPath || this.projectPath;
    this.showFolderDialog = true;
  };

  private handleCreateDialogConfirm = async (e: CustomEvent<{ name: string; template: FileTemplate; parentPath: string }>): Promise<void> => {
    const name = e.detail.name;
    const parentPath = e.detail.parentPath;
    if (!name || !parentPath) return;

    try {
      const fullPath = `${parentPath}/${name}`;
      await invoke("create_file", {
        path: fullPath,
        isDir: false,
      });

      // Refresh the parent folder's children if it's expanded
      if (this.expandedFolders.has(parentPath)) {
        const parentNode = this.findNodeByPath(parentPath, this.files);
        if (parentNode) {
          await this.loadChildren(parentNode);
        }
      }

      // Also refresh root if parent is root
      if (parentPath === this.projectPath) {
        await this.loadDirectory(this.projectPath);
      }

      this.showCreateDialog = false;

      this.dispatchEvent(
        new CustomEvent("file-created", {
          detail: { path: fullPath },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      console.error(`Failed to create file:`, error);
    }
  };

  private handleCreateDialogCancel = (): void => {
    this.showCreateDialog = false;
  };

  private handleFolderDialogConfirm = async (e: CustomEvent<{ value: string }>): Promise<void> => {
    const name = e.detail.value;
    if (!name || !this.dialogParentPath) return;

    try {
      const fullPath = `${this.dialogParentPath}/${name}`;
      await invoke("create_file", {
        path: fullPath,
        isDir: true,
      });

      // Refresh the parent folder's children if it's expanded
      if (this.expandedFolders.has(this.dialogParentPath)) {
        const parentNode = this.findNodeByPath(this.dialogParentPath, this.files);
        if (parentNode) {
          await this.loadChildren(parentNode);
        }
      }

      // Also refresh root if parent is root
      if (this.dialogParentPath === this.projectPath) {
        await this.loadDirectory(this.projectPath);
      }

      this.showFolderDialog = false;

      this.dispatchEvent(
        new CustomEvent("folder-created", {
          detail: { path: fullPath },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      console.error(`Failed to create folder:`, error);
    }
  };

  private handleDialogCancel = (): void => {
    this.showCreateDialog = false;
    this.showFolderDialog = false;
  };

  /**
   * Detect project type and return relevant file templates with groups and shortcuts
   */
  private detectTemplates(): FileTemplate[] {
    const templates: FileTemplate[] = [];

    // ===== BASIC GROUP =====
    templates.push({
      id: 'generic',
      name: 'File',
      extension: '',
      icon: undefined,
      group: 'basic',
      shortcut: '⌘N',
    });

    // ===== DETECTED GROUP (based on existing files) =====
    const hasRust = this.files.some(f => f.name.endsWith('.rs') || f.name === 'Cargo.toml');
    const hasGo = this.files.some(f => f.name.endsWith('.go') || f.name === 'go.mod');
    const hasTypeScript = this.files.some(f => f.name.endsWith('.ts') || f.name.endsWith('.tsx'));
    const hasJavaScript = this.files.some(f => f.name.endsWith('.js') || f.name.endsWith('.jsx'));
    const hasHtml = this.files.some(f => ['.html', '.htm'].some(ext => f.name.endsWith(ext)));
    const hasCss = this.files.some(f => ['.css', '.scss', '.sass', '.less'].some(ext => f.name.endsWith(ext)));
    const hasPython = this.files.some(f => f.name.endsWith('.py'));
    const hasMarkdown = this.files.some(f => f.name.endsWith('.md'));
    const hasJson = this.files.some(f => f.name.endsWith('.json'));
    const hasYaml = this.files.some(f => f.name.endsWith('.yaml') || f.name.endsWith('.yml'));
    const hasToml = this.files.some(f => f.name.endsWith('.toml'));
    const hasTests = this.files.some(f => f.name.includes('_test') || f.name.includes('.test.') || f.name.includes('.spec.'));

    // Detected languages - these go to 'detected' group
    if (hasTypeScript) {
      templates.push({
        id: 'typescript-detected',
        name: 'TypeScript File',
        extension: 'ts',
        icon: 'module.ts',
        group: 'detected',
        shortcut: '⌘T',
      });
    }

    if (hasJavaScript) {
      templates.push({
        id: 'javascript-detected',
        name: 'JavaScript File',
        extension: 'js',
        icon: 'module.js',
        group: 'detected',
      });
    }

    if (hasRust) {
      templates.push({
        id: 'rust-detected',
        name: 'Rust File',
        extension: 'rs',
        icon: 'module.rs',
        group: 'detected',
        shortcut: '⌘R',
      });
      if (hasTests) {
        templates.push({
          id: 'rust-test',
          name: 'Rust Test',
          extension: 'rs',
          icon: 'tests.rs',
          group: 'test',
          description: 'Test module',
        });
      }
    }

    if (hasGo) {
      templates.push({
        id: 'go-detected',
        name: 'Go File',
        extension: 'go',
        icon: 'main.go',
        group: 'detected',
        shortcut: '⌘G',
      });
      templates.push({
        id: 'go-test',
        name: 'Go Test',
        extension: 'go',
        icon: 'main_test.go',
        group: 'test',
        description: 'Test file',
      });
    }

    if (hasHtml) {
      templates.push({
        id: 'html-detected',
        name: 'HTML File',
        extension: 'html',
        icon: 'index.html',
        group: 'detected',
      });
    }

    if (hasCss) {
      templates.push({
        id: 'css-detected',
        name: 'CSS File',
        extension: 'css',
        icon: 'styles.css',
        group: 'detected',
      });
    }

    if (hasPython) {
      templates.push({
        id: 'python-detected',
        name: 'Python File',
        extension: 'py',
        icon: 'main.py',
        group: 'detected',
      });
    }

    // Config files - detected
    if (hasJson) {
      templates.push({
        id: 'json-detected',
        name: 'JSON File',
        extension: 'json',
        icon: 'config.json',
        group: 'config',
      });
    }

    if (hasYaml) {
      templates.push({
        id: 'yaml-detected',
        name: 'YAML File',
        extension: 'yaml',
        icon: 'config.yaml',
        group: 'config',
      });
    }

    if (hasToml) {
      templates.push({
        id: 'toml-detected',
        name: 'TOML File',
        extension: 'toml',
        icon: 'config.toml',
        group: 'config',
      });
    }

    // Docs - detected
    if (hasMarkdown) {
      templates.push({
        id: 'markdown-detected',
        name: 'Markdown File',
        extension: 'md',
        icon: 'README.md',
        group: 'docs',
      });
    }

    // ===== LANGUAGES (always available as fallback) =====
    // Only add if NOT detected
    if (!hasTypeScript) {
      templates.push({
        id: 'typescript',
        name: 'TypeScript File',
        extension: 'ts',
        icon: 'module.ts',
        group: 'languages',
      });
    }

    if (!hasJavaScript) {
      templates.push({
        id: 'javascript',
        name: 'JavaScript File',
        extension: 'js',
        icon: 'module.js',
        group: 'languages',
      });
    }

    if (!hasRust) {
      templates.push({
        id: 'rust',
        name: 'Rust File',
        extension: 'rs',
        icon: 'module.rs',
        group: 'languages',
      });
    }

    if (!hasGo) {
      templates.push({
        id: 'go',
        name: 'Go File',
        extension: 'go',
        icon: 'main.go',
        group: 'languages',
      });
    }

    if (!hasHtml) {
      templates.push({
        id: 'html',
        name: 'HTML File',
        extension: 'html',
        icon: 'index.html',
        group: 'languages',
      });
    }

    if (!hasCss) {
      templates.push({
        id: 'css',
        name: 'CSS File',
        extension: 'css',
        icon: 'styles.css',
        group: 'languages',
      });
    }

    if (!hasPython) {
      templates.push({
        id: 'python',
        name: 'Python File',
        extension: 'py',
        icon: 'main.py',
        group: 'languages',
      });
    }

    // Config - always available
    if (!hasJson) {
      templates.push({
        id: 'json',
        name: 'JSON File',
        extension: 'json',
        icon: 'config.json',
        group: 'config',
      });
    }

    if (!hasYaml) {
      templates.push({
        id: 'yaml',
        name: 'YAML File',
        extension: 'yaml',
        icon: 'config.yaml',
        group: 'config',
      });
    }

    if (!hasToml) {
      templates.push({
        id: 'toml',
        name: 'TOML File',
        extension: 'toml',
        icon: 'config.toml',
        group: 'config',
      });
    }

    // Docs - always available
    if (!hasMarkdown) {
      templates.push({
        id: 'markdown',
        name: 'Markdown File',
        extension: 'md',
        icon: 'README.md',
        group: 'docs',
      });
    }

    return templates;
  }

  private findNodeByPath(path: string, nodes: FileNode[]): FileNode | null {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = this.findNodeByPath(path, node.children);
        if (found) return found;
      }
    }
    return null;
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
    if (!node.is_dir) {
      this.dispatchEvent(new CustomEvent('file-selected', {
        detail: { path: node.path, name: node.name },
        bubbles: true,
        composed: true,
      }));
    }
    this.requestUpdate();
  }

  private expandAll(): void {
    const expandFolder = async (node: FileNode): Promise<void> => {
      if (node.is_dir) {
        this.expandedFolders.add(node.path);
        if (!node.children) {
          await this.loadChildren(node);
        }
        if (node.children) {
          for (const child of node.children) {
            if (child.is_dir) {
              await expandFolder(child);
            }
          }
        }
      }
    };

    Promise.all(this.files.map(file => expandFolder(file))).then(() => {
      this.requestUpdate();
    });
  }

  private collapseAll(): void {
    this.expandedFolders.clear();
    this.isProjectExpanded = false;
    this.requestUpdate();
  }

  private renderIcon(node: FileNode, isExpanded: boolean): TemplateResult {
    if (node.is_dir) {
      const iconName = isExpanded ? 'folder-open' : 'folder';
      return html`
        <os-icon name="${iconName}" color="${isExpanded ? '#c9a228' : '#5a5a5a'}" size="16" />
      `;
    }

    return html`<file-icon path="${node.path}" size="16" .isExecutable="${node.is_executable}"></file-icon>`;
  }

  private renderNode(node: FileNode, depth: number): TemplateResult {
    const isSelected = this.selectedPath === node.path;
    const isExpanded = this.expandedFolders.has(node.path);
    const indent = depth * 12;

    return html`
      <div>
        <div
          class="flex items-center gap-1 h-[22px] px-2 cursor-pointer text-[13px] transition-colors
            ${isSelected ? 'bg-[#e8e0f5] text-[#5b47c9]' : 'text-[#1a1a1a] hover:bg-[#e8e8e8]'}"
          style="padding-left: ${indent + 8}px"
          @contextmenu=${(e: MouseEvent) => this.handleContextMenu(e, node)}>
          ${node.is_dir
            ? html`
                <os-icon
                  name=${isExpanded ? 'chevron-down' : 'chevron-right'}
                  color="#5a5a5a"
                  size="16"
                  class="flex-shrink-0 transition-transform cursor-pointer hover:bg-[#d0d0d0] rounded p-0.5"
                  @click=${(e: MouseEvent) => {
                    e.stopPropagation();
                    this.toggleNode(node);
                  }}
                />
              `
            : html`<span class="w-4 flex-shrink-0"></span>`}

          <span
            class="flex-shrink-0 flex items-center gap-2 flex-1 min-w-0"
            @click=${() => this.selectFile(node)}>
            ${this.renderIcon(node, isExpanded)}
            <span class="truncate select-none">${node.name}</span>
          </span>
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
          <os-icon name="folder" color="#8a8a8a" size="32" />
        </div>
        ${hasProject
          ? html`
              <h3 class="text-[13px] font-semibold text-[#1a1a1a] mb-1">Empty Folder</h3>
              <p class="text-[12px] text-[#6a6a6a] mb-4 max-w-[200px]">
                "${projectName}" has no files or directories
              </p>
              <button
                class="px-4 py-2 bg-[#2da44e] hover:bg-[#2c974b] text-white text-[12px] font-medium rounded-md transition-colors shadow-sm"
                @click=${() => document.dispatchEvent(new CustomEvent('create-file'))}>
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
      <div class="flex items-center justify-between h-[35px] px-3 bg-gradient-to-b from-[#f5f5f5] to-[#e8e8e8] border-b border-[#d0d0d0] shrink-0">
        <div class="flex items-center gap-1.5">
          <os-icon name="presentation" color="#5b47c9" size="14"></os-icon>
          <span class="text-[10px] font-bold text-[#5a5a5a] uppercase tracking-wide">Project</span>
        </div>
        <div class="flex items-center gap-0">
          <button
            class="p-1 text-[#5a5a5a] hover:text-[#1a1a1a] cursor-pointer"
            title="Locate in File Tree"
            @click=${() => this.dispatchEvent(new CustomEvent('locate-file'))}>
            <os-icon name="locate" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 text-[#5a5a5a] hover:text-[#1a1a1a] cursor-pointer"
            title="Expand All"
            @click=${() => this.expandAll()}>
            <os-icon name="expand-all" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 text-[#5a5a5a] hover:text-[#1a1a1a] cursor-pointer"
            title="Collapse All"
            @click=${() => this.collapseAll()}>
            <os-icon name="collapse-all" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 text-[#5a5a5a] hover:text-[#1a1a1a] cursor-pointer relative"
            title="New File"
            @click=${() => document.dispatchEvent(new CustomEvent('create-file'))}>
            <os-icon name="file-plus" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 text-[#5a5a5a] hover:text-[#1a1a1a] cursor-pointer"
            title="New Folder"
            @click=${() => document.dispatchEvent(new CustomEvent('create-folder'))}>
            <os-icon name="folder-plus" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 text-[#5a5a5a] hover:text-[#1a1a1a] cursor-pointer"
            title="Refresh"
            @click=${() => this.loadDirectory(this.projectPath)}>
            <os-icon name="rotate-ccw" color="currentColor" size="14" />
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
                  <div
                    class="flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-bold text-[#1a1a1a] bg-[#e8e8e8] cursor-pointer hover:bg-[#d8d8d8] transition-colors"
                    @click=${() => { this.isProjectExpanded = !this.isProjectExpanded; this.requestUpdate(); }}>
                    <os-icon name=${this.isProjectExpanded ? 'chevron-down' : 'chevron-right'} color="#5a5a5a" size="14"></os-icon>
                    <os-icon name=${this.isProjectExpanded ? 'folder-open' : 'folder'} color=${this.isProjectExpanded ? '#c9a228' : '#5a5a5a'} size="14"></os-icon>
                    <span class="truncate flex-1">${projectName}</span>
                  </div>
                  ${this.isProjectExpanded
                    ? html`<div class="mt-0.5">${this.files.map(file => this.renderNode(file, 1))}</div>`
                    : ''}
                </div>
              `}
        </div>
      </div>

      <!-- Unified File Create Dialog (IntelliJ-style) -->
      <file-create-dialog
        ?open=${this.showCreateDialog}
        .templates=${this.availableTemplates}
        .parentPath=${this.dialogParentPath}
        @confirm=${this.handleCreateDialogConfirm}
        @cancel=${this.handleCreateDialogCancel}
      ></file-create-dialog>

      <!-- Folder Dialog -->
      <os-dialog
        ?open=${this.showFolderDialog}
        title="New Folder"
        placeholder="folder-name"
        @confirm=${this.handleFolderDialogConfirm}
        @cancel=${this.handleDialogCancel}
      ></os-dialog>

      <!-- Context Menu -->
      <context-menu
        ?open=${this.showContextMenu}
        .items=${this.contextMenuItems}
        .anchorX=${this.contextMenuAnchorX}
        .anchorY=${this.contextMenuAnchorY}
        @select=${this.handleContextMenuSelect}
      ></context-menu>
    `;
  }
}
