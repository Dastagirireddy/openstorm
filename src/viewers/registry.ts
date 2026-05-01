/**
 * Viewer Registry - Maps file types to viewer tag names
 *
 * New architecture: Viewers are Lit custom elements rendered declaratively
 */

import type { ViewerMetadata } from './types.js';

export interface ViewerRegistration {
  id: string;
  displayName: string;
  supportedExtensions: string[];
  tagName: string;
}

class ViewerRegistry {
  private viewers = new Map<string, ViewerRegistration>();

  /**
   * Register a viewer for specific file types
   */
  register(registration: ViewerRegistration): void {
    this.viewers.set(registration.id, registration);
  }

  /**
   * Get viewer tag name for a file extension
   */
  getViewerTagForExtension(extension: string): string | null {
    const ext = extension.toLowerCase();

    // First pass: exact extension match (no wildcards)
    for (const [, viewer] of this.viewers.entries()) {
      if (viewer.supportedExtensions.includes('*')) {
        continue;
      }
      if (viewer.supportedExtensions.includes(ext)) {
        return viewer.tagName;
      }
    }

    // Second pass: wildcard fallback
    for (const [, viewer] of this.viewers.entries()) {
      if (viewer.supportedExtensions.includes('*')) {
        return viewer.tagName;
      }
    }

    return null;
  }

  /**
   * Get viewer registration by ID
   */
  getViewerById(id: string): ViewerRegistration | null {
    return this.viewers.get(id) || null;
  }

  /**
   * Get all registered viewer metadata
   */
  getAllViewers(): ViewerMetadata[] {
    return Array.from(this.viewers.values()).map(v => ({
      id: v.id,
      displayName: v.displayName,
      supportedExtensions: v.supportedExtensions,
    }));
  }

  /**
   * Check if a viewer is registered for an extension
   */
  hasViewerForExtension(extension: string): boolean {
    const ext = extension.toLowerCase();
    for (const [, viewer] of this.viewers.entries()) {
      if (viewer.supportedExtensions.includes(ext) ||
          viewer.supportedExtensions.includes('*')) {
        return true;
      }
    }
    return false;
  }
}

export const registry = new ViewerRegistry();

// Import viewers to ensure custom elements are defined
import './builtin/text-viewer.js';
import './builtin/image-viewer.js';
import './builtin/svg-viewer.js';
import './builtin/markdown-viewer.js';

// Register built-in image viewer for raster images
registry.register({
  id: 'image',
  displayName: 'Image Viewer',
  supportedExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'],
  tagName: 'image-viewer',
});

// Register built-in SVG viewer for SVG files
registry.register({
  id: 'svg',
  displayName: 'SVG Editor',
  supportedExtensions: ['svg'],
  tagName: 'svg-viewer',
});

// Register built-in markdown viewer for markdown files
registry.register({
  id: 'markdown',
  displayName: 'Markdown Editor',
  supportedExtensions: ['md', 'markdown', 'mdown'],
  tagName: 'markdown-viewer',
});

// Register built-in text viewer as default fallback
registry.register({
  id: 'text',
  displayName: 'Text Editor',
  supportedExtensions: ['*'],
  tagName: 'text-viewer',
});
