/**
 * AI Message Parser
 * 
 * Parses LLM output into structured blocks for enhanced rendering.
 * Supports text, code, diffs, tool references, file paths, and errors.
 */

export interface MessageBlock {
  type: 'text' | 'code' | 'diff' | 'tool-badge' | 'file-ref' | 'command-output' | 'error';
  content: string;
  metadata?: {
    language?: string;
    toolName?: string;
    filePath?: string;
    lineCount?: number;
    startLine?: number;
    endLine?: number;
    isAdded?: boolean;
    isRemoved?: boolean;
  };
}

/**
 * Parse a message string into structured blocks
 */
export function parseMessage(content: string): MessageBlock[] {
  if (!content) return [];

  const blocks: MessageBlock[] = [];
  const lines = content.split('\n');
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Code block (```language ... ```)
    if (line.trimStart().startsWith('```')) {
      const langMatch = line.match(/^```(\w+)?/);
      const language = langMatch?.[1] || '';
      const codeLines: string[] = [];
      i++;
      
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      
      // Skip closing ```
      if (i < lines.length) i++;
      
      blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
        metadata: {
          language,
          lineCount: codeLines.length,
        },
      });
      continue;
    }
    
    // Diff block (+/- lines)
    if (line.startsWith('+') || line.startsWith('-') || line.startsWith('@@')) {
      const diffLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith('+') || lines[i].startsWith('-') || lines[i].startsWith('@@') || lines[i].trim() === '')) {
        diffLines.push(lines[i]);
        i++;
      }
      
      blocks.push({
        type: 'diff',
        content: diffLines.join('\n'),
        metadata: {
          lineCount: diffLines.length,
        },
      });
      continue;
    }
    
    // Tool reference: [tool_name] or ← tool_name
    const toolMatch = line.match(/^\[([a-z_]+)\]|^←\s*([a-z_]+)/i);
    if (toolMatch) {
      const toolName = toolMatch[1] || toolMatch[2];
      blocks.push({
        type: 'tool-badge',
        content: line,
        metadata: { toolName },
      });
      i++;
      continue;
    }
    
    // File path reference
    const fileMatch = line.match(/(?:^|\s)((?:\.{0,2}\/)?[\w\-\.\/]+\.(?:ts|tsx|js|jsx|rs|py|go|java|c|cpp|h|hpp|css|html|json|yaml|yml|toml|md|txt))(?:\s|$|[:,])/);
    if (fileMatch) {
      blocks.push({
        type: 'file-ref',
        content: line,
        metadata: { filePath: fileMatch[1] },
      });
      i++;
      continue;
    }
    
    // Error block
    if (line.toLowerCase().startsWith('error') || line.includes('Error:') || line.includes('panic:')) {
      const errorLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#')) {
        errorLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'error',
        content: errorLines.join('\n'),
      });
      continue;
    }
    
    // Regular text - collect consecutive text lines
    const textLines: string[] = [];
    while (i < lines.length && 
           !lines[i].trimStart().startsWith('```') && 
           !lines[i].startsWith('+') && 
           !lines[i].startsWith('-') &&
           !lines[i].startsWith('@@') &&
           !lines[i].match(/^\[([a-z_]+)\]/i) &&
           !lines[i].match(/^←\s*[a-z_]+/i)) {
      textLines.push(lines[i]);
      i++;
    }
    
    if (textLines.length > 0) {
      blocks.push({
        type: 'text',
        content: textLines.join('\n'),
      });
    }
  }
  
  return blocks;
}

/**
 * Extract file paths from content
 */
export function extractFilePaths(content: string): string[] {
  const paths: string[] = [];
  const regex = /(?:^|\s)((?:\.{0,2}\/)?[\w\-\.\/]+\.(?:ts|tsx|js|jsx|rs|py|go|java|c|cpp|h|hpp|css|html|json|yaml|yml|toml|md|txt))(?:\s|$|[:,])/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    paths.push(match[1]);
  }
  
  return [...new Set(paths)];
}

/**
 * Detect if content is a diff
 */
export function isDiff(content: string): boolean {
  const lines = content.split('\n');
  const diffLines = lines.filter(l => l.startsWith('+') || l.startsWith('-') || l.startsWith('@@'));
  return diffLines.length > lines.length * 0.3;
}

/**
 * Detect if content is a command output
 */
export function isCommandOutput(content: string): boolean {
  return content.startsWith('$') || content.startsWith('#') || content.includes('❯');
}
