/**
 * Editor Syntax - Syntax highlighting and language support
 *
 * Extracted from editor-pane.ts to provide:
 * - Syntax highlighting configuration
 * - Language extension loading
 * - Indentation detection
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { rust } from '@codemirror/lang-rust';
import { javascript } from '@codemirror/lang-javascript';
import { go } from '@codemirror/lang-go';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { html as htmlLang } from '@codemirror/lang-html';
import { css as cssLang } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { java } from '@codemirror/lang-java';
import { sql } from '@codemirror/lang-sql';
import { php } from '@codemirror/lang-php';
import type { Extension } from '@codemirror/state';
import { getFileExtension } from '../file-icons.js';

/**
 * Syntax highlighting style using CSS variables for theme support
 */
export const openStormHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier], color: 'var(--app-keyword)', fontWeight: 'bold' },
  { tag: [t.definition(t.variableName), t.function(t.variableName)], color: 'var(--app-type)' },
  { tag: t.propertyName, color: 'var(--app-type)' },
  { tag: t.string, color: 'var(--app-string)' },
  { tag: t.number, color: 'var(--app-number)' },
  { tag: [t.comment, t.lineComment], color: 'var(--app-disabled-foreground)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--app-keyword)' },
  { tag: t.operator, color: 'var(--app-foreground)' },
  { tag: t.bracket, color: 'var(--app-foreground)' }
]);

/**
 * Get syntax highlighting extension
 */
export function getSyntaxHighlighting(): Extension {
  return syntaxHighlighting(openStormHighlight);
}

/**
 * Get language extension for a file path
 */
export function getLanguageExtension(path: string): Extension {
  const ext = getFileExtension(path).toLowerCase();
  switch (ext) {
    case 'rs': return rust();
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs': return javascript();
    case 'go': return go();
    case 'py': return python();
    case 'c': case 'cpp': case 'cc': case 'cxx': case 'h': case 'hpp': case 'hxx': return cpp();
    case 'html': case 'htm': case 'xhtml': return htmlLang();
    case 'css': case 'scss': case 'sass': case 'less': return cssLang();
    case 'json': return json();
    case 'md': case 'markdown': return markdown();
    case 'yaml': case 'yml': return yaml();
    case 'java': return java();
    case 'sql': return sql();
    case 'php': return php();
    default: return javascript();
  }
}

/**
 * Detect indentation unit from content
 */
export function detectIndentUnit(content: string, path?: string): string {
  // Check for tabs first
  if (/^\t/m.test(content)) return '\t';

  const lines = content.split('\n');
  let minSpaces = 8;

  for (const line of lines) {
    const match = line.match(/^(\s+)/);
    if (match) {
      const spaces = match[1].length;
      if (spaces > 0 && spaces < minSpaces) {
        minSpaces = spaces;
      }
    }
  }

  // Return common indent sizes
  if (minSpaces <= 2) return '  ';
  if (minSpaces <= 4) return '    ';
  return ' '.repeat(minSpaces);
}

/**
 * Get language name from file path
 */
export function getLanguageName(path: string): string {
  const ext = getFileExtension(path).toLowerCase();
  const languageMap: Record<string, string> = {
    rs: 'Rust',
    ts: 'TypeScript',
    tsx: 'TSX',
    js: 'JavaScript',
    jsx: 'JSX',
    go: 'Go',
    py: 'Python',
    c: 'C',
    cpp: 'C++',
    cc: 'C++',
    cxx: 'C++',
    h: 'C++ Header',
    hpp: 'C++ Header',
    html: 'HTML',
    htm: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    less: 'Less',
    json: 'JSON',
    md: 'Markdown',
    markdown: 'Markdown',
    yaml: 'YAML',
    yml: 'YAML',
    java: 'Java',
    sql: 'SQL',
    php: 'PHP',
  };
  return languageMap[ext] || 'Plain Text';
}

/**
 * Get language ID for LSP
 */
export function getLanguageId(path: string): string {
  const ext = getFileExtension(path).toLowerCase();
  const languageIdMap: Record<string, string> = {
    rs: 'rust',
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    mjs: 'javascript',
    go: 'go',
    py: 'python',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'cpp',
    hpp: 'cpp',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    java: 'java',
    sql: 'sql',
    php: 'php',
  };
  return languageIdMap[ext] || 'plaintext';
}
