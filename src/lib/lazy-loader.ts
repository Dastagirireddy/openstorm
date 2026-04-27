/**
 * Lazy Loader for Heavy Components
 *
 * Provides async functions to load components on demand,
 * reducing initial bundle size and improving startup time.
 */

let terminalPaneLoaded = false;
let searchOverlayLoaded = false;
let settingsPanelLoaded = false;
let gitPanelLoaded = false;
let commitPanelLoaded = false;
let pullRequestsPanelLoaded = false;
let appConsolePanelLoaded = false;
let debugPanelLoaded = false;
let debugToolbarLoaded = false;
let runToolbarLoaded = false;
let templatePickerLoaded = false;

export async function loadTerminalPane(): Promise<void> {
  if (!terminalPaneLoaded) {
    await import("../components/terminal/terminal-pane.js");
    terminalPaneLoaded = true;
  }
}

export async function loadSearchOverlay(): Promise<void> {
  if (!searchOverlayLoaded) {
    await import("../components/search-overlay.js");
    searchOverlayLoaded = true;
  }
}

export async function loadSettingsPanel(): Promise<void> {
  if (!settingsPanelLoaded) {
    await import("../components/settings-panel.js");
    settingsPanelLoaded = true;
  }
}

export async function loadGitPanel(): Promise<void> {
  if (!gitPanelLoaded) {
    await import("../components/git-panel.js");
    gitPanelLoaded = true;
  }
}

export async function loadCommitPanel(): Promise<void> {
  if (!commitPanelLoaded) {
    await import("../components/commit-panel.js");
    commitPanelLoaded = true;
  }
}

export async function loadPullRequestsPanel(): Promise<void> {
  if (!pullRequestsPanelLoaded) {
    await import("../components/pull-requests-panel.js");
    pullRequestsPanelLoaded = true;
  }
}

export async function loadAppConsolePanel(): Promise<void> {
  if (!appConsolePanelLoaded) {
    await import("../components/app-console-panel.js");
    appConsolePanelLoaded = true;
  }
}

export async function loadDebugPanel(): Promise<void> {
  if (!debugPanelLoaded) {
    await import("../components/debug-panel.js");
    debugPanelLoaded = true;
  }
}

export async function loadDebugToolbar(): Promise<void> {
  if (!debugToolbarLoaded) {
    await import("../components/debug-toolbar.js");
    debugToolbarLoaded = true;
  }
}

export async function loadRunToolbar(): Promise<void> {
  if (!runToolbarLoaded) {
    await import("../components/run-toolbar.js");
    runToolbarLoaded = true;
  }
}

export async function loadTemplatePicker(): Promise<void> {
  if (!templatePickerLoaded) {
    await import("../components/template-picker.js");
    templatePickerLoaded = true;
  }
}
