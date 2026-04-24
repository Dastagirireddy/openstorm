/**
 * Code formatter service for OpenStorm
 * Supports multiple languages via different formatting backends
 */

import { dispatch } from './events.js';

export interface FormatterOptions {
  tabWidth: number;
  useTabs: boolean;
  printWidth: number;
  singleQuote: boolean;
  trailingComma: 'none' | 'es5' | 'all';
  extension: string;
}

export interface LanguageFormatter {
  extensions: string[];
  format(content: string, options: FormatterOptions): Promise<string>;
}

const defaultOptions: FormatterOptions = {
  tabWidth: 4,
  useTabs: false,
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
};

/**
 * JavaScript/TypeScript formatter using LSP (typescript-language-server)
 */
const jsFormatter: LanguageFormatter = {
  extensions: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    // Check for template syntax (Handlebars, Mustache, EJS, etc.)
    if (/\{\{.*\}\}/.test(content) || /\{%.*%\}/.test(content) || /<%.*%>/.test(content)) {
      console.log('[JS Formatter] Detected template syntax, skipping format');
      return content;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const languageId = options.extension === 'ts' || options.extension === 'tsx'
        ? 'typescript'
        : 'javascript';

      // Check if server is installed
      const status: any[] = await invoke('get_lsp_server_status');
      const serverInfo = status.find(s => s.language_id === languageId);

      if (!serverInfo || !serverInfo.is_installed) {
        // Dispatch event to show install prompt in status bar
        dispatch('lsp-server-missing', { languageId, serverName: serverInfo?.server_name || `${languageId}-language-server` });
        console.warn(`[JS Formatter] ${languageId}-language-server not installed. Click "Install" in status bar.`);
        return content;
      }

      const command = languageId === 'typescript' ? 'format_typescript' : 'format_javascript';
      const result = await invoke(command, { content, tabWidth: options.tabWidth });
      const resultStr = result as string;

      // Safety check for garbage output
      if (resultStr.includes('~') || resultStr.trim() === '' || /[\u0300-\u036f]/.test(resultStr)) {
        console.error('LSP returned garbage output, returning original');
        return content;
      }

      return resultStr;
    } catch (error) {
      console.error('LSP format error:', error);
      return content;
    }
  },
};

/**
 * HTML formatter using Prettier
 */
const htmlFormatter: LanguageFormatter = {
  extensions: ['html', 'htm', 'xhtml', 'svelte', 'vue'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const prettier = await import('prettier');
      const prettierHtml = await import('prettier/plugins/html');

      const result = await prettier.format(content, {
        parser: 'html',
        plugins: [prettierHtml],
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        printWidth: options.printWidth,
      });

      if (result.includes('̰') || result.includes('~') || result.trim() === '') {
        console.error('HTML formatter returned garbage output');
        return content;
      }

      return result;
    } catch (error) {
      console.error('HTML format error:', error);
      return content;
    }
  },
};

/**
 * CSS formatter using Prettier
 */
const cssFormatter: LanguageFormatter = {
  extensions: ['css', 'scss', 'sass', 'less'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const prettier = await import('prettier');
      const prettierCss = await import('prettier/plugins/postcss');

      const result = await prettier.format(content, {
        parser: 'css',
        plugins: [prettierCss],
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        singleQuote: options.singleQuote,
        printWidth: options.printWidth,
      });

      if (result.includes('̰') || result.includes('~') || result.trim() === '') {
        console.error('CSS formatter returned garbage output');
        return content;
      }

      return result;
    } catch (error) {
      console.error('CSS format error:', error);
      return content;
    }
  },
};

/**
 * JSON formatter using Prettier
 */
const jsonFormatter: LanguageFormatter = {
  extensions: ['json', 'jsonc'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const prettier = await import('prettier');
      const prettierBabel = await import('prettier/plugins/babel');

      const result = await prettier.format(content, {
        parser: 'json',
        plugins: [prettierBabel],
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        printWidth: options.printWidth,
      });

      if (result.includes('̰') || result.includes('~') || result.trim() === '') {
        console.error('JSON formatter returned garbage output');
        return content;
      }

      return result;
    } catch (error) {
      console.error('JSON format error:', error);
      return content;
    }
  },
};

/**
 * Markdown formatter using Prettier
 */
const markdownFormatter: LanguageFormatter = {
  extensions: ['md', 'markdown', 'mdx'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const prettier = await import('prettier');
      const prettierMarkdown = await import('prettier/plugins/markdown');
      const prettierBabel = await import('prettier/plugins/babel');

      const result = await prettier.format(content, {
        parser: 'markdown',
        plugins: [prettierMarkdown, prettierBabel],
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        printWidth: options.printWidth,
      });

      if (result.includes('̰') || result.includes('~') || result.trim() === '') {
        console.error('Markdown formatter returned garbage output');
        return content;
      }

      return result;
    } catch (error) {
      console.error('Markdown format error:', error);
      return content;
    }
  },
};

/**
 * YAML formatter using Prettier
 */
const yamlFormatter: LanguageFormatter = {
  extensions: ['yaml', 'yml'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const prettier = await import('prettier');
      const prettierYaml = await import('prettier-plugin-yaml');

      const result = await prettier.format(content, {
        parser: 'yaml',
        plugins: [prettierYaml],
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        printWidth: options.printWidth,
      });

      if (result.includes('̰') || result.includes('~') || result.trim() === '') {
        console.error('YAML formatter returned garbage output');
        return content;
      }

      return result;
    } catch (error) {
      console.error('YAML format error:', error);
      return content;
    }
  },
};

/**
 * GraphQL formatter using Prettier
 */
const graphqlFormatter: LanguageFormatter = {
  extensions: ['graphql', 'gql'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const prettier = await import('prettier');
      const prettierGraphql = await import('prettier/plugins/graphql');

      const result = await prettier.format(content, {
        parser: 'graphql',
        plugins: [prettierGraphql],
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        printWidth: options.printWidth,
      });

      if (result.includes('̰') || result.includes('~') || result.trim() === '') {
        console.error('GraphQL formatter returned garbage output');
        return content;
      }

      return result;
    } catch (error) {
      console.error('GraphQL format error:', error);
      return content;
    }
  },
};

/**
 * Rust formatter - uses rustfmt via Tauri command
 * Falls back to returning original content if rustfmt is not available
 */
const rustFormatter: LanguageFormatter = {
  extensions: ['rs'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('format_rust', { content, tabWidth: options.tabWidth });
      // Validate result is not garbage
      const resultStr = result as string;
      if (resultStr.includes('̰') || resultStr.includes('~') || resultStr.trim() === '') {
        console.warn('rustfmt returned invalid result');
        return content;
      }
      return resultStr;
    } catch (error) {
      console.warn('rustfmt not available, keeping original content');
      // Return original content - don't modify it
      return content;
    }
  },
};

/**
 * Go formatter - uses gofmt via Tauri command
 */
const goFormatter: LanguageFormatter = {
  extensions: ['go'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('format_go', { content, tabWidth: options.tabWidth });
    } catch (error) {
      console.warn('gofmt not available, using basic formatting:', error);
      return content.replace(/\r\n/g, '\n');
    }
  },
};

/**
 * Python formatter - uses black via Tauri command
 */
const pythonFormatter: LanguageFormatter = {
  extensions: ['py', 'pyw'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('format_python', { content, tabWidth: options.tabWidth });
    } catch (error) {
      console.warn('black not available, using basic formatting:', error);
      return content.replace(/\r\n/g, '\n');
    }
  },
};

/**
 * PHP formatter using Prettier
 */
const phpFormatter: LanguageFormatter = {
  extensions: ['php'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const prettier = await import('prettier');
      const prettierPhp = await import('@prettier/plugin-php');

      const result = await prettier.format(content, {
        parser: 'php',
        plugins: [prettierPhp],
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        singleQuote: options.singleQuote,
        printWidth: options.printWidth,
      });

      if (result.includes('̰') || result.includes('~') || result.trim() === '') {
        console.error('PHP formatter returned garbage output');
        return content;
      }

      return result;
    } catch (error) {
      console.error('PHP format error:', error);
      return content;
    }
  },
};

/**
 * SQL formatter using prettier-plugin-sql
 */
const sqlFormatter: LanguageFormatter = {
  extensions: ['sql'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const prettier = await import('prettier');
      const prettierSql = await import('prettier-plugin-sql');

      const result = await prettier.format(content, {
        parser: 'sql',
        plugins: [prettierSql],
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        keywordCase: 'preserve',
      });

      if (result.includes('̰') || result.includes('~') || result.trim() === '') {
        console.error('SQL formatter returned garbage output');
        return content;
      }

      return result;
    } catch (error) {
      console.error('SQL format error:', error);
      return content;
    }
  },
};

/**
 * Java formatter - basic formatting (placeholder for future LSP integration)
 */
const javaFormatter: LanguageFormatter = {
  extensions: ['java'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    // TODO: Integrate with Java LSP for proper formatting
    // For now, basic cleanup
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' '.repeat(options.tabWidth));
  },
};

/**
 * C/C++ formatter - basic formatting (placeholder for future clang-format integration)
 */
const cppFormatter: LanguageFormatter = {
  extensions: ['c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx'],
  async format(content: string, options: FormatterOptions): Promise<string> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('format_cpp', { content, tabWidth: options.tabWidth });
    } catch (error) {
      console.warn('clang-format not available, using basic formatting:', error);
      return content
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, ' '.repeat(options.tabWidth));
    }
  },
};

// Register all formatters
const formatters: LanguageFormatter[] = [
  jsFormatter,
  htmlFormatter,
  cssFormatter,
  jsonFormatter,
  markdownFormatter,
  yamlFormatter,
  graphqlFormatter,
  rustFormatter,
  goFormatter,
  pythonFormatter,
  phpFormatter,
  sqlFormatter,
  javaFormatter,
  cppFormatter,
];

/**
 * Get the appropriate formatter for a file extension
 */
export function getFormatter(extension: string): LanguageFormatter | null {
  const formatter = formatters.find(f => f.extensions.includes(extension));
  return formatter || null;
}

/**
 * Format code based on file extension
 */
export async function formatCode(
  extension: string,
  content: string,
  options: Partial<FormatterOptions> = {}
): Promise<string> {
  const formatter = getFormatter(extension);
  if (!formatter) {
    console.warn(`No formatter available for extension: ${extension}`);
    return content;
  }

  const mergedOptions: FormatterOptions = { ...defaultOptions, ...options };

  try {
    const result = await formatter.format(content, mergedOptions);
    // Safety check: never return empty string
    if (!result || result.trim() === '') {
      console.error('Formatter returned empty result, keeping original');
      return content;
    }
    return result;
  } catch (error) {
    console.error('Formatter error:', error);
    return content;
  }
}

/**
 * Check if a formatter exists for the given extension
 */
export function hasFormatter(extension: string): boolean {
  return formatters.some(f => f.extensions.includes(extension));
}

/**
 * Get all supported extensions
 */
export function getSupportedExtensions(): string[] {
  return formatters.flatMap(f => f.extensions);
}
