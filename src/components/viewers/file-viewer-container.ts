/**
 * File Viewer Container - Swaps between different viewers based on file type
 *
 * This component manages the lifecycle of individual viewers and provides
 * a unified API for the rest of the application.
 */

import { html } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import { registry } from '../../viewers/registry.js';
import type { FileViewer, ViewerAction } from '../../viewers/types.js';
import type { EditorTab } from '../../lib/types/file-types.js';
import { getFileExtension } from '../../lib/icons/file-icons.js';
import { dispatch } from '../../lib/types/events.js';

@customElement('file-viewer-container')
export class FileViewerContainer extends TailwindElement() {
  @property({ type: Array }) tabs: EditorTab[] = [];
  @property({ type: String }) activeTabId: string = '';

  @state() private currentViewer: FileViewer | null = null;
  @state() private filePath: string = '';
  @state() private content: string = '';
  @state() private toolbarActions: ViewerAction[] = [];

  // Viewer-specific state for text editor compatibility
  @state() private breakpoints: Map<string, any[]> = new Map();
  @state() private debugLine: number | null = null;
  @state() private isDebugging = false;

  private viewerContainer: HTMLElement | null = null;
  private _pendingOpen: { path: string; content: string } | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    // Listen for open-file-external events
    document.addEventListener('open-file-external', this.handleOpenFileExternal.bind(this));
    // Listen for save-file events
    document.addEventListener('save-file', this.handleSaveFile.bind(this));
    // Listen for debug events
    document.addEventListener('debug-session-started', this.handleDebugSessionStarted.bind(this));
    document.addEventListener('debug-session-ended', this.handleDebugSessionEnded.bind(this));
    document.addEventListener('debug-stopped', this.handleDebugStopped.bind(this));
    // Listen for format-code events
    document.addEventListener('format-code', this.handleFormatCode.bind(this));
    // Listen for clear-editor events (when all tabs are closed)
    document.addEventListener('clear-editor', this.handleClearEditor.bind(this));
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('open-file-external', this.handleOpenFileExternal.bind(this));
    document.removeEventListener('clear-editor', this.handleClearEditor.bind(this));
    if (this.currentViewer) {
      this.currentViewer.unmount();
      this.currentViewer = null;
    }
  }

  private handleClearEditor(): void {
    if (this.currentViewer) {
      this.currentViewer.unmount();
      this.currentViewer = null;
    }
    this.filePath = '';
    this.content = '';
    this.toolbarActions = [];
    if (this.viewerContainer) {
      this.viewerContainer.innerHTML = '';
    }
  }

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    // Handle tab change
    if (changedProperties.has('activeTabId')) {
      // Previous active tab
      const prevTabId = changedProperties.get('activeTabId') as string;

      // New active tab
      if (this.activeTabId) {
        const tab = this.tabs.find(t => t.id === this.activeTabId);
        if (tab) {
          this.openFile(tab.path, tab.content);
          return;
        }
      }

      // No valid tab selected - clear viewer
      if (this.currentViewer) {
        this.currentViewer.unmount();
        this.currentViewer = null;
      }
      this.filePath = '';
      this.content = '';
      this.toolbarActions = [];
      if (this.viewerContainer) {
        this.viewerContainer.innerHTML = '';
      }
    }
  }

  private handleOpenFileExternal(e: CustomEvent<{ path: string; content: string }>): void {
    const { path, content } = e.detail;
    this.openFile(path, content);
  }

  private handleSaveFile(): void {
    this.saveFile();
  }

  private handleDebugSessionStarted(): void {
    this.isDebugging = true;
    if (this.currentViewer && 'setDebugMode' in this.currentViewer) {
      (this.currentViewer as any).setDebugMode(true);
    }
  }

  private handleDebugSessionEnded(): void {
    this.isDebugging = false;
    this.debugLine = null;
    if (this.currentViewer && 'setDebugMode' in this.currentViewer) {
      (this.currentViewer as any).setDebugMode(false);
    }
    if (this.currentViewer && 'setDebugLine' in this.currentViewer) {
      (this.currentViewer as any).setDebugLine(null);
    }
  }

  private async handleDebugStopped(e?: CustomEvent): Promise<void> {
    console.log('[FileViewerContainer] Debug stopped', e?.detail);

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const stackFrames = await invoke<any[]>('get_stack_trace');
      if (stackFrames.length > 0) {
        const topFrame = stackFrames[0];
        const targetPath = topFrame.source?.path || topFrame.source?.name;

        if (targetPath) {
          const normalizedTargetPath = targetPath.replace('file://', '');

          // If stopped in a different file, open it first
          if (this.filePath !== normalizedTargetPath) {
            dispatch('go-to-location', {
              uri: targetPath.startsWith('file://') ? targetPath : `file://${targetPath}`,
              line: topFrame.line - 1,
              column: topFrame.column - 1,
            });
          }

          // Wait for file to open (if needed), then highlight the line
          setTimeout(() => {
            this.setDebugLine(topFrame.line);
            console.log('[FileViewerContainer] Set debug line to:', topFrame.line);
          }, 100);
        }
      }
    } catch (error) {
      console.error('[FileViewerContainer] Failed to get stack trace:', error);
    }
  }

  private handleFormatCode(): void {
    // Format code is handled by the text viewer directly
    dispatch('format-code-request', { path: this.filePath, content: this.content });
  }

  /**
   * Open a file in the appropriate viewer
   */
  async openFile(path: string, content: string): Promise<void> {
    const ext = getFileExtension(path);
    const viewer = await registry.getViewerForExtension(ext);

    if (!viewer) {
      console.error(`[FileViewerContainer] No viewer found for extension: ${ext}`);
      return;
    }

    // Unmount previous viewer
    if (this.currentViewer) {
      this.currentViewer.unmount();
      this.currentViewer = null;
    }

    // Store file info
    this.filePath = path;
    this.content = content;

    // Mount new viewer
    this.currentViewer = viewer;
    await this.updateComplete;

    // Get viewer container element
    this.viewerContainer = this.renderRoot.querySelector('#viewer-container');
    if (!this.viewerContainer) {
      throw new Error('Viewer container not found');
    }

    // Clear container
    this.viewerContainer.innerHTML = '';

    // Mount and load file
    viewer.mount(this.viewerContainer);
    await viewer.loadFile(path, content);

    // Get toolbar actions from viewer
    this.toolbarActions = viewer.getToolbarActions?.() || [];

    // For text viewer, expose breakpoint/debug API
    if ('setBreakpointsForFile' in viewer) {
      // Restore breakpoints for this file if any
      const fileBreakpoints = this.breakpoints.get(path) || [];
      (viewer as any).setBreakpointsForFile(fileBreakpoints);
    }
  }

  /**
   * Save the current file
   */
  async saveFile(): Promise<void> {
    if (!this.currentViewer?.saveFile) {
      console.warn('[FileViewerContainer] Viewer does not support saving');
      return;
    }

    try {
      const newContent = await this.currentViewer.saveFile();
      this.content = newContent;
      dispatch('file-saved', { path: this.filePath, content: newContent });
    } catch (error) {
      console.error('[FileViewerContainer] Save failed:', error);
    }
  }

  /**
   * Check if current file is modified
   */
  isDirtyState(): boolean {
    return this.currentViewer?.isDirtyState() ?? false;
  }

  /**
   * Set breakpoints for the current file (text viewer specific)
   */
  setBreakpoints(breakpoints: any[]): void {
    if (this.filePath) {
      this.breakpoints.set(this.filePath, breakpoints);
    }

    if (this.currentViewer && 'setBreakpointsForFile' in this.currentViewer) {
      (this.currentViewer as any).setBreakpointsForFile(breakpoints);
    }
  }

  /**
   * Set debug line highlight (text viewer specific)
   */
  setDebugLine(line: number | null): void {
    this.debugLine = line;

    if (this.currentViewer && 'setDebugLine' in this.currentViewer) {
      (this.currentViewer as any).setDebugLine(line);
    }
  }

  /**
   * Set debug mode (text viewer specific)
   */
  setDebugMode(enabled: boolean): void {
    this.isDebugging = enabled;

    if (this.currentViewer && 'setDebugMode' in this.currentViewer) {
      (this.currentViewer as any).setDebugMode(enabled);
    }
  }

  /**
   * Get toolbar actions from current viewer
   */
  getToolbarActions(): ViewerAction[] {
    return this.toolbarActions;
  }

  render() {
    return html`
      <div class="flex flex-col h-full overflow-hidden" style="background-color: var(--app-bg);">
        ${this.toolbarActions.length > 0
          ? html`<div class="h-[35px] shrink-0 border-b border-[var(--app-border)] flex items-center px-2 gap-1" style="background-color: var(--app-toolbar-background);">
              ${this.toolbarActions.map(action => html`
                <button
                  class="px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors"
                  style="
                    color: var(--app-foreground);
                    background: transparent;
                    border: 1px solid transparent;
                  "
                  @mouseenter=${(e: Event) => {
                    const target = e.target as HTMLElement;
                    target.style.background = 'var(--app-toolbar-hover)';
                    target.style.borderColor = 'var(--app-border)';
                  }}
                  @mouseleave=${(e: Event) => {
                    const target = e.target as HTMLElement;
                    target.style.background = 'transparent';
                    target.style.borderColor = 'transparent';
                  }}
                  title="${action.label}"
                  @click=${() => action.onClick()}
                  ?disabled=${action.enabled === false}
                >
                  <iconify-icon icon="${action.icon}" width="14"></iconify-icon>
                  ${action.label}
                </button>
              `)}
            </div>`
          : ''}
        <div
          id="viewer-container"
          class="flex-1 overflow-hidden"
          style="border-top-color: var(--app-border);"
        ></div>
      </div>
    `;
  }
}
