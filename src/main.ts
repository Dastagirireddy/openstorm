import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { TailwindElement } from "./tailwind-element.js";

// Import iconify-icon web component and register icon collections
import "iconify-icon";
import { addCollection } from 'iconify-icon';
import * as devicon from '@iconify-json/devicon/icons.json';
import * as vscodeIcons from '@iconify-json/vscode-icons/icons.json';
import * as tabler from '@iconify-json/tabler/icons.json';
import * as catppuccin from '@iconify-json/catppuccin/icons.json';
import * as fileIcons from '@iconify-json/file-icons/icons.json';
import * as logos from '@iconify-json/logos/icons.json';
import * as mdi from '@iconify-json/mdi/icons.json';
import * as streamlineFlexColor from '@iconify-json/streamline-flex-color/icons.json';
addCollection(devicon);
addCollection(vscodeIcons);
addCollection(tabler);
addCollection(catppuccin);
addCollection(fileIcons);
addCollection(logos);
addCollection(mdi);
addCollection(streamlineFlexColor);

// Import components
import "./components/header/app-header.js";
import "./components/header/breadcrumb.js";
import "./components/navigation/activity-bar.js";
import "./components/explorer/project-explorer.js";
import "./components/editor/editor-pane.js";
import "./components/editor/tab-bar.js";
import "./components/terminal/terminal-pane.js";
import "./components/status-bar.js";
import "./components/search-overlay.js";
import "./components/icon.js";
import "./components/resizable-container.js";
import "./components/dialog.js";
import "./components/file-type-picker.js";
import "./components/file-create-dialog.js";
import "./components/context-menu.js";
import "./components/rename-dialog.js";
import "./components/delete-dialog.js";
import "./components/welcome-screen.js";
import "./components/template-picker.js";

import type { EditorTab, SaveStatus, ActivityItem } from "./lib/file-types.js";

@customElement("openstorm-app")
export class OpenStormApp extends TailwindElement() {
  @state() private projectPath = "";
  @state() private tabs: EditorTab[] = [];
  @state() private activeTabId = "";
  @state() private saveStatus: SaveStatus = "saved";
  @state() private tabLimit = 10;
  @state() private activeActivity: ActivityItem = "explorer";
  @state() private terminalVisible = true;
  @state() private terminalCreated = false;
  @state() private sidebarWidth = 250;
  @state() private terminalHeight = 200;
  @state() private isTerminalResizing = false;
  @state() private terminalResizeStartY = 0;
  @state() private terminalResizeStartHeight = 0;
  @state() private activeFilePath = '';

  connectedCallback(): void {
    super.connectedCallback();
    this.setupKeyboardShortcuts();
    this.setupOpenFolderHandler();
    this.setupFileChangeHandler();
    this.setupAutoSaveHandler();
    // Terminal will be auto-created when project is opened
  }

  private async setupFileChangeHandler(): Promise<void> {
    // Listen for file system changes from backend
    const { listen } = await import("@tauri-apps/api/event");
    listen("file-change", (event: any) => {
      console.log("File change detected:", event.payload);
      // Dispatch event to refresh file explorer
      document.dispatchEvent(
        new CustomEvent("refresh-explorer", {
          detail: event.payload,
          bubbles: true,
          composed: true,
        }),
      );
    }).catch(console.error);
  }

  private async setupAutoSaveHandler(): Promise<void> {
    // Listen for auto-save events from editor
    document.addEventListener("auto-saved", ((e: CustomEvent) => {
      console.log("Auto-saved:", e.detail.path);
      this.saveStatus = "saved";
    }) as EventListener);
  }

  private setupOpenFolderHandler(): void {
    document.addEventListener("open-folder", this.handleOpenFolder);
    document.addEventListener("open-file", this.handleOpenSingleFile);
    // Handle locate file events - dispatch to project explorer with active file path
    document.addEventListener("locate-file", this.handleLocateFile);
    // Handle open-recent-project events from welcome screen
    document.addEventListener("open-recent-project", this.handleOpenRecentProject);
  }

  private handleLocateFile = (): void => {
    if (this.activeFilePath) {
      document.dispatchEvent(
        new CustomEvent("locate-file-external", {
          detail: { path: this.activeFilePath },
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  private handleOpenRecentProject = async (e: CustomEvent<{ path: string }>): Promise<void> => {
    const { path } = e.detail;
    console.log('Opening recent project:', path);

    const newProjectPath = path;

    // Reset state for new project
    this.projectPath = newProjectPath;
    this.activeActivity = "explorer";
    this.tabs = [];
    this.activeTabId = "";
    this.terminalCreated = false;

    // Call handleFolderOpened to start file watcher and create terminal
    await this.handleFolderOpened({
      detail: { path: newProjectPath },
    } as CustomEvent<{ path: string }>);

    document.dispatchEvent(
      new CustomEvent("project-opened", {
        detail: { path: this.projectPath },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private handleOpenFolder = async (): Promise<void> => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });
      if (selected) {
        const newProjectPath = selected as string;

        // Reset state for new project
        this.projectPath = newProjectPath;
        this.activeActivity = "explorer";
        this.tabs = [];
        this.activeTabId = "";
        this.terminalCreated = false; // Will be set to true by handleFolderOpened

        // Call handleFolderOpened to start file watcher and create terminal
        await this.handleFolderOpened({
          detail: { path: newProjectPath },
        } as CustomEvent<{ path: string }>);

        document.dispatchEvent(
          new CustomEvent("project-opened", {
            detail: { path: this.projectPath },
            bubbles: true,
            composed: true,
          }),
        );
      }
    } catch (error) {
      console.error("Failed to open folder:", error);
    }
  };

  private handleOpenSingleFile = async (): Promise<void> => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: "Open File",
      });
      if (selected) {
        const filePath = selected as string;
        const name = filePath.split("/").pop() || "";

        // Read the file content
        const content = await invoke("read_file", { path: filePath });

        // Check if file is already open
        const existingTab = this.tabs.find((t) => t.path === filePath);
        if (existingTab) {
          this.activeTabId = existingTab.id;
          this.activeFilePath = filePath;
          this.saveStatus = existingTab.modified ? "unsaved" : "saved";
          this.tabs = this.tabs.map((t) =>
            t.id === existingTab.id ? { ...t, content, lastUsed: Date.now() } : t,
          );
        } else {
          const newTab: EditorTab = {
            id: filePath,
            name,
            path: filePath,
            modified: false,
            content,
            lastUsed: Date.now(),
          };
          this.tabs = [...this.tabs, newTab];
          this.activeTabId = filePath;
          this.activeFilePath = filePath;
          this.saveStatus = "saved";
          this.enforceTabLimit();
        }

        // Dispatch event only for editor-pane to update its view
        document.dispatchEvent(
          new CustomEvent("open-file-external", {
            detail: { path: filePath, content },
            bubbles: true,
            composed: true,
          }),
        );
      }
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  };

  private setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("quick-search"));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        this.saveActiveFile();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "e")) {
        e.preventDefault();
        this.toggleActivityBar();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        this.toggleTerminal();
      }
      // Alt+Shift+F or Option+Shift+F for format code
      if ((e.altKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.formatActiveFile();
      }
    });
  }

  private async formatActiveFile(): Promise<void> {
    // Dispatch event to editor-pane to format code
    document.dispatchEvent(new CustomEvent('format-code'));
  }

  private async saveActiveFile(): Promise<void> {
    // Delegate to editor-pane which has the content
    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
    if (!activeTab) return;

    this.saveStatus = "saving";
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_file", {
        path: activeTab.path,
        content: activeTab.content,
      });
      this.saveStatus = "saved";
      this.tabs = this.tabs.map((t) =>
        t.path === activeTab.path ? { ...t, modified: false } : t,
      );
      // Notify editor-pane to update saved content
      document.dispatchEvent(new CustomEvent('file-saved', {
        detail: { path: activeTab.path, content: activeTab.content },
        bubbles: true,
        composed: true,
      }));
    } catch (error) {
      console.error("Failed to save file:", error);
      this.saveStatus = "error";
    }
  }

  private toggleTerminal(): void {
    this.terminalVisible = !this.terminalVisible;
  }

  private handleTerminalResizeStart = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    this.isTerminalResizing = true;
    this.terminalResizeStartY = e.clientY;
    this.terminalResizeStartHeight = this.terminalHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isTerminalResizing) return;
      const deltaY = this.terminalResizeStartY - moveEvent.clientY;
      let newHeight = this.terminalResizeStartHeight + deltaY;
      newHeight = Math.max(100, Math.min(500, newHeight));
      this.terminalHeight = newHeight;
    };

    const handleMouseUp = () => {
      this.isTerminalResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  private toggleActivityBar(): void {
    this.activeActivity =
      this.activeActivity === "explorer" ? ("" as ActivityItem) : "explorer";
  }

  private handleFileSelect = async (
    e: CustomEvent<{ path: string }>,
  ): Promise<void> => {
    const { path } = e.detail;
    const name = path.split("/").pop() || "";

    const existingTab = this.tabs.find((t) => t.path === path);
    if (existingTab) {
      this.activeTabId = existingTab.id;
      this.activeFilePath = path;
      this.saveStatus = existingTab.modified ? "unsaved" : "saved";
      this.tabs = this.tabs.map((t) =>
        t.id === existingTab.id ? { ...t, lastUsed: Date.now() } : t,
      );
      // Don't dispatch open-file event - just switch to existing tab
      // Dispatching open-file would trigger the global handler and open the file dialog
      return;
    }

    try {
      const content = await invoke("read_file", { path });
      const newTab: EditorTab = {
        id: path,
        name,
        path,
        modified: false,
        content,
        lastUsed: Date.now(),
      };
      this.tabs = [...this.tabs, newTab];
      this.activeTabId = path;
      this.activeFilePath = path;
      this.saveStatus = "saved";
      this.enforceTabLimit();

      // Dispatch open-file for editor-pane to update its view
      // Use open-file-external instead to avoid triggering the global open-file handler
      document.dispatchEvent(
        new CustomEvent("open-file-external", {
          detail: { path, content },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      console.error("Failed to read file:", error);
    }
  };

  private handleContentChanged = (
    e: CustomEvent<{ path: string; content: string; isModified?: boolean }>,
  ): void => {
    const { path, content, isModified = true } = e.detail;
    const tabIndex = this.tabs.findIndex((t) => t.path === path);

    if (tabIndex !== -1) {
      this.tabs = this.tabs.map((t, i) =>
        i === tabIndex ? { ...t, content, modified: isModified } : t,
      );
    }

    this.saveStatus = isModified ? "unsaved" : "saved";
  };

  private handleTabSelect = (e: CustomEvent<{ tabId: string }>): void => {
    const { tabId } = e.detail;
    this.activeTabId = tabId;
    const tab = this.tabs.find((t) => t.id === tabId);
    if (tab) {
      this.activeFilePath = tab.path;
      this.saveStatus = tab.modified ? "unsaved" : "saved";
      // Use open-file-external to avoid triggering the global open-file handler
      document.dispatchEvent(
        new CustomEvent("open-file-external", {
          detail: { path: tab.path, content: tab.content },
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  private handleTabClose = (e: CustomEvent<{ tabId: string }>): void => {
    this.closeTab(e.detail.tabId);
  };

  private handleTabPinToggle = (e: CustomEvent<{ tabId: string }>): void => {
    const { tabId } = e.detail;
    this.tabs = this.tabs.map((t) =>
      t.id === tabId ? { ...t, pinned: !t.pinned } : t,
    );
  };

  private handleFolderOpened = async (
    e: CustomEvent<{ path: string }>,
  ): Promise<void> => {
    this.projectPath = e.detail.path;

    // Start watching the project folder for file changes
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("start_watching", { path: this.projectPath });
      console.log("File watcher started for:", this.projectPath);

      // Initialize LSP connection pool
      await invoke("initialize_lsp_pool", { rootPath: this.projectPath });
      console.log("LSP connection pool initialized for:", this.projectPath);
    } catch (error) {
      console.error("Failed to start file watcher:", error);
    }

    // Auto-create terminal when project is opened
    this.terminalCreated = true;
  };

  private closeTab(tabId: string): void {
    const tabIndex = this.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const tabToClose = this.tabs[tabIndex];
    this.tabs = this.tabs.filter((t) => t.id !== tabId);

    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        const newActiveIndex = Math.min(tabIndex, this.tabs.length - 1);
        this.activeTabId = this.tabs[newActiveIndex].id;
        // Use open-file-external to avoid triggering the global open-file handler (which opens the file dialog)
        document.dispatchEvent(
          new CustomEvent("open-file-external", {
            detail: {
              path: this.tabs[newActiveIndex].path,
              content: this.tabs[newActiveIndex].content,
            },
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        this.activeTabId = "";
        document.dispatchEvent(new CustomEvent("clear-editor"));
      }
    }
  }

  private enforceTabLimit(): void {
    const pinnedCount = this.tabs.filter((t) => t.pinned).length;
    const maxUnpinned = Math.max(0, this.tabLimit - pinnedCount);

    while (this.tabs.filter((t) => !t.pinned).length > maxUnpinned) {
      const unpinnedTabs = this.tabs
        .map((tab, index) => ({ tab, index }))
        .filter(({ tab }) => !tab.pinned);

      if (unpinnedTabs.length === 0) break;

      unpinnedTabs.sort(
        (a, b) => (a.tab.lastUsed ?? 0) - (b.tab.lastUsed ?? 0),
      );
      const lru = unpinnedTabs[0];

      if (!lru.tab.modified) {
        this.closeTab(lru.tab.id);
      } else {
        break;
      }
    }
  }

  render() {
    // Show full-window welcome screen when no project is open AND no files are open
    if (!this.projectPath && this.tabs.length === 0) {
      return html`
        <div class="flex flex-col h-screen w-screen overflow-hidden bg-white">
          <welcome-screen></welcome-screen>
        </div>
      `;
    }

    // Determine if we're in single-file mode (file open, no project)
    const isSingleFileMode = !this.projectPath && this.tabs.length > 0;

    // Show full IDE when project is open
    const projectName = this.projectPath.split("/").pop() || "OpenStorm";
    const activeFile =
      this.tabs.find((t) => t.id === this.activeTabId)?.path || "";

    // In single-file mode, hide explorer and terminal by default
    const showExplorer = !isSingleFileMode && this.activeActivity === "explorer";
    const showTerminal = !isSingleFileMode && this.terminalVisible;

    return html`
      <div class="flex flex-col h-screen w-screen overflow-hidden bg-white">
        <!-- Header -->
        <app-header
          class="shrink-0"
          .projectPath=${this.projectPath}
          .activeFile=${activeFile}
          .saveStatus=${this.saveStatus === "unsaved" ? "unsaved" : "saved"}
          .isSingleFileMode=${isSingleFileMode}
        >
        </app-header>

        <!-- Main Content Area (Editor + Terminal) -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Activity Bar (hidden in single-file mode) -->
          ${!isSingleFileMode
            ? html`
                <activity-bar
                  class="shrink-0"
                  .activeItem=${this.activeActivity}
                  @item-change=${(e: CustomEvent<{ item: ActivityItem }>) => {
                    this.activeActivity = e.detail.item;
                  }}
                >
                </activity-bar>
              `
            : ""}

          <!-- Editor + Terminal Column -->
          <div class="flex flex-col flex-1 overflow-hidden min-h-0 relative">
            <!-- Editor Area -->
            <div class="flex flex-1 flex-col overflow-hidden min-h-0">
              ${showExplorer
                ? html`
                    <resizable-container
                      direction="horizontal"
                      class="flex-1"
                      .initialSize=${this.sidebarWidth}
                      .minSize=${150}
                      .maxSize=${600}
                      @size-change=${(e: CustomEvent<{ size: number }>) => {
                        this.sidebarWidth = e.detail.size;
                      }}
                    >
                      <div slot="first" class="h-full w-full">
                        <project-explorer
                          class="flex flex-col overflow-hidden bg-[#f7f7f7] border-r border-[#c7c7c7] h-full"
                          style="width: ${this.sidebarWidth}px;"
                          .projectPath=${this.projectPath}
                          .selectedPath=${this.activeFilePath}
                          @file-selected=${this.handleFileSelect}
                          @open-folder=${() =>
                            document.dispatchEvent(new CustomEvent("open-folder"))}
                        >
                        </project-explorer>
                      </div>
                      <div
                        slot="second"
                        class="flex flex-col overflow-hidden min-w-0 bg-white w-full h-full"
                      >
                        <!-- Tab Bar -->
                        ${this.tabs.length > 0
                          ? html`
                              <tab-bar
                                class="h-[35px] shrink-0"
                                .tabs=${this.tabs}
                                .activeTab=${this.activeTabId}
                                @tab-select=${this.handleTabSelect}
                                @tab-close=${this.handleTabClose}
                                @tab-pin-toggle=${this.handleTabPinToggle}
                              >
                              </tab-bar>
                            `
                          : ""}
                        <!-- Editor Pane -->
                        <editor-pane
                          id="editor"
                          class="flex-1 flex flex-col overflow-hidden"
                          .tabs=${this.tabs}
                          .activeTabId=${this.activeTabId}
                          @folder-opened=${this.handleFolderOpened}
                          @content-changed=${this.handleContentChanged}
                          @open-folder=${() =>
                            document.dispatchEvent(new CustomEvent("open-folder"))}
                          @quick-search=${() =>
                            document.dispatchEvent(new CustomEvent("quick-search"))}
                        >
                        </editor-pane>
                      </div>
                    </resizable-container>
                  `
                : html`
                    <!-- Editor only (explorer hidden or single-file mode) -->
                    <div
                      class="flex flex-col flex-1 overflow-hidden bg-white h-full w-full"
                    >
                      ${this.tabs.length > 0
                        ? html`
                            <tab-bar
                              class="h-[35px] shrink-0"
                              .tabs=${this.tabs}
                              .activeTab=${this.activeTabId}
                              @tab-select=${this.handleTabSelect}
                              @tab-close=${this.handleTabClose}
                              @tab-pin-toggle=${this.handleTabPinToggle}
                            >
                            </tab-bar>
                          `
                        : ""}
                      <editor-pane
                        id="editor"
                        class="flex-1 flex flex-col overflow-hidden"
                        .tabs=${this.tabs}
                        .activeTabId=${this.activeTabId}
                        @folder-opened=${this.handleFolderOpened}
                        @content-changed=${this.handleContentChanged}
                        @open-folder=${() =>
                          document.dispatchEvent(new CustomEvent("open-folder"))}
                        @quick-search=${() =>
                          document.dispatchEvent(new CustomEvent("quick-search"))}
                      >
                      </editor-pane>
                    </div>
                  `}
            </div>

            <!-- Terminal Area (resizable) + Resize Handle -->
            ${showTerminal
              ? html`
                  <!-- Terminal container with absolute resize handle -->
                  <div
                    class="relative shrink-0 border-t border-[#c7c7c7]"
                    style="height: ${this.terminalHeight}px;">
                    <!-- Resize handle - absolutely positioned at top -->
                    <div
                      class="absolute top-0 left-0 right-0 h-[6px] cursor-row-resize z-10 flex items-center justify-center"
                      @mousedown=${this.handleTerminalResizeStart}>
                    </div>
                    <!-- Terminal content -->
                    <div class="w-full h-full overflow-hidden" style="touch-action: auto; -webkit-overflow-scrolling: touch;">
                      <terminal-pane
                        .terminalCreated=${this.terminalCreated}
                        .projectPath=${this.projectPath}
                        @terminal-create=${() => (this.terminalCreated = true)}
                        @terminal-close=${() => {
                          this.terminalCreated = false;
                          this.terminalVisible = false;
                        }}>
                      </terminal-pane>
                    </div>
                  </div>
                `
              : ''}

            <!-- Status Bar (fixed at bottom) -->
            <status-bar
              class="shrink-0"
              .terminalVisible=${showTerminal}
              @toggle-terminal=${() => this.toggleTerminal()}>
            </status-bar>
          </div>
        </div>

        <!-- Search Overlay -->
        <search-overlay
          .isOpen=${false}
          .projectPath=${this.projectPath}
          @file-selected=${this.handleFileSelect}
        >
        </search-overlay>
      </div>
    `;
  }
}
