/**
 * AI Tool UI Metadata
 * 
 * UI-only metadata for tool display (icons, colors, descriptions).
 * The actual tool registry and execution lives in Rust: src-tauri/src/ai/tools.rs
 * 
 * This file is ONLY for frontend rendering purposes.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  iconSvg: string;
  color: string;
  category: 'file' | 'search' | 'execute' | 'info';
}

/**
 * SVG icons for tools (professional, consistent with project icon system)
 */
const ICONS = {
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

/**
 * Registry of available AI tools
 */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  // File operations
  read_file: {
    name: 'read_file',
    description: 'Read file contents',
    iconSvg: ICONS.file,
    color: 'var(--ai-primary)',
    category: 'file',
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to file',
    iconSvg: ICONS.edit,
    color: 'var(--ai-success)',
    category: 'file',
  },
  edit_file: {
    name: 'edit_file',
    description: 'Edit file contents',
    iconSvg: ICONS.edit,
    color: 'var(--ai-warning)',
    category: 'file',
  },
  
  // Search operations
  search_code: {
    name: 'search_code',
    description: 'Search for pattern in code',
    iconSvg: ICONS.search,
    color: 'var(--ai-accent)',
    category: 'search',
  },
  list_directory: {
    name: 'list_directory',
    description: 'List directory contents',
    iconSvg: ICONS.folder,
    color: 'var(--ai-primary)',
    category: 'search',
  },
  
  // Execution operations
  run_command: {
    name: 'run_command',
    description: 'Execute shell command',
    iconSvg: ICONS.terminal,
    color: 'var(--ai-warning)',
    category: 'execute',
  },
  
  // Git operations
  git_status: {
    name: 'git_status',
    description: 'Get git status',
    iconSvg: ICONS.info,
    color: 'var(--ai-text-muted)',
    category: 'info',
  },
};

/**
 * Get tool definition by name
 */
export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[toolName];
}

/**
 * Get tool icon SVG by name
 */
export function getToolIcon(toolName: string): string {
  return TOOL_REGISTRY[toolName]?.iconSvg || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
}

/**
 * Get tool color by name
 */
export function getToolColor(toolName: string): string {
  return TOOL_REGISTRY[toolName]?.color || 'var(--ai-text-muted)';
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY).filter(tool => tool.category === category);
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return Object.keys(TOOL_REGISTRY);
}

/**
 * Check if a tool name is valid
 */
export function isValidTool(toolName: string): boolean {
  return toolName in TOOL_REGISTRY;
}

/**
 * Format tool arguments for display
 */
export function formatToolArgs(args: string | undefined): string {
  if (!args) return '';
  
  try {
    const parsed = JSON.parse(args);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return args;
  }
}

/**
 * Get a summary of tool arguments
 */
export function getToolArgsSummary(toolName: string, args: string | undefined): string {
  if (!args) return '';
  
  try {
    const parsed = JSON.parse(args);
    
    switch (toolName) {
      case 'read_file':
      case 'write_file':
      case 'edit_file':
        return parsed.path || parsed.file || '';
      case 'run_command':
        return parsed.command || parsed.cmd || '';
      case 'search_files':
      case 'grep':
        return parsed.pattern || parsed.query || '';
      case 'list_dir':
        return parsed.path || '.';
      default:
        return Object.keys(parsed).slice(0, 2).join(', ');
    }
  } catch {
    return args.slice(0, 50);
  }
}
