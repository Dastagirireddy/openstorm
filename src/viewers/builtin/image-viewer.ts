/**
 * Image Viewer - Displays image files with zoom and pan support (Lit Element version)
 */

import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import type { ViewerMetadata, ViewerAction } from '../types.js';
import { invoke } from '@tauri-apps/api/core';
import { dispatch } from '../../lib/types/events.js';

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
}

@customElement('image-viewer')
export class ImageViewer extends TailwindElement() {
  readonly metadata: ViewerMetadata = {
    id: 'image',
    displayName: 'Image Viewer',
    supportedExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'],
  };

  @property({ type: String })
  filePath = '';

  @state()
  private base64Content = '';

  @state()
  private imageMetadata: ImageMetadata | null = null;

  @state()
  private scale = 1;

  @state()
  private offsetX = 0;

  @state()
  private offsetY = 0;

  @state()
  private rotation = 0;

  private isDragging = false;
  private startX = 0;
  private startY = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this.setupKeyboardShortcuts();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeKeyboardShortcuts();
  }

  async loadFile(path: string, content: string): Promise<void> {
    console.log('[ImageViewer] loadFile called with path:', path);
    this.filePath = path;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.rotation = 0;

    try {
      // Read file as base64
      console.log('[ImageViewer] Calling read_file_base64...');
      this.base64Content = await invoke<string>('read_file_base64', { path });
      console.log('[ImageViewer] Base64 content loaded, length:', this.base64Content.length);

      // Force a re-render
      this.requestUpdate();

      // Fetch metadata
      try {
        console.log('[ImageViewer] Getting image metadata...');
        this.imageMetadata = await invoke<ImageMetadata>('get_image_metadata', { path });
        console.log('[ImageViewer] Metadata loaded:', this.imageMetadata);
      } catch (e) {
        console.warn('[ImageViewer] Failed to get metadata:', e);
        this.imageMetadata = null;
      }
    } catch (error) {
      console.error('[ImageViewer] Failed to load image:', error);
    }
  }

  isDirtyState(): boolean {
    return false;
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

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private removeKeyboardShortcuts(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.isConnected) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const modKey = isMac ? e.metaKey : e.ctrlKey;

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

    if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      this.rotate(90);
      return;
    }

    if (modKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      this.copyToClipboard();
      return;
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();

    let delta: number;
    if (e.ctrlKey) {
      delta = e.deltaY > 0 ? 0.95 : 1.05;
    } else {
      delta = e.deltaY > 0 ? 0.9 : 1.1;
    }

    const newScale = Math.max(0.1, Math.min(10, this.scale * delta));

    if (newScale !== this.scale) {
      this.scale = newScale;
      this.updateToolbarActions();
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isDragging = true;
      this.startX = e.clientX - this.offsetX;
      this.startY = e.clientY - this.offsetY;
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.offsetX = e.clientX - this.startX;
    this.offsetY = e.clientY - this.startY;
  };

  private handleMouseUp = (): void => {
    this.isDragging = false;
  };

  private updateTransform(): void {
    const imgWrapper = this.renderRoot.querySelector('#img-wrapper') as HTMLElement;
    if (imgWrapper) {
      imgWrapper.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale}) rotate(${this.rotation}deg)`;
    }
  }

  private updateToolbarActions(): void {
    dispatch('viewer-actions-changed', { actions: this.getToolbarActions() });
  }

  private zoom(factor: number): void {
    this.scale = Math.max(0.1, Math.min(10, this.scale * factor));
    this.updateTransform();
    this.updateToolbarActions();
  }

  private resetZoom(): void {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.updateTransform();
    this.updateToolbarActions();
  }

  private fitToScreen(): void {
    if (!this.imageMetadata) return;

    const container = this.renderRoot.querySelector('#viewport') as HTMLElement;
    if (!container) return;

    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;

    const scaleX = containerWidth / this.imageMetadata.width;
    const scaleY = containerHeight / this.imageMetadata.height;

    this.scale = Math.min(scaleX, scaleY, 1);
    this.offsetX = 0;
    this.offsetY = 0;

    this.updateTransform();
    this.updateToolbarActions();
  }

  private actualSize(): void {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.updateTransform();
    this.updateToolbarActions();
  }

  private rotate(degrees: number): void {
    this.rotation = (this.rotation + degrees) % 360;
    this.updateTransform();
  }

  private async copyToClipboard(): Promise<void> {
    if (!this.base64Content || !this.filePath) return;

    try {
      const ext = this.filePath.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = this.getMimeType(ext);
      const response = await fetch(`data:${mimeType};base64,${this.base64Content}`);
      const blob = await response.blob();

      await navigator.clipboard.write([
        new ClipboardItem({
          [mimeType]: blob,
        }),
      ]);

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
      ico: 'image/x-icon',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  render() {
    const ext = this.filePath.split('.').pop()?.toLowerCase() || '';
    const mimeType = this.getMimeType(ext);
    const src = `data:${mimeType};base64,${this.base64Content}`;
    const fileName = this.filePath.split('/').pop() || 'Image';

    if (!this.base64Content) {
      return html`
        <div class="flex flex-col items-center justify-center h-full text-sm" style="color: var(--app-disabled-foreground);">
          <iconify-icon icon="lucide:image-off" width="48" height="48"></iconify-icon>
          <p class="mt-4">Loading image...</p>
        </div>
      `;
    }

    return html`
      <div id="viewport"
        class="relative w-full h-full flex items-center justify-center"
        style="
          padding: 40px;
          box-sizing: border-box;
          background: var(--app-workbench-bg);
          touch-action: none;
        "
        @wheel=${this.handleWheel}
        @mousedown=${this.handleMouseDown}
        @mousemove=${this.handleMouseMove}
        @mouseup=${this.handleMouseUp}
        @mouseleave=${this.handleMouseUp}
      >
        <div
          id="img-wrapper"
          class="origin-center"
          style="
            transform: translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale}) rotate(${this.rotation}deg);
            filter: drop-shadow(0 8px 32px rgba(0, 0, 0, 0.3));
            will-change: transform;
          "
        >
          <img
            src=${src}
            alt=${fileName}
            class="select-none pointer-events-none block rounded-lg"
            draggable="false"
            style="
              image-rendering: high-quality;
              max-width: 100%;
              max-height: 100%;
              width: auto;
              height: auto;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.1);
            "
          />
        </div>

        ${this.imageMetadata
          ? html`
              <div class="absolute bottom-4 right-4 px-4 py-3 rounded-xl text-xs flex items-center gap-3"
                style="
                  background: var(--app-badge-bg);
                  backdrop-filter: blur(12px);
                  border: 1px solid var(--app-badge-border);
                  box-shadow: 0 8px 32px var(--app-badge-shadow);
                "
              >
                <span class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold"
                  style="background: var(--app-hover-background); color: var(--app-foreground); border: 1px solid var(--app-border);"
                >
                  <iconify-icon icon="mdi:image-size" width="14"></iconify-icon>
                  ${this.imageMetadata.width}×${this.imageMetadata.height}
                </span>
                <span class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold"
                  style="background: var(--app-hover-background); color: var(--app-foreground); border: 1px solid var(--app-border);"
                >
                  <iconify-icon icon="mdi:file-type" width="14"></iconify-icon>
                  ${this.imageMetadata.format.toUpperCase()}
                </span>
                <span class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold"
                  style="background: var(--app-hover-background); color: var(--app-foreground); border: 1px solid var(--app-border);"
                >
                  <iconify-icon icon="mdi:harddrive" width="14"></iconify-icon>
                  ${this.formatFileSize(this.imageMetadata.size)}
                </span>
              </div>
            `
          : ''}

        <div class="absolute bottom-4 left-4 px-3 py-2 rounded-xl text-xs font-bold"
          style="
            background: var(--app-badge-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--app-badge-border);
            color: var(--app-badge-foreground);
          "
        >
          ${Math.round(this.scale * 100)}%
        </div>
      </div>
    `;
  }
}
