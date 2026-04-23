/**
 * Theme Service - Centralized theme management
 *
 * Provides programmatic access to theme variables and supports:
 * - Dynamic theme switching
 * - Plugin-provided themes
 * - Per-component theme overrides
 * - Theme persistence
 */

export interface ThemeDefinition {
  id: string;
  name: string;
  colors: ThemeColors;
}

export interface ThemeColors {
  // Application
  'app-bg': string;
  'app-foreground': string;
  'app-disabled-foreground': string;
  'app-border': string;
  'app-focus-border': string;
  'app-hover-background': string;
  'app-selection-background': string;
  'app-input-background': string;
  'app-input-foreground': string;
  'app-input-border': string;
  'app-input-placeholder': string;
  'app-button-background': string;
  'app-button-foreground': string;
  'app-button-hover': string;
  'app-toolbar-hover': string;
  'app-toolbar-active': string;
  'app-tab-active': string;
  'app-tab-inactive': string;
  'app-tab-border': string;
  'app-tab-active-border': string;
  'app-scrollbar': string;
  'app-scrollbar-hover': string;

  // Debug panel
  'app-continue-color': string;
  'app-step-color': string;
  'app-stop-color': string;
  'app-pause-color': string;
  'app-status-running': string;
  'app-status-stopped': string;
  'app-tab-variables': string;
  'app-tab-watch': string;
  'app-tab-callstack': string;
  'app-tab-threads': string;
  'app-tab-breakpoints': string;
  'app-tab-console': string;
  'app-running-state': string;
  'app-stopped-state': string;
  'app-exited-state': string;
  'app-unknown-state': string;
  'app-error-background': string;
  'app-pinned-background': string;
  'app-toast-background': string;

  // Syntax highlighting
  'app-keyword': string;
  'app-type': string;
  'app-string': string;
  'app-number': string;
  'app-boolean': string;
  'app-null': string;

  // Console
  'app-console-info': string;
  'app-console-warning': string;
  'app-console-error': string;
  'app-console-success': string;

  // Breakpoints
  'app-breakpoint': string;
  'app-breakpoint-disabled': string;
  'app-breakpoint-conditional': string;

  // Editor
  'editor-background': string;
  'editor-gutter-background': string;
  'editor-gutter-border': string;
  'editor-active-line': string;
  'editor-selection': string;
  'editor-line-numbers': string;

  // File icons (IntelliJ-style)
  'file-rs': string;
  'file-go': string;
  'file-ts': string;
  'file-tsx': string;
  'file-js': string;
  'file-jsx': string;
  'file-json': string;
  'file-yaml': string;
  'file-toml': string;
  'file-css': string;
  'file-scss': string;
  'file-less': string;
  'file-html': string;
  'file-xml': string;
  'file-sql': string;
  'file-py': string;
  'file-java': string;
  'file-kt': string;
  'file-swift': string;
  'file-c': string;
  'file-cpp': string;
  'file-cs': string;
  'file-php': string;
  'file-rb': string;
  'file-sh': string;
  'file-md': string;
  'file-txt': string;
  'file-dockerfile': string;
  'file-gitignore': string;

  // Folder types (IntelliJ-style)
  'folder-build-color': string;
  'folder-build-bg': string;
  'folder-tmp-color': string;
  'folder-tmp-bg': string;
  'folder-node-modules-color': string;
  'folder-node-modules-bg': string;
  'folder-vcs-color': string;
  'folder-vcs-bg': string;
  'folder-ide-color': string;
  'folder-ide-bg': string;

  // Project types
  'project-rust': string;
  'project-node': string;
  'project-python': string;
  'project-go': string;
  'project-java': string;
  'project-typescript': string;
  'project-react': string;
  'project-vue': string;
  'project-angular': string;
  'project-docker': string;
  'project-database': string;
  'project-generic': string;

  // Status bar
  'statusbar-background': string;
  'statusbar-foreground': string;
  'statusbar-hover-background': string;
  'statusbar-hover-foreground': string;
  'statusbar-border': string;

  // Activity bar
  'activitybar-background': string;
  'activitybar-border': string;
  'activitybar-active-background': string;
  'activitybar-inactive-foreground': string;
  'activitybar-active-foreground': string;

  // Terminal
  'terminal-background': string;
}

/**
 * Built-in theme definitions
 */
export const BUILTIN_THEMES: Record<string, ThemeDefinition> = {
  'light': {
    id: 'light',
    name: 'IntelliJ Light',
    colors: {
      // Application
      'app-bg': '#ffffff',
      'app-foreground': '#1a1a1a',
      'app-disabled-foreground': '#8a8a8a',
      'app-border': '#e5e7eb',
      'app-focus-border': '#6366f1',
      'app-hover-background': '#f3f4f6',
      'app-selection-background': '#e8e0f5',
      'app-input-background': '#ffffff',
      'app-input-foreground': '#1a1a1a',
      'app-input-border': '#d0d0d0',
      'app-input-placeholder': '#9ca3af',
      'app-button-background': '#6366f1',
      'app-button-foreground': '#ffffff',
      'app-button-hover': '#4f46e5',
      'app-toolbar-hover': '#e8e8e8',
      'app-toolbar-active': '#d0d0d0',
      'app-tab-active': '#ffffff',
      'app-tab-inactive': '#f3f4f6',
      'app-tab-border': '#e5e7eb',
      'app-tab-active-border': '#6366f1',
      'app-scrollbar': '#c1c1c1',
      'app-scrollbar-hover': '#a8a8a8',

      // Debug panel
      'app-continue-color': '#22c55e',
      'app-step-color': '#0078d4',
      'app-stop-color': '#f44336',
      'app-pause-color': '#d97706',
      'app-status-running': '#16825d',
      'app-status-stopped': '#d97706',
      'app-tab-variables': '#8b5cf6',
      'app-tab-watch': '#06b6d4',
      'app-tab-callstack': '#d97706',
      'app-tab-threads': '#ea580c',
      'app-tab-breakpoints': '#f44336',
      'app-tab-console': '#16825d',
      'app-running-state': '#22c55e',
      'app-stopped-state': '#d97706',
      'app-exited-state': '#6b7280',
      'app-unknown-state': '#9ca3af',
      'app-error-background': '#fef2f2',
      'app-pinned-background': '#fefce8',
      'app-toast-background': '#3c3c3c',

      // Syntax highlighting
      'app-keyword': '#0033b3',
      'app-type': '#00627a',
      'app-string': '#067d17',
      'app-number': '#1750eb',
      'app-boolean': '#0033b3',
      'app-null': '#808080',

      // Console
      'app-console-info': '#3c3c3c',
      'app-console-warning': '#cca700',
      'app-console-error': '#f44336',
      'app-console-success': '#16825d',

      // Breakpoints
      'app-breakpoint': '#f44336',
      'app-breakpoint-disabled': '#9ca3af',
      'app-breakpoint-conditional': '#ffd700',

      // Editor
      'editor-background': '#ffffff',
      'editor-gutter-background': '#f0f0f0',
      'editor-gutter-border': '#d1d1d1',
      'editor-active-line': '#e4ffaf7a',
      'editor-selection': '#2142832e',
      'editor-line-numbers': '#adadad',

      // File icons
      'file-rs': '#dea584',
      'file-go': '#00add8',
      'file-ts': '#3178c6',
      'file-tsx': '#3178c6',
      'file-js': '#f7df1e',
      'file-jsx': '#f7df1e',
      'file-json': '#f7df1e',
      'file-yaml': '#cb171e',
      'file-toml': '#9c4221',
      'file-css': '#42a5f5',
      'file-scss': '#c6538c',
      'file-less': '#1d365d',
      'file-html': '#e34c26',
      'file-xml': '#f1662a',
      'file-sql': '#4479a1',
      'file-py': '#3776ab',
      'file-java': '#f89820',
      'file-kt': '#7f52ff',
      'file-swift': '#f05138',
      'file-c': '#519aba',
      'file-cpp': '#519aba',
      'file-cs': '#239120',
      'file-php': '#777bb4',
      'file-rb': '#cc342d',
      'file-sh': '#4eaa25',
      'file-md': '#519aba',
      'file-txt': '#5a5a5a',
      'file-dockerfile': '#2496ed',
      'file-gitignore': '#f44d27',

      // Folder types
      'folder-build-color': '#cc6600',
      'folder-build-bg': '#fff0e0',
      'folder-tmp-color': '#8a8a8a',
      'folder-tmp-bg': '#f5f5f5',
      'folder-node-modules-color': '#7c5bbf',
      'folder-node-modules-bg': '#f3e8ff',
      'folder-vcs-color': '#008040',
      'folder-vcs-bg': '#e6f6ed',
      'folder-ide-color': '#0078d4',
      'folder-ide-bg': '#e6f2ff',

      // Project types
      'project-rust': '#ea580c',
      'project-node': '#22c55e',
      'project-python': '#3b82f6',
      'project-go': '#06b6d4',
      'project-java': '#dc2626',
      'project-typescript': '#2563eb',
      'project-react': '#0891b2',
      'project-vue': '#42b883',
      'project-angular': '#dd0031',
      'project-docker': '#0db7ed',
      'project-database': '#a855f7',
      'project-generic': '#4f46e5',

      // Status bar
      'statusbar-background': '#f6f8fa',
      'statusbar-foreground': '#57606a',
      'statusbar-hover-background': '#eaeef2',
      'statusbar-hover-foreground': '#24292f',
      'statusbar-border': '#d0d7de',

      // Activity bar
      'activitybar-background': '#f7f7f7',
      'activitybar-border': '#c7c7c7',
      'activitybar-active-background': '#e0e0e0',
      'activitybar-inactive-foreground': '#5a5a5a',
      'activitybar-active-foreground': '#1a1a1a',

      // Terminal
      'terminal-background': '#ffffff',
    },
  },

  'dark': {
    id: 'dark',
    name: 'IntelliJ Dark',
    colors: {
      // Application
      'app-bg': '#2b2b2b',
      'app-foreground': '#a9b7c6',
      'app-disabled-foreground': '#6a6a6a',
      'app-border': '#3c3f41',
      'app-focus-border': '#7c7cff',
      'app-hover-background': '#3c3f41',
      'app-selection-background': '#2d3a4a',
      'app-input-background': '#3c3f41',
      'app-input-foreground': '#a9b7c6',
      'app-input-border': '#5c5c5c',
      'app-input-placeholder': '#7a7a7a',
      'app-button-background': '#7c7cff',
      'app-button-foreground': '#2b2b2b',
      'app-button-hover': '#8b8bff',
      'app-toolbar-hover': '#3c3f41',
      'app-toolbar-active': '#4c4f51',
      'app-tab-active': '#2b2b2b',
      'app-tab-inactive': '#3c3f41',
      'app-tab-border': '#3c3f41',
      'app-tab-active-border': '#7c7cff',
      'app-scrollbar': '#5c5c5c',
      'app-scrollbar-hover': '#7a7a7a',

      // Debug panel
      'app-continue-color': '#57c957',
      'app-step-color': '#5fa4e8',
      'app-stop-color': '#f44336',
      'app-pause-color': '#e8a857',
      'app-status-running': '#57c957',
      'app-status-stopped': '#e8a857',
      'app-tab-variables': '#b388ff',
      'app-tab-watch': '#57d9e8',
      'app-tab-callstack': '#e8a857',
      'app-tab-threads': '#ff8a57',
      'app-tab-breakpoints': '#f44336',
      'app-tab-console': '#57c957',
      'app-running-state': '#57c957',
      'app-stopped-state': '#e8a857',
      'app-exited-state': '#8a8a8a',
      'app-unknown-state': '#6a6a6a',
      'app-error-background': '#3d2b2b',
      'app-pinned-background': '#3d3a2b',
      'app-toast-background': '#5c5c5c',

      // Syntax highlighting
      'app-keyword': '#cc7832',
      'app-type': '#a9b7c6',
      'app-string': '#6a8759',
      'app-number': '#6897bb',
      'app-boolean': '#cc7832',
      'app-null': '#808080',

      // Console
      'app-console-info': '#a9b7c6',
      'app-console-warning': '#e8a857',
      'app-console-error': '#f44336',
      'app-console-success': '#57c957',

      // Breakpoints
      'app-breakpoint': '#f44336',
      'app-breakpoint-disabled': '#6a6a6a',
      'app-breakpoint-conditional': '#ffd700',

      // Editor
      'editor-background': '#2b2b2b',
      'editor-gutter-background': '#313335',
      'editor-gutter-border': '#3c3f41',
      'editor-active-line': '#e4ffaf2a',
      'editor-selection': '#2142835e',
      'editor-line-numbers': '#8a8a8a',

      // File icons (adjusted for dark)
      'file-rs': '#dea584',
      'file-go': '#00add8',
      'file-ts': '#3178c6',
      'file-tsx': '#3178c6',
      'file-js': '#f7df1e',
      'file-jsx': '#f7df1e',
      'file-json': '#f7df1e',
      'file-yaml': '#cb171e',
      'file-toml': '#9c4221',
      'file-css': '#42a5f5',
      'file-scss': '#c6538c',
      'file-less': '#1d365d',
      'file-html': '#e34c26',
      'file-xml': '#f1662a',
      'file-sql': '#4479a1',
      'file-py': '#3776ab',
      'file-java': '#f89820',
      'file-kt': '#7f52ff',
      'file-swift': '#f05138',
      'file-c': '#519aba',
      'file-cpp': '#519aba',
      'file-cs': '#239120',
      'file-php': '#777bb4',
      'file-rb': '#cc342d',
      'file-sh': '#4eaa25',
      'file-md': '#519aba',
      'file-txt': '#8a8a8a',
      'file-dockerfile': '#2496ed',
      'file-gitignore': '#f44d27',

      // Folder types
      'folder-build-color': '#cc6600',
      'folder-build-bg': '#3d2b1a',
      'folder-tmp-color': '#8a8a8a',
      'folder-tmp-bg': '#3d3d3d',
      'folder-node-modules-color': '#7c5bbf',
      'folder-node-modules-bg': '#2d1a4a',
      'folder-vcs-color': '#008040',
      'folder-vcs-bg': '#1a3d2b',
      'folder-ide-color': '#0078d4',
      'folder-ide-bg': '#1a2b3d',

      // Project types
      'project-rust': '#ea580c',
      'project-node': '#22c55e',
      'project-python': '#3b82f6',
      'project-go': '#06b6d4',
      'project-java': '#dc2626',
      'project-typescript': '#2563eb',
      'project-react': '#0891b2',
      'project-vue': '#42b883',
      'project-angular': '#dd0031',
      'project-docker': '#0db7ed',
      'project-database': '#a855f7',
      'project-generic': '#7c7cff',

      // Status bar
      'statusbar-background': '#3c3f41',
      'statusbar-foreground': '#a9b7c6',
      'statusbar-hover-background': '#4c4f51',
      'statusbar-hover-foreground': '#a9b7c6',
      'statusbar-border': '#3c3f41',

      // Activity bar
      'activitybar-background': '#313335',
      'activitybar-border': '#3c3f41',
      'activitybar-active-background': '#4c4f51',
      'activitybar-inactive-foreground': '#8a8a8a',
      'activitybar-active-foreground': '#a9b7c6',

      // Terminal
      'terminal-background': '#2b2b2b',
    },
  },
};

/**
 * Theme change event detail
 */
export interface ThemeChangeEvent {
  themeId: string;
  theme: ThemeDefinition;
}

/**
 * Theme Service singleton
 *
 * Usage:
 *   const theme = ThemeService.getInstance();
 *   theme.setTheme('dark');
 *   const color = theme.getColor('app-bg');
 */
export class ThemeService {
  private static instance: ThemeService;
  private currentThemeId: string = 'light';
  private themes: Map<string, ThemeDefinition> = new Map();
  private listeners: Set<(event: ThemeChangeEvent) => void> = new Set();
  private initialized: boolean = false;

  private constructor() {
    // Register built-in themes
    Object.values(BUILTIN_THEMES).forEach((theme) => {
      this.themes.set(theme.id, theme);
    });
  }

  static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }

  /**
   * Initialize theme service
   * Loads saved theme from localStorage or defaults to light
   */
  initialize(): void {
    if (this.initialized) return;

    // Try to load saved theme
    const savedTheme = localStorage.getItem('openstorm-theme');
    if (savedTheme && this.themes.has(savedTheme)) {
      this.currentThemeId = savedTheme;
    }

    this.applyTheme(this.currentThemeId);
    this.initialized = true;
  }

  /**
   * Get all registered themes
   */
  getThemes(): ThemeDefinition[] {
    return Array.from(this.themes.values());
  }

  /**
   * Get current theme
   */
  getCurrentTheme(): ThemeDefinition {
    return this.themes.get(this.currentThemeId)!;
  }

  /**
   * Get current theme ID
   */
  getCurrentThemeId(): string {
    return this.currentThemeId;
  }

  /**
   * Register a new theme
   */
  registerTheme(theme: ThemeDefinition): void {
    this.themes.set(theme.id, theme);
  }

  /**
   * Set active theme
   */
  setTheme(themeId: string): boolean {
    if (!this.themes.has(themeId)) {
      console.warn(`Theme "${themeId}" not found`);
      return false;
    }

    this.currentThemeId = themeId;
    this.applyTheme(themeId);

    // Save preference
    localStorage.setItem('openstorm-theme', themeId);

    // Notify listeners
    this.notifyListeners({ themeId, theme: this.themes.get(themeId)! });

    return true;
  }

  /**
   * Get a theme color value
   */
  getColor(key: keyof ThemeColors): string {
    const theme = this.themes.get(this.currentThemeId);
    if (!theme) {
      console.warn(`Current theme "${this.currentThemeId}" not found`);
      return BUILTIN_THEMES['light'].colors[key];
    }
    return theme.colors[key];
  }

  /**
   * Get all colors from current theme
   */
  getAllColors(): ThemeColors {
    const theme = this.themes.get(this.currentThemeId);
    if (!theme) {
      return BUILTIN_THEMES['light'].colors;
    }
    return theme.colors;
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(listener: (event: ThemeChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Apply theme CSS variables to document
   */
  private applyTheme(themeId: string): void {
    const theme = this.themes.get(themeId);
    if (!theme) return;

    const root = document.documentElement;
    const colors = theme.colors;

    // Apply all theme colors as CSS custom properties
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    console.log(`[Theme] Applied theme: ${theme.name}`);
  }

  /**
   * Notify all listeners of theme change
   */
  private notifyListeners(event: ThemeChangeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[Theme] Listener error:', error);
      }
    });
  }
}

/**
 * Get theme color for use in components
 * Falls back to CSS variable if theme service not initialized
 */
export function getThemeColor(key: keyof ThemeColors): string {
  return ThemeService.getInstance().getColor(key);
}

/**
 * Subscribe to theme changes in a component
 */
export function onThemeChange(callback: (theme: ThemeDefinition) => void): () => void {
  return ThemeService.getInstance().subscribe((event) => {
    callback(event.theme);
  });
}
