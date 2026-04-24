/**
 * LSP Client for Frontend
 * Handles intellisense features: completions, hover, definitions
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { dispatch } from './events.js';

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  sortText?: string;
  filterText?: string;
  insertText?: string;
}

export interface HoverInfo {
  contents: string;  // Raw markdown
  html: string;      // Pre-rendered HTML
  range?: {
    start_line: number;
    start_char: number;
    end_line: number;
    end_char: number;
  };
}

export interface LocationInfo {
  uri: string;
  start_line: number;
  start_char: number;
  end_line: number;
  end_char: number;
}

export interface DiagnosticInfo {
  message: string;
  severity: number;
  start_line: number;
  start_char: number;
  end_line: number;
  end_char: number;
  source?: string;
  code?: string;
}

/**
 * Initialize LSP connection pool for a project
 */
export async function initializeLspPool(rootPath: string): Promise<void> {
  try {
    await invoke('initialize_lsp_pool', { rootPath });
    console.log('[LSP] Connection pool initialized for:', rootPath);
  } catch (error) {
    console.error('[LSP] Failed to initialize connection pool:', error);
  }
}

/**
 * Convert a file path to a file:// URI
 */
export function pathToFileUri(path: string): string {
  // If already a file:// URI, return as-is
  if (path.startsWith('file://')) {
    return path;
  }
  // Handle Windows paths
  if (path.includes('\\')) {
    return 'file:///' + path.replace(/\\/g, '/').split(' ').map(encodeURIComponent).join('/');
  }
  // Handle Unix paths - ensure leading slash and encode special characters
  const absolutePath = path.startsWith('/') ? path : '/' + path;
  // Encode spaces and special characters but keep slashes
  const encodedPath = absolutePath.split('/').map(segment =>
    encodeURIComponent(segment).replace(/%2F/g, '/')
  ).join('/');
  return 'file://' + encodedPath;
}

/**
 * Get completions at a position
 */
export async function getCompletions(
  languageId: string,
  filePath: string,
  content: string,
  line: number,
  column: number
): Promise<CompletionItem[]> {
  try {
    // Convert file path to proper file:// URI
    const uri = pathToFileUri(filePath);
    console.log('[LSP] Requesting completions with URI:', uri);
    const items = await invoke<CompletionItem[]>('get_completions', {
      languageId,
      uri,
      content,
      line,
      column,
    });
    return items;
  } catch (error) {
    const errorMsg = String(error);
    // If LSP server is not installed, trigger auto-install
    if (errorMsg.includes('No LSP server') ||
        errorMsg.includes('Failed to start') ||
        errorMsg.includes('Failed to initialize') ||
        errorMsg.includes('Missing Content-Length')) {
      console.log('[LSP] Server not available, triggering auto-install...');
      dispatch('lsp-server-missing', { languageId, serverName: getServerDisplayName(languageId) });
    } else {
      console.error('[LSP] Completion error:', error);
    }
    return [];
  }
}

/**
 * Get display name for LSP server
 */
function getServerDisplayName(languageId: string): string {
  const serverNames: Record<string, string> = {
    rust: 'rust-analyzer',
    go: 'gopls',
    python: 'pyright',
    cpp: 'clangd',
    typescript: 'typescript-language-server',
    javascript: 'typescript-language-server',
  };
  return serverNames[languageId] || `${languageId}-language-server`;
}

/**
 * Get hover information at a position
 */
export async function getHover(
  languageId: string,
  filePath: string,
  content: string,
  line: number,
  column: number
): Promise<HoverInfo | null> {
  try {
    const uri = pathToFileUri(filePath);
    const hover = await invoke<HoverInfo | null>('get_hover', {
      languageId,
      uri,
      content,
      line,
      column,
    });
    return hover;
  } catch (error) {
    console.error('[LSP] Hover error:', error);
    return null;
  }
}

/**
 * Get definition location at a position
 */
export async function getDefinition(
  languageId: string,
  filePath: string,
  content: string,
  line: number,
  column: number
): Promise<LocationInfo[]> {
  try {
    const uri = pathToFileUri(filePath);
    const locations = await invoke<LocationInfo[]>('get_definition', {
      languageId,
      uri,
      content,
      line,
      column,
    });
    return locations;
  } catch (error) {
    console.error('[LSP] Definition error:', error);
    return [];
  }
}

/**
 * Notify document opened
 */
export async function notifyDocumentOpened(
  languageId: string,
  uri: string,
  content: string,
  version: number
): Promise<void> {
  try {
    await invoke('notify_document_opened', {
      languageId,
      uri,
      content,
      version,
    });
  } catch (error) {
    console.error('[LSP] Document open notification error:', error);
  }
}

/**
 * Notify document changed
 */
export async function notifyDocumentChanged(
  languageId: string,
  uri: string,
  content: string,
  version: number
): Promise<void> {
  try {
    await invoke('notify_document_changed', {
      languageId,
      uri,
      content,
      version,
    });
  } catch (error) {
    console.error('[LSP] Document change notification error:', error);
  }
}

/**
 * Notify document closed
 */
export async function notifyDocumentClosed(
  languageId: string,
  uri: string
): Promise<void> {
  try {
    await invoke('notify_document_closed', {
      languageId,
      uri,
    });
  } catch (error) {
    console.error('[LSP] Document close notification error:', error);
  }
}

/**
 * Notify document saved
 */
export async function notifyDocumentSaved(
  languageId: string,
  uri: string,
  content?: string
): Promise<void> {
  try {
    await invoke('notify_document_saved', {
      languageId,
      uri,
      content,
    });
  } catch (error) {
    console.error('[LSP] Document save notification error:', error);
  }
}

/**
 * Get icon character for completion item type
 */
export function getCompletionIcon(type: string): string {
  const icons: Record<string, string> = {
    method: '⒜',
    function: 'ƒ',
    constructor: 'Ⓒ',
    field: 'Ⓕ',
    variable: 'Ⓥ',
    class: 'Ⓒ',
    interface: 'ⓘ',
    module: 'Ⓜ',
    property: 'Ⓟ',
    unit: 'Ⓤ',
    value: 'Ⓥ',
    enum: 'Ⓔ',
    keyword: 'Ⓚ',
    snippet: 'Ⓢ',
    color: '🎨',
    file: '📄',
    reference: '📖',
    folder: '📁',
    enummember: 'Ⓔ',
    constant: 'Ⓒ',
    struct: 'Ⓢ',
    event: '',
    operator: '',
    typeparameter: 'Ⓣ',
    text: 'Ⓣ',
  };
  return icons[type] || '•';
}

/**
 * Map completion item kind to CodeMirror type
 */
export function completionKindToType(kind: number): string {
  const kindMap: Record<number, string> = {
    1: 'text',       // Text
    2: 'method',     // Method
    3: 'function',   // Function
    4: 'constructor', // Constructor
    5: 'field',      // Field
    6: 'variable',   // Variable
    7: 'class',      // Class
    8: 'interface',  // Interface
    9: 'module',     // Module
    10: 'property',  // Property
    11: 'unit',      // Unit
    12: 'value',     // Value
    13: 'enum',      // Enum
    14: 'keyword',   // Keyword
    15: 'snippet',   // Snippet
    16: 'color',     // Color
    17: 'file',      // File
    18: 'reference', // Reference
    19: 'folder',    // Folder
    20: 'enummember', // EnumMember
    21: 'constant',  // Constant
    22: 'struct',    // Struct
    23: 'event',     // Event
    24: 'operator',  // Operator
    25: 'typeparameter', // TypeParameter
  };
  return kindMap[kind] || 'text';
}

/**
 * Format markdown-like content from LSP hover - Clean professional style
 */
export function formatHoverContent(contents: string, options?: {
  signature?: string;
  typeInfo?: string;
  tags?: string[];
  link?: { text: string; url: string };
  availability?: 'widely-available' | 'experimental' | 'deprecated' | 'non-standard';
}): string {
  // 1. Parsing Logic
  let signature = options?.signature || '';
  let description = contents;
  let link = options?.link;

  if (!options) {
    const sections = contents.split(/\n---\n/);
    signature = sections[0]?.trim().replace(/^```(\w*)\n?([\s\S]*?)\n?```$/, '$2') || '';
    description = sections.slice(1, -1).join('\n').trim();
    const lastSection = sections[sections.length - 1]?.trim() || '';
    const linkMatch = lastSection.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) link = { text: linkMatch[1], url: linkMatch[2] };
  }

  // 2. Component Building

  // Signature Section (High-contrast code block)
  const formattedSignature = signature ? `<div class="hover-signature"><code>${formatSignature(signature)}</code></div>` : '';

  // Type info badge
  const typeBadge = options?.typeInfo ? `<span class="type-badge">${options.typeInfo}</span>` : '';

  // Tags badges
  const tags = options?.tags || [];
  const badgesHtml = tags.length > 0
    ? `<div class="hover-badges">${tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('')}</div>`
    : '';

  // Link
  const linkHtml = link ? `<a href="${link.url}" class="docs-link" target="_blank" rel="noopener">${link.text} <span class="link-arrow">↗</span></a>` : '';

  // 3. Final Assembly
  return `
    <div class="hover-content">
      ${formattedSignature}
      <div class="hover-body">
        ${formatDescription(description)}
      </div>
      ${(typeBadge || badgesHtml || linkHtml) ? `
        <div class="hover-footer">
          ${typeBadge}
          ${badgesHtml}
          ${linkHtml}
        </div>
      ` : ''}
    </div>`;
}

/**
 * Format description text using marked markdown parser with custom renderer
 */
function formatDescription(text: string): string {
  if (!text) return '';

  // Configure marked with custom renderer for syntax highlighting
  const renderer = new marked.Renderer();

  // Override code block rendering with syntax highlighting
  renderer.code = (code: string, language?: string) => {
    const highlighted = highlightCode(code, language || '');
    return `<pre class="code-block"><code>${highlighted}</code></pre>`;
  };

  // Override inline code rendering
  renderer.codespan = (code: string) => {
    return `<code class="code-pill">${code}</code>`;
  };

  // Override link rendering
  renderer.link = (href: string, title: string, text: string) => {
    return `<a href="${href}" class="inline-link" target="_blank" rel="noopener">${text}</a>`;
  };

  // Override list rendering
  renderer.list = (body: string, ordered: boolean) => {
    return `<ul class="styled-list">${body}</ul>`;
  };

  // Override list item rendering
  renderer.listitem = (text: string) => {
    return `<li class="list-item">${text}</li>`;
  };

  // Configure marked
  marked.setOptions({
    renderer,
    breaks: true,        // Convert \n to <br>
    gfm: true,           // GitHub Flavored Markdown
    headerIds: false,    // Don't add IDs to headers
    mangle: false,       // Don't mangle email links
  });

  // Parse markdown to HTML
  const html = marked.parse(text, { async: false }) as string;

  return html;
}

/**
 * Format parameters section with highlighted names
 */
function formatParamsSection(params: string): string {
  const lines = params.split('\n').filter(l => l.trim());
  if (lines.length === 0) return '';

  let html = '<div class="params-section"><div class="params-title">Parameters</div>';
  for (const line of lines) {
    const match = line.match(/^`?(\w+)`?\s*[-:]\s*(.*)$/);
    if (match) {
      const paramName = match[1];
      const paramDesc = match[2] || '';
      const highlightedDesc = formatDescription(paramDesc).replace(/<\/?p>/g, '');
      html += `<div class="param-item">
        <span class="param-name">${paramName}</span>
        <span class="param-desc">${highlightedDesc}</span>
      </div>`;
    }
  }
  html += '</div>';
  return html;
}

/**
 * Apply syntax highlighting to code blocks - matches editor theme colors
 */
function highlightCode(code: string, lang: string): string {
  // Escape HTML
  code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Keywords - use var(--app-keyword) color
  code = code.replace(/\b(const|let|var|function|async|await|return|if|else|for|while|class|interface|type|enum|import|export|from|extends|implements|new|this|typeof|instanceof|in|of|void|null|undefined|true|false|try|catch|throw|switch|case|break|continue|default|yield|static|public|private|protected|readonly|abstract|declare|module|namespace|require|keyof|infer|extract|exclude|partial|record|pick|omit|nonnullable|non-nullable|match|fn|impl|struct|trait|use|mod|pub|crate|self|Self|Self|mut|ref|dyn|where|for|in|as|box|continue|loop|unsafe|macro_rules)\b/g, '<span class="hl-kw">$1</span>');

  // Types - use var(--app-type) color
  code = code.replace(/\b(string|number|boolean|any|never|unknown|Object|Array|Promise|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Date|RegExp|Error|JSON|Math|Console|Function|Generator|Iterator|Observable|Subject|String|Number|Boolean|Symbol|BigInt64Array|BigUint64Array|Float32Array|Float64Array|Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Option|Result|Vec|HashMap|HashSet|BTreeMap|BTreeSet|LinkedList| Rc|Arc|Box|Cell|Ref|RefCell|RefMut|Mutex|MutexGuard|RwLock|RwLockReadGuard|RwLockWriteGuard|Pin|NonNull|Unique|Lazy|Once|Cow|Path|PathBuf|OsStr|OsString|CString|CStr)\b/g, '<span class="hl-type">$1</span>');

  // Capitalized custom types (PascalCase classes, interfaces, etc.)
  code = code.replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span class="hl-type">$1</span>');

  // Strings - use var(--app-string) color
  code = code.replace(/(['"`])(.*?)\1/g, '<span class="hl-str">$1$2$1</span>');

  // Numbers - use var(--app-number) color
  code = code.replace(/\b(\d+\.?\d*(?:f32|f64|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize)?)\b/g, '<span class="hl-num">$1</span>');

  // Booleans - use var(--app-boolean) color
  code = code.replace(/\b(true|false|Some|None|Ok|Err)\b/g, '<span class="hl-bool">$1</span>');

  // Comments - use a muted color
  code = code.replace(/(\/\/.*$)/gm, '<span class="hl-comment">$1</span>');
  code = code.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');

  // Function calls - slightly emphasized
  code = code.replace(/([a-zA-Z_][a-zA-Z0-9_]*)\(/g, '<span class="hl-fn">$1</span>(');

  // Properties after dot
  code = code.replace(/\.([a-zA-Z_][a-zA-Z0-9_]*)/g, '.<span class="hl-prop">$1</span>');

  return code;
}

/**
 * Format signature with syntax highlighting matching editor theme
 * Handles patterns like: "var console: Console", "function foo(): void", "fn println!(...)"
 */
function formatSignature(signature: string): string {
  if (!signature) return '';

  // Escape HTML first
  signature = signature
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Highlight keywords
  signature = signature.replace(/\b(fn|function|const|let|var|async|await|return|if|else|for|while|class|interface|type|enum|import|export|from|extends|implements|new|this|typeof|instanceof|in|of|void|null|undefined|true|false|pub|crate|self|mut|ref|dyn|where|trait|impl|struct|use|mod)\b/g, '<span class="hl-kw">$1</span>');

  // Highlight types (capitalized words, or after : or <)
  signature = signature.replace(/: ([A-Z][a-zA-Z0-9_<>\[\], ]*)/g, ': <span class="hl-type">$1</span>');
  signature = signature.replace(/<([A-Z][a-zA-Z0-9_<>\[\], ]*)>/g, '&lt;<span class="hl-type">$1</span>&gt;');
  signature = signature.replace(/(extends|implements|:) ([A-Z][a-zA-Z0-9_]*)/g, '$1 <span class="hl-type">$2</span>');

  // Highlight function names (word followed by parenthesis or !)
  signature = signature.replace(/([a-zA-Z_][a-zA-Z0-9_]*)(\(|!)/g, '<span class="hl-fn">$1</span>$2');

  // Highlight string literals
  signature = signature.replace(/(["'])(.*?)\1/g, '<span class="hl-str">$1$2$1</span>');

  // Highlight numbers
  signature = signature.replace(/\b(\d+)\b/g, '<span class="hl-num">$1</span>');

  // Highlight self/Self
  signature = signature.replace(/\b(self|Self)\b/g, '<span class="hl-prop">$1</span>');

  return signature;
}
