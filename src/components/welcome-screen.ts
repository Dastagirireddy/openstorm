import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { TailwindElement } from "../tailwind-element.js";

export type GitStatus = 'synced' | 'modified' | 'behind' | 'ahead' | 'untracked';
export type ProjectType = 'rust' | 'node' | 'python' | 'go' | 'java' | 'typescript' | 'react' | 'vue' | 'angular' | 'docker' | 'generic';

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
    document.dispatchEvent(new CustomEvent("open-folder"));
  };

  private handleOpenFile = (): void => {
    document.dispatchEvent(new CustomEvent("open-file"));
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
    const iconMap: Record<ProjectType, { name: string; color: string }> = {
      'rust': { name: 'box', color: '#ea580c' },
      'node': { name: 'terminal', color: '#22c55e' },
      'python': { name: 'layers', color: '#3b82f6' },
      'go': { name: 'globe', color: '#06b6d4' },
      'java': { name: 'server', color: '#dc2626' },
      'typescript': { name: 'file-code', color: '#2563eb' },
      'react': { name: 'box', color: '#0891b2' },
      'vue': { name: 'box', color: '#42b883' },
      'angular': { name: 'box', color: '#dd0031' },
      'docker': { name: 'package', color: '#0db7ed' },
      'database': { name: 'database', color: '#a855f7' },
      'generic': { name: 'folder', color: '#4f46e5' },
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
        <span class="flex items-center text-[11px] text-emerald-600" title="Up to date">
          <os-icon name="check" size="14" color="#059669"></os-icon>
        </span>
      `;
    }

    if (gitStatus === 'modified') {
      return html`
        <span class="flex items-center gap-1 text-[11px] text-amber-600" title="${uncommittedChanges} uncommitted changes">
          <os-icon name="circle-dot" size="12" color="#d97706"></os-icon>
          <span>${uncommittedChanges}</span>
        </span>
      `;
    }

    if (gitStatus === 'ahead') {
      return html`
        <span class="flex items-center gap-1 text-[11px] text-blue-600" title="${uncommittedChanges} commits to push">
          <os-icon name="arrow-up-from-line" size="12" color="#2563eb"></os-icon>
          <span>${uncommittedChanges}</span>
        </span>
      `;
    }

    if (gitStatus === 'behind') {
      return html`
        <span class="flex items-center gap-1 text-[11px] text-orange-600" title="Behind remote">
          <os-icon name="arrow-down-to-line" size="12" color="#ea580c"></os-icon>
        </span>
      `;
    }

    if (gitStatus === 'untracked') {
      return html`
        <span class="flex items-center gap-1 text-[11px] text-gray-400" title="Not tracked by git">
          <os-icon name="cloud" size="12" color="#9ca3af"></os-icon>
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
            ? html`<p class="text-[15px] font-semibold text-[#374151]">No projects match "${this.filterText}"</p>`
            : html`
                <p class="text-[15px] font-semibold text-[#374151] mb-1">No recent projects</p>
                <p class="text-[13px] text-[#6b7280] max-w-[280px]">Open a folder to start coding and see your recent projects here</p>
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
              class="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all rounded-lg group ${isSelected ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-[#f9fafb]'}"
              @click=${() => this.handleProjectClick(project)}
              @mouseenter=${() => { if (!this.filterText) this.selectedIndex = index; }}
            >
              <!-- Project type icon -->
              <div
                class="w-9 h-9 rounded-md bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-white' : 'group-hover:bg-white'} transition-colors border border-[#e5e7eb] ${isSelected ? 'border-indigo-200' : 'group-hover:border-[#d1d5db]'}"
              >
                <os-icon name="${iconConfig.name}" size="18" color="${iconConfig.color}"></os-icon>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <div class="text-[14px] font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-[#111827] group-hover:text-indigo-600'} transition-colors" title="${project.path}">
                    ${project.name}
                  </div>
                  ${this.renderGitStatus(project)}
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] text-[#6b7280] truncate" title="${project.path}">${project.path}</span>
                  <span class="text-[10px] text-[#9ca3af] flex-shrink-0">${this.getRelativeTime(project.lastOpened)}</span>
                </div>
              </div>
              <!-- External link icon on hover -->
              <os-icon name="external-link" size="16" color="#9ca3af" class="opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5 hidden group-hover:block"></os-icon>
            </div>
          `;
        })}
      </div>
    `;
  }

  render() {
    const filtered = this.getFilteredProjects();

    return html`
      <div class="flex flex-col h-screen items-center justify-center bg-[#fafafa]">
        <div class="w-full max-w-[880px] px-8">
          <!-- Header: Logo + Title centered -->
          <div class="flex flex-col items-center mb-10">
            <os-brand-logo size="72"></os-brand-logo>
            <h1 class="mt-4 text-[34px] font-bold tracking-tight text-[#374151]">
              openstorm
            </h1>
            <p class="mt-1.5 text-[13px] text-[#6b7280] font-medium">
              An open-source IDE with premium features
            </p>
          </div>

          <!-- Main content: Two columns in a unified card -->
          <div class="bg-white rounded-2xl shadow-sm border border-[#e5e7eb] overflow-hidden">
            <div class="flex">
              <!-- Left: Recent Projects (60%) -->
              <div class="flex-[1.5] p-6 border-r border-[#e5e7eb]">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">
                    Recent Projects
                  </h2>
                  ${this.filterText
                    ? html`<span class="text-[11px] text-[#9ca3af]">${filtered.length} of ${this.recentProjects.length}</span>`
                    : ''
                  }
                </div>

                <!-- Search/Filter box -->
                <div class="relative mb-4">
                  <os-icon name="list-filter" size="14" color="#9ca3af" class="absolute left-3 top-1/2 -translate-y-1/2"></os-icon>
                  <input
                    id="project-filter"
                    type="text"
                    class="w-full pl-9 pr-8 py-2 text-[13px] bg-[#f9fafb] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-[#9ca3af]"
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
                        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-[#e5e7eb] rounded"
                        @click=${() => { this.filterText = ''; this.selectedIndex = -1; }}
                      >
                        <os-icon name="x" size="12" color="#6b7280"></os-icon>
                      </button>
                    `
                    : html`
                      <kbd class="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] bg-white border border-[#e5e7eb] rounded text-[#9ca3af] font-mono">/</kbd>
                    `
                  }
                </div>

                <!-- Projects list -->
                <div class="max-h-[280px] overflow-y-auto pr-1 -mr-1">
                  ${this.renderRecentProjects()}
                </div>

                <!-- Keyboard hints -->
                <div class="mt-4 pt-3 border-t border-[#e5e7eb] flex items-center gap-3 text-[10px] text-[#9ca3af]">
                  <span class="flex items-center gap-1"><kbd class="px-1 py-0.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">↑↓</kbd> Navigate</span>
                  <span class="flex items-center gap-1"><kbd class="px-1 py-0.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">Enter</kbd> Open</span>
                  <span class="flex items-center gap-1"><kbd class="px-1 py-0.5 bg-[#f9fafb] rounded border border-[#e5e7eb]">/</kbd> Filter</span>
                </div>
              </div>

              <!-- Right: Start Actions (40%) -->
              <div class="flex-1 p-6 bg-[#fafafa]">
                <h2 class="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider mb-4">
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
                    class="group flex items-center gap-3.5 p-3.5 bg-white rounded-xl cursor-pointer transition-all hover:shadow-md hover:shadow-indigo-100/50 border border-[#e5e7eb] hover:border-indigo-300 hover:-translate-y-0.5"
                    @click=${this.handleOpenFolder}
                  >
                    <div
                      class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow"
                    >
                      <os-icon name="folder-open" size="20" color="white"></os-icon>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[14px] font-semibold text-[#111827] group-hover:text-indigo-600 transition-colors">
                        Open Folder
                      </div>
                      <div class="text-[12px] text-[#6b7280]">
                        Open existing project
                      </div>
                    </div>
                  </div>

                  <!-- Open File -->
                  <div
                    class="group flex items-center gap-3.5 p-3.5 bg-white rounded-xl cursor-pointer transition-all hover:shadow-md hover:shadow-indigo-100/50 border border-[#e5e7eb] hover:border-indigo-300 hover:-translate-y-0.5"
                    @click=${this.handleOpenFile}
                  >
                    <div
                      class="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow"
                    >
                      <os-icon name="file" size="20" color="white"></os-icon>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[14px] font-semibold text-[#111827] group-hover:text-indigo-600 transition-colors">
                        Open File
                      </div>
                      <div class="text-[12px] text-[#6b7280]">
                        Open a single file
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Quick tips -->
                <div class="mt-6 pt-4 border-t border-[#e5e7eb]">
                  <div class="text-[11px] text-[#6b7280] space-y-1.5">
                    <div class="flex items-center gap-2">
                      <kbd class="px-1.5 py-0.5 bg-white rounded border border-[#e5e7eb] font-mono text-[10px]">Ctrl+P</kbd>
                      <span>Quick search</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <kbd class="px-1.5 py-0.5 bg-white rounded border border-[#e5e7eb] font-mono text-[10px]">Ctrl+${'`'}</kbd>
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
