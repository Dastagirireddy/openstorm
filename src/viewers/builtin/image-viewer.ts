/**
 * Image Viewer - Displays image files with zoom and pan support
 */

import type { FileViewer, ViewerMetadata, ViewerAction } from '../types.js';
import { invoke } from '@tauri-apps/api/core';
import { dispatch } from '../../lib/types/events.js';

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
}

export class ImageViewer implements FileViewer {
  readonly metadata: ViewerMetadata = {
    id: 'image',
    displayName: 'Image Viewer',
    supportedExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'],
  };

  private container: HTMLElement | null = null;
  private filePath: string = '';
  private base64Content: string = '';
  private imageMetadata: ImageMetadata | null = null;
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;
  private imgElement: HTMLImageElement | null = null;
  private rotation: number = 0;

  mount(container: HTMLElement): void {
    this.container = container;
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
  }

  unmount(): void {
    this.removeEventListeners();
    this.removeKeyboardShortcuts();
    this.container = null;
    this.imgElement = null;
  }

  async loadFile(path: string, content: string): Promise<void> {
    if (!this.container) {
      throw new Error('ImageViewer not mounted');
    }

    this.filePath = path;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    try {
      // Read file as base64
      this.base64Content = await invoke<string>('read_file_base64', { path });

      // Fetch metadata
      try {
        this.imageMetadata = await invoke<ImageMetadata>('get_image_metadata', { path });
      } catch (e) {
        console.warn('[ImageViewer] Failed to get metadata:', e);
        this.imageMetadata = null;
      }

      this.render();
    } catch (error) {
      console.error('[ImageViewer] Failed to load image:', error);
      this.container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-sm" style="color: var(--app-disabled-foreground);">
          <iconify-icon icon="lucide:image-off" width="48" height="48"></iconify-icon>
          <p class="mt-4">Failed to load image</p>
          <p class="text-xs mt-2">${error instanceof Error ? error.message : String(error)}</p>
        </div>
      `;
    }
  }

  isDirtyState(): boolean {
    return false; // Images are read-only
  }

  canSave(): boolean {
    return false;
  }

  getToolbarActions(): ViewerAction[] {
    return [
      {
        id: 'zoom-out',
        icon: 'mdi:magnify-minus-outline',
        label: 'Zoom Out',
        onClick: () => this.zoom(0.8),
        enabled: this.scale > 0.2,
      },
      {
        id: 'zoom-reset',
        icon: 'mdi:magnify-expand',
        label: 'Reset',
        onClick: () => this.resetZoom(),
      },
      {
        id: 'zoom-in',
        icon: 'mdi:magnify-plus-outline',
        label: 'Zoom In',
        onClick: () => this.zoom(1.25),
        enabled: this.scale < 4,
      },
      {
        id: 'fit-screen',
        icon: 'mdi:arrow-expand',
        label: 'Fit',
        onClick: () => this.fitToScreen(),
      },
      {
        id: 'actual-size',
        icon: 'mdi:numeric-1-box-outline',
        label: '100%',
        onClick: () => this.actualSize(),
      },
      {
        id: 'rotate-left',
        icon: 'mdi:rotate-left',
        label: 'Rotate Left',
        onClick: () => this.rotate(-90),
      },
      {
        id: 'rotate-right',
        icon: 'mdi:rotate-right',
        label: 'Rotate Right',
        onClick: () => this.rotate(90),
      },
      {
        id: 'copy',
        icon: 'mdi:content-copy',
        label: 'Copy Image',
        onClick: () => this.copyToClipboard(),
      },
    ];
  }

  private render(): void {
    if (!this.container) return;

    const ext = this.filePath.split('.').pop()?.toLowerCase() || '';
    const mimeType = this.getMimeType(ext);
    const src = `data:${mimeType};base64,${this.base64Content}`;
    const fileName = this.filePath.split('/').pop() || 'Image';

    this.container.innerHTML = '';
    this.container.className = 'relative w-full h-full overflow-hidden';
    // Themed background - uses CSS variables for light/dark mode
    this.container.style.cssText = `
      background: var(--app-workbench-bg);
    `;

    // Create viewport for pan/zoom
    const viewport = document.createElement('div');
    viewport.className = 'relative w-full h-full cursor-grab active:cursor-grabbing';
    viewport.style.touchAction = 'none';

    // Create centering wrapper with padding
    const centerWrapper = document.createElement('div');
    centerWrapper.className = 'absolute inset-0 flex items-center justify-center';
    centerWrapper.style.padding = '40px';
    centerWrapper.style.boxSizing = 'border-box';

    // Create image wrapper for transform
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'origin-center';
    imgWrapper.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    // Add subtle shadow to image
    imgWrapper.style.filter = 'drop-shadow(0 8px 32px rgba(0, 0, 0, 0.3))';
    // Smooth image rendering during zoom
    imgWrapper.style.willChange = 'transform';

    // Create image element with padding constraints
    this.imgElement = document.createElement('img');
    this.imgElement.src = src;
    this.imgElement.alt = fileName;
    this.imgElement.className = 'select-none pointer-events-none block rounded-lg';
    this.imgElement.draggable = false;
    // High-quality image rendering during zoom
    this.imgElement.style.imageRendering = 'high-quality';
    // Constrain image to fit within container with padding
    this.imgElement.style.maxWidth = '100%';
    this.imgElement.style.maxHeight = '100%';
    this.imgElement.style.width = 'auto';
    this.imgElement.style.height = 'auto';
    this.imgElement.style.background = 'rgba(255, 255, 255, 0.05)';
    this.imgElement.style.border = '1px solid rgba(255, 255, 255, 0.1)';

    imgWrapper.appendChild(this.imgElement);
    centerWrapper.appendChild(imgWrapper);
    viewport.appendChild(centerWrapper);
    this.container.appendChild(viewport);

    // Create metadata overlay with theme-aware badges
    if (this.imageMetadata) {
      const metadataOverlay = document.createElement('div');
      metadataOverlay.className = 'absolute bottom-4 right-4 px-4 py-3 rounded-xl text-xs flex items-center gap-3';
      metadataOverlay.style.cssText = `
        background: var(--app-badge-bg);
        backdrop-filter: blur(12px);
        border: 1px solid var(--app-badge-border);
        box-shadow: 0 8px 32px var(--app-badge-shadow);
      `;

      // Dimension badge
      const dimBadge = document.createElement('span');
      dimBadge.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold';
      dimBadge.style.cssText = `
        background: var(--app-hover-background);
        color: var(--app-foreground);
        border: 1px solid var(--app-border);
      `;
      dimBadge.innerHTML = `<iconify-icon icon="mdi:image-size" width="14"></iconify-icon> ${this.imageMetadata.width}×${this.imageMetadata.height}`;

      // Format badge
      const formatBadge = document.createElement('span');
      formatBadge.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold';
      formatBadge.style.cssText = `
        background: var(--app-hover-background);
        color: var(--app-foreground);
        border: 1px solid var(--app-border);
      `;
      formatBadge.innerHTML = `<iconify-icon icon="mdi:file-type" width="14"></iconify-icon> ${this.imageMetadata.format.toUpperCase()}`;

      // Size badge
      const sizeBadge = document.createElement('span');
      sizeBadge.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold';
      sizeBadge.style.cssText = `
        background: var(--app-hover-background);
        color: var(--app-foreground);
        border: 1px solid var(--app-border);
      `;
      sizeBadge.innerHTML = `<iconify-icon icon="mdi:harddrive" width="14"></iconify-icon> ${this.formatFileSize(this.imageMetadata.size)}`;

      metadataOverlay.appendChild(dimBadge);
      metadataOverlay.appendChild(formatBadge);
      metadataOverlay.appendChild(sizeBadge);
      this.container.appendChild(metadataOverlay);
    }

    // Create zoom level indicator (bottom left)
    const zoomIndicator = document.createElement('div');
    zoomIndicator.className = 'absolute bottom-4 left-4 px-3 py-2 rounded-xl text-xs font-bold';
    zoomIndicator.style.cssText = `
      background: var(--app-badge-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--app-badge-border);
      color: var(--app-badge-foreground);
    `;
    zoomIndicator.textContent = `${Math.round(this.scale * 100)}%`;
    this.container.appendChild(zoomIndicator);
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    // Wheel zoom (also handles trackpad pinch via ctrlKey on macOS)
    this.container.addEventListener('wheel', this.handleWheel, { passive: false });

    // Pan with mouse
    const viewport = this.container.querySelector('div') as HTMLElement;
    if (viewport) {
      viewport.addEventListener('mousedown', this.handleMouseDown);
      viewport.addEventListener('mousemove', this.handleMouseMove);
      viewport.addEventListener('mouseup', this.handleMouseUp);
      viewport.addEventListener('mouseleave', this.handleMouseUp);
    }
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private removeKeyboardShortcuts(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private removeEventListeners(): void {
    if (!this.container) return;

    this.container.removeEventListener('wheel', this.handleWheel);

    const viewport = this.container.querySelector('div') as HTMLElement;
    if (viewport) {
      viewport.removeEventListener('mousedown', this.handleMouseDown);
      viewport.removeEventListener('mousemove', this.handleMouseMove);
      viewport.removeEventListener('mouseup', this.handleMouseUp);
      viewport.removeEventListener('mouseleave', this.handleMouseUp);
    }
  }

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();

    // Trackpad pinch-to-zoom on macOS sends ctrlKey + wheel events
    // Also handle standard trackpad vertical scroll for zoom
    let delta: number;
    if (e.ctrlKey) {
      // macOS trackpad pinch: use finer granularity
      delta = e.deltaY > 0 ? 0.95 : 1.05;
    } else {
      // Standard wheel or trackpad scroll
      delta = e.deltaY > 0 ? 0.9 : 1.1;
    }

    const newScale = Math.max(0.1, Math.min(10, this.scale * delta));

    if (newScale !== this.scale) {
      this.scale = newScale;
      this.updateTransform();
      this.updateZoomIndicator();
      this.updateToolbarActions();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Only handle if image viewer is active (container is in DOM)
    if (!this.container || !document.contains(this.container)) return;

    // Don't handle if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Zoom shortcuts
    if (modKey && e.key === '0') {
      e.preventDefault();
      this.resetZoom();
      return;
    }

    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.zoom(1.25);
      return;
    }

    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.zoom(0.8);
      return;
    }

    if (e.key === '1') {
      e.preventDefault();
      this.actualSize();
      return;
    }

    if (e.key === '0' && !modKey) {
      e.preventDefault();
      this.fitToScreen();
      return;
    }

    // Rotate shortcuts
    if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      this.rotate(90);
      return;
    }

    // Pan with arrow keys (only when zoomed in)
    if (this.scale > 1) {
      const panAmount = 50 * this.scale;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.offsetY += panAmount;
        this.updateTransform();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.offsetY -= panAmount;
        this.updateTransform();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.offsetX += panAmount;
        this.updateTransform();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.offsetX -= panAmount;
        this.updateTransform();
        return;
      }
    }

    // Copy to clipboard: Cmd/Ctrl + C
    if (modKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      this.copyToClipboard();
      return;
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      // Left click for pan
      this.isDragging = true;
      this.startX = e.clientX - this.offsetX;
      this.startY = e.clientY - this.offsetY;

      const viewport = this.container?.querySelector('div') as HTMLElement;
      if (viewport) {
        viewport.style.cursor = 'grabbing';
      }
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;

    e.preventDefault();
    this.offsetX = e.clientX - this.startX;
    this.offsetY = e.clientY - this.startY;
    this.updateTransform();
  };

  private handleMouseUp = (): void => {
    this.isDragging = false;

    const viewport = this.container?.querySelector('div') as HTMLElement;
    if (viewport) {
      viewport.style.cursor = 'grab';
    }
  };

  private updateTransform(): void {
    const imgWrapper = this.container?.querySelector('.origin-center') as HTMLElement;
    if (imgWrapper) {
      imgWrapper.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale}) rotate(${this.rotation}deg)`;
    }
  }

  private updateZoomIndicator(): void {
    const indicator = this.container?.querySelector('.absolute.bottom-4.left-4') as HTMLElement;
    if (indicator) {
      indicator.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }

  private updateToolbarActions(): void {
    // Toolbar is managed by file-viewer-container, just dispatch event
    dispatch('viewer-actions-changed', { actions: this.getToolbarActions() });
  }

  private zoom(factor: number): void {
    this.scale = Math.max(0.1, Math.min(10, this.scale * factor));
    this.updateTransform();
    this.updateZoomIndicator();
    this.updateToolbarActions();
  }

  private resetZoom(): void {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.updateTransform();
    this.updateZoomIndicator();
    this.updateToolbarActions();
  }

  private fitToScreen(): void {
    if (!this.container || !this.imageMetadata) return;

    const containerWidth = this.container.clientWidth - 40;
    const containerHeight = this.container.clientHeight - 40;

    const scaleX = containerWidth / this.imageMetadata.width;
    const scaleY = containerHeight / this.imageMetadata.height;

    this.scale = Math.min(scaleX, scaleY, 1);
    this.offsetX = 0;
    this.offsetY = 0;

    this.updateTransform();
    this.updateZoomIndicator();
    this.updateToolbarActions();
  }

  private actualSize(): void {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.updateTransform();
    this.updateZoomIndicator();
    this.updateToolbarActions();
  }

  private rotate(degrees: number): void {
    this.rotation = (this.rotation + degrees) % 360;
    const imgWrapper = this.container?.querySelector('.origin-center') as HTMLElement;
    if (imgWrapper) {
      imgWrapper.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale}) rotate(${this.rotation}deg)`;
    }
  }

  private async copyToClipboard(): Promise<void> {
    if (!this.base64Content || !this.filePath) {
      return;
    }

    try {
      // Create a blob from the base64 data and copy to clipboard
      const ext = this.filePath.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = this.getMimeType(ext);
      const response = await fetch(`data:${mimeType};base64,${this.base64Content}`);
      const blob = await response.blob();

      // Use Clipboard API
      await navigator.clipboard.write([
        new ClipboardItem({
          [mimeType]: blob,
        }),
      ]);

      // Show brief success feedback
      dispatch('notification', {
        type: 'success',
        message: 'Image copied to clipboard',
      });
    } catch (error) {
      console.error('[ImageViewer] Failed to copy to clipboard:', error);
      dispatch('notification', {
        type: 'error',
        message: 'Failed to copy image',
      });
    }
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

export function createImageViewer(): Promise<ImageViewer> {
  return Promise.resolve(new ImageViewer());
}
