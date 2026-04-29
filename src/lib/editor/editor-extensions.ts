/**
 * Editor Extensions - Core extension stack
 *
 * Provides the common extension configuration used by CodeMirror 6
 */

import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, indentUnit, bracketMatching, indentOnInput } from '@codemirror/language';
import {
  lineNumbers,
  highlightActiveLineGutter,
  EditorView,
  keymap,
  highlightActiveLine,
  drawSelection,
  dropCursor,
  gutter,
} from '@codemirror/view';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';
import { history, historyKeymap, defaultKeymap, undo, redo } from '@codemirror/commands';
import { customFoldGutter } from '../utils';
import { openStormHighlight } from './editor-syntax.js';
import { breakpointGutter, breakpointField, debugLineHighlight, inlineValueField, inlineValueDecorations } from './editor-breakpoints.js';
import { blameField, blameGutterPlugin, getBlameGutter, type BlameLine } from './editor-blame.js';

/**
 * Generates the core extension stack
 * @param indentUnitStr - The detected indent unit string (e.g., "  ", "    ", "\t")
 * @param onBreakpointClick - Callback for breakpoint clicks
 * @param blameEnabled - Whether git blame gutter is enabled
 */
export function getCommonExtensions(
  indentUnitStr: string = "    ",
  onBreakpointClick?: (lineNum: number, hasBreakpoint: boolean) => void,
  blameEnabled: boolean = false
) {
  return [
    EditorState.tabSize.of(4),
    indentUnit.of(indentUnitStr),
    inlineValueField,
    inlineValueDecorations(),
    breakpointField,
    breakpointGutter(onBreakpointClick ?? (() => {})),
    blameField,
    blameGutterPlugin,
    ...(blameEnabled ? [getBlameGutter()] : []),
    lineNumbers(),
    highlightActiveLineGutter(),
    ...customFoldGutter(),
    ...debugLineHighlight(),
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    bracketMatching(),
    indentOnInput(),
    // indentationMarkers with "fullScope" tracks both tabs and spaces
    indentationMarkers({
      highlightActiveBlock: true,
      markerType: "fullScope",
      thickness: 1,
      activeThickness: 1,
      colors: {
        light: '#d0d0d0',
        dark: '#505050',
        activeLight: '#b0b0b0',
        activeDark: '#707070',
      },
    }),
    syntaxHighlighting(openStormHighlight),
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
  ];
}

// Re-export these for convenience
export { inlineValueField, inlineValueDecorations } from './editor-breakpoints.js';
