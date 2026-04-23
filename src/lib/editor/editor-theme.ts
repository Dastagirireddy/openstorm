/**
 * Editor Theme - CodeMirror theme configuration
 *
 * Provides IntelliJ-style theme for CodeMirror 6
 * Uses CSS variables for dynamic theme support
 */

import { EditorView, lineNumbers } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/**
 * Get editor theme extension
 */
export function getEditorTheme(): Extension {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '15px',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      backgroundColor: 'var(--editor-background)',
      direction: 'ltr !important',
    },
    '.cm-content': {
      padding: '10px 0',
      direction: 'ltr !important',
      caretColor: 'var(--app-foreground)',
      cursor: 'text',
    },
    '.cm-line': {
      padding: '0 2px',
      cursor: 'text',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-gutter-background)',
      color: 'var(--editor-line-numbers)',
      borderRight: '1px solid var(--editor-gutter-border)',
      border: 'none',
      direction: 'ltr !important',
    },
    '.cm-breakpoint-gutter': {
      pointerEvents: 'auto',
      cursor: 'pointer',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--editor-active-line)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--app-tab-active-border, #d4ebf7)',
      color: 'var(--app-foreground)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 12px',
      minWidth: '40px',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--editor-selection)',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--editor-selection)',
    },
    '.cm-cursor': {
      borderLeft: '2px solid var(--app-foreground)',
    },
    // Debug hover tooltip styling
    '.debug-hover-tooltip': {
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '12px',
      maxWidth: '400px',
      minWidth: '200px',
      padding: '8px 12px',
      background: 'var(--app-bg)',
      border: '1px solid var(--app-input-border)',
      borderRadius: '6px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
      zIndex: '1000',
    },
    '.debug-variable-name': {
      color: 'var(--app-type)',
      fontWeight: '600',
      marginBottom: '4px',
    },
    '.debug-variable-value': {
      color: 'var(--app-string)',
    },
    // LSP hover tooltip styling
    '.cm-lsp-hover': {
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '12px',
      maxWidth: '500px',
      padding: '8px 12px',
      background: 'var(--app-bg)',
      border: '1px solid var(--app-input-border)',
      borderRadius: '6px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
    },
    '.cm-lsp-hover .hover-content': {
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    // Breakpoint styling
    '.cm-breakpoint-dot': {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: 'var(--app-breakpoint)',
      marginLeft: '4px',
      marginTop: '4px',
      opacity: '0.8',
    },
    '.cm-breakpoint-dot.cm-breakpoint-disabled': {
      backgroundColor: 'var(--app-breakpoint-disabled)',
      opacity: '0.5',
    },
    '.cm-breakpoint-dot.cm-breakpoint-debug': {
      backgroundColor: 'var(--app-breakpoint-conditional)',
    },
    '.cm-breakpoint-dot.cm-breakpoint-current': {
      backgroundColor: 'var(--app-continue-color)',
      animation: 'pulse 1s infinite',
    },
    '.cm-breakpoint-verified': {
      backgroundColor: 'rgba(244, 67, 54, 0.1)',
    },
    '.cm-breakpoint-unverified': {
      backgroundColor: 'rgba(158, 158, 158, 0.1)',
    },
    // Debug line highlighting
    '.cm-debug-line-current': {
      backgroundColor: 'var(--app-continue-color, #22c55e)',
      opacity: '0.3',
    },
    // Indentation markers
    '.cm-indent-marker': {
      opacity: '0.15',
    },
    // Fold gutter
    '.cm-foldGutter': {
      width: '20px',
    },
    '.cm-foldGutter .cm-gutterElement': {
      cursor: 'pointer',
      color: 'var(--app-disabled-foreground)',
    },
    '.cm-foldGutter .cm-gutterElement:hover': {
      color: 'var(--app-foreground)',
    },
  });
}

/**
 * Get line numbers extension
 */
export function getLineNumbers(): Extension {
  return lineNumbers({
    formatNumber: (n: number) => String(n),
  });
}
