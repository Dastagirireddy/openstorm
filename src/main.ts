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

  connectedCallback(): void {
    super.connectedCallback();
    this.setupKeyboardShortcuts();
    this.setupOpenFolderHandler();
    this.setupFileChangeHandler();
    this.setupAutoSaveHandler();
    this.setupCursorPositionHandler();
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

  private setupCursorPositionHandler(): void {
    // Listen for cursor position updates from editor
    document.addEventListener("cursor-position", ((e: CustomEvent) => {
      const { line, column } = e.detail;
      const statusBar = document.querySelector("status-bar") as HTMLElement & {
        setCursorPosition: (line: number, col: number) => void;
      };
      if (statusBar?.setCursorPosition) {
        statusBar.setCursorPosition(line, column);
      }
    }) as EventListener);
  }

  private setupOpenFolderHandler(): void {
    document.addEventListener("open-folder", this.handleOpenFolder);
  }

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
    });
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
      this.saveStatus = existingTab.modified ? "unsaved" : "saved";
      this.tabs = this.tabs.map((t) =>
        t.id === existingTab.id ? { ...t, lastUsed: Date.now() } : t,
      );
      document.dispatchEvent(
        new CustomEvent("open-file", {
          detail: { path, content: existingTab.content },
          bubbles: true,
          composed: true,
        }),
      );
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
      this.saveStatus = "saved";
      this.enforceTabLimit();

      document.dispatchEvent(
        new CustomEvent("open-file", {
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
    e: CustomEvent<{ path: string; content: string }>,
  ): void => {
    const { path, content } = e.detail;
    const tabIndex = this.tabs.findIndex((t) => t.path === path);

    if (tabIndex !== -1) {
      this.tabs = this.tabs.map((t, i) =>
        i === tabIndex ? { ...t, content, modified: true } : t,
      );
    }

    this.saveStatus = "unsaved";
  };

  private handleTabSelect = (e: CustomEvent<{ tabId: string }>): void => {
    const { tabId } = e.detail;
    this.activeTabId = tabId;
    const tab = this.tabs.find((t) => t.id === tabId);
    if (tab) {
      this.saveStatus = tab.modified ? "unsaved" : "saved";
      document.dispatchEvent(
        new CustomEvent("open-file", {
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
    } catch (error) {
      console.error("Failed to start file watcher:", error);
    }

    // Auto-create terminal when project is opened
    this.terminalCreated = true;
  };

  private renderWelcomeScreen(): ReturnType<typeof html> {
    return html`
      <div class="flex flex-col h-full items-center justify-center bg-white">
        <div class="flex flex-col items-center max-w-[500px] px-8">
          <!-- Logo -->
          <div class="mb-6">
            <os-brand-logo size="80"></os-brand-logo>
          </div>
          <div class="flex flex-col items-center mb-8">
            <h1 class="text-[32px] font-bold text-[#1a1a1a]">OpenStorm</h1>
            <p class="text-[13px] text-[#5a5a5a]">Enterprise-grade IDE</p>
          </div>

          <!-- Recent Projects -->
          <div class="w-full mb-8">
            <h2
              class="text-[11px] font-semibold text-[#5a5a5a] uppercase tracking-wide mb-3"
            >
              Recent Projects
            </h2>
            <div
              class="bg-[#f7f7f7] rounded-lg border border-[#e0e0e0] p-6 text-center"
            >
              <p class="text-[13px] text-[#8a8a8a]">No recent projects</p>
            </div>
          </div>

          <!-- Start Actions -->
          <div class="w-full">
            <h2
              class="text-[11px] font-semibold text-[#5a5a5a] uppercase tracking-wide mb-3"
            >
              Start
            </h2>
            <div class="flex flex-col gap-2">
              <div
                class="flex items-center gap-3 px-4 py-3.5 bg-[#f7f7f7] rounded-lg cursor-pointer transition-colors hover:bg-[#e8e8e8] hover:shadow-sm group border border-transparent hover:border-[#c7c7c7]"
                @click=${this.handleOpenFolder}
              >
                <div
                  class="w-10 h-10 rounded-lg bg-[#e8e8e8] flex items-center justify-center flex-shrink-0 group-hover:bg-white transition-colors"
                >
                  <svg
                    class="w-5 h-5 text-[#5a5a5a] group-hover:text-[#3592c4]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path
                      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                    />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[14px] font-medium text-[#1a1a1a]">
                    Open Folder
                  </div>
                  <div class="text-[12px] text-[#8a8a8a]">
                    Open an existing project folder
                  </div>
                </div>
              </div>

              <div
                class="flex items-center gap-3 px-4 py-3.5 bg-[#f7f7f7] rounded-lg cursor-pointer transition-colors hover:bg-[#e8e8e8] hover:shadow-sm group border border-transparent hover:border-[#c7c7c7]"
                @click=${() => {
                  this.activeActivity = "explorer";
                  this.handleOpenFolder();
                }}
              >
                <div
                  class="w-10 h-10 rounded-lg bg-[#e8e8e8] flex items-center justify-center flex-shrink-0 group-hover:bg-white transition-colors"
                >
                  <svg
                    class="w-5 h-5 text-[#5a5a5a] group-hover:text-[#3592c4]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path
                      d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
                    />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[14px] font-medium text-[#1a1a1a]">
                    Open File
                  </div>
                  <div class="text-[12px] text-[#8a8a8a]">
                    Open a single file
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private closeTab(tabId: string): void {
    const tabIndex = this.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const tabToClose = this.tabs[tabIndex];
    this.tabs = this.tabs.filter((t) => t.id !== tabId);

    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        const newActiveIndex = Math.min(tabIndex, this.tabs.length - 1);
        this.activeTabId = this.tabs[newActiveIndex].id;
        document.dispatchEvent(
          new CustomEvent("open-file", {
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
    // Show full-window welcome screen when no project is open
    if (!this.projectPath) {
      return html`
        <div class="flex flex-col h-screen w-screen overflow-hidden bg-white">
          ${this.renderWelcomeScreen()}
        </div>
      `;
    }

    // Show full IDE when project is open
    const projectName = this.projectPath.split("/").pop() || "OpenStorm";
    const activeFile =
      this.tabs.find((t) => t.id === this.activeTabId)?.path || "";

    return html`
      <div class="flex flex-col h-screen w-screen overflow-hidden bg-white">
        <!-- Header -->
        <app-header
          class="shrink-0"
          .projectPath=${this.projectPath}
          .activeFile=${activeFile}
          .saveStatus=${this.saveStatus === "unsaved" ? "unsaved" : "saved"}
        >
        </app-header>

        <!-- Main Content Area (Editor + Terminal) -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Activity Bar -->
          <activity-bar
            class="shrink-0"
            .activeItem=${this.activeActivity}
            @item-change=${(e: CustomEvent<{ item: ActivityItem }>) => {
              this.activeActivity = e.detail.item;
            }}
          >
          </activity-bar>

          <!-- Editor + Terminal Column -->
          <div class="flex flex-col flex-1 overflow-hidden min-h-0 relative">
            <!-- Editor Area -->
            <div class="flex flex-1 flex-col overflow-hidden min-h-0">
              ${this.activeActivity === "explorer"
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
                    <!-- Editor only when explorer is hidden -->
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
            ${this.terminalVisible
              ? html`
                  <!-- Terminal container with absolute resize handle -->
                  <div
                    class="relative shrink-0 border-t border-[#c7c7c7]"
                    style="height: ${this.terminalHeight}px;">
                    <!-- Resize handle - absolutely positioned at top -->
                    <div
                      class="absolute top-0 left-0 right-0 h-[6px] cursor-row-resize z-10 flex items-center justify-center"
                      @mousedown=${this.handleTerminalResizeStart}>
                      <div class="h-[1px] w-8 bg-[#d0d7de] hover:bg-[#0969da] transition-colors"></div>
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
              .terminalVisible=${this.terminalVisible}
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
