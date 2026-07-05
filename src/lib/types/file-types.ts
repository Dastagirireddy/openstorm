/**
 * Shared type definitions for file system operations
 */

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
  is_executable: boolean;
  children?: FileNode[];
  expanded?: boolean;
}

/**
 * Tab types - discriminator for different content types
 */
export type TabType = 'file' | 'terminal' | 'openstorm' | 'graph';

/**
 * Tab state for editor tabs
 */
export interface EditorTab {
  id: string;
  name: string;
  path: string;
  modified: boolean;
  content: string;
  pinned?: boolean;
  lastUsed?: number;
  cursorLine?: number;
  cursorCol?: number;
  metadata?: Record<string, any>;
  /** Type of tab content - defaults to 'file' for backwards compatibility */
  tabType?: TabType;
  /** For terminal tabs: terminal instance ID */
  terminalId?: string;
}

/**
 * Terminal tab types
 */
export type TerminalTabType = 'terminal' | 'output' | 'debug';

/**
 * Activity bar items
 */
export type ActivityItem = 'explorer' | 'terminal' | 'ai' | 'graph';

/**
 * Right activity bar items
 */
export type RightActivityItem = 'database' | 'mcp' | 'models' | '';

/**
 * Save status states
 */
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

/**
 * Event detail types for custom events
 */
export interface FileSelectEventDetail {
  path: string;
  name?: string;
}

export interface ContentChangeEventDetail {
  path: string;
  content: string;
}

export interface TabSelectEventDetail {
  tabId: string;
  timestamp?: number;
}

export interface TabActionEventDetail {
  tabId: string;
}

export interface FolderOpenEventDetail {
  path: string;
}

export interface ActivityChangeEventDetail {
  item: ActivityItem;
}
