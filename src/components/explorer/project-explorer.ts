import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../../tailwind-element.js';
import { dispatch, dispatchFrom } from '../../lib/types/events.js';
import type { FileNode } from '../../lib/types/file-types.js';
import type { FileTemplate } from '../file-type-picker.js';
import type { ContextMenuItem } from '../dialogs/context-menu.js';
import { getFolderInfo, isSpecialFolder, type FolderType } from '../../lib/types/folder-types.js';
import '../layout/icon.js';
import '../layout/file-icon.js';
import '../dialogs/dialog.js';
import '../dialogs/file-create-dialog.js';
import '../dialogs/context-menu.js';
import '../dialogs/rename-dialog.js';
import '../dialogs/delete-dialog.js';

@customElement('project-explorer')
export class ProjectExplorer extends TailwindElement() {
  @property() projectPath = '';
  @property() selectedPath = '';
  @state() private files: FileNode[] = [];
  @state() private isLoading = false;
  @state() private expandedFolders = new Set<string>();
  @state() private isProjectExpanded = true;
  @state() private showCreateDialog = false;
  @state() private showFolderDialog = false;
  @state() private showContextMenu = false;
  @state() private showRenameDialog = false;
  @state() private showDeleteDialog = false;
  @state() private dialogParentPath = '';
  @state() private availableTemplates: FileTemplate[] = [];
  @state() private contextMenuItems: ContextMenuItem[] = [];
  @state() private contextMenuAnchorX = 0;
  @state() private contextMenuAnchorY = 0;
  @state() private contextMenuNode: FileNode | null = null;
  @state() private renameNode: FileNode | null = null;
  @state() private deleteNode: FileNode | null = null;
  @state() private fileToReveal: string | null = null;
  @state() private expandVersion = 0;

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
    // Listen for keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyDown as EventListener);
    // Listen for locate file events from external sources
    document.addEventListener('locate-file-external', this.handleLocateFileExternal as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('refresh-explorer', this.handleRefresh as EventListener);
    document.removeEventListener('create-file', this.handleCreateFile as EventListener);
    document.removeEventListener('create-folder', this.handleCreateFolder as EventListener);
    document.removeEventListener('keydown', this.handleKeyDown as EventListener);
    document.removeEventListener('locate-file-external', this.handleLocateFileExternal as EventListener);
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
          dispatchFrom(this, 'file-selected', { path: node.path, name: node.name });
        }
        break;
      case 'rename':
        this.renameNode = node;
        this.showRenameDialog = true;
        break;
      case 'delete':
        this.deleteNode = node;
        this.showDeleteDialog = true;
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

      dispatch("file-created", { path: fullPath });
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

      dispatch("folder-created", { path: fullPath });
    } catch (error) {
      console.error(`Failed to create folder:`, error);
    }
  };

  private handleRenameConfirm = async (e: CustomEvent<{ oldPath: string; newPath: string; newName: string }>): Promise<void> => {
    const { oldPath, newPath } = e.detail;

    // Refresh the directory to show the renamed file
    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    if (parentPath && this.expandedFolders.has(parentPath)) {
      const parentNode = this.findNodeByPath(parentPath, this.files);
      if (parentNode) {
        await this.loadChildren(parentNode);
      }
    } else if (parentPath === this.projectPath) {
      await this.loadDirectory(this.projectPath);
    }

    // Update selected path to the new path
    if (this.selectedPath === oldPath) {
      this.selectedPath = newPath;
    }

    this.showRenameDialog = false;
    this.renameNode = null;

    dispatch("file-renamed", { oldPath, newPath });
  };

  private handleRenameCancel = (): void => {
    this.showRenameDialog = false;
    this.renameNode = null;
  };

  private handleDeleteConfirm = async (e: CustomEvent<{ path: string }>): Promise<void> => {
    const { path } = e.detail;
    const parentPath = path.substring(0, path.lastIndexOf('/'));

    // Refresh the parent directory
    if (parentPath && this.expandedFolders.has(parentPath)) {
      const parentNode = this.findNodeByPath(parentPath, this.files);
      if (parentNode) {
        await this.loadChildren(parentNode);
      }
    } else if (parentPath === this.projectPath) {
      await this.loadDirectory(this.projectPath);
    }

    // Clear selected path if it was the deleted file
    if (this.selectedPath === path) {
      this.selectedPath = '';
    }

    this.showDeleteDialog = false;
    this.deleteNode = null;

    dispatch("file-deleted", { path });
  };

  private handleDeleteCancel = (): void => {
    this.showDeleteDialog = false;
    this.deleteNode = null;
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Ignore if user is typing in an input field
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    // Check if file explorer has focus (or a child element has focus)
    const explorerHasFocus = this.contains(document.activeElement);

    // F2 = Rename (only when explorer has focus)
    if (e.key === 'F2' && this.selectedPath && explorerHasFocus) {
      e.preventDefault();
      const node = this.findNodeByPath(this.selectedPath, this.files);
      if (node) {
        this.renameNode = node;
        this.showRenameDialog = true;
      }
    }

    // Delete or Backspace = Delete file/folder (only when explorer has focus)
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedPath && explorerHasFocus) {
      e.preventDefault();
      const node = this.findNodeByPath(this.selectedPath, this.files);
      if (node) {
        this.deleteNode = node;
        this.showDeleteDialog = true;
      }
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

  private handleLocateFile = (): void => {
    const path = this.selectedPath;
    if (!path) return;
    if (this.files.length === 0) return;

    this.fileToReveal = path;
    this.expandToPath(path);
  };

  private handleLocateFileExternal = (e?: CustomEvent<{ path: string }>): void => {
    const path = e?.detail?.path;
    if (!path) return;

    this.fileToReveal = path;
    this.expandToPath(path);
  };

  private async expandToPath(path: string): Promise<void> {
    // Path is absolute, we need to expand folders relative to project root
    if (!path.startsWith(this.projectPath)) {
      return;
    }

    const relativePath = path.substring(this.projectPath.length).replace(/^\/+/, '');
    if (!relativePath) return;

    const segments = relativePath.split('/');

    // Ensure project tree is expanded
    this.isProjectExpanded = true;

    // Build cumulative paths and expand each folder
    let cumulativePath = this.projectPath;
    for (let i = 0; i < segments.length - 1; i++) {
      cumulativePath = `${cumulativePath}/${segments[i]}`;

      // Always set in expandedFolders
      this.expandedFolders.add(cumulativePath);
      // Load children for this folder if not already loaded
      const node = this.findNodeByPath(cumulativePath, this.files);
      if (node && node.is_dir && !node.children) {
        await this.loadFolderChildren(cumulativePath);
      }
    }

    // Force reactivity by incrementing version counter
    this.expandVersion++;
  }

  private async loadFolderChildren(folderPath: string): Promise<void> {
    try {
      const result = await invoke('list_directory', { path: folderPath });
      const children = result as FileNode[];
      // Find and update the node in the files array
      this.updateNodeChildren(this.files, folderPath, children);
    } catch (error) {
      console.error('Failed to load children:', error);
    }
  }

  private updateNodeChildren(nodes: FileNode[], path: string, children: FileNode[]): void {
    for (const node of nodes) {
      if (node.path === path) {
        node.children = children;
        return;
      }
      if (node.children) {
        this.updateNodeChildren(node.children, path, children);
      }
    }
  }

  protected willUpdate(changedProperties: Map<string, unknown>): void {
    super.willUpdate(changedProperties);
    if (changedProperties.has('projectPath') && this.projectPath && this.files.length === 0) {
      this.loadDirectory(this.projectPath);
    }
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('selectedPath') && this.selectedPath && this.files.length > 0) {
      // Optional: auto-expand tree when selectedPath changes from parent
      // Uncomment to enable auto-reveal on file open:
      // this.expandToPath(this.selectedPath);
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
      dispatchFrom(this, 'file-selected', { path: node.path, name: node.name });
    }
    this.requestUpdate();
  }

  private async expandAll(): Promise<void> {
    this.isProjectExpanded = true;
    const expandFolder = async (node: FileNode): Promise<void> => {
      if (node.is_dir) {
        this.expandedFolders.add(node.path);
        if (!node.children) {
          try {
            const result = await invoke('list_directory', { path: node.path });
            node.children = result as FileNode[];
          } catch (error) {
            console.error('Failed to load children:', error);
          }
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

    await Promise.all(this.files.map(file => expandFolder(file)));
    this.requestUpdate();
  }

  private collapseAll(): void {
    this.expandedFolders.clear();
    this.isProjectExpanded = false;
    this.requestUpdate();
  }

  private getFolderColor(node: FileNode, isExpanded: boolean): string {
    if (!node.is_dir) return '#5a5a5a';

    const folderInfo = getFolderInfo(node.name, node.path);
    // Use darker color when expanded, lighter when collapsed
    return isExpanded ? folderInfo.color : folderInfo.iconColor;
  }

  private getFolderType(node: FileNode): FolderType {
    if (!node.is_dir) return 'source';
    const folderInfo = getFolderInfo(node.name, node.path);
    return folderInfo.type;
  }

  private renderIcon(node: FileNode, isExpanded: boolean): TemplateResult {
    if (node.is_dir) {
      const isSpecial = isSpecialFolder(node.name, node.path);
      const iconName = isExpanded
        ? (isSpecial ? 'folder-open-filled' : 'folder-open')
        : (isSpecial ? 'folder-filled' : 'folder');
      const color = this.getFolderColor(node, isExpanded);
      return html`
        <os-icon name="${iconName}" color="${color}" size="16" />
      `;
    }

    return html`<file-icon path="${node.path}" size="16" .isExecutable="${node.is_executable}"></file-icon>`;
  }

  private getFolderTypeLabel(type: FolderType): string {
    const labels: Record<FolderType, string> = {
      'root': 'Project Root',
      'build': 'Build/Output Folder',
      'tmp': 'Temporary/Cache Folder',
      'node_modules': 'Dependencies Folder',
      'vcs': 'Version Control',
      'ide': 'IDE Settings',
      'source': 'Source Folder'
    };
    return labels[type];
  }

  private renderNode(node: FileNode, depth: number): TemplateResult {
    const isSelected = this.selectedPath === node.path;
    const isExpanded = this.expandedFolders.has(node.path);
    const indent = depth * 12;
    const folderType = this.getFolderType(node);
    const folderInfo = node.is_dir ? getFolderInfo(node.name, node.path) : null;
    const folderColor = folderInfo?.color || null;
    const folderBgColor = folderInfo?.bgColor || null;
    const folderTypeLabel = node.is_dir ? this.getFolderTypeLabel(folderType) : '';

    return html`
      <div>
        <div
          class="flex items-center gap-1 h-[22px] px-2 cursor-pointer text-[13px] transition-colors"
          style="padding-left: ${indent + 8}px; ${folderColor ? `border-left: 3px solid ${folderColor}; background-color: ${folderBgColor || 'transparent'};` : 'border-left: 3px solid transparent;'} margin-left: -3px; background-color: ${isSelected ? 'var(--app-selection-background)' : 'transparent'}; color: ${isSelected ? 'var(--brand-primary)' : 'var(--app-foreground)'};"
          title="${folderTypeLabel}"
          @contextmenu=${(e: MouseEvent) => this.handleContextMenu(e, node)}
          @mouseenter=${(e: Event) => {
            if (!isSelected) (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)';
          }}
          @mouseleave=${(e: Event) => {
            if (!isSelected) (e.target as HTMLElement).style.backgroundColor = folderBgColor || 'transparent';
          }}>
          ${node.is_dir
            ? html`
                <os-icon
                  name=${isExpanded ? 'chevron-down' : 'chevron-right'}
                  size="16"
                  style="color: var(--app-disabled-foreground);"
                  class="flex-shrink-0 transition-transform cursor-pointer rounded p-0.5"
                  @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
                  @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
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
            <span class="truncate select-none" style="color: ${isSelected ? 'var(--brand-primary)' : 'var(--app-foreground)'};">${node.name}</span>
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
        <div class="w-16 h-16 mb-4 rounded-xl flex items-center justify-center" style="background-color: var(--app-tab-inactive);">
          <os-icon name="folder" style="color: var(--app-disabled-foreground);" size="32" />
        </div>
        ${hasProject
          ? html`
              <h3 class="text-[13px] font-semibold mb-1" style="color: var(--app-foreground);">Empty Folder</h3>
              <p class="text-[12px] mb-4 max-w-[200px]" style="color: var(--app-disabled-foreground);">
                "${projectName}" has no files or directories
              </p>
              <button
                class="px-4 py-2 text-[12px] font-medium rounded-md transition-colors shadow-sm"
                style="background-color: var(--app-button-background); color: var(--app-button-foreground);"
                @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-hover)'}
                @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-background)'}
                @click=${() => dispatch('create-file')}>
                Create File
              </button>
            `
          : html`
              <h3 class="text-[14px] font-semibold mb-1" style="color: var(--app-foreground);">No Project Open</h3>
              <p class="text-[12px] mb-4 max-w-[200px]" style="color: var(--app-disabled-foreground);">
                Open a folder to start exploring your project files
              </p>
              <button
                class="px-5 py-2 text-[13px] font-medium rounded-md transition-colors shadow-sm"
                style="background-color: var(--app-button-background); color: var(--app-button-foreground);"
                @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-hover)'}
                @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-background)'}
                @click=${() => this.dispatchEvent(new CustomEvent('open-folder'))}>
                Open Folder
              </button>
            `}
      </div>
    `;
  }

  private renderHeader(): TemplateResult {
    return html`
      <div class="flex items-center justify-between h-[35px] px-3 border-b shrink-0"
           style="background: linear-gradient(to bottom, var(--app-tab-inactive), var(--app-toolbar-hover)); border-bottom-color: var(--app-border);">
        <div class="flex items-center gap-1.5">
          <os-icon name="presentation" style="color: var(--brand-primary);" size="14"></os-icon>
          <span class="text-[10px] font-bold uppercase tracking-wide" style="color: var(--app-disabled-foreground);">Project</span>
        </div>
        <div class="flex items-center gap-0">
          <button
            class="p-1 cursor-pointer"
            style="color: var(--app-disabled-foreground);"
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
            title="Locate in File Tree"
            @click=${() => this.handleLocateFile()}>
            <os-icon name="locate" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 cursor-pointer"
            style="color: var(--app-disabled-foreground);"
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
            title="Expand All"
            @click=${() => this.expandAll()}>
            <os-icon name="expand-all" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 cursor-pointer"
            style="color: var(--app-disabled-foreground);"
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
            title="Collapse All"
            @click=${() => this.collapseAll()}>
            <os-icon name="collapse-all" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 cursor-pointer relative"
            style="color: var(--app-disabled-foreground);"
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
            title="New File"
            @click=${() => dispatch('create-file')}>
            <os-icon name="file-plus" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 cursor-pointer"
            style="color: var(--app-disabled-foreground);"
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
            title="New Folder"
            @click=${() => dispatch('create-folder')}>
            <os-icon name="folder-plus" color="currentColor" size="14" />
          </button>
          <button
            class="p-1 cursor-pointer"
            style="color: var(--app-disabled-foreground);"
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
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
      <div class="flex flex-col h-full overflow-hidden" style="background-color: var(--activitybar-background);">
        ${this.renderHeader()}

        <div class="flex-1 overflow-y-auto">
          ${this.files.length === 0
            ? this.renderEmptyState()
            : html`
                <div class="py-1">
                  <div
                    class="flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-bold cursor-pointer transition-colors"
                    style="background-color: var(--app-tab-inactive); color: var(--app-foreground);"
                    @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
                    @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-tab-inactive)'}
                    @click=${() => { this.isProjectExpanded = !this.isProjectExpanded; this.requestUpdate(); }}>
                    <os-icon name=${this.isProjectExpanded ? 'chevron-down' : 'chevron-right'} style="color: var(--app-disabled-foreground);" size="14"></os-icon>
                    <os-icon name=${this.isProjectExpanded ? 'folder-open' : 'folder'} color=${this.isProjectExpanded ? '#c9a228' : 'var(--app-disabled-foreground)'} size="14"></os-icon>
                    <span class="truncate flex-1">${projectName}</span>
                  </div>
                  ${this.isProjectExpanded
                    ? html`<div class="mt-0.5">${this.files.map(file => this.renderNode(file, 1))}</div>`
                    : ''}
                </div>
              `}
        </div>
      </div>

      <!-- Unified File Create Dialog -->
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
        @close=${() => { this.showContextMenu = false; this.contextMenuNode = null; }}
      ></context-menu>

      <!-- Rename Dialog -->
      <rename-dialog
        ?open=${this.showRenameDialog}
        .filePath=${this.renameNode?.path || ''}
        .fileName=${this.renameNode?.name || ''}
        @confirm=${this.handleRenameConfirm}
        @cancel=${this.handleRenameCancel}
      ></rename-dialog>

      <!-- Delete Dialog -->
      <delete-dialog
        ?open=${this.showDeleteDialog}
        .filePath=${this.deleteNode?.path || ''}
        .fileName=${this.deleteNode?.name || ''}
        .isDirectory=${this.deleteNode?.is_dir || false}
        @confirm=${this.handleDeleteConfirm}
        @cancel=${this.handleDeleteCancel}
      ></delete-dialog>
    `;
  }
}
