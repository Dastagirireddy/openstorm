/**
 * LSP Client for Frontend
 * Handles intellisense features: completions, hover, definitions
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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
  contents: string;
  range?: {
    start_line: number;
    start_char: number;
    end_line: number;
    end_char: number;
  };
  // Extended metadata for rich tooltips
  signature?: string;
  typeInfo?: string;
  documentation?: string;
  tags?: string[];  // e.g., ['built-in', 'dom', 'deprecated']
  link?: { text: string; url: string };
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
    if (errorMsg.includes('No LSP server') || errorMsg.includes('Failed to start') || errorMsg.includes('Failed to initialize')) {
      console.log('[LSP] Server not available, triggering auto-install...');
      document.dispatchEvent(new CustomEvent('lsp-server-missing', {
        detail: { languageId, serverName: `${languageId}-language-server` },
        bubbles: true,
        composed: true,
      }));
    } else {
      console.error('[LSP] Completion error:', error);
    }
    return [];
  }
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
 * Format markdown-like content from LSP hover - IntelliJ style
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

  // Quick Actions Bar (The "Fix" links at the top)
  const actionsHtml = `
    <div class="intellij-actions">
      <div class="action-item">
        <span class="action-link">Explain & Fix</span>
        <span class="action-shortcut">⌥⇧↵</span>
      </div>
      <div class="action-item">
        <span class="action-link">More actions...</span>
        <span class="action-shortcut">⌥↵</span>
      </div>
    </div>`;

  // Signature Section (High-contrast code block)
  const formattedSignature = signature ? `<div class="tooltip-signature"><code>${formatSignature(signature)}</code></div>` : '';

  // Availability Bar
  let availabilityHtml = '';
  if (options?.availability === 'widely-available') {
    availabilityHtml = `
      <div class="availability-bar">
        <span class="check-icon">✓</span>
        <span class="avail-text">Widely available across major browsers</span>
        <span class="chevron-icon">⌄</span>
      </div>`;
  }

  // Footer/Badges
  const tags = options?.tags || [];
  const hasTsBadge = tags.includes('built-in') || tags.includes('dom');
  const footerHtml = `
    <div class="tooltip-footer">
      ${hasTsBadge ? '<span class="ts-badge">TS</span>' : ''}
      <span class="footer-meta">${options?.typeInfo || 'built-in'}</span>
      ${link ? `<a href="${link.url}" class="mdn-link">${link.text} ↗</a>` : ''}
    </div>`;

  // 3. Final Assembly
  const sigForErrorMsg = signature.split('(')[0].split(' ').pop() || 'symbol';
  return `
    <div class="intellij-tooltip">
      <div class="tooltip-top-header">
        <span class="error-msg">Definition found for ${sigForErrorMsg}</span>
        <span class="menu-icon">⋮</span>
      </div>
      ${actionsHtml}
      <hr class="intellij-divider" />
      ${formattedSignature}
      <hr class="intellij-divider" />
      ${availabilityHtml}
      <div class="tooltip-body">
        ${formatDescription(description)}
      </div>
      ${footerHtml}
    </div>`;
}

/**
 * Format description text with proper syntax highlighting
 */
function formatDescription(text: string): string {
  if (!text) return '';

  // Process code blocks first
  let html = text
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const highlighted = highlightCode(code, lang);
      return `<pre class="code-block"><code>${highlighted}</code></pre>`;
    })
    // Inline code with pills
    .replace(/`([^`]+)`/g, '<code class="code-pill">$1</code>')
    // Bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="highlight">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Links with labels
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="inline-link">$1<span>↗</span></a>')
    // List items
    .replace(/^- (.*)$/gm, '<li>$1</li>');

  // Wrap lists
  html = html.replace(/(<li>.*<\/li>)/g, '<ul class="styled-list">$1</ul>');

  // Paragraphs
  html = html
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

  if (html && !html.startsWith('<p>')) {
    html = `<p>${html}</p>`;
  }

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
 * Apply syntax highlighting to code blocks
 */
function highlightCode(code: string, lang: string): string {
  // Escape HTML
  code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Simple highlighting rules
  code = code
    .replace(/\b(const|let|var|function|async|await|return|if|else|for|while|class|interface|type|enum|import|export|from|extends|implements|new|this|typeof|instanceof|in|of|void|null|undefined|true|false|try|catch|throw|switch|case|break|continue|default|yield|await|static|public|private|protected|readonly|abstract|declare|module|namespace|export|require|typeof|keyof|infer|extract|exclude|partial|readonly|record|pick|omit|nonnullable|non-nullable)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(string|number|boolean|any|never|unknown|void|null|undefined|true|false|Object|Array|Promise|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Date|RegExp|Error|JSON|Math|Console|Function|Generator|Iterator|Observable|Subject)\b/g, '<span class="type">$1</span>')
    .replace(/(['"`])(.*?)\1/g, '<span class="string">$1$2$1</span>')
    .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>');

  return code;
}

/**
 * Format signature with simple syntax highlighting
 * Handles patterns like: "var console: Console", "function foo(): void", etc.
 */
function formatSignature(signature: string): string {
  if (!signature) return '';

  // Escape HTML first
  signature = signature
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Highlight keywords (var, let, const, function, async, etc.)
  signature = signature.replace(/\b(var|let|const|function|async|return|if|else|for|while|class|interface|type|enum|import|export|from|extends|implements|new|this|typeof|instanceof|in|of|void|null|undefined|true|false)\b/g, '<span class="keyword">$1</span>');

  // Highlight types (capitalized words after : or implements/extends)
  signature = signature.replace(/: ([A-Z][a-zA-Z0-9_]*)/g, ': <span class="type">$1</span>');
  signature = signature.replace(/(extends|implements) ([A-Z][a-zA-Z0-9_]*)/g, '$1 <span class="type">$2</span>');

  // Highlight function names (word followed by parenthesis)
  signature = signature.replace(/([a-zA-Z_][a-zA-Z0-9_]*)\(/g, '<span class="variable">$1</span>(');

  return signature;
}
