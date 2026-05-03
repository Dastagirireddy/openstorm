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
}

/**
 * Terminal tab types
 */
export type TerminalTabType = 'terminal' | 'output' | 'debug';

/**
 * Activity bar items
 */
export type ActivityItem =
  | 'explorer'
  | 'search'
  | 'commits'
  | 'pull-requests'
  | 'settings';

/**
 * Right activity bar items
 */
export type RightActivityItem = 'database' | '';

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
