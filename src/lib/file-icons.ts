/**
 * File icon color mappings by extension
 * Centralized source for consistent file icon colors across components
 *
 * Colors are now defined as CSS variable names for theme support.
 * Use getCssVariable() to retrieve actual color values at runtime.
 */
export const FILE_ICON_COLORS: Record<string, string> = {
  // Rust
  rs: 'var(--file-rs)',
  // Go
  go: 'var(--file-go)',
  // TypeScript/JavaScript
  ts: 'var(--file-ts)',
  tsx: 'var(--file-tsx)',
  js: 'var(--file-js)',
  jsx: 'var(--file-jsx)',
  mjs: 'var(--file-js)',
  cjs: 'var(--file-js)',
  json: 'var(--file-json)',
  // YAML/TOML
  yaml: 'var(--file-yaml)',
  yml: 'var(--file-yaml)',
  toml: 'var(--file-toml)',
  // Styles
  css: 'var(--file-css)',
  scss: 'var(--file-scss)',
  sass: 'var(--file-scss)',
  less: 'var(--file-less)',
  // Web
  html: 'var(--file-html)',
  htm: 'var(--file-html)',
  xml: 'var(--file-xml)',
  sql: 'var(--file-sql)',
  // Python
  py: 'var(--file-py)',
  ipynb: 'var(--file-py)',
  // JVM
  java: 'var(--file-java)',
  kt: 'var(--file-kt)',
  kts: 'var(--file-kt)',
  scala: 'var(--file-scss)',
  swift: 'var(--file-swift)',
  // C/C++
  c: 'var(--file-c)',
  cpp: 'var(--file-cpp)',
  cc: 'var(--file-cpp)',
  cxx: 'var(--file-cpp)',
  h: 'var(--file-cpp)',
  hpp: 'var(--file-cpp)',
  hxx: 'var(--file-cpp)',
  // Other languages
  cs: 'var(--file-cs)',
  php: 'var(--file-php)',
  rb: 'var(--file-rb)',
  erb: 'var(--file-rb)',
  sh: 'var(--file-sh)',
  bash: 'var(--file-sh)',
  zsh: 'var(--file-sh)',
  // Docs
  md: 'var(--file-md)',
  markdown: 'var(--file-md)',
  txt: 'var(--file-txt)',
  log: 'var(--file-txt)',
  // Config
  env: 'var(--file-txt)',
  gitignore: 'var(--file-gitignore)',
  gitattributes: 'var(--file-gitignore)',
  dockerfile: 'var(--file-dockerfile)',
  makefile: 'var(--file-txt)',
  cmake: 'var(--file-txt)',
  lock: 'var(--file-json)',
};

/**
 * Get color for a file extension
 * Returns CSS variable reference for theme support
 */
export function getFileIconColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return (ext && FILE_ICON_COLORS[ext]) || 'var(--file-txt)';
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() || '';
}
