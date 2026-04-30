/**
 * Viewer Metadata - Describes what a viewer supports
 */
export interface ViewerMetadata {
  id: string;
  displayName: string;
  supportedExtensions: string[];
  supportedMimeTypes?: string[];
}

/**
 * Toolbar action that a viewer can provide
 */
export interface ViewerAction {
  id: string;
  icon: string;
  label: string;
  onClick: () => void;
  enabled?: boolean;
}

/**
 * File Viewer Interface - All viewers must implement this
 */
export interface FileViewer {
  readonly metadata: ViewerMetadata;

  // Lifecycle
  mount(container: HTMLElement): void;
  unmount(): void;

  // File operations
  loadFile(path: string, content: string): Promise<void>;
  saveFile?(): Promise<string>;

  // State
  isDirtyState(): boolean;
  canSave(): boolean;

  // Optional capabilities
  getToolbarActions?(): ViewerAction[];
}

/**
 * Viewer Factory - Lazy loads a viewer module
 */
export type ViewerFactory = () => Promise<FileViewer>;
