/**
 * Plugin Registry - Extension system for OpenStorm
 *
 * Provides APIs for:
 * - Theme providers (dynamic themes from extensions)
 * - Icon providers (custom icon sets)
 * - Formatter providers (language formatters)
 * - Language support (syntax highlighting, LSP configuration)
 * - Toolbar extensions (custom actions)
 */

import type { ThemeDefinition } from '../services/theme-service';
import type { IconDefinition } from '../icons';

/**
 * Plugin metadata
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  contributes?: PluginContributions;
}

/**
 * Plugin contributions
 */
export interface PluginContributions {
  themes?: ThemeDefinition[];
  icons?: IconDefinition[];
  formatters?: LanguageFormatterRegistration[];
  languages?: LanguageRegistration[];
  toolbarItems?: ToolbarItemRegistration[];
}

/**
 * Language formatter registration
 */
export interface LanguageFormatterRegistration {
  language: string;
  extensions: string[];
  format: (content: string, options: FormatterOptions) => Promise<string>;
}

/**
 * Formatter options
 */
export interface FormatterOptions {
  tabWidth: number;
  insertSpaces: boolean;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
}

/**
 * Language registration
 */
export interface LanguageRegistration {
  id: string;
  name: string;
  extensions: string[];
  icon?: string;
  color?: string;
  configuration?: LanguageConfiguration;
}

/**
 * Language configuration
 */
export interface LanguageConfiguration {
  comments?: {
    lineComment?: string;
    blockComment?: [string, string];
  };
  brackets?: string[];
  autoClosingPairs?: Array<{ open: string; close: string }>;
  surroundingPairs?: Array<{ open: string; close: string }>;
  folding?: {
    markers?: { start: string; end: string };
  };
}

/**
 * Toolbar item registration
 */
export interface ToolbarItemRegistration {
  id: string;
  label: string;
  icon: string;
  command: string;
  group?: string;
  when?: string; // Condition for showing the item
}

/**
 * Plugin context - provided to plugins when activated
 */
export interface PluginContext {
  manifest: PluginManifest;
  storagePath: string;
  subscriptions: Disposable[];
}

/**
 * Disposable interface for cleanup
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Plugin instance
 */
export interface PluginInstance {
  manifest: PluginManifest;
  context: PluginContext;
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
}

/**
 * Plugin registry events
 */
export interface PluginEvent {
  type: 'loaded' | 'activated' | 'deactivated' | 'error';
  pluginId: string;
  details?: any;
}

/**
 * Plugin Registry singleton
 *
 * Usage:
 *   const registry = PluginRegistry.getInstance();
 *   registry.registerPlugin(myPlugin);
 *   registry.activatePlugin('my-plugin-id');
 */
export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, PluginInstance> = new Map();
  private pluginManifests: Map<string, PluginManifest> = new Map();
  private listeners: Set<(event: PluginEvent) => void> = new Set();

  // Contribution registries
  private themes: Map<string, ThemeDefinition> = new Map();
  private icons: Map<string, IconDefinition> = new Map();
  private formatters: Map<string, LanguageFormatterRegistration> = new Map();
  private languages: Map<string, LanguageRegistration> = new Map();
  private toolbarItems: Map<string, ToolbarItemRegistration> = new Map();

  private constructor() {}

  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * Register a plugin manifest (for discovery)
   */
  registerManifest(manifest: PluginManifest): void {
    this.pluginManifests.set(manifest.id, manifest);
    this.notifyListeners({ type: 'loaded', pluginId: manifest.id });
  }

  /**
   * Register a plugin instance
   */
  registerPlugin(plugin: PluginInstance): void {
    this.plugins.set(plugin.manifest.id, plugin);
    this.registerManifest(plugin.manifest);

    // Register contributions
    if (plugin.manifest.contributes) {
      const { themes, icons, formatters, languages, toolbarItems } = plugin.manifest.contributes;

      if (themes) {
        themes.forEach((theme) => this.themes.set(`${plugin.manifest.id}:${theme.id}`, theme));
      }

      if (icons) {
        icons.forEach((icon) => this.icons.set(icon.name, icon));
      }

      if (formatters) {
        formatters.forEach((formatter) => {
          this.formatters.set(`${plugin.manifest.id}:${formatter.language}`, formatter);
        });
      }

      if (languages) {
        languages.forEach((lang) => this.languages.set(lang.id, lang));
      }

      if (toolbarItems) {
        toolbarItems.forEach((item) => this.toolbarItems.set(item.id, item));
      }
    }
  }

  /**
   * Activate a plugin
   */
  async activatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.warn(`Plugin "${pluginId}" not found`);
      return false;
    }

    try {
      await plugin.activate();
      this.notifyListeners({ type: 'activated', pluginId });
      return true;
    } catch (error) {
      console.error(`Failed to activate plugin "${pluginId}":`, error);
      this.notifyListeners({ type: 'error', pluginId, details: error });
      return false;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.warn(`Plugin "${pluginId}" not found`);
      return false;
    }

    try {
      await plugin.deactivate();
      this.notifyListeners({ type: 'deactivated', pluginId });
      return true;
    } catch (error) {
      console.error(`Failed to deactivate plugin "${pluginId}":`, error);
      this.notifyListeners({ type: 'error', pluginId, details: error });
      return false;
    }
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): PluginManifest[] {
    return Array.from(this.pluginManifests.values());
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Check if a plugin is registered
   */
  hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  // Theme contributions

  /**
   * Get all contributed themes
   */
  getThemes(): ThemeDefinition[] {
    return Array.from(this.themes.values());
  }

  /**
   * Get a theme by ID
   */
  getTheme(themeId: string): ThemeDefinition | undefined {
    return this.themes.get(themeId);
  }

  // Icon contributions

  /**
   * Get all contributed icons
   */
  getIcons(): IconDefinition[] {
    return Array.from(this.icons.values());
  }

  /**
   * Get an icon by name
   */
  getIcon(name: string): IconDefinition | undefined {
    return this.icons.get(name);
  }

  // Formatter contributions

  /**
   * Get all contributed formatters
   */
  getFormatters(): LanguageFormatterRegistration[] {
    return Array.from(this.formatters.values());
  }

  /**
   * Get formatter for a language
   */
  getFormatter(language: string): LanguageFormatterRegistration | undefined {
    return this.formatters.get(language);
  }

  // Language contributions

  /**
   * Get all registered languages
   */
  getLanguages(): LanguageRegistration[] {
    return Array.from(this.languages.values());
  }

  /**
   * Get language by ID
   */
  getLanguage(languageId: string): LanguageRegistration | undefined {
    return this.languages.get(languageId);
  }

  /**
   * Get language for file extension
   */
  getLanguageForExtension(extension: string): LanguageRegistration | undefined {
    return Array.from(this.languages.values()).find((lang) =>
      lang.extensions.includes(extension) || lang.extensions.includes(`.${extension}`)
    );
  }

  // Toolbar contributions

  /**
   * Get all toolbar items
   */
  getToolbarItems(): ToolbarItemRegistration[] {
    return Array.from(this.toolbarItems.values());
  }

  /**
   * Get toolbar items for a group
   */
  getToolbarItemsForGroup(group: string): ToolbarItemRegistration[] {
    return Array.from(this.toolbarItems.values()).filter((item) => item.group === group);
  }

  // Event subscription

  /**
   * Subscribe to plugin events
   */
  subscribe(listener: (event: PluginEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  private notifyListeners(event: PluginEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[PluginRegistry] Listener error:', error);
      }
    });
  }

  /**
   * Load plugins from a directory
   * This is a placeholder - actual implementation would scan the plugins directory
   */
  async loadPluginsFromDirectory(directoryPath: string): Promise<void> {
    console.log('[PluginRegistry] Loading plugins from:', directoryPath);
    // Implementation would:
    // 1. Scan directory for plugin folders
    // 2. Read plugin.json/manifest.json for each
    // 3. Load and instantiate plugin modules
    // 4. Register with the registry
  }
}

/**
 * Helper to create a disposable
 */
export function createDisposable(dispose: () => void): Disposable {
  return { dispose };
}

/**
 * Helper to create a plugin context
 */
export function createPluginContext(
  manifest: PluginManifest,
  storagePath: string
): PluginContext {
  const subscriptions: Disposable[] = [];
  return {
    manifest,
    storagePath,
    subscriptions,
  };
}

/**
 * Get plugin registry instance
 */
export function getPluginRegistry(): PluginRegistry {
  return PluginRegistry.getInstance();
}
