/// LSP Context Utilities
///
/// Gathers LSP context (symbols, types, etc.) for files to enrich AI conversations.

/// Map of file extensions to language IDs
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  'rs': 'rust',
  'go': 'go',
  'py': 'python',
  'pyw': 'python',
  'js': 'javascript',
  'jsx': 'javascript',
  'mjs': 'javascript',
  'cjs': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',
  'mts': 'typescript',
  'cts': 'typescript',
  'c': 'cpp',
  'h': 'cpp',
  'cpp': 'cpp',
  'cxx': 'cpp',
  'cc': 'cpp',
  'hpp': 'cpp',
  'hxx': 'cpp',
  'hh': 'cpp',
  'java': 'java',
  'kt': 'kotlin',
  'kts': 'kotlin',
  'cs': 'csharp',
  'fs': 'fsharp',
  'vb': 'visualbasic',
  'swift': 'swift',
  'm': 'objective-c',
  'mm': 'objective-cpp',
  'rb': 'ruby',
  'php': 'php',
  'scala': 'scala',
  'clj': 'clojure',
  'cljs': 'clojure',
  'cljc': 'clojure',
  'ex': 'elixir',
  'exs': 'elixir',
  'erl': 'erlang',
  'hs': 'haskell',
  'lua': 'lua',
  'r': 'r',
  'R': 'r',
  'dart': 'dart',
  'html': 'html',
  'htm': 'html',
  'css': 'css',
  'scss': 'scss',
  'less': 'less',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'toml': 'toml',
  'xml': 'xml',
  'sql': 'sql',
  'sh': 'shellscript',
  'bash': 'shellscript',
  'zsh': 'shellscript',
};

/// Document symbol info from LSP
interface LspDocumentSymbol {
  name: string;
  kind: string;
  range: {
    start_line: number;
    start_char: number;
    end_line: number;
    end_char: number;
  };
  children?: LspDocumentSymbol[];
}

/// Get language ID from file path
export function getLanguageFromPath(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_TO_LANGUAGE[ext] || null;
}

/// Get LSP server status for a language
export async function isLspAvailable(languageId: string): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const servers = await invoke<Array<{ language_id: string; is_installed: boolean }>>('get_lsp_server_status');
    const server = servers.find(s => s.language_id === languageId);
    return server?.is_installed || false;
  } catch {
    return false;
  }
}

/// Format symbol kind for display
function formatSymbolKind(kind: string): string {
  const kindMap: Record<string, string> = {
    'function': 'fn',
    'method': 'fn',
    'class': 'struct',
    'struct': 'struct',
    'enum': 'enum',
    'interface': 'trait',
    'constant': 'const',
    'variable': 'let',
    'field': 'field',
    'property': 'prop',
    'module': 'mod',
    'namespace': 'mod',
    'enum_member': 'variant',
    'type_parameter': 'type',
  };
  return kindMap[kind] || kind;
}

/// Flatten nested symbols into a flat list with depth
interface FlatSymbol {
  name: string;
  kind: string;
  depth: number;
  line: number;
}

function flattenSymbols(symbols: LspDocumentSymbol[], depth = 0): FlatSymbol[] {
  const result: FlatSymbol[] = [];
  for (const sym of symbols) {
    result.push({
      name: sym.name,
      kind: sym.kind,
      depth,
      line: sym.range.start_line,
    });
    if (sym.children && sym.children.length > 0) {
      result.push(...flattenSymbols(sym.children, depth + 1));
    }
  }
  return result;
}

/// Gather LSP context for a file
export async function gatherLspContext(
  filePath: string,
  content: string,
): Promise<string | null> {
  const languageId = getLanguageFromPath(filePath);
  if (!languageId) return null;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const uri = `file://${filePath}`;
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('LSP timeout')), 2000);
    });
    
    const symbolsPromise = invoke<LspDocumentSymbol[]>('lsp_get_document_symbols', {
      languageId,
      uri,
      content,
    });
    
    const symbols = await Promise.race([symbolsPromise, timeoutPromise]);

    if (!symbols || symbols.length === 0) return null;

    // Format as a concise summary
    const flat = flattenSymbols(symbols);
    const lines: string[] = [];
    
    // Group by kind
    const groups: Record<string, FlatSymbol[]> = {};
    for (const sym of flat) {
      const kind = formatSymbolKind(sym.kind);
      if (!groups[kind]) groups[kind] = [];
      groups[kind].push(sym);
    }

    // Build concise output (max ~50 symbols)
    let count = 0;
    for (const [kind, syms] of Object.entries(groups)) {
      if (count >= 50) break;
      const names = syms.slice(0, 10).map(s => s.name);
      const remaining = syms.length - 10;
      lines.push(`${kind}: ${names.join(', ')}${remaining > 0 ? ` (+${remaining})` : ''}`);
      count += names.length;
    }

    return lines.length > 0 ? lines.join('\n') : null;
  } catch (e) {
    // LSP not available or failed - silently return null
    return null;
  }
}
