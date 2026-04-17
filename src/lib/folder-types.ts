/**
 * Folder type detection for IntelliJ-style folder coloring
 */

export type FolderType =
  | 'root'
  | 'build'          // Orange - build artifacts, dist
  | 'tmp'            // Gray - temp files, cache
  | 'node_modules'   // Purple - dependencies
  | 'vcs'            // Green - version control (.git)
  | 'ide'            // Blue - IDE settings (.vscode, .idea)
  | 'source';        // Default - source code (committed to git)

export interface FolderColor {
  type: FolderType;
  color: string;
  iconColor: string;
  bgColor: string;
}

// Folder name patterns for type detection
// Only folders that are typically NOT committed to git or have special system purpose

const BUILD_PATTERNS = [
  'build', 'dist', 'out', 'target', 'bin', 'obj',
  '.build', '.dist', '.output', '.cache'
];

const TMP_PATTERNS = [
  'tmp', 'temp', 'cache', '.tmp', '.temp', '.cache',
  'coverage', '.coverage', '.nyc_output'
];

const NODE_MODULES_PATTERNS = [
  'node_modules', 'vendor', 'packages', '.pnpm-store'
];

const VCS_PATTERNS = [
  '.git', '.svn', '.hg', '.bzr', 'CVS'
];

// IDE settings - not source code, but editor configuration
const IDE_PATTERNS = [
  '.vscode', '.idea', '.eclipse', '.project'
];

/**
 * Detect folder type based on name patterns
 * Only special folders (not committed to git) get colored/filled treatment
 */
export function detectFolderType(folderName: string, folderPath: string = ''): FolderType {
  const name = folderName.toLowerCase();
  const path = folderPath.toLowerCase();
  const fullName = path ? `${path}/${name}` : name;

  // Check each category - only folders typically excluded from git
  if (BUILD_PATTERNS.some(p => name === p || fullName.endsWith(p))) return 'build';
  if (TMP_PATTERNS.some(p => name === p || fullName.endsWith(p))) return 'tmp';
  if (NODE_MODULES_PATTERNS.some(p => name === p || fullName.endsWith(p))) return 'node_modules';
  if (VCS_PATTERNS.some(p => name === p || fullName.endsWith(p))) return 'vcs';
  if (IDE_PATTERNS.some(p => name === p || fullName.endsWith(p))) return 'ide';

  return 'source';
}

/**
 * Get color for folder type (IntelliJ-style)
 * Only folders NOT committed to git get special coloring.
 * Background colors are subtle tints of the icon color.
 */
export function getFolderColor(type: FolderType): FolderColor {
  switch (type) {
    case 'build':
      return { type, color: '#b35c00', iconColor: '#cc6600', bgColor: '#fff0e0' }; // Orange
    case 'tmp':
      return { type, color: '#6a6a6a', iconColor: '#8a8a8a', bgColor: '#f5f5f5' }; // Gray
    case 'node_modules':
      return { type, color: '#6b4c9a', iconColor: '#7c5bbf', bgColor: '#f3e8ff' }; // Purple
    case 'vcs':
      return { type, color: '#006633', iconColor: '#008040', bgColor: '#e6f6ed' }; // Green
    case 'ide':
      return { type, color: '#0066cc', iconColor: '#0078d4', bgColor: '#e6f2ff' }; // Blue
    case 'root':
      return { type, color: '#5a5a5a', iconColor: '#c9a228', bgColor: 'transparent' };
    case 'source':
    default:
      return { type, color: '#5a5a5a', iconColor: '#5a5a5a', bgColor: 'transparent' };
  }
}

/**
 * Get full folder info with type and colors
 */
export function getFolderInfo(folderName: string, folderPath: string = ''): FolderColor {
  const type = detectFolderType(folderName, folderPath);
  return getFolderColor(type);
}

/**
 * Check if folder should use filled icon style
 * Returns true for special folders (build, tmp, config, etc.), false for regular source folders
 */
export function isSpecialFolder(folderName: string, folderPath: string = ''): boolean {
  const type = detectFolderType(folderName, folderPath);
  return type !== 'source' && type !== 'root';
}
