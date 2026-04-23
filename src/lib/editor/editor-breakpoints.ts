/**
 * Editor Breakpoints - Breakpoint management for the editor
 *
 * Extracted from editor-pane.ts to provide:
 * - Breakpoint state management
 * - Breakpoint gutter rendering
 * - Debug line highlighting
 */

import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { GutterMarker, gutter, gutterLineClass, Decoration, DecorationSet, EditorView } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';

/**
 * Breakpoint interface
 */
export interface Breakpoint {
  id: number;
  sourcePath: string;
  line: number;
  enabled: boolean;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  verified: boolean;
}

/**
 * State effects for breakpoint operations
 */
export const addBreakpointEffect = StateEffect.define<number>();
export const removeBreakpointEffect = StateEffect.define<number>();
export const setBreakpointsEffect = StateEffect.define<number[]>();
export const setDebugLineEffect = StateEffect.define<number | null>();
export const setDebugModeEffect = StateEffect.define<boolean>();

/**
 * State field for debug mode
 */
export const debugModeField = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const e of transaction.effects) {
      if (e.is(setDebugModeEffect)) {
        return e.value;
      }
    }
    return value;
  },
});

/**
 * Inline value display during debugging
 */
export const inlineValueField = StateField.define<Map<string, { line: number; column: number; value: string }>>({
  create() {
    return new Map();
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setInlineValueEffect)) {
        const newMap = new Map(value);
        const key = `${effect.value.line}-${effect.value.column}`;
        newMap.set(key, effect.value);
        return newMap;
      }
      if (effect.is(clearInlineValueEffect)) {
        return new Map();
      }
    }
    return value;
  },
});

export const setInlineValueEffect = StateEffect.define<{ line: number; column: number; value: string }>();
export const clearInlineValueEffect = StateEffect.define();

/**
 * Inline value decoration
 */
export function inlineValueDecorations() {
  return EditorView.decorations.compute(['doc', inlineValueField], (state) => {
    const inlineValues = state.field(inlineValueField);
    const decorations: any[] = [];

    for (const [key, data] of inlineValues.entries()) {
      const line = state.doc.line(data.line);
      if (line && data.column < line.length) {
        const pos = line.from + data.column;
        decorations.push(
          Decoration.mark({
            class: 'cm-inline-value-after',
            attributes: { 'data-value': data.value },
          }).range(pos, pos)
        );
      }
    }

    return Decoration.set(decorations);
  });
}

/**
 * Debug line highlight extension
 */
export function debugLineHighlight() {
  return [
    debugLineField,
    debugModeField,
    EditorView.decorations.compute(['doc', debugLineField], (state) => {
      const line = state.field(debugLineField);
      if (line === null) return Decoration.none;

      const lineInfo = state.doc.line(line);
      if (!lineInfo) return Decoration.none;

      return Decoration.set([
        Decoration.line({ class: 'cm-debug-line' }).range(lineInfo.from),
      ]);
    }),
  ];
}

/**
 * State field for tracking breakpoints in the editor
 */
export const breakpointField = StateField.define<Set<number>>({
  create: () => new Set<number>(),
  update(value, transaction) {
    for (const e of transaction.effects) {
      if (e.is(addBreakpointEffect)) {
        const newValue = new Set(value);
        newValue.add(e.value);
        return newValue;
      }
      if (e.is(removeBreakpointEffect)) {
        const newValue = new Set(value);
        newValue.delete(e.value);
        return newValue;
      }
      if (e.is(setBreakpointsEffect)) {
        return new Set(e.value);
      }
    }
    return value;
  },
});

/**
 * State field for tracking the current debug line
 */
export const debugLineField = StateField.define<number | null>({
  create: () => null,
  update(value, transaction) {
    for (const e of transaction.effects) {
      if (e.is(setDebugLineEffect)) {
        return e.value;
      }
    }
    return value;
  },
});

/**
 * Gutter marker for breakpoints
 */
class BreakpointMarker extends GutterMarker {
  constructor(
    private readonly isDebugMode: boolean = false,
    private readonly isCurrentLine: boolean = false
  ) {
    super();
  }

  toDOM() {
    const div = document.createElement('div');
    if (this.isCurrentLine) {
      div.className = 'cm-breakpoint-dot cm-breakpoint-current';
    } else if (this.isDebugMode) {
      div.className = 'cm-breakpoint-dot cm-breakpoint-debug';
    } else {
      div.className = 'cm-breakpoint-dot';
    }
    return div;
  }
}

/**
 * Gutter marker for debug line highlighting
 */
class DebugLineMarker extends GutterMarker {
  toDOM() {
    const div = document.createElement('div');
    div.className = 'cm-debug-line-current';
    return div;
  }
}

/**
 * Create breakpoint gutter
 */
export function breakpointGutter(
  onClick: (lineNum: number, wasThere: boolean) => void
) {
  return gutter({
    class: 'cm-breakpoint-gutter',
    markers: (view) => {
      const breakpointSet = view.state.field(breakpointField);
      const debugLine = view.state.field(debugLineField);
      const isDebugMode = debugLine !== null;

      const builder = new RangeSetBuilder<GutterMarker>();

      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          const lineNum = line.number;

          if (breakpointSet.has(lineNum)) {
            const isCurrentDebugLine = debugLine === lineNum;
            builder.add(
              line.from,
              line.from,
              isCurrentDebugLine
                ? new BreakpointMarker(true, true)
                : new BreakpointMarker(isDebugMode, false)
            );
          } else if (isDebugMode && debugLine === lineNum) {
            builder.add(line.from, line.from, new DebugLineMarker());
          }

          pos = line.to + 1;
        }
      }

      return builder.finish();
    },
    initialSpacer: () => {
      const marker = new BreakpointMarker();
      return marker;
    },
    domEventHandlers: {
      mousedown: (view, line) => {
        const lineNum = view.state.doc.lineAt(line.from).number;
        const breakpointSet = view.state.field(breakpointField);
        onClick(lineNum, breakpointSet.has(lineNum));
        return true;
      },
    },
  });
}

/**
 * Get breakpoint decorations for the editor
 */
export function getBreakpointDecorations(
  view: EditorView,
  breakpoints: Breakpoint[]
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const bp of breakpoints) {
    if (bp.enabled) {
      const line = view.state.doc.line(bp.line);
      builder.add(
        line.from,
        line.from,
        Decoration.line({
          class: bp.verified ? 'cm-breakpoint-verified' : 'cm-breakpoint-unverified',
        })
      );
    }
  }

  return builder.finish();
}

/**
 * Breakpoint manager class for handling breakpoint operations
 */
export class BreakpointManager {
  private breakpoints: Map<string, Breakpoint[]> = new Map();
  private nextBreakpointId = 1;

  /**
   * Add a breakpoint
   */
  addBreakpoint(
    sourcePath: string,
    line: number,
    condition?: string,
    hitCondition?: string,
    logMessage?: string
  ): Breakpoint {
    const fileBreakpoints = this.breakpoints.get(sourcePath) || [];

    // Check if breakpoint already exists at this line
    const existing = fileBreakpoints.find((bp) => bp.line === line);
    if (existing) {
      return existing;
    }

    const breakpoint: Breakpoint = {
      id: this.nextBreakpointId++,
      sourcePath,
      line,
      enabled: true,
      condition,
      hitCondition,
      logMessage,
      verified: false,
    };

    fileBreakpoints.push(breakpoint);
    this.breakpoints.set(sourcePath, fileBreakpoints);

    return breakpoint;
  }

  /**
   * Remove a breakpoint
   */
  removeBreakpoint(sourcePath: string, breakpoint: Breakpoint): void {
    const fileBreakpoints = this.breakpoints.get(sourcePath) || [];
    const index = fileBreakpoints.findIndex((bp) => bp.id === breakpoint.id);
    if (index !== -1) {
      fileBreakpoints.splice(index, 1);
      this.breakpoints.set(sourcePath, fileBreakpoints);
    }
  }

  /**
   * Set breakpoints for a file (replaces all existing breakpoints)
   */
  setBreakpoints(sourcePath: string, breakpoints: Breakpoint[]): void {
    this.breakpoints.set(sourcePath, breakpoints);
  }

  /**
   * Get breakpoints for a file
   */
  getBreakpoints(sourcePath: string): Breakpoint[] {
    return this.breakpoints.get(sourcePath) || [];
  }

  /**
   * Get all breakpoints
   */
  getAllBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values()).flat();
  }

  /**
   * Clear all breakpoints
   */
  clearAllBreakpoints(): void {
    this.breakpoints.clear();
  }

  /**
   * Get line numbers for breakpoints in a file
   */
  getBreakpointLines(sourcePath: string): number[] {
    const fileBreakpoints = this.breakpoints.get(sourcePath) || [];
    return fileBreakpoints.filter((bp) => bp.enabled).map((bp) => bp.line);
  }

  /**
   * Update breakpoint verification status
   */
  setBreakpointVerified(sourcePath: string, line: number, verified: boolean): void {
    const fileBreakpoints = this.breakpoints.get(sourcePath) || [];
    const bp = fileBreakpoints.find((b) => b.line === line);
    if (bp) {
      bp.verified = verified;
    }
  }

  /**
   * Get breakpoint at a line
   */
  getBreakpointAtLine(sourcePath: string, line: number): Breakpoint | undefined {
    const fileBreakpoints = this.breakpoints.get(sourcePath) || [];
    return fileBreakpoints.find((bp) => bp.line === line);
  }
}
