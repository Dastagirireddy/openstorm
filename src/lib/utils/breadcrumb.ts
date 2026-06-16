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
    rs: 'var(--file-rs, #dea584)',
    go: 'var(--file-go, #00add8)',
    ts: 'var(--file-ts, #3178c6)',
    tsx: 'var(--file-tsx, #3178c6)',
    js: 'var(--file-js, #f7df1e)',
    jsx: 'var(--file-jsx, #f7df1e)',
    json: 'var(--file-json, #f7df1e)',
    yaml: 'var(--file-yaml, #cb171e)',
    yml: 'var(--file-yaml, #cb171e)',
    toml: 'var(--file-toml, #9c4221)',
    css: 'var(--file-css, #42a5f5)',
    scss: 'var(--file-scss, #c6538c)',
    sass: 'var(--file-scss, #c6538c)',
    less: 'var(--file-less, #1d365d)',
    html: 'var(--file-html, #e34c26)',
    xml: 'var(--file-xml, #f1662a)',
    sql: 'var(--file-sql, #4479a1)',
    py: 'var(--file-py, #3776ab)',
    java: 'var(--file-java, #f89820)',
    kt: 'var(--file-kt, #7f52ff)',
    kts: 'var(--file-kt, #7f52ff)',
    scala: '#dc322f',
    swift: 'var(--file-swift, #f05138)',
    c: 'var(--file-c, #519aba)',
    cpp: 'var(--file-cpp, #519aba)',
    cs: 'var(--file-cs, #239120)',
    php: 'var(--file-php, #777bb4)',
    rb: 'var(--file-rb, #cc342d)',
    md: 'var(--file-md, #519aba)',
    gitignore: 'var(--file-gitignore, #f44d27)',
    dockerfile: 'var(--file-dockerfile, #2496ed)',
  };

  return colorMap[ext] || 'var(--app-secondary-foreground, #5f6368)';
}
