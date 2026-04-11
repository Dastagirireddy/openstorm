/**
 * File icon color mappings by extension
 * Centralized source for consistent file icon colors across components
 */
export const FILE_ICON_COLORS: Record<string, string> = {
  // Rust
  rs: '#dea584',
  // Go
  go: '#00add8',
  // TypeScript/JavaScript
  ts: '#3178c6',
  tsx: '#3178c6',
  js: '#f7df1e',
  jsx: '#f7df1e',
  mjs: '#f7df1e',
  cjs: '#f7df1e',
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
  htm: '#e34c26',
  xml: '#f1662a',
  sql: '#4479a1',
  // Python
  py: '#3776ab',
  ipynb: '#3776ab',
  // JVM
  java: '#f89820',
  kt: '#7f52ff',
  kts: '#7f52ff',
  scala: '#dc322f',
  swift: '#f05138',
  // C/C++
  c: '#519aba',
  cpp: '#519aba',
  cc: '#519aba',
  cxx: '#519aba',
  h: '#519aba',
  hpp: '#519aba',
  hxx: '#519aba',
  // Other languages
  cs: '#239120',
  php: '#777bb4',
  rb: '#cc342d',
  erb: '#cc342d',
  sh: '#4eaa25',
  bash: '#4eaa25',
  zsh: '#4eaa25',
  // Docs
  md: '#519aba',
  markdown: '#519aba',
  txt: '#5a5a5a',
  log: '#5a5a5a',
  // Config
  env: '#5a5a5a',
  gitignore: '#f44d27',
  gitattributes: '#f44d27',
  dockerfile: '#2496ed',
  makefile: '#5a5a5a',
  cmake: '#5a5a5a',
  lock: '#f7df1e',
};

/**
 * Get color for a file extension
 */
export function getFileIconColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return (ext && FILE_ICON_COLORS[ext]) || '#5a5a5a';
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() || '';
}
