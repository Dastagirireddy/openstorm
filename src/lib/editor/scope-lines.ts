/**
 * Scope Lines - Syntax-tree-based scope guide lines
 *
 * Draws vertical indentation guides based on the syntax tree structure.
 * Inspired by Ulka Editor's scope lines implementation.
 */

import { syntaxTree } from '@codemirror/language';
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

class ScopeLineWidget extends WidgetType {
  constructor(readonly indent: number) {
    super();
  }

  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-scope-line-widget';
    wrap.style.left = `${this.indent}ch`;
    return wrap;
  }

  eq(other: ScopeLineWidget) {
    return this.indent === other.indent;
  }
}

const scopeLinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private lastViewportStart = 0;
    private lastViewportEnd = 0;

    constructor(view: EditorView) {
      this.decorations = this.getScopeLines(view);
      const vp = view.viewport;
      this.lastViewportStart = vp.from;
      this.lastViewportEnd = vp.to;
    }

    update(update: ViewUpdate) {
      // Only rebuild on viewport change (scroll), not on every doc change.
      // CodeMirror automatically shifts decorations on doc changes.
      if (update.viewportChanged) {
        const vp = update.view.viewport;
        // Rebuild if viewport scrolled more than 100 lines
        const scrolledLines = Math.abs(vp.from - this.lastViewportStart);
        if (scrolledLines > 100 || vp.to !== this.lastViewportEnd) {
          this.decorations = this.getScopeLines(update.view);
          this.lastViewportStart = vp.from;
          this.lastViewportEnd = vp.to;
        }
      }
    }

    getScopeLines(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const tree = syntaxTree(view.state);
      const lineMap = new Map<number, Set<number>>();

      tree.iterate({
        enter: (node) => {
          // Detect scope blocks: Block, List, Arm, Body, etc.
          if (
            node.name.includes('Block') ||
            node.name.includes('List') ||
            node.name.includes('Arm') ||
            node.name.includes('Body') ||
            node.name.includes('Params') ||
            node.name.includes('Arguments') ||
            node.name.includes('FieldDeclaration') ||
            node.name.includes('ClassBody') ||
            node.name.includes('SwitchBlock') ||
            node.name.includes('CaseClause')
          ) {
            const startLine = view.state.doc.lineAt(node.from);
            const endLine = view.state.doc.lineAt(node.to);

            if (startLine.number !== endLine.number) {
              const indent = this.getIndent(startLine.text);
              if (indent === 0) return; // Skip level 0

              for (let i = startLine.number + 1; i < endLine.number; i++) {
                if (!lineMap.has(i)) lineMap.set(i, new Set());
                lineMap.get(i)!.add(indent);
              }
            }
          }
        },
      });

      const sortedLines = Array.from(lineMap.keys()).sort((a, b) => a - b);

      for (const lineNum of sortedLines) {
        if (lineNum > view.state.doc.lines) continue;

        const line = view.state.doc.line(lineNum);
        const indents = Array.from(lineMap.get(lineNum)!);

        indents.forEach((indent) => {
          builder.add(
            line.from,
            line.from,
            Decoration.widget({
              widget: new ScopeLineWidget(indent),
              side: 1,
              block: false,
            })
          );
        });
      }

      return builder.finish();
    }

    getIndent(text: string) {
      let count = 0;
      for (const char of text) {
        if (char === ' ') count++;
        else if (char === '\t') count += 4;
        else break;
      }
      return count;
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

/**
 * Scope lines extension
 *
 * Usage: `view.dispatch({ effects: ... })` or include in extension array
 */
export function scopeLines() {
  return [scopeLinePlugin];
}
