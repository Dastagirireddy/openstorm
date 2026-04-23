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
import { hoverTooltip } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
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
 * Create LSP hover tooltip extension
 */
export function lspHoverTooltip(filePath: string) {
  const languageId = getLanguageIdFromPath(filePath);
  if (!languageId) return null;

  return hoverTooltip(async (view: EditorView, pos: number) => {
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

      if (!hover || !hover.contents) return null;

      // Parse hover contents to extract metadata for rich tooltip
      const sections = hover.contents.split(/\n---\n/);
      const signature = sections[0]?.trim().replace(/^```(\w*)\n?([\s\S]*?)\n?```$/, '$2') || '';
      const description = sections.slice(1, -1).join('\n').trim();
      const lastSection = sections[sections.length - 1]?.trim() || '';

      // Parse link from last section
      const linkMatch = lastSection.match(/\[([^\]]+)\]\(([^)]+)\)/);
      const link = linkMatch ? { text: linkMatch[1], url: linkMatch[2] } : undefined;

      // Detect tags from content or signature
      const tags: string[] = [];
      if (signature.includes('Console') || languageId === 'typescript') {
        if (signature.includes('Console')) tags.push('built-in');
        tags.push('dom');
      }

      // Detect availability from content keywords
      let availability: 'widely-available' | 'experimental' | 'deprecated' | undefined;
      if (description.toLowerCase().includes('deprecated')) {
        availability = 'deprecated';
      } else if (description.toLowerCase().includes('experimental')) {
        availability = 'experimental';
      } else if (description.toLowerCase().includes('widely available') || description.toLowerCase().includes('standard')) {
        availability = 'widely-available';
      }

      const dom = document.createElement('div');
      dom.innerHTML = formatHoverContent(hover.contents, {
        signature,
        typeInfo: hover.range ? 'property' : undefined,
        tags: tags.length > 0 ? tags : undefined,
        link,
        availability,
      });

      return {
        pos,
        above: true,
        create: () => ({ dom }),
      };
    } catch (error) {
      console.error('LSP hover error:', error);
      return null;
    }
  });
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
