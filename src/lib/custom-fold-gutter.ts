import { foldGutter } from '@codemirror/language';

/**
 * Creates a fold gutter with chevron-style icons
 */
export function customFoldGutter() {
  return [
    // Use built-in foldGutter with chevron-like Unicode characters
    foldGutter({
      openText: '▼', // Down triangle (expanded state)
      closedText: '▶', // Right triangle (collapsed state)
    }),
  ];
}
