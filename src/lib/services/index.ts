/**
 * Service Layer Index
 *
 * Central export point for all services
 * Use these services instead of direct invoke() calls
 */

export { FileService, getFileService } from './file-service.js';
export { LspService, getLspService } from './lsp-service.js';
export { DebugService, getDebugService } from './debug-service.js';
export { TerminalService, getTerminalService } from './terminal-service.js';
export { ThemeService, getThemeService } from './theme-service.js';

// Re-export types
export type {
  ReadFileOptions,
  WriteFileOptions,
  FileInfo,
} from './file-service.js';

export type {
  LspServerStatus,
  CompletionContext,
  HoverContext,
  DefinitionContext,
  LspEvent,
} from './lsp-service.js';

export type {
  DebugConfiguration,
  DebugSessionInfo,
  DebugEvent,
} from './debug-service.js';

export type {
  TerminalInstanceInfo,
  TerminalConfig,
  TerminalEvent,
  ConsoleOutput,
} from './terminal-service.js';
