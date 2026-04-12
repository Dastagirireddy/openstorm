import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../../tailwind-element.js';
import type { FileNode } from '../../lib/file-types.js';
import type { FileTemplate } from '../file-type-picker.js';
import '../icon.js';
import '../file-icon.js';
import '../dialog.js';
import '../file-type-picker.js';

@customElement('project-explorer')
export class ProjectExplorer extends TailwindElement() {
  @property() projectPath = '';
  @state() private files: FileNode[] = [];
  @state() private selectedPath = '';
  @state() private isLoading = false;
  @state() private expandedFolders = new Set<string>();
  @state() private isProjectExpanded = true;
  @state() private showTypePicker = false;
  @state() private showDialog = false;
  @state() private dialogMode: 'file' | 'folder' = 'file';
  @state() private dialogDefaultValue = '';
  @state() private dialogParentPath = '';
  @state() private selectedTemplate: FileTemplate | null = null;
  @state() private availableTemplates: FileTemplate[] = [];

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
    this.dialogParentPath = e?.detail?.parentPath || this.projectPath;
    this.availableTemplates = this.detectTemplates();
    this.showTypePicker = true;
  };

  private handleCreateFolder = (e?: CustomEvent<{ parentPath?: string }>): void => {
    this.dialogMode = 'folder';
    this.dialogDefaultValue = '';
    this.dialogParentPath = e?.detail?.parentPath || this.projectPath;
    this.showDialog = true;
  };

  private handleTemplateSelect = (e: CustomEvent<{ template: FileTemplate }>): void => {
    this.selectedTemplate = e.detail.template;
    this.dialogDefaultValue = this.getDefaultFileName(e.detail.template);
    this.showTypePicker = false;
    this.showDialog = true;
  };

  private handleDialogConfirm = async (e: CustomEvent<{ value: string }>): Promise<void> => {
    const name = e.detail.value;
    if (!name || !this.dialogParentPath) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const fullPath = `${this.dialogParentPath}/${name}`;
      await invoke("create_file", {
        path: fullPath,
        is_dir: this.dialogMode === 'folder',
      });
      await this.loadDirectory(this.projectPath);
      this.showDialog = false;
      this.selectedTemplate = null;

      this.dispatchEvent(
        new CustomEvent(this.dialogMode === 'file' ? "file-created" : "folder-created", {
          detail: { path: fullPath },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      console.error(`Failed to create ${this.dialogMode}:`, error);
    }
  };

  private handleDialogCancel = (): void => {
    this.showDialog = false;
    this.selectedTemplate = null;
  };

  private handleTypePickerCancel = (): void => {
    this.showTypePicker = false;
  };

  /**
   * Detect project type and return relevant file templates
   */
  private detectTemplates(): FileTemplate[] {
    const templates: FileTemplate[] = [];

    // Always show generic file at top
    templates.push({
      id: 'generic',
      name: 'Generic File',
      description: 'Empty file with no extension',
      extension: '',
      category: 'generic',
    });

    // Detect project types from existing files
    const hasRust = this.files.some(f => f.name.endsWith('.rs') || f.name === 'Cargo.toml');
    const hasGo = this.files.some(f => f.name.endsWith('.go') || f.name === 'go.mod');
    const hasNode = this.files.some(f => f.name === 'package.json');
    const hasPython = this.files.some(f => f.name.endsWith('.py') || f.name === 'requirements.txt');
    const hasWeb = this.files.some(f => ['.html', '.htm', '.xhtml'].some(ext => f.name.endsWith(ext)));
    const hasCss = this.files.some(f => ['.css', '.scss', '.sass', '.less', '.tailwind.css'].some(ext => f.name.endsWith(ext)));
    const hasReact = this.files.some(f => ['.jsx', '.tsx'].some(ext => f.name.endsWith(ext)));
    const hasTypeScript = this.files.some(f => f.name.endsWith('.ts') || f.name.endsWith('.tsx'));

    // Add detected templates
    const detected: FileTemplate[] = [];

    if (hasRust) {
      detected.push({
        id: 'rust',
        name: 'Rust Source',
        description: 'Rust source file',
        extension: 'rs',
        icon: 'test.rs',
        category: 'detected',
      });
      detected.push({
        id: 'rust-test',
        name: 'Rust Test',
        description: 'Rust test module',
        extension: 'rs',
        icon: 'test.rs',
        category: 'detected',
      });
    }

    if (hasGo) {
      detected.push({
        id: 'go',
        name: 'Go Package',
        description: 'Go source file',
        extension: 'go',
        icon: 'main.go',
        category: 'detected',
      });
      detected.push({
        id: 'go-test',
        name: 'Go Test',
        description: 'Go test file',
        extension: 'go',
        icon: 'main_test.go',
        category: 'detected',
      });
    }

    if (hasNode) {
      detected.push({
        id: 'javascript',
        name: 'JavaScript Module',
        description: 'JavaScript ES module',
        extension: 'js',
        icon: 'module.js',
        category: 'detected',
      });
      if (hasReact) {
        detected.push({
          id: 'react-component',
          name: 'React Component',
          description: 'React functional component',
          extension: 'tsx',
          icon: 'Component.tsx',
          category: 'detected',
        });
      }
      if (hasTypeScript) {
        detected.push({
          id: 'typescript',
          name: 'TypeScript Module',
          description: 'TypeScript module',
          extension: 'ts',
          icon: 'module.ts',
          category: 'detected',
        });
      }
    }

    if (hasWeb) {
      detected.push({
        id: 'html',
        name: 'HTML Document',
        description: 'HTML5 document',
        extension: 'html',
        icon: 'index.html',
        category: 'detected',
      });
    }

    if (hasCss) {
      detected.push({
        id: 'css',
        name: 'Stylesheet',
        description: 'CSS stylesheet',
        extension: 'css',
        icon: 'styles.css',
        category: 'detected',
      });
    }

    if (hasPython) {
      detected.push({
        id: 'python',
        name: 'Python Module',
        description: 'Python source file',
        extension: 'py',
        icon: 'module.py',
        category: 'detected',
      });
    }

    templates.push(...detected);

    // Add common languages as fallback
    if (!hasRust) {
      templates.push({
        id: 'rust-lang',
        name: 'Rust Source',
        description: 'Rust source file',
        extension: 'rs',
        icon: 'main.rs',
        category: 'language',
      });
    }

    if (!hasGo) {
      templates.push({
        id: 'go-lang',
        name: 'Go Package',
        description: 'Go source file',
        extension: 'go',
        icon: 'main.go',
        category: 'language',
      });
    }

    return templates;
  }

  private getDefaultFileName(template: FileTemplate): string {
    const baseNames: Record<string, string> = {
      'generic': 'untitled',
      'rust': 'module',
      'rust-test': 'tests',
      'go': 'main',
      'go-test': 'main_test',
      'javascript': 'index',
      'typescript': 'index',
      'react-component': 'Component',
      'html': 'index',
      'css': 'styles',
      'python': 'main',
    };

    const base = baseNames[template.id] || 'untitled';
    return template.extension ? `${base}.${template.extension}` : base;
  }

  private handleDialogCancel = (): void => {
    this.showDialog = false;
  };

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
          @click=${() => this.toggleNode(node)}>
          ${node.is_dir
            ? html`<os-icon name=${isExpanded ? 'chevron-down' : 'chevron-right'} color="#5a5a5a" size="16" class="flex-shrink-0 transition-transform" />`
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
            class="p-1 text-[#5a5a5a] hover:text-[#1a1a1a] cursor-pointer"
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
    const dialogTitle = this.selectedTemplate
      ? `New ${this.selectedTemplate.name}`
      : this.dialogMode === 'file' ? 'New File' : 'New Folder';
    const dialogPlaceholder = this.selectedTemplate
      ? `${this.getDefaultFileName(this.selectedTemplate)}`
      : this.dialogMode === 'file' ? 'filename.txt' : 'folder-name';

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

      <!-- File Type Picker -->
      <file-type-picker
        ?open=${this.showTypePicker}
        .templates=${this.availableTemplates}
        @template-select=${this.handleTemplateSelect}
        @cancel=${this.handleTypePickerCancel}
      ></file-type-picker>

      <!-- Filename Dialog -->
      <os-dialog
        ?open=${this.showDialog}
        title="${dialogTitle}"
        placeholder="${dialogPlaceholder}"
        @confirm=${this.handleDialogConfirm}
        @cancel=${this.handleDialogCancel}
      ></os-dialog>
    `;
  }
}
