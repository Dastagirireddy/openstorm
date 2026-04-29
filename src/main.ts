import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getGitBranch } from "./lib/git/git-status.js";
import { TailwindElement } from "./tailwind-element.js";
import { dispatch } from "./lib/types/events.js";
import {
  loadTerminalPane,
  loadSearchOverlay,
  loadSettingsPanel,
  loadGitPanel,
  loadCommitPanel,
  loadPullRequestsPanel,
  loadAppConsolePanel,
  loadDebugPanel,
  loadDebugToolbar,
  loadRunToolbar,
} from "./lib/utils/lazy-loader.js";

// Initialize theme service early for CSS variable injection
import { ThemeService } from "./lib/services/theme-service.js";
ThemeService.getInstance().initialize();

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
import * as lucide from '@iconify-json/lucide/icons.json';
addCollection(devicon);
addCollection(vscodeIcons);
addCollection(tabler);
addCollection(catppuccin);
addCollection(fileIcons);
addCollection(logos);
addCollection(mdi);
addCollection(streamlineFlexColor);
addCollection(lucide);

// Core components (always loaded)
import "./components/header/app-header.js";
import "./components/header/breadcrumb.js";
import "./components/navigation/activity-bar.js";
import "./components/explorer/project-explorer.js";
import "./components/editor/pane.js";
import "./components/editor/editor-tab-bar.js";
import "./components/layout/status-bar.js";
import "./components/layout/icon.js";
import "./components/layout/resizable-container.js";
import "./components/dialogs/dialog.js";
import "./components/file-type-picker.js";
import "./components/dialogs/file-create-dialog.js";
import "./components/dialogs/context-menu.js";
import "./components/dialogs/rename-dialog.js";
import "./components/dialogs/delete-dialog.js";
import "./components/welcome-screen.js";
import "./components/overlays/theme-palette.js";
import "./components/layout/hover-tooltip.js";
import "./components/git/git-not-found-banner.js";

// Lazy-loaded components (loaded on demand via lazy-loader.ts)
// Terminal, Search, Settings, Git, Commit, Pull Requests, App Console, Debug panels

import type { EditorTab, SaveStatus, ActivityItem } from "./lib/types/file-types.js";

@customElement("openstorm-app")
export class OpenStormApp extends TailwindElement() {
  @state() private projectPath = "";
  @state() private tabs: EditorTab[] = [];
  @state() private activeTabId = "";
  @state() private saveStatus: SaveStatus = "saved";
  @state() private tabLimit = 10;
  @state() private activeActivity: ActivityItem = "explorer";
  @state() private terminalCreated = false;
  @state() private sidebarWidth = 250;
  @state() private terminalHeight = 200;
  @state() private isTerminalResizing = false;
  @state() private terminalResizeStartY = 0;
  @state() private terminalResizeStartHeight = 0;
  @state() private activeFilePath = '';
  @state() private debugSidebarVisible = false;
  @state() private isDebugging = false;
  @state() private debugPanelHeight = 250;
  @state() private appConsoleVisible = false;
  @state() private appConsoleHeight = 200;
  @state() private gitPanelVisible = false;
  @state() private activeStatusBarPanel: 'terminal' | 'app-console' | null = 'terminal';
  @state() private gitBranch = 'main';
  @state() private gitPanelHeight = 300;
  @state() private isGitPanelResizing = false;
  @state() private gitPanelResizeStartY = 0;
  @state() private gitPanelResizeStartHeight = 0;
  @state() private commitPanelVisible = false;
  @state() private commitPanelWidth = 400;
  @state() private blameVisible = false;
  @state() private showTerminalNotification = false;
  @state() private showConsoleNotification = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.setupKeyboardShortcuts();
    this.setupOpenFolderHandler();
    this.setupFileChangeHandler();
    this.setupAutoSaveHandler();
    this.setupMenuHandler();
    this.setupQuickSearchHandler();
    this.setupBlameHandler();
  }

  private setupQuickSearchHandler(): void {
    document.addEventListener("quick-search", () => {
      loadSearchOverlay();
    });
  }

  private setupBlameHandler(): void {
    // Event listener not needed - menu handler calls toggleBlame() directly
    // which dispatches toggle-blame for editor-pane to receive
  }

  // Lazy-load components before they're displayed
  override willUpdate(changedProperties: Map<string, unknown>): void {
    super.willUpdate(changedProperties);

    // Pre-load terminal when panel is about to be shown
    if (changedProperties.has("activeStatusBarPanel") && this.activeStatusBarPanel === "terminal") {
      loadTerminalPane();
    }

    // Pre-load settings panel
    if (changedProperties.has("activeActivity") && this.activeActivity === "settings") {
      loadSettingsPanel();
    }

    // Pre-load git panel
    if (changedProperties.has("gitPanelVisible") && this.gitPanelVisible) {
      loadGitPanel();
    }

    // Pre-load commit panel
    if (changedProperties.has("activeActivity") && (this.activeActivity === "commits" || this.activeActivity === "pull-requests")) {
      loadCommitPanel();
      if (this.activeActivity === "pull-requests") {
        loadPullRequestsPanel();
      }
    }

    // Pre-load app console
    if (changedProperties.has("activeStatusBarPanel") && this.activeStatusBarPanel === "app-console") {
      loadAppConsolePanel();
    }

    // Pre-load debug panel and toolbar
    if (changedProperties.has("isDebugging") && this.isDebugging) {
      loadDebugPanel();
      loadDebugToolbar();
      loadRunToolbar();
    }

    // Listen for theme changes to trigger re-render
    document.addEventListener('theme-changed', () => {
      this.requestUpdate();
    });

    // Terminal will be auto-created when project is opened
  }

  private async setupMenuHandler(): Promise<void> {
    listen("menu-item-clicked", (event: any) => {
      const menuId = event.payload;
      console.log("[Menu] Menu item clicked:", menuId);

      switch (menuId) {
        case "theme-picker":
          dispatch("open-theme-palette");
          break;
        case "toggle-terminal":
          dispatch("toggle-terminal");
          break;
        case "toggle-debug":
          dispatch("set-active-activity", { activity: "debug" });
          break;
        case "new-file":
          dispatch("new-file");
          break;
        case "open-file":
          dispatch("open-file-dialog");
          break;
        case "save":
          dispatch("save-file");
          break;
        case "find":
          dispatch("quick-search");
          break;
        // Git menu handlers
        case "git-blame":
          // Call toggleBlame directly to avoid loop (setupBlameHandler also listens for toggle-blame)
          this.toggleBlame();
          break;
        case "git-history":
          dispatch("toggle-git-log", { visible: true });
          break;
        case "git-pull":
          dispatch("git-pull");
          break;
        case "git-push":
          dispatch("git-push");
          break;
        case "git-commit":
          dispatch("set-active-activity", { activity: "commits" });
          break;
        case "git-branch":
          dispatch("git-branch");
          break;
        case "git-rollback":
          dispatch("git-rollback");
          break;
        // Add more menu handlers as needed
      }
    }).catch(console.error);
  }

  private async setupFileChangeHandler(): Promise<void> {
    // Listen for file system changes from backend
    listen("file-change", (event: any) => {
      dispatch("refresh-explorer", event.payload);
    }).catch(console.error);

    // Listen for git repository changes (when .git is created/removed)
    listen("git-repo-changed", (event: any) => {
      dispatch("git-refresh");
    }).catch(console.error);

    // Listen for DAP debug events from backend
    listen("debug-initialized", () => {
      console.log("[DAP] debug-initialized event received");
      this.isDebugging = true;
      console.log("[DAP] isDebugging set to:", this.isDebugging);
      this.requestUpdate();
      dispatch("debug-session-started");
    }).catch(console.error);

    listen("debug-stopped", (event: any) => {
      console.log("[DAP] debug-stopped event received:", event.payload);
      this.requestUpdate();
      dispatch("debug-stopped", event.payload);
    }).catch(console.error);

    listen("debug-continued", () => {
      console.log("[DAP] debug-continued event received");
      this.requestUpdate();
      dispatch("debug-continued");
    }).catch(console.error);

    listen("debug-terminated", () => {
      console.log("[DAP] debug-terminated event received");
      this.isDebugging = false;
      this.requestUpdate();
      dispatch("debug-session-ended");
    }).catch(console.error);

    // Listen for close-settings event
    document.addEventListener("close-settings", () => {
      this.activeActivity = "explorer";
    });

    // Listen for status bar tab clicks
    document.addEventListener("statusbar-tab-click", (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string }>;
      const tab = customEvent.detail.tab;

      if (tab === 'git') {
        this.gitPanelVisible = !this.gitPanelVisible;
        // Close terminal/console when opening git panel
        if (this.gitPanelVisible && this.activeStatusBarPanel !== null) {
          this.activeStatusBarPanel = null;
        }
        dispatch('toggle-git-log', { visible: this.gitPanelVisible });
      } else if (tab === 'terminal' || tab === 'app-console') {
        // Toggle: if already active, close it; otherwise switch to it
        this.activeStatusBarPanel = this.activeStatusBarPanel === tab ? null : tab;

        // Close git panel when opening terminal/console
        if (this.activeStatusBarPanel !== null && this.gitPanelVisible) {
          this.gitPanelVisible = false;
          dispatch('toggle-git-log', { visible: false });
        }

        // Clear notification dots
        if (tab === 'app-console') this.showConsoleNotification = false;
        if (tab === 'terminal') this.showTerminalNotification = false;
      }

      this.requestUpdate();
    });

    // Listen for output notifications
    document.addEventListener("app-console-output", () => {
      this.showConsoleNotification = true;
      // Auto-switch to app-console panel
      this.activeStatusBarPanel = 'app-console';
      this.requestUpdate();
    });

    // Listen for terminal output (for notification dot)
    listen('terminal-output', () => {
      if (this.activeStatusBarPanel !== 'terminal') {
        this.showTerminalNotification = true;
        this.requestUpdate();
      }
    }).catch(console.error);

    // Also listen for direct debug-session-ended events from backend
    listen("debug-session-ended", (event) => {
      console.log("[main.ts] debug-session-ended event received from backend!", event);
      this.isDebugging = false;
      this.requestUpdate();
      dispatch("debug-session-ended");
    }).catch(console.error);

    // Handle debug-exited event (when process exits)
    listen("debug-exited", () => {
      console.log("[main.ts] debug-exited event received");
      this.isDebugging = false;
      this.requestUpdate();
      dispatch("debug-session-ended");
    }).catch(console.error);

    listen("debug-output", (event: any) => {
      console.log("[DAP] debug-output event received:", event.payload);
      dispatch("debug-output", event.payload);
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
    // Handle go-to-location events from Cmd+Click navigation
    document.addEventListener("go-to-location", this.handleGoToLocation);
  }

  private handleLocateFile = (): void => {
    if (this.activeFilePath) {
      dispatch("locate-file-external", { path: this.activeFilePath });
    }
  };

  private handleGoToLocation = async (e: CustomEvent<{ uri: string; line: number; column: number }>): Promise<void> => {
    const { uri, line, column } = e.detail;

    // Convert file:// URI to local path
    const targetPath = uri.replace('file://', '');

    console.log('[go-to-location] Navigating to:', targetPath, `line ${line + 1}, col ${column + 1}`);

    // Check if target file is already open
    const existingTab = this.tabs.find(t => t.path === targetPath);

    if (existingTab) {
      // Switch to existing tab
      this.activeTabId = existingTab.id;
      this.activeFilePath = targetPath;
      this.saveStatus = existingTab.modified ? "unsaved" : "saved";
      this.tabs = this.tabs.map(t =>
        t.id === existingTab.id ? { ...t, lastUsed: Date.now() } : t,
      );
    } else {
      // Open the file
      try {
        const content = await invoke("read_file", { path: targetPath });
        const name = targetPath.split("/").pop() || "";

        const newTab: EditorTab = {
          id: targetPath,
          name,
          path: targetPath,
          modified: false,
          content,
          lastUsed: Date.now(),
        };
        this.tabs = [...this.tabs, newTab];
        this.activeTabId = targetPath;
        this.activeFilePath = targetPath;
        this.saveStatus = "saved";
        this.enforceTabLimit();

        // Dispatch event for editor-pane to update its view
        dispatch("open-file-external", { path: targetPath, content });
      } catch (error) {
        console.error("Failed to open target file:", error);
        return;
      }
    }

    // Wait for editor to be ready, then position cursor at definition
    // Use requestAnimationFrame to ensure the editor has rendered
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Dispatch cursor position for the editor to restore
        dispatch("restore-cursor-position", { line: line + 1, column: column + 1 });
      });
    });
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

    dispatch("project-opened", { path: this.projectPath });
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

        dispatch("project-opened", { path: this.projectPath });
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
        dispatch("open-file-external", { path: filePath, content });
      }
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  };

  private setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        dispatch("quick-search");
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
    dispatch('format-code');
  }

  private async saveActiveFile(): Promise<void> {
    // Delegate to editor-pane which has the content
    const activeTab = this.tabs.find((t) => t.id === this.activeTabId);
    if (!activeTab) return;

    this.saveStatus = "saving";
    try {
      await invoke("write_file", {
        path: activeTab.path,
        content: activeTab.content,
      });
      this.saveStatus = "saved";
      this.tabs = this.tabs.map((t) =>
        t.path === activeTab.path ? { ...t, modified: false } : t,
      );
      // Notify editor-pane to update saved content
      dispatch('file-saved', { path: activeTab.path, content: activeTab.content });
    } catch (error) {
      console.error("Failed to save file:", error);
      this.saveStatus = "error";
    }
  }

  private toggleTerminal(): void {
    // Toggle: if terminal is active, close it; otherwise open it
    this.activeStatusBarPanel = this.activeStatusBarPanel === 'terminal' ? null : 'terminal';
  }

  private toggleAppConsole(): void {
    // Toggle app-console panel
    this.activeStatusBarPanel = this.activeStatusBarPanel === 'app-console' ? null : 'app-console';
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

  private handleGitPanelResizeStart = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    this.isGitPanelResizing = true;
    this.gitPanelResizeStartY = e.clientY;
    this.gitPanelResizeStartHeight = this.gitPanelHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isGitPanelResizing) return;
      const deltaY = this.gitPanelResizeStartY - moveEvent.clientY;
      let newHeight = this.gitPanelResizeStartHeight + deltaY;
      newHeight = Math.max(150, Math.min(600, newHeight));
      this.gitPanelHeight = newHeight;
    };

    const handleMouseUp = () => {
      this.isGitPanelResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  private toggleActivityBar(): void {
    const wasExplorer = this.activeActivity === "explorer";
    this.activeActivity = wasExplorer ? ("" as ActivityItem) : "explorer";
  }

  private handleActivityChange = (e: CustomEvent<{ item: ActivityItem }>): void => {
    const newItem = e.detail.item;

    if (newItem === 'commits') {
      this.commitPanelVisible = true;
      this.gitPanelVisible = false;
      this.activeActivity = 'commits';
    } else if (newItem === 'pull-requests') {
      this.commitPanelVisible = true;
      this.gitPanelVisible = false;
      this.activeActivity = 'pull-requests';
    } else if (newItem === 'explorer') {
      this.gitPanelVisible = false;
      this.commitPanelVisible = false;
      this.activeActivity = 'explorer';
    } else if (newItem === 'search') {
      this.gitPanelVisible = false;
      this.commitPanelVisible = false;
      this.activeActivity = 'search';
    } else {
      this.activeActivity = newItem;
      this.gitPanelVisible = false;
      this.commitPanelVisible = false;
    }
  };

  private handleCloseSettings = (): void => {
    this.activeActivity = "explorer";
  };

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
      dispatch("open-file-external", { path, content });
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
      dispatch("open-file-external", { path: tab.path, content: tab.content });
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
      await invoke("start_watching", { path: this.projectPath });
      console.log("File watcher started for:", this.projectPath);

      // Initialize LSP connection pool
      await invoke("initialize_lsp_pool", { rootPath: this.projectPath });
      console.log("LSP connection pool initialized for:", this.projectPath);

      // Dispatch project-opened event for run-toolbar to detect configurations
      dispatch("project-opened", { path: this.projectPath });

      // Fetch git branch
      try {
        this.gitBranch = await getGitBranch(this.projectPath);
      } catch (e) {
        console.error('Failed to get git branch:', e);
      }
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
        dispatch("open-file-external", {
          path: this.tabs[newActiveIndex].path,
          content: this.tabs[newActiveIndex].content,
        });
      } else {
        this.activeTabId = "";
        dispatch("clear-editor");
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
        <div class="flex flex-col h-screen w-screen overflow-hidden" style="background-color: var(--app-bg);">
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
    const showSettings = !isSingleFileMode && this.activeActivity === "settings";
    const showCommitPanel = !isSingleFileMode && (this.activeActivity === 'commits' || this.activeActivity === 'pull-requests');
    const showGitPanel = !isSingleFileMode && this.gitPanelVisible;
    const showTerminal = !isSingleFileMode && !this.isDebugging && !showGitPanel && this.activeStatusBarPanel === 'terminal';
    const showDebugPanel = this.isDebugging;
    const showAppConsole = !isSingleFileMode && this.activeStatusBarPanel === 'app-console';

    return html`
      <div class="flex flex-col h-screen w-screen overflow-hidden" style="background-color: var(--app-bg); color: var(--app-foreground);">
        <!-- Header -->
        <app-header
          class="shrink-0"
          .projectPath=${this.projectPath}
          .activeFile=${activeFile}
          .saveStatus=${this.saveStatus === "unsaved" ? "unsaved" : "saved"}
          .isSingleFileMode=${isSingleFileMode}
        >
        </app-header>

        <!-- Git Not Found Banner -->
        <git-not-found-banner></git-not-found-banner>

        <!-- Main Content Area (Editor + Terminal) -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Activity Bar (hidden in single-file mode) -->
          ${!isSingleFileMode
            ? html`
                <activity-bar
                  class="shrink-0"
                  .activeItem=${this.activeActivity}
                  @item-change=${this.handleActivityChange}
                >
                </activity-bar>
              `
            : ""}

          <!-- Editor + Terminal Column -->
          <div class="flex flex-col flex-1 overflow-hidden min-h-0 relative">
            <!-- Editor Area -->
            <div class="flex flex-1 flex-col overflow-hidden min-h-0">
              ${showSettings
                ? html`
                    <settings-panel class="flex-1"></settings-panel>
                  `
                : showExplorer
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
                          class="flex flex-col overflow-hidden border-r h-full"
                          style="width: ${this.sidebarWidth}px; background-color: var(--activitybar-background); border-color: var(--activitybar-border);"
                          .projectPath=${this.projectPath}
                          .selectedPath=${this.activeFilePath}
                          @file-selected=${this.handleFileSelect}
                          @open-folder=${() => dispatch("open-folder")}
                        >
                        </project-explorer>
                      </div>
                      <div
                        slot="second"
                        class="flex flex-col overflow-hidden min-w-0 w-full h-full"
                        style="background-color: var(--app-bg);"
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
                          @open-folder=${() => dispatch("open-folder")}
                          @quick-search=${() => dispatch("quick-search")}
                        >
                        </editor-pane>
                      </div>
                    </resizable-container>
                  `
                : showCommitPanel
                ? html`
                    <resizable-container
                      direction="horizontal"
                      class="flex-1"
                      .initialSize=${this.commitPanelWidth}
                      .minSize=${200}
                      .maxSize=${600}
                      @size-change=${(e: CustomEvent<{ size: number }>) => {
                        this.commitPanelWidth = e.detail.size;
                      }}
                    >
                      <div slot="first" class="h-full w-full">
                        ${this.activeActivity === 'pull-requests'
                          ? html`
                              <pull-requests-panel
                                class="flex flex-col overflow-hidden border-r h-full w-full"
                                style="background-color: var(--activitybar-background); border-color: var(--activitybar-border);"
                                .projectPath=${this.projectPath}>
                              </pull-requests-panel>
                            `
                          : html`
                              <commit-panel
                                class="flex flex-col overflow-hidden border-r h-full w-full"
                                style="background-color: var(--activitybar-background); border-color: var(--activitybar-border);"
                                .projectPath=${this.projectPath}>
                              </commit-panel>
                            `
                        }
                      </div>
                      <div
                        slot="second"
                        class="flex flex-col overflow-hidden min-w-0 w-full h-full"
                        style="background-color: var(--app-bg);"
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
                          @open-folder=${() => dispatch("open-folder")}
                          @quick-search=${() => dispatch("quick-search")}
                        >
                        </editor-pane>
                      </div>
                    </resizable-container>
                  `
                : html`
                    <!-- Editor only (explorer hidden or single-file mode) -->
                    <div
                      class="flex flex-col flex-1 overflow-hidden h-full w-full"
                      style="background-color: var(--app-bg);"
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
                        @open-folder=${() => dispatch("open-folder")}
                        @quick-search=${() => dispatch("quick-search")}
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
                    class="relative shrink-0 border-t border-[var(--app-border)]"
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
                          this.activeStatusBarPanel = null;
                        }}>
                      </terminal-pane>
                    </div>
                  </div>
                `
              : ''}

            <!-- Git Panel (Famous-style bottom panel - Repository/Log view) -->
            ${showGitPanel
              ? html`
                  <!-- Git panel container with resize handle -->
                  <div
                    class="relative shrink-0 border-t border-[var(--app-border)]"
                    style="height: ${this.gitPanelHeight}px;">
                    <!-- Resize handle at top -->
                    <div
                      class="absolute top-0 left-0 right-0 h-[6px] cursor-row-resize z-10 flex items-center justify-center"
                      @mousedown=${(e: MouseEvent) => this.handleGitPanelResizeStart(e)}>
                    </div>
                    <!-- Git panel content -->
                    <git-panel
                      .projectPath=${this.projectPath}
                      .height=${this.gitPanelHeight}
                      style="background-color: var(--app-bg);">
                    </git-panel>
                  </div>
                `
              : ''}

            <!-- Debug Panel (replaces terminal when debugging) -->
            ${showDebugPanel
              ? html`
                  <!-- Debug panel container -->
                  <div
                    class="shrink-0 border-t border-[var(--app-border)]"
                    style="height: ${this.debugPanelHeight}px;">
                    <debug-panel></debug-panel>
                  </div>
                `
              : ''}

            <!-- App Console Panel (persistent output from Run and Debug) -->
            ${showAppConsole
              ? html`
                  <!-- App console container -->
                  <div
                    class="shrink-0 border-t border-[var(--app-border)]"
                    style="height: ${this.appConsoleHeight}px;">
                    <app-console-panel></app-console-panel>
                  </div>
                `
              : ''}

            <!-- Status Bar (fixed at bottom) -->
            <status-bar
              class="shrink-0"
              .branch=${this.gitBranch}
              .activePanel=${this.activeStatusBarPanel}
              .gitPanelVisible=${this.gitPanelVisible}
              .blameVisible=${this.blameVisible}
              .showTerminalNotification=${this.showTerminalNotification}
              .showConsoleNotification=${this.showConsoleNotification}>
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

        <!-- Theme Palette -->
        <theme-palette></theme-palette>

        <!-- Hover Tooltip -->
        <hover-tooltip></hover-tooltip>

        <!-- File History Overlay (commit diff dialog) -->
        <file-history-overlay></file-history-overlay>
      </div>
    `;
  }

  private toggleBlame(): void {
    this.blameVisible = !this.blameVisible;
    // Dispatch event with the new state to editor-pane
    dispatch("toggle-blame", { visible: this.blameVisible });
  }
}
