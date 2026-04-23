/**
 * Editor Theme - CodeMirror theme configuration
 *
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
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
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
      backgroundColor: 'var(--editor-gutter-background) !important',
      color: 'var(--editor-line-numbers) !important',
      borderRight: '1px solid var(--editor-gutter-border)',
      border: 'none',
      direction: 'ltr !important',
    },
    '.cm-gutter': {
      backgroundColor: 'var(--editor-gutter-background) !important',
      color: 'var(--editor-line-numbers) !important',
    },
    '.cm-gutterElement': {
      backgroundColor: 'var(--editor-gutter-background) !important',
      color: 'var(--editor-line-numbers) !important',
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
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
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
    '.cm-tooltip': {
      padding: '0',
      border: '1px solid var(--app-input-border)',
      background: 'var(--app-bg)',
      borderRadius: '6px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.06)',
      overflow: 'hidden',
      zIndex: '1000',
    },
    '.cm-tooltip-lsp': {
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
      fontSize: '11px',
      lineHeight: '1.5',
      color: 'var(--app-foreground)',
      maxWidth: 'min(450px, 80vw)',
      maxHeight: 'min(280px, 60vh)',
      overflow: 'auto',
    },
    '.cm-tooltip-lsp .hover-content': {
      padding: '0',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      overflowWrap: 'break-word',
    },
    // Hover signature - code block at top
    '.cm-tooltip-lsp .hover-signature': {
      padding: '6px 10px',
      background: 'var(--app-toolbar-hover)',
      borderBottom: '1px solid var(--app-input-border)',
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
      fontSize: '11px',
    },
    '.cm-tooltip-lsp .hover-signature code': {
      color: 'var(--app-foreground)',
    },
    // Hover body - main content
    '.cm-tooltip-lsp .hover-body': {
      padding: '8px 10px',
      fontSize: '11px',
      lineHeight: '1.5',
    },
    '.cm-tooltip-lsp .hover-body p': {
      margin: '0 0 10px 0',
      color: 'var(--app-foreground)',
    },
    '.cm-tooltip-lsp .hover-body p:last-child': {
      margin: '0',
    },
    // Code blocks in description
    '.cm-tooltip-lsp .hover-body .code-block': {
      background: 'var(--app-toolbar-hover)',
      borderRadius: '4px',
      padding: '8px 10px',
      overflow: 'auto',
      margin: '6px 0',
      fontSize: '10px',
      lineHeight: '1.4',
      border: '1px solid var(--app-input-border)',
    },
    '.cm-tooltip-lsp .hover-body .code-block code': {
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
      fontSize: '10px',
      background: 'transparent',
      padding: '0',
      color: 'inherit',
    },
    '.cm-tooltip-lsp .hover-body .code-pill': {
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
      fontSize: '10px',
      background: 'var(--app-toolbar-hover)',
      padding: '1px 5px',
      borderRadius: '3px',
      color: 'var(--app-type)',
      border: '1px solid var(--app-input-border)',
    },
    '.cm-tooltip-lsp .hover-body code:not(.code-pill):not(.code-block code)': {
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
      fontSize: '10px',
      background: 'var(--app-toolbar-hover)',
      padding: '1px 4px',
      borderRadius: '3px',
      color: 'var(--app-type)',
      border: '1px solid var(--app-input-border)',
    },
    // Hover footer with badges and links
    '.cm-tooltip-lsp .hover-footer': {
      padding: '6px 10px 8px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center',
      borderTop: '1px solid var(--app-input-border)',
      background: 'var(--app-toolbar-hover)',
    },
    '.cm-tooltip-lsp .type-badge': {
      fontSize: '9px',
      padding: '1px 6px',
      borderRadius: '8px',
      background: 'var(--app-button-background)',
      color: '#fff',
      fontWeight: '500',
    },
    '.cm-tooltip-lsp .tag-badge': {
      fontSize: '9px',
      padding: '1px 6px',
      borderRadius: '8px',
      background: 'var(--app-selection-background)',
      color: 'var(--app-foreground)',
      fontWeight: '500',
    },
    '.cm-tooltip-lsp .docs-link': {
      fontSize: '10px',
      color: 'var(--app-button-background)',
      textDecoration: 'none',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
    },
    '.cm-tooltip-lsp .docs-link:hover': {
      textDecoration: 'underline',
    },
    '.cm-tooltip-lsp .link-arrow': {
      fontSize: '9px',
    },
    // Lists in hover (marked.js output)
    '.cm-tooltip-lsp .hover-body .styled-list': {
      margin: '6px 0',
      paddingLeft: '18px',
      listStyleType: 'disc',
    },
    '.cm-tooltip-lsp .hover-body .styled-list .list-item': {
      marginBottom: '4px',
      paddingLeft: '3px',
      color: 'var(--app-foreground)',
      fontSize: '11px',
    },
    '.cm-tooltip-lsp .hover-body .styled-list::marker': {
      color: 'var(--app-button-background)',
    },
    // Inline links
    '.cm-tooltip-lsp .hover-body .inline-link': {
      color: 'var(--app-button-background)',
      textDecoration: 'none',
      fontWeight: '500',
      fontSize: '11px',
    },
    '.cm-tooltip-lsp .hover-body .inline-link:hover': {
      textDecoration: 'underline',
    },
    // Strong/emphasis
    '.cm-tooltip-lsp .hover-body strong': {
      fontWeight: '600',
      color: 'var(--app-foreground)',
    },
    '.cm-tooltip-lsp .hover-body em': {
      fontStyle: 'italic',
      color: 'var(--app-disabled-foreground)',
    },
    // Markdown headers (if any)
    '.cm-tooltip-lsp .hover-body h1': {
      fontSize: '13px',
      fontWeight: '600',
      margin: '8px 0 5px',
      color: 'var(--app-foreground)',
    },
    '.cm-tooltip-lsp .hover-body h2': {
      fontSize: '12px',
      fontWeight: '600',
      margin: '6px 0 4px',
      color: 'var(--app-foreground)',
    },
    '.cm-tooltip-lsp .hover-body h3': {
      fontSize: '11px',
      fontWeight: '500',
      margin: '5px 0 3px',
      color: 'var(--app-foreground)',
    },
    // Blockquotes
    '.cm-tooltip-lsp .hover-body blockquote': {
      margin: '6px 0',
      paddingLeft: '10px',
      borderLeft: '2px solid var(--app-button-background)',
      color: 'var(--app-disabled-foreground)',
      fontStyle: 'italic',
      fontSize: '10px',
    },
    // Syntax highlighting in tooltips - matches editor theme
    '.cm-tooltip-lsp .hl-kw': {
      color: 'var(--app-keyword)',
      fontWeight: '500',
    },
    '.cm-tooltip-lsp .hl-type': {
      color: 'var(--app-type)',
    },
    '.cm-tooltip-lsp .hl-str': {
      color: 'var(--app-string)',
    },
    '.cm-tooltip-lsp .hl-num': {
      color: 'var(--app-number)',
    },
    '.cm-tooltip-lsp .hl-bool': {
      color: 'var(--app-boolean)',
    },
    '.cm-tooltip-lsp .hl-fn': {
      color: 'var(--app-foreground)',
      fontWeight: '600',
    },
    '.cm-tooltip-lsp .hl-prop': {
      color: 'var(--app-foreground)',
      fontStyle: 'italic',
    },
    '.cm-tooltip-lsp .hl-comment': {
      color: 'var(--app-disabled-foreground)',
      fontStyle: 'italic',
    },
    '.cm-tooltip-lsp .hover-body li': {
      marginBottom: '4px',
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
