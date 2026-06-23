/**
 * AI Tool UI Metadata
 * 
 * UI-only metadata for tool display (icons, colors, descriptions).
 * The actual tool registry and execution lives in Rust: src-tauri/src/ai/tools.rs
 * 
 * This file is ONLY for frontend rendering purposes.
 */

import { invoke } from '@tauri-apps/api/core';
import type { McpToolInfo } from '../types/ai-types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  icon: string;
  color: string;
  category: 'file' | 'search' | 'execute' | 'info' | 'mcp';
}

// Dynamic MCP tools cache
let mcpToolsCache: Record<string, ToolDefinition> = {};
let mcpToolsLoaded = false;

/**
 * Registry of available AI tools
 */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  // File operations
  read_file: {
    name: 'read_file',
    description: 'Read file contents',
    icon: 'lucide:file',
    color: 'var(--ai-primary)',
    category: 'file',
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to file',
    icon: 'lucide:file-plus',
    color: 'var(--ai-success)',
    category: 'file',
  },
  edit_file: {
    name: 'edit_file',
    description: 'Edit file contents',
    icon: 'lucide:pencil',
    color: 'var(--ai-warning)',
    category: 'file',
  },
  
  // Search operations
  search_code: {
    name: 'search_code',
    description: 'Search for pattern in code',
    icon: 'lucide:search',
    color: 'var(--ai-accent)',
    category: 'search',
  },
  list_directory: {
    name: 'list_directory',
    description: 'List directory contents',
    icon: 'lucide:folder-open',
    color: 'var(--ai-primary)',
    category: 'search',
  },
  
  // Execution operations
  run_command: {
    name: 'run_command',
    description: 'Execute shell command',
    icon: 'lucide:terminal',
    color: 'var(--ai-warning)',
    category: 'execute',
  },
  
  // Git operations
  git_status: {
    name: 'git_status',
    description: 'Get git status',
    icon: 'lucide:git-branch',
    color: 'var(--ai-text-muted)',
    category: 'info',
  },
  // Network operations
  webfetch: {
    name: 'webfetch',
    description: 'Fetch content from a URL',
    icon: 'lucide:globe',
    color: 'var(--ai-accent)',
    category: 'info',
  },
};

/**
 * Get tool definition by name
 */
export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[toolName] || mcpToolsCache[toolName];
}

/**
 * Load MCP tools from backend and cache them
 */
export async function loadMcpTools(): Promise<void> {
  try {
    const tools = await invoke<McpToolInfo[]>('ai_mcp_list_tools');
    mcpToolsCache = {};
    for (const tool of tools) {
      mcpToolsCache[tool.namespaced_name] = {
        name: tool.namespaced_name,
        description: tool.description,
        icon: 'lucide:server',
        color: 'var(--ai-accent)',
        category: 'mcp',
      };
    }
    mcpToolsLoaded = true;
  } catch (e) {
    console.error('[ToolRegistry] Failed to load MCP tools:', e);
    mcpToolsCache = {};
    mcpToolsLoaded = true;
  }
}

/**
 * Check if MCP tools have been loaded
 */
export function areMcpToolsLoaded(): boolean {
  return mcpToolsLoaded;
}

/**
 * Get all MCP tool definitions
 */
export function getMcpTools(): Record<string, ToolDefinition> {
  return { ...mcpToolsCache };
}

/**
 * Get tool icon name by name
 */
export function getToolIcon(toolName: string): string {
  return TOOL_REGISTRY[toolName]?.icon || mcpToolsCache[toolName]?.icon || 'lucide:circle';
}

/**
 * Get tool color by name
 */
export function getToolColor(toolName: string): string {
  return TOOL_REGISTRY[toolName]?.color || mcpToolsCache[toolName]?.color || 'var(--ai-text-muted)';
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
  const builtin = Object.values(TOOL_REGISTRY).filter(tool => tool.category === category);
  const mcp = Object.values(mcpToolsCache).filter(tool => tool.category === category);
  return [...builtin, ...mcp];
}

/**
 * Get all tool names (including MCP tools)
 */
export function getAllToolNames(): string[] {
  return [...Object.keys(TOOL_REGISTRY), ...Object.keys(mcpToolsCache)];
}

/**
 * Check if a tool name is valid (including MCP tools)
 */
export function isValidTool(toolName: string): boolean {
  return toolName in TOOL_REGISTRY || toolName in mcpToolsCache;
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
 * Get a friendly one-line label for a tool call
 */
export function getToolLabel(toolName: string, args: string | undefined): string {
  if (!args) return toolName;
  
  try {
    const parsed = JSON.parse(args);
    
    switch (toolName) {
      case 'read_file':
        return `Reading file ${parsed.path || ''}`;
      case 'write_file':
        return `Writing file ${parsed.path || ''}`;
      case 'edit_file':
        return `Editing file ${parsed.path || ''}`;
      case 'run_command':
        return `Running command: ${parsed.command || parsed.cmd || ''}`;
      case 'search_code':
        return `Searching for "${parsed.pattern || parsed.query || ''}"`;
      case 'list_directory':
        return `Listing directory ${parsed.path || '.'}`;
      case 'git_status':
        return 'Checking git status';
      case 'webfetch':
        return `Fetching ${parsed.url || ''}`;
      default:
        // Handle MCP tools
        if (toolName.startsWith('mcp__')) {
          const parts = toolName.split('__');
          if (parts.length === 3) {
            return `MCP [${parts[1]}]: ${parts[2]}`;
          }
        }
        return toolName;
    }
  } catch {
    return toolName;
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
      case 'webfetch':
        return parsed.url || '';
      default:
        // Handle MCP tools
        if (toolName.startsWith('mcp__')) {
          const keys = Object.keys(parsed);
          if (keys.length === 0) return '';
          if (keys.length === 1) return `${keys[0]}: ${JSON.stringify(parsed[keys[0]]).slice(0, 30)}`;
          return keys.slice(0, 2).join(', ');
        }
        return Object.keys(parsed).slice(0, 2).join(', ');
    }
  } catch {
    return args.slice(0, 50);
  }
}
