/**
 * Folder type detection for folder coloring
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
 * Get color for folder type
 * Only folders NOT committed to git get special coloring.
 * Background colors are subtle tints of the icon color.
 *
 * Colors are now CSS variables for theme support.
 */
export function getFolderColor(type: FolderType): FolderColor {
  switch (type) {
    case 'build':
      return {
        type,
        color: 'var(--folder-build-color)',
        iconColor: 'var(--folder-build-color)',
        bgColor: 'var(--folder-build-bg)',
      };
    case 'tmp':
      return {
        type,
        color: 'var(--folder-tmp-color)',
        iconColor: 'var(--folder-tmp-color)',
        bgColor: 'var(--folder-tmp-bg)',
      };
    case 'node_modules':
      return {
        type,
        color: 'var(--folder-node-modules-color)',
        iconColor: 'var(--folder-node-modules-color)',
        bgColor: 'var(--folder-node-modules-bg)',
      };
    case 'vcs':
      return {
        type,
        color: 'var(--folder-vcs-color)',
        iconColor: 'var(--folder-vcs-color)',
        bgColor: 'var(--folder-vcs-bg)',
      };
    case 'ide':
      return {
        type,
        color: 'var(--folder-ide-color)',
        iconColor: 'var(--folder-ide-color)',
        bgColor: 'var(--folder-ide-bg)',
      };
    case 'root':
      return { type, color: 'var(--project-generic)', iconColor: 'var(--project-generic)', bgColor: 'transparent' };
    case 'source':
    default:
      return { type, color: 'var(--app-foreground)', iconColor: 'var(--app-foreground)', bgColor: 'transparent' };
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
