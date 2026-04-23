/**
 * Editor LSP Integration - LSP features for CodeMirror
 *
 * Extracted from editor-pane.ts to provide:
 * - Completion source
 * - Hover tooltips
 * - Definition navigation
 * - Document synchronization
 */

import { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { hoverTooltip, EditorView } from '@codemirror/view';
import type { HoverData } from '../../components/hover-tooltip.js';
import {
  getCompletions,
  getHover,
  getDefinition,
  notifyDocumentOpened,
  notifyDocumentChanged,
  notifyDocumentClosed,
  completionKindToType,
  getCompletionIcon,
  formatHoverContent,
  pathToFileUri,
} from '../lsp-client.js';

/**
 * Get language ID from file path
 */
function getLanguageIdFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'rs': 'rust',
    'go': 'go',
    'py': 'python',
    'cpp': 'cpp',
    'c': 'c',
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
  };
  return languageMap[ext] || '';
}

/**
 * LSP completion source for CodeMirror autocomplete
 */
export async function lspCompletionSource(
  context: CompletionContext,
  filePath: string
): Promise<CompletionResult | null> {
  const languageId = getLanguageIdFromPath(filePath);
  if (!languageId) return null;

  try {
    const pos = context.pos;
    const line = context.state.doc.lineAt(pos);
    const column = pos - line.from;

    const completions = await getCompletions(
      languageId,
      filePath,
      context.state.doc.toString(),
      line.number - 1,
      column
    );

    if (!completions || completions.length === 0) {
      return null;
    }

    const options = completions.map((c) => ({
      label: c.label,
      type: completionKindToType(c.kind),
      detail: c.detail,
      info: (completion) => {
        const icon = getCompletionIcon(completion.type || '');
        if (icon) {
          const iconEl = document.createElement('iconify-icon');
          iconEl.setAttribute('icon', icon);
          iconEl.setAttribute('width', '14');
          iconEl.setAttribute('height', '14');
          return iconEl;
        }
        return null;
      },
      apply: c.insertText || c.label,
      filterText: c.filterText || c.label,
    })) as Completion[];

    const word = context.matchBefore(/[\w.]*$/);
    if (!word) return null;

    return {
      from: word.from,
      options,
      validFor: /^\w*$/,
    };
  } catch (error) {
    console.error('LSP completion error:', error);
    return null;
  }
}

/**
 * Show LSP hover tooltip using global component
 * Emits event for hover-tooltip component to render
 */
export function showLspHoverTooltip(
  view: EditorView,
  pos: number,
  filePath: string
): void {
  const languageId = getLanguageIdFromPath(filePath);
  if (!languageId) return;

  (async () => {
    try {
      const line = view.state.doc.lineAt(pos);
      const column = pos - line.from;

      const hover = await getHover(
        languageId,
        filePath,
        view.state.doc.toString(),
        line.number - 1,
        column
      );

      // Log original LSP hover response to console
      console.log('[LSP Hover] Raw hover response:', hover);
      console.log('[LSP Hover] HTML from backend:', hover?.html);
      console.log('[LSP Hover] Contents from backend:', hover?.contents);

      if (!hover) return;

      // Check if we have any content at all
      const hasContent = hover.html || hover.contents;
      if (!hasContent) {
        console.log('[LSP Hover] No content returned from LSP server');
        return;
      }

      // Get coordinates for positioning
      const coords = view.coordsAtPos(pos);
      if (!coords) return;

      const editorRect = view.dom.getBoundingClientRect();

      // Emit event for global tooltip component - use pre-rendered HTML from backend
      document.dispatchEvent(new CustomEvent('lsp-hover', {
        detail: {
          html: hover.html || '',
          contents: hover.contents,  // Keep for debugging
          position: {
            x: coords.right,
            y: coords.bottom,
            editorRect,
          },
          languageId,
        } as HoverData,
        bubbles: true,
        composed: true,
      }));
    } catch (error) {
      console.error('LSP hover error:', error);
    }
  })();
}

/**
 * Create debug hover tooltip extension
 */
export function debugHoverTooltip(
  getDebugVariable: (name: string) => string | undefined
) {
  return hoverTooltip(async (view: EditorView, pos: number) => {
    const line = view.state.doc.lineAt(pos);
    const wordRange = view.state.wordAt(pos);
    if (!wordRange) return null;

    const word = view.state.doc.sliceString(wordRange.from, wordRange.to);
    const value = getDebugVariable(word);

    if (!value) return null;

    const dom = document.createElement('div');
    dom.className = 'cm-debug-hover';
    dom.innerHTML = `
      <div class="debug-variable-name">${word}</div>
      <div class="debug-variable-value">${value}</div>
    `;

    return {
      pos: wordRange.from,
      above: true,
      create: () => ({ dom }),
    };
  });
}

/**
 * Notify LSP of document open
 */
export async function notifyLspDocumentOpen(content: string, filePath: string): Promise<void> {
  const languageId = getLanguageIdFromPath(filePath);
  if (!languageId) return;

  try {
    const uri = pathToFileUri(filePath);
    await notifyDocumentOpened(languageId, uri, content, 1);
  } catch (error) {
    console.error('LSP document open notification error:', error);
  }
}

/**
 * Notify LSP of document change
 */
export async function notifyLspDocumentChange(content: string, filePath: string, version: number): Promise<void> {
  const languageId = getLanguageIdFromPath(filePath);
  if (!languageId) return;

  try {
    const uri = pathToFileUri(filePath);
    await notifyDocumentChanged(languageId, uri, content, version);
  } catch (error) {
    console.error('LSP document change notification error:', error);
  }
}

/**
 * Notify LSP of document close
 */
export async function notifyLspDocumentClose(filePath: string): Promise<void> {
  const languageId = getLanguageIdFromPath(filePath);
  if (!languageId) return;

  try {
    const uri = pathToFileUri(filePath);
    await notifyDocumentClosed(languageId, uri);
  } catch (error) {
    console.error('LSP document close notification error:', error);
  }
}

/**
 * Handle go to definition
 */
export async function handleGoToDefinition(
  view: EditorView,
  filePath: string
): Promise<{ uri: string; line: number; column: number } | null> {
  const languageId = getLanguageIdFromPath(filePath);
  if (!languageId) return null;

  try {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const column = pos - line.from;

    const locations = await getDefinition(
      languageId,
      filePath,
      view.state.doc.toString(),
      line.number - 1,
      column
    );

    if (!locations || locations.length === 0) return null;

    const loc = locations[0];
    const targetUri = loc.uri.startsWith('file://') ? loc.uri.slice(7) : loc.uri;

    return {
      uri: decodeURIComponent(targetUri),
      line: loc.start_line,
      column: loc.start_char,
    };
  } catch (error) {
    console.error('Go to definition error:', error);
    return null;
  }
}

/**
 * Check if there's a definition at position (for status indicator)
 */
export async function checkDefinitionAtPosition(
  filePath: string,
  content: string,
  line: number,
  column: number
): Promise<boolean> {
  const languageId = getLanguageIdFromPath(filePath);
  if (!languageId) return false;

  try {
    const definition = await getDefinition(
      languageId,
      filePath,
      content,
      line - 1,
      column
    );
    return definition !== null && definition.length > 0;
  } catch {
    return false;
  }
}
