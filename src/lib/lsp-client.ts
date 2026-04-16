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
 * Format markdown-like content from LSP hover
 */
export function formatHoverContent(contents: string): string {
  // Basic markdown to HTML conversion for tooltips
  return contents
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-100 p-2 rounded mt-1"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
