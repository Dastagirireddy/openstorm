/**
 * Editor Syntax - Syntax highlighting and language support
 *
 * Uses CSS variables from theme JSONs for IntelliJ-native colors.
 * Colors automatically switch between light (GrayTheme) and dark (Darcula).
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
import { getFileExtension } from '../icons';

/**
 * IntelliJ-native syntax highlighting using CSS variables.
 *
 * Light (GrayTheme): keywords=#000, strings=#067d17, numbers=#1750eb, types=#7B3294
 * Dark (Darcula):    keywords=#cc7832, strings=#6a8759, numbers=#6897bb, types=#a9b7c6
 */
const intelliJHighlight = HighlightStyle.define([
  // Keywords and control flow
  { tag: [t.keyword, t.operatorKeyword], color: 'var(--app-keyword)', fontWeight: 'bold' },
  { tag: t.modifier, color: 'var(--app-keyword)', fontWeight: 'bold' },

  // Types and classes
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--app-type)' },
  { tag: t.propertyName, color: 'var(--app-type)' },

  // Functions and definitions
  { tag: [t.definition(t.variableName), t.function(t.variableName)], color: 'var(--app-type)', fontWeight: '500' },
  { tag: t.function(t.propertyName), color: 'var(--app-type)' },

  // Variables
  { tag: t.variableName, color: 'var(--app-foreground)' },
  { tag: t.local(t.variableName), color: 'var(--app-foreground)' },

  // Strings
  { tag: [t.string, t.special(t.string), t.character], color: 'var(--app-string)' },

  // Numbers and booleans
  { tag: [t.number, t.bool, t.null], color: 'var(--app-number)' },

  // Comments
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--app-disabled-foreground)', fontStyle: 'italic' },

  // Operators and punctuation
  { tag: t.operator, color: 'var(--app-foreground)' },
  { tag: [t.punctuation, t.bracket, t.squareBracket, t.paren, t.brace], color: 'var(--app-foreground)' },
  { tag: t.derefOperator, color: 'var(--app-foreground)' },

  // HTML/JSX tags
  { tag: t.tagName, color: 'var(--app-keyword)' },
  { tag: t.attributeName, color: 'var(--app-foreground)' },
  { tag: t.attributeValue, color: 'var(--app-string)' },

  // Regex and escape
  { tag: t.regexp, color: 'var(--app-string)' },
  { tag: t.escape, color: 'var(--app-string)' },

  // Meta and annotations
  { tag: t.meta, color: 'var(--app-keyword)' },
  { tag: t.annotation, color: 'var(--app-keyword)' },

  // Self and atom
  { tag: t.self, color: 'var(--app-keyword)' },
  { tag: t.atom, color: 'var(--app-number)' },

  // Links
  { tag: t.link, color: 'var(--app-type)', textDecoration: 'underline' },

  // Markdown headings
  { tag: t.heading, color: 'var(--app-keyword)', fontWeight: 'bold' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
]);

/**
 * Get syntax highlighting extension (theme-aware via CSS variables)
 */
export function getSyntaxHighlighting(): Extension {
  return syntaxHighlighting(intelliJHighlight);
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
    case 'html': case 'htm': case 'xhtml': case 'svg': return htmlLang();
    case 'css': case 'scss': case 'sass': case 'less': return cssLang();
    case 'json': return json();
    case 'md': case 'markdown': return markdown();
    case 'yaml': case 'yml': return yaml();
    case 'java': return java();
    case 'sql': return sql();
    case 'php': return php();
    case 'xml': return htmlLang(); // Use HTML lang for XML as fallback
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
