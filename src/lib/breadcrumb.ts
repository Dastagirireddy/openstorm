/**
 * Breadcrumb utilities for path navigation
 * Parses file paths into segments with appropriate icons
 */

export interface BreadcrumbSegment {
  label: string;
  path?: string;
  icon?: string;
  clickable?: boolean;
}

/**
 * File extension to icon mapping
 */
const FILE_ICON_MAP: Record<string, string> = {
  // Rust
  rs: 'file-code',
  // Go
  go: 'file-code',
  // TypeScript/JavaScript
  ts: 'file-code',
  tsx: 'file-code',
  js: 'file-code',
  jsx: 'file-code',
  mjs: 'file-code',
  cjs: 'file-code',
  json: 'file-json',
  // YAML/TOML
  yaml: 'file-code',
  yml: 'file-code',
  toml: 'file-code',
  // Styles
  css: 'file-code',
  scss: 'file-code',
  sass: 'file-code',
  less: 'file-code',
  // Web
  html: 'file-code',
  htm: 'file-code',
  xml: 'file-code',
  sql: 'file-code',
  // Python
  py: 'file-code',
  ipynb: 'file-code',
  // JVM
  java: 'file-code',
  kt: 'file-code',
  kts: 'file-code',
  scala: 'file-code',
  swift: 'file-code',
  // C/C++
  c: 'file-code',
  cpp: 'file-code',
  cc: 'file-code',
  cxx: 'file-code',
  h: 'file-code',
  hpp: 'file-code',
  hxx: 'file-code',
  // Other languages
  cs: 'file-code',
  php: 'file-code',
  rb: 'file-code',
  erb: 'file-code',
  sh: 'file-code',
  bash: 'file-code',
  zsh: 'file-code',
  // Docs
  md: 'file-text',
  markdown: 'file-text',
  txt: 'file-text',
  log: 'file-text',
  // Config
  env: 'file-code',
  gitignore: 'file-code',
  gitattributes: 'file-code',
  dockerfile: 'file-code',
  makefile: 'file-code',
  cmake: 'file-code',
  lock: 'file-code',
};

/**
 * Get icon name for a file path
 * @param name - The file or folder name
 * @param isFolder - Whether this is definitely a folder (intermediate path segment)
 */
export function getFileIcon(name: string, isFolder: boolean = false): string {
  const lowerName = name.toLowerCase();

  // If explicitly marked as folder (intermediate path segment)
  if (isFolder) {
    return 'folder';
  }

  // Check for specific file types first (handles extensionless files like Makefile, Dockerfile)
  if (lowerName === 'package.json') return 'file-json';
  if (lowerName === 'cargo.toml') return 'file-code';
  if (lowerName === 'cargo.lock') return 'file-code';
  if (lowerName === 'tsconfig.json') return 'file-json';
  if (lowerName === 'package-lock.json') return 'file-json';
  if (lowerName === 'yarn.lock') return 'file-code';
  if (lowerName === 'pnpm-lock.yaml') return 'file-code';
  if (lowerName === 'dockerfile') return 'file-code';
  if (lowerName === 'makefile') return 'file-code';
  if (lowerName === 'readme.md') return 'file-text';
  if (lowerName === 'license') return 'file-text';
  if (lowerName === 'license.md') return 'file-text';
  if (lowerName === 'license.txt') return 'file-text';

  // Files with extensions
  if (name.includes('.')) {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return FILE_ICON_MAP[ext] || 'file';
  }

  // Extensionless files (like 'test2', 'README', 'CHANGELOG') - treat as generic file
  return 'file';
}

/**
 * Parse a file path into breadcrumb segments
 */
export function parsePathToSegments(projectPath: string, activeFile: string): BreadcrumbSegment[] {
  if (!activeFile) return [];

  // Get relative path from project root
  let relativePath = activeFile;
  if (projectPath && activeFile.startsWith(projectPath)) {
    relativePath = activeFile.substring(projectPath.length).replace(/^[/\\]/, '');
  }

  const parts = relativePath.split(/[/\\]/);
  const segments: BreadcrumbSegment[] = [];

  let accumulatedPath = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;

    // Build path for this segment
    accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;

    // Intermediate segments are always folders, last segment is the file
    const icon = getFileIcon(part, !isLast);

    segments.push({
      label: part,
      path: accumulatedPath,
      icon,
      clickable: !isLast, // Only folders are clickable
    });
  }

  return segments;
}

/**
 * Get color for a file icon based on extension
 */
export function getFileIconColor(path: string): string {
  const basename = path.split('/').pop() || '';
  const ext = basename.split('.').pop()?.toLowerCase() || '';

  const colorMap: Record<string, string> = {
    // Rust
    rs: '#dea584',
    // Go
    go: '#00add8',
    // TypeScript/JavaScript
    ts: '#3178c6',
    tsx: '#3178c6',
    js: '#f7df1e',
    jsx: '#f7df1e',
    json: '#f7df1e',
    // YAML/TOML
    yaml: '#cb171e',
    yml: '#cb171e',
    toml: '#9c4221',
    // Styles
    css: '#42a5f5',
    scss: '#c6538c',
    sass: '#c6538c',
    less: '#1d365d',
    // Web
    html: '#e34c26',
    xml: '#f1662a',
    sql: '#4479a1',
    // Python
    py: '#3776ab',
    // JVM
    java: '#f89820',
    kt: '#7f52ff',
    kts: '#7f52ff',
    scala: '#dc322f',
    swift: '#f05138',
    // C/C++
    c: '#519aba',
    cpp: '#519aba',
    // Other
    md: '#519aba',
    gitignore: '#f44d27',
    dockerfile: '#2496ed',
  };

  return colorMap[ext] || '#5f6368';
}
