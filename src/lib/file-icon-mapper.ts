/**
 * File icon mappings using devicon (transparent icons without backgrounds)
 * Maps file extensions and names to devicon icon names
 */

const extensionMap: Record<string, string> = {
  // Languages
  rs: 'rust',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  ipynb: 'python',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  swift: 'swift',
  c: 'c',
  cpp: 'cplusplus',
  cc: 'cplusplus',
  cxx: 'cplusplus',
  h: 'cplusplus',
  hpp: 'cplusplus',
  hxx: 'cplusplus',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  erb: 'ruby',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  // Web
  html: 'html5',
  htm: 'html5',
  css: 'css3',
  scss: 'sass',
  sass: 'sass',
  less: 'css3',
  xml: 'xml',
  svg: 'svg',
  sql: 'postgresql',
  // Config
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'rust',
  ini: 'json',
  env: 'bash',
  gitignore: 'git',
  gitattributes: 'git',
  gitmodules: 'git',
  dockerfile: 'docker',
  dockerignore: 'docker',
  makefile: 'bash',
  cmake: 'cmake',
  cargo: 'rust',
  lock: 'rust',
  // Docs
  md: 'markdown',
  markdown: 'markdown',
  txt: 'markdown',
  log: 'markdown',
  pdf: 'markdown',
  // Images - use markdown icon as fallback (document-like)
  png: 'markdown',
  jpg: 'markdown',
  jpeg: 'markdown',
  gif: 'markdown',
  webp: 'markdown',
  ico: 'markdown',
  bmp: 'markdown',
  // Archives - use markdown icon as fallback
  zip: 'markdown',
  tar: 'markdown',
  gz: 'markdown',
  rar: 'markdown',
  '7z': 'markdown',
  // Binaries - use language-specific icons
  exe: 'csharp',
  dll: 'csharp',
  // Rust binaries
  bin: 'rust',
  so: 'rust',
  dylib: 'rust',
  o: 'rust',
  a: 'rust',
  // Other
  vue: 'vuejs',
  svelte: 'svelte',
  sol: 'solidity',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  clj: 'clojure',
  cljs: 'clojure',
  dart: 'dart',
  flutter: 'flutter',
  lua: 'lua',
  r: 'r',
};

const fileNameMap: Record<string, string> = {
  'package.json': 'nodejs',
  'package-lock.json': 'nodejs',
  'tsconfig.json': 'typescript',
  'webpack.config.js': 'webpack',
  'webpack.config.ts': 'webpack',
  'vite.config.js': 'vite',
  'vite.config.ts': 'vite',
  'rollup.config.js': 'rollup',
  'babel.config.js': 'babel',
  '.babelrc': 'babel',
  'eslint.config.js': 'eslint',
  '.eslintrc': 'eslint',
  '.eslintrc.json': 'eslint',
  '.eslintrc.js': 'eslint',
  'prettier.config.js': 'prettier',
  '.prettierrc': 'prettier',
  'tailwind.config.js': 'tailwindcss',
  'tailwind.config.ts': 'tailwindcss',
  'jest.config.js': 'jest',
  'jest.config.ts': 'jest',
  'vitest.config.js': 'vitest',
  'vitest.config.ts': 'vitest',
  'cargo.toml': 'rust',
  'cargo.lock': 'rust',
  'go.mod': 'go',
  'go.sum': 'go',
  'go.work': 'go',
  'go.work.sum': 'go',
  '.env': 'bash',
  'readme.md': 'markdown',
  'license': 'markdown',
  'license.md': 'markdown',
  'license.txt': 'markdown',
  'copying': 'markdown',
  'dockerfile': 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
  'makefile': 'bash',
  'cmakelists.txt': 'cmake',
};

/**
 * Check if a file is likely a Go executable binary
 * Go binaries typically have no extension and match common patterns
 */
function isGoBinary(fileName: string, path: string): boolean {
  // Skip files with extensions
  if (fileName.includes('.')) {
    return false;
  }
  // Common Go binary names (often match package names or tools)
  const goBinaryPatterns = ['air', 'delve', 'dlv', 'gopls', 'gofmt', 'goimports', 'golangci-lint', 'staticcheck'];
  if (goBinaryPatterns.includes(fileName)) {
    return true;
  }
  // Check if in a Go build output directory
  if (path.includes('/bin/') || path.includes('/out/')) {
    return true;
  }
  return false;
}

/**
 * Check if a file is likely a Rust executable binary
 */
function isRustBinary(fileName: string, path: string): boolean {
  // Skip files with extensions (those are handled by extensionMap)
  if (fileName.includes('.')) {
    return false;
  }
  // Check if in Cargo target directory
  if (path.includes('/target/')) {
    return true;
  }
  return false;
}

/**
 * Get the icon name for a file path (without prefix)
 */
export function getFileIconName(path: string): string {
  const fileName = path.split('/').pop()?.toLowerCase() || '';
  const ext = path.split('.').pop()?.toLowerCase() || '';

  // Check for exact file name matches first (like package.json)
  if (fileNameMap[fileName]) {
    return fileNameMap[fileName];
  }

  // Check for compiled binaries without extension
  if (!ext) {
    // Rust binaries in target directory
    if (isRustBinary(fileName, path)) {
      return 'rust';
    }
    // Go binaries
    if (isGoBinary(fileName, path)) {
      return 'go';
    }
  }

  // Check for extension matches
  if (ext && extensionMap[ext]) {
    return extensionMap[ext];
  }

  // Fallback - generic file icon
  return 'markdown';
}
