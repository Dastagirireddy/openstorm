/**
 * Editor Blame Decorations
 *
 * CodeMirror 6 gutter decorations for inline git blame.
 */

import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  GutterMarker,
  hoverTooltip,
  gutter,
  Decoration,
} from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder, RangeSet } from '@codemirror/state';
import type { BlameData, BlameLine } from '../git/git-blame.js';
import { formatRelativeTime, getAuthorColor, getAuthorInitials } from '../git/git-blame.js';

// Re-export BlameLine for consumers
export type { BlameLine };

// State effect to set blame data
export const setBlameData = StateEffect.define<BlameData | null>({
  map: (value) => value,
});

// State field to store blame data
export const blameField = StateField.define<BlameData | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlameData)) {
        return effect.value;
      }
    }
    return value;
  },
});

// Blame gutter marker
class BlameMarker extends GutterMarker {
  constructor(
    private blameLine: BlameLine,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-blame-annotation';
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px;
      font-size: 11px;
      color: var(--app-secondary-foreground);
      cursor: pointer;
      user-select: none;
      opacity: 0.7;
      transition: opacity 0.15s;
      height: 100%;
    `;
    container.onmouseenter = () => {
      container.style.opacity = '1';
    };
    container.onmouseleave = () => {
      container.style.opacity = '0.7';
    };

    // Author avatar
    const avatar = document.createElement('div');
    avatar.className = 'cm-blame-avatar';
    avatar.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 600;
      color: var(--app-bg);
      flex-shrink: 0;
    `;
    avatar.style.backgroundColor = getAuthorColor(this.blameLine.authorEmail);
    avatar.textContent = getAuthorInitials(this.blameLine.author);
    container.appendChild(avatar);

    // Author name and time
    const info = document.createElement('span');
    info.className = 'cm-blame-info';
    info.style.cssText = `
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    info.textContent = `${this.blameLine.author} · ${formatRelativeTime(this.blameLine.authorTime)}`;
    container.appendChild(info);

    return container;
  }

  eq(other: BlameMarker): boolean {
    return (
      other instanceof BlameMarker &&
      other.blameLine.hash === this.blameLine.hash &&
      other.blameLine.lineNumber === this.blameLine.lineNumber
    );
  }
}

// View plugin for blame gutter (required for gutter extension to work)
export const blameGutterPlugin = ViewPlugin.fromClass(class {});

// Blame hover tooltip
export function blameHoverTooltip(
  getBlameForLine: (line: number) => BlameLine | null,
) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const blame = getBlameForLine(line.number);

    if (!blame) return null;

    const dom = document.createElement('div');
    dom.className = 'cm-blame-tooltip';
    dom.style.cssText = `
      padding: 8px 12px;
      font-size: 12px;
      max-width: 400px;
      background: var(--app-bg);
      border: 1px solid var(--app-border);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    // Header with hash and subject
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    `;

    // Avatar
    const avatar = document.createElement('div');
    avatar.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: var(--app-bg);
      flex-shrink: 0;
    `;
    avatar.style.backgroundColor = getAuthorColor(blame.authorEmail);
    avatar.textContent = getAuthorInitials(blame.author);
    header.appendChild(avatar);

    // Author info
    const authorInfo = document.createElement('div');
    authorInfo.style.flex = '1';
    authorInfo.style.minWidth = '0';
    authorInfo.innerHTML = `
      <div style="font-weight: 500; color: var(--app-foreground);">${blame.author}</div>
      <div style="font-size: 11px; color: var(--app-secondary-foreground);">${formatRelativeTime(blame.authorTime)}</div>
    `;
    header.appendChild(authorInfo);

    // Commit hash
    const hash = document.createElement('span');
    hash.style.cssText = `
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--app-secondary-foreground);
      background: var(--app-toolbar-bg);
      padding: 2px 6px;
      border-radius: 4px;
    `;
    hash.textContent = blame.shortHash;
    header.appendChild(hash);

    dom.appendChild(header);

    // Commit subject
    const subject = document.createElement('div');
    subject.style.cssText = `
      color: var(--app-foreground);
      margin-bottom: 6px;
      font-weight: 500;
    `;
    subject.textContent = blame.subject;
    dom.appendChild(subject);

    // Line content preview
    const lineContent = document.createElement('div');
    lineContent.style.cssText = `
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--app-secondary-foreground);
      background: var(--app-toolbar-bg);
      padding: 6px 8px;
      border-radius: 4px;
      white-space: pre;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    lineContent.textContent = blame.lineContent || '';
    dom.appendChild(lineContent);

    return {
      pos: line.from,
      above: true,
      create: () => ({ dom }),
    };
  });
}

// Create blame gutter extension
export function getBlameGutter() {
  let lastLineCount = -1;
  return gutter({
    class: 'cm-blame-gutter',
    markers: (view) => {
      const blameData = view.state.field(blameField);
      if (!blameData) {
        if (lastLineCount !== 0) {
          console.log('[blame-gutter] No blameData in state field');
          lastLineCount = 0;
        }
        return RangeSet.of([]);
      }

      const builder = new RangeSetBuilder<GutterMarker>();
      let markerCount = 0;

      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          const lineNum = line.number;
          const blameLine = blameData.lines.find((b) => b.lineNumber === lineNum);
          if (blameLine) {
            builder.add(line.from, line.from, new BlameMarker(blameLine));
            markerCount++;
          }
          pos = line.to + 1;
        }
      }

      if (markerCount !== lastLineCount) {
        console.log('[blame-gutter] Built', markerCount, 'markers for', blameData.lines.length, 'blame lines');
        lastLineCount = markerCount;
      }

      return builder.finish();
    },
    initialSpacer: () => new BlameMarker({
      hash: '',
      shortHash: '',
      author: '',
      authorEmail: '',
      authorTime: 0,
      subject: '',
      lineContent: '',
      lineNumber: 0,
      originalLineNumber: 0,
    }),
  });
}
