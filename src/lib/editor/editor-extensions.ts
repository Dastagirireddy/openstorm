/**
 * Editor Extensions - Core extension stack
 *
 * Provides the common extension configuration used by CodeMirror 6
 */

import { EditorState } from '@codemirror/state';
import { indentUnit, bracketMatching, indentOnInput } from '@codemirror/language';
import {
  lineNumbers,
  highlightActiveLineGutter,
  EditorView,
  keymap,
  highlightActiveLine,
  drawSelection,
  dropCursor,
} from '@codemirror/view';
import { scopeLines } from './scope-lines';
import { tooltipHighlight } from './tooltip-highlight';
import { history, historyKeymap, defaultKeymap, undo, redo } from '@codemirror/commands';
import { closeBrackets } from '@codemirror/autocomplete';
import { customFoldGutter } from '../utils';
import { getSyntaxHighlighting } from './editor-syntax.js';
import { breakpointGutter, breakpointField, debugLineHighlight, inlineValueField, inlineValueDecorations } from './editor-breakpoints.js';
import { dispatch } from '../types/events.js';
import { settingsStore } from '../services/settings-store.js';

/**
 * Generates the core extension stack
 * @param indentUnitStr - The detected indent unit string (e.g., "  ", "    ", "\t")
 * @param onBreakpointClick - Callback for breakpoint clicks
 */
export function getCommonExtensions(
  indentUnitStr: string = "    ",
  onBreakpointClick?: (lineNum: number, hasBreakpoint: boolean) => void
) {
  const extensions = [
    EditorState.tabSize.of(4),
    indentUnit.of(indentUnitStr),
    inlineValueField,
    inlineValueDecorations(),
    breakpointField,
    breakpointGutter(onBreakpointClick ?? (() => {})),
    ...(settingsStore.get('lineNumbers') ? [lineNumbers()] : []),
    highlightActiveLineGutter(),
    ...customFoldGutter(),
    ...debugLineHighlight(),
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    // Scope lines based on syntax tree structure
    ...scopeLines(),
    // Syntax highlighting for code blocks in tooltips
    tooltipHighlight(),
    getSyntaxHighlighting(),
    // Track cursor position changes
    EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        const column = pos - line.from + 1; // 1-indexed
        dispatch('cursor-position', { line: line.number, column });
      }
    }),
    // Keymap order matters - historyKeymap must come before defaultKeymap
    // so undo/redo takes precedence
    // Explicitly define undo/redo keybindings for macOS Cmd+Z / Cmd+Shift+Z
    keymap.of([
      {
        key: 'Mod-z',
        run: (view) => {
          console.log('[Editor] Undo key pressed (Mod-z)');
          return undo(view);
        },
      },
      {
        key: 'Mod-y',
        run: (view) => {
          console.log('[Editor] Redo key pressed (Mod-y)');
          return redo(view);
        },
      },
      {
        key: 'Mod-Shift-z',
        run: (view) => {
          console.log('[Editor] Redo key pressed (Mod-Shift-z)');
          return redo(view);
        },
      },
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    // Word wrap from settings
    ...(settingsStore.get('wordWrap') ? [EditorView.lineWrapping] : []),
  ];

  return extensions;
}

// Re-export these for convenience
export { inlineValueField, inlineValueDecorations } from './editor-breakpoints.js';
