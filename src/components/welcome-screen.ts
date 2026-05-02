import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { TailwindElement } from "../tailwind-element.js";
import { dispatch } from "../lib/types/events.js";

export type GitStatus = 'synced' | 'modified' | 'behind' | 'ahead' | 'untracked';
export type ProjectType = 'rust' | 'node' | 'python' | 'go' | 'java' | 'typescript' | 'react' | 'vue' | 'angular' | 'docker' | 'database' | 'generic';

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
  gitStatus?: GitStatus;
  uncommittedChanges?: number;
  projectType?: ProjectType;
}

@customElement("welcome-screen")
export class WelcomeScreen extends TailwindElement() {
  @property({ type: Array })
  recentProjects: RecentProject[] = [
    { name: "openstorm", path: "/Users/dasta/work/rust-tuts/openstorm", lastOpened: Date.now(), gitStatus: 'modified', uncommittedChanges: 3, projectType: 'rust' },
    { name: "my-web-app", path: "/Users/dasta/projects/my-web-app", lastOpened: Date.now() - 86400000, gitStatus: 'synced', projectType: 'node' },
    { name: "api-service", path: "/Users/dasta/projects/api-service", lastOpened: Date.now() - 172800000, gitStatus: 'ahead', uncommittedChanges: 1, projectType: 'go' },
    { name: "data-pipeline", path: "/Users/dasta/work/data-pipeline", lastOpened: Date.now() - 259200000, gitStatus: 'synced', projectType: 'python' },
    { name: "microservice-auth", path: "/Users/dasta/projects/microservices/auth-service", lastOpened: Date.now() - 345600000, gitStatus: 'behind', projectType: 'java' },
    { name: "react-dashboard", path: "/Users/dasta/projects/frontend/react-dashboard", lastOpened: Date.now() - 432000000, gitStatus: 'modified', uncommittedChanges: 7, projectType: 'react' },
    { name: "python-ml-model", path: "/Users/dasta/work/ml/python-ml-model", lastOpened: Date.now() - 518400000, gitStatus: 'synced', projectType: 'python' },
    { name: "docker-compose-utils", path: "/Users/dasta/projects/devops/docker-compose-utils", lastOpened: Date.now() - 604800000, gitStatus: 'untracked', projectType: 'docker' },
  ];

  @state() private filterText = "";
  @state() private selectedIndex = -1;
  @state() private templatePickerOpen = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.setupKeyboardNavigation();
  }

  private setupKeyboardNavigation(): void {
    document.addEventListener('keydown', (e) => {
      // Only handle keyboard nav when welcome screen is visible
      const welcomeScreen = document.querySelector('welcome-screen');
      if (!welcomeScreen) return;

      const filterInput = document.getElementById('project-filter') as HTMLInputElement;
      const isTyping = document.activeElement === filterInput;

      if (e.key === 'ArrowDown' && !isTyping) {
        e.preventDefault();
        const filtered = this.getFilteredProjects();
        this.selectedIndex = Math.min(this.selectedIndex + 1, filtered.length - 1);
      } else if (e.key === 'ArrowUp' && !isTyping) {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      } else if (e.key === 'Enter' && this.selectedIndex >= 0 && !isTyping) {
        e.preventDefault();
        const filtered = this.getFilteredProjects();
        if (filtered[this.selectedIndex]) {
          this.handleProjectClick(filtered[this.selectedIndex]);
        }
      } else if (e.key === 'Delete' && this.selectedIndex >= 0 && !isTyping) {
        e.preventDefault();
        // Could implement remove from recent list here
        console.log('Remove project from recent list');
      } else if (e.key === '/' && !isTyping) {
        e.preventDefault();
        filterInput?.focus();
      } else if (e.key === 'Escape') {
        filterInput?.blur();
        this.filterText = '';
        this.selectedIndex = -1;
      }
    });
  }

  private handleOpenFolder = (): void => {
    dispatch("open-folder", {});
  };

  private handleOpenFile = (): void => {
    dispatch("open-file", {});
  };

  private handleNewProject = (): void => {
    this.templatePickerOpen = true;
  };

  private handleTemplateConfirmed = (e: CustomEvent): void => {
    const { name, path, template } = e.detail;
    console.log('Project created:', { name, path, template: template.id });
    this.templatePickerOpen = false;

    // Open the newly created project
    document.dispatchEvent(
      new CustomEvent("open-recent-project", {
        detail: { path },
        bubbles: true,
        composed: true,
      })
    );
  };

  private handleTemplatePickerClose = (): void => {
    this.templatePickerOpen = false;
  };

  private handleProjectClick = (project: RecentProject): void => {
    document.dispatchEvent(
      new CustomEvent("open-recent-project", {
        detail: { path: project.path },
        bubbles: true,
        composed: true,
      })
    );
  };

  private getRelativeTime(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;

    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private detectProjectType(project: RecentProject): ProjectType {
    const { name } = project;
    const lowerName = name.toLowerCase();

    if (lowerName.includes('react') || lowerName.includes('next') || lowerName.includes('vite')) return 'react';
    if (lowerName.includes('vue')) return 'vue';
    if (lowerName.includes('angular') || lowerName.includes('ng-')) return 'angular';
    if (lowerName.includes('ts-') || lowerName.includes('typescript')) return 'typescript';
    if (lowerName.includes('docker') || lowerName.includes('compose')) return 'docker';
    if (lowerName.includes('db') || lowerName.includes('database') || lowerName.includes('mongo')) return 'database';
    if (lowerName.includes('go-') || lowerName.includes('golang')) return 'go';
    if (lowerName.includes('py-') || lowerName.includes('python') || lowerName.includes('ml-')) return 'python';
    if (lowerName.includes('rs-') || lowerName.includes('rust') || lowerName.includes('cargo')) return 'rust';
    if (lowerName.includes('node') || lowerName.includes('npm') || lowerName.includes('express')) return 'node';
    if (lowerName.includes('java') || lowerName.includes('spring') || lowerName.includes('maven')) return 'java';

    return 'generic';
  }

  private getProjectIcon(type: ProjectType): { name: string; color: string } {
    // Colors are CSS variables for theme support
    const iconMap: Record<ProjectType, { name: string; color: string }> = {
      'rust': { name: 'box', color: 'var(--project-rust)' },
      'node': { name: 'terminal', color: 'var(--project-node)' },
      'python': { name: 'layers', color: 'var(--project-python)' },
      'go': { name: 'globe', color: 'var(--project-go)' },
      'java': { name: 'server', color: 'var(--project-java)' },
      'typescript': { name: 'file-code', color: 'var(--project-typescript)' },
      'react': { name: 'box', color: 'var(--project-react)' },
      'vue': { name: 'box', color: 'var(--project-vue)' },
      'angular': { name: 'box', color: 'var(--project-angular)' },
      'docker': { name: 'package', color: 'var(--project-docker)' },
      'database': { name: 'database', color: 'var(--project-database)' },
      'generic': { name: 'folder', color: 'var(--project-generic)' },
    };
    return iconMap[type] || iconMap['generic'];
  }

  private getFilteredProjects(): RecentProject[] {
    if (!this.filterText) return this.recentProjects;
    const lower = this.filterText.toLowerCase();
    return this.recentProjects.filter(
      p => p.name.toLowerCase().includes(lower) || p.path.toLowerCase().includes(lower)
    );
  }

  private renderGitStatus(project: RecentProject): ReturnType<typeof html> {
    const { gitStatus, uncommittedChanges } = project;

    if (!gitStatus || gitStatus === 'synced') {
      return html`
        <span class="flex items-center text-[11px]" style="color: var(--app-console-success);" title="Up to date">
          <os-icon name="check" size="14" color="var(--app-console-success)"></os-icon>
        </span>
      `;
    }

    if (gitStatus === 'modified') {
      return html`
        <span class="flex items-center gap-1 text-[11px]" style="color: var(--app-status-stopped);" title="${uncommittedChanges} uncommitted changes">
          <os-icon name="circle-dot" size="12" color="var(--app-status-stopped)"></os-icon>
          <span>${uncommittedChanges}</span>
        </span>
      `;
    }

    if (gitStatus === 'ahead') {
      return html`
        <span class="flex items-center gap-1 text-[11px]" style="color: var(--app-button-background);" title="${uncommittedChanges} commits to push">
          <os-icon name="arrow-up-from-line" size="12" color="var(--app-button-background)"></os-icon>
          <span>${uncommittedChanges}</span>
        </span>
      `;
    }

    if (gitStatus === 'behind') {
      return html`
        <span class="flex items-center gap-1 text-[11px]" style="color: var(--project-rust);" title="Behind remote">
          <os-icon name="arrow-down-to-line" size="12" color="var(--project-rust)"></os-icon>
        </span>
      `;
    }

    if (gitStatus === 'untracked') {
      return html`
        <span class="flex items-center gap-1 text-[11px]" style="color: var(--app-disabled-foreground);" title="Not tracked by git">
          <os-icon name="cloud" size="12" color="var(--app-disabled-foreground)"></os-icon>
        </span>
      `;
    }

    return html``;
  }

  private renderRecentProjects(): ReturnType<typeof html> {
    const filtered = this.getFilteredProjects();

    if (filtered.length === 0) {
      return html`
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <div class="relative mb-6">
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl blur-xl opacity-60"></div>
            <os-icon name="folder-input" size="96" color="#6366f1"></os-icon>
          </div>
          ${this.filterText
            ? html`<p class="text-[15px] font-semibold" style="color: var(--app-foreground);">No projects match "${this.filterText}"</p>`
            : html`
                <p class="text-[15px] font-semibold mb-1" style="color: var(--app-foreground);">No recent projects</p>
                <p class="text-[13px] max-w-[280px]" style="color: var(--app-disabled-foreground);">Open a folder to start coding and see your recent projects here</p>
              `
          }
        </div>
      `;
    }

    return html`
      <div class="space-y-0.5">
        ${filtered.map((project, index) => {
          const projectType = project.projectType || this.detectProjectType(project);
          const iconConfig = this.getProjectIcon(projectType);
          const isSelected = index === this.selectedIndex;

          return html`
            <div
              class="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all rounded-lg group border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500' : 'border-transparent hover:bg-[#f9fafb]'}"
              @click=${() => this.handleProjectClick(project)}
              @mouseenter=${() => { if (!this.filterText) this.selectedIndex = index; }}
            >
              <!-- Project type icon -->
              <div
                class="w-9 h-9 rounded-md bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-white' : 'group-hover:bg-white'} transition-colors border ${isSelected ? 'border-indigo-200' : 'border-[#e5e7eb] group-hover:border-[#d1d5db]'}"
              >
                <os-icon name="${iconConfig.name}" size="18" color="${iconConfig.color}"></os-icon>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <div class="text-[14px] font-medium truncate ${isSelected ? 'text-indigo-700' : 'group-hover:text-indigo-600'} transition-colors" style="color: ${isSelected ? '#4f46e5' : 'var(--app-foreground)'};" title="${project.path}">
                    ${project.name}
                  </div>
                  ${this.renderGitStatus(project)}
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] truncate" title="${project.path}" style="color: var(--app-disabled-foreground);">${project.path}</span>
                  <span class="text-[10px] flex-shrink-0" style="color: var(--app-disabled-foreground);">${this.getRelativeTime(project.lastOpened)}</span>
                </div>
              </div>
              <!-- External link icon on hover -->
              <os-icon name="external-link" size="16" style="color: var(--app-disabled-foreground);" class="opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5 hidden group-hover:block"></os-icon>
            </div>
          `;
        })}
      </div>
    `;
  }

  render() {
    const filtered = this.getFilteredProjects();

    return html`
      <div class="flex flex-col h-screen items-center justify-center" style="background-color: var(--app-bg);">
        <div class="w-full max-w-[880px] px-8">
          <!-- Header: Logo + Title centered -->
          <div class="flex flex-col items-center mb-10">
            <os-brand-logo size="72"></os-brand-logo>
            <h1 class="mt-4 text-[34px] font-bold tracking-tight" style="color: var(--app-foreground);">
              openstorm
            </h1>
            <p class="mt-1.5 text-[13px] font-medium" style="color: var(--app-disabled-foreground);">
              An open-source IDE with premium features
            </p>
          </div>

          <!-- Main content: Two columns in a unified card -->
          <div class="rounded-2xl shadow-sm border overflow-hidden" style="background-color: var(--app-bg); border-color: var(--app-border);">
            <div class="flex">
              <!-- Left: Recent Projects (60%) -->
              <div class="flex-[1.5] p-6 border-r" style="border-color: var(--app-border);">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--app-disabled-foreground);">
                    Recent Projects
                  </h2>
                  ${this.filterText
                    ? html`<span class="text-[11px]" style="color: var(--app-disabled-foreground);">${filtered.length} of ${this.recentProjects.length}</span>`
                    : ''
                  }
                </div>

                <!-- Search/Filter box -->
                <div class="relative mb-4">
                  <os-icon name="list-filter" size="14" style="color: var(--app-disabled-foreground);" class="absolute left-3 top-1/2 -translate-y-1/2"></os-icon>
                  <input
                    id="project-filter"
                    type="text"
                    class="w-full pl-9 pr-8 py-2 text-[13px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                    style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: var(--app-input-border);"
                    placeholder="Filter projects... (press / to focus)"
                    .value=${this.filterText}
                    @input=${(e: Event) => {
                      this.filterText = (e.target as HTMLInputElement).value;
                      this.selectedIndex = 0;
                    }}
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.selectedIndex = Math.min(this.selectedIndex + 1, filtered.length - 1);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                      } else if (e.key === 'Enter' && this.selectedIndex >= 0) {
                        e.preventDefault();
                        if (filtered[this.selectedIndex]) {
                          this.handleProjectClick(filtered[this.selectedIndex]);
                        }
                      }
                    }}
                  />
                  ${this.filterText
                    ? html`
                      <button
                        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                        style="color: var(--app-disabled-foreground);"
                        @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                        @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                        @click=${() => { this.filterText = ''; this.selectedIndex = -1; }}
                      >
                        <os-icon name="x" size="12"></os-icon>
                      </button>
                    `
                    : html`
                      <kbd class="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] border rounded font-mono" style="background-color: var(--app-bg); border-color: var(--app-border); color: var(--app-disabled-foreground);">/</kbd>
                    `
                  }
                </div>

                <!-- Projects list -->
                <div class="max-h-[280px] overflow-y-auto pr-1 -mr-1">
                  ${this.renderRecentProjects()}
                </div>

                <!-- Keyboard hints -->
                <div class="mt-4 pt-3 border-t flex items-center gap-3 text-[10px]" style="border-color: var(--app-border); color: var(--app-disabled-foreground);">
                  <span class="flex items-center gap-1"><kbd class="px-1 py-0.5 rounded border" style="background-color: var(--app-input-background); border-color: var(--app-border);">↑↓</kbd> Navigate</span>
                  <span class="flex items-center gap-1"><kbd class="px-1 py-0.5 rounded border" style="background-color: var(--app-input-background); border-color: var(--app-border);">Enter</kbd> Open</span>
                  <span class="flex items-center gap-1"><kbd class="px-1 py-0.5 rounded border" style="background-color: var(--app-input-background); border-color: var(--app-border);">/</kbd> Filter</span>
                </div>
              </div>

              <!-- Right: Start Actions (40%) -->
              <div class="flex-1 p-6" style="background-color: var(--app-tab-inactive);">
                <h2 class="text-[11px] font-semibold uppercase tracking-wider mb-4" style="color: var(--app-disabled-foreground);">
                  Start
                </h2>
                <div class="flex flex-col gap-2.5">
                  <!-- New Project -->
                  <div
                    class="group flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl cursor-pointer transition-all hover:shadow-md hover:shadow-indigo-100/50 hover:-translate-y-0.5"
                    @click=${this.handleNewProject}
                  >
                    <div class="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                      <os-icon name="file-plus" size="20" color="white"></os-icon>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[14px] font-semibold text-white">
                        New Project
                      </div>
                      <div class="text-[12px] text-white/80">
                        Create from template
                      </div>
                    </div>
                  </div>

                  <!-- Open Folder -->
                  <div
                    class="group flex items-center gap-3.5 p-3.5 rounded-xl cursor-pointer transition-all hover:shadow-md hover:shadow-indigo-100/50 border hover:border-indigo-300 hover:-translate-y-0.5"
                    style="background-color: var(--app-bg); border-color: var(--app-border);"
                    @click=${this.handleOpenFolder}
                  >
                    <div
                      class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow"
                    >
                      <os-icon name="folder-open" size="20" color="white"></os-icon>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[14px] font-semibold group-hover:text-indigo-600 transition-colors" style="color: var(--app-foreground);">
                        Open Folder
                      </div>
                      <div class="text-[12px]" style="color: var(--app-disabled-foreground);">
                        Open existing project
                      </div>
                    </div>
                  </div>

                  <!-- Open File -->
                  <div
                    class="group flex items-center gap-3.5 p-3.5 rounded-xl cursor-pointer transition-all hover:shadow-md hover:shadow-indigo-100/50 border hover:border-indigo-300 hover:-translate-y-0.5"
                    style="background-color: var(--app-bg); border-color: var(--app-border);"
                    @click=${this.handleOpenFile}
                  >
                    <div
                      class="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow"
                    >
                      <os-icon name="file" size="20" color="white"></os-icon>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[14px] font-semibold group-hover:text-indigo-600 transition-colors" style="color: var(--app-foreground);">
                        Open File
                      </div>
                      <div class="text-[12px]" style="color: var(--app-disabled-foreground);">
                        Open a single file
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Quick tips -->
                <div class="mt-6 pt-4 border-t" style="border-color: var(--app-border);">
                  <div class="text-[11px] space-y-1.5" style="color: var(--app-disabled-foreground);">
                    <div class="flex items-center gap-2">
                      <kbd class="px-1.5 py-0.5 rounded border font-mono text-[10px]" style="background-color: var(--app-bg); border-color: var(--app-border); color: var(--app-foreground);">Ctrl+P</kbd>
                      <span>Quick search</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <kbd class="px-1.5 py-0.5 rounded border font-mono text-[10px]" style="background-color: var(--app-bg); border-color: var(--app-border); color: var(--app-foreground);">Ctrl+${'`'}</kbd>
                      <span>Toggle terminal</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Template Picker Modal -->
        <template-picker
          .open=${this.templatePickerOpen}
          @template-confirmed=${this.handleTemplateConfirmed}
          @template-picker-close=${this.handleTemplatePickerClose}
        ></template-picker>
      </div>
    `;
  }
}
