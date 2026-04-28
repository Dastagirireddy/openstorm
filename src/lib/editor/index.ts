/**
 * Editor Library Index
 *
 * Modular editor components extracted from editor-pane.ts
 */

// Syntax highlighting and language support
export {
  openStormHighlight,
  getSyntaxHighlighting,
  getLanguageExtension,
  detectIndentUnit,
  getLanguageName,
  getLanguageId,
} from './editor-syntax.js';

// Breakpoint management
export {
  Breakpoint,
  breakpointField,
  debugLineField,
  debugModeField,
  addBreakpointEffect,
  removeBreakpointEffect,
  setBreakpointsEffect,
  setDebugLineEffect,
  setDebugModeEffect,
  breakpointGutter,
  debugLineHighlight,
  getBreakpointDecorations,
  BreakpointManager,
  inlineValueField,
  inlineValueDecorations,
  setInlineValueEffect,
  clearInlineValueEffect,
} from './editor-breakpoints.js';

// LSP integration
export {
  lspCompletionSource,
  debugHoverTooltip,
  notifyLspDocumentOpen,
  notifyLspDocumentChange,
  notifyLspDocumentClose,
  handleGoToDefinition,
  checkDefinitionAtPosition,
} from './editor-lsp.js';

// Theme configuration
export {
  getEditorTheme,
  getLineNumbers,
} from './editor-theme.js';

// Core extension stack
export {
  getCommonExtensions,
} from './editor-extensions.js';
