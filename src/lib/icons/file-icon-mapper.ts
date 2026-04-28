/**
 * File icon mappings using devicon (transparent icons without backgrounds)
 * Maps file extensions and names to devicon icon names
 *
 * Icon availability verified against @iconify-json/devicon package
 */

/**
 * Language extensions mapped to devicon icons
 */
const languageExtensions: Record<string, string> = {
  // Rust
  rs: 'rust',

  // TypeScript/JavaScript
  ts: 'typescript',
  tsx: 'file-icons:tsx-alt',
  js: 'javascript',
  jsx: 'tabler:file-type-jsx',
  mjs: 'javascript',
  cjs: 'javascript',

  // Python
  py: 'python',
  ipynb: 'python',
  pyc: 'python',
  pyo: 'python',
  pyd: 'python',

  // Go
  go: 'go',

  // Java ecosystem
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  groovy: 'groovy',
  gradle: 'groovy',

  // C family
  c: 'c',
  cpp: 'cplusplus',
  cc: 'cplusplus',
  cxx: 'cplusplus',
  h: 'cplusplus',
  hpp: 'cplusplus',
  hxx: 'cplusplus',
  cs: 'csharp',
  objc: 'apple',
  mm: 'apple',

  // Web languages
  html: 'html5',
  htm: 'html5',
  css: 'css3',
  scss: 'sass',
  sass: 'sass',
  less: 'css3',
  styl: 'stylus',
  vue: 'vuejs',
  svelte: 'svelte',

  // Backend languages
  php: 'php',
  rb: 'ruby',
  erb: 'ruby',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  lua: 'lua',
  r: 'r',
  sol: 'solidity',

  // Functional languages
  hs: 'haskell',
  lhs: 'haskell',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  edn: 'clojure',
  erl: 'erlang',
  ex: 'elixir',
  exs: 'elixir',

  // Other languages
  swift: 'swift',
  dart: 'dart',
  flutter: 'flutter',
  sql: 'postgresql',
  plsql: 'oracle',

  // Markup/docs
  md: 'markdown',
  markdown: 'markdown',
  rst: 'markdown',
  tex: 'latex',
  cls: 'latex',
  log: 'logos:logentries',

  // Data/config formats
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'tabler:toml',  // Use tabler icon for toml files
  xml: 'mdi:file-xml-box',

  // Images
  png: 'vscode-icons:file-type-image',
  jpg: 'vscode-icons:file-type-image',
  jpeg: 'vscode-icons:file-type-image',
  gif: 'vscode-icons:file-type-image',
  webp: 'vscode-icons:file-type-image',
  ico: 'vscode-icons:file-type-image',
  bmp: 'vscode-icons:file-type-image',
  svg: 'vscode-icons:file-type-svg',

  // Video
  mp4: 'vscode-icons:file-type-video',
  mov: 'vscode-icons:file-type-video',
  avi: 'vscode-icons:file-type-video',
  mkv: 'vscode-icons:file-type-video',
  webm: 'vscode-icons:file-type-video',

  // Audio
  mp3: 'vscode-icons:file-type-audio',
  wav: 'vscode-icons:file-type-audio',
  ogg: 'vscode-icons:file-type-audio',
  flac: 'vscode-icons:file-type-audio',
  aac: 'vscode-icons:file-type-audio',

  // Config files without extension - use json as generic config icon
  ini: 'json',
  cfg: 'json',
  conf: 'json',
  config: 'json',

  // Build/dependency files - use rust for lock files (cargo.lock)
  lock: 'rust',
};

/**
 * File name patterns mapped to icons (for files without extensions)
 */
const fileNamePatterns: Record<string, string> = {
  // Node.js
  'package.json': 'nodejs',
  'package-lock.json': 'nodejs',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  '.npmrc': 'devicon:npm-wordmark',
  '.nvmrc': 'nodejs',

  // TypeScript
  'tsconfig.json': 'typescript',
  'tslint.json': 'typescript',

  // Build tools
  'webpack.config.js': 'webpack',
  'webpack.config.ts': 'webpack',
  'vite.config.js': 'vite',
  'vite.config.ts': 'vite',
  'rollup.config.js': 'rollup',
  'babel.config.js': 'babel',
  '.babelrc': 'babel',
  '.babelrc.js': 'babel',
  '.babelrc.json': 'babel',

  // Linting/formatting
  'eslint.config.js': 'eslint',
  '.eslintrc': 'eslint',
  '.eslintrc.json': 'eslint',
  '.eslintrc.js': 'eslint',
  '.eslintrc.yaml': 'eslint',
  '.eslintrc.yml': 'eslint',
  'prettier.config.js': 'prettier',
  '.prettierrc': 'prettier',
  '.prettierrc.json': 'prettier',
  '.prettierrc.yaml': 'prettier',
  '.prettierrc.yml': 'prettier',
  '.stylelintrc': 'stylelint',
  'stylelint.config.js': 'stylelint',

  // CSS frameworks
  'tailwind.config.js': 'tailwindcss',
  'tailwind.config.ts': 'tailwindcss',
  'tailwind.config.cjs': 'tailwindcss',
  'postcss.config.js': 'postcss',

  // Testing
  'jest.config.js': 'jest',
  'jest.config.ts': 'jest',
  'vitest.config.js': 'vitest',
  'vitest.config.ts': 'vitest',
  'pytest.ini': 'python',
  'conftest.py': 'python',

  // Rust
  'cargo.toml': 'rust',
  'cargo.lock': 'rust',
  'rust-toolchain': 'rust',
  'rust-toolchain.toml': 'rust',
  'rustfmt.toml': 'rust',
  'clippy.toml': 'rust',

  // Go
  'go.mod': 'go',
  'go.sum': 'go',
  'go.work': 'go',
  'go.work.sum': 'go',

  // Python
  'requirements.txt': 'python',
  'requirements-dev.txt': 'python',
  'pipfile': 'python',
  'pipfile.lock': 'python',
  'pyproject.toml': 'python',
  'setup.py': 'python',
  'setup.cfg': 'python',
  '.python-version': 'python',
  '.venv': 'python',
  'venv': 'python',
  '.env': 'file',
  '.env.local': 'file',
  '.env.development': 'file',
  '.env.production': 'file',

  // Java
  'pom.xml': 'maven',
  'build.gradle': 'gradle',
  'build.gradle.kts': 'gradle',
  'settings.gradle': 'gradle',
  '.java-version': 'java',

  // Docker
  'dockerfile': 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  '.dockerignore': 'docker',
  'containerfile': 'docker',

  // Git
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
  '.gitconfig': 'git',
  '.gitkeep': 'git',

  // Shell/Make
  'makefile': 'catppuccin:makefile',
  'cmakelists.txt': 'cmake',
  '.shellcheckrc': 'bash',

  // Documentation - files without extension
  'license': 'file',
  'copying': 'file',

  // IDE/Editor
  '.vscode/settings.json': 'vscode',
  'settings.json': 'vscode',
  '.idea': 'file',
  '.editorconfig': 'file',
};

/**
 * Directory name patterns mapped to icons
 */
const directoryPatterns: Record<string, string> = {
  'node_modules': 'nodejs',
  '.git': 'git',
  '.github': 'github',
  '.vscode': 'vscode',
  '.idea': 'file',
  'target': 'rust',
  'dist': 'file',
  'build': 'file',
  'out': 'file',
  'vendor': 'file',
  'deps': 'file',
  '__pycache__': 'python',
  '.venv': 'python',
  'venv': 'python',
  '.pytest_cache': 'python',
  '.mypy_cache': 'python',
};

/**
 * Get the icon name for a file path (without prefix)
 * @param path - The file path
 * @param isExecutable - Whether the file has executable permission (Unix)
 */
export function getFileIconName(path: string, isExecutable = false): string {
  const normalizedPath = path.toLowerCase();
  const parts = normalizedPath.split('/');
  const fileName = parts.pop() || '';
  const dirName = parts.pop() || '';

  // Get extension (everything after the last dot)
  const ext = fileName.includes('.') ? fileName.split('.').pop()! : '';

  // 1. Check for path-based patterns (e.g., .vscode/settings.json)
  if (fileNamePatterns[normalizedPath]) {
    return fileNamePatterns[normalizedPath];
  }

  // 2. Check for exact file name matches first
  if (fileNamePatterns[fileName]) {
    return fileNamePatterns[fileName];
  }

  // 3. Check for directory patterns (if this is a directory)
  if (!fileName && directoryPatterns[dirName]) {
    return directoryPatterns[dirName];
  }

  // 4. Check for executable files (Unix permission-based)
  if (isExecutable && !ext) {
    // All executables without extension use binary icon
    return 'vscode-icons:file-type-binary';
  }

  // 5. Check for language/extension matches
  if (ext && languageExtensions[ext]) {
    return languageExtensions[ext];
  }

  // 6. Fallback - generic file icon
  return 'streamline-flex-color:text-file';
}

/**
 * Get the icon name for a directory path
 */
export function getDirectoryIconName(path: string): string {
  const dirName = path.split('/').pop()?.toLowerCase() || '';

  // Check for exact directory name matches
  if (directoryPatterns[dirName]) {
    return directoryPatterns[dirName];
  }

  // Default folder icon
  return 'file';
}
