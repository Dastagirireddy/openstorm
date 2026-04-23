/**
 * Theme Service - Centralized theme management
 *
 * Provides programmatic access to theme variables and supports:
 * - Dynamic theme switching
 * - Separate workbench and editor themes
 * - Plugin-provided themes via JSON
 * - Theme persistence
 */

export interface WorkbenchColors {
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

  // Folder types
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
}

export interface EditorColors {
  // Editor
  'editor-background': string;
  'editor-gutter-background': string;
  'editor-gutter-border': string;
  'editor-active-line': string;
  'editor-selection': string;
  'editor-line-numbers': string;

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

  // File icons
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
}

export interface ThemeDefinition {
  id: string;
  name: string;
  type: 'light' | 'dark';
  workbench: WorkbenchColors;
  editor: EditorColors;
}

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
 *   theme.setWorkbenchTheme('dark');
 *   theme.setEditorTheme('dracula');
 */
export class ThemeService {
  private static instance: ThemeService;
  private themes: Map<string, ThemeDefinition> = new Map();
  private currentWorkbenchThemeId: string = 'openstorm-light';
  private currentEditorThemeId: string = 'openstorm-light';
  private listeners: Set<(event: ThemeChangeEvent) => void> = new Set();
  private initialized: boolean = false;
  private themesLoaded: boolean = false;

  private constructor() {}

  static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }

  /**
   * Initialize theme service
   * Loads themes from JSON files and applies saved preference
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[Theme] Initializing theme service...');
    await this.loadThemesFromJson();

    // Ensure we have at least the default theme
    if (!this.themes.has('openstorm-light')) {
      console.error('[Theme] Critical: openstorm-light theme not loaded!');
    }

    // Try to load saved theme preference
    const savedWorkbenchTheme = localStorage.getItem('openstorm-workbench-theme');
    const savedEditorTheme = localStorage.getItem('openstorm-editor-theme');

    console.log('[Theme] Saved preferences:', { savedWorkbenchTheme, savedEditorTheme });

    // Use saved theme only if it exists, otherwise default to openstorm-light
    if (savedWorkbenchTheme && this.themes.has(savedWorkbenchTheme)) {
      this.currentWorkbenchThemeId = savedWorkbenchTheme;
    } else {
      if (savedWorkbenchTheme) {
        console.warn(`[Theme] Saved theme "${savedWorkbenchTheme}" not found, using default`);
      }
      this.currentWorkbenchThemeId = 'openstorm-light';
    }

    if (savedEditorTheme && this.themes.has(savedEditorTheme)) {
      this.currentEditorThemeId = savedEditorTheme;
    } else {
      this.currentEditorThemeId = this.currentWorkbenchThemeId;
    }

    console.log('[Theme] Selected themes:', { workbench: this.currentWorkbenchThemeId, editor: this.currentEditorThemeId });
    this.applyThemes();
    this.initialized = true;
    console.log('[Theme] Theme service initialized');
  }

  /**
   * Load theme definitions from JSON files
   */
  private async loadThemesFromJson(): Promise<void> {
    if (this.themesLoaded) return;

    // Import theme JSON files directly (Vite handles JSON imports)
    const openstormLight = await import('../themes/openstorm-light.json' as string);
    const openstormDark = await import('../themes/openstorm-dark.json' as string);
    const vscodeDark = await import('../themes/vscode-dark.json' as string);

    const themes = [openstormLight.default, openstormDark.default, vscodeDark.default];

    for (const theme of themes) {
      if (theme?.id && theme.workbench && theme.editor) {
        this.themes.set(theme.id, theme as ThemeDefinition);
        console.log(`[Theme] Loaded theme: ${theme.name} (${theme.id})`);
      }
    }

    this.themesLoaded = true;
    console.log(`[Theme] Loaded ${this.themes.size} themes`);
  }

  /**
   * Fallback: register built-in themes manually
   */
  private registerBuiltinThemes(): void {
    // This is a fallback if glob import fails
    // Themes should be loaded from JSON files
  }

  /**
   * Register a theme programmatically (for plugins)
   */
  registerTheme(theme: ThemeDefinition): void {
    this.themes.set(theme.id, theme);
  }

  /**
   * Get all available themes
   */
  getThemes(): ThemeDefinition[] {
    return Array.from(this.themes.values());
  }

  /**
   * Get theme by ID
   */
  getTheme(themeId: string): ThemeDefinition | undefined {
    return this.themes.get(themeId);
  }

  /**
   * Get current workbench theme
   */
  getCurrentWorkbenchTheme(): ThemeDefinition {
    return this.themes.get(this.currentWorkbenchThemeId)!;
  }

  /**
   * Get current editor theme
   */
  getCurrentEditorTheme(): ThemeDefinition {
    return this.themes.get(this.currentEditorThemeId)!;
  }

  /**
   * Set workbench theme
   */
  setWorkbenchTheme(themeId: string): boolean {
    if (!this.themes.has(themeId)) {
      console.warn(`[Theme] Workbench theme "${themeId}" not found`);
      return false;
    }

    this.currentWorkbenchThemeId = themeId;
    this.applyThemes();
    localStorage.setItem('openstorm-workbench-theme', themeId);

    const theme = this.themes.get(themeId)!;
    this.notifyListeners({ themeId, theme });

    return true;
  }

  /**
   * Set editor theme
   */
  setEditorTheme(themeId: string): boolean {
    if (!this.themes.has(themeId)) {
      console.warn(`[Theme] Editor theme "${themeId}" not found`);
      return false;
    }

    this.currentEditorThemeId = themeId;
    this.applyThemes();
    localStorage.setItem('openstorm-editor-theme', themeId);

    const theme = this.themes.get(themeId)!;
    this.notifyListeners({ themeId, theme });

    return true;
  }

  /**
   * Set both workbench and editor theme (linked mode)
   */
  setTheme(themeId: string): boolean {
    if (!this.themes.has(themeId)) {
      console.warn(`[Theme] Theme "${themeId}" not found`);
      return false;
    }

    this.currentWorkbenchThemeId = themeId;
    this.currentEditorThemeId = themeId;
    this.applyThemes();
    localStorage.setItem('openstorm-workbench-theme', themeId);
    localStorage.setItem('openstorm-editor-theme', themeId);

    const theme = this.themes.get(themeId)!;
    this.notifyListeners({ themeId, theme });

    return true;
  }

  /**
   * Get current theme IDs
   */
  getCurrentThemeIds(): { workbench: string; editor: string } {
    return {
      workbench: this.currentWorkbenchThemeId,
      editor: this.currentEditorThemeId,
    };
  }

  /**
   * Get a color value from the appropriate theme
   */
  getColor(key: keyof (WorkbenchColors | EditorColors)): string {
    // Determine which theme to use based on the color key
    const workbenchKeys = new Set<keyof WorkbenchColors>([
      'app-bg', 'app-foreground', 'app-disabled-foreground', 'app-border',
      'app-focus-border', 'app-hover-background', 'app-selection-background',
      'app-input-background', 'app-input-foreground', 'app-input-border',
      'app-input-placeholder', 'app-button-background', 'app-button-foreground',
      'app-button-hover', 'app-toolbar-hover', 'app-toolbar-active',
      'app-tab-active', 'app-tab-inactive', 'app-tab-border', 'app-tab-active-border',
      'app-scrollbar', 'app-scrollbar-hover', 'app-continue-color', 'app-step-color',
      'app-stop-color', 'app-pause-color', 'app-status-running', 'app-status-stopped',
      'app-tab-variables', 'app-tab-watch', 'app-tab-callstack', 'app-tab-threads',
      'app-tab-breakpoints', 'app-tab-console', 'app-running-state', 'app-stopped-state',
      'app-exited-state', 'app-unknown-state', 'app-error-background',
      'app-pinned-background', 'app-toast-background', 'statusbar-background',
      'statusbar-foreground', 'statusbar-hover-background', 'statusbar-hover-foreground',
      'statusbar-border', 'activitybar-background', 'activitybar-border',
      'activitybar-active-background', 'activitybar-inactive-foreground',
      'activitybar-active-foreground', 'terminal-background', 'folder-build-color',
      'folder-build-bg', 'folder-tmp-color', 'folder-tmp-bg', 'folder-node-modules-color',
      'folder-node-modules-bg', 'folder-vcs-color', 'folder-vcs-bg', 'folder-ide-color',
      'folder-ide-bg', 'project-rust', 'project-node', 'project-python', 'project-go',
      'project-java', 'project-typescript', 'project-react', 'project-vue',
      'project-angular', 'project-docker', 'project-database', 'project-generic',
    ]);

    const themeToUse = workbenchKeys.has(key as keyof WorkbenchColors)
      ? this.themes.get(this.currentWorkbenchThemeId)
      : this.themes.get(this.currentEditorThemeId);

    if (!themeToUse) {
      const fallback = this.themes.get('openstorm-light');
      return (fallback!.workbench as any)[key] || (fallback!.editor as any)[key] || '#ffffff';
    }

    const workbenchTheme = themeToUse.workbench as any;
    const editorTheme = themeToUse.editor as any;

    return workbenchTheme[key] || editorTheme[key] || '#ffffff';
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
  private applyThemes(): void {
    const workbenchTheme = this.themes.get(this.currentWorkbenchThemeId);
    const editorTheme = this.themes.get(this.currentEditorThemeId);

    if (!workbenchTheme || !editorTheme) {
      console.warn('[Theme] Cannot apply themes - themes not loaded yet');
      return;
    }

    const root = document.documentElement;

    // Apply workbench colors
    Object.entries(workbenchTheme.workbench).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
      console.log(`[Theme] Set --${key} = ${value}`);
    });

    // Apply editor colors
    Object.entries(editorTheme.editor).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    console.log(`[Theme] Applied workbench: ${workbenchTheme.name} (${this.currentWorkbenchThemeId}), editor: ${editorTheme.name} (${this.currentEditorThemeId})`);

    // Verify a key variable was set
    console.log('[Theme] Verification: --app-bg =', root.style.getPropertyValue('--app-bg'));
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

    // Dispatch DOM event for components to listen to
    dispatch('theme-changed', { themeId: event.themeId, themeName: event.theme.name });
  }
}

/**
 * Dispatch a custom event (internal use within theme service)
 */
function dispatch(eventName: string, detail?: any): void {
  document.dispatchEvent(
    new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true,
    })
  );
}

/**
 * Get theme color for use in components
 * Falls back to CSS variable if theme service not initialized
 */
export function getThemeColor(key: keyof (WorkbenchColors | EditorColors)): string {
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
