/**
 * Icon Registry - Centralized icon management
 *
 * Consolidates Lucide and Iconify into a single registry with:
 * - Consistent API across all components
 * - Theme-aware icon colors
 * - Plugin-provided icons
 * - Tree-shakeable imports
 */

import type { IconName } from '../../components/layout/icon';

/**
 * Icon source types
 */
export type IconSource = 'lucide' | 'iconify';

/**
 * Icon definition
 */
export interface IconDefinition {
  name: string;
  source: IconSource;
  iconifyName?: string; // For iconify icons
  color?: string; // Optional default color
}

/**
 * Icon registry configuration
 */
export interface IconRegistryConfig {
  defaultSize: number;
  defaultColor: string;
}

/**
 * Icon collections for iconify
 */
export interface IconifyCollection {
  prefix: string;
  icons: string[];
}

/**
 * Icon Registry singleton
 *
 * Usage:
 *   const registry = IconRegistry.getInstance();
 *   const icon = registry.getIcon('play');
 *   registry.registerIcon({ name: 'custom', source: 'iconify', iconifyName: 'mdi:star' });
 */
export class IconRegistry {
  private static instance: IconRegistry;
  private icons: Map<string, IconDefinition> = new Map();
  private config: IconRegistryConfig = {
    defaultSize: 16,
    defaultColor: 'currentColor',
  };
  private iconifyCollections: Set<string> = new Set();

  private constructor() {
    this.registerDefaultIcons();
  }

  static getInstance(): IconRegistry {
    if (!IconRegistry.instance) {
      IconRegistry.instance = new IconRegistry();
    }
    return IconRegistry.instance;
  }

  /**
   * Configure registry defaults
   */
  configure(config: Partial<IconRegistryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Register default icons from Lucide
   */
  private registerDefaultIcons(): void {
    // These match the existing iconMap from icon.ts
    const lucideIcons: IconName[] = [
      'play',
      'bug',
      'square',
      'git-branch',
      'chevron-down',
      'chevron-right',
      'rotate-ccw',
      'clock',
      'list-filter',
      'arrow-down-to-line',
      'arrow-up-from-line',
      'cloud',
      'folder',
      'folder-open',
      'folder-plus',
      'check',
      'gauge',
      'circle-dot',
      'file',
      'file-json',
      'file-code',
      'file-text',
      'file-plus',
      'locate',
      'expand-all',
      'collapse-all',
      'presentation',
      'external-link',
      'folder-input',
      'package',
      'box',
      'layers',
      'database',
      'globe',
      'server',
      'terminal',
      'x',
    ];

    lucideIcons.forEach((name) => {
      this.icons.set(name, { name, source: 'lucide' });
    });

    // Register special folder icons
    this.icons.set('folder-filled', { name: 'folder-filled', source: 'lucide' });
    this.icons.set('folder-open-filled', { name: 'folder-open-filled', source: 'lucide' });
  }

  /**
   * Register an iconify collection for use
   */
  registerIconifyCollection(prefix: string, iconNames: string[]): void {
    this.iconifyCollections.add(prefix);
    iconNames.forEach((iconName) => {
      const name = `${prefix}:${iconName}`;
      this.icons.set(name, {
        name,
        source: 'iconify',
        iconifyName: `${prefix}:${iconName}`,
      });
    });
  }

  /**
   * Register a custom icon
   */
  registerIcon(icon: IconDefinition): void {
    this.icons.set(icon.name, icon);
  }

  /**
   * Get icon definition by name
   */
  getIcon(name: string): IconDefinition | undefined {
    return this.icons.get(name);
  }

  /**
   * Check if icon exists
   */
  hasIcon(name: string): boolean {
    return this.icons.has(name);
  }

  /**
   * Get all registered icon names
   */
  getIconNames(): string[] {
    return Array.from(this.icons.keys());
  }

  /**
   * Get default size
   */
  getDefaultSize(): number {
    return this.config.defaultSize;
  }

  /**
   * Get default color
   */
  getDefaultColor(): string {
    return this.config.defaultColor;
  }

  /**
   * Get iconify collections
   */
  getIconifyCollections(): string[] {
    return Array.from(this.iconifyCollections);
  }

  /**
   * Resolve icon color - uses theme color if starts with var(--
   */
  resolveColor(color: string | undefined): string {
    if (!color) return this.config.defaultColor;
    if (color.startsWith('var(')) {
      // Get computed CSS variable value
      const temp = document.createElement('span');
      temp.style.color = color;
      document.body.appendChild(temp);
      const computed = getComputedStyle(temp).color;
      document.body.removeChild(temp);
      return computed || color;
    }
    return color;
  }
}

/**
 * Icon name type for type-safe icon usage
 * Includes both Lucide names and iconify names
 */
export type RegisteredIconName = IconName | string;

/**
 * Get icon registry instance
 */
export function getIconRegistry(): IconRegistry {
  return IconRegistry.getInstance();
}

/**
 * Register iconify collection helper
 */
export function registerIconifyCollection(
  prefix: string,
  icons: Record<string, any>,
): void {
  const iconNames = Object.keys(icons.icons || {});
  IconRegistry.getInstance().registerIconifyCollection(prefix, iconNames);
}
