/**
 * Viewer Registry - Maps file types to viewer factories
 */

import type { FileViewer, ViewerFactory, ViewerMetadata } from './types.js';
import { createTextViewer } from './builtin/text-viewer.js';
import { createImageViewer } from './builtin/image-viewer.js';

class ViewerRegistry {
  private viewers = new Map<string, { factory: ViewerFactory; metadata: ViewerMetadata }>();

  /**
   * Register a viewer for specific file types
   */
  register(id: string, factory: ViewerFactory, metadata: ViewerMetadata): void {
    // Store by viewer ID
    this.viewers.set(id, { factory, metadata });
  }

  /**
   * Get a viewer instance for a file extension
   */
  async getViewerForExtension(extension: string): Promise<FileViewer | null> {
    const ext = extension.toLowerCase();

    // Find matching viewer
    for (const [, viewer] of this.viewers.entries()) {
      if (viewer.metadata.supportedExtensions.includes(ext)) {
        return await viewer.factory();
      }
      // Support wildcard matching (e.g., for text files)
      if (viewer.metadata.supportedExtensions.includes('*')) {
        return await viewer.factory();
      }
    }

    return null;
  }

  /**
   * Get a viewer instance by ID (for manual selection)
   */
  async getViewerById(id: string): Promise<FileViewer | null> {
    const viewer = this.viewers.get(id);
    if (viewer) {
      return await viewer.factory();
    }
    return null;
  }

  /**
   * Get all registered viewer metadata (for viewer picker UI)
   */
  getAllViewers(): ViewerMetadata[] {
    return Array.from(this.viewers.values()).map(v => v.metadata);
  }

  /**
   * Check if a viewer is registered for an extension
   */
  hasViewerForExtension(extension: string): boolean {
    const ext = extension.toLowerCase();
    for (const [, viewer] of this.viewers.entries()) {
      if (viewer.metadata.supportedExtensions.includes(ext) ||
          viewer.metadata.supportedExtensions.includes('*')) {
        return true;
      }
    }
    return false;
  }
}

export const registry = new ViewerRegistry();

// Register built-in image viewer for image files
registry.register('image', createImageViewer, {
  id: 'image',
  displayName: 'Image Viewer',
  supportedExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'],
});

// Register built-in text viewer as default fallback
registry.register('text', createTextViewer, {
  id: 'text',
  displayName: 'Text Editor',
  supportedExtensions: ['*'], // Wildcard - handles all text files
});
